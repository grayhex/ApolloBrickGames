/**
 * Пушка и пули для игр «Стройка» (`construction`) и «Стрельба по фигурам» (`shapes`).
 * Правила — по донору: `shapes/GunShape.java` (пушка), `games/GameWithGun.java` (`fire`, `moveGun`, `flight`, `initBullets`),
 * `games/GunGame.java` (`processKeys`, `FIRE_SPEED`, `MOVEMENT_SPEED`). Все координаты — в пространстве пушки (см. `space.ts`):
 * y = 0 — ряд пушки, пули летят в сторону растущего y.
 *
 * Что изменено при переносе: потоки и `sleep()` заменены тактами (60 Гц); пуля хранит «следующий проверяемый ряд» (как массив донора) и
 * рисуется мигающей клеткой в ряду, который уже прошла; вспышка пули в верхнем ряду (`sleep(ANIMATION_DELAY / 2)` донора) —
 * один такт, пока пуля стоит в верхнем ряду. Мигающие клетки пуль в проверках «клетка занята» не участвуют (в доноре пули рисуются
 * на самом поле и в редких случаях сходились с рядом из-за гонки потоков) — здесь они отдельны от поля и такой гонки нет.
 */
import { Repeater, msToTicks } from '../../timing';
import { BRICK_COLS, BRICK_ROWS, CELL_BLINK, CELL_ON, makeBrickInput, type BrickInput } from '../../types';
import { TOP_ROW } from './space';

/** Колонка центра пушки в начале уровня (`boardWidth / 2 - 1`). */
export const GUN_START_X = BRICK_COLS / 2 - 1;
/** Высота пушки в клетках: основание на ряду 0 и дуло над центром на ряду 1 (`GunShape`). */
export const GUN_HEIGHT = 2;
/** Ряд, с которого начинает полёт пуля (`curY + gun.maxY() + 1`). */
export const BULLET_START_ROW = GUN_HEIGHT;
/** Пуль в одной колонке одновременно (`boardHeight - gun.getHeight()`). */
export const LANE_CAPACITY = BRICK_ROWS - GUN_HEIGHT;

/** Клетки пушки относительно центра (`GunShape.charactersTable`): три в основании и дуло над центром. */
const GUN_CELLS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [0, 0],
  [1, 0],
  [0, 1],
];

/** Повтор движения: `setKeyDelay(.., MOVEMENT_SPEED)`, где `MOVEMENT_SPEED = round(ANIMATION_DELAY * 1.5)` = 45 мс. */
export const MOVE_TICKS = msToTicks(45);
/** Повтор выстрела: `FIRE_SPEED = round(ANIMATION_DELAY * (две пушки ? 2.5 : 1.5))` = 75 / 45 мс. */
export const FIRE_TICKS_ONE = msToTicks(45);
export const FIRE_TICKS_TWO = msToTicks(75);
/** Полёт пуль: таймер раз в `ANIMATION_DELAY / (две пушки ? 1 : 2)` = 30 / 15 мс. */
export const BULLET_TICKS_ONE = msToTicks(15);
export const BULLET_TICKS_TWO = msToTicks(30);

/** Пушка: одна по центру или две по бокам (`hasTwoSmokingBarrels`), управление кнопками `left`/`right` и огнём. */
export class Gun {
  /** Колонка центра пушки; у краёв поля часть основания может выходить за поле (так в доноре: `moveGun` пускает центр в 0..9). */
  x = GUN_START_X;
  readonly barrels: 1 | 2;
  private readonly repeating: boolean;
  private readonly moves: Repeater;
  private readonly shots: Repeater;

  /**
   * @param barrels стволов: 1 — выстрел из центра, 2 — из колонок по бокам от центра.
   * @param repeating зажатая кнопка повторяется (разрушающий режим донора: `setKeyDelay`); иначе одно действие на нажатие
   *   (создающий режим донора: `keys.remove(..)` после действия).
   */
  constructor(barrels: number, repeating: boolean) {
    this.barrels = barrels >= 2 ? 2 : 1;
    this.repeating = repeating;
    this.moves = new Repeater(MOVE_TICKS, MOVE_TICKS);
    const fireTicks = this.barrels === 2 ? FIRE_TICKS_TWO : FIRE_TICKS_ONE;
    this.shots = new Repeater(fireTicks, fireTicks);
  }

  reset(): void {
    this.x = GUN_START_X;
    this.moves.reset();
    this.shots.reset();
  }

  /** Занята ли клетка (x, y) пушкой. */
  covers(x: number, y: number): boolean {
    for (const [dx, dy] of GUN_CELLS) if (this.x + dx === x && dy === y) return true;
    return false;
  }

  /** Нарисовать пушку в буфере пространства; клетки за краем поля отбрасываются. */
  drawInto(buffer: Uint8Array): void {
    for (const [dx, dy] of GUN_CELLS) {
      const x = this.x + dx;
      if (x >= 0 && x < BRICK_COLS) buffer[dy * BRICK_COLS + x] = CELL_ON;
    }
  }

  /** Колонки, куда летят пули при выстреле: одна по центру или две по бокам; колонки за краем поля не считаются. */
  lanes(): number[] {
    const wanted = this.barrels === 2 ? [this.x - 1, this.x + 1] : [this.x];
    return wanted.filter((x) => x >= 0 && x < BRICK_COLS);
  }

  /**
   * Кнопки `left` и `right` (сначала влево, потом вправо, как в `processKeys`). `isSolid` — занятая клетка поля: на неё пушка не заходит
   * (`checkCollision` донора). Возвращает `true`, если пушка сдвинулась.
   */
  steer(input: BrickInput, isSolid: (x: number, y: number) => boolean): boolean {
    let moved = false;
    if (this.pressed('left', input)) moved = this.moveTo(this.x - 1, isSolid) || moved;
    if (this.pressed('right', input)) moved = this.moveTo(this.x + 1, isSolid) || moved;
    return moved;
  }

  /** Огонь (`rotate` и `fire` — одна кнопка): нужно ли выпустить пулю в этом такте. */
  trigger(input: BrickInput): boolean {
    const pressed = input.pressed.has('rotate') || input.pressed.has('fire');
    if (!this.repeating) return pressed;
    const held = input.held.has('rotate') || input.held.has('fire');
    return this.shots.fire('fire', makeBrickInput(pressed ? ['fire'] : [], held ? ['fire'] : []));
  }

  private pressed(action: 'left' | 'right', input: BrickInput): boolean {
    return this.repeating ? this.moves.fire(action, input) : input.pressed.has(action);
  }

  private moveTo(x: number, isSolid: (x: number, y: number) => boolean): boolean {
    if (x < 0 || x >= BRICK_COLS) return false;
    for (const [dx, dy] of GUN_CELLS) {
      const cx = x + dx;
      if (cx >= 0 && cx < BRICK_COLS && isSolid(cx, dy)) return false;
    }
    this.x = x;
    return true;
  }
}

interface Bullet {
  /** Следующий проверяемый ряд (в доноре — значение в массиве `bullets`). Пуля нарисована в ряду `next - 1`. */
  next: number;
  /** Пуля дошла до верхнего ряда разрушающего режима и показывается там один такт. */
  flash: boolean;
}

/** Окружение полёта разрушающей пули (`flightOfBullets`). */
export interface DestroyingFlight {
  /** Есть ли в клетке поля стена или фигура. */
  solid(x: number, y: number): boolean;
  /** Пуля попала в занятую клетку (x, y). Вернуть `true`, если после этого все пули надо убрать (полный ряд и т. п.). */
  destroy(x: number, y: number): boolean | void;
}

/** Окружение полёта создающей пули (`flightOfMud`). */
export interface CreatingFlight {
  solid(x: number, y: number): boolean;
  /** Нельзя ли поставить клетку в (x, y): занята полем или пушкой (в доноре — `Cell != Empty`). */
  blocked(x: number, y: number): boolean;
  /** Пуля остановилась в пустой клетке (x, y). Вернуть `true`, если после этого все пули надо убрать. */
  create(x: number, y: number): boolean | void;
  /** Пуля, не встретившая клетку, прилипает к верхнему краю (донор: да); иначе просто улетает. */
  ceiling: boolean;
}

/** Пули, летящие вверх по колонкам (`GameWithGun.bullets`): в каждой колонке до `LANE_CAPACITY` пуль. */
export class Bullets {
  private readonly lanes: Bullet[][] = Array.from({ length: BRICK_COLS }, () => []);

  clear(): void {
    for (const lane of this.lanes) lane.length = 0;
  }

  /** Сколько пуль в воздухе. */
  get count(): number {
    return this.lanes.reduce((sum, lane) => sum + lane.length, 0);
  }

  /** Ряды пуль в колонке (для тестов и рисунка): по порядку выстрелов, в виде видимого ряда или `null`, если пуля ещё не показана. */
  visibleRows(x: number): (number | null)[] {
    return (this.lanes[x] ?? []).map((bullet) => visibleRow(bullet));
  }

  /** Выпустить пули из колонок пушки; возвращает, сколько выпущено (колонка с полным запасом пуль пропускается). */
  fire(gun: Gun): number {
    let fired = 0;
    for (const x of gun.lanes()) {
      const lane = this.lanes[x];
      if (!lane || lane.length >= LANE_CAPACITY) continue;
      lane.push({ next: BULLET_START_ROW, flash: false });
      fired++;
    }
    return fired;
  }

  /**
   * Один проход полёта разрушающих пуль (`flight(true)`): пуля в занятой клетке разрушает её и исчезает, иначе поднимается на ряд;
   * в верхнем ряду она сначала показывается один такт (после попадания в клетку верхнего ряда тоже), на следующем проходе исчезает.
   */
  flyDestroying(env: DestroyingFlight): void {
    for (let x = 0; x < BRICK_COLS; x++) {
      const lane = this.lanes[x];
      if (!lane) continue;
      let i = 0;
      while (i < lane.length) {
        const bullet = lane[i];
        if (!bullet) break;
        if (bullet.flash) {
          lane.splice(i, 1);
          continue;
        }
        const row = bullet.next;
        if (row < TOP_ROW) {
          if (env.solid(x, row)) {
            lane.splice(i, 1);
            if (env.destroy(x, row)) return this.clear();
            continue;
          }
          bullet.next++;
        } else {
          if (env.solid(x, row) && env.destroy(x, row)) return this.clear();
          bullet.flash = true;
        }
        i++;
      }
    }
  }

  /**
   * Один проход полёта создающих пуль (`flight(false)`): пуля, встретив занятую клетку, останавливается перед ней и создаёт клетку
   * (если место перед ней свободно); у верхнего края (если там пусто) создаёт клетку в верхнем ряду, когда это разрешено.
   */
  flyCreating(env: CreatingFlight): void {
    for (let x = 0; x < BRICK_COLS; x++) {
      const lane = this.lanes[x];
      if (!lane) continue;
      let i = 0;
      while (i < lane.length) {
        const bullet = lane[i];
        if (!bullet) break;
        const row = bullet.next;
        if (row < TOP_ROW) {
          if (!env.solid(x, row)) {
            bullet.next++;
            i++;
            continue;
          }
          lane.splice(i, 1);
          if (!env.blocked(x, row - 1) && env.create(x, row - 1)) return this.clear();
          continue;
        }
        lane.splice(i, 1);
        if (env.solid(x, row)) {
          if (!env.blocked(x, row - 1) && env.create(x, row - 1)) return this.clear();
        } else if (env.ceiling && env.create(x, row)) {
          return this.clear();
        }
      }
    }
  }

  /** Нарисовать пули мигающими клетками в пустых клетках буфера пространства. */
  drawInto(buffer: Uint8Array): void {
    for (let x = 0; x < BRICK_COLS; x++) {
      for (const bullet of this.lanes[x] ?? []) {
        const row = visibleRow(bullet);
        if (row === null) continue;
        const index = row * BRICK_COLS + x;
        if (buffer[index] === 0) buffer[index] = CELL_BLINK;
      }
    }
  }
}

function visibleRow(bullet: Bullet): number | null {
  if (bullet.flash) return TOP_ROW;
  return bullet.next > BULLET_START_ROW ? bullet.next - 1 : null;
}
