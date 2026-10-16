/**
 * Пространство пушки: игровое поле в донорской системе координат игр с пушкой (`GunGame`, `GameWithGun`).
 * x идёт слева направо, y = 0 — ряд пушки (внизу в обычном виде), y растёт от пушки к стене или фигурам (верх — ряд 19).
 * В строки экрана (0 — верх) поле переводится только при рисовании: в обычном виде строка экрана = 19 - y, в «перевёрнутом»
 * (донорский `drawInvertedBoard`, варианты 9..16 `GunGame`) — y. Вся логика обеих игр с пушкой (`construction`, `shapes`)
 * идёт здесь, поэтому перевёрнутые варианты отличаются от обычных только рисунком и тем, какая из кнопок «вверх/вниз» ускоряет спуск.
 * Здесь нет ни правил, ни пуль, ни пушки — только клетки и операции над рядами и колонками.
 */
import { emptyField } from '../../grid';
import { BRICK_CELLS, BRICK_COLS, BRICK_ROWS } from '../../types';

/** Верхний ряд поля (`boardHeight - 1`). */
export const TOP_ROW = BRICK_ROWS - 1;

/** Строка экрана (0 — верх) для ряда пространства пушки. */
export const screenRow = (y: number, inverted: boolean): number => (inverted ? y : TOP_ROW - y);

/** Перевести буфер пространства пушки в матрицу экрана; возвращает новую копию. */
export function spaceToScreen(space: Uint8Array, inverted: boolean): Uint8Array {
  const out = new Uint8Array(BRICK_CELLS);
  for (let y = 0; y < BRICK_ROWS; y++) {
    out.set(space.subarray(y * BRICK_COLS, (y + 1) * BRICK_COLS), screenRow(y, inverted) * BRICK_COLS);
  }
  return out;
}

/** Диапазон колонок, в которых есть клетки. */
export interface ColumnRange {
  min: number;
  max: number;
}

export class GunSpace {
  /** Клетки: индекс `y * 10 + x`, значения 0 (пусто) и 1 (клетка стены или фигуры). */
  readonly cells: Uint8Array = emptyField();

  /** Клетка (x, y); за пределами поля — 0. */
  get(x: number, y: number): number {
    if (x < 0 || x >= BRICK_COLS || y < 0 || y >= BRICK_ROWS) return 0;
    return this.cells[y * BRICK_COLS + x] ?? 0;
  }

  set(x: number, y: number, value: number): void {
    if (x < 0 || x >= BRICK_COLS || y < 0 || y >= BRICK_ROWS) return;
    this.cells[y * BRICK_COLS + x] = value;
  }

  clear(): void {
    this.cells.fill(0);
  }

  /** Сколько клеток в ряду y. */
  rowCount(y: number): number {
    let count = 0;
    for (let x = 0; x < BRICK_COLS; x++) if (this.get(x, y) !== 0) count++;
    return count;
  }

  rowFull(y: number): boolean {
    return this.rowCount(y) === BRICK_COLS;
  }

  /** Всего клеток на поле. */
  total(): number {
    let count = 0;
    for (const value of this.cells) if (value !== 0) count++;
    return count;
  }

  /** Опустить всё на ряд к пушке (y -> y - 1); верхний ряд освобождается, ряд 0 пропадает (первый шаг `addLinesToBoard` донора). */
  pushTowardGun(): void {
    this.cells.copyWithin(0, BRICK_COLS);
    this.cells.fill(0, TOP_ROW * BRICK_COLS);
  }

  /**
   * Убрать полный ряд y, как `removeFullLines` донора: ряды 0..y-1 поднимаются на один вверх (ряд y затирается рядом y-1 и так далее
   * до ряда 1), ряд 0 остаётся как был. Ряды выше y не трогаются.
   */
  collapseRow(y: number): void {
    if (y <= 0) return;
    this.cells.copyWithin(BRICK_COLS, 0, y * BRICK_COLS);
  }

  /** Сдвиг всего поля по горизонтали на dx клеток с оборачиванием (`boardHorizontalShift` донора). */
  rotateColumns(dx: number): void {
    const shift = ((dx % BRICK_COLS) + BRICK_COLS) % BRICK_COLS;
    if (shift === 0) return;
    const row = new Uint8Array(BRICK_COLS);
    for (let y = 0; y < BRICK_ROWS; y++) {
      const base = y * BRICK_COLS;
      for (let x = 0; x < BRICK_COLS; x++) row[(x + shift) % BRICK_COLS] = this.cells[base + x] ?? 0;
      this.cells.set(row, base);
    }
  }

  /** Колонки, занятые клетками (`null`, если поле пусто). */
  columnRange(): ColumnRange | null {
    let min = BRICK_COLS;
    let max = -1;
    for (let y = 0; y < BRICK_ROWS; y++) {
      for (let x = 0; x < BRICK_COLS; x++) {
        if (this.get(x, y) === 0) continue;
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
    return max < 0 ? null : { min, max };
  }

  /** Сдвиг всего поля на dx колонок без оборачивания; `false` (и ничего не меняется), если клетка вышла бы за край. */
  shiftColumns(dx: number): boolean {
    const range = this.columnRange();
    if (!range || range.min + dx < 0 || range.max + dx >= BRICK_COLS) return false;
    if (dx === 0) return true;
    const row = new Uint8Array(BRICK_COLS);
    for (let y = 0; y < BRICK_ROWS; y++) {
      const base = y * BRICK_COLS;
      row.fill(0);
      for (let x = 0; x < BRICK_COLS; x++) {
        const value = this.cells[base + x] ?? 0;
        if (value !== 0) row[x + dx] = value;
      }
      this.cells.set(row, base);
    }
    return true;
  }
}
