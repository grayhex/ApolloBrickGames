/**
 * Геометрия «Танков»: направления, маски танков, проверки столкновений и ход танка.
 *
 * Здесь и во всём каталоге `tanks/` координаты ДОНОРСКИЕ (`TanksGame.java`): x вправо, y ВВЕРХ от нижней строки
 * (y = 0 — низ поля), «вверх» — это y + 1. В систему экрана (строка 0 — верх) их переводит только `toScreenRow`
 * при рисовании матрицы и при выборе центра взрыва; так донорские таблицы (точки появления, препятствия) переносятся без
 * пересчёта. Поле хранится как `Uint8Array` 10 × 20 с индексом `boardIndex(x, y)`.
 */
import { BRICK_COLS, BRICK_ROWS } from '../../types';

export const FIELD_W = BRICK_COLS;
export const FIELD_H = BRICK_ROWS;

/** Направление, как `RotationAngle` донора: 0 — вверх (d0), 1 — вправо (d90), 2 — вниз (d180), 3 — влево (d270). */
export type Dir = 0 | 1 | 2 | 3;
export const UP = 0 satisfies Dir;
export const RIGHT = 1 satisfies Dir;
export const DOWN = 2 satisfies Dir;
export const LEFT = 3 satisfies Dir;
export const DIRS: readonly Dir[] = [UP, RIGHT, DOWN, LEFT];
export const DX = [0, 1, 0, -1] as const;
export const DY = [1, 0, -1, 0] as const;

export type Point = readonly [number, number];

/** Размер маски любого танка (ширина и высота): 3 клетки. */
export const TANK_SIZE = 3;

/** Вид маски танка: 0 — танк игрока, 1 — вражеский, 2 — «коробка» 3 × 3 (только для проверки места появления). */
export type TankKind = 0 | 1 | 2;
export const PLAYER_KIND = 0 satisfies TankKind;
export const ENEMY_KIND = 1 satisfies TankKind;
export const BOX_KIND = 2 satisfies TankKind;

/** Танк: центр маски и направление ствола. Объекты неизменяемы — ход танка создаёт новый (или возвращает прежний). */
export interface Tank {
  readonly x: number;
  readonly y: number;
  readonly dir: Dir;
}

/** Снаряд: клетка и направление полёта. */
export interface Bullet {
  readonly x: number;
  readonly y: number;
  readonly dir: Dir;
}

/** Маски из `TankShape.charactersTable` (направление «вверх»; y вверх). Ствол — клетка (0, 1). */
// prettier-ignore
const TANK_TABLE: readonly (readonly Point[])[] = [
  // 0 — танк игрока (7 клеток)
  [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1]],
  // 1 — вражеский танк (6 клеток: нет клетки позади центра)
  [[-1, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1]],
  // 2 — танк в коробке: сплошной квадрат 3 × 3, им проверяют, свободно ли место появления
  [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
];

export interface Mask {
  readonly cells: readonly Point[];
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** Поворот точек, как `Shape.rotateRight` / `turnAround` / `rotateLeft` донора (`0 - v`, чтобы не получить -0). */
function turn(cells: readonly Point[], dir: Dir): Point[] {
  switch (dir) {
    case RIGHT:
      return cells.map(([x, y]): Point => [y, 0 - x]);
    case DOWN:
      return cells.map(([x, y]): Point => [0 - x, 0 - y]);
    case LEFT:
      return cells.map(([x, y]): Point => [0 - y, x]);
    default:
      return [...cells];
  }
}

export function makeMask(cells: readonly Point[]): Mask {
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return { cells, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const MASKS: readonly (readonly Mask[])[] = TANK_TABLE.map((table) => DIRS.map((dir) => makeMask(turn(table, dir))));

export function tankMask(kind: TankKind, dir: Dir): Mask {
  const mask = MASKS[kind]?.[dir];
  if (!mask) throw new Error(`Нет маски танка: вид ${kind}, направление ${dir}`);
  return mask;
}

/** Поворот и сдвиг точек так, чтобы наименьшие x и y стали нулями (как `Obstacle.setType` донора). */
export function normalizedTurn(cells: readonly Point[], dir: Dir): Point[] {
  const turned = turn(cells, dir);
  const minX = Math.min(...turned.map(([x]) => x));
  const minY = Math.min(...turned.map(([, y]) => y));
  return turned.map(([x, y]): Point => [x - minX, y - minY]);
}

export const boardIndex = (x: number, y: number): number => y * FIELD_W + x;
export const inBoard = (x: number, y: number): boolean => x >= 0 && x < FIELD_W && y >= 0 && y < FIELD_H;
export const newBoard = (): Uint8Array => new Uint8Array(FIELD_W * FIELD_H);

/** Номер строки экрана (0 — верх) для донорского y. */
export const toScreenRow = (y: number): number => FIELD_H - 1 - y;

/** `checkBoardCollision`: маска с центром (x, y) выходит за поле? */
export function outOfBoard(kind: TankKind, dir: Dir, x: number, y: number): boolean {
  const mask = tankMask(kind, dir);
  return x + mask.minX < 0 || x + mask.maxX >= FIELD_W || y + mask.maxY >= FIELD_H || y + mask.minY < 0;
}

/** `checkCollision`: маска с центром (x, y) задевает занятую клетку поля (клетки за полем пропускаются)? */
export function hitsBoard(board: Uint8Array, kind: TankKind, dir: Dir, x: number, y: number): boolean {
  for (const [cx, cy] of tankMask(kind, dir).cells) {
    const bx = x + cx;
    const by = y + cy;
    if (inBoard(bx, by) && board[boardIndex(bx, by)] !== 0) return true;
  }
  return false;
}

/** Можно ли поставить маску сюда: она целиком в поле и не задевает занятых клеток (`isPossibleMove` донора). */
export function canPlace(board: Uint8Array, kind: TankKind, dir: Dir, x: number, y: number): boolean {
  return !outOfBoard(kind, dir, x, y) && !hitsBoard(board, kind, dir, x, y);
}

/** Нарисовать (value = 1) или стереть (0) танк на поле. */
export function putTank(board: Uint8Array, kind: TankKind, tank: Tank, value = 1): void {
  for (const [cx, cy] of tankMask(kind, tank.dir).cells) {
    const bx = tank.x + cx;
    const by = tank.y + cy;
    if (inBoard(bx, by)) board[boardIndex(bx, by)] = value;
  }
}

/** Закрывает ли танк клетку (x, y) — `checkTwoShapeCollision` с одноклеточным снарядом. */
export function coversCell(kind: TankKind, tank: Tank, x: number, y: number): boolean {
  for (const [cx, cy] of tankMask(kind, tank.dir).cells) {
    if (tank.x + cx === x && tank.y + cy === y) return true;
  }
  return false;
}

/**
 * Ход танка (`TanksGame.moveTank`). `board` — поле БЕЗ самого танка. Если направление отличается от текущего (или нужен
 * только поворот), танк поворачивается на месте, а если повёрнутая маска во что-то упирается — поворачивается со
 * ступенькой на клетку вперёд; иначе шагает вперёд. Упёрся в край или препятствие — возвращается прежний танк.
 */
export function moveTank(board: Uint8Array, kind: TankKind, tank: Tank, dir: Dir, rotationOnly: boolean): Tank {
  let x = tank.x;
  let y = tank.y;
  if (rotationOnly || tank.dir !== dir) {
    if (hitsBoard(board, kind, dir, x, y)) {
      x += DX[dir];
      y += DY[dir];
    }
  } else {
    x += DX[dir];
    y += DY[dir];
  }
  if (outOfBoard(kind, dir, x, y) || hitsBoard(board, kind, dir, x, y)) return tank;
  return { x, y, dir };
}
