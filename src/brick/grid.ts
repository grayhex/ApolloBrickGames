/**
 * Сеточные помощники: индексы матрицы 10 × 20, спрайты (строки из `#` и `.`), их отрисовка с обрезкой по краям, поворот и отражение.
 * Всё чистое: ничего не знает ни об играх, ни об оболочке.
 */
import { BRICK_CELLS, BRICK_COLS, BRICK_ROWS, CELL_ON } from './types';

/** Индекс клетки в плоском буфере поля. */
export const cellIndex = (x: number, y: number): number => y * BRICK_COLS + x;

export const inField = (x: number, y: number): boolean => x >= 0 && x < BRICK_COLS && y >= 0 && y < BRICK_ROWS;

/** Чистый буфер поля. */
export const emptyField = (): Uint8Array => new Uint8Array(BRICK_CELLS);

/** Спрайт: строки одинаковой длины, `#` — клетка горит, всё остальное — пусто. Верх — первая строка. */
export type Sprite = readonly string[];

export const spriteWidth = (sprite: Sprite): number => sprite.reduce((max, row) => Math.max(max, row.length), 0);
export const spriteHeight = (sprite: Sprite): number => sprite.length;

/** Клетки спрайта `[dx, dy]` в порядке строк. */
export function spriteCells(sprite: Sprite): [number, number][] {
  const cells: [number, number][] = [];
  sprite.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') cells.push([dx, dy]);
  });
  return cells;
}

/** Нарисовать спрайт со смещением (x, y); клетки за пределами поля отбрасываются. Возвращает число нарисованных клеток. */
export function blit(buffer: Uint8Array, sprite: Sprite, x: number, y: number, value: number = CELL_ON): number {
  let drawn = 0;
  sprite.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx] !== '#') continue;
      const cx = x + dx;
      const cy = y + dy;
      if (!inField(cx, cy)) continue;
      buffer[cellIndex(cx, cy)] = value;
      drawn++;
    }
  });
  return drawn;
}

/** Пересекается ли спрайт в позиции (x, y) с горящими клетками буфера или выходит за поле. */
export function spriteHits(buffer: Uint8Array, sprite: Sprite, x: number, y: number): boolean {
  for (const [dx, dy] of spriteCells(sprite)) {
    const cx = x + dx;
    const cy = y + dy;
    if (!inField(cx, cy) || buffer[cellIndex(cx, cy)] !== 0) return true;
  }
  return false;
}

/** Поворот спрайта на 90° по часовой. */
export function rotateSprite(sprite: Sprite): Sprite {
  const width = spriteWidth(sprite);
  const out: string[] = [];
  for (let x = 0; x < width; x++) {
    let line = '';
    for (let y = sprite.length - 1; y >= 0; y--) line += sprite[y]?.[x] === '#' ? '#' : '.';
    out.push(line);
  }
  return out;
}

/** Отражение по горизонтали. */
export function mirrorSprite(sprite: Sprite): Sprite {
  const width = spriteWidth(sprite);
  return sprite.map((row) => {
    let line = '';
    for (let x = width - 1; x >= 0; x--) line += row[x] === '#' ? '#' : '.';
    return line;
  });
}

/** Отражение по вертикали. */
export function flipSprite(sprite: Sprite): Sprite {
  return [...sprite].reverse();
}

/** Строка поля `y` целиком горит? */
export function rowFull(buffer: Uint8Array, y: number): boolean {
  for (let x = 0; x < BRICK_COLS; x++) if (buffer[cellIndex(x, y)] === 0) return false;
  return true;
}

/** Строка поля `y` пуста? */
export function rowEmpty(buffer: Uint8Array, y: number): boolean {
  for (let x = 0; x < BRICK_COLS; x++) if (buffer[cellIndex(x, y)] !== 0) return false;
  return true;
}

/** Убрать строку `y`: всё выше сдвигается вниз, сверху появляется пустая строка. */
export function removeRow(buffer: Uint8Array, y: number): void {
  buffer.copyWithin(BRICK_COLS, 0, y * BRICK_COLS);
  buffer.fill(0, 0, BRICK_COLS);
}

/** Картинка из строк (верх — первая): `#` — горит, `*` — мигает. Размер поля 10 × 20, меньший спрайт кладётся с отступом (x, y). */
export function pictureField(rows: Sprite, x = 0, y = 0): Uint8Array {
  const out = emptyField();
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const ch = row[dx];
      if (ch !== '#' && ch !== '*') continue;
      const cx = x + dx;
      const cy = y + dy;
      if (inField(cx, cy)) out[cellIndex(cx, cy)] = ch === '*' ? 2 : 1;
    }
  });
  return out;
}
