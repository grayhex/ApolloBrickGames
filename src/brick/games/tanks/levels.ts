/**
 * Препятствия «Танков»: три фигуры (квадрат, уголок, прямоугольник 3 × 2), таблица готовых полей по уровням
 * (`ObstacleUtils.tanksObstacles`) и случайная расстановка (`ObstacleUtils.getRandomObstacles`). Координаты — донорские
 * (y вверх); фигура лежит нижним левым углом в (x, y).
 */
import type { Rng } from '../../rng';
import {
  DIRS,
  DOWN,
  FIELD_H,
  FIELD_W,
  LEFT,
  RIGHT,
  UP,
  boardIndex,
  inBoard,
  newBoard,
  normalizedTurn,
  type Dir,
  type Point,
} from './geometry';

/** Тип препятствия: 0 — квадрат, 1 — уголок, 2 — прямоугольник 3 × 2 (`Obstacle.charactersTable`). */
export type ObstacleType = 0 | 1 | 2;

// prettier-ignore
const OBSTACLE_TABLE: readonly (readonly Point[])[] = [
  [[0, 0]],
  [[1, 0], [0, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
];

/** Клетки фигуры после поворота, сдвинутые к нулю (`Obstacle.changeRotationAngle`). */
export function obstacleCells(type: ObstacleType, dir: Dir): readonly Point[] {
  const cells = OBSTACLE_TABLE[type];
  if (!cells) throw new Error(`Нет препятствия типа ${type}`);
  return normalizedTurn(cells, dir);
}

/** Готовое препятствие: тип, поворот и положение нижнего левого угла. */
export interface PlacedObstacle {
  readonly type: ObstacleType;
  readonly dir: Dir;
  readonly x: number;
  readonly y: number;
}

const o = (type: ObstacleType, dir: Dir, x: number, y: number): PlacedObstacle => ({ type, dir, x, y });

/**
 * Готовые поля по уровням (`ObstacleUtils.tanksObstacles`): индекс — номер уровня, у уровней 0 и 1 препятствий нет.
 * Поворот «вверх / вправо / вниз / влево» — как `UP / RIGHT / DOWN / LEFT` донора.
 */
export const TANK_LEVELS: readonly (readonly PlacedObstacle[])[] = [
  [],
  [],
  [o(1, UP, 1, 3), o(1, LEFT, 6, 3), o(2, LEFT, 8, 8)],
  [o(1, RIGHT, 1, 15), o(1, DOWN, 6, 15), o(2, LEFT, 0, 9)],
  [o(1, RIGHT, 1, 15), o(1, LEFT, 6, 3), o(2, UP, 3, 11)],
  [o(1, UP, 1, 3), o(1, DOWN, 6, 15)],
  [o(1, RIGHT, 1, 15), o(1, DOWN, 6, 15), o(2, LEFT, 0, 9), o(2, LEFT, 8, 9)],
  [o(1, UP, 1, 3), o(1, LEFT, 6, 3), o(1, DOWN, 6, 15), o(2, LEFT, 0, 8), o(2, UP, 3, 11)],
  [o(1, UP, 1, 3), o(1, LEFT, 6, 3), o(1, RIGHT, 1, 15), o(2, UP, 3, 11)],
  [o(1, UP, 1, 3), o(1, RIGHT, 1, 15), o(1, DOWN, 6, 15), o(2, LEFT, 0, 9), o(2, LEFT, 8, 9), o(2, UP, 3, 11)],
  [o(1, UP, 1, 3), o(1, LEFT, 6, 3), o(1, RIGHT, 1, 15), o(1, DOWN, 6, 15), o(2, LEFT, 0, 8), o(2, UP, 3, 11)],
];

function drawObstacle(board: Uint8Array, cells: readonly Point[], x: number, y: number): void {
  for (const [cx, cy] of cells) {
    if (inBoard(x + cx, y + cy)) board[boardIndex(x + cx, y + cy)] = 1;
  }
}

/** Поле с готовыми препятствиями уровня (`getPreparedObstacles`); для уровня 1 (и вне таблицы) — пустое. */
export function presetObstacles(level: number): Uint8Array {
  const board = newBoard();
  for (const item of TANK_LEVELS[level] ?? []) drawObstacle(board, obstacleCells(item.type, item.dir), item.x, item.y);
  return board;
}

/** Есть ли занятая клетка в самой фигуре и в кольце шириной в клетку вокруг неё (`checkCollision(…, withBorder)`). */
function touches(board: Uint8Array, cells: readonly Point[], x: number, y: number): boolean {
  for (const [cx, cy] of cells) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bx = x + cx + dx;
        const by = y + cy + dy;
        if (inBoard(bx, by) && board[boardIndex(bx, by)] !== 0) return true;
      }
    }
  }
  return false;
}

/**
 * Одно случайное препятствие (`ObstacleUtils.generateObstacle` с отступами 0, 0, 3, 3): до десяти попыток найти место,
 * не касающееся других препятствий даже углом. Как у донора, удача на десятой попытке не засчитывается. Возвращает,
 * поставлено ли препятствие.
 */
function generateObstacle(board: Uint8Array, rng: Rng, type: ObstacleType): boolean {
  let attempts = 10;
  let cells: readonly Point[];
  let x: number;
  let y: number;
  do {
    cells = obstacleCells(type, rng.pick(DIRS));
    const width = Math.max(...cells.map(([cx]) => cx)) + 1;
    const height = Math.max(...cells.map(([, cy]) => cy)) + 1;
    x = rng.int(FIELD_W - width + 1);
    y = rng.int(FIELD_H - height - 6 + 1) + 3;
    attempts--;
  } while (touches(board, cells, x, y) && attempts > 0);
  if (attempts <= 0) return false;
  drawObstacle(board, cells, x, y);
  return true;
}

/**
 * Случайные препятствия (`getRandomObstacles`): `count` штук на пустом поле, тип выбирается случайно из трёх. Первое
 * препятствие донор пробует поставить, пока поле не изменится (до десяти раз), остальные — по одной попытке.
 */
export function randomObstacles(rng: Rng, count: number): Uint8Array {
  const board = newBoard();
  let placed = false;
  for (let i = 0; i < count; i++) {
    let attempts = 10;
    do {
      const type = rng.int(3) as ObstacleType;
      if (generateObstacle(board, rng, type)) placed = true;
      attempts--;
    } while (!placed && attempts > 0);
  }
  return board;
}
