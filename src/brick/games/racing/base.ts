/**
 * Общая основа гонок и гонок со стрельбой: машина игрока на полосах, поток встречных машин, ускорение, столкновения,
 * жизни, очки, рост скорости и уровня. Правила — из `RacingGame` и `GameWithLives` донора; игры-наследники добавляют
 * только своё (стрельба — `RacingShootGame`).
 *
 * Время — такты: шаг дороги по «настоящей» скорости донора, автоповтор кнопок донора (`setKeyDelay`) — `Repeater`,
 * 1500 мс «стартовой мелодии» перед уровнем — сценка без ввода.
 */
import { BrickBase, CLEAR_LOSE_TICKS, MAX_LIVES } from '../../base';
import { cellIndex, emptyField } from '../../grid';
import { Repeater, msToTicks } from '../../timing';
import {
  BRICK_COLS,
  CELL_BLINK,
  CELL_ON,
  MAX_LEVEL,
  MIN_LEVEL,
  MIN_SPEED,
  type BrickAction,
  type BrickGameOptions,
  type BrickInput,
} from '../../types';
import {
  CAR_MIN_Y,
  CAR_ROWS,
  CAR_Y,
  Road,
  borderLit,
  carsOverlap,
  halfStepTicks,
  roadLayout,
  type RoadLayout,
} from './road';

/** Каждые столько очков скорость растёт на единицу (`LEVELUP_POINT` донора). */
export const LEVELUP_POINT = 50;
/** Очков на добавочную жизнь (`getScoresToExtraLife()` донора). */
export const SCORES_TO_EXTRA_LIFE = 2000;
/** «Стартовая мелодия» донора перед каждым уровнем (`START_MUSIC_DURATION`), в тактах. */
export const INTRO_TICKS = msToTicks(1500);
/** Автоповтор перестроения: донор откладывает кнопку на 3 × `ANIMATION_DELAY` = 90 мс. */
export const LANE_REPEAT_TICKS = msToTicks(90);
/** Автоповтор ускорения: донор откладывает «вверх»/ROTATE на `ANIMATION_DELAY` = 30 мс. */
export const ACCEL_REPEAT_TICKS = msToTicks(30);

/** Начальная полоса: индекс 1 (`curPosition = 1`) — правая из двух либо средняя из трёх. */
const START_LANE = 1;

/** Кнопка с точки зрения игры: `fire` — то же, что `rotate`; в перевёрнутых вариантах «вверх» и «вниз» меняются местами (как `keyPressed` донора). */
const translate = (action: BrickAction, inverted: boolean): BrickAction => {
  if (action === 'fire') return 'rotate';
  if (inverted && action === 'up') return 'down';
  if (inverted && action === 'down') return 'up';
  return action;
};

export abstract class RacingBase extends BrickBase {
  protected get carRows(): readonly string[] { return CAR_ROWS; }
  protected get carY(): number { return CAR_Y; }
  protected readonly layout: RoadLayout;
  protected readonly road: Road;
  /** Индекс полосы машины игрока и её центр по x. */
  protected lane = START_LANE;
  protected carX = 0;

  /** Тактов с прошлого шага дороги (`elapsedTime` донора). */
  private sinceStep = 0;
  /** Донорский `oddMove`: рамка сдвигается каждый шаг, машины — через шаг. */
  private oddMove = false;
  private readonly steer = new Repeater(LANE_REPEAT_TICKS, LANE_REPEAT_TICKS);
  protected readonly accelKeys = new Repeater(ACCEL_REPEAT_TICKS, ACCEL_REPEAT_TICKS);

  protected constructor(options: BrickGameOptions, modeCount: number) {
    super(options, modeCount);
    this.layout = roadLayout(this.mode);
    this.road = new Road(this.layout, this.fieldRows, this.carRows);
  }

  // ---------------------------------------------------------------- что дополняют игры

  /** Новый уровень: сбросить своё (снаряды, оружие). Вызывается из `setupRoad` до появления первых машин. */
  protected onSetup(): void {
    // у обычных гонок своего нет
  }

  /** Машины сдвинулись на клетку и (возможно) добавились новые: `road.lastSpawn` — добавленные в этот раз. */
  protected onTraffic(): void {
    // у обычных гонок своего нет
  }

  /** Default donor scoring counts opponents that leave the road. */
  protected scorePassed(passed:number):void { for(let i=0;i<passed;i++)this.addScore(1); }

  /** Interval between border half-steps; device profiles may use their own timer. */
  protected get roadStepTicks():number { return halfStepTicks(this.speed, this.level, this.layout.wide); }

  /** Каждый такт после шага дороги и до обработки кнопок. */
  protected tickWorld(): void {
    // у обычных гонок своего нет
  }

  /** Машина игрока перестроилась без аварии. */
  protected onCarMoved(): void {
    // у обычных гонок своего нет
  }

  /** Авария: убрать снаряды и т. п. до взрыва. */
  protected onCrash(): void {
    // у обычных гонок своего нет
  }

  /** Мигающие клетки надстроек (донорские x, y): рисуются поверх дороги и встречных машин, под машиной игрока. */
  protected blinkCells(): readonly (readonly [number, number])[] {
    return [];
  }

  /** Нос машины игрока мигает (оружие заряжено). */
  protected get armed(): boolean {
    return false;
  }

  /** Кнопки действия: у обычных гонок «вверх» и ROTATE/«огонь» ускоряют (`KeyUp` / `KeyRotate` донора). */
  protected handleKeys(input: BrickInput): void {
    const up = this.accelKeys.fire('up', input);
    const rotate = this.accelKeys.fire('rotate', input);
    if (up || rotate) this.accelerate();
  }

  // ---------------------------------------------------------------- BrickBase

  protected reset(): void {
    this.setLives(MAX_LIVES);
    this.scoresToExtraLife = SCORES_TO_EXTRA_LIFE;
    this.setupRoad();
  }

  protected override onStart(): void {
    this.intro();
  }

  protected update(raw: BrickInput): void {
    const input = this.mapInput(raw);

    // шаг дороги по таймеру: рамка каждый раз, машины через раз
    this.sinceStep++;
    if (this.sinceStep >= this.roadStepTicks) {
      this.sinceStep = 0;
      this.oddMove = !this.oddMove;
      this.advance(this.oddMove);
      if (this.busy) return;
    }

    this.tickWorld();
    if (this.busy) return;

    // перестроение: сначала влево, потом вправо, как в `processKeys` донора
    if (this.steer.fire('left', input)) this.changeLane(-1);
    if (this.busy) return;
    if (this.steer.fire('right', input)) this.changeLane(1);
    if (this.busy) return;

    this.handleKeys(input);
  }

  protected draw(): Uint8Array {
    const out = emptyField();
    const wide = this.layout.wide;
    for (let y = 0; y < this.fieldRows; y++) {
      if (!borderLit(y, this.road.borderPhase)) continue;
      this.plot(out, BRICK_COLS - 1, y, CELL_ON);
      if (!wide) this.plot(out, 0, y, CELL_ON);
    }
    for (const opponent of this.road.opponents) this.plotCar(out, opponent.x, opponent.y, false);
    for (const [x, y] of this.blinkCells()) this.plot(out, x, y, CELL_BLINK);
    this.plotCar(out, this.carX, this.carY, this.armed);
    return out;
  }

  // ---------------------------------------------------------------- помощники для игр

  /** Поставить клетку по донорским координатам (x, y снизу вверх); в перевёрнутых вариантах «низ» дороги — верх экрана. */
  protected plot(out: Uint8Array, x: number, y: number, value: number): void {
    if (x < 0 || x >= BRICK_COLS || y < 0 || y >= this.fieldRows) return;
    out[cellIndex(x, this.screenRow(y))] = value;
  }

  /** Строка экрана (0 — верх) для донорской координаты y. */
  protected screenRow(y: number): number {
    return this.layout.inverted ? y : this.fieldRows - 1 - y;
  }

  /** Ускорение: лишний шаг дороги вне таймера (`moveOn(oddMove = !oddMove)` донора). */
  protected accelerate(): void {
    this.oddMove = !this.oddMove;
    this.advance(this.oddMove);
  }

  /** Увеличить счёт и, если он перешагнул очередные 50 очков, ускорить игру (`RacingGame.setScore` донора). */
  protected override setScore(value: number): void {
    const before = this.score;
    super.setScore(value);
    this.afterScoreChange(before);
  }

  protected afterScoreChange(before:number):void {
    if (Math.floor(this.score / LEVELUP_POINT) > Math.floor(before / LEVELUP_POINT)) {
      this.setSpeed(this.speed + 1);
      // скорость обернулась с 10 на 1 — уровень выше (после десятого — снова первый)
      if (this.speed === MIN_SPEED) this.level = this.level >= MAX_LEVEL ? MIN_LEVEL : this.level + 1;
      this.emit({ type: 'levelUp', speed: this.speed });
    }
  }

  // ---------------------------------------------------------------- внутреннее

  /** Подготовить дорогу к уровню (`loadNewLevel` донора): машина на стартовой полосе, одна встречная над полем. */
  protected setupRoad(): void {
    this.road.reset();
    this.lane = START_LANE;
    this.carX = this.layout.lanes[START_LANE] ?? 0;
    this.sinceStep = 0;
    this.oddMove = false;
    this.steer.reset();
    this.accelKeys.reset();
    this.onSetup();
    this.road.spawn(this.level, this.rng);
    // первый `moveOn(true)` донора: рамка встаёт в фазу 0, первая машина въезжает в верхнюю строку
    this.advance(true);
  }

  /** Сценка «стартовой мелодии»: поле видно, ввод не действует. */
  protected intro(): void {
    this.cutscene(INTRO_TICKS, null, () => undefined);
  }

  /** Один шаг дороги: рамка и (если `withTraffic`) встречные машины. */
  private advance(withTraffic: boolean): void {
    this.road.shiftBorder();
    if (!withTraffic) return;
    const result = this.road.scroll(this.carX, this.carY);
    this.scorePassed(result.passed);
    if (result.crashed) {
      this.crash(this.carX, this.carY + CAR_MIN_Y + this.carRows.length - 1);
      return;
    }
    this.road.spawn(this.level, this.rng);
    this.onTraffic();
  }

  /** Перестроение на соседнюю полосу (`moveCar` донора): влететь в чужую машину — авария. */
  private changeLane(delta: number): void {
    const lane = this.lane + delta;
    const x = this.layout.lanes[lane];
    if (x === undefined) return;
    const accident = this.road.opponents.some((opponent) => carsOverlap(x, this.carY, opponent.x, opponent.y, this.carRows));
    this.lane = lane;
    this.carX = x;
    if (accident) {
      this.crash(x, this.carY);
      return;
    }
    this.emit({ type: 'move' });
    this.onCarMoved();
  }

  /** Авария (`GameWithLives.loss` донора): взрыв, минус жизнь, очистка поля и новая попытка либо конец игры. */
  protected crash(x: number, y: number): void {
    this.emit({ type: 'crash' });
    this.onCrash();
    this.animateKaboom(x, this.screenRow(y), () => this.loseLife());
  }

  private loseLife(): void {
    this.setLives((this.lives ?? 0) - 1);
    this.emit({ type: 'lifeLost' });
    if ((this.lives ?? 0) > 0) {
      this.animateClear(CLEAR_LOSE_TICKS, () => {
        this.setupRoad();
        this.intro();
      });
    } else {
      this.gameOver();
    }
  }

  /** Рисует машину; у заряженной нос мигает. */
  private plotCar(out: Uint8Array, cx: number, cy: number, armed: boolean): void {
    this.carRows.forEach((row, index) => {
      const dy = CAR_MIN_Y + index;
      for (let col = 0; col < row.length; col++) {
        if (row[col] !== '#') continue;
        const nose = armed && dy === CAR_MIN_Y + this.carRows.length - 1;
        this.plot(out, cx + col - 1, cy + dy, nose ? CELL_BLINK : CELL_ON);
      }
    });
  }

  private mapInput(input: BrickInput): BrickInput {
    const inverted = this.layout.inverted;
    if (!inverted && !input.pressed.has('fire') && !input.held.has('fire')) return input;
    const map = (set: ReadonlySet<BrickAction>): Set<BrickAction> => {
      const out = new Set<BrickAction>();
      for (const action of set) out.add(translate(action, inverted));
      return out;
    };
    return { pressed: map(input.pressed), held: map(input.held) };
  }
}
