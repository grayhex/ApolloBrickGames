/**
 * Сценарные тесты правил стрелялок Brick Game (класс ShooterGame): honeybee, space-invaders, ufo-raiders, dual-shooting, talking-shooting, tetris-shooting, meteor-fighter.
 *
 * Общие контрактные тесты и fuzz доказывают только устойчивость, но не играбельность. Здесь игра проходится через публичный API
 * (`start`, `step(makeBrickInput(...))`, `cells`, `score`, `lives`, `level`, `phase`, события) до конкретного исхода:
 *  — «прогресс»: клетки сбиты, босс побеждён, уровень пройден, очки начислены по правилу;
 *  — «неудача»: пушку поразил выстрел или строй дошёл до низа — потеряна жизнь; на последней жизни партия заканчивается.
 * Исходное положение можно готовить присваиванием полям (так сделано в library.test.ts и review.test.ts), но исход получается только настоящими тактами.
 * Ожидаемые числа выписаны по правилам (справка `guides/library.ts`, `docs/brick/library.md`) и нарисованы вручную, а не взяты из констант реализации.
 *
 * Условные обозначения: поле 10 × 20, строка 0 — верх; пушка: нос в (x, 17), основание (x−1…x+1, 18), x = 0…8; пуля игрока стартует в (x, 17);
 * вражеский выстрел поражает пушку в строках 18–19 в трёх столбцах x−1…x+1.
 * Темп при скорости 1: строй делает шаг раз в 45 тактов, первый ответный выстрел — на 90-м такте, пуля проходит строку за 4 такта,
 * пауза между выстрелами игрока — 10 тактов, сцена потери жизни или победы — 60 тактов.
 */
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../../../src/brick/games/library/action';
import { LIBRARY_GAMES } from '../../../src/brick/games/library';
import { NEUTRAL_BRICK_INPUT, makeBrickInput, type BrickAction, type BrickEvent, type BrickGame, type BrickInput } from '../../../src/brick';

/** Игры, для которых в этом файле есть и сценарий «прогресс», и сценарий «неудача» (проверяется в последнем тесте файла). */
export const SCENARIO_GAMES = ['honeybee', 'space-invaders', 'ufo-raiders', 'dual-shooting', 'talking-shooting', 'tetris-shooting', 'meteor-fighter'] as const;

type ShooterId = ShooterGame['id'];
const covered: Record<'прогресс' | 'неудача', Set<string>> = { прогресс: new Set(), неудача: new Set() };
const scenario = (kind: 'прогресс' | 'неудача') => (id: ShooterId, title: string, body: () => void): void => {
  covered[kind].add(id);
  it(`${kind}: ${title}`, body);
};
const progress = scenario('прогресс');
const failure = scenario('неудача');

// ── помощники ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Награда за пройденный уровень — общая для игр библиотеки (Maze, Lights Out, Sokoban…): +100. */
const LEVEL_BONUS = 100;
/** Столько тактов длится сцена после потери жизни или победы, прежде чем поле начнётся заново. */
const SCENE = 60;
/** Шаг строя при скорости 1 и такт первого ответного выстрела. */
const FORMATION_STEP = 45;
const FIRST_ENEMY_SHOT = 90;

/** ROTATE зажат без нового нажатия: пушка стреляет, как только остыла. */
const HOLD = makeBrickInput([], ['rotate']);
const IDLE = NEUTRAL_BRICK_INPUT;

const start = (id: ShooterId, seed?: number): ShooterGame => {
  const game = new ShooterGame(id, seed === undefined ? {} : { seed });
  game.start();
  return game;
};
const run = (game: BrickGame, ticks: number, input: BrickInput = IDLE): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(input));
  return events;
};
/** Нажатие и отпускание кнопки: два такта, автоповтор не срабатывает. */
const tap = (game: BrickGame, action: BrickAction): BrickEvent[] => [...game.step(makeBrickInput([action])), ...game.step(IDLE)];
const count = (events: readonly BrickEvent[], type: BrickEvent['type']): number => events.filter((event) => event.type === type).length;
const has = (events: readonly BrickEvent[], type: BrickEvent['type']): boolean => count(events, type) > 0;
/** Такты с одним вводом, пока не выполнится условие над накопленными событиями (но не дольше `limit`). */
function runUntil(game: BrickGame, input: BrickInput, done: (events: readonly BrickEvent[]) => boolean, limit = 400): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < limit && !done(events); i++) events.push(...game.step(input));
  return events;
}

/** Фрагмент поля рисунком: «.» погашено, «#» горит, «*» мигает. */
function picture(game: BrickGame, x0: number, x1: number, y0: number, y1: number): string[] {
  const cells = game.cells();
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let line = '';
    for (let x = x0; x <= x1; x++) line += '.#*'[cells[y * 10 + x] ?? 0] ?? '?';
    rows.push(line);
  }
  return rows;
}
const cell = (game: BrickGame, x: number, y: number): number => game.cells()[y * 10 + x] ?? 0;
/** Сколько клеток горит или мигает в строках y0…y1. */
const lit = (game: BrickGame, y0: number, y1: number): number => Array.from(game.cells().slice(y0 * 10, (y1 + 1) * 10)).filter(Boolean).length;
/** Сколько жизней показано в превью (каждая — пара клеток). */
const previewLives = (game: BrickGame): number => {
  const preview = game.preview();
  if (!preview) return 0;
  let n = 0;
  for (let row = 0; row < 4; row++) if (preview[row * 4 + 1] && preview[row * 4 + 2]) n++;
  return n;
};
const enemyShots = (game: ShooterGame): ShooterGame['bullets'] => game.bullets.filter((b) => b.enemy);
/** Габариты строя: левый и правый столбцы, верхняя и нижняя строки. */
const box = (game: ShooterGame): string => {
  const xs = game.targets.map((p) => p.x), ys = game.targets.map((p) => p.y);
  return `x${Math.min(...xs)}–${Math.max(...xs)} y${Math.min(...ys)}–${Math.max(...ys)}`;
};
/** Форма строя, не зависящая от сдвига: клетки относительно левого верхнего угла. */
const shape = (game: ShooterGame): string => {
  const minX = Math.min(...game.targets.map((p) => p.x)), minY = Math.min(...game.targets.map((p) => p.y));
  return game.targets.map((p) => `${p.x - minX},${p.y - minY}`).sort().join(' ');
};
/** Пушка идёт к столбцу настоящими нажатиями (по одному шагу за нажатие). */
function walkTo(game: ShooterGame, column: number): void {
  for (let i = 0; i < 12 && game.x !== column; i++) tap(game, game.x < column ? 'right' : 'left');
}
/** Ждёт без ввода, пока строй не сделает первый ответный выстрел, и возвращает копию этой пули. */
function awaitEnemyShot(game: ShooterGame, limit = 200): { x: number; y: number } {
  for (let i = 0; i < limit; i++) {
    game.step(IDLE);
    const shot = enemyShots(game)[0];
    if (shot) return { x: shot.x, y: shot.y };
  }
  throw new Error('ответного выстрела не было');
}
/** Вражеский выстрел падает на пушку (или рядом, со смещением dx) с верха её зоны; такты идут, пока выстрел не исчезнет или не отнимет жизнь. */
function strike(game: ShooterGame, dx = 0): BrickEvent[] {
  game.bullets.push({ x: game.x + dx, y: 17, enemy: true });
  const events: BrickEvent[] = [];
  for (let i = 0; i < 16; i++) {
    const tick = game.step(IDLE);
    events.push(...tick);
    if (has(tick, 'lifeLost') || enemyShots(game).length === 0) break;
  }
  return events;
}

/**
 * Автопилот: уходит с линии вражеских выстрелов (зона попадания — три столбца), иначе встаёт под ближайший столбец, где есть куда стрелять, и держит ROTATE.
 * Кнопку направления нажимает не чаще раза в три такта — это под силу человеку.
 */
function pilot(game: ShooterGame, aim: (column: number) => boolean): BrickInput {
  const unsafe = (column: number): boolean => game.bullets.some((b) => b.enemy && Math.abs(b.x - column) <= 1);
  const columns = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((column) => !unsafe(column) && (unsafe(game.x) || aim(column)));
  let goal = game.x;
  if (columns.length && !columns.includes(game.x)) goal = columns.reduce((best, column) => (Math.abs(column - game.x) < Math.abs(best - game.x) ? column : best));
  const direction = Math.sign(goal - game.x);
  const free = direction !== 0 && game.tick % 6 === 0 && (unsafe(game.x) || !unsafe(game.x + direction));
  return makeBrickInput(free ? [direction < 0 ? 'left' : 'right'] : [], ['rotate']);
}
/** Играет автопилотом, пока не случится событие `stop` (но не дольше `limit` тактов). */
function fly(game: ShooterGame, aim: (column: number) => boolean, stop: BrickEvent['type'], limit = 800): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < limit && !has(events, stop) && game.phase === 'playing'; i++) events.push(...game.step(pilot(game, aim)));
  return events;
}

// ── Honeybee ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('honeybee: сценарии', () => {
  // Фигура наверху нарисована вручную: поле столбцов 2–7 и строк 2–5, в котором нет клеток «по диагонали через две» — всего 16 клеток.
  const FIGURE = ['##.##.', '#.##.#', '.##.##', '##.##.'];
  const figure = (game: BrickGame): string[] => picture(game, 2, 7, 2, 5);

  progress('honeybee', 'выстрел сносит нижнюю клетку столбца, каждое попадание +5; ROTATE и FIRE стреляют одинаково', () => {
    const g = start('honeybee');
    expect(figure(g)).toEqual(FIGURE);
    expect(g.targets).toHaveLength(16);
    expect(lit(g, 0, 16)).toBe(16);
    g.x = 2;
    // В столбце 2 фигура занимает строки 2, 3 и 5: пули снимают клетки снизу вверх — 5, 3, 2.
    const scores: number[] = [];
    for (let t = 0; t < 150 && scores.length < 3; t++) if (has(g.step(t < 21 ? HOLD : IDLE), 'hit')) scores.push(g.score);
    expect(scores).toEqual([5, 10, 15]);
    expect(g.targets).toHaveLength(13);
    expect(figure(g)).toEqual(['.#.##.', '..##.#', '.##.##', '.#.##.']);
    expect(g.lives).toBe(4);
    expect(g.level).toBe(1);
    for (const action of ['rotate', 'fire'] as const) {
      const h = start('honeybee');
      expect(has(h.step(makeBrickInput([action])), 'shot'), action).toBe(true);
      expect(h.bullets.map((b) => b.x)).toEqual([4]);
    }
  });

  progress('honeybee', 'вся фигура сбита с уклонением от ответных выстрелов: 16 клеток по +5, затем +100 и следующий уровень (при любом зерне)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = start('honeybee', seed);
      // Есть смысл стрелять в столбец, пока в нём целей больше, чем уже летящих пуль игрока.
      const events = fly(g, (column) => g.targets.filter((p) => p.x === column).length > g.bullets.filter((b) => !b.enemy && b.x === column).length, 'win');
      expect(count(events, 'hit'), `зерно ${seed}`).toBe(16);
      expect(g.targets, `зерно ${seed}`).toHaveLength(0);
      expect(g.score, `зерно ${seed}`).toBe(16 * 5 + LEVEL_BONUS);
      expect(g.lives, `зерно ${seed}`).toBe(4);
      expect(g.level, `зерно ${seed}`).toBe(1);
      run(g, SCENE);
      expect(g.level, `зерно ${seed}`).toBe(2);
      expect(g.phase).toBe('playing');
      expect(g.score).toBe(180);
      expect(g.lives).toBe(4);
      expect(figure(g)).toEqual(FIGURE);
    }
  });

  failure('honeybee', 'ответный выстрел из клетки фигуры, дошедший до пушки, отнимает жизнь; шаг в сторону спасает', () => {
    const fired = start('honeybee');
    const shot = awaitEnemyShot(fired);
    // Фигура стреляет своими клетками: выстрел появляется строкой ниже клетки фигуры.
    expect(FIGURE[shot.y - 1 - 2]?.[shot.x - 2]).toBe('#');
    expect(fired.tick).toBe(FIRST_ENEMY_SHOT);

    const hit = start('honeybee');
    awaitEnemyShot(hit);
    walkTo(hit, shot.x); // встать точно под выстрел
    const events = runUntil(hit, IDLE, (e) => has(e, 'lifeLost'), 160);
    expect(has(events, 'lifeLost')).toBe(true);
    expect(has(events, 'gameOver')).toBe(false);
    expect(hit.lives).toBe(3);
    expect(previewLives(hit)).toBe(3);
    expect(hit.score).toBe(0);
    expect(hit.phase).toBe('playing');
    run(hit, SCENE);
    expect(hit.phase).toBe('playing');
    expect(hit.lives).toBe(3);
    expect(figure(hit)).toEqual(FIGURE); // повтор поля: фигура на месте
    expect(hit.x).toBe(4);
    expect(enemyShots(hit)).toHaveLength(0);

    const dodge = start('honeybee');
    awaitEnemyShot(dodge);
    walkTo(dodge, shot.x >= 4 ? shot.x - 2 : shot.x + 2); // на два столбца в сторону — вне зоны попадания
    const after = runUntil(dodge, IDLE, () => enemyShots(dodge).length === 0, 160);
    expect(enemyShots(dodge)).toHaveLength(0);
    expect(has(after, 'lifeLost')).toBe(false);
    expect(dodge.lives).toBe(4);
  });

  failure('honeybee', 'последняя жизнь: попадание заканчивает партию, анимация конца, новая партия с нуля, рекорд сохранён', () => {
    const g = start('honeybee');
    g.lives = 1;
    g.x = 2;
    runUntil(g, HOLD, (e) => has(e, 'hit'), 150); // одна клетка сбита: есть что сохранять в рекорде
    expect(g.score).toBe(5);
    const events = strike(g);
    expect(has(events, 'lifeLost')).toBe(true);
    expect(has(events, 'gameOver')).toBe(true);
    expect(g.lives).toBe(0);
    expect(g.phase).toBe('playing'); // идёт анимация конца игры
    const earned = g.score;
    runUntil(g, IDLE, () => g.phase === 'over', 200);
    expect(g.phase).toBe('over');
    expect(g.overFill).toBe(20);
    expect(g.hiScore).toBe(earned);
    expect(g.step(makeBrickInput(['rotate']))).toEqual([]); // после конца ввод ничего не делает
    g.start();
    expect(g.phase).toBe('playing');
    expect(g.lives).toBe(4);
    expect(g.score).toBe(0);
    expect(g.hiScore).toBe(earned);
    expect(g.targets).toHaveLength(16);
  });
});

// ── Space Invaders ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('space-invaders: сценарии', () => {
  progress('space-invaders', 'строй идёт вбок до края, на краю опускается на ряд и идёт обратно, не меняя форму', () => {
    const g = start('space-invaders');
    g.x = 0; // в стороне от падающих выстрелов
    const initial = shape(g);
    expect(g.targets).toHaveLength(24);
    const boxes = new Map<number, string>();
    for (let t = 1; t <= 4 * FORMATION_STEP; t++) {
      g.step(IDLE);
      if (t % FORMATION_STEP === FORMATION_STEP - 1 || t % FORMATION_STEP === 0) boxes.set(t, box(g));
      expect(new Set(g.targets.map((p) => `${p.x},${p.y}`)).size, `такт ${t}`).toBe(24);
      expect(shape(g), `такт ${t}`).toBe(initial);
    }
    // Строй стоял в столбцах 2–7 и строках 2–5: два шага вправо до края (столбец 9), шаг вниз на краю, затем обратно влево.
    expect([44, 45, 89, 90, 134, 135, 179, 180].map((t) => boxes.get(t))).toEqual([
      'x2–7 y2–5', 'x3–8 y2–5', 'x3–8 y2–5', 'x4–9 y2–5', 'x4–9 y2–5', 'x4–9 y3–6', 'x4–9 y3–6', 'x3–8 y3–6',
    ]);
    expect(g.lives).toBe(4);
  });

  progress('space-invaders', 'после последней клетки строя появляется босс: уровень не пройден, пока он не побеждён; победа +100 и следующий уровень', () => {
    const g = start('space-invaders');
    g.targets = [{ x: 4, y: 10 }]; // последняя клетка строя
    expect(lit(g, 0, 0)).toBe(0); // шкалы босса ещё нет
    const first = runUntil(g, HOLD, (e) => has(e, 'hit'), 100);
    expect(count(first, 'hit')).toBe(1);
    expect(has(first, 'win')).toBe(false);
    expect(g.score).toBe(5);
    expect(g.level).toBe(1);
    // Босс: рубка из трёх клеток и клетка под ней — и шкала здоровья в верхней строке.
    expect(picture(g, 3, 5, 2, 3)).toEqual(['###', '.#.']);
    const hp = g.bossHP;
    expect(hp).toBeGreaterThan(1); // босс выдерживает несколько попаданий
    expect(lit(g, 0, 0)).toBe(Math.min(10, hp));
    expect(g.targets).toHaveLength(4);

    // Босс сбит настоящими выстрелами: каждое попадание в любую его клетку отнимает единицу здоровья и даёт +5.
    const centre = (): number => Math.round(g.targets.reduce((sum, p) => sum + p.x, 0) / g.targets.length);
    const events = fly(g, (column) => column === centre(), 'win', 1200);
    expect(count(events, 'hit')).toBe(hp);
    expect(g.targets).toHaveLength(0);
    expect(g.bossHP).toBe(0);
    expect(g.score).toBe(5 + hp * 5 + LEVEL_BONUS);
    expect(g.lives).toBe(4);
    run(g, SCENE);
    expect(g.level).toBe(2);
    expect(g.targets).toHaveLength(24); // новый уровень начинается со строя, а не с босса
    expect(lit(g, 0, 0)).toBe(0);
  });

  progress('space-invaders', 'босс побеждается автопилотом с уклонением при разных зёрнах: жизни целы, уровень пройден', () => {
    for (const seed of [2, 3, 4, 5]) {
      const g = start('space-invaders', seed);
      g.targets = [{ x: 4, y: 10 }];
      runUntil(g, HOLD, (e) => has(e, 'hit'), 100);
      const hp = g.bossHP;
      const centre = (): number => Math.round(g.targets.reduce((sum, p) => sum + p.x, 0) / g.targets.length);
      const events = fly(g, (column) => column === centre(), 'win', 1200);
      expect(count(events, 'hit'), `зерно ${seed}`).toBe(hp);
      expect(g.score, `зерно ${seed}`).toBe(5 + hp * 5 + LEVEL_BONUS);
      expect(g.lives, `зерно ${seed}`).toBe(4);
    }
  });

  failure('space-invaders', 'строй дошёл до нижнего ряда: строка 17 ещё жива, шаг в строку 18 отнимает жизнь', () => {
    const g = start('space-invaders');
    // Ряд во всю ширину упирается в оба края на каждом шаге: каждый шаг — спуск на ряд.
    g.targets = Array.from({ length: 10 }, (_, x) => ({ x, y: 16 }));
    g.x = 0;
    run(g, FORMATION_STEP - 1);
    expect(box(g)).toBe('x0–9 y16–16');
    expect(g.lives).toBe(4);
    run(g, 1);
    expect(box(g)).toBe('x0–9 y17–17'); // строка 17 — ещё не потеря
    expect(g.lives).toBe(4);
    expect(g.phase).toBe('playing');
    run(g, FIRST_ENEMY_SHOT - FORMATION_STEP - 1);
    expect(g.lives).toBe(4);
    const events = g.step(IDLE); // второй шаг: строка 18
    expect(has(events, 'lifeLost')).toBe(true);
    expect(box(g)).toBe('x0–9 y18–18');
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    run(g, SCENE);
    expect(g.targets).toHaveLength(24); // повтор поля: строй вернулся наверх
    expect(box(g)).toBe('x2–7 y2–5');
    expect(g.lives).toBe(3);
    expect(g.x).toBe(4);
  });

  failure('space-invaders', 'ответный выстрел, попавший в пушку, отнимает жизнь; на последней жизни партия заканчивается', () => {
    const aside = start('space-invaders');
    aside.x = 4;
    expect(has(strike(aside, 2), 'lifeLost')).toBe(false); // выстрел в двух столбцах от пушки пролетает мимо
    expect(aside.lives).toBe(4);

    const g = start('space-invaders');
    g.x = 4;
    expect(has(strike(g, 1), 'lifeLost')).toBe(true); // основание пушки шириной три клетки: x−1…x+1
    expect(g.lives).toBe(3);
    run(g, SCENE);
    g.lives = 1;
    const events = strike(g);
    expect(has(events, 'lifeLost') && has(events, 'gameOver')).toBe(true);
    expect(g.lives).toBe(0);
    runUntil(g, IDLE, () => g.phase === 'over', 200);
    expect(g.phase).toBe('over');
  });
});

// ── UFO Raiders ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('ufo-raiders: сценарии', () => {
  progress('ufo-raiders', 'остались только защищённый НЛО и ничего больше — победа без выстрела по НЛО: +5 за клетку, +100, следующий уровень', () => {
    const g = start('ufo-raiders');
    // Фигура 6 × 4; мигающий НЛО — левая верхняя клетка.
    const FIGURE = ['*#####', '######', '######', '######'];
    expect(picture(g, 2, 7, 2, 5)).toEqual(FIGURE);
    const ufo = g.targets[0]!;
    expect(ufo).toEqual({ x: 2, y: 2 });
    g.targets = [ufo, { x: 5, y: 12 }, { x: 5, y: 13 }, { x: 5, y: 14 }]; // три обычные клетки в столбце 5
    g.x = 5;
    const events = runUntil(g, HOLD, (e) => has(e, 'win'), 120);
    expect(count(events, 'hit')).toBe(3);
    expect(g.targets).toEqual([{ x: 2, y: 2 }]); // НЛО цел
    expect(g.score).toBe(3 * 5 + LEVEL_BONUS);
    expect(g.lives).toBe(4);
    expect(g.level).toBe(1);
    run(g, SCENE);
    expect(g.level).toBe(2);
    expect(picture(g, 2, 7, 2, 5)).toEqual(FIGURE); // новый уровень: фигура целиком, НЛО снова мигает
    expect(g.lives).toBe(4);
  });

  progress('ufo-raiders', 'пуля, летящая вслед за последним ударом, НЛО не задевает: победа наступает раньше', () => {
    const g = start('ufo-raiders');
    const ufo = g.targets[0]!;
    ufo.x = 5;
    ufo.y = 2; // НЛО прямо над единственной обычной клеткой
    g.targets = [ufo, { x: 5, y: 12 }];
    g.x = 5;
    const events = run(g, 24, HOLD); // стрельба идёт без перерыва: вторая пуля вылетает до попадания первой
    expect(count(events, 'shot')).toBe(2);
    expect(has(events, 'win')).toBe(true);
    expect(has(events, 'lifeLost')).toBe(false);
    run(g, SCENE, HOLD);
    expect(g.lives).toBe(4);
    expect(g.level).toBe(2);
    expect(g.score).toBe(5 + LEVEL_BONUS);
  });

  failure('ufo-raiders', 'выстрел в НЛО при остающихся обычных клетках отнимает жизнь и не даёт очков', () => {
    const g = start('ufo-raiders');
    const ufo = g.targets[0]!;
    ufo.x = 5;
    ufo.y = 12;
    g.targets = [ufo, { x: 5, y: 13 }, { x: 8, y: 2 }]; // НЛО прикрыт одной клеткой; ещё одна клетка в стороне
    g.x = 5;
    const events = runUntil(g, HOLD, (e) => has(e, 'lifeLost'), 120);
    expect(count(events, 'hit')).toBe(1); // первая пуля сбила прикрывающую клетку
    expect(g.score).toBe(5); // по НЛО очков нет
    expect(has(events, 'win')).toBe(false);
    expect(g.lives).toBe(3);
    expect(previewLives(g)).toBe(3);
    run(g, SCENE);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(5);
    expect(picture(g, 2, 7, 2, 5)).toEqual(['*#####', '######', '######', '######']); // повтор поля
    expect(g.x).toBe(4);
  });
});

// ── Dual Shooting ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('dual-shooting: сценарии', () => {
  /** Шкала здоровья игрока: мигающие клетки нижней строки. */
  const playerBar = (g: BrickGame): number => lit(g, 19, 19);
  /** Шкала здоровья босса: горящие клетки верхней строки. */
  const bossBar = (g: BrickGame): number => lit(g, 0, 0);

  progress('dual-shooting', 'два ствола бьют по двум столбцам разом; здоровье босса падает с каждым попаданием, победа +100', () => {
    const g = start('dual-shooting');
    const hp = g.bossHP;
    expect(hp).toBeGreaterThan(2);
    expect(playerBar(g)).toBe(3);
    g.step(makeBrickInput(['rotate']));
    expect(g.bullets.filter((b) => !b.enemy).map((b) => b.x).sort()).toEqual([4, 5]); // стволы рядом: x и x+1
    let events = runUntil(g, IDLE, (e) => has(e, 'hit'), 100);
    expect(count(events, 'hit')).toBe(2); // оба ствола попали в тот же такт
    expect(g.score).toBe(10);
    expect(g.bossHP).toBe(hp - 2);
    expect(g.lives).toBe(4);

    // Остальное — зажатым огнём; шкала босса следует за здоровьем, пока оно не больше десяти.
    events = runUntil(g, HOLD, (e) => has(e, 'win'), 400);
    expect(count(events, 'hit')).toBe(hp - 2);
    expect(g.bossHP).toBe(0);
    expect(g.score).toBe(hp * 5 + LEVEL_BONUS);
    expect(g.lives).toBe(4);
    run(g, SCENE);
    expect(g.level).toBe(2);
    expect(g.targets).toHaveLength(24);
    expect(g.bossHP).toBeGreaterThan(0);
    expect(playerBar(g)).toBe(3);
  });

  progress('dual-shooting', 'шкала босса уменьшается вместе со здоровьем, когда оно не больше десяти: каждый залп двумя стволами — две клетки', () => {
    const g = start('dual-shooting');
    g.bossHP = 10;
    g.x = 4;
    expect(bossBar(g)).toBe(10);
    const volleys: { hp: number; bar: number; score: number }[] = [];
    for (let t = 0; t < 200 && volleys.length < 4; t++) {
      if (has(g.step(t < 31 ? HOLD : IDLE), 'hit')) volleys.push({ hp: g.bossHP, bar: bossBar(g), score: g.score });
    }
    expect(volleys).toEqual([{ hp: 8, bar: 8, score: 10 }, { hp: 6, bar: 6, score: 20 }, { hp: 4, bar: 4, score: 30 }, { hp: 2, bar: 2, score: 40 }]);
  });

  failure('dual-shooting', 'три попадания по игроку отнимают жизнь; первые два уменьшают только здоровье, поле после потери начинается заново', () => {
    const g = start('dual-shooting');
    const hp = g.bossHP;
    run(g, 11, HOLD); // два залпа
    run(g, 50); // долетели: четыре попадания
    expect(g.bossHP).toBe(hp - 4);
    const damaged = g.score;
    expect(damaged).toBe(20);

    expect(has(strike(g), 'lifeLost')).toBe(false);
    expect(g.lives).toBe(4);
    expect(playerBar(g)).toBe(2);
    expect(has(strike(g), 'lifeLost')).toBe(false);
    expect(g.lives).toBe(4);
    expect(playerBar(g)).toBe(1);
    expect(has(strike(g), 'lifeLost')).toBe(true); // третье попадание
    expect(g.lives).toBe(3);
    expect(previewLives(g)).toBe(3);
    run(g, SCENE);
    expect(g.score).toBe(damaged); // очки остались
    expect(g.lives).toBe(3);
    expect(playerBar(g)).toBe(3); // здоровье игрока и босса восстановлены
    expect(g.bossHP).toBe(hp);
    expect(bossBar(g)).toBe(Math.min(10, hp));
    expect(g.targets).toHaveLength(24);
  });

  failure('dual-shooting', 'на последней жизни третье попадание заканчивает партию', () => {
    const g = start('dual-shooting');
    g.lives = 1;
    strike(g);
    strike(g);
    expect(g.lives).toBe(1);
    expect(g.phase).toBe('playing');
    const events = strike(g);
    expect(has(events, 'lifeLost')).toBe(true);
    expect(has(events, 'gameOver')).toBe(true);
    expect(g.lives).toBe(0);
    runUntil(g, IDLE, () => g.phase === 'over', 200);
    expect(g.phase).toBe('over');
  });
});

// ── Talking Shooting ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('talking-shooting: сценарии', () => {
  progress('talking-shooting', 'строй у нижней границы уничтожается снизу вверх: +5 за клетку, +100 и следующий уровень', () => {
    const g = start('talking-shooting');
    g.targets = [{ x: 4, y: 16 }, { x: 4, y: 15 }, { x: 4, y: 14 }]; // столбец над пушкой, нижняя клетка в строке 16 — у самой границы
    g.x = 4;
    const scores: number[] = [];
    const events: BrickEvent[] = [];
    for (let t = 0; t < 120 && !has(events, 'win'); t++) {
      const tick = g.step(HOLD);
      events.push(...tick);
      if (has(tick, 'hit')) scores.push(g.score);
    }
    expect(scores).toEqual([5, 10, 15 + LEVEL_BONUS]); // на последней клетке к +5 добавляется награда за уровень
    expect(g.lives).toBe(4);
    expect(g.score).toBe(3 * 5 + LEVEL_BONUS);
    run(g, SCENE);
    expect(g.level).toBe(2);
    expect(g.targets).toHaveLength(24);
  });

  progress('talking-shooting', 'строй, упёршийся в нижнюю границу, остаётся над пушкой целым и жизни не стоит', () => {
    const g = start('talking-shooting');
    g.x = 0;
    // Ряд во всю ширину упирается в оба края на каждом шаге: в «Space Invaders» он бы опускался на ряд при каждом шаге.
    g.targets = Array.from({ length: 10 }, (_, x) => ({ x, y: 15 }));
    run(g, FORMATION_STEP - 1);
    expect(box(g)).toBe('x0–9 y15–15');
    run(g, 1);
    expect(box(g)).toBe('x0–9 y16–16'); // дошёл до нижней строки строя
    const snapshots: string[] = [];
    for (let t = FORMATION_STEP + 1; t <= FIRST_ENEMY_SHOT + 1; t++) {
      g.step(IDLE);
      snapshots.push(box(g));
      expect(g.lives, `такт ${t}`).toBe(4);
      expect(new Set(g.targets.map((p) => `${p.x},${p.y}`)).size, `такт ${t}`).toBe(10); // клетки не склеились
    }
    // На втором шаге (такт 90) ряд снова упёрся в край, но ниже строки 16 не пошёл.
    expect(snapshots.every((s) => s === 'x0–9 y16–16')).toBe(true);
    expect(g.phase).toBe('playing');
  });

  failure('talking-shooting', 'падающий выстрел опасен: попадание отнимает жизнь, шаг в сторону спасает', () => {
    const fired = start('talking-shooting');
    const shot = awaitEnemyShot(fired);
    expect(fired.tick).toBe(FIRST_ENEMY_SHOT);

    const hit = start('talking-shooting');
    awaitEnemyShot(hit);
    walkTo(hit, shot.x);
    const events = runUntil(hit, IDLE, (e) => has(e, 'lifeLost'), 160);
    expect(has(events, 'lifeLost')).toBe(true);
    expect(hit.lives).toBe(3);
    expect(hit.score).toBe(0);
    run(hit, SCENE);
    expect(hit.lives).toBe(3);
    expect(hit.targets).toHaveLength(24);

    const dodge = start('talking-shooting');
    awaitEnemyShot(dodge);
    walkTo(dodge, shot.x >= 4 ? shot.x - 2 : shot.x + 2);
    const after = runUntil(dodge, IDLE, () => enemyShots(dodge).length === 0, 160);
    expect(has(after, 'lifeLost')).toBe(false);
    expect(dodge.lives).toBe(4);
  });

  failure('talking-shooting', 'на последней жизни выстрел заканчивает партию', () => {
    const g = start('talking-shooting');
    g.lives = 1;
    const events = strike(g);
    expect(has(events, 'lifeLost') && has(events, 'gameOver')).toBe(true);
    runUntil(g, IDLE, () => g.phase === 'over', 200);
    expect(g.phase).toBe('over');
    expect(g.lives).toBe(0);
  });

  // Строй останавливается в строке 16: пуля игрока рождается в строке 17 и проверяется после сдвига вверх, поэтому клетка нижнего ряда достижима.
  it('строй, остановившийся у нижней границы, можно добить: клетка в самой нижней строке уничтожается выстрелом', () => {
    const g = start('talking-shooting');
    g.targets = [{ x: 4, y: 16 }];
    g.x = 4;
    const events = run(g, 40, HOLD); // меньше шага строя: клетка стоит на месте
    expect(has(events, 'hit')).toBe(true);
    expect(g.score).toBe(5 + LEVEL_BONUS); // единственная клетка строя — +5 и награда за уровень
  });
});

// ── Tetris Shooting ────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('tetris-shooting: сценарии', () => {
  const hazard = (g: ShooterGame): { x: number; y: number } => ({ ...g['hazard'] });

  progress('tetris-shooting', 'блоки разбиты, пока опасная точка далеко от пушки: +5 за клетку, +100, на новом уровне точка снова вверху', () => {
    const g = start('tetris-shooting');
    // Блоки нарисованы вручную: столбцы 2–7, строки 2–7; точка мигает в правом верхнем углу.
    expect(picture(g, 2, 7, 2, 7)).toEqual(['###...', '.#....', '......', '....#.', '....#.', '....##']);
    expect(cell(g, 9, 0)).toBe(2);
    g.targets = [{ x: 3, y: 14 }, { x: 3, y: 13 }, { x: 4, y: 13 }]; // уголок рядом с пушкой
    g['hazard'] = { x: 2, y: 17 }; // точка уже у самой пушки: до потери три шага
    const events: BrickEvent[] = [];
    for (let t = 0; t < 100 && !has(events, 'win'); t++) {
      // Сначала стреляем из столбца 4 (сбивает (4,13)), затем один шаг влево и снова огонь — столбец 3 сверху вниз.
      events.push(...g.step(t === 10 ? makeBrickInput(['left'], ['rotate']) : HOLD));
    }
    expect(count(events, 'hit')).toBe(3);
    expect(has(events, 'win')).toBe(true);
    expect(g.score).toBe(3 * 5 + LEVEL_BONUS);
    expect(g.lives).toBe(4);
    expect(g.tick).toBeLessThan(FORMATION_STEP); // всё случилось раньше первого шага точки
    run(g, SCENE);
    expect(g.level).toBe(2);
    expect(hazard(g)).toEqual({ x: 9, y: 0 });
    expect(g.targets).toHaveLength(8);
  });

  progress('tetris-shooting', 'опасная точка идёт влево, в конце строки возвращается вправо и спускается на ряд; сбить её нельзя', () => {
    const g = start('tetris-shooting');
    run(g, FORMATION_STEP);
    expect(hazard(g)).toEqual({ x: 8, y: 0 });
    expect(cell(g, 8, 0)).toBe(2);
    expect(cell(g, 9, 0)).toBe(0);
    run(g, FORMATION_STEP);
    expect(hazard(g)).toEqual({ x: 7, y: 0 });

    const wrap = start('tetris-shooting');
    wrap['hazard'] = { x: 0, y: 5 };
    run(wrap, FORMATION_STEP);
    expect(hazard(wrap)).toEqual({ x: 9, y: 6 }); // левый край пройден: вправо и на ряд ниже
    expect(cell(wrap, 9, 6)).toBe(2);

    const shot = start('tetris-shooting');
    shot['hazard'] = { x: 4, y: 10 };
    shot.x = 4;
    const events = run(shot, 36, HOLD); // пуля пролетает строку 10 в столбце точки на 28-м такте
    expect(has(events, 'hit')).toBe(false);
    expect(shot.score).toBe(0);
    expect(hazard(shot)).toEqual({ x: 4, y: 10 });
    expect(cell(shot, 4, 10)).toBe(2);
    expect(shot.bullets.some((b) => !b.enemy && b.x === 4 && b.y < 10)).toBe(true); // пуля прошла сквозь точку и летит дальше
  });

  failure('tetris-shooting', 'опасная точка достигла нижней границы раньше, чем разбиты блоки: потеря жизни, поле начинается заново', () => {
    const g = start('tetris-shooting');
    g['hazard'] = { x: 1, y: 17 };
    run(g, FORMATION_STEP);
    expect(hazard(g)).toEqual({ x: 0, y: 17 }); // строка 17 ещё не потеря
    expect(g.lives).toBe(4);
    run(g, FORMATION_STEP - 1);
    expect(g.lives).toBe(4);
    const events = g.step(IDLE); // шаг влево за край: вправо и в строку 18
    expect(has(events, 'lifeLost')).toBe(true);
    expect(g.lives).toBe(3);
    expect(previewLives(g)).toBe(3);
    expect(g.score).toBe(0);
    expect(g.targets).toHaveLength(8); // блоки так и не разбиты
    run(g, SCENE);
    expect(g.lives).toBe(3);
    expect(hazard(g)).toEqual({ x: 9, y: 0 }); // повтор поля: точка снова вверху
    expect(g.phase).toBe('playing');
  });

  failure('tetris-shooting', 'на последней жизни точка у пушки заканчивает партию', () => {
    const g = start('tetris-shooting');
    g.lives = 1;
    g['hazard'] = { x: 0, y: 17 };
    const events = run(g, FORMATION_STEP);
    expect(has(events, 'lifeLost') && has(events, 'gameOver')).toBe(true);
    expect(g.lives).toBe(0);
    runUntil(g, IDLE, () => g.phase === 'over', 200);
    expect(g.phase).toBe('over');
  });
});

// ── Meteor Fighter ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('meteor-fighter: сценарии', () => {
  /** Взлёт: столько тактов после старта самолёт не стреляет. */
  const TAKEOFF = 60;
  const playerBar = (g: BrickGame): number => lit(g, 19, 19);
  const bossBar = (g: BrickGame): number => lit(g, 0, 0);
  /** Строка носа самолёта: 19 (под основанием), 18 (нос скрыт основанием), 17 (на месте) — по мере взлёта нос идёт вверх. */
  const noseRow = (g: BrickGame, x: number): number => (cell(g, x, 17) === 2 ? 17 : cell(g, x, 19) === 2 ? 19 : 18);

  progress('meteor-fighter', 'взлёт без стрельбы 60 тактов, самолёт поднимается; затем огонь открывается', () => {
    const g = start('meteor-fighter');
    const rows: number[] = [];
    const events: BrickEvent[] = [];
    for (let t = 1; t <= TAKEOFF; t++) {
      // огонь зажат всё время, а на 5-м такте пушка ещё и сдвигается: двигаться при взлёте можно
      events.push(...g.step(t === 5 ? makeBrickInput(['right'], ['rotate']) : HOLD));
      rows.push(noseRow(g, g.x));
      expect(g.bullets, `такт ${t}`).toHaveLength(0);
    }
    expect(count(events, 'shot')).toBe(0);
    expect(g.x).toBe(5);
    expect(rows[0]).toBe(19); // самолёт ещё ниже своего места
    expect(rows.at(-1)).toBe(17);
    expect(rows.every((row, i) => i === 0 || row <= rows[i - 1]!)).toBe(true); // только вверх
    const first = g.step(HOLD); // 61-й такт: огонь открыт
    expect(has(first, 'shot')).toBe(true);
    expect(g.bullets).toHaveLength(1);
  });

  progress('meteor-fighter', 'самолёт-босс сбит: каждое попадание +5 и минус единица здоровья босса, победа +100, на новом уровне снова взлёт', () => {
    const g = start('meteor-fighter');
    // Самолёт-босс: нос и три ряда крыльев (столбцы 2–6, строки 2–4).
    expect(picture(g, 2, 6, 2, 4)).toEqual(['..#..', '.###.', '#####']);
    const hp = g.bossHP;
    expect(hp).toBeGreaterThan(1);
    expect(bossBar(g)).toBe(Math.min(10, hp));
    run(g, TAKEOFF);
    expect(playerBar(g)).toBe(3);
    const events = runUntil(g, HOLD, (e) => has(e, 'win'), 400);
    expect(count(events, 'hit')).toBe(hp);
    expect(g.bossHP).toBe(0);
    expect(g.targets).toHaveLength(0);
    expect(g.score).toBe(hp * 5 + LEVEL_BONUS);
    expect(g.lives).toBe(4);
    expect(g.level).toBe(1);
    run(g, SCENE);
    expect(g.level).toBe(2);
    expect(g.bossHP).toBeGreaterThan(0);
    expect(picture(g, 2, 6, 2, 4)).toEqual(['..#..', '.###.', '#####']);
    // Новый уровень начинается с нового взлёта.
    expect(count(run(g, TAKEOFF, HOLD), 'shot')).toBe(0);
    expect(has(g.step(HOLD), 'shot')).toBe(true);
  });

  progress('meteor-fighter', 'выстрелы мимо самолёта босса не ранят', () => {
    const g = start('meteor-fighter');
    run(g, TAKEOFF);
    g.x = 8; // самолёт занимает столбцы 2–6
    const hp = g.bossHP;
    const events = run(g, 120, HOLD);
    expect(count(events, 'shot')).toBeGreaterThan(5);
    expect(has(events, 'hit')).toBe(false);
    expect(g.score).toBe(0);
    expect(g.bossHP).toBe(hp);
  });

  failure('meteor-fighter', 'три попадания по игроку отнимают жизнь: первые два уменьшают шкалу здоровья, поле потом начинается заново', () => {
    const g = start('meteor-fighter');
    run(g, TAKEOFF);
    const hp = g.bossHP;
    run(g, 11, HOLD); // два выстрела
    run(g, 70); // долетели: два попадания
    expect(g.bossHP).toBe(hp - 2);
    const damaged = g.score;
    expect(damaged).toBe(10);

    expect(has(strike(g), 'lifeLost')).toBe(false);
    expect(g.lives).toBe(4);
    expect(playerBar(g)).toBe(2);
    expect(has(strike(g), 'lifeLost')).toBe(false);
    expect(g.lives).toBe(4);
    expect(playerBar(g)).toBe(1);
    const events = strike(g);
    expect(has(events, 'lifeLost')).toBe(true);
    expect(g.lives).toBe(3);
    expect(previewLives(g)).toBe(3);
    run(g, SCENE);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(damaged);
    expect(g.bossHP).toBe(hp);
    // После потери самолёт взлетает заново: стрелять нельзя; по окончании взлёта шкала здоровья снова полная.
    expect(count(run(g, TAKEOFF, HOLD), 'shot')).toBe(0);
    expect(playerBar(g)).toBe(3);
  });

  failure('meteor-fighter', 'на последней жизни третье попадание заканчивает партию', () => {
    const g = start('meteor-fighter');
    run(g, TAKEOFF);
    g.lives = 1;
    strike(g);
    strike(g);
    expect(g.phase).toBe('playing');
    expect(g.lives).toBe(1);
    const events = strike(g);
    expect(has(events, 'lifeLost') && has(events, 'gameOver')).toBe(true);
    runUntil(g, IDLE, () => g.phase === 'over', 200);
    expect(g.phase).toBe('over');
    expect(g.lives).toBe(0);
  });

  // ИЗВЕСТНАЯ ОШИБКА (it.fails; описание в отчёте): шкала босса показывает не больше десяти клеток, а здоровья на уровне N — 10 + N.
  // Первые N попаданий не меняют шкалу вовсе. Когда ошибку исправят, заменить it.fails на it.
  it.fails('каждое попадание по боссу заметно на его шкале с самого первого', () => {
    const g = start('meteor-fighter');
    run(g, TAKEOFF);
    const before = bossBar(g);
    runUntil(g, HOLD, (e) => has(e, 'hit'), 200);
    expect(bossBar(g)).toBeLessThan(before);
  });
});

// ── охват ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('охват сценариев стрелялок', () => {
  it('у каждой игры из SCENARIO_GAMES есть сценарии «прогресс» и «неудача»; игры есть в каталоге', () => {
    expect(new Set(SCENARIO_GAMES).size).toBe(SCENARIO_GAMES.length);
    for (const id of SCENARIO_GAMES) {
      expect(LIBRARY_GAMES[id], id).toBeDefined();
      expect(covered.прогресс.has(id), `${id}: прогресс`).toBe(true);
      expect(covered.неудача.has(id), `${id}: неудача`).toBe(true);
    }
    expect([...covered.прогресс].sort()).toEqual([...SCENARIO_GAMES].sort());
    expect([...covered.неудача].sort()).toEqual([...SCENARIO_GAMES].sort());
  });
});
