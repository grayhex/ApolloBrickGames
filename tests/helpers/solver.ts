import { EntryScript } from '../../src/app/entry';
import type { ContentPack, LevelDef } from '../../src/content/schema';
import {
  createContext,
  Game,
  makeFrame,
  NEUTRAL_FRAME,
  type GameState,
  type InputFrame,
} from '../../src/core';

/**
 * Решатель уровней: поиск пути героя по настоящему движку. Нужен, чтобы доказать, что уровень проходим
 * (а не «кажется проходимым»), и чтобы расстановка не могла сломать проход.
 *
 * Игра начинается как у игрока: нажат старт, отыгран сценарий входа (выход из ямы). Дальше на каждом такте
 * выбирается один из шести кадров: {ничего, влево, вправо} × {без прыжка, прыжок}. Чтобы решатель не бегал быстрее
 * удерживаемой кнопки (шаг раз в 3 такта), новое нажатие направления разрешено не чаще раза в `MIN_PRESS_GAP` тактов.
 * Поиск «жадный по x»: из очереди берётся состояние дальше всех продвинувшееся вправо; повторы отсекаются по ключу состояния.
 */

/** Не чаще раза в столько тактов можно заново нажать направление (период повтора шага при удержании — `move.repeatIntervalTicks`). */
const MIN_PRESS_GAP = 3;

export interface SolveOptions {
  /** Оставить врагов (патрульных) в игре: они считаются в ключе состояния, прикосновение смертельно. Стрельба решателем не используется. */
  enemies: boolean;
  /** Предел числа разобранных состояний. */
  maxNodes?: number;
  /** Что считать целью: прохождение уровня (по умолчанию) или выход из комнаты-колодца (`exit`). */
  goal?: 'level' | 'room';
}

export interface SolveResult {
  solved: boolean;
  /** Кадры игрока после сценария входа (если решено). */
  frames: InputFrame[];
  /** Сколько тактов от старта игры (вместе со сценарием входа) до финиша. */
  ticks: number;
  expanded: number;
  /** Самый правый столбец, до которого дошёл поиск (для диагностики провала). */
  bestX: number;
}

/** Шесть кадров выбора: направление × прыжок. */
const CHOICES: readonly InputFrame[] = [
  NEUTRAL_FRAME,
  makeFrame({ held: ['right'] }),
  makeFrame({ held: ['left'] }),
  makeFrame({ pressed: ['jump'] }),
  makeFrame({ held: ['right'], pressed: ['jump'] }),
  makeFrame({ held: ['left'], pressed: ['jump'] }),
];

/**
 * В ключе состояния — только враги не дальше стольких столбцов от героя: состояние далёких зависит от всей истории пути (преследователи тянутся
 * к герою с любого расстояния), и поиск не склеивал бы пути, различающиеся лишь тем, что делается вдали от героя. Найденное решение
 * в любом случае проверяется воспроизведением с чистого старта, так что такое склеивание может лишь пропустить решение, но не выдать ложное.
 */
const NEAR_ENEMY = 14;

/** Направление каждого кадра выбора: −1 влево, 0 нет, 1 вправо. */
const DIRECTIONS: readonly number[] = [0, 1, -1, 0, 1, -1];

interface Node {
  state: GameState;
  parent: Node | null;
  choice: number;
  depth: number;
  /** Тактов с последнего нового нажатия направления (не больше `MIN_PRESS_GAP`). */
  fresh: number;
}

const cloneState = (s: GameState): GameState => ({
  ...s,
  hero: { ...s.hero },
  projectiles: s.projectiles.map((p) => ({ ...p })),
  objects: s.objects.map((o) => ({ ...o })),
});

/** Ключ состояния: всё, что влияет на будущее героя. Счётчик удержания направления сжат до периода повтора шага. */
function keyOf(s: GameState, fresh: number, enemies: boolean): string {
  const h = s.hero;
  const hold = h.moveHold < 3 ? h.moveHold : 3 + ((h.moveHold - 3) % 3);
  let key = `${h.x},${h.y},${h.facing},${h.moveDir},${hold},${h.jumpIndex},${h.jumpTimer},${h.fallTimer},${fresh}`;
  for (const o of s.objects) {
    // Хрупкие и сменные объекты (крышка ямы, враги) меняются; сердца и опасные области на ход героя не влияют.
    if (o.id === 'lid') key += o.active ? 'L' : 'l';
    else if (enemies && /^(?:[eb]\d|boss)/.test(o.id) && Math.abs(o.x - h.x) <= NEAR_ENEMY) key += `|${o.id}:${o.x},${o.y},${o.dir},${o.timer}${o.active ? '' : 'x'}`;
  }
  return key;
}

/** Копия пакета, в которой игра начинается с `levelId`, а при `enemies: false` врагов нет. */
function contextFor(pack: ContentPack, levelId: string, enemies: boolean) {
  const levels: LevelDef[] = pack.levels.map((level) =>
    enemies ? level : { ...level, objects: level.objects.filter((o) => o.type !== 'patroller') },
  );
  return createContext({ manifest: { ...pack.manifest, firstLevel: levelId }, rules: pack.rules, levels });
}

/** Игра, дошедшая до момента, когда герой получает управление: старт нажат, сценарий входа отыгран. */
export function enteredGame(pack: ContentPack, levelId: string, enemies: boolean): { game: Game; ticks: number } {
  const game = new Game(contextFor(pack, levelId, enemies));
  const entry = new EntryScript(pack.animations?.entry);
  entry.arm(levelId);
  game.step(makeFrame({ pressed: ['start'] }));
  let ticks = 1;
  do {
    game.step(entry.next(game.state.levelId, game.state.phase) ?? NEUTRAL_FRAME);
    ticks += 1;
  } while (entry.active && ticks < 1000);
  return { game, ticks };
}

/** Событие — достижение цели: финиш уровня `levelId` или выход из комнаты. */
function reached(event: { type: string; levelId?: string }, goal: 'level' | 'room', levelId: string): boolean {
  return goal === 'room' ? event.type === 'roomLeft' : event.type === 'levelCompleted' && event.levelId === levelId;
}

export function solveLevel(pack: ContentPack, levelId: string, options: SolveOptions): SolveResult {
  const { enemies, maxNodes = 600_000, goal = 'level' } = options;
  const { game, ticks: entryTicks } = enteredGame(pack, levelId, enemies);
  const width = pack.levels.find((l) => l.id === levelId)?.width ?? 0;

  const buckets: Node[][] = Array.from({ length: width + 1 }, () => []);
  const heads: number[] = Array.from({ length: width + 1 }, () => 0);
  const seen = new Set<string>();
  const root: Node = { state: cloneState(game.state), parent: null, choice: -1, depth: 0, fresh: MIN_PRESS_GAP };
  seen.add(keyOf(root.state, root.fresh, enemies));
  buckets[root.state.hero.x]?.push(root);
  let top = root.state.hero.x;
  let expanded = 0;
  let bestX = top;

  while (expanded < maxNodes) {
    while (top >= 0 && (heads[top] ?? 0) >= (buckets[top]?.length ?? 0)) top -= 1;
    if (top < 0) break;
    const bucket = buckets[top] as Node[];
    const node = bucket[heads[top] as number] as Node;
    heads[top] = (heads[top] as number) + 1;
    expanded += 1;

    for (let c = 0; c < CHOICES.length; c++) {
      const dir = DIRECTIONS[c] as number;
      const press = dir !== 0 && dir !== node.state.hero.moveDir; // новое нажатие направления
      if (press && node.fresh < MIN_PRESS_GAP) continue;
      game.state = cloneState(node.state);
      const events = game.step(CHOICES[c] as InputFrame);
      const fresh = press ? 0 : Math.min(MIN_PRESS_GAP, node.fresh + 1);
      const next: Node = { state: game.state, parent: node, choice: c, depth: node.depth + 1, fresh };
      if (events.some((e) => reached(e, goal, levelId))) {
        const frames: InputFrame[] = [];
        for (let n: Node | null = next; n && n.parent; n = n.parent) frames.push(CHOICES[n.choice] as InputFrame);
        frames.reverse();
        return { solved: true, frames, ticks: entryTicks + frames.length, expanded, bestX: width };
      }
      if (game.state.phase !== 'playing') continue; // гибель (яма, враг, опасная область) — ветка закрыта
      if (game.state.levelId !== levelId) continue; // герой упал в колодец: это не прохождение уровня, ветка закрыта
      const key = keyOf(game.state, fresh, enemies);
      if (seen.has(key)) continue;
      seen.add(key);
      const x = game.state.hero.x;
      if (x > bestX) bestX = x;
      (buckets[x] as Node[]).push(next);
      if (x > top) top = x;
    }
  }
  return { solved: false, frames: [], ticks: 0, expanded, bestX };
}

/** Проигрывает найденное решение заново с чистого старта и сообщает, дошёл ли герой до финиша. */
export function replaySolution(
  pack: ContentPack,
  levelId: string,
  enemies: boolean,
  frames: readonly InputFrame[],
  goal: 'level' | 'room' = 'level',
): boolean {
  const { game } = enteredGame(pack, levelId, enemies);
  for (const frame of frames) {
    const events = game.step(frame);
    if (events.some((e) => reached(e, goal, levelId))) return true;
    if (game.state.phase !== 'playing') return false;
    if (game.state.levelId !== levelId) return false; // решение не должно проходить через колодец
  }
  return false;
}
