/**
 * Проверка достижимости: существует ли последовательность допустимых вводов, при которой игра идёт без потери жизни до горизонта или до победы в уровне.
 * Это не «случайный игрок обязательно выживет» и не оптимальный игрок: плохой ввод вправе приводить к поражению. Поиск нужен, чтобы отличить
 * поражение по вине игрока от обязательной потери жизни, которую заложил сам генератор (препятствие, которое нечем и некуда обойти).
 *
 * Состояние игры копируется глубоко, с сохранением прототипов (игры — обычные классы без закрытых полей `#`); замыкания сценок (`animateClear`) копировать нельзя,
 * поэтому ветка поиска заканчивается, как только игра запускает сценку (потеря жизни — тупик, победа — успех).
 */
import { NEUTRAL_BRICK_INPUT, makeBrickInput, type BrickAction, type BrickGame, type BrickInput } from '../../src/brick';

export function deepClone<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  const source = value as unknown as object;
  const known = seen.get(source);
  if (known) return known as T;
  if (ArrayBuffer.isView(source)) {
    const copy = (source as unknown as { slice(): unknown }).slice();
    seen.set(source, copy);
    return copy as T;
  }
  if (source instanceof Set) {
    const copy = new Set<unknown>();
    seen.set(source, copy);
    for (const item of source) copy.add(deepClone(item, seen));
    return copy as T;
  }
  if (source instanceof Map) {
    const copy = new Map<unknown, unknown>();
    seen.set(source, copy);
    for (const [k, v] of source) copy.set(deepClone(k, seen), deepClone(v, seen));
    return copy as T;
  }
  if (Array.isArray(source)) {
    const copy: unknown[] = [];
    seen.set(source, copy);
    for (const item of source) copy.push(deepClone(item, seen));
    return copy as T;
  }
  const copy = Object.create(Object.getPrototypeOf(source)) as Record<string, unknown>;
  seen.set(source, copy);
  for (const key of Object.keys(source)) copy[key] = deepClone((source as Record<string, unknown>)[key], seen);
  return copy as T;
}

/** Полный слепок состояния игры (все собственные поля, включая скрытые таймеры и ГСЧ) в виде короткой строки — ключ для запоминания посещённых состояний. */
export function stateHash(game: unknown): string {
  const text = JSON.stringify(game, (_key, value: unknown) => {
    if (value instanceof Set) return { set: [...value] };
    if (value instanceof Map) return { map: [...value] };
    if (ArrayBuffer.isView(value)) return { typed: Array.from(value as unknown as ArrayLike<number>) };
    return value;
  });
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b + c, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(36)}${b.toString(36)}${text.length}`;
}

export interface SafePathOptions {
  /** Сколько тактов нужно прожить без потери жизни (или дойти до победы раньше). */
  horizon: number;
  /** Такты на один шаг решения (нажатие + отпускание = 2). */
  stride?: number;
  /** Кнопки, которые держатся всегда (например, огонь). */
  alwaysHeld?: readonly BrickAction[];
  /** Какие нажатия пробовать на каждом шаге помимо «ничего не делать». */
  moves: readonly BrickAction[][];
  /** Дополнительная проверка в каждом такте: возвращает текст нарушения или `null`. */
  invariant?: (game: BrickGame) => string | null;
  /** Предел числа посещённых состояний (защита от взрыва ветвления). */
  budget?: number;
}

export interface SafePathResult {
  found: boolean;
  /** Первые нарушения инварианта, если были. */
  violation: string | null;
  /** Найденная последовательность шагов (индексы в `moves`, 0 — ничего не делать). */
  steps: number[];
  visited: number;
  /** Дошла ли ветка до победы (иначе — до горизонта). */
  won: boolean;
}

/** Глубинный поиск с запоминанием состояний; порядок ветвей — сначала «ничего не делать». */
export function findSafePath(root: BrickGame, options: SafePathOptions, hash: (game: BrickGame) => string = stateHash): SafePathResult {
  const stride = options.stride ?? 2;
  const budget = options.budget ?? 200_000;
  const choices: (BrickAction[] | null)[] = [null, ...options.moves];
  const held = options.alwaysHeld ?? [];
  const seen = new Set<string>();
  let visited = 0;
  let violation: string | null = null;
  let won = false;
  const input = (pressed: BrickAction[], first: boolean): BrickInput => (first ? makeBrickInput(pressed, [...pressed, ...held]) : makeBrickInput([], [...held]));

  const search = (game: BrickGame, steps: number[]): number[] | null => {
    if (game.tick >= options.horizon) return steps;
    const key = `${game.tick}|${hash(game)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (++visited > budget) return null;
    for (let i = 0; i < choices.length; i++) {
      const next = deepClone(game);
      const lives = next.lives;
      let dead = false;
      let done = false;
      for (let t = 0; t < stride && !dead; t++) {
        const events = next.step(t === 0 && choices[i] ? input(choices[i]!, true) : t === 0 ? makeBrickInput([], [...held]) : input([], false));
        const bad = options.invariant?.(next) ?? null;
        if (bad && !violation) violation = bad;
        if (events.some((e) => e.type === 'win')) { done = true; won = true; break; }
        if (next.lives !== lives || next.phase === 'over' || events.some((e) => e.type === 'lifeLost' || e.type === 'gameOver')) dead = true;
      }
      if (dead) continue;
      if (done) return [...steps, i];
      const rest = search(next, [...steps, i]);
      if (rest) return rest;
    }
    return null;
  };
  const path = search(root, []);
  return { found: path !== null, violation, steps: path ?? [], visited, won };
}

export { NEUTRAL_BRICK_INPUT };
