/**
 * Лаборатория для тестов тетриса и Pentix: наследник общего ядра с доступом к внутреннему состоянию (фигура, поле, таймеры),
 * чтобы выставлять точные положения и проверять правила, а не только случайные партии.
 * Высота `y` в лаборатории — как внутри ядра и у донора: 0 — низ стакана; `rows()` — экранная картинка (строка 0 — верх).
 */
import { PENTIX_VARIANTS } from '../../../src/brick/games/pentix';
import { TETRIS_VARIANTS } from '../../../src/brick/games/tetris';
import { TetrisCore } from '../../../src/brick/games/tetris/core';
import { makePiece, rotatePiece, type Piece } from '../../../src/brick/games/tetris/shapes';
import type { TetrisVariant } from '../../../src/brick/games/tetris/variants';
import {
  BRICK_COLS,
  BRICK_ROWS,
  NEUTRAL_BRICK_INPUT,
  makeBrickInput,
  type BrickAction,
  type BrickEvent,
  type BrickGame,
  type BrickGameOptions,
} from '../../../src/brick/types';

export type Pool = 'tetris' | 'pentix';

export class Lab extends TetrisCore {
  readonly id: string;

  constructor(pool: Pool, options: BrickGameOptions = {}) {
    super(options, pool === 'tetris' ? TETRIS_VARIANTS : PENTIX_VARIANTS);
    this.id = pool;
    this.init();
  }

  get rule(): TetrisVariant {
    return this.variant;
  }
  get current(): Piece | null {
    return this.piece;
  }
  get px(): number {
    return this.pieceX;
  }
  get py(): number {
    return this.pieceY;
  }
  get upcoming(): Piece {
    return this.nextPiece;
  }
  get landed(): boolean {
    return this.fallingFinished;
  }
  get gameEnded(): boolean {
    return this.over;
  }
  get timerSeconds(): number {
    return this.lineLeft;
  }
  get timerDue(): boolean {
    return this.lineDue;
  }
  get garbageLeft(): number {
    return this.pendingGarbage;
  }
  get fallPeriod(): number {
    return this.fallTicks();
  }
  get flags(): { liquid: boolean; acid: boolean; through: boolean } {
    return { liquid: this.liquidNow, acid: this.acidNow, through: this.throughNow };
  }

  /** Осевшие клетки: копия, индекс `y * 10 + x`, y = 0 — низ. */
  settled(): Uint8Array {
    return this.board.slice();
  }
  count(): number {
    return this.board.reduce((sum, v) => sum + (v === 0 ? 0 : 1), 0);
  }
  cell(x: number, y: number): number {
    return this.board[y * BRICK_COLS + x] ?? 0;
  }

  /** Экранная картинка: 20 строк по 10 знаков (`.` — погашена, `#` — горит, `*` — мигает). */
  rows(): string[] {
    const cells = this.cells();
    const out: string[] = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      out.push([...cells.slice(r * BRICK_COLS, (r + 1) * BRICK_COLS)].map((v) => '.#*'[v] ?? '?').join(''));
    }
    return out;
  }

  /** Превью построчно (4 строки по 4 знака). */
  previewRows(): string[] {
    const cells = this.preview();
    if (!cells) return [];
    const out: string[] = [];
    for (let r = 0; r < 4; r++) out.push([...cells.slice(r * 4, r * 4 + 4)].map((v) => '.#*'[v] ?? '?').join(''));
    return out;
  }

  /** Убрать с поля всё: осевшие клетки и падающую фигуру. */
  wipe(): void {
    this.board.fill(0);
    this.piece = null;
  }

  /** Заполнить ряд высоты y по шаблону из 10 знаков (`#` — клетка). */
  fill(y: number, pattern: string): void {
    for (let x = 0; x < BRICK_COLS; x++) this.board[y * BRICK_COLS + x] = pattern[x] === '#' ? 1 : 0;
  }

  /** Поставить падающую фигуру в точку привязки (x, y). */
  put(shape: number, angle: number, x: number, y: number, blink = false): void {
    this.piece = makePiece(shape, angle, blink);
    this.pieceX = x;
    this.pieceY = y;
    this.fallingFinished = false;
  }

  /** Подменить следующую фигуру. */
  setNext(shape: number, angle = 0, blink = false): void {
    this.nextPiece = makePiece(shape, angle, blink);
  }

  /** Заставить появиться заданную фигуру (следующей станет случайная). */
  respawn(shape: number, angle = 0, blink = false): void {
    this.nextPiece = makePiece(shape, angle, blink);
    this.fallingFinished = false;
    this.spawn();
  }

  /** Сделать так, чтобы шаг падения случился на ближайшем такте. */
  dueFall(): void {
    this.lastFall = this.tick - this.fallTicks();
  }

  /** Выставить оставшееся до добавления ряда число секунд (классы J, L, N, P). */
  setTimer(seconds: number): void {
    this.lineLeft = seconds;
  }

  /** Выставить счёт в обход правил. */
  poke(score: number): void {
    this.setScore(score);
  }

  /** Задать особые свойства текущей фигуры вручную. */
  setFlags(flags: { liquid?: boolean; acid?: boolean; through?: boolean }): void {
    if (flags.liquid !== undefined) this.liquidNow = flags.liquid;
    if (flags.acid !== undefined) this.acidNow = flags.acid;
    if (flags.through !== undefined) this.throughNow = flags.through;
  }
}

/** Номер варианта (с нуля), подходящего под условие. */
export function modeWhere(pool: Pool, test: (variant: TetrisVariant) => boolean): number {
  const list = pool === 'tetris' ? TETRIS_VARIANTS : PENTIX_VARIANTS;
  const index = list.findIndex(test);
  if (index < 0) throw new Error('нет такого варианта');
  return index;
}

/** Лаборатория под вариант по условию, уже запущенная. */
export function labFor(pool: Pool, test: (variant: TetrisVariant) => boolean, options: BrickGameOptions = {}): Lab {
  const lab = new Lab(pool, { seed: 5, ...options, mode: modeWhere(pool, test) });
  lab.start();
  return lab;
}

/** Обычный тетрис (вариант 01), запущенный. */
export function plainLab(options: BrickGameOptions = {}): Lab {
  const lab = new Lab('tetris', { seed: 5, ...options, mode: 0 });
  lab.start();
  return lab;
}

/** Прогнать n тактов без нажатий; вернуть все события. */
export function idle(game: BrickGame, ticks: number): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
  return events;
}

/** Один такт с нажатием кнопок (фронт нажатия); затем, если нужно, такт отпускания. */
export function tap(game: BrickGame, ...actions: BrickAction[]): BrickEvent[] {
  const events = game.step(makeBrickInput(actions));
  events.push(...game.step(NEUTRAL_BRICK_INPUT));
  return events;
}

/** Один такт с нажатием, без отпускания следующим тактом. */
export function press(game: BrickGame, ...actions: BrickAction[]): BrickEvent[] {
  return game.step(makeBrickInput(actions));
}

/** Удерживать кнопку `ticks` тактов: нажатие в первом, дальше зажата. Вернуть события. */
export function hold(game: BrickGame, action: BrickAction, ticks: number): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(makeBrickInput(i === 0 ? [action] : [], [action])));
  return events;
}

/** Такты, пока не наступит условие (не больше лимита); вернуть число прошедших тактов. */
export function until(game: BrickGame, test: () => boolean, limit = 4000): number {
  let n = 0;
  while (!test() && n < limit) {
    game.step(NEUTRAL_BRICK_INPUT);
    n++;
  }
  return n;
}

export const types = (events: readonly BrickEvent[]): string[] => events.map((event) => event.type);

// ---------------------------------------------------------------- бот

/** Оценка стакана для бота: меньше высота, дыр и неровностей, больше снятых рядов. */
function evaluate(board: Uint8Array): number {
  const heights: number[] = [];
  let holes = 0;
  for (let x = 0; x < BRICK_COLS; x++) {
    let top = 0;
    for (let y = BRICK_ROWS - 1; y >= 0; y--) {
      if ((board[y * BRICK_COLS + x] ?? 0) !== 0) {
        top = y + 1;
        break;
      }
    }
    heights.push(top);
    for (let y = 0; y < top; y++) if ((board[y * BRICK_COLS + x] ?? 0) === 0) holes++;
  }
  const aggregate = heights.reduce((sum, h) => sum + h, 0);
  let bumpiness = 0;
  for (let x = 1; x < BRICK_COLS; x++) bumpiness += Math.abs((heights[x] ?? 0) - (heights[x - 1] ?? 0));
  return -0.510066 * aggregate - 0.35663 * holes - 0.184483 * bumpiness;
}

/** Куда лучше поставить текущую фигуру: угол и столбец привязки (или `null`, если некуда). */
export function bestPlacement(lab: Lab): { angle: number; x: number } | null {
  const piece = lab.current;
  if (!piece) return null;
  const board = lab.settled();
  let best: { angle: number; x: number; score: number } | null = null;
  for (let angle = 0; angle < 4; angle++) {
    const shape = makePiece(piece.shape, angle);
    for (let x = -3; x < BRICK_COLS + 3; x++) {
      if (x + shape.minX < 0 || x + shape.maxX >= BRICK_COLS) continue;
      const free = (b: Uint8Array, y: number): boolean =>
        shape.cells.every(([cx, cy]) => {
          const bx = x + cx;
          const by = y + cy;
          if (by < 0) return false;
          if (by >= BRICK_ROWS) return true;
          return (b[by * BRICK_COLS + bx] ?? 0) === 0;
        });
      let y = BRICK_ROWS - 1 - shape.minY;
      if (!free(board, y)) continue;
      while (free(board, y - 1)) y--;
      if (y + shape.maxY >= BRICK_ROWS) continue; // торчит выше поля — конец игры
      const trial = board.slice();
      for (const [cx, cy] of shape.cells) trial[(y + cy) * BRICK_COLS + x + cx] = 1;
      let cleared = 0;
      for (let row = 0; row < BRICK_ROWS - 1; row++) {
        let full = true;
        for (let col = 0; col < BRICK_COLS; col++) if ((trial[row * BRICK_COLS + col] ?? 0) === 0) full = false;
        if (!full) continue;
        cleared++;
        trial.copyWithin(row * BRICK_COLS, (row + 1) * BRICK_COLS);
        trial.fill(0, (BRICK_ROWS - 1) * BRICK_COLS);
        row--;
      }
      const score = evaluate(trial) + 0.760666 * cleared;
      if (!best || score > best.score) best = { angle, x, score };
    }
  }
  return best ? { angle: best.angle, x: best.x } : null;
}

/**
 * Простой игрок: для каждой новой фигуры выбирает лучшее место (`bestPlacement`), крутит, сдвигает и бросает.
 * Нажатия чередуются с отпусканием, чтобы каждое было фронтом.
 */
export class Bot {
  private target: { angle: number; x: number } | null = null;
  private released = true;
  private attempts = 0;
  private readonly lab: Lab;

  constructor(lab: Lab) {
    this.lab = lab;
  }

  next(): ReturnType<typeof makeBrickInput> {
    const lab = this.lab;
    const piece = lab.current;
    if (!piece || lab.landed || lab.phase !== 'playing') {
      this.target = null;
      this.attempts = 0;
      this.released = true;
      return NEUTRAL_BRICK_INPUT;
    }
    if (!this.released) {
      this.released = true;
      return NEUTRAL_BRICK_INPUT;
    }
    this.target ??= bestPlacement(lab) ?? { angle: piece.angle, x: lab.px };
    this.attempts++;
    this.released = false;
    if (this.attempts > 24) return makeBrickInput(['fire']);
    // квадрат, пентамино X и спецфигуры не вращаются (угол при появлении у них случайный и не меняется): крутить их незачем
    if (rotatePiece(piece) !== piece && piece.angle !== this.target.angle) return makeBrickInput(['rotate']);
    if (lab.px < this.target.x) return makeBrickInput(['right']);
    if (lab.px > this.target.x) return makeBrickInput(['left']);
    return makeBrickInput(['fire']);
  }
}
