/**
 * Дорога гонок: машина, полосы вариантов, рамка дороги и поток встречных машин.
 *
 * Правила и числа — из `RacingGame` / `CarShape` донора n0Live/BrickGame (MIT). Координаты здесь тоже донорские:
 * `x` слева направо, `y` снизу вверх — «по ходу движения» (0 — ближняя к машине игрока нижняя строка поля).
 * Перевод в строки экрана (в перевёрнутых вариантах `y` растёт сверху вниз) делает рисующая сторона (`RacingBase.plot`).
 */
import { BRICK_ROWS } from '../../types';
import type { Rng } from '../../rng';
import { genuineTicks } from '../../timing';

/**
 * Машина (`CarShape`): семь клеток вокруг центра. Строки — от нижней (`y = -1`) к носу (`y = 2`):
 * ```
 * .#.   нос      y = 2
 * ###            y = 1
 * .#.            y = 0
 * #.#   колёса   y = -1
 * ```
 */
export const CAR_ROWS: readonly string[] = ['#.#', '.#.', '###', '.#.'];
export const CAR_WIDTH = 3;
/** Нижняя и верхняя клетки машины относительно её центра (`Shape.minY()` / `maxY()` донора). */
export const CAR_MIN_Y = -1;
export const CAR_MAX_Y = 2;
/** Центр машины игрока по вертикали: `curY = 0 - car.minY()` — колёса стоят в самой нижней строке. */
export const CAR_Y = -CAR_MIN_Y;

/** Горит ли клетка (x, y) у машины с центром (cx, cy). */
export function carCovers(cx: number, cy: number, x: number, y: number, rows: readonly string[] = CAR_ROWS): boolean {
  const row = rows[y - cy - CAR_MIN_Y];
  return row !== undefined && row[x - cx + 1] === '#';
}

/** Пересекаются ли две машины (общая горящая клетка) — `GameUtils.checkCollision` донора. */
export function carsOverlap(ax: number, ay: number, bx: number, by: number, rows: readonly string[] = CAR_ROWS, otherRows:readonly string[]=rows): boolean {
  const maxY = CAR_MIN_Y + rows.length - 1;
  if (Math.abs(ax - bx) > CAR_WIDTH - 1 || Math.abs(ay - by) > Math.max(rows.length,otherRows.length)-1) return false;
  for (let dy = CAR_MIN_Y; dy <= maxY; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (carCovers(ax, ay, ax + dx, ay + dy, rows) && carCovers(bx, by, ax + dx, ay + dy, otherRows)) return true;
    }
  }
  return false;
}

/** Рамка дороги: три горящих клетки, две пустых, период пять (`drawBorder` донора). */
export const BORDER_FILLED = 3;
export const BORDER_SPAN = 5;

/** Горит ли клетка рамки в строке `y` при фазе `phase` (фаза растёт — рамка «едет» к машине игрока). */
export const borderLit = (y: number, phase: number): boolean => (y + phase) % BORDER_SPAN < BORDER_FILLED;

/** Схема дороги варианта. */
export interface RoadLayout {
  /** Центры полос по x (`positions` донора): машина игрока стоит строго на одной из них. */
  readonly lanes: readonly number[];
  /** Три полосы (чётные типы донора): рамка только справа, редкие «двойные» и «сдвинутые» машины, дорога медленнее в 1,5 раза. */
  readonly wide: boolean;
  /** Поле перевёрнуто по вертикали (типы 3 и 4 донора): машина игрока вверху, «вперёд» — вниз. */
  readonly inverted: boolean;
}

/** Сколько вариантов у обеих игр (типы 1–4 донора). */
export const ROAD_MODE_COUNT = 4;

/** Схема по номеру варианта с нуля (тип донора = номер + 1: 1 — две полосы, 2 — три, 3 и 4 — они же вверх ногами). */
export function roadLayout(mode: number): RoadLayout {
  const type = mode + 1;
  const wide = type % 2 === 0;
  const start = wide ? Math.floor(CAR_WIDTH / 2) : 2 + Math.floor(CAR_WIDTH / 2);
  const lanes = Array.from({ length: wide ? 3 : 2 }, (_, i) => start + i * CAR_WIDTH);
  return { lanes, wide, inverted: type >= 3 };
}

/** Миллисекунды шага на скорости 1 и 10 в зависимости от уровня (`getSpeedOfFirstLevel` / `getSpeedOfTenthLevel` донора). */
export const racingFirstLevelMs = (level: number): number => 200 - 5 * level;
export const racingTenthLevelMs = (level: number): number => 50 - level + 1;

/**
 * Такты между шагами дороги. Донор двигает рамку каждые `round(v / 2)` мс, а машины — через раз, где `v` — «настоящая» скорость
 * (на трёх полосах `round(v * 1.5)`). Здесь границы 1 и 10 пересчитаны заранее, а потом применена та же линейная формула
 * `genuineTicks`: результат отличается от донорского не больше чем на миллисекунду до округления в такты.
 */
export function halfStepTicks(speed: number, level: number, wide: boolean): number {
  const k = (wide ? 1.5 : 1) / 2;
  return genuineTicks(speed, racingFirstLevelMs(level) * k, racingTenthLevelMs(level) * k);
}

/** Встречная машина: центр (x, y). */
export interface Opponent {
  x: number;
  y: number;
}

export interface ScrollResult {
  /** Сколько машин ушло за нижний край (по очку за каждую — «обгон»). */
  passed: number;
  /** Сдвинувшаяся машина врезалась в машину игрока. */
  crashed: boolean;
}

/** Поток встречных машин и рамка дороги. Сама ничего не знает ни о счёте, ни о жизнях. */
export class Road {
  readonly layout: RoadLayout;
  /** Встречные машины по возрастанию `y`: последняя — самая дальняя. */
  opponents: Opponent[] = [];
  /** Фаза рамки, которая сейчас на экране. */
  borderPhase = 0;
  /** Машины, добавленные последним вызовом `spawn` (пусто, если новых не было): для надстроек вроде пешеходов. */
  lastSpawn: readonly Opponent[] = [];
  /**
   * Центр последней появившейся группы (`opponents.getLast()` донора), пока она едет по дороге. Хранится отдельно, чтобы подбитая
   * выстрелом машина не сдвигала появление следующей: отступ считается от места, где она стояла бы.
   */
  private tailY: number | null = null;

  private readonly height: number;
  private readonly carRows: readonly string[];
  private readonly opponentRows:readonly string[];
  constructor(layout: RoadLayout, height = BRICK_ROWS, carRows: readonly string[] = CAR_ROWS, opponentRows:readonly string[]=carRows) {
    this.layout = layout;
    this.height = height;
    this.carRows = carRows;
    this.opponentRows=opponentRows;
  }

  /** Пустая дорога. Фаза рамки так, чтобы первый же сдвиг показал фазу 0, как первый `moveOn` донора. */
  reset(): void {
    this.opponents = [];
    this.lastSpawn = [];
    this.tailY = null;
    this.borderPhase = BORDER_SPAN - 1;
  }

  shiftBorder(): void {
    this.borderPhase = (this.borderPhase + 1) % BORDER_SPAN;
  }

  /**
   * Сдвинуть все машины на клетку вниз, как `moveOn(true)` донора. Машина, у которой нос ушёл ниже поля, пропадает (обгон).
   * Если сдвинутая машина задела машину игрока в (carX, carY), остальные не двигаются, как у донора.
   */
  scroll(carX: number, carY: number): ScrollResult {
    let passed = 0;
    let i = 0;
    while (i < this.opponents.length) {
      const opponent = this.opponents[i];
      if (opponent === undefined) break;
      if (opponent.y + CAR_MIN_Y + this.opponentRows.length - 1 > 0) {
        const crashed = carsOverlap(opponent.x, opponent.y - 1, carX, carY, this.opponentRows,this.carRows);
        opponent.y--;
        if (crashed) return { passed, crashed: true };
        i++;
      } else {
        this.opponents.splice(i, 1);
        passed++;
      }
    }
    if (this.tailY !== null) this.tailY--;
    return { passed, crashed: false };
  }

  /**
   * Добавить новые машины (`addOpponents` донора). Расстояние между группами: от 10 клеток на уровне 1 до 5 на уровне 10, плюс 0..2.
   * Новая группа появляется над полем (центр на 21 строке), когда последняя отъехала достаточно далеко.
   * На трёх полосах с шансом (10 + уровень)% группа «усложняется»: две машины в разных полосах либо одна машина, сдвинутая на клетку
   * и перекрывающая две полосы. Возвращает добавленные машины (пусто, если рано).
   */
  spawn(level: number, rng: Rng): readonly Opponent[] {
    const lanes = this.layout.lanes;
    this.lastSpawn = [];
    const distance = 10 - Math.floor(level / 2) + rng.int(3);
    const carMaxY = CAR_MIN_Y + this.opponentRows.length - 1;
    let lastY = this.tailY === null ? this.height - distance : this.tailY + carMaxY;
    if (lastY > this.height - distance) return [];

    const added: Opponent[] = [];
    do {
      const lane = rng.int(lanes.length);
      const laneX = lanes[lane] ?? 0;
      const y = lastY + distance - CAR_MIN_Y;
      const group: Opponent[] = [];
      if (this.layout.wide && rng.int(100) < 10 + level) {
        if (rng.int(2) === 1) {
          group.push({ x: laneX, y });
          let other: number;
          do {
            other = rng.int(lanes.length);
          } while (other === lane);
          group.push({ x: lanes[other] ?? 0, y });
        } else {
          let x = laneX;
          if (lane === 0) x += 1;
          else if (lane === lanes.length - 1) x -= 1;
          else x += rng.int(2) === 1 ? 1 : -1;
          group.push({ x, y });
        }
      } else {
        group.push({ x: laneX, y });
      }
      for (const opponent of group) {
        this.opponents.push(opponent);
        added.push(opponent);
      }
      this.tailY = y;
      lastY = y + carMaxY;
    } while (lastY < this.height - distance);

    this.lastSpawn = added;
    return added;
  }

  /** Индексы полос, колонки которых (центр ± 1) не пересекаются ни с одной из машин `group`. */
  freeLanes(group: readonly Opponent[]): number[] {
    const free: number[] = [];
    this.layout.lanes.forEach((laneX, index) => {
      if (group.every((car) => Math.abs(car.x - laneX) >= CAR_WIDTH)) free.push(index);
    });
    return free;
  }
}
