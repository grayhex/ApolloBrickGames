/**
 * «Арканоид» (меню игрушки «Морской бой», пункт F; на наклейке, вероятно, «ТЕННИС» — допущение): платформа внизу (и вверху в
 * двухсторонних вариантах), мяч, стена кирпичей, четыре жизни, десять уровней.
 *
 * Правила — порт `ArkanoidGame` донора (n0Live/BrickGame, MIT) вместе с `BallUtils` (шаг мяча), `ArkanoidPlatformShape`
 * (платформа из 1..4 клеток), `BricksWall` (стены, см. `arkanoid/wall.ts`) и `GameWithLives` (жизни, победа, перезапуск уровня).
 * Блокирующие циклы и `sleep()` донора заменены тактовым автоматом: таймеры — в тактах, паузы — `cutscene`, взрыв и очистка поля —
 * `animateKaboom` и `animateClear` основы.
 *
 * Поле хранится так же, как у донора: `y = 0` — нижний ряд, платформа лежит на `y = 0`, мяч стартует на `y = 1`. Перевод в систему
 * экрана (строка 0 — верх) делает только `draw()`. Игра хранит поле целиком и проверяет столкновения по нему, как донор, поэтому
 * его особенности (мяч «стоит» на месте в такт отскока, кирпич может сдвинуться в клетку мяча) воспроизводятся сами.
 *
 * 32 варианта = 32 первых «типа» донора (тип = номер варианта + 1). Тип определяет четыре признака:
 *  - размер платформы: 4, 3, 2, 1 клетка (тип по модулю 4: 1, 2, 3, 0);
 *  - готовые стены (типы 1..16) или случайные (17..32);
 *  - сдвигающаяся стена (типы 5..8 в каждой восьмёрке);
 *  - платформы с двух сторон поля (типы 9..16 в каждой шестнадцатёрке).
 * Вторая половина типов донора (33..64) — те же правила с перевёрнутым полем и обменянными «вверх» / «вниз»; в 32 варианта она не
 * входит (допущение: на устройстве 32 режима, соответствие номеров вариантов Apollo типам донора неизвестно).
 */
import { BrickBase, CLEAR_LOSE_TICKS, CLEAR_WIN_TICKS } from '../base';
import { emptyField, inField } from '../grid';
import { Repeater, genuineTicks, msToTicks } from '../timing';
import {
  BRICK_CELLS,
  BRICK_COLS,
  BRICK_ROWS,
  CELL_ON,
  makeBrickInput,
  type BrickGameDef,
  type BrickGameOptions,
  type BrickInput,
  type BrickModeDef,
} from '../types';
import { BricksWall } from './arkanoid/wall';

const COLS = BRICK_COLS;
const ROWS = BRICK_ROWS;

/** Донорская пауза анимации (`ANIMATION_DELAY`), мс. */
export const ANIMATION_DELAY_MS = 30;
/** Скорость мяча по формуле донора: 400 мс на шаг на скорости 1 и 80 мс на скорости 10 (`getSpeedOfFirstLevel/TenthLevel`). */
export const FIRST_LEVEL_MS = 400;
export const TENTH_LEVEL_MS = 80;
/** Ожидание перед мячом после загрузки уровня: «стартовая мелодия» донора, 1500 мс (`START_MUSIC_DURATION`) = 90 тактов. */
export const INTRO_TICKS = msToTicks(1500);
/** Стена сдвигается раз в `getSpeedOfFirstLevel()` = 400 мс независимо от скорости игры. */
export const SHIFT_TICKS = msToTicks(FIRST_LEVEL_MS);
/** Удар по мячу кнопкой: повтор не чаще, чем раз в `ANIMATION_DELAY * 2` = 60 мс. */
export const KICK_TICKS = msToTicks(ANIMATION_DELAY_MS * 2);
/** Очки до добавочной жизни (`getScoresToExtraLife`). */
export const SCORES_TO_EXTRA_LIFE = 1000;
export const START_LIVES = 4;
/** Очков за выбитый кирпич (`breakBrick`: `setScore(getScore() + 1)`). */
export const BRICK_SCORE = 1;
/** Множитель шага мяча для платформы из одной клетки и его уменьшение на каждую следующую клетку (`slowestSpeed` и `speedStep` в `call()` донора): 1,2 … 0,6. */
export const BALL_FACTOR_SLOWEST = 1.2;
export const BALL_FACTOR_STEP = 0.2;
/** Платформа и мяч в начале уровня: центр поля. */
const START_X = COLS / 2 - 1;
/** «Мяч готов к шагу»: после вступления первый шаг делается сразу (в доноре `elapsedTime` давно истёк). */
const BALL_READY = 1 << 20;

/** Клетки платформы по типу донора 0..3 (`ArkanoidPlatformShape.charactersTable`): сдвиг от `curX` слева и справа. */
const PLATFORM_SPAN: readonly { readonly min: number; readonly max: number }[] = [
  { min: 0, max: 0 }, // 1 клетка
  { min: 0, max: 1 }, // 2 клетки
  { min: -1, max: 1 }, // 3 клетки
  { min: -1, max: 2 }, // 4 клетки
];

const KICK_NONE = makeBrickInput();
const KICK_PRESSED = makeBrickInput(['rotate']);
const KICK_HELD = makeBrickInput([], ['rotate']);

/** Признаки варианта; вычисляются из номера типа донора (см. шапку файла). */
export interface ArkanoidVariant {
  /** Тип платформы по донору: 0 — 1 клетка, 3 — 4 клетки. */
  readonly platformType: number;
  readonly cells: number;
  /** Готовые стены (иначе случайные). */
  readonly preloaded: boolean;
  /** Стена едет по кругу вбок. */
  readonly shifting: boolean;
  /** Платформы внизу и вверху поля. */
  readonly doubleSided: boolean;
}

/** Признаки варианта (номер с нуля) — формулы `ArkanoidGame`: `getType() % 4`, `<= 16`, `% 8 >= 5`, `% 16 >= 9`. */
export function arkanoidVariant(mode: number): ArkanoidVariant {
  const type = mode + 1;
  const platformType = type % 4 === 0 ? 0 : 4 - (type % 4);
  return {
    platformType,
    cells: platformType + 1,
    preloaded: type <= 16,
    shifting: type % 8 >= 5 || type % 8 === 0,
    doubleSided: type % 16 >= 9 || type % 16 === 0,
  };
}

/** Число вариантов: 32 первых типа донора. */
export const MODE_COUNT = 32;

function describeMode(index: number): BrickModeDef {
  const v = arkanoidVariant(index);
  const ru = [`Платформа ${v.cells}`, v.preloaded ? 'готовые стены' : 'случайные стены'];
  const en = [`Paddle ${v.cells}`, v.preloaded ? 'preset walls' : 'random walls'];
  if (v.shifting) {
    ru.push('стена едет');
    en.push('shifting wall');
  }
  if (v.doubleSided) {
    ru.push('платформы с двух сторон');
    en.push('paddles on both sides');
  }
  const note =
    `Донор: ArkanoidGame, тип ${index + 1}. Платформа ${v.cells} кл., ` +
    `${v.preloaded ? 'готовые стены уровней' : 'случайные стены'}, ` +
    `${v.shifting ? 'стена сдвигается каждые 400 мс' : 'стена неподвижна'}, ` +
    `${v.doubleSided ? 'платформы внизу и вверху' : 'платформа внизу'}. ` +
    'Допущение: номер варианта на устройстве совпадает с номером типа донора (смысл 32 режимов Apollo неизвестен).';
  return { name: { ru: ru.join(', '), en: en.join(', ') }, note };
}

export const ARKANOID_MODES: readonly BrickModeDef[] = Array.from({ length: MODE_COUNT }, (_, index) => describeMode(index));

export class ArkanoidGame extends BrickBase {
  readonly id = 'arkanoid';

  private readonly variant: ArkanoidVariant;
  private readonly platformMin: number;
  private readonly platformMax: number;
  /** Во сколько раз мяч медленнее/быстрее «настоящей» скорости: 1,2 для платформы из 1 клетки, 0,6 для платформы из 4 клеток. */
  private readonly speedFactor: number;
  private readonly moveRepeater: Repeater;
  private readonly kickRepeater = new Repeater(KICK_TICKS, KICK_TICKS);

  /** Поле как у донора: индекс `y * COLS + x`, `y` = 0 — нижний ряд. Платформа, мяч и стена лежат в одном буфере. */
  private readonly seaLayout: boolean;
  private board = new Uint8Array(BRICK_CELLS);
  private wall: BricksWall = BricksWall.preloaded(1);
  /** Нижний ряд стены на поле (в системе донора). */
  private bricksY = 0;
  /** Центр платформы. Нижняя платформа лежит на `y = 0`, верхняя (двухсторонний вариант) — на `y = ROWS - 1`. */
  private curX = START_X;
  private ballX = START_X;
  private ballY = 1;
  /** Направление мяча: по горизонтали +1 вправо / -1 влево, по вертикали +1 вверх / -1 вниз. */
  private dirX = 1;
  private dirY = 1;
  /** Сколько тактов ещё ждёт «стартовая мелодия»: мяч стоит, платформа двигается. */
  private introLeft = 0;
  /** Тактов с последнего шага мяча по таймеру. */
  private ballClock = BALL_READY;
  /** Тактов до следующего сдвига стены. */
  private shiftLeft = 1;

  constructor(options: BrickGameOptions = {}) {
    super(options, MODE_COUNT);
    this.seaLayout = options.seaLayout === true;
    this.variant = arkanoidVariant(this.mode);
    const span = PLATFORM_SPAN[this.variant.platformType] ?? { min: 0, max: 0 };
    this.platformMin = span.min;
    this.platformMax = span.max;
    this.speedFactor = BALL_FACTOR_SLOWEST - this.variant.platformType * BALL_FACTOR_STEP;
    // чем меньше платформа, тем медленнее она ездит: `MOVEMENT_SPEED` донора = 30 мс * (1,75 - тип * 0,25)
    const moveTicks = msToTicks(Math.round(ANIMATION_DELAY_MS * (1.75 - this.variant.platformType * 0.25)));
    this.moveRepeater = new Repeater(moveTicks, moveTicks);
    this.init();
  }

  protected reset(): void {
    this.setLives(START_LIVES);
    this.scoresToExtraLife = SCORES_TO_EXTRA_LIFE;
    this.moveRepeater.reset();
    this.kickRepeater.reset();
    this.shiftLeft = 1; // таймер сдвига донора стартует без задержки: первый сдвиг — в первом же такте игры
    this.loadLevel(true);
  }

  protected update(input: BrickInput): void {
    // стена едет и во время вступления (в доноре таймер идёт, пока статус Running)
    if (this.variant.shifting && --this.shiftLeft <= 0) {
      this.shiftLeft = SHIFT_TICKS;
      this.shiftBricks();
    }

    const started = this.introLeft <= 0;
    if (!started) {
      this.introLeft--;
    } else if (++this.ballClock >= this.ballPeriod()) {
      this.ballClock = 0;
      this.moveBall();
      if (this.busy) return;
    }

    // кнопки (порядок как в `processKeys` донора: влево, вправо, удар)
    if (this.moveRepeater.fire('left', input) && this.movePlatform(this.curX - 1)) this.emit({ type: 'move' });
    if (this.moveRepeater.fire('right', input) && this.movePlatform(this.curX + 1)) this.emit({ type: 'move' });
    const kickInput = input.pressed.has('rotate') || input.pressed.has('fire')
      ? KICK_PRESSED
      : input.held.has('rotate') || input.held.has('fire')
        ? KICK_HELD
        : KICK_NONE;
    if (this.kickRepeater.fire('rotate', kickInput) && started) {
      // «удар»: лишний шаг мяча сразу, не дожидаясь таймера
      this.emit({ type: 'rotate' });
      this.moveBall();
    }
  }

  protected draw(): Uint8Array {
    const out = emptyField();
    for (let y = 0; y < ROWS; y++) {
      const screenRow = ROWS - 1 - y;
      for (let x = 0; x < COLS; x++) out[screenRow * COLS + x] = this.board[y * COLS + x] ?? 0;
    }
    return out;
  }

  protected override drawPreview(): Uint8Array | null {
    if (!this.seaLayout) return super.drawPreview();
    const out = new Uint8Array(16); out.fill(1, 0, (this.lives ?? 0) * 2); return out;
  }

  // ---------------------------------------------------------------- уровень

  /** Загрузка или перезагрузка уровня (`loadLevel`): платформа и мяч в центре, мяч летит вверх-вправо; стена новая только при `newWall`. */
  private loadLevel(newWall: boolean): void {
    this.board.fill(0);
    const seaOpening = this.seaLayout && this.mode === 0 && this.level === 1;
    this.curX = seaOpening ? 2 : START_X;
    this.ballX = seaOpening ? 1 : this.curX;
    this.ballY = 1;
    this.dirY = 1;
    // допущение: вращение по часовой стрелке (настройка донора по умолчанию; у донора его меняют в паузе кнопкой поворота)
    this.dirX = 1;
    if (newWall) {
      this.wall = seaOpening ? BricksWall.seaPhoto() : this.variant.preloaded ? BricksWall.preloaded(this.level) : BricksWall.generated(this.level, this.rng);
      this.bricksY = seaOpening ? ROWS - this.wall.height - 4 : this.variant.doubleSided ? Math.floor((ROWS - this.wall.height) / 2) : ROWS - this.wall.height;
    }
    this.insertWall();
    this.drawBall(this.ballX, this.ballY);
    this.movePlatform(this.curX);
    this.introLeft = INTRO_TICKS;
    this.ballClock = BALL_READY;
  }

  /** Победа в уровне (`GameWithLives.win`): очистка поля, следующий уровень (после десятого — первый, скорость выше), новая стена. */
  private win(): void {
    this.emit({ type: 'win' });
    this.animateClear(CLEAR_WIN_TICKS, () => {
      this.nextLevel();
      this.loadLevel(true);
    });
  }

  /**
   * Потеря мяча (`GameWithLives.loss`): взрыв на месте мяча, минус жизнь; жизни остались — очистка и тот же уровень
   * (стена как была), иначе конец игры.
   */
  private loss(): void {
    this.emit({ type: 'explode' });
    this.animateKaboom(this.ballX, ROWS - 1 - this.ballY, () => {
      this.setLives((this.lives ?? 0) - 1);
      this.emit({ type: 'lifeLost' });
      if ((this.lives ?? 0) > 0) this.animateClear(CLEAR_LOSE_TICKS, () => this.loadLevel(false));
      else this.gameOver();
    });
  }

  // ---------------------------------------------------------------- мяч

  /** Период шага мяча, такты: «настоящая» скорость * (1,2 - 0,2 * тип платформы); в двухстороннем варианте ещё + 30 мс. */
  private ballPeriod(): number {
    const base = genuineTicks(this.speed, FIRST_LEVEL_MS, TENTH_LEVEL_MS);
    const period = Math.max(1, Math.round(base * this.speedFactor));
    return this.variant.doubleSided ? period + msToTicks(ANIMATION_DELAY_MS) : period;
  }

  /** Занята ли клетка (платформа, мяч, кирпич). Вне поля — нет, как у донора (его `getCell` вне поля возвращает «пусто»). */
  private occupied(x: number, y: number): boolean {
    return inField(x, y) && this.board[y * COLS + x] !== 0;
  }

  /** Клетка `(x, y)` — платформа (нижняя, а в двухстороннем варианте и верхняя) (`isPlatform`). */
  private isPlatform(x: number, y: number): boolean {
    const onPlatformRow = y === 0 || (this.variant.doubleSided && y === ROWS - 1);
    return onPlatformRow && x >= this.curX + this.platformMin && x <= this.curX + this.platformMax;
  }

  /** Шаг мяча (`ArkanoidGame.moveBall` с `BallUtils.moveBall`). */
  private moveBall(): void {
    let newX = this.ballX + this.dirX;
    let newY = this.ballY + this.dirY;

    // мяч упал за нижний край (а в двухстороннем варианте и за верхний) — потеря жизни
    if (newY < 0 || (this.variant.doubleSided && newY >= ROWS)) {
      this.loss();
      return;
    }

    // отскок от стен поля; верх поля отражает мяч только в односторонних вариантах
    let bounce = false;
    if (newY >= ROWS) {
      this.dirY = -1;
      bounce = true;
    }
    if (newX < 0 || newX >= COLS) {
      this.dirX = -this.dirX;
      bounce = true;
    }
    if (bounce) {
      newX = this.ballX + this.dirX;
      newY = this.ballY + this.dirY;
    }

    // кирпич, оказавшийся под мячом (стена сдвинулась), разбивается
    this.breakBrick(this.ballX, this.ballY);

    // столкновение с кирпичом или платформой: сначала клетки, которых мяч касается гранью, потом — вершиной
    if (this.occupied(newX, this.ballY) || this.occupied(this.ballX, newY) || this.occupied(newX, newY)) {
      if (this.occupied(newX, this.ballY) || this.occupied(this.ballX, newY)) {
        if (this.occupied(newX, this.ballY)) {
          this.dirX = -this.dirX;
          if (this.isPlatform(newX, this.ballY)) bounce = true;
          else this.breakBrick(newX, this.ballY);
        }
        if (this.occupied(this.ballX, newY)) {
          this.dirY = -this.dirY;
          if (this.isPlatform(this.ballX, newY)) bounce = true;
          else this.breakBrick(this.ballX, newY);
        }
      } else {
        this.dirX = -this.dirX;
        this.dirY = -this.dirY;
        if (this.isPlatform(newX, newY)) bounce = true;
        else this.breakBrick(newX, newY);
      }
      // после отскока от препятствия мяч в этот шаг остаётся на месте
      newX = this.ballX;
      newY = this.ballY;
    }
    this.drawBall(newX, newY);

    if (bounce) this.emit({ type: 'rotate' });
    if (this.wall.remaining <= 0) this.win();
  }

  /** Нарисовать мяч в новой клетке и стереть из старой (`BallUtils.drawBall`). */
  private drawBall(x: number, y: number): void {
    if (inField(this.ballX, this.ballY)) this.board[this.ballY * COLS + this.ballX] = 0;
    if (inField(x, y)) this.board[y * COLS + x] = CELL_ON;
    this.ballX = x;
    this.ballY = y;
  }

  // ---------------------------------------------------------------- стена

  /** Разбить кирпич в клетке поля `(x, y)`: стена перерисовывается, очко за кирпич (`breakBrick`). */
  private breakBrick(x: number, y: number): void {
    if (!this.wall.breakBrick(x, y - this.bricksY)) return;
    this.emit({ type: 'hit' });
    this.insertWall();
    this.addScore(BRICK_SCORE);
  }

  /** Вставить стену в поле целиком (`insertCellsToBoard`): пустые клетки стены тоже стирают то, что лежало на её месте. */
  private insertWall(): void {
    for (let wy = 0; wy < this.wall.height; wy++) {
      const y = this.bricksY + wy;
      if (y < 0 || y >= ROWS) continue;
      for (let x = 0; x < COLS; x++) this.board[y * COLS + x] = this.wall.has(x, wy) ? CELL_ON : 0;
    }
  }

  /** Сдвиг стены на клетку по кругу (`shiftBricks`): вправо при вращении по часовой; мяч перерисовывается поверх стены. */
  private shiftBricks(): void {
    this.wall.shift(1);
    this.insertWall();
    this.drawBall(this.ballX, this.ballY);
  }

  // ---------------------------------------------------------------- платформа

  private paintPlatform(x: number, value: number): void {
    for (let dx = this.platformMin; dx <= this.platformMax; dx++) {
      const cx = x + dx;
      if (!inField(cx, 0)) continue;
      this.board[cx] = value;
      if (this.variant.doubleSided) this.board[(ROWS - 1) * COLS + cx] = value;
    }
  }

  /** Сдвинуть платформу в `x`; `false`, если она вышла бы за край. Мяч над платформой едет вместе с ней (`movePlatform`). */
  private movePlatform(x: number): boolean {
    if (x + this.platformMin < 0 || x + this.platformMax >= COLS) return false;
    this.paintPlatform(this.curX, 0);
    this.paintPlatform(x, CELL_ON);
    const onPlatform = this.ballY === 1 || (this.variant.doubleSided && this.ballY === ROWS - 2);
    if (onPlatform && this.ballX >= this.curX + this.platformMin && this.ballX <= this.curX + this.platformMax) {
      this.drawBall(this.ballX + x - this.curX, this.ballY);
    }
    this.curX = x;
    return true;
  }
}

export const arkanoidDef: BrickGameDef = {
  id: 'arkanoid',
  declaredModes: MODE_COUNT,
  modes: ARKANOID_MODES,
  create: (options) => new ArkanoidGame(options),
};
