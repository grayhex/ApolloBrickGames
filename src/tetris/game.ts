/**
 * Ядро тетриса для портретного LCD 10×20 (заглушка геймплея двух скинов «электронной игрушки»).
 * Чистое и детерминированное: никакого DOM, часов и Math.random — случайность только через seeded ГСЧ из core/rng.
 * Один вызов `step` — один такт (TETRIS_TICK_HZ в секунду); одинаковое зерно и одинаковая последовательность
 * вводов дают одинаковые состояния.
 */
import { nextInt } from '../core/rng';
import {
  PIECE_KINDS,
  SPAWN_COLUMN,
  cellsOf,
  pieceCellValue,
  spawnRowOf,
  type PieceKind,
} from './pieces';

export const FIELD_COLUMNS = 10;
export const FIELD_ROWS = 20;
export const TETRIS_TICK_HZ = 60;

/** Длительность вспышки полных рядов, такты. */
export const CLEAR_TICKS = 24;
/** Максимум счёта (дальше — упор, не переполнение). */
export const MAX_SCORE = 9_999_999;
/** Зерно по умолчанию, если оболочка не передала своё. */
export const DEFAULT_SEED = 1;

export const MIN_SPEED = 1;
export const MAX_SPEED = 10;
/** Скорость растёт на единицу за каждые столько собранных линий. */
export const LINES_PER_SPEED = 10;

/** Тактов на строку падения для скоростей 1..10. */
export const GRAVITY_TICKS: readonly number[] = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6];
/** Предел интервала падения, пока удерживается «вниз», такты на строку. */
export const SOFT_DROP_TICKS = 2;
/** Очки за строку мягкого падения и за строку жёсткого. */
export const SOFT_DROP_SCORE = 1;
export const HARD_DROP_SCORE = 2;

/** Автоповтор (DAS): через сколько тактов после нажатия начинается повтор и с каким шагом. */
export const SHIFT_DELAY_TICKS = 12;
export const SHIFT_REPEAT_TICKS = 3;

/** Очки за 0/1/2/3/4 линии одним ходом. */
export const LINE_SCORES: readonly number[] = [0, 100, 300, 700, 1500];

/** Анимация конца игры: тактов на заполненную строку и пауза после полного заполнения. */
export const GAME_OVER_TICKS_PER_ROW = 2;
export const GAME_OVER_HOLD_TICKS = 30;

export type TetrisAction = 'left' | 'right' | 'down' | 'rotate' | 'drop';
export type TetrisPhase = 'ready' | 'playing' | 'paused' | 'over';

export interface TetrisInput {
  /** Фронт нажатия в этом такте. */
  readonly pressed: ReadonlySet<TetrisAction>;
  /** Кнопки, которые сейчас зажаты. */
  readonly held: ReadonlySet<TetrisAction>;
}

/** Падающая фигура: `x`, `y` — левый верхний угол коробки 4×4 в клетках поля, строка 0 — верх. */
export interface ActivePiece {
  kind: PieceKind;
  rotation: number;
  x: number;
  y: number;
}

export type TetrisEvent =
  | { type: 'started' }
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'lock' }
  | { type: 'drop' }
  | { type: 'lines'; count: number; rows: number[] }
  | { type: 'levelUp'; speed: number }
  | { type: 'gameOver' }
  | { type: 'paused' }
  | { type: 'resumed' };

export interface TetrisOptions {
  seed?: number;
  hiScore?: number;
  /** Начальная скорость 1..10, по умолчанию 1. */
  startSpeed?: number;
}

/** Ввод «ничего не нажато». */
export const NEUTRAL_TETRIS_INPUT: TetrisInput = { pressed: new Set(), held: new Set() };

/** Собрать ввод такта. Нажатые в этом такте кнопки автоматически считаются и зажатыми. */
export function makeTetrisInput(
  pressed: Iterable<TetrisAction> = [],
  held: Iterable<TetrisAction> = [],
): TetrisInput {
  const pressedSet = new Set(pressed);
  const heldSet = new Set(held);
  for (const action of pressedSet) heldSet.add(action);
  return { pressed: pressedSet, held: heldSet };
}

/** Тактов на строку для скорости с учётом «вниз». */
export function gravityTicks(speed: number, softDrop: boolean): number {
  const base = GRAVITY_TICKS[clampInt(speed, MIN_SPEED, MAX_SPEED) - 1] ?? GRAVITY_TICKS[0] ?? 48;
  return softDrop ? Math.min(base, SOFT_DROP_TICKS) : base;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Сдвиги по x при повороте, в порядке попыток («пол-кик» вверх проверяется после них, см. `rotatePiece`). */
const KICK_OFFSETS_X: readonly number[] = [0, -1, 1, -2, 2];

export class TetrisGame {
  /** Поле, построчно: индекс `y * FIELD_COLUMNS + x`; 0 — пусто, 1..7 — зафиксированная фигура (индекс вида + 1). */
  readonly field = new Uint8Array(FIELD_COLUMNS * FIELD_ROWS);
  phase: TetrisPhase = 'ready';
  piece: ActivePiece | null = null;
  next: PieceKind;
  score = 0;
  hiScore: number;
  lines = 0;
  /** Скорость 1..10. */
  speed: number;
  /** Заглушка: уровни оригинала отключены, всегда 1. */
  level = 1;
  /** Ряды, которые мигают прямо сейчас; пусто вне анимации. */
  clearRows: readonly number[] = [];
  /** Сколько тактов осталось анимации; на 0 ряды схлопываются и появляется следующая фигура. */
  clearTimer = 0;
  /** Анимация конца игры: сколько рядов снизу уже закрашено, 0..FIELD_ROWS. */
  overFill = 0;
  /** Сколько тактов отыграно в фазе `playing` с начала партии. */
  tick = 0;

  private readonly startSpeed: number;
  private rngState: number;
  /** Остаток текущего мешка: берём с конца. */
  private bag: PieceKind[] = [];
  private gravityCounter = 0;
  private shiftDir: -1 | 0 | 1 = 0;
  private shiftTimer = 0;
  private dying = false;
  private overTimer = 0;

  constructor(options: TetrisOptions = {}) {
    this.rngState = (options.seed ?? DEFAULT_SEED) >>> 0;
    this.startSpeed = clampInt(options.startSpeed ?? MIN_SPEED, MIN_SPEED, MAX_SPEED);
    this.hiScore = clampInt(options.hiScore ?? 0, 0, MAX_SCORE);
    this.speed = this.startSpeed;
    this.next = this.drawKind();
  }

  /** `ready` или `over` -> `playing`: новая партия (хай-скор сохраняется), первая фигура появляется сразу. */
  start(): TetrisEvent[] {
    if (this.phase === 'over') {
      this.resetGame(true);
    } else if (this.phase === 'ready') {
      this.resetGame(false);
    } else {
      return [];
    }
    this.phase = 'playing';
    const events: TetrisEvent[] = [{ type: 'started' }];
    this.spawn(events);
    return events;
  }

  pause(): TetrisEvent[] {
    if (this.phase !== 'playing') return [];
    this.phase = 'paused';
    return [{ type: 'paused' }];
  }

  resume(): TetrisEvent[] {
    if (this.phase !== 'paused') return [];
    this.phase = 'playing';
    return [{ type: 'resumed' }];
  }

  /** Свежая партия в любой фазе, но без старта: `ready`. Хай-скор сохраняется, мешок фигур перемешивается заново. */
  restart(): TetrisEvent[] {
    this.resetGame(true);
    this.phase = 'ready';
    return [];
  }

  /** Один такт. Работает только в `playing` (в том числе анимации очистки рядов и конца игры). */
  step(input: TetrisInput): TetrisEvent[] {
    const events: TetrisEvent[] = [];
    if (this.phase !== 'playing') return events;
    this.tick++;
    if (this.dying) {
      this.stepGameOver();
    } else if (this.clearRows.length > 0) {
      this.stepClear(events);
    } else if (this.piece) {
      this.stepPiece(this.piece, input, events);
    }
    return events;
  }

  /** Строка `y` коробки, куда упадёт текущая фигура; `null`, если фигуры нет. */
  ghostRow(): number | null {
    const piece = this.piece;
    if (!piece) return null;
    return this.landingRow(piece);
  }

  /** Копия поля с впечатанной падающей фигурой (то же кодирование клеток) — для отрисовки. */
  snapshot(): Uint8Array {
    const out = this.field.slice();
    const piece = this.piece;
    if (piece) {
      const value = pieceCellValue(piece.kind);
      for (const [dx, dy] of cellsOf(piece.kind, piece.rotation)) {
        const x = piece.x + dx;
        const y = piece.y + dy;
        if (x >= 0 && x < FIELD_COLUMNS && y >= 0 && y < FIELD_ROWS) out[y * FIELD_COLUMNS + x] = value;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- партия

  /** Обнулить партию. `redraw` — перемешать мешок заново и взять новую `next` (ГСЧ при этом не пересевается). */
  private resetGame(redraw: boolean): void {
    this.field.fill(0);
    this.piece = null;
    this.score = 0;
    this.lines = 0;
    this.speed = this.startSpeed;
    this.level = 1;
    this.clearRows = [];
    this.clearTimer = 0;
    this.overFill = 0;
    this.tick = 0;
    this.gravityCounter = 0;
    this.shiftDir = 0;
    this.shiftTimer = 0;
    this.dying = false;
    this.overTimer = 0;
    if (redraw) {
      this.bag = [];
      this.next = this.drawKind();
    }
  }

  private spawn(events: TetrisEvent[]): void {
    const kind = this.next;
    this.next = this.drawKind();
    this.gravityCounter = 0;
    const piece: ActivePiece = { kind, rotation: 0, x: SPAWN_COLUMN, y: spawnRowOf(kind) };
    if (this.collides(piece.kind, piece.rotation, piece.x, piece.y)) {
      this.piece = null;
      this.beginGameOver(events);
      return;
    }
    this.piece = piece;
  }

  private beginGameOver(events: TetrisEvent[]): void {
    this.piece = null;
    this.clearRows = [];
    this.clearTimer = 0;
    this.dying = true;
    this.overTimer = 0;
    this.overFill = 0;
    if (this.score > this.hiScore) this.hiScore = this.score;
    events.push({ type: 'gameOver' });
  }

  private stepGameOver(): void {
    this.overTimer++;
    this.overFill = Math.min(FIELD_ROWS, Math.floor(this.overTimer / GAME_OVER_TICKS_PER_ROW));
    if (this.overTimer >= FIELD_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS) {
      this.dying = false;
      this.phase = 'over';
    }
  }

  // ---------------------------------------------------------------- мешок фигур

  /** Следующая фигура из мешка «7 из 7»; пустой мешок заново перемешивается (Фишер — Йетс на seeded ГСЧ). */
  private drawKind(): PieceKind {
    if (this.bag.length === 0) this.bag = this.shuffledBag();
    const kind = this.bag.pop();
    if (kind === undefined) throw new Error('unreachable: пустой мешок');
    return kind;
  }

  private shuffledBag(): PieceKind[] {
    const bag: PieceKind[] = [...PIECE_KINDS];
    for (let i = bag.length - 1; i > 0; i--) {
      const roll = nextInt(this.rngState, i + 1);
      this.rngState = roll.state;
      const a = bag[i];
      const b = bag[roll.value];
      if (a !== undefined && b !== undefined) {
        bag[i] = b;
        bag[roll.value] = a;
      }
    }
    return bag;
  }

  // ---------------------------------------------------------------- такт с фигурой

  private stepPiece(piece: ActivePiece, input: TetrisInput, events: TetrisEvent[]): void {
    const isDown = (action: TetrisAction): boolean => input.held.has(action) || input.pressed.has(action);

    this.shiftPiece(piece, input, events);
    if (input.pressed.has('rotate') && this.rotatePiece(piece)) events.push({ type: 'rotate' });

    if (input.pressed.has('drop')) {
      const landing = this.landingRow(piece);
      this.addScore((landing - piece.y) * HARD_DROP_SCORE);
      piece.y = landing;
      events.push({ type: 'drop' });
      this.lockPiece(piece, events);
      return;
    }

    const softDrop = isDown('down');
    this.gravityCounter++;
    if (this.gravityCounter < gravityTicks(this.speed, softDrop)) return;
    this.gravityCounter = 0;
    if (!this.collides(piece.kind, piece.rotation, piece.x, piece.y + 1)) {
      piece.y++;
      if (softDrop) this.addScore(SOFT_DROP_SCORE);
    } else {
      this.lockPiece(piece, events);
    }
  }

  /**
   * Горизонталь: шаг по фронту нажатия, затем автоповтор. Фронт одной стороны (при отсутствии фронта другой)
   * начинает отсчёт заново; одновременные фронты обеих сторон и «обе зажаты» никуда не двигают.
   */
  private shiftPiece(piece: ActivePiece, input: TetrisInput, events: TetrisEvent[]): void {
    const pressedLeft = input.pressed.has('left');
    const pressedRight = input.pressed.has('right');
    const heldLeft = input.held.has('left') || pressedLeft;
    const heldRight = input.held.has('right') || pressedRight;
    let step = false;

    if (pressedLeft !== pressedRight) {
      this.shiftDir = pressedLeft ? -1 : 1;
      this.shiftTimer = 0;
      step = true;
    } else {
      const dirHeld = this.shiftDir === -1 ? heldLeft : this.shiftDir === 1 ? heldRight : false;
      if (dirHeld) {
        this.shiftTimer++;
        step =
          this.shiftTimer >= SHIFT_DELAY_TICKS && (this.shiftTimer - SHIFT_DELAY_TICKS) % SHIFT_REPEAT_TICKS === 0;
      } else if (heldLeft !== heldRight) {
        // Нужная сторона отпущена, но зажата другая. Без прежнего направления (фронт «проглотила» анимация) —
        // шаг сразу, иначе (отпустили вторую кнопку) — просто заново копим задержку.
        step = this.shiftDir === 0;
        this.shiftDir = heldLeft ? -1 : 1;
        this.shiftTimer = 0;
      } else {
        this.shiftDir = 0;
        this.shiftTimer = 0;
      }
    }

    if (step && this.shiftDir !== 0 && !this.collides(piece.kind, piece.rotation, piece.x + this.shiftDir, piece.y)) {
      piece.x += this.shiftDir;
      events.push({ type: 'move' });
    }
  }

  /**
   * Поворот по часовой с простыми кик-смещениями: сначала по x (0, -1, +1, -2, +2), если не вошло — то же
   * на строку выше (пол-кик); у I — ещё на две строки выше (плоская палка у пола). Над полем (I при появлении)
   * последняя попытка — на строку ниже. Не вошло нигде — поворота нет.
   */
  private rotatePiece(piece: ActivePiece): boolean {
    const rotation = (piece.rotation + 1) % 4;
    const dyList = [0, -1];
    if (piece.kind === 'I') dyList.push(-2);
    if (piece.y < 0) dyList.push(1);
    for (const dy of dyList) {
      for (const dx of KICK_OFFSETS_X) {
        if (this.collides(piece.kind, rotation, piece.x + dx, piece.y + dy)) continue;
        piece.rotation = rotation;
        piece.x += dx;
        piece.y += dy;
        return true;
      }
    }
    return false;
  }

  private lockPiece(piece: ActivePiece, events: TetrisEvent[]): void {
    const value = pieceCellValue(piece.kind);
    for (const [dx, dy] of cellsOf(piece.kind, piece.rotation)) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (x >= 0 && x < FIELD_COLUMNS && y >= 0 && y < FIELD_ROWS) this.field[y * FIELD_COLUMNS + x] = value;
    }
    this.piece = null;
    events.push({ type: 'lock' });

    const rows = this.fullRows();
    if (rows.length === 0) {
      this.spawn(events);
      return;
    }
    this.clearRows = rows;
    this.clearTimer = CLEAR_TICKS;
    this.lines += rows.length;
    this.addScore(LINE_SCORES[rows.length] ?? 0);
    events.push({ type: 'lines', count: rows.length, rows: [...rows] });
    const speed = Math.min(MAX_SPEED, this.startSpeed + Math.floor(this.lines / LINES_PER_SPEED));
    if (speed !== this.speed) {
      this.speed = speed;
      events.push({ type: 'levelUp', speed });
    }
  }

  private stepClear(events: TetrisEvent[]): void {
    this.clearTimer--;
    if (this.clearTimer > 0) return;
    this.clearTimer = 0;
    this.collapseRows();
    this.clearRows = [];
    this.spawn(events);
  }

  // ---------------------------------------------------------------- поле

  private collides(kind: PieceKind, rotation: number, x: number, y: number): boolean {
    for (const [dx, dy] of cellsOf(kind, rotation)) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cx >= FIELD_COLUMNS || cy < 0 || cy >= FIELD_ROWS) return true;
      if (this.field[cy * FIELD_COLUMNS + cx] !== 0) return true;
    }
    return false;
  }

  private landingRow(piece: ActivePiece): number {
    let y = piece.y;
    while (!this.collides(piece.kind, piece.rotation, piece.x, y + 1)) y++;
    return y;
  }

  private fullRows(): number[] {
    const rows: number[] = [];
    for (let y = 0; y < FIELD_ROWS; y++) {
      let full = true;
      for (let x = 0; x < FIELD_COLUMNS; x++) {
        if (this.field[y * FIELD_COLUMNS + x] === 0) {
          full = false;
          break;
        }
      }
      if (full) rows.push(y);
    }
    return rows;
  }

  /** Убрать мигавшие ряды: всё, что выше, оседает вниз, сверху — пустые ряды. */
  private collapseRows(): void {
    const cleared = new Set(this.clearRows);
    let write = FIELD_ROWS - 1;
    for (let read = FIELD_ROWS - 1; read >= 0; read--) {
      if (cleared.has(read)) continue;
      if (write !== read) {
        this.field.copyWithin(write * FIELD_COLUMNS, read * FIELD_COLUMNS, (read + 1) * FIELD_COLUMNS);
      }
      write--;
    }
    this.field.fill(0, 0, (write + 1) * FIELD_COLUMNS);
  }

  private addScore(points: number): void {
    this.score = Math.min(MAX_SCORE, this.score + points);
    if (this.score > this.hiScore) this.hiScore = this.score;
  }
}
