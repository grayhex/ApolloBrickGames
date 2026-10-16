/**
 * Игра 5 консоли «168 в 1 танк»: стрельба по массиву и по отдельным точкам-врагам (`id: 'invaders'`).
 *
 * Правила — по донору (`games/InvadersGame.java` с `GameWithGun`, `GameWithLives`, `BricksWall`): сверху висит стена из кирпичей и
 * ступенчато опускается на одну строку; с каждым шагом от её нижнего ряда отделяется одна точка («шар») и летит по диагонали на
 * орудие, отскакивая от боковых краёв; пока она летит, стена стоит. Орудие стреляет вверх, пуля выбивает первую клетку на пути.
 * Стена коснулась орудия или шар попал в него — потеря жизни; выбиты все кирпичи (и шар исчез) — победа в уровне.
 *
 * Донор — симулятор, а не прошивка Apollo. Что изменено при переносе:
 * - потоки и `sleep()` заменены тактовым автоматом (60 Гц, `msToTicks`), «мелодия» перед уровнем — сценка;
 * - всё считается в донорской системе координат (y = 0 внизу), в строки экрана оно переводится только при рисовании;
 * - пасхалка донора «X-Dimension» (случайная рябь поля после «прострела» стены) не перенесена — к правилам игры она не относится.
 * Всё, чего у донора нет, помечено словом «допущение».
 */
import { BrickBase, CLEAR_LOSE_TICKS, CLEAR_WIN_TICKS } from '../base';
import { cellIndex, emptyField } from '../grid';
import { Repeater, genuineTicks, msToTicks } from '../timing';
import {
  BRICK_COLS,
  BRICK_ROWS,
  CELL_BLINK,
  CELL_ON,
  makeBrickInput,
  type BrickAction,
  type BrickGameDef,
  type BrickGameOptions,
  type BrickInput,
  type BrickModeDef,
} from '../types';
import {
  WALL_WIDTH,
  generatedWall,
  hasBrick,
  preloadedWall,
  rowHasBrick,
  shiftWall,
  type Wall,
} from './invaders/wall';

// ---------------------------------------------------------------- донорские числа

/** Сколько вариантов у игры в доноре (`InvadersGame.subtypesNumber`). */
const MODE_COUNT = 16;
/** Орудие (`GunShape`): основание в три клетки на строке 0 и «дуло» над центром на строке 1. */
const GUN_HEIGHT = 2;
const GUN_TOP_ROW = 1;
/** Колонка центра орудия в начале уровня (`boardWidth / 2 - 1`). */
const START_X = BRICK_COLS / 2 - 1;
/** Строка, с которой начинает полёт пуля (`curY + gun.maxY() + 1`), и последняя строка поля. */
const BULLET_START_ROW = GUN_TOP_ROW + 1;
const TOP_ROW = BRICK_ROWS - 1;
/** Пуль в одной колонке одновременно (`boardHeight - gun.getHeight()`). */
const MAX_BULLETS_PER_COLUMN = BRICK_ROWS - GUN_HEIGHT;
/** Скорость нашествия (`getSpeedOfFirstLevel/TenthLevel`): шаг в мс на скорости 1 и 10; сверх 50 кирпичей шаг замедляется. */
const SPEED_FIRST_MS = 300;
const SPEED_TENTH_MS = 55;
const SLOW_BRICKS = 50;
/** Орудие (и кнопка «вниз/вверх») повторяют действие раз в `MOVEMENT_SPEED = round(30 * 1.5)` = 45 мс. */
const MOVE_TICKS = msToTicks(45);
/** Выстрел при зажатой кнопке: раз в `ANIMATION_DELAY * (2 ствола ? 6 : 3)` = 180 / 90 мс. */
const FIRE_TICKS_ONE = msToTicks(90);
const FIRE_TICKS_TWO = msToTicks(180);
/** Полёт пуль: таймер раз в `ANIMATION_DELAY / (2 ствола ? 1 : 2)` = 30 / 15 мс. */
const BULLET_TICKS_ONE = msToTicks(15);
const BULLET_TICKS_TWO = msToTicks(30);
/** «Мелодия» перед уровнем (`START_MUSIC_DURATION`) — сценка без ввода (упрощение: в доноре орудие за это время можно двигать). */
const INTRO_TICKS = msToTicks(1500);
/** Каждые столько очков — добавочная жизнь (`getScoresToExtraLife`). */
const EXTRA_LIFE_SCORE = 1000;
const START_LIVES = 4;

// ---------------------------------------------------------------- варианты

/** Свойства варианта по донорскому номеру `type` (1..16, `InvadersGame` конструктор). */
export interface InvadersTraits {
  /** Донорский номер варианта 1..16. */
  readonly type: number;
  /** Два ствола по бокам (`type % 4 == 3 || 0`) или один по центру. */
  readonly twoBarrels: boolean;
  /** После каждого шага вниз стена сдвигается на клетку (`type % 2 == 0`). */
  readonly shifting: boolean;
  /** Поле перевёрнуто по вертикали, кнопки «вверх» и «вниз» поменяны местами (`type > 8`). */
  readonly inverted: boolean;
  /** Готовая стена уровня (`type % 8` в 1..4) или случайная. */
  readonly preloaded: boolean;
}

/** Свойства варианта по номеру с нуля (по кругу, как у `BrickBase`). */
export function invadersTraits(mode: number): InvadersTraits {
  const type = ((((Math.trunc(mode) || 0) % MODE_COUNT) + MODE_COUNT) % MODE_COUNT) + 1;
  return {
    type,
    twoBarrels: type % 4 === 3 || type % 4 === 0,
    shifting: type % 2 === 0,
    inverted: type > 8,
    preloaded: type % 8 >= 1 && type % 8 < 5,
  };
}

function describeMode(traits: InvadersTraits): BrickModeDef {
  const { preloaded, shifting, twoBarrels } = traits;
  const wallRu = `${preloaded ? 'Стена' : 'Случайная стена'}${shifting ? ' со сдвигом' : ''}`;
  const wallEn = `${shifting ? (preloaded ? 'Shifting wall' : 'Random shifting wall') : preloaded ? 'Wall' : 'Random wall'}`;
  const ru = `${wallRu}, ${twoBarrels ? 'два ствола' : 'один ствол'}`;
  const en = `${wallEn}, ${twoBarrels ? 'two barrels' : 'one barrel'}`;
  const wall = traits.preloaded
    ? 'готовая стена по уровню (BricksWall.preloadedBricks)'
    : 'случайная стена, зеркальная по горизонтали (BricksWall.generateBricks)';
  const shift = traits.shifting
    ? 'после каждого шага вниз сдвигается на клетку влево или вправо по кругу'
    : 'не сдвигается';
  const gun = traits.twoBarrels
    ? 'два ствола по бокам, выстрел раз в 180 мс, пуля 30 мс на клетку'
    : 'один ствол по центру, выстрел раз в 90 мс, пуля 15 мс на клетку';
  const flip = traits.inverted
    ? 'поле перевёрнуто по вертикали (орудие сверху), «вверх» и «вниз» меняются местами'
    : 'поле как есть (орудие снизу)';
  return {
    name: traits.inverted ? { ru: `${ru}, вверх дном`, en: `${en}, upside down` } : { ru, en },
    note:
      `Донор: InvadersGame, тип ${traits.type}. Стена: ${wall}; ${shift}. Орудие: ${gun}. Поле: ${flip}. ` +
      'Допущение: число вариантов на устройстве не установлено, реализованы все 16 донорских.',
  };
}

const MODES: readonly BrickModeDef[] = Array.from({ length: MODE_COUNT }, (_, index) => describeMode(invadersTraits(index)));

// ---------------------------------------------------------------- игра

/** Шар — точка, отделившаяся от стены. Летит вниз (в донорских координатах y убывает) и по горизонтали на `dx` (-1 или +1). */
interface Ball {
  x: number;
  y: number;
  dx: number;
}

/**
 * Пуля, как в `GameWithGun.bullets`: `next` — строка, которую пуля проверит на следующем шаге (у донора это значение
 * ячейки массива); `shown` — строка, где пуля нарисована после последнего шага (-1 — ещё не летала); `fading` — пуля
 * у верхнего края: её вспышка держится один такт.
 */
interface Bullet {
  x: number;
  next: number;
  shown: number;
  fading: boolean;
}

export class InvadersGame extends BrickBase {
  readonly id = 'invaders';
  readonly traits: InvadersTraits;

  private wall: Wall = preloadedWall(1);
  /** Строка (донорская, снизу) нижнего ряда стены. */
  private bricksY = 0;
  private ball: Ball | null = null;
  private bullets: Bullet[] = [];
  /** Колонка центра орудия 0..9 (крайние колонки показывают орудие с обрезанным боковым стволом — как у донора). */
  private gunX = START_X;
  /** Орудие погибло (шар попал, стена дошла или орудие въехало в шар): в конце такта начнётся потеря жизни. */
  private dead = false;
  private invasionLeft = 1;
  private invasionPeriod = 1;
  private bulletLeft = 1;
  private readonly bulletPeriod: number;
  private readonly moveKeys = new Repeater(MOVE_TICKS, MOVE_TICKS);
  private readonly fireKeys: Repeater;
  /** Кнопка, ускоряющая нашествие: у донора «вниз», на перевёрнутом поле «вверх» и «вниз» меняются местами. */
  private readonly accelerateKey: BrickAction;

  constructor(options: BrickGameOptions = {}) {
    super(options, MODE_COUNT);
    this.traits = invadersTraits(this.mode);
    const fireTicks = this.traits.twoBarrels ? FIRE_TICKS_TWO : FIRE_TICKS_ONE;
    this.fireKeys = new Repeater(fireTicks, fireTicks);
    this.bulletPeriod = this.traits.twoBarrels ? BULLET_TICKS_TWO : BULLET_TICKS_ONE;
    this.accelerateKey = this.traits.inverted ? 'up' : 'down';
    this.init();
  }

  // ---------------------------------------------------------------- BrickBase

  protected reset(): void {
    this.setLives(START_LIVES);
    this.scoresToExtraLife = EXTRA_LIFE_SCORE;
    this.loadLevel();
  }

  /** Первая «мелодия» партии: уровень уже загружен `reset()`, остаётся подождать. */
  protected override onStart(): void {
    this.intro();
  }

  protected update(input: BrickInput): void {
    if (this.bullets.some((bullet) => bullet.fading)) this.bullets = this.bullets.filter((bullet) => !bullet.fading);
    this.handleKeys(input);
    if (!this.dead) this.flyBullets();
    if (!this.dead && this.wall.count > 0) this.tickInvasion();
    if (this.dead) this.loseLife();
    else if (this.wall.count <= 0) this.winLevel();
  }

  protected draw(): Uint8Array {
    const out = emptyField();
    const put = (x: number, y: number, value: number): void => {
      if (x < 0 || x >= BRICK_COLS || y < 0 || y >= BRICK_ROWS) return;
      out[cellIndex(x, this.screenRow(y))] = value;
    };
    for (let row = 0; row < this.wall.height; row++) {
      for (let x = 0; x < WALL_WIDTH; x++) if (hasBrick(this.wall, x, row)) put(x, this.bricksY + row, CELL_ON);
    }
    if (this.ball) put(this.ball.x, this.ball.y, CELL_ON);
    for (const bullet of this.bullets) if (bullet.shown >= 0) put(bullet.x, bullet.shown, CELL_BLINK);
    put(this.gunX - 1, 0, CELL_ON);
    put(this.gunX, 0, CELL_ON);
    put(this.gunX + 1, 0, CELL_ON);
    put(this.gunX, GUN_TOP_ROW, CELL_ON);
    return out;
  }

  // ---------------------------------------------------------------- уровень

  /** Строка экрана (0 — верх) для донорской строки `y` (0 — низ поля; на перевёрнутом поле — наоборот). */
  private screenRow(y: number): number {
    return this.traits.inverted ? y : BRICK_ROWS - 1 - y;
  }

  /** Загрузить текущий уровень (`loadNewLevel`): новая стена (у случайных — новая случайная), орудие в центр, пули долой. */
  private loadLevel(): void {
    this.wall = this.traits.preloaded ? preloadedWall(this.level) : generatedWall(this.level, this.rng);
    this.bricksY = BRICK_ROWS - this.wall.height;
    this.ball = null;
    this.bullets = [];
    this.gunX = START_X;
    this.dead = false;
    // шаг нашествия: скорость по формуле донора, сверх 50 кирпичей каждый лишний замедляет шаг на 1 мс (createInvasionTimer)
    const extra = Math.max(this.wall.count - SLOW_BRICKS, 0);
    this.invasionPeriod = genuineTicks(this.speed, SPEED_FIRST_MS + extra, SPEED_TENTH_MS + extra);
    // таймер нашествия у донора стартует сразу после «мелодии»: первый шаг (опускание стены) — в первом такте игры
    this.invasionLeft = 1;
    this.bulletLeft = this.bulletPeriod;
    this.moveKeys.reset();
    this.fireKeys.reset();
  }

  /** Ожидание «мелодии» перед уровнем (`playAndWaitMusic`): сценка без ввода. */
  private intro(): void {
    this.cutscene(INTRO_TICKS, null, () => undefined);
  }

  private beginLevel(): void {
    this.loadLevel();
    this.intro();
  }

  /** Победа в уровне (`win`): шар и пули убираются, очистка поля, следующий уровень (после 10-го — первый и скорость выше). */
  private winLevel(): void {
    this.ball = null;
    this.bullets = [];
    this.emit({ type: 'win' });
    this.animateClear(CLEAR_WIN_TICKS, () => {
      this.nextLevel();
      this.beginLevel();
    });
  }

  /** Потеря жизни (`loss`): взрыв у орудия, минус жизнь; жизни остались — очистка поля и тот же уровень заново, иначе конец игры. */
  private loseLife(): void {
    this.bullets = [];
    this.emit({ type: 'crash' });
    this.emit({ type: 'explode' });
    this.animateKaboom(this.gunX, this.screenRow(0), () => {
      this.setLives((this.lives ?? 0) - 1);
      this.emit({ type: 'lifeLost' });
      if ((this.lives ?? 0) > 0) this.animateClear(CLEAR_LOSE_TICKS, () => this.beginLevel());
      else this.gameOver();
    });
  }

  // ---------------------------------------------------------------- ввод

  /** Кнопки (`InvadersGame.processKeys`): движение орудия, ускорение нашествия, огонь. */
  private handleKeys(input: BrickInput): void {
    const left = this.moveKeys.fire('left', input);
    const right = this.moveKeys.fire('right', input);
    if (left || right) this.moveGun(this.gunX + (right ? 1 : 0) - (left ? 1 : 0));
    if (this.dead) return;
    if (this.moveKeys.fire(this.accelerateKey, input)) this.processInvasion();
    if (this.dead) return;
    // `rotate` и `fire` в этой игре — одна кнопка «огонь»
    const fireDown = input.pressed.has('rotate') || input.pressed.has('fire');
    const fireHeld = input.held.has('rotate') || input.held.has('fire');
    if (this.fireKeys.fire('rotate', makeBrickInput(fireDown ? ['rotate'] : [], fireHeld ? ['rotate'] : []))) this.fire();
  }

  /**
   * Сдвинуть орудие (`GameWithGun.moveGun`): центр остаётся в колонках 0..9, за край не выходит; въехать на клетку шара — гибель.
   * Орудие (три клетки в ряд и «дуло») не сталкивается со стеной: стена гибельна раньше (см. `dropWall`).
   */
  private moveGun(x: number): void {
    if (x < 0 || x >= BRICK_COLS || x === this.gunX) return;
    const ball = this.ball;
    if (ball && this.gunCovers(x, ball.x, ball.y)) {
      this.dead = true;
      return;
    }
    this.gunX = x;
    this.emit({ type: 'move' });
  }

  /** Занимает ли орудие с центром в колонке `gunX` клетку (x, y) в донорских координатах. */
  private gunCovers(gunX: number, x: number, y: number): boolean {
    if (y === 0) return Math.abs(x - gunX) <= 1;
    return y === GUN_TOP_ROW && x === gunX;
  }

  /** Выстрел (`GameWithGun.fire`): пуля в колонке ствола над орудием; два ствола — в колонках по бокам от центра. */
  private fire(): void {
    const columns = this.traits.twoBarrels ? [this.gunX - 1, this.gunX + 1] : [this.gunX];
    let fired = false;
    for (const x of columns) {
      if (x < 0 || x >= BRICK_COLS) continue;
      if (this.bullets.filter((bullet) => bullet.x === x).length >= MAX_BULLETS_PER_COLUMN) continue;
      this.bullets.push({ x, next: BULLET_START_ROW, shown: -1, fading: false });
      fired = true;
    }
    // допущение: у донора звук выстрела отключён «из-за артефактов», на игрушке выстрел, конечно, звучит
    if (fired) this.emit({ type: 'shot' });
  }

  // ---------------------------------------------------------------- пули

  private flyBullets(): void {
    if (--this.bulletLeft > 0) return;
    this.bulletLeft = this.bulletPeriod;
    const kept: Bullet[] = [];
    for (const bullet of this.bullets) if (this.flyBullet(bullet)) kept.push(bullet);
    this.bullets = kept;
  }

  /**
   * Один шаг пули (`GameWithGun.flight`, режим разрушения): если на клетке пули есть кирпич или шар — он уничтожается,
   * пуля исчезает; иначе пуля рисуется на этой клетке и поднимается на строку выше. На самой верхней строке пуля ещё раз
   * проверяет клетку, вспыхивает на один такт (в доноре — `sleep(15)`) и пропадает.
   */
  private flyBullet(bullet: Bullet): boolean {
    if (bullet.next < TOP_ROW) {
      if (this.occupied(bullet.x, bullet.next)) {
        this.hitCell(bullet.x, bullet.next);
        return false;
      }
      bullet.shown = bullet.next;
      bullet.next++;
      return true;
    }
    if (this.occupied(bullet.x, TOP_ROW)) this.hitCell(bullet.x, TOP_ROW);
    bullet.shown = TOP_ROW;
    bullet.fading = true;
    return true;
  }

  private occupied(x: number, y: number): boolean {
    const ball = this.ball;
    if (ball && ball.x === x && ball.y === y) return true;
    return hasBrick(this.wall, x, y - this.bricksY);
  }

  /** Попадание (`InvadersGame.removeCell`): шар сбивается без очков, кирпич выбивается за очко. */
  private hitCell(x: number, y: number): void {
    const ball = this.ball;
    if (ball && ball.x === x && ball.y === y) {
      this.removeBall();
      this.emit({ type: 'hit' });
      return;
    }
    const index = (y - this.bricksY) * WALL_WIDTH + x;
    this.wall.cells[index] = 0;
    this.wall.count--;
    this.emit({ type: 'hit' });
    this.addScore(1);
  }

  /** Шар исчез (сбит или упал за нижний край): он перестаёт считаться оставшимся кирпичом (`removeBall`). */
  private removeBall(): void {
    this.ball = null;
    this.wall.count--;
  }

  // ---------------------------------------------------------------- нашествие

  private tickInvasion(): void {
    if (--this.invasionLeft > 0) return;
    this.invasionLeft = this.invasionPeriod;
    this.processInvasion();
  }

  /** Шаг нашествия (`processInvasion`): пока шар летит — шаг шара, иначе стена опускается на строку и от неё отделяется шар. */
  private processInvasion(): void {
    if (this.ball) this.moveBall(this.ball);
    else if (this.dropWall()) this.createBall();
    else this.dead = true;
  }

  /**
   * Опустить стену на одну строку (`droppingDown`). `false` — стена коснулась орудия: у донора это любой кирпич на строке
   * дула (`curY + gun.maxY()`), в какой бы колонке он ни был. Для вариантов со сдвигом после опускания стена
   * сдвигается на клетку влево или вправо по кругу.
   */
  private dropWall(): boolean {
    this.bricksY--;
    let safe = true;
    for (let row = 0; row < this.wall.height; row++) {
      if (this.bricksY + row === GUN_TOP_ROW && rowHasBrick(this.wall, row)) safe = false;
    }
    if (this.traits.shifting) shiftWall(this.wall, this.rng.chance(0.5) ? -1 : 1);
    return safe;
  }

  /**
   * От нижнего ряда стены отделяется точка (`createBall`): берётся самый правый кирпич самого нижнего непустого ряда, из стены он
   * исчезает, но числится в счёте оставшихся, пока шар не пропадёт. «Волшебное прицеливание» донора выбирает направление так,
   * чтобы с учётом отскоков шар пришёл на колонку орудия.
   */
  private createBall(): void {
    for (let row = 0; row < this.wall.height; row++) {
      for (let x = WALL_WIDTH - 1; x >= 0; x--) {
        if (!hasBrick(this.wall, x, row)) continue;
        const y = this.bricksY + row;
        if (y < GUN_HEIGHT) return; // ниже орудия шар не рождается (у донора недостижимо без пасхалки)
        this.wall.cells[row * WALL_WIDTH + x] = 0;
        this.ball = { x, y, dx: this.aim(x, y) };
        this.emit({ type: 'rotate' }); // у донора здесь звук Effects.turn
        return;
      }
    }
  }

  private aim(x: number, y: number): number {
    const across = Math.abs(x - this.gunX);
    const down = Math.abs(y);
    if (x < this.gunX) return across < down ? -1 : 1;
    return across < down ? 1 : -1;
  }

  /** Шаг шара (`moveBall`): по диагонали вниз, у боковых краёв отскок; за нижним краем пропадает; у орудия — столкновение. */
  private moveBall(ball: Ball): void {
    const y = ball.y - 1;
    if (y < 0) {
      this.removeBall();
      return;
    }
    let dx = ball.dx;
    let x = ball.x + dx;
    let bounced = false;
    if (x < 0 || x >= BRICK_COLS) {
      dx = -dx;
      x = ball.x + dx;
      bounced = true;
    }
    if (y <= GUN_TOP_ROW && this.gunCovers(this.gunX, x, y)) {
      this.dead = true;
      return;
    }
    ball.x = x;
    ball.y = y;
    ball.dx = dx;
    if (bounced) this.emit({ type: 'rotate' }); // у донора здесь звук Effects.turn
  }
}

export const invadersDef: BrickGameDef = {
  id: 'invaders',
  declaredModes: null,
  modes: MODES,
  create: (options) => new InvadersGame(options),
};
