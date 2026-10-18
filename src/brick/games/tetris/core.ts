/**
 * Ядро тетриса и Pentix: падение и повороты фигур, ряды, очки, скорость и уровень, спецфигуры и «особые» режимы — один класс
 * с переключателями правил (`TetrisVariant`), а не отдельная игра на вариант. Правила — `games/TetrisGameI.java` донора и семейство
 * `TetrisGameJ…P`, `PentixGameQ…X`; базовые тайминги и рост скорости — Apollo B0202 (см. `docs/brick/rom-review.md`).
 *
 * Внутри поле хранится как у донора: `board[y * 10 + x]`, y = 0 — НИЗ стакана (высота над дном); на экран (`cells()`) оно
 * переводится в строки сверху вниз (`rowOf`): обычное поле — строка 19 - y, перевёрнутое — строка y. Фигуры появляются так, что нижний
 * ряд фигуры стоит в верхней строке поля, а остальное ещё выше экрана (`newPiece`), и «въезжают» в поле по мере падения.
 *
 * Время — такты 60 Гц. Блокирующие `sleep()` донора — сценки базы (`cutscene`): кадры считаются заранее, на экран выводятся накладкой.
 * Падение по таймеру считается по абсолютному такту (`lastFall`), как `elapsedTime` донора по часам: таймер идёт и во время сценок.
 */
import { BrickBase } from '../../base';
import { b0202FallMs } from '../../b0202';
import { Countdown, Repeater, msToTicks } from '../../timing';
import {
  BRICK_CELLS,
  BRICK_COLS,
  BRICK_ROWS,
  BRICK_TICK_HZ,
  CELL_BLINK,
  CELL_ON,
  MAX_SPEED,
  PREVIEW_CELLS,
  PREVIEW_COLS,
  PREVIEW_ROWS,
  type BrickAction,
  type BrickGameOptions,
  type BrickInput,
} from '../../types';
import {
  SUPER_BOMB,
  SUPER_GUN,
  SUPER_MUD_GUN,
  SUPER_POINT,
  isSuperShape,
  makePiece,
  nextShape,
  nextTetromino,
  randomPiece,
  randomPieceOrSuper,
  rotatePiece,
  withBlink,
  type Piece,
} from './shapes';
import { speedPenaltyMs, type TetrisVariant } from './variants';

/** Время падения на скорости 1 и 10 (Apollo B0202), мс; надбавка за смену фигур и Pentix — `speedPenaltyMs`. */
export const FIRST_LEVEL_MS = Math.round(b0202FallMs(1));
export const TENTH_LEVEL_MS = Math.round(b0202FallMs(10));
/** Очки за 1-й, 2-й, 3-й и 4-й ряд одной посадки (`removeFullLines`): 1, 2, 4, 8, то есть 1, 3, 7, 15 за 1–4 ряда; за пятый и далее — по 1. */
export const LINE_POINTS: readonly number[] = [0, 1, 2, 4, 8];
/** Каждые столько очков скорость растёт на единицу (B0202: перенос в разряд тысяч). */
export const POINTS_PER_SPEED = 1000;
/** Секунд между добавлениями ряда в классах J, L, N, P (`TIME_BETWEEN_ADDING_LINE`); в первый раз ряд приходит на секунду раньше. */
export const LINE_TIMER_SECONDS = 30;
/** Шанс особой (мигающей) фигуры — 1 из стольких (`CHANCE_FOR_SUPER_FIGURE`). */
export const SPECIAL_CHANCE = 7;
/** Повтор B0202: после задержки ≈130 мс сдвиг и DOWN раз в кадр; ROTATE только по фронту. Первый сдвиг оставляем мгновенным. */
export const MOVE_REPEAT_TICKS = 1;
export const MOVE_DELAY_TICKS = msToTicks(130);
export const SOFT_DROP_TICKS = 1;
/** Шаг анимации стирания ряда и стекания клеток — 60 мс (`ANIMATION_DELAY * 2`). Тайминги сценок пока донорские. */
export const CLEAR_STEP_TICKS = msToTicks(60);
export const FLOW_STEP_TICKS = msToTicks(60);
/** Сторона квадрата, который стирает супербомба (`EXPLODE_SIZE` в `Game.kaboom` донора); нечётное число. */
export const BLAST_SIZE = 5;
const BLAST_RADIUS = (BLAST_SIZE - 1) / 2;

const MIDDLE_X = BRICK_COLS / 2 - 1;
const idx = (x: number, y: number): number => y * BRICK_COLS + x;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

interface Keys {
  turn: boolean;
  left: boolean;
  right: boolean;
  down: boolean;
  drop: boolean;
}

export abstract class TetrisCore extends BrickBase {
  protected readonly variant: TetrisVariant;

  /** Осевшие клетки: `board[y * 10 + x]`, y = 0 — низ; значения 0/1. Падающая фигура сюда не входит. */
  protected board: Uint8Array = new Uint8Array(BRICK_CELLS);
  /** Падающая фигура и её точка привязки; `null` между посадкой и появлением следующей. */
  protected piece: Piece | null = null;
  protected pieceX = 0;
  protected pieceY = 0;
  /** Следующая фигура (превью). */
  protected nextPiece: Piece = makePiece(7);
  /** Фигура села, ждём следующего тика падения, чтобы появилась новая (`isFallingFinished`). */
  protected fallingFinished = false;
  /** Такт последнего шага падения (`timePoint` донора). */
  protected lastFall = 0;
  /** Игра окончена посадкой или появлением фигуры: сдвиг поля после этого не делается. */
  protected over = false;
  /** Особые свойства текущей фигуры (для случайного семейства выбираются при появлении каждой мигающей фигуры). */
  protected liquidNow = false;
  protected acidNow = false;
  protected throughNow = false;
  /** Таймер добавления рядов (класс J): секунд до ряда и «пора добавлять». */
  protected lineLeft = LINE_TIMER_SECONDS;
  protected lineDue = false;

  private readonly lineClock = new Countdown(BRICK_TICK_HZ);
  private readonly moveRepeat = new Repeater(MOVE_DELAY_TICKS, MOVE_REPEAT_TICKS);
  private readonly downRepeat = new Repeater(SOFT_DROP_TICKS, SOFT_DROP_TICKS);

  protected constructor(options: BrickGameOptions, variants: readonly TetrisVariant[]) {
    super(options, variants.length);
    const variant = variants[this.mode] ?? variants[0];
    if (!variant) throw new Error('TetrisCore: нет вариантов');
    this.variant = variant;
  }

  // ---------------------------------------------------------------- координаты и рисунок

  /** Строка экрана для высоты y: обычное поле — сверху вниз, перевёрнутое — наоборот. */
  protected rowOf(y: number): number {
    return this.variant.inverted ? y : BRICK_ROWS - 1 - y;
  }

  /** Время падения на одну клетку в тактах на текущей скорости. */
  protected fallTicks(): number {
    const extra = speedPenaltyMs(this.variant);
    return ((b0202FallMs(this.speed) + extra) * BRICK_TICK_HZ) / 1000;
  }

  protected cellAt(x: number, y: number): number {
    if (x < 0 || x >= BRICK_COLS || y < 0 || y >= BRICK_ROWS) return 0;
    return this.board[idx(x, y)] ?? 0;
  }

  /** Экранная матрица: осевшие клетки (и накладка кадра `board`) плюс, если нужно, падающая фигура. */
  private render(board: Uint8Array, withPiece: boolean): Uint8Array {
    const out = new Uint8Array(BRICK_CELLS);
    for (let y = 0; y < BRICK_ROWS; y++) {
      const row = this.rowOf(y);
      for (let x = 0; x < BRICK_COLS; x++) {
        const value = board[idx(x, y)] ?? 0;
        if (value !== 0) out[idx(x, row)] = value;
      }
    }
    const piece = this.piece;
    if (withPiece && piece) {
      for (const [cx, cy] of piece.cells) {
        const x = this.pieceX + cx;
        const y = this.pieceY + cy;
        if (x < 0 || x >= BRICK_COLS || y < 0 || y >= BRICK_ROWS) continue;
        out[idx(x, this.rowOf(y))] = piece.blink ? CELL_BLINK : CELL_ON;
      }
    }
    return out;
  }

  protected draw(): Uint8Array {
    return this.render(this.board, true);
  }

  /**
   * Превью: следующая фигура по центру клеток 4 × 4 (формулы `newPiece`); специальные фигуры — в левом нижнем углу.
   * На перевёрнутом поле обычная фигура показывается перевёрнутой, как и на поле (`firePreviewChanged`). Фигура, не поместившаяся бы
   * в 4 × 4, обрезается по краю (у каталога донора таких нет).
   */
  protected override drawPreview(): Uint8Array {
    const out = new Uint8Array(PREVIEW_CELLS);
    const piece = this.nextPiece;
    const special = isSuperShape(piece.shape);
    const originX = special ? 0 : PREVIEW_COLS / 2 - Math.floor((piece.maxX - piece.minX + 1) / 2) - piece.minX;
    const originY = special ? 0 : PREVIEW_ROWS / 2 - Math.floor((piece.maxY - piece.minY + 1) / 2) - piece.minY;
    for (const [cx, cy] of piece.cells) {
      const x = originX + cx;
      const y = originY + cy;
      if (x < 0 || x >= PREVIEW_COLS || y < 0 || y >= PREVIEW_ROWS) continue;
      const row = this.variant.inverted && !special ? y : PREVIEW_ROWS - 1 - y;
      out[row * PREVIEW_COLS + x] = piece.blink ? CELL_BLINK : CELL_ON;
    }
    return out;
  }

  // ---------------------------------------------------------------- партия

  protected reset(): void {
    this.board = new Uint8Array(BRICK_CELLS);
    this.piece = null;
    this.pieceX = 0;
    this.pieceY = 0;
    this.fallingFinished = false;
    this.lastFall = 0;
    this.over = false;
    this.lineClock.reset(BRICK_TICK_HZ);
    this.lineLeft = LINE_TIMER_SECONDS - 1;
    this.lineDue = false;
    this.liquidNow = this.variant.family === 'liquid';
    this.acidNow = this.variant.family === 'acid';
    this.throughNow = this.variant.family === 'through';
    this.moveRepeat.reset();
    this.downRepeat.reset();
    // уровень — число стартовых случайных рядов (на первом уровне их нет)
    for (let y = 0; y < this.startLevel - 1; y++) this.writeGarbageRow(y);
    this.nextPiece = this.firstPiece();
    this.spawn();
  }

  /** Случайный ряд донора (`addLinesToBoard`): половина клеток занята, но в ряду всегда есть и дыра, и клетка. */
  private writeGarbageRow(y: number): void {
    const filled: boolean[] = [];
    let hasEmpty = false;
    let hasFull = false;
    for (let x = 0; x < BRICK_COLS; x++) {
      const empty = this.rng.chance(0.5);
      filled.push(!empty);
      if (empty) hasEmpty = true;
      else hasFull = true;
    }
    if (!hasEmpty || !hasFull) filled[this.rng.int(BRICK_COLS)] = !hasFull;
    for (let x = 0; x < BRICK_COLS; x++) this.board[idx(x, y)] = filled[x] ? CELL_ON : 0;
  }

  protected firstPiece(): Piece { return randomPiece(this.rng, this.variant.pool); }
  protected rotatedPiece(piece: Piece): Piece { return this.variant.morph ? (this.variant.pool === 'pentix' ? nextShape(piece) : nextTetromino(piece)) : rotatePiece(piece, 1); }

  /** Следующая фигура по правилам типа (`setPieceFromType`). */
  protected pickNext(): Piece {
    const v = this.variant;
    if (v.family !== 'plain' && this.rng.int(SPECIAL_CHANCE) === 0) return withBlink(randomPiece(this.rng, v.pool));
    if (v.supers.length === 0) return randomPiece(this.rng, v.pool);
    return randomPieceOrSuper(this.rng, v.pool, v.supers);
  }

  /** Появление фигуры (`newPiece`): по середине, нижним рядом в верхней строке. Не поместилась — конец игры. */
  protected spawn(): void {
    this.piece = null;
    const next = this.nextPiece;
    if (this.variant.family === 'random') {
      if (next.blink) {
        const kind = this.rng.int(3);
        this.liquidNow = kind === 0;
        this.acidNow = kind === 1;
        this.throughNow = kind === 2;
      } else {
        this.liquidNow = false;
        this.acidNow = false;
        this.throughNow = false;
      }
    }
    if (!this.tryMove(next, MIDDLE_X, BRICK_ROWS - 1 - next.minY)) {
      this.over = true;
      this.gameOver();
      return;
    }
    this.nextPiece = this.pickNext();
  }

  // ---------------------------------------------------------------- такт

  protected update(input: BrickInput): void {
    const keys = this.readKeys(input);
    if (this.variant.lineTimer && this.lineClock.fire()) {
      if (this.lineLeft <= 0) this.lineDue = true;
      else this.lineLeft--;
    }
    // время добавить ряд: добавление занимает весь такт (doRepetitiveWork класса J)
    if (this.lineDue && this.tryAddLine()) {
      this.lineLeft = LINE_TIMER_SECONDS;
      this.lineDue = false;
      return;
    }
    const period = this.fallTicks();
    if (this.tick - this.lastFall >= period) {
      // Preserve sub-tick time: rounding every period would accumulate drift, especially at speed 10.
      // A cutscene skips elapsed drops instead of replaying a burst on the next frames.
      this.lastFall = this.tick - ((this.tick - this.lastFall) % period);
      if (this.fallingFinished) {
        this.fallingFinished = false;
        this.spawn();
      } else if (!keys.down && !keys.drop) {
        this.oneLineDown();
      }
    }
    if (this.piece && !this.fallingFinished && !this.busy) this.applyKeys(keys);
  }

  /**
   * Кнопки. Поворот — `rotate` и `up`, мягкое падение — `down`, бросок — `fire`. На перевёрнутом поле `up` и `down` меняются местами,
   * как в `Game.keyPressed` донора: фигуры падают вверх, и вдоль падения теперь «вверх». Автоповтор опрашивается каждый такт.
   */
  private readKeys(input: BrickInput): Keys {
    const inverted = this.variant.inverted;
    const soft: BrickAction = inverted ? 'up' : 'down';
    const alt: BrickAction = inverted ? 'down' : 'up';
    const turnMain = input.pressed.has('rotate');
    const turnAlt = input.pressed.has(alt);
    const left = this.moveRepeat.fire('left', input);
    const right = this.moveRepeat.fire('right', input);
    return {
      turn: turnMain || turnAlt,
      left,
      right,
      down: this.downRepeat.fire(soft, input),
      drop: input.pressed.has('fire'),
    };
  }

  /** Обработка кнопок в порядке донора: поворот, влево, вправо, вниз, бросок. После посадки или сценки остальное пропускается. */
  private applyKeys(keys: Keys): void {
    const alive = (): boolean => this.piece !== null && !this.fallingFinished && !this.busy;
    if (keys.turn) this.turn();
    if (alive() && keys.left) this.moveSideways(-1);
    if (alive() && keys.right) this.moveSideways(1);
    if (alive() && keys.down) {
      this.oneLineDown();
      this.lastFall = this.tick;
    }
    if (alive() && keys.drop) this.dropDown();
  }

  private moveSideways(dx: number): void {
    const piece = this.piece;
    if (!piece) return;
    const before = this.pieceX;
    // у стенки tryMove «успешно» возвращает фигуру на место (сдвиг назад в поле) — звук только если фигура сдвинулась
    if (this.tryMove(piece, before + dx, this.pieceY) && this.pieceX !== before) this.emit({ type: 'move' });
  }

  private turn(): void {
    const piece = this.piece;
    if (!piece) return;
    if (piece.shape === SUPER_GUN) this.shoot(piece);
    else if (piece.shape === SUPER_MUD_GUN) this.mudShoot(piece);
    else if (!isSuperShape(piece.shape)) {
      const turned = this.rotatedPiece(piece);
      const changed = turned.shape !== piece.shape || turned.angle !== piece.angle;
      if (this.tryMove(turned, this.pieceX, this.pieceY) && changed) this.emit({ type: 'rotate' });
    }
    // суперточка и супербомба на поворот не отзываются
  }

  // ---------------------------------------------------------------- движение и столкновения

  private hits(piece: Piece, x: number, y: number): boolean {
    for (const [cx, cy] of piece.cells) if (this.cellAt(x + cx, y + cy) !== 0) return true;
    return false;
  }

  /**
   * Столкновение «проходящей» фигуры (`specialCheckCollision`): клетка может войти в занятую клетку, если ниже в столбце есть пустая
   * (клетки выше поля считаются пустыми). Столкновение, если хоть у одной клетки фигуры пустоты ниже нет.
   */
  private phasingHits(piece: Piece, x: number, y: number): boolean {
    for (const [cx, cy] of piece.cells) {
      let free = false;
      for (let by = y + cy; by >= 0; by--) {
        if (this.cellAt(x + cx, by) === 0) {
          free = true;
          break;
        }
      }
      if (!free) return true;
    }
    return false;
  }

  /** Есть ли в рядах, где сейчас стоит фигура, полный ряд (с учётом самой фигуры): тогда «проходящая» фигура останавливается (`checkForFullLines`). */
  private standsOnFullRow(): boolean {
    const piece = this.piece;
    if (!piece) return false;
    for (let y = this.pieceY + piece.minY; y <= this.pieceY + piece.maxY; y++) {
      if (y >= BRICK_ROWS) break;
      if (y < 0) continue;
      let full = true;
      for (let x = 0; x < BRICK_COLS && full; x++) {
        const covered = piece.cells.some(([cx, cy]) => this.pieceX + cx === x && this.pieceY + cy === y);
        if (this.cellAt(x, y) === 0 && !covered) full = false;
      }
      if (full) return true;
    }
    return false;
  }

  private isPhasing(piece: Piece): boolean {
    return piece.shape === SUPER_POINT || (!isSuperShape(piece.shape) && this.throughNow && piece.blink);
  }

  /**
   * Попытка поставить фигуру в (x, y) (`tryMove`). Если фигура вылезает за боковую стенку, её сдвигают обратно в поле (так работает и
   * поворот у стенки, и «сдвиг» в стенку — это тот же успех без движения). Потолок не проверяется: фигуры появляются выше экрана.
   */
  protected tryMove(next: Piece, newX: number, newY: number): boolean {
    let x = newX;
    while (x + next.minX < 0 || x + next.maxX >= BRICK_COLS) x = x + next.minX < 0 ? x + 1 : x - 1;
    if (newY + next.minY < 0) return false;
    if (this.hits(next, x, newY)) {
      if (!this.isPhasing(next)) return false;
      if (this.standsOnFullRow() || this.phasingHits(next, x, newY)) return false;
    }
    this.piece = next;
    this.pieceX = x;
    this.pieceY = newY;
    return true;
  }

  private oneLineDown(): void {
    const piece = this.piece;
    if (!piece) return;
    if (!this.tryMove(piece, this.pieceX, this.pieceY - 1)) this.pieceDropped();
  }

  /** Бросок (`dropDown`): вниз до упора, затем посадка. */
  private dropDown(): void {
    this.emit({ type: 'drop' });
    for (;;) {
      const piece = this.piece;
      if (!piece || !this.tryMove(piece, this.pieceX, this.pieceY - 1)) break;
    }
    this.pieceDropped();
  }

  // ---------------------------------------------------------------- посадка

  /** Сели: спецфигуры (`pieceDropped`), обычные клетки, рассыпающиеся и кислотные, затем ряды, проверка конца и сдвиг поля (M). */
  protected pieceDropped(): void {
    this.fallingFinished = true;
    const piece = this.piece;
    if (!piece) return;
    const x = this.pieceX;
    const y = this.pieceY;
    this.emit({ type: 'lock' });
    if (piece.shape === SUPER_GUN || piece.shape === SUPER_MUD_GUN) {
      this.piece = null;
      this.finishDrop();
      return;
    }
    if (piece.shape === SUPER_BOMB) {
      // взрыв вокруг (x + 1, y): на донорском (curX + 1, curY) — x сдвинут к центру бомбы, y нет
      this.emit({ type: 'explode' });
      this.animateKaboom(x + 1, this.rowOf(y), () => {
        this.blast(x + 1, y);
        this.piece = null;
        this.finishDrop();
      });
      return;
    }
    const afterPlacing = (): void => {
      this.clearLines(x, () => {
        // фигура торчит выше поля — конец игры (проверка после рядов, как у донора)
        if (y + piece.maxY >= BRICK_ROWS) {
          this.over = true;
          this.gameOver();
          return;
        }
        this.finishDrop();
      });
    };
    if (piece.shape !== SUPER_POINT && piece.blink && (this.liquidNow || this.acidNow)) {
      this.flowDown(piece, x, y, this.acidNow, afterPlacing);
      return;
    }
    this.stamp(piece, x, y);
    this.piece = null;
    afterPlacing();
  }

  /** После посадки: в классах M, N, O, P всё поле сдвигается на столбец вправо по кругу (`boardHorizontalShift`). */
  private finishDrop(): void {
    if (this.over || !this.variant.shift) return;
    const out = new Uint8Array(BRICK_CELLS);
    for (let y = 0; y < BRICK_ROWS; y++) {
      for (let x = 0; x < BRICK_COLS; x++) out[idx((x + 1) % BRICK_COLS, y)] = this.board[idx(x, y)] ?? 0;
    }
    this.board = out;
  }

  /** Клетки фигуры в поле, за исключением тех, что выше экрана. */
  private stamp(piece: Piece, x: number, y: number): void {
    for (const [cx, cy] of piece.cells) {
      const bx = x + cx;
      const by = y + cy;
      if (bx >= 0 && bx < BRICK_COLS && by >= 0 && by < BRICK_ROWS) this.board[idx(bx, by)] = CELL_ON;
    }
  }

  /** Взрыв стирает квадрат `BLAST_SIZE` × `BLAST_SIZE` (5 × 5; эпицентр сдвигается внутрь поля, как в `Game.kaboom`). */
  private blast(cx: number, cy: number): void {
    const x = clamp(cx, BLAST_RADIUS, BRICK_COLS - 1 - BLAST_RADIUS);
    const y = clamp(cy, BLAST_RADIUS, BRICK_ROWS - 1 - BLAST_RADIUS);
    for (let dy = -BLAST_RADIUS; dy <= BLAST_RADIUS; dy++) {
      for (let dx = -BLAST_RADIUS; dx <= BLAST_RADIUS; dx++) this.board[idx(x + dx, y + dy)] = 0;
    }
  }

  /**
   * Рассыпающаяся (`flowDown`, обычная) и кислотная (`isAcid`) фигура. Клетки идут по одной, снизу вверх и слева направо, и падают
   * по своему столбцу на 60 мс на клетку. Рассыпающаяся клетка ложится на дно столбца; кислотная клетка, упёршись в препятствие,
   * прожигает его и исчезает вместе с ним (на самом дне — остаётся). Ход считается заранее и показывается кадрами накладки.
   */
  private flowDown(piece: Piece, x: number, y: number, acid: boolean, done: () => void): void {
    const work = this.board.slice();
    const frames: Uint8Array[] = [];
    const cells = piece.cells
      .map(([cx, cy]) => [x + cx, y + cy] as const)
      .filter(([bx, by]) => bx >= 0 && bx < BRICK_COLS && by >= 0 && by < BRICK_ROWS)
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [bx, by] of cells) work[idx(bx, by)] = CELL_BLINK;
    const snapshot = (): void => {
      frames.push(this.render(work, false));
    };
    for (const [bx, startY] of cells) {
      let by = startY;
      while (by > 0 && work[idx(bx, by - 1)] === 0) {
        work[idx(bx, by - 1)] = CELL_BLINK;
        work[idx(bx, by)] = 0;
        by--;
        snapshot();
      }
      if (acid && by > 0) {
        // кислота упёрлась в препятствие: прожигает клетку под собой и исчезает
        work[idx(bx, by - 1)] = CELL_BLINK;
        work[idx(bx, by)] = 0;
        snapshot();
        work[idx(bx, by - 1)] = 0;
      } else {
        work[idx(bx, by)] = CELL_ON;
      }
    }
    this.piece = null;
    const finish = (): void => {
      this.board = work;
      done();
    };
    if (frames.length === 0) {
      finish();
      return;
    }
    this.cutscene(
      frames.length * FLOW_STEP_TICKS,
      (elapsed) => {
        this.overlay = frames[Math.min(frames.length - 1, Math.floor(elapsed / FLOW_STEP_TICKS))] ?? null;
      },
      finish,
    );
  }

  // ---------------------------------------------------------------- ряды, очки, уровень

  private rowFullAt(y: number): boolean {
    for (let x = 0; x < BRICK_COLS; x++) if (this.cellAt(x, y) === 0) return false;
    return true;
  }

  /** Полные ряды (y снизу вверх); верхняя строка не проверяется — как в `removeFullLines` (`y < boardHeight - 1`). */
  protected fullRows(): number[] {
    const rows: number[] = [];
    for (let y = 0; y < BRICK_ROWS - 1; y++) if (this.rowFullAt(y)) rows.push(y);
    return rows;
  }

  /**
   * Снятие полных рядов (`removeFullLines`): ряды снимаются по одному снизу вверх; очки растут 1, 2, 4, 8 за ряд с первого по четвёртый;
   * ряд стирается от столбца фигуры в обе стороны (`animatedClearLine`), затем всё выше опускается на клетку.
   */
  private clearLines(anchorX: number, done: () => void): void {
    let removed = 0;
    const next = (): void => {
      const rows = this.fullRows();
      const y = rows[0];
      if (y === undefined) {
        done();
        return;
      }
      removed++;
      if (removed === 1) this.emit({ type: 'lines', count: rows.length, rows: rows.map((r) => this.rowOf(r)) });
      this.addPoints(this.linePoints(removed));
      this.eraseRow(y, anchorX, () => {
        this.dropRowsAbove(y);
        next();
      });
    };
    next();
  }

  /** Анимация стирания ряда: от столбца `anchorX` в обе стороны по клетке за шаг (`animatedClearLine`). */
  private eraseRow(y: number, anchorX: number, done: () => void): void {
    const work = this.board.slice();
    const steps = Math.max(anchorX, BRICK_COLS - anchorX);
    const frames: Uint8Array[] = [];
    for (let i = 0; i < steps; i++) {
      const left = anchorX - 1 - i;
      const right = anchorX + i;
      if (left >= 0) work[idx(left, y)] = 0;
      if (right < BRICK_COLS) work[idx(right, y)] = 0;
      frames.push(this.render(work, true));
    }
    this.cutscene(
      steps * CLEAR_STEP_TICKS,
      (elapsed) => {
        this.overlay = frames[Math.min(frames.length - 1, Math.floor(elapsed / CLEAR_STEP_TICKS))] ?? null;
      },
      done,
    );
  }

  /** Убрать ряд y: всё выше опускается на клетку, сверху появляется пустой ряд. */
  private dropRowsAbove(y: number): void {
    this.board.copyWithin(idx(0, y), idx(0, y + 1), BRICK_CELLS);
    this.board.fill(0, idx(0, BRICK_ROWS - 1), BRICK_CELLS);
  }

  protected linePoints(removed: number): number { return removed <= 4 ? (LINE_POINTS[removed] ?? 1) : 1; }

  /** B0202: carry into the thousands digit raises speed; maximum speed stays at 10. */
  private addPoints(points: number): void {
    const before = Math.floor(this.score / POINTS_PER_SPEED);
    this.addScore(points);
    const steps = Math.floor(this.score / POINTS_PER_SPEED) - before;
    if (steps <= 0 || this.speed === MAX_SPEED) return;
    this.setSpeed(Math.min(MAX_SPEED, this.speed + steps));
    this.emit({ type: 'levelUp', speed: this.speed });
  }

  /**
   * Добавить ряд снизу (`addLines` + `tryAddLine`): всё поднимается на клетку, верхние два ряда теряются, снизу — случайный ряд. Не делается,
   * если в предпоследней сверху строке есть клетки или падающая фигура упёрлась бы в потолок; фигура поднимается вместе с полем.
   */
  protected tryAddLine(): boolean {
    const piece = this.piece;
    if (piece && (this.pieceY + 1 + piece.maxY >= BRICK_ROWS || this.pieceY + 1 + piece.minY < 0)) return false;
    for (let x = 0; x < BRICK_COLS; x++) if (this.cellAt(x, BRICK_ROWS - 2) !== 0) return false;
    // у донора поле включает и саму фигуру: обычная (не мигающая) фигура на этом ряду тоже мешает
    if (piece && !piece.blink && piece.cells.some(([, cy]) => this.pieceY + cy === BRICK_ROWS - 2)) return false;
    this.board.copyWithin(idx(0, 1), 0, idx(0, BRICK_ROWS - 2));
    this.board.fill(0, idx(0, BRICK_ROWS - 1), BRICK_CELLS);
    this.writeGarbageRow(0);
    if (piece) this.pieceY++;
    return true;
  }

  // ---------------------------------------------------------------- пушки

  /** Выстрел суперпушки (`shoot`): убирает ближайшую клетку под пушкой. */
  private shoot(piece: Piece): void {
    this.emit({ type: 'shot' });
    const y = this.pieceY + piece.minY;
    if (y <= 0 || y > BRICK_ROWS) return;
    for (let i = y - 1; i >= 0; i--) {
      if (this.cellAt(this.pieceX, i) !== 0) {
        this.board[idx(this.pieceX, i)] = 0;
        this.emit({ type: 'hit' });
        break;
      }
    }
  }

  /**
   * Выстрел грязевой пушки (`mudShoot`): над ближайшим препятствием появляется клетка, а если препятствий нет — на дне. После выстрела
   * проверяются ряды. Допущение: клетку под самой пушкой не ставим (у донора место занято телом пушки); сама пушка в полные ряды не входит.
   */
  private mudShoot(piece: Piece): void {
    this.emit({ type: 'shot' });
    const y = this.pieceY + piece.minY;
    const x = this.pieceX;
    if (y <= 0 || y > BRICK_ROWS) return;
    for (let i = y - 1; i >= 0; i--) {
      if (this.cellAt(x, i) !== 0) {
        if (i + 1 < y && this.cellAt(x, i + 1) === 0) this.board[idx(x, i + 1)] = CELL_ON;
        break;
      }
      if (i === 0) this.board[idx(x, 0)] = CELL_ON;
    }
    this.clearLines(x, () => {
      // пушка продолжает падать
    });
  }
}
