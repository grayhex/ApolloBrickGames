/**
 * Фигуры игры «Стрельба по фигурам» (`shapes`): наборы фигур, расстановка на поле пушки и поиск достроенного прямоугольника.
 * Донора здесь нет: в `GunGame` стена целиком из случайных рядов, фигур он не знает. Фигуры разрушения — семь тетрамино, как в
 * `TetrisShape` донора (Z, S, Line, T, Square, L, MirroredL), по описанию MT1997 («конструкции из фигурок тетриса»).
 * Фигуры достройки — «висячие» столбики разной высоты, у которых верх выровнен по одной строке (допущение, см. `docs/brick/shapes.md`):
 * пуля останавливается под нижней клеткой колонки, так что достройкой до прямоугольника можно довести только такую фигуру.
 */
import { rotateSprite, spriteCells, spriteWidth, type Sprite } from '../../grid';
import type { Rng } from '../../rng';
import { BRICK_COLS, BRICK_ROWS } from '../../types';
import type { GunSpace } from './space';

/** Семь тетрамино (`TetrisShape`: ZShape, SShape, LineShape, TShape, SquareShape, LShape, MirroredLShape). */
export const TETROMINOES: readonly Sprite[] = [
  ['##.', '.##'], // Z
  ['.##', '##.'], // S
  ['####'], // линия
  ['###', '.#.'], // T
  ['##', '##'], // квадрат
  ['..#', '###'], // L
  ['#..', '###'], // зеркальная L
];

/** Случайное тетрамино в случайном повороте. */
export function randomTetromino(rng: Rng): Sprite {
  let sprite = rng.pick(TETROMINOES);
  for (let turns = rng.int(4); turns > 0; turns--) sprite = rotateSprite(sprite);
  return sprite;
}

/** Ширина «висячей» фигуры достройки (колонок) и высота её колонок (клеток): допущение. */
export const HANGING_WIDTH = { min: 2, max: 4 } as const;
export const HANGING_HEIGHT = { min: 1, max: 3 } as const;

/**
 * Случайная «висячая» фигура достройки: 2..4 колонки высотой 1..3, верх у всех на одной строке; не все колонки одной высоты,
 * чтобы фигура не была прямоугольником с самого начала. Её можно достроить до прямоугольника, добавив клетки снизу.
 */
export function randomHanging(rng: Rng): Sprite {
  const width = rng.range(HANGING_WIDTH.min, HANGING_WIDTH.max);
  const heights: number[] = [];
  for (let i = 0; i < width; i++) heights.push(rng.range(HANGING_HEIGHT.min, HANGING_HEIGHT.max));
  if (heights.every((height) => height === heights[0])) {
    const column = rng.int(width);
    heights[column] = heights[column] === HANGING_HEIGHT.min ? HANGING_HEIGHT.min + 1 : HANGING_HEIGHT.min;
  }
  const tall = Math.max(...heights);
  const rows: string[] = [];
  for (let row = 0; row < tall; row++) rows.push(heights.map((height) => (row < height ? '#' : '.')).join(''));
  return rows;
}

/** Ширина спрайта в клетках. */
export const figureWidth = (sprite: Sprite): number => spriteWidth(sprite);

/** Поставить фигуру на поле пушки: левый верхний угол спрайта в (x, topY); строки спрайта идут вниз, к пушке (y уменьшается). */
export function placeFigure(space: GunSpace, sprite: Sprite, x: number, topY: number): void {
  for (const [dx, dy] of spriteCells(sprite)) space.set(x + dx, topY - dy, 1);
}

/**
 * Связная по сторонам группа клеток, в которую входит (x, y), если она — сплошной прямоугольник (число клеток равно площади
 * рамки). Возвращает индексы клеток группы или `null`. Группы разных фигур, соприкоснувшиеся клетками, считаются одной (допущение).
 */
export function findRectangle(space: GunSpace, x: number, y: number): number[] | null {
  if (space.get(x, y) === 0) return null;
  const seen = new Uint8Array(BRICK_COLS * BRICK_ROWS);
  const stack = [y * BRICK_COLS + x];
  seen[stack[0] ?? 0] = 1;
  const group: number[] = [];
  let minX = x;
  let maxX = x;
  let minY = y;
  let maxY = y;
  for (;;) {
    const index = stack.pop();
    if (index === undefined) break;
    group.push(index);
    const cx = index % BRICK_COLS;
    const cy = Math.floor(index / BRICK_COLS);
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    minY = Math.min(minY, cy);
    maxY = Math.max(maxY, cy);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (space.get(nx, ny) === 0) continue;
      const next = ny * BRICK_COLS + nx;
      if (seen[next]) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  return group.length === area ? group : null;
}
