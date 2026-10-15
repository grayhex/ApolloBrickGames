/**
 * Тетромино: форма каждой фигуры в четырёх поворотах.
 * Чистые данные без состояния — ни DOM, ни часов, ни случайности (мешок фигур живёт в game.ts).
 */
export const PIECE_KINDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

export type PieceKind = (typeof PIECE_KINDS)[number];

/** Смещение клетки внутри коробки 4×4: `[dx, dy]`, `dy` растёт вниз. */
export type PieceCell = readonly [number, number];

/** Сторона коробки, в которой задана фигура. */
export const BOX_SIZE = 4;

/** Число поворотов: 0 — как при появлении, 1 — по часовой, 2 — на 180°, 3 — против часовой. */
export const ROTATION_COUNT = 4;

/** Колонка поля, в которой стоит левый край коробки при появлении (4 клетки по центру 10-колоночного поля). */
export const SPAWN_COLUMN = 3;

/** Форма при повороте 0 в стандартной ориентации SRS (коробка 4×4, верх — строка 0). */
const BASE_SHAPES: Record<PieceKind, readonly PieceCell[]> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

/** Сторона квадрата, внутри которого фигура вращается: I — 4×4, остальные (кроме O) — 3×3. */
const PIVOT_SIZE: Record<PieceKind, number> = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };

/** Порядок клеток внутри фигуры: сверху вниз, слева направо (стабильный для тестов и рендера). */
function byRowThenColumn(a: PieceCell, b: PieceCell): number {
  return a[1] - b[1] || a[0] - b[0];
}

/** Поворот на 90° по часовой стрелке внутри квадрата `size × size`: `(x, y) -> (size - 1 - y, x)`. */
function rotateClockwise(cells: readonly PieceCell[], size: number): readonly PieceCell[] {
  return cells.map(([x, y]): PieceCell => [size - 1 - y, x]).sort(byRowThenColumn);
}

function buildRotations(kind: PieceKind): readonly (readonly PieceCell[])[] {
  const base = [...BASE_SHAPES[kind]].sort(byRowThenColumn);
  // Квадрат O выглядит одинаково при любом повороте — не вращаем, чтобы он не «гулял» по коробке.
  if (kind === 'O') return Object.freeze(Array.from({ length: ROTATION_COUNT }, () => Object.freeze(base)));
  const shapes: (readonly PieceCell[])[] = [Object.freeze(base)];
  for (let r = 1; r < ROTATION_COUNT; r++) {
    const previous = shapes[r - 1];
    if (!previous) throw new Error('unreachable: нет предыдущего поворота');
    shapes.push(Object.freeze(rotateClockwise(previous, PIVOT_SIZE[kind])));
  }
  return Object.freeze(shapes);
}

const SHAPES: Record<PieceKind, readonly (readonly PieceCell[])[]> = {
  I: buildRotations('I'),
  O: buildRotations('O'),
  T: buildRotations('T'),
  S: buildRotations('S'),
  Z: buildRotations('Z'),
  J: buildRotations('J'),
  L: buildRotations('L'),
};

/**
 * Клетки фигуры: четыре смещения `[dx, dy]` внутри коробки 4×4.
 * `rotation` — любое целое: берётся по модулю 4 (0..3 по часовой стрелке).
 */
export function cellsOf(kind: PieceKind, rotation: number): readonly PieceCell[] {
  const index = ((Math.trunc(rotation) % ROTATION_COUNT) + ROTATION_COUNT) % ROTATION_COUNT;
  const cells = SHAPES[kind][index];
  if (!cells) throw new Error(`unreachable: нет формы ${kind}/${index}`);
  return cells;
}

/**
 * Строка коробки, на которой стоит `y` при появлении: верхняя клетка фигуры попадает на строку 0 поля
 * (у I верхняя клетка лежит на строке 1 коробки, поэтому `y = -1`; у остальных `y = 0`).
 */
export function spawnRowOf(kind: PieceKind): number {
  return 0 - Math.min(...cellsOf(kind, 0).map(([, dy]) => dy)); // «0 -», а не унарный минус: без -0
}

/** Значение клетки в поле: 1..7 по порядку `PIECE_KINDS` (0 — пусто). */
export function pieceCellValue(kind: PieceKind): number {
  return PIECE_KINDS.indexOf(kind) + 1;
}

/** Обратное к `pieceCellValue`: вид фигуры по значению клетки или `null` для пустой/неверной клетки. */
export function pieceKindOfValue(value: number): PieceKind | null {
  return PIECE_KINDS[value - 1] ?? null;
}
