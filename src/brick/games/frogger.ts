/**
 * Игра 2 «168 в 1 танк» — «Лягушка» (Frogger). Правила, данные и последовательности — донор n0Live/BrickGame (MIT):
 * `FroggerGame` (дорога, прыжки, перенос, потеря жизни, победа), `GameWithLives` (жизни, добавочная жизнь, мелодия старта,
 * `loss`/`win`), `Game` (взрыв, очистка поля, перевёрнутое поле), `GameUtils` (проверка столкновений). Потоки, `sleep()`
 * и `java.util.Random` не переносились: время — такты 60 Гц, паузы — сценки `BrickBase`, случайность — seeded `Rng`.
 *
 * Поле. Донор считает ряды снизу (0 — низ) — игра хранит их так же и переводит в строки матрицы только при рисовании.
 *  - ряд 0 — старт (лягушка в колонке 4, как `boardWidth / 2 - 1`);
 *  - ряды 2, 4, …, 16 — восемь полос с машинами, ряды 1, 3, …, 17 между ними — сплошные разделители (лягушка их перепрыгивает);
 *  - ряд 18 — свободная «обочина», ряд 19 — дом: сюда по одному разу в каждую из десяти колонок прыгают лягушки.
 * Лягушка мигает (2), всё остальное горит (1). Донорский тип 17–32 переворачивает поле по вертикали (`flip`).
 *
 * Допущения помечены словом «допущение» (в доке и в `modes[].note`): соответствие вариантов консоли Apollo,
 * одиночный прыжок при одновременных «вверх» и «большая кнопка», события для звука.
 */
import { BrickBase, CLEAR_LOSE_TICKS, CLEAR_WIN_TICKS } from '../base';
import { cellIndex, emptyField } from '../grid';
import { Repeater, genuineTicks, msToTicks } from '../timing';
import {
  BRICK_COLS,
  BRICK_ROWS,
  CELL_BLINK,
  CELL_ON,
  type BrickGameDef,
  type BrickGameOptions,
  type BrickInput,
} from '../types';
import { LANE_COUNT, LANE_LENGTH, oncomingLanes, preloadedLanes, randomLanes, wrapLane, type Lane } from './frogger/lanes';
import { DONOR_TYPES, FROGGER_MODES, rulesOfDonorType, type FroggerRules } from './frogger/modes';

export { FROGGER_MODES, rulesOfDonorType, type FroggerRules } from './frogger/modes';
export type { Lane } from './frogger/lanes';

/** Колонка старта: `boardWidth / 2 - 1`. */
export const FROG_START_X = BRICK_COLS / 2 - 1;
/** Ряд дома (верхний у донора, ряд 19 снизу). */
export const FROG_HOME_Y = BRICK_ROWS - 1;
/** Ряд «обочины» перед домом: оттуда лягушка прыгает в дом на один ряд, а не на два. */
const FROG_VERGE_Y = BRICK_ROWS - 2;

/** Очки: за лягушку, дошедшую до дома (`checkForWin`), и за заполненный ряд домов. */
export const SCORE_PER_FROG = 1;
export const SCORE_PER_ROW = 10;
/** Добавочная жизнь каждые столько очков (`getScoresToExtraLife`). */
export const FROG_SCORES_TO_EXTRA_LIFE = 500;

/** Скорость дороги: сдвиг раз в `3 × getSpeed(true)` мс; getSpeed(true) — от 450 мс (скорость 1) до 120 мс (скорость 10). */
export const SPEED_OF_FIRST_LEVEL_MS = 450;
export const SPEED_OF_TENTH_LEVEL_MS = 120;
export const ROAD_SHIFT_FACTOR = 3;

/** Мелодия старта донора: 1500 мс до начала уровня (дорога стоит, «вверх/вниз/огонь» не работают, «влево/вправо» работают). */
export const START_WAIT_TICKS = msToTicks(1500);
/** Очистка ряда домов: по клетке с каждой стороны раз в `ANIMATION_DELAY * 2` мс, затем пауза `ANIMATION_DELAY * 7` мс. */
const HOME_STEP_TICKS = msToTicks(60);
const HOME_HOLD_TICKS = msToTicks(210);
/** Автоповтор зажатой кнопки: у донора кнопки корпуса повторяются через 500 мс раз в 50 мс (`ButtonMouseListener`). */
const REPEAT_DELAY_TICKS = msToTicks(500);
const REPEAT_INTERVAL_TICKS = msToTicks(50);
/** «Дорога ещё не двигалась»: первый сдвиг после мелодии происходит сразу (у донора `elapsedTime` давно истёк). */
const ROAD_IDLE = 1 << 30;

/** Положение лягушки в донорских координатах: x с нуля слева, y с нуля снизу. Вне поля — после переноса в стену. */
export interface FrogPosition {
  x: number;
  y: number;
}

export class FroggerGame extends BrickBase {
  readonly id = 'frog';

  /** Правила варианта. */
  protected readonly rules: FroggerRules;
  /** Восемь полос: узор по кругу из 16 клеток. */
  protected lanes: Lane[] = [];
  /** Где начинается видимое окно в узоре каждой полосы (`roadPositions`). */
  protected offsets: number[] = [];
  /** Встречные полосы (применяются только в вариантах со встречным движением). */
  protected oncoming = new Set<number>();
  /** Дома: колонки, в которые лягушки уже дошли (`frogs`); сохраняются между жизнями и обнуляются на новом уровне. */
  protected home: boolean[] = new Array<boolean>(BRICK_COLS).fill(false);
  /** Лягушка; `null` — её нет на поле (после последнего дома до нового уровня, после последней жизни). */
  protected frog: FrogPosition | null = null;
  /** Сколько тактов ещё идёт мелодия старта. */
  protected startWait = 0;
  /** Тактов с последнего сдвига дороги. */
  protected roadClock = ROAD_IDLE;
  /** Очистка ряда домов: сколько шагов от колонки `homeCenter` уже стёрто. */
  private homeCleared = 0;
  private homeCenter = 0;
  private readonly keys = new Repeater(REPEAT_DELAY_TICKS, REPEAT_INTERVAL_TICKS);

  constructor(options: BrickGameOptions = {}, rules?: FroggerRules) {
    super(options, FROGGER_MODES.length);
    this.rules = rules ?? rulesOfDonorType(DONOR_TYPES[this.mode] ?? 1);
    this.init();
  }

  // ---------------------------------------------------------------- BrickBase

  protected reset(): void {
    this.setLives(4);
    this.scoresToExtraLife = FROG_SCORES_TO_EXTRA_LIFE;
    this.home.fill(false);
    this.homeCleared = 0;
    this.startWait = 0; // мелодия начинается со старта партии (`onStart`)
    this.buildLevel();
  }

  protected override onStart(): void {
    this.startWait = START_WAIT_TICKS;
  }

  protected update(input: BrickInput): void {
    const frog = this.frog;
    if (!frog) return;
    const waiting = this.startWait > 0;
    if (waiting) this.startWait--;

    // как в главном цикле донора: сначала сдвиг дороги, потом разбор кнопок
    if (!waiting && this.advanceRoad()) return;

    const { flip } = this.rules;
    const left = this.keys.fire('left', input);
    const right = this.keys.fire('right', input);
    // у перевёрнутого поля кнопки «вверх» и «вниз» поменяны местами (`Game.keyPressed`): «вперёд» к дому — всегда на экране к нему
    const toward = this.keys.fire(flip ? 'down' : 'up', input);
    const away = this.keys.fire(flip ? 'up' : 'down', input);
    const big = this.keys.fire('rotate', input);
    const alt = this.keys.fire('fire', input);

    let dx = 0;
    let dy = 0;
    let moved = false;
    if (left) {
      dx -= 1;
      moved = true;
    }
    if (right) {
      dx += 1;
      moved = true;
    }
    if (!waiting) {
      if (away) {
        dy -= 2;
        moved = true;
      }
      // допущение: «вверх», большая кнопка и «огонь» — одно действие (у донора каждая прибавляла прыжок: вместе — двойной)
      if (toward || big || alt) {
        dy += frog.y < FROG_VERGE_Y ? 2 : 1;
        moved = true;
      }
    }
    if (!moved) return;
    if (this.jump(frog.x + dx, frog.y + dy)) this.emit({ type: 'move' });
    else this.die();
  }

  protected draw(): Uint8Array {
    const out = emptyField();
    const put = (x: number, y: number, value: number): void => {
      if (x < 0 || x >= BRICK_COLS || y < 0 || y >= BRICK_ROWS) return;
      out[cellIndex(x, this.screenRow(y))] = value;
    };
    for (let y = 1; y < FROG_VERGE_Y; y++) {
      for (let x = 0; x < BRICK_COLS; x++) if (this.roadCell(x, y)) put(x, y, CELL_ON);
    }
    for (let x = 0; x < BRICK_COLS; x++) if (this.home[x] && !this.homeErased(x)) put(x, FROG_HOME_Y, CELL_ON);
    if (this.frog) put(this.frog.x, this.frog.y, CELL_BLINK);
    return out;
  }

  // ---------------------------------------------------------------- дорога

  /** Строка матрицы (0 — верх) для ряда донора (0 — низ). Перевёрнутое поле (`getInvertedVerticalBoard`) выводит ряды как есть. */
  protected screenRow(y: number): number {
    return this.rules.flip ? y : BRICK_ROWS - 1 - y;
  }

  /** Занята ли клетка дороги: сплошные разделители, машины на полосах (ряды 0, 18 пусты, ряд 19 — дом, см. `blocked`). */
  protected roadCell(x: number, y: number): boolean {
    if (x < 0 || x >= BRICK_COLS || y < 1 || y >= FROG_VERGE_Y) return false;
    if (y % 2 === 1) return true;
    const lane = y / 2 - 1;
    return this.lanes[lane]?.[((this.offsets[lane] ?? 0) + x) % LANE_LENGTH] === true;
  }

  /** Горит ли клетка для столкновения: дорога или уже занятый дом (`checkCollision` по полю без лягушки). */
  protected blocked(x: number, y: number): boolean {
    return y === FROG_HOME_Y ? this.home[x] === true : this.roadCell(x, y);
  }

  /** Куда едут машины полосы на экране: +1 — вправо, −1 — влево (встречные полосы — против остальных). */
  protected laneStep(lane: number): number {
    const direct = this.rules.leftToRight ? 1 : -1;
    return this.rules.oncoming && this.oncoming.has(lane) ? -direct : direct;
  }

  /** Тактов между сдвигами дороги: `3 × getSpeed(true)` донора. */
  protected shiftPeriod(): number {
    return genuineTicks(this.speed, SPEED_OF_FIRST_LEVEL_MS, SPEED_OF_TENTH_LEVEL_MS) * ROAD_SHIFT_FACTOR;
  }

  /** Отсчёт до очередного сдвига; `true` — лягушка погибла (сценка взрыва уже запущена). */
  private advanceRoad(): boolean {
    this.roadClock++;
    if (this.roadClock < this.shiftPeriod()) return false;
    this.roadClock = 0;
    return this.shiftRoad();
  }

  /** `shiftRoad` донора: каждая полоса на клетку, затем перенос лягушки и проверка её столкновения. `true` — лягушка погибла. */
  private shiftRoad(): boolean {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      // машины едут вправо — окно сдвигается по узору влево, и наоборот
      this.offsets[lane] = wrapLane((this.offsets[lane] ?? 0) - this.laneStep(lane));
    }
    const frog = this.frog;
    if (!frog) return false;
    // в варианте с переносом лягушка едет со своей полосой; ряд 18 — «полоса» 8, не встречная (так у донора, и на обочине тоже сносит)
    if (this.rules.carry && frog.y > 0 && frog.y < FROG_HOME_Y) frog.x += this.laneStep(Math.floor((frog.y - 1) / 2));
    const hitWall = frog.x < 0 || frog.x >= BRICK_COLS;
    if (hitWall || this.roadCell(frog.x, frog.y)) {
      this.die();
      return true;
    }
    return false;
  }

  /** `loadNewLevel` донора: новая дорога (случайная — заново на каждую жизнь), полосы встают в позицию уровня, лягушка на старт. */
  private buildLevel(): void {
    this.oncoming = oncomingLanes(this.rng, this.level, this.rules.preloaded);
    this.lanes = this.rules.preloaded ? preloadedLanes() : randomLanes(this.rng);
    this.offsets = new Array<number>(LANE_COUNT).fill(this.level - 1);
    this.roadClock = ROAD_IDLE;
    this.keys.reset();
    this.frog = { x: FROG_START_X, y: 0 };
  }

  /** Начало уровня после потери жизни или победы: мелодия старта (донорская `playAndWaitMusic`). */
  private beginLevel(): void {
    this.buildLevel();
    this.startWait = START_WAIT_TICKS;
    this.emit({ type: 'started' });
  }

  // ---------------------------------------------------------------- прыжки, дом, гибель

  /**
   * `jumpFrog` донора. `true` — прыжок удался (или упёрся в нижний край: тогда ничего не происходит, но «шаг» засчитан);
   * `false` — стена по бокам, машина, разделитель или занятый дом: лягушка погибает.
   */
  private jump(x: number, y: number): boolean {
    if (y < 0 || y >= BRICK_ROWS) return true;
    if (x < 0 || x >= BRICK_COLS) return false;
    if (this.blocked(x, y)) return false;
    const frog = this.frog;
    if (!frog) return true;
    if (y === FROG_HOME_Y) {
      this.reachHome(x, frog.x);
    } else {
      frog.x = x;
      frog.y = y;
    }
    return true;
  }

  /** `checkForWin` донора: очко, дом заполнен, либо новая лягушка на старт. `fromX` — колонка до прыжка (от неё стирается ряд). */
  private reachHome(x: number, fromX: number): void {
    this.home[x] = true;
    this.frog = null;
    this.emit({ type: 'lock' });
    this.addScore(SCORE_PER_FROG);
    if (this.home.every(Boolean)) this.celebrate(fromX);
    else this.frog = { x: FROG_START_X, y: 0 };
  }

  /**
   * Все десять домов заполнены: ряд стирается в обе стороны от колонки прыжка, +10 очков, пауза, очистка поля,
   * следующий уровень (после десятого — первый, скорость выше) и мелодия старта.
   */
  private celebrate(centerX: number): void {
    this.emit({ type: 'lines', count: 1, rows: [this.screenRow(FROG_HOME_Y)] });
    this.homeCenter = centerX;
    const steps = Math.max(centerX, BRICK_COLS - centerX);
    this.cutscene(
      steps * HOME_STEP_TICKS,
      (elapsed) => {
        this.homeCleared = Math.min(steps, Math.floor(elapsed / HOME_STEP_TICKS) + 1);
      },
      () => {
        this.addScore(SCORE_PER_ROW);
        this.cutscene(HOME_HOLD_TICKS, null, () => {
          this.emit({ type: 'win' });
          this.animateClear(CLEAR_WIN_TICKS, () => {
            this.home.fill(false);
            this.homeCleared = 0;
            this.nextLevel();
            this.beginLevel();
          });
        });
      },
    );
  }

  /** Клетка дома уже стёрта анимацией (по клетке в обе стороны от колонки прыжка за шаг). */
  private homeErased(x: number): boolean {
    return this.homeCleared > 0 && x >= this.homeCenter - this.homeCleared && x <= this.homeCenter + this.homeCleared - 1;
  }

  /** `loss` донора: взрыв, потеря жизни; жизни остались — очистка поля и тот же уровень заново, иначе конец игры. */
  private die(): void {
    const frog = this.frog;
    if (!frog) return;
    this.emit({ type: 'explode' });
    this.animateKaboom(frog.x, this.screenRow(frog.y), () => {
      this.setLives((this.lives ?? 0) - 1);
      this.emit({ type: 'lifeLost' });
      if ((this.lives ?? 0) > 0) {
        this.animateClear(CLEAR_LOSE_TICKS, () => this.beginLevel());
      } else {
        this.frog = null; // взрыв стёр лягушку; под заливкой конца игры её не видно
        this.gameOver();
      }
    });
  }
}

export const froggerDef: BrickGameDef = {
  id: 'frog',
  // число вариантов на настоящем устройстве не установлено; реализованы типы 1–16 из 32 донорских
  declaredModes: null,
  modes: FROGGER_MODES,
  create: (options) => new FroggerGame(options),
};
