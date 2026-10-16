/**
 * Стена кирпичей игры «Инвейдеры» (игра 5 консоли «168 в 1 танк»): данные и порядок генерации.
 *
 * Правила — донорские (`boards/BricksWall.java`): десять готовых стен по уровням, случайная стена (зеркальная по горизонтали,
 * иногда ещё и по вертикали), круговой сдвиг по горизонтали. Ряды хранятся «снизу вверх», как у донора (ряд 0 — самый нижний,
 * то есть тот, что ближе всех к орудию).
 */
import type { Rng } from '../../rng';

/** Ширина стены равна ширине поля (у всех донорских стен — 10). */
export const WALL_WIDTH = 10;

/**
 * Готовые стены уровней 1..10 (`BricksWall.preloadedBricks`): строки сверху вниз, как в исходнике донора, `#` — кирпич.
 * Индекс массива — уровень минус один.
 */
export const PRELOADED_WALLS: readonly (readonly string[])[] = [
  // 1
  ['.#.#..#.#.', '..#....#..', '.###..###.', '##########', '###.##.###', '.########.', '..######..', '...####...'],
  // 2
  ['##########', '##########', '##########', '.########.', '.########.', '...####...', '...####...'],
  // 3
  ['##########', '.########.', '.###..###.', '##########', '##########', '.###..###.', '.########.', '##########'],
  // 4
  ['.########.', '#.######.#', '##.####.##', '###.##.###', '##.####.##', '#.######.#', '.########.'],
  // 5
  ['##########', '.########.', '..######..', '..######..', '..######..', '.########.', '##########'],
  // 6
  ['##.####.##', '#.##..##.#', '..#.##.#..', '.########.', '####..####', '####..####', '.########.', '..######..'],
  // 7
  ['#..#..#..#', '#.######.#', '#.######.#', '##########', '##########', '#.######.#', '#.######.#', '#..#..#..#'],
  // 8
  ['..######..', '.########.', '##########', '..#.##.#..', '.#..##..#.', '##########', '.########.', '..######..'],
  // 9
  ['##..##..##', '.##.##.##.', '..######..', '##########', '##########', '..######..', '.##.##.##.', '##..##..##'],
  // 10
  ['..######..', '.#####.##.', '##..######', '.##.##....', '.########.', '..######..', '...####...', '....##....'],
];

/** Стена: `cells[ряд * WALL_WIDTH + x]` (ряд 0 — нижний), `count` — сколько кирпичей (и летящий шар) осталось. */
export interface Wall {
  readonly height: number;
  readonly cells: Uint8Array;
  count: number;
}

/** Всё, что нужно генератору от ГСЧ: целое в [0, n). */
export type IntSource = Pick<Rng, 'int'>;

const clampLevel = (level: number): number => Math.min(PRELOADED_WALLS.length, Math.max(1, Math.trunc(level) || 1));

/** Пересчитать кирпичи стены. */
export function countBricks(wall: Wall): number {
  let count = 0;
  for (const cell of wall.cells) if (cell) count++;
  return count;
}

/** Есть ли кирпич в колонке `x` ряда `row` (ряд 0 — нижний); за пределами стены — нет. */
export function hasBrick(wall: Wall, x: number, row: number): boolean {
  if (x < 0 || x >= WALL_WIDTH || row < 0 || row >= wall.height) return false;
  return (wall.cells[row * WALL_WIDTH + x] ?? 0) !== 0;
}

/** Есть ли в ряду хоть один кирпич. */
export function rowHasBrick(wall: Wall, row: number): boolean {
  for (let x = 0; x < WALL_WIDTH; x++) if (hasBrick(wall, x, row)) return true;
  return false;
}

/** Готовая стена уровня 1..10 (`BricksWall.setPreloadedBricks`): верх рисунка — верхний ряд стены. */
export function preloadedWall(level: number): Wall {
  const picture = PRELOADED_WALLS[clampLevel(level) - 1] ?? [];
  const height = picture.length;
  const cells = new Uint8Array(WALL_WIDTH * height);
  for (let row = 0; row < height; row++) {
    const line = picture[height - 1 - row] ?? '';
    for (let x = 0; x < WALL_WIDTH; x++) if (line[x] === '#') cells[row * WALL_WIDTH + x] = 1;
  }
  const wall: Wall = { height, cells, count: 0 };
  wall.count = countBricks(wall);
  return wall;
}

/** Высота случайной стены: `уровень / 2 + 5` с целым делением, как в `BricksWall` донора (5 на 1-м уровне, 10 на 10-м). */
export const generatedHeight = (level: number): number => Math.floor(clampLevel(level) / 2) + 5;

/**
 * Случайная стена (`BricksWall.generateBricks`): с шансом 1 из 3 она ещё и симметрична по вертикали (верхняя половина
 * повторяет нижнюю); иначе левая половина каждого ряда набирается случайно (кирпич с вероятностью 2/3) и отражается вправо.
 * Допущение: если стена вышла пустой (у донора такого не предусмотрено — игра тут же засчитала бы победу), в нижнем ряду
 * ставятся два центральных кирпича.
 */
export function generatedWall(level: number, rng: IntSource): Wall {
  const height = generatedHeight(level);
  const cells = new Uint8Array(WALL_WIDTH * height);
  const half = WALL_WIDTH / 2;
  const verticalSymmetry = rng.int(3) === 0;
  const centerRow = Math.floor(height / 2) + (height % 2 !== 0 ? 1 : 0);
  for (let row = 0; row < height; row++) {
    if (verticalSymmetry && row >= centerRow) {
      const source = (height - 1 - row) * WALL_WIDTH;
      for (let x = 0; x < WALL_WIDTH; x++) cells[row * WALL_WIDTH + x] = cells[source + x] ?? 0;
      continue;
    }
    for (let x = 0; x < half; x++) {
      const brick = rng.int(3) === 0 ? 0 : 1;
      cells[row * WALL_WIDTH + x] = brick;
      cells[row * WALL_WIDTH + (WALL_WIDTH - 1 - x)] = brick;
    }
  }
  const wall: Wall = { height, cells, count: 0 };
  wall.count = countBricks(wall);
  if (wall.count === 0) {
    cells[half - 1] = 1;
    cells[half] = 1;
    wall.count = 2;
  }
  return wall;
}

/** Круговой сдвиг стены по горизонтали (`GameUtils.boardHorizontalShift`): `dx > 0` — вправо, `dx < 0` — влево, по кругу. */
export function shiftWall(wall: Wall, dx: number): void {
  const shift = ((Math.trunc(dx) % WALL_WIDTH) + WALL_WIDTH) % WALL_WIDTH;
  if (shift === 0) return;
  const row = new Uint8Array(WALL_WIDTH);
  for (let r = 0; r < wall.height; r++) {
    const base = r * WALL_WIDTH;
    for (let x = 0; x < WALL_WIDTH; x++) row[(x + shift) % WALL_WIDTH] = wall.cells[base + x] ?? 0;
    wall.cells.set(row, base);
  }
}
