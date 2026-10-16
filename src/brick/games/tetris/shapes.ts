/**
 * Каталог фигур тетриса и Pentix: трёх-, четырёх- и пятиклеточные фигуры и четыре специальные (`shapes/TetrisShape.java` донора).
 *
 * Координаты — как у донора: ось y направлена ВВЕРХ (у = 0 — низ поля), ось x — вправо. Фигура — набор смещений от точки привязки (x, y)
 * на поле. Поворот на 90° по часовой — (x, y) -> (y, -x); после поворота фигуры «выравниваются» (`TetrisShape.setShape`):
 * сдвигаются на клетку вправо и/или вверх, чтобы не уезжать влево и вниз от точки привязки. Порядок фигур в каталоге
 * (`FIGURES`) — порядок `Figures` донора: по нему работает смена фигуры вместо поворота и отсчитываются диапазоны.
 */
import type { Rng } from '../../rng';

/** Смещение клетки фигуры от точки привязки: [x, y], y — вверх. */
export type Coord = readonly [number, number];

export const SHAPE_NONE = 0;
export const FIRST_TROMINO = 1;
export const FIRST_TETROMINO = 3;
export const FIRST_PENTOMINO = 10;
export const FIRST_SUPER = 27;
/** Прямая палка (тетрамино I): не сдвигается по x при выравнивании. */
export const SHAPE_LINE = 5;
/** Квадрат (тетрамино O) и пентамино X при повороте не меняются. */
export const SHAPE_SQUARE = 7;
export const SHAPE_PENTO_X = 22;
export const SUPER_POINT = 27;
export const SUPER_GUN = 28;
export const SUPER_MUD_GUN = 29;
export const SUPER_BOMB = 30;
/** Сколько всего записей в каталоге (вместе с пустой фигурой 0). */
export const FIGURE_COUNT = 31;

interface Figure {
  readonly name: string;
  readonly coords: readonly Coord[];
}

/** Каталог: индекс = порядковый номер `Figures` донора. */
export const FIGURES: readonly Figure[] = [
  { name: 'NoShape', coords: [[0, 0]] },
  // трёхклеточные (диагональная линия и уголок)
  { name: 'TroLine', coords: [[-1, -1], [0, 0], [1, 1]] },
  { name: 'Corner', coords: [[0, 1], [0, 0], [1, 0]] },
  // четырёхклеточные
  { name: 'Z', coords: [[-1, 1], [-1, 0], [0, 0], [0, -1]] },
  { name: 'S', coords: [[-1, -1], [-1, 0], [0, 0], [0, 1]] },
  { name: 'Line', coords: [[0, -1], [0, 0], [0, 1], [0, 2]] },
  { name: 'T', coords: [[-1, 0], [0, 0], [1, 0], [0, 1]] },
  { name: 'Square', coords: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'L', coords: [[0, -1], [1, 0], [1, -1], [1, 1]] },
  { name: 'MirroredL', coords: [[0, -1], [1, -1], [0, 0], [0, 1]] },
  // пятиклеточные
  { name: 'PentoP', coords: [[0, -1], [0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'MirroredPentoP', coords: [[1, -1], [0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'PentoQ', coords: [[1, -1], [1, 0], [1, 1], [1, 2], [0, 2]] },
  { name: 'MirroredPentoQ', coords: [[0, -1], [0, 0], [0, 1], [0, 2], [1, 2]] },
  { name: 'PentoR', coords: [[1, -1], [1, 0], [1, 1], [0, 0], [2, 1]] },
  { name: 'MirroredPentoR', coords: [[1, -1], [1, 0], [1, 1], [2, 0], [0, 1]] },
  { name: 'PentoS', coords: [[-2, 0], [-1, 0], [0, 0], [0, 1], [1, 1]] },
  { name: 'MirroredPentoS', coords: [[-1, 1], [0, 1], [0, 0], [1, 0], [2, 0]] },
  { name: 'PentoT', coords: [[0, -1], [0, 0], [0, 1], [-1, 1], [1, 1]] },
  { name: 'PentoU', coords: [[-1, 0], [-1, 1], [0, 0], [1, 0], [1, 1]] },
  { name: 'PentoV', coords: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]] },
  { name: 'PentoW', coords: [[-1, 1], [-1, 0], [0, 0], [0, -1], [1, -1]] },
  { name: 'PentoX', coords: [[-1, 0], [0, 0], [1, 0], [0, 1], [0, -1]] },
  { name: 'PentoY', coords: [[-2, 0], [-1, 0], [0, 0], [0, 1], [1, 0]] },
  { name: 'MirroredPentoY', coords: [[-1, 0], [0, 1], [0, 0], [1, 0], [2, 0]] },
  { name: 'PentoZ', coords: [[-1, 1], [0, 1], [0, 0], [0, -1], [1, -1]] },
  { name: 'MirroredPentoZ', coords: [[-1, -1], [0, -1], [0, 0], [0, 1], [1, 1]] },
  // специальные
  { name: 'SuperPoint', coords: [[0, 0]] },
  { name: 'SuperGun', coords: [[0, 0], [0, 1]] },
  { name: 'SuperMudGun', coords: [[0, 0], [0, 1], [0, 2]] },
  { name: 'SuperBomb', coords: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]] },
];

/** Случайные фигуры тетриса — семь тетрамино (`getRandomTetraminoes`), Pentix — все 26 несущих (`getRandomShapeInstance`). */
export const TETRIS_POOL: readonly number[] = [3, 4, 5, 6, 7, 8, 9];
export const PENTIX_POOL: readonly number[] = Array.from({ length: FIRST_SUPER - FIRST_TROMINO }, (_, i) => FIRST_TROMINO + i);

export type PiecePool = 'tetris' | 'pentix';

/** Фигура на поле: номер из каталога, угол (0..3 — 0°, 90°, 180°, 270° по часовой), мигает ли и клетки после поворота и выравнивания. */
export interface Piece {
  readonly shape: number;
  readonly angle: number;
  /** Мигающая фигура (`Cell.Blink` донора): специальная или «особая» (рассыпающаяся, кислотная, сквозная). */
  readonly blink: boolean;
  readonly cells: readonly Coord[];
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

interface Pose {
  readonly cells: readonly Coord[];
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

const poseCache = new Map<number, Pose>();

const wrapAngle = (angle: number): number => ((angle % 4) + 4) % 4;

export const isSuperShape = (shape: number): boolean => shape >= FIRST_SUPER;

/** Имя фигуры из каталога (для тестов и отладки). */
export const figureName = (shape: number): string => FIGURES[shape]?.name ?? 'NoShape';

function computePose(shape: number, angle: number): Pose {
  const base = FIGURES[shape]?.coords ?? FIGURES[SHAPE_NONE]?.coords ?? [];
  let cells: [number, number][] = base.map(([x, y]) => {
    switch (angle) {
      // «0 - v», а не «-v»: иначе при v = 0 получился бы -0
      case 1:
        return [y, 0 - x];
      case 2:
        return [0 - x, 0 - y];
      case 3:
        return [0 - y, x];
      default:
        return [x, y];
    }
  });
  const bounds = (): { minX: number; maxX: number; minY: number; maxY: number } => ({
    minX: Math.min(...cells.map(([x]) => x)),
    maxX: Math.max(...cells.map(([x]) => x)),
    minY: Math.min(...cells.map(([, y]) => y)),
    maxY: Math.max(...cells.map(([, y]) => y)),
  });
  if (!isSuperShape(shape) && shape !== SHAPE_NONE) {
    // выравнивание после поворота, как у `TetrisShape.setShape`
    let b = bounds();
    if (shape !== SHAPE_LINE && (b.minX < -1 || b.maxX <= 0)) cells = cells.map(([x, y]) => [x + 1, y]);
    b = bounds();
    if (b.minY < 0 || b.maxY <= 0) cells = cells.map(([x, y]) => [x, y + 1]);
  }
  return { cells, ...bounds() };
}

/** Фигура в заданном положении (клетки считаются один раз и кэшируются). */
export function makePiece(shape: number, angle = 0, blink = false): Piece {
  const a = wrapAngle(angle);
  const key = shape * 4 + a;
  let pose = poseCache.get(key);
  if (!pose) {
    pose = computePose(shape, a);
    poseCache.set(key, pose);
  }
  return { shape, angle: a, blink, ...pose };
}

/** Та же фигура, но мигающая (`setFill(Blink)`). */
export const withBlink = (piece: Piece): Piece => (piece.blink ? piece : makePiece(piece.shape, piece.angle, true));

/** Поворот на 90° по часовой (+1) или против (-1); квадрат, пентамино X и специальные фигуры не вращаются (`rotateRight/rotateLeft`). */
export function rotatePiece(piece: Piece, direction: 1 | -1 = 1): Piece {
  if (piece.shape === SHAPE_SQUARE || piece.shape === SHAPE_PENTO_X || isSuperShape(piece.shape)) return piece;
  return makePiece(piece.shape, piece.angle + direction, piece.blink);
}

/** Следующее тетрамино по кругу Z, S, I, T, O, L, J; после последнего — первое и угол на 90° дальше (`getNextTetraminoes`). */
export function nextTetromino(piece: Piece): Piece {
  const pos = piece.shape < FIRST_TETROMINO || piece.shape >= FIRST_PENTOMINO ? FIRST_TETROMINO : piece.shape;
  if (pos < FIRST_PENTOMINO - 1) return makePiece(pos + 1, piece.angle, piece.blink);
  return makePiece(FIRST_TETROMINO, piece.angle + 1, piece.blink);
}

/** Предыдущее тетрамино; перед первым — последнее и угол на 90° назад (`getPrevTetraminoes`). */
export function prevTetromino(piece: Piece): Piece {
  const pos = piece.shape < FIRST_TETROMINO || piece.shape >= FIRST_PENTOMINO ? FIRST_TETROMINO : piece.shape;
  if (pos > FIRST_TETROMINO) return makePiece(pos - 1, piece.angle, piece.blink);
  return makePiece(FIRST_PENTOMINO - 1, piece.angle - 1, piece.blink);
}

/** Следующая несущая фигура всего каталога (26 штук); после последней — первая и угол на 90° дальше (`getNextShape(…, false)`). */
export function nextShape(piece: Piece): Piece {
  if (piece.shape < FIRST_SUPER - 1) return makePiece(piece.shape + 1, piece.angle, piece.blink);
  return makePiece(FIRST_TROMINO, piece.angle + 1, piece.blink);
}

/** Предыдущая несущая фигура (`getPrevShape(…, false)`). */
export function prevShape(piece: Piece): Piece {
  if (piece.shape > FIRST_TROMINO) return makePiece(piece.shape - 1, piece.angle, piece.blink);
  return makePiece(FIRST_SUPER - 1, piece.angle - 1, piece.blink);
}

/** Случайная несущая фигура пула со случайным углом (`getRandomShape` тетриса и `getRandomShapeAndRotate` Pentix). */
export function randomPiece(rng: Rng, pool: PiecePool): Piece {
  const list = pool === 'pentix' ? PENTIX_POOL : TETRIS_POOL;
  const shape = list[rng.int(list.length)] ?? FIRST_TETROMINO;
  return makePiece(shape, rng.int(4), false);
}

/**
 * Случайная фигура из пула и перечисленных специальных (`getRandomShapeAndSuper`): все записи равновероятны, угол не вращается (0°),
 * специальные фигуры мигают. `supers` — номера 0..3 (точка, пушка, грязевая пушка, бомба).
 */
export function randomPieceOrSuper(rng: Rng, pool: PiecePool, supers: readonly number[]): Piece {
  const list = pool === 'pentix' ? PENTIX_POOL : TETRIS_POOL;
  const index = rng.int(list.length + supers.length);
  if (index < list.length) return makePiece(list[index] ?? FIRST_TETROMINO, 0, false);
  return makePiece(FIRST_SUPER + (supers[index - list.length] ?? 0), 0, true);
}
