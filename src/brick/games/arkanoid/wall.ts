/**
 * Стена кирпичей «Арканоида» — порт `boards/BricksWall.java` донора: десять готовых стен по уровням
 * (`preloadedBricks`), случайная стена (`generateBricks`), разрушение кирпича (`breakBrick`) и круговой сдвиг (`shift`).
 *
 * Как и у донора, ряды стены нумеруются снизу вверх (ряд 0 — нижний), а в таблице готовых стен первая строка — верхний ряд.
 * Перевод в систему поля (строка 0 — верх) делает игра, не стена.
 */
import type { Rng } from '../../rng';

/** Ширина любой стены — вся ширина поля. */
export const WALL_WIDTH = 10;

/**
 * Готовые стены по уровням 1..10 (индекс = уровень - 1); `#` — кирпич. Первая строка — верхний ряд стены на экране.
 * Данные перенесены из `BricksWall.preloadedBricks` донора без изменений.
 */
export const PRELOADED_WALLS: readonly (readonly string[])[] = [
  // уровень 1: 8 рядов, 48 кирпичей
  ['.#.#..#.#.', '..#....#..', '.###..###.', '##########', '###.##.###', '.########.', '..######..', '...####...'],
  // уровень 2: 7 рядов, 54 кирпича
  ['##########', '##########', '##########', '.########.', '.########.', '...####...', '...####...'],
  // уровень 3: 8 рядов, 68 кирпичей
  ['##########', '.########.', '.###..###.', '##########', '##########', '.###..###.', '.########.', '##########'],
  // уровень 4: 7 рядов, 56 кирпичей
  ['.########.', '#.######.#', '##.####.##', '###.##.###', '##.####.##', '#.######.#', '.########.'],
  // уровень 5: 7 рядов, 54 кирпича
  ['##########', '.########.', '..######..', '..######..', '..######..', '.########.', '##########'],
  // уровень 6: 8 рядов, 56 кирпичей
  ['##.####.##', '#.##..##.#', '..#.##.#..', '.########.', '####..####', '####..####', '.########.', '..######..'],
  // уровень 7: 8 рядов, 60 кирпичей
  ['#..#..#..#', '#.######.#', '#.######.#', '##########', '##########', '#.######.#', '#.######.#', '#..#..#..#'],
  // уровень 8: 8 рядов, 56 кирпичей
  ['..######..', '.########.', '##########', '..#.##.#..', '.#..##..#.', '##########', '.########.', '..######..'],
  // уровень 9: 8 рядов, 56 кирпичей
  ['##..##..##', '.##.##.##.', '..######..', '##########', '##########', '..######..', '.##.##.##.', '##..##..##'],
  // уровень 10: 8 рядов, 45 кирпичей
  ['..######..', '.#####.##.', '##..######', '.##.##....', '.########.', '..######..', '...####...', '....##....'],
];

/** Высота случайной стены уровня: `level / 2 + 5` (целочисленное деление, как в коде донора; его комментарий «6..9» расходится с кодом). */
export const generatedWallHeight = (level: number): number => Math.floor(level / 2) + 5;

const clampLevel = (level: number): number => Math.min(PRELOADED_WALLS.length, Math.max(1, Math.trunc(level) || 1));

export class BricksWall {
  readonly width = WALL_WIDTH;
  readonly height: number;
  /** Клетки: индекс `y * width + x`, `y` = 0 — нижний ряд; 1 — кирпич. */
  private cells: Uint8Array;
  private left = 0;

  private constructor(height: number) {
    this.height = height;
    this.cells = new Uint8Array(WALL_WIDTH * height);
  }

  /** Готовая стена уровня 1..10 (`setPreloadedBricks`: ряды заполняются снизу вверх, таблица читается с последней строки). */
  static preloaded(level: number): BricksWall {
    const rows = PRELOADED_WALLS[clampLevel(level) - 1] ?? [];
    const wall = new BricksWall(rows.length);
    for (let y = 0; y < wall.height; y++) {
      const row = rows[wall.height - 1 - y] ?? '';
      for (let x = 0; x < WALL_WIDTH; x++) {
        if (row[x] === '#') wall.setBrick(x, y);
      }
    }
    return wall;
  }

  /**
   * Случайная стена (`generateBricks`): левая половина ряда случайна (кирпич с вероятностью 2/3), правая — её зеркало;
   * с вероятностью 1/3 стена ещё и симметрична сверху вниз (верхние ряды копируют нижние).
   */
  static generated(level: number, rng: Rng): BricksWall {
    const wall = new BricksWall(generatedWallHeight(clampLevel(level)));
    const half = WALL_WIDTH / 2;
    const verticalSymmetry = rng.int(3) === 0;
    const center = Math.floor(wall.height / 2) + (wall.height % 2 !== 0 ? 1 : 0);
    for (let y = 0; y < wall.height; y++) {
      if (verticalSymmetry && y >= center) {
        const source = wall.height - 1 - y;
        for (let x = 0; x < WALL_WIDTH; x++) {
          if (wall.has(x, source)) wall.setBrick(x, y);
        }
      } else {
        for (let x = 0; x < half; x++) {
          if (rng.int(3) === 0) continue; // пусто
          wall.setBrick(x, y);
          wall.setBrick(WALL_WIDTH - 1 - x, y);
        }
      }
    }
    return wall;
  }

  /** Сколько кирпичей осталось (`getBricksCount`). */
  get remaining(): number {
    return this.left;
  }

  /** Есть ли кирпич в клетке стены `(x, y)` (вне стены — нет). */
  has(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.cells[y * this.width + x] !== 0;
  }

  /** Разбить кирпич (`breakBrick`): `true`, если он там был. */
  breakBrick(x: number, y: number): boolean {
    if (!this.has(x, y)) return false;
    this.cells[y * this.width + x] = 0;
    this.left--;
    return true;
  }

  /** Круговой сдвиг стены по горизонтали на `dx` клеток (вправо при `dx > 0`): кирпичи, ушедшие за край, появляются с другой стороны. */
  shift(dx: number): void {
    const shift = ((Math.trunc(dx) % this.width) + this.width) % this.width;
    if (shift === 0) return;
    const next = new Uint8Array(this.cells.length);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        next[y * this.width + ((x + shift) % this.width)] = this.cells[y * this.width + x] ?? 0;
      }
    }
    this.cells = next;
  }

  private setBrick(x: number, y: number): void {
    if (this.cells[y * this.width + x] !== 0) return;
    this.cells[y * this.width + x] = 1;
    this.left++;
  }
}
