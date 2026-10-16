/**
 * ИИ вражеских танков: куда ехать, куда и когда стрелять. Порт решений `TanksGame` (`getDirectionForMovement`,
 * `getDirectionForShoot`, `checkForShot`, `isTankAhead`, `distanceToObstacle`, `descShakerSort`): те же веса, пороги и
 * порядок бросков кубика, но случайность — только из seeded `Rng`. Координаты донорские (y вверх).
 */
import type { Rng } from '../../rng';
import {
  DIRS,
  DOWN,
  DX,
  DY,
  ENEMY_KIND,
  FIELD_H,
  FIELD_W,
  LEFT,
  RIGHT,
  TANK_SIZE,
  UP,
  boardIndex,
  canPlace,
  type Dir,
  type Tank,
} from './geometry';

/** Направление, в котором враг стреляет по игроку: вдоль большей из разниц координат (`getDirectionForShoot`). */
export function shootDirection(x: number, y: number, player: Tank): Dir {
  if (Math.abs(x - player.x) < Math.abs(y - player.y)) return y - player.y > 0 ? DOWN : UP;
  return x - player.x > 0 ? LEFT : RIGHT;
}

/** Направления по убыванию веса: «шейкерная» сортировка донора (порядок равных весов — как у него). */
export function sortByWeight(weights: readonly number[]): Dir[] {
  const result: Dir[] = [UP, RIGHT, DOWN, LEFT];
  const weight = (index: number): number => weights[result[index] ?? UP] ?? 0;
  const swap = (a: number, b: number): void => {
    const first = result[a] ?? UP;
    result[a] = result[b] ?? UP;
    result[b] = first;
  };
  let left = 0;
  let right = result.length - 1;
  do {
    for (let i = right; i > left; i--) {
      if (weight(i) > weight(i - 1)) swap(i, i - 1);
    }
    left++;
    for (let i = left; i < right; i++) {
      if (weight(i) < weight(i + 1)) swap(i, i + 1);
    }
    right--;
  } while (left <= right);
  return result;
}

/**
 * Расстояние от клетки (x, y) до ближайшей занятой клетки в направлении `dir` (`distanceToObstacle`): 1 — соседняя;
 * -1 — препятствий нет. `board` — поле без самого стреляющего танка.
 */
export function distanceToObstacle(board: Uint8Array, x: number, y: number, dir: Dir): number {
  const distances = [FIELD_H - y, FIELD_W - x, y, x] as const; // вверх, вправо, вниз, влево
  const distance = distances[dir];
  for (let i = 1; i < distance; i++) {
    if (board[boardIndex(x + i * DX[dir], y + i * DY[dir])] !== 0) return i;
  }
  return -1;
}

/**
 * Стоит ли `tank` в направлении `view` от точки (sx, sy) не дальше `distance` (`isTankAhead`). Расстояние донор передаёт
 * со знаком (разница координат врага и игрока), поэтому «впереди» оказывается и всё, что стоит позади стреляющего
 * в пределах полосы шириной в танк, — это поведение донора сохранено как есть.
 */
function isTankAhead(sx: number, sy: number, distance: number, view: Dir, tank: Tank): boolean {
  if (sx === tank.x && sy === tank.y) return false;
  const half = Math.trunc(TANK_SIZE / 2);
  if (view === RIGHT || view === LEFT) {
    return Math.abs(tank.y - sy) <= half && (tank.x - sx) * (view === LEFT ? -1 : 1) <= distance;
  }
  return Math.abs(tank.x - sx) <= half && (tank.y - sy) * (view === DOWN ? -1 : 1) <= distance;
}

function isFriendAhead(tank: Tank, enemies: readonly (Tank | null)[], distance: number, view: Dir): boolean {
  return enemies.some((other) => other !== null && other !== tank && isTankAhead(tank.x, tank.y, distance, view, other));
}

const MIN_SHOT_DISTANCE = 4;
const MAX_SHOT_DISTANCE = 9;
/** Шаг вероятности выстрела (`rate` донора). */
const SHOT_RATE = 1 / (MIN_SHOT_DISTANCE + MAX_SHOT_DISTANCE);

/**
 * Вероятность выстрела врага в этот ход (`checkForShot` до броска кубика): падает с расстоянием до игрока, растёт, если
 * игрок едет навстречу, у врага «в упор» (рядом по линии игрока) и при близком препятствии на линии огня; падает, если
 * на линии свой танк. Всегда в пределах [rate, 1 - rate]. `board` — поле без этого танка.
 */
export function shotChance(
  board: Uint8Array,
  tank: Tank,
  player: Tank,
  enemies: readonly (Tank | null)[],
): number {
  const horizontal = tank.x - player.x;
  const vertical = tank.y - player.y;
  const nearer = Math.min(Math.abs(horizontal), Math.abs(vertical));
  const farther = Math.max(Math.abs(horizontal), Math.abs(vertical));

  let chance = Math.max(1 - (nearer + farther - 1) * SHOT_RATE, 0);
  if (
    (horizontal < 0 && player.dir === LEFT) ||
    (horizontal > 0 && player.dir === RIGHT) ||
    (vertical < 0 && player.dir === DOWN) ||
    (vertical > 0 && player.dir === UP)
  ) {
    chance += SHOT_RATE;
  }

  const shot = shootDirection(tank.x, tank.y, player);
  const distance = shot === LEFT || shot === RIGHT ? horizontal : vertical;
  if (isFriendAhead(tank, enemies, distance, shot)) {
    chance -= SHOT_RATE * 2;
  } else if (nearer <= Math.trunc(TANK_SIZE / 2)) {
    chance += SHOT_RATE * 10;
  } else {
    const found = distanceToObstacle(board, tank.x, tank.y, shot);
    if (found > 0 && found <= 5) chance += SHOT_RATE * (9 - found);
  }
  return Math.min(1 - SHOT_RATE, Math.max(SHOT_RATE, chance));
}

/** Стрелять ли врагу в этот ход: бросок кубика против `shotChance`. */
export function wantsToShoot(
  board: Uint8Array,
  tank: Tank,
  player: Tank,
  enemies: readonly (Tank | null)[],
  rng: Rng,
): boolean {
  return rng.next() <= shotChance(board, tank, player, enemies);
}

/**
 * Веса направлений движения врага (`getDirectionForMovement` до броска кубика), индекс — направление: каждому даётся
 * базовый 0,25, плюс за свободный шаг, за текущее направление и за приближение к игроку по более короткой оси, минус за
 * преграду (на шаг и на целую длину танка) и за пересечение курса игрока. `board` — поле без этого танка.
 */
export function moveWeights(
  board: Uint8Array,
  tank: Tank,
  player: Tank,
): [number, number, number, number] {
  const weights: [number, number, number, number] = [0.25, 0.25, 0.25, 0.25];
  const blocked: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  const horizontal = tank.x - player.x;
  const vertical = tank.y - player.y;
  const horizontalIsNearer = Math.abs(horizontal) < Math.abs(vertical);
  const preferredHorizontal: Dir = horizontal < 0 ? RIGHT : LEFT;
  const preferredVertical: Dir = vertical < 0 ? UP : DOWN;

  for (const dir of DIRS) {
    // «ближняя» точка — шаг на клетку, «дальняя» — на целую длину танка
    if (!canPlace(board, ENEMY_KIND, dir, tank.x + DX[dir], tank.y + DY[dir])) {
      weights[dir] -= 0.5;
      blocked[dir] = true;
      if (!canPlace(board, ENEMY_KIND, dir, tank.x + DX[dir] * TANK_SIZE, tank.y + DY[dir] * TANK_SIZE)) {
        weights[dir] -= 0.25;
      }
    } else {
      weights[dir] += 0.25;
    }
  }
  if (!blocked[tank.dir]) weights[tank.dir] += 0.25;

  // к игроку: по более короткой оси вес растёт сильнее, если путь не закрыт
  if (horizontal !== 0) weights[preferredHorizontal] += horizontalIsNearer && !blocked[preferredHorizontal] ? 0.5 : 0.25;
  if (vertical !== 0) weights[preferredVertical] += !horizontalIsNearer && !blocked[preferredVertical] ? 0.5 : 0.25;
  // не ехать поперёк курса игрока
  weights[player.dir === LEFT || player.dir === RIGHT ? preferredVertical : preferredHorizontal] -= 0.25;
  return weights;
}

/**
 * Куда двигаться врагу: направления по убыванию веса `moveWeights` по очереди «бросают кубик» с шансом, равным весу
 * (от 0 до 0,95); если не выпало ни одному — берётся самое тяжёлое.
 */
export function chooseMove(board: Uint8Array, tank: Tank, player: Tank, rng: Rng): Dir {
  const weights = moveWeights(board, tank, player);
  const ordered = sortByWeight(weights);
  for (const dir of ordered) {
    const chance = Math.min(0.95, Math.max(0, weights[dir]));
    if (rng.next() <= chance) return dir;
  }
  return ordered[0] ?? UP;
}
