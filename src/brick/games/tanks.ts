/**
 * Игра 1 меню «168 в 1 танк» — «Танки» (`id: 'tank'`). Правила, данные и последовательности восстановлены по донору
 * `TanksGame` (n0Live/BrickGame, MIT) и описаны в `docs/brick/tanks.md`; код написан заново как тактовый автомат:
 * потоки, `sleep()` и `java.util.Random` не переносились, паузы без ввода — сценки `BrickBase`.
 *
 * Суть: танк игрока (7 клеток) отбивается от 3–6 вражеских танков (6 клеток), которые по очереди появляются в углах и
 * на серединах боковых краёв, едут к игроку и стреляют. Снаряд — одна клетка, он разрушает клетку препятствия, на
 * которую попал. 25 уничтоженных врагов — победа в уровне (+1 уровень, на следующем после 10-го — скорость выше);
 * попадание вражеского снаряда в игрока — потеря жизни из четырёх.
 *
 * Внутри — донорские координаты (y вверх, 0 — нижняя строка); на экран их переводит `draw()`.
 * Всё, чего нет у донора или что придумано, помечено словом «допущение».
 */
import { BrickBase, CLEAR_LOSE_TICKS, CLEAR_WIN_TICKS } from '../base';
import { cellIndex, emptyField } from '../grid';
import { Countdown, genuineTicks, msToTicks } from '../timing';
import { CELL_ON, type BrickGameDef, type BrickGameOptions, type BrickInput, type BrickModeDef } from '../types';
import { chooseMove, shootDirection, wantsToShoot } from './tanks/ai';
import {
  DOWN,
  DX,
  DY,
  ENEMY_KIND,
  FIELD_H,
  FIELD_W,
  LEFT,
  PLAYER_KIND,
  RIGHT,
  TANK_SIZE,
  UP,
  BOX_KIND,
  boardIndex,
  coversCell,
  hitsBoard,
  moveTank,
  newBoard,
  putTank,
  tankMask,
  toScreenRow,
  type Bullet,
  type Dir,
  type Tank,
} from './tanks/geometry';
import { presetObstacles, randomObstacles } from './tanks/levels';

/** Сколько уничтоженных врагов нужно для перехода на следующий уровень (`KILLS_TO_NEXT_LEVEL`). */
export const KILLS_TO_NEXT_LEVEL = 25;
/** Сколько снарядов игрока может лететь одновременно (`PLAYER_BULLETS_COUNT`). */
export const PLAYER_BULLET_LIMIT = 4;
/** Очков на добавочную жизнь (`getScoresToExtraLife()` донора). */
export const SCORES_TO_EXTRA_LIFE = 500;
/** Жизней в начале партии (`GameWithLives.init`: `setLives(4)`). */
export const START_LIVES = 4;
/** Очков за уничтоженный вражеский танк (`destroyEnemyTank`: `setScore(getScore() + 1)`). */
export const POINTS_PER_KILL = 1;
/** Скорость ИИ: период хода врагов на скорости 1 и 10, мс (`getSpeedOfFirstLevel` / `getSpeedOfTenthLevel`). */
export const SPEED_FIRST_MS = 1500;
export const SPEED_TENTH_MS = 350;

/** Шаг анимации донора `ANIMATION_DELAY` = 30 мс; от него считаются задержки танка игрока и полёт снарядов. */
const ANIMATION_MS = 30;
/** Пауза кнопки после шага вперёд, после поворота и после выстрела (`MOVEMENT_SPEED`, `ROTATION_SPEED`, `FIRE_SPEED`). */
export const MOVE_TICKS = msToTicks(ANIMATION_MS * 3);
export const ROTATE_TICKS = MOVE_TICKS; // donor: 360 ms; responsive turn-to-step
export const FIRE_TICKS = msToTicks(ANIMATION_MS * 8);
/** Все снаряды перелетают на клетку раз в 120 мс (`ANIMATION_DELAY * 4`). */
export const BULLET_TICKS = msToTicks(ANIMATION_MS * 4);
/** «Стартовая мелодия» донора перед каждым уровнем: 1500 мс без ввода. */
export const START_TICKS = msToTicks(1500);

/** Начальное положение танка игрока: середина поля по x, чуть ниже середины по y, ствол вверх. */
export const PLAYER_START: Tank = { x: FIELD_W / 2 - 1, y: FIELD_H / 2 - TANK_SIZE, dir: UP };

/** Места появления врагов: нижние углы, середины боковых краёв, верхние углы (`spawnPoints`, до сдвига внутрь поля). */
const SPAWN_POINTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [FIELD_W - 1, 0],
  [0, FIELD_H / 2],
  [FIELD_W - 1, FIELD_H / 2],
  [0, FIELD_H - 1],
  [FIELD_W - 1, FIELD_H - 1],
];

/** Правила варианта игры. */
export interface TanksRules {
  /** Номер донорского варианта (1–8): 1–4 — готовые поля, 5–8 — случайные; врагов 3, 4, 5, 6, 3, 4, 5, 6. */
  readonly donorType: number;
  readonly enemies: number;
  readonly preloaded: boolean;
}

/** Правила по номеру донорского варианта (`TanksGame`: `usePreloadedLevels`, `enemiesCount`). */
export function tanksRules(donorType: number): TanksRules {
  return { donorType, preloaded: donorType <= 4, enemies: donorType % 4 === 0 ? 6 : (donorType % 4) + 2 };
}

/**
 * Какие 5 из 8 донорских вариантов выведены в меню. Допущение: владелец насчитал у устройства пять вариантов танков,
 * смысл каждого неизвестен; взяты варианты, охватывающие оба вида полей и оба края по числу врагов.
 */
export const DONOR_TYPES: readonly number[] = [1, 2, 4, 5, 8];

const DONOR_NOTE =
  'Выбор пяти вариантов из восьми донорских — допущение: на устройстве их пять, смысл каждого неизвестен.';
const PRESET_NOTE = 'С уровня 2 препятствия берутся из готовой таблицы уровней донора.';
const RANDOM_NOTE = 'С уровня 2 на каждом уровне случайно ставится до N − 1 препятствий (N — номер уровня; у фигуры есть лимит попыток).';

export const MODES: readonly BrickModeDef[] = [
  {
    name: { ru: '3 врага, готовые поля', en: '3 enemies, preset fields' },
    note: `Донорский вариант 1 (TanksGame): 3 вражеских танка. ${PRESET_NOTE} ${DONOR_NOTE}`,
  },
  {
    name: { ru: '4 врага, готовые поля', en: '4 enemies, preset fields' },
    note: `Донорский вариант 2 (TanksGame): 4 вражеских танка. ${PRESET_NOTE} ${DONOR_NOTE}`,
  },
  {
    name: { ru: '6 врагов, готовые поля', en: '6 enemies, preset fields' },
    note: `Донорский вариант 4 (TanksGame): 6 вражеских танков. ${PRESET_NOTE} ${DONOR_NOTE}`,
  },
  {
    name: { ru: '3 врага, случайные поля', en: '3 enemies, random fields' },
    note: `Донорский вариант 5 (TanksGame): 3 вражеских танка. ${RANDOM_NOTE} ${DONOR_NOTE}`,
  },
  {
    name: { ru: '6 врагов, случайные поля', en: '6 enemies, random fields' },
    note: `Донорский вариант 8 (TanksGame): 6 вражеских танков. ${RANDOM_NOTE} ${DONOR_NOTE}`,
  },
];

/** Кнопки, у которых есть собственная пауза (`GameUtils.setKeyDelay`): четыре стрелки и огонь. */
type GatedKey = 'left' | 'right' | 'up' | 'down' | 'fire';
const GATED_KEYS: readonly GatedKey[] = ['left', 'right', 'up', 'down', 'fire'];
/** Порядок опроса стрелок у донора: влево, вправо, вверх, вниз — берётся первая не приостановленная. */
const MOVE_KEYS: readonly (readonly [GatedKey, Dir])[] = [
  ['left', LEFT],
  ['right', RIGHT],
  ['up', UP],
  ['down', DOWN],
];

export class TanksGame extends BrickBase {
  readonly id = 'tank';
  /** Правила выбранного варианта. */
  readonly rules: TanksRules;

  private player: Tank = PLAYER_START;
  /** Вражеские танки по ячейкам (`null` — ячейка пуста, враг ещё не появился или уничтожен). */
  private readonly enemies: (Tank | null)[];
  /** Снаряды врагов: по ячейке на каждого возможного врага; свободная ячейка берётся по порядку (`fire`). */
  private readonly enemyBullets: (Bullet | null)[];
  private readonly playerBullets: (Bullet | null)[];
  /** Препятствия уровня (1 — клетка занята). Танки и снаряды хранятся отдельно, поле для проверок собирает `buildBoard`. */
  private obstacles: Uint8Array = newBoard();
  /** Сколько врагов уничтожено на этом уровне / сколько сейчас на поле. */
  private killed = 0;
  private onBoard = 0;
  /** Игрока подбили: на ближайшем шаге — взрыв и потеря жизни (`isDead`). */
  private dead = false;
  /** Чей ход у врагов (`enemyTankNumber`); как у донора, между уровнями не сбрасывается. */
  private enemyIndex = 0;
  /** Тактов до следующего хода врагов. */
  private aiLeft = 1;
  private startLeft = 0;
  private readonly bulletTimer = new Countdown(BULLET_TICKS);
  private readonly keyDelay: Record<GatedKey, number> = { left: 0, right: 0, up: 0, down: 0, fire: 0 };

  constructor(options: BrickGameOptions = {}) {
    super(options, MODES.length);
    this.rules = tanksRules(DONOR_TYPES[this.mode] ?? 1);
    this.enemies = new Array<Tank | null>(this.rules.enemies).fill(null);
    this.enemyBullets = new Array<Bullet | null>(this.rules.enemies).fill(null);
    this.playerBullets = new Array<Bullet | null>(PLAYER_BULLET_LIMIT).fill(null);
    this.init();
  }

  protected reset(): void {
    this.setLives(START_LIVES);
    this.scoresToExtraLife = SCORES_TO_EXTRA_LIFE;
    this.enemyIndex = 0;
    this.loadNewLevel();
  }

  // ---------------------------------------------------------------- уровень

  /** Новый уровень: поле, счётчик убитых с нуля, ожидание стартовой мелодии (`loadNewLevel`). */
  private loadNewLevel(): void {
    this.killed = 0;
    this.initLevel();
  }

  /** После потери жизни: поле и танки заново, но счётчик убитых на уровне сохраняется (`reloadLevel`). */
  private reloadLevel(): void {
    this.initLevel();
  }

  private initLevel(): void {
    this.dead = false;
    this.playerBullets.fill(null);
    this.enemyBullets.fill(null);
    this.enemies.fill(null);
    this.onBoard = 0;
    this.player = PLAYER_START;
    if (this.level <= 1) this.obstacles = newBoard(); // у донора препятствия только с уровня 2
    else if (this.rules.preloaded) this.obstacles = presetObstacles(this.level);
    else this.obstacles = randomObstacles(this.rng, this.level - 1);
    // Донор ставит случайные препятствия на пустое поле и рисует танк игрока поверх: клетки под танком сливаются с ним
    // и пропадают, когда танк уезжает. Здесь танк и препятствия хранятся отдельно, поэтому такие клетки убираются сразу.
    for (const [cx, cy] of tankMask(PLAYER_KIND, PLAYER_START.dir).cells) {
      this.obstacles[boardIndex(PLAYER_START.x + cx, PLAYER_START.y + cy)] = 0;
    }
    this.bulletTimer.reset(BULLET_TICKS);
    for (const key of GATED_KEYS) this.keyDelay[key] = 0;
    // Delay enemies during the intro, but accept player movement immediately.
    this.startLeft = START_TICKS;
    this.aiLeft = 1;
  }

  private winLevel(): void {
    this.emit({ type: 'win' });
    this.animateClear(CLEAR_WIN_TICKS, () => {
      this.nextLevel();
      this.loadNewLevel();
    });
  }

  private loseLife(): void {
    this.emit({ type: 'crash' });
    this.animateKaboom(this.player.x, toScreenRow(this.player.y), () => {
      this.setLives((this.lives ?? 0) - 1);
      this.emit({ type: 'lifeLost' });
      if ((this.lives ?? 0) > 0) this.animateClear(CLEAR_LOSE_TICKS, () => this.reloadLevel());
      else this.gameOver();
    });
  }

  // ---------------------------------------------------------------- такт

  protected update(input: BrickInput): void {
    for (const key of GATED_KEYS) if (this.keyDelay[key] > 0) this.keyDelay[key]--;
    for (const [key] of MOVE_KEYS) if (input.pressed.has(key)) this.keyDelay[key] = 0;
    this.processKeys(input);
    if (this.startLeft > 0) { this.startLeft--; return; }
    if (this.bulletTimer.fire()) this.flightOfBullets();
    if (this.dead) {
      this.loseLife();
      return;
    }
    if (this.killed >= KILLS_TO_NEXT_LEVEL) {
      this.winLevel();
      return;
    }
    this.aiLeft--;
    if (this.aiLeft > 0) return;
    this.aiLeft = genuineTicks(this.speed, SPEED_FIRST_MS, SPEED_TENTH_MS);
    this.aiRound();
    if (this.dead) this.loseLife();
  }

  /** Fresh direction presses respond next tick; holds repeat at MOVE_TICKS.
   * Movement and fire are independent; FIRE_TICKS still bounds the weapon rate.
   * These responsiveness adjustments intentionally differ from the Java donor.
   */
  private processKeys(input: BrickInput): void {
    let moveKey: GatedKey | null = null;
    let moveDir: Dir = UP;
    for (const [key, dir] of MOVE_KEYS) {
      if (input.held.has(key) && this.keyDelay[key] === 0) {
        moveKey = key;
        moveDir = dir;
        break;
      }
    }
    if (moveKey !== null) {
      const sameDirection = this.player.dir === moveDir;
      this.keyDelay[moveKey] = sameDirection ? MOVE_TICKS : ROTATE_TICKS;
      this.movePlayer(moveDir);
    }
    const fireHeld = input.held.has('rotate') || input.held.has('fire');
    if (this.startLeft === 0 && fireHeld && this.keyDelay.fire === 0 && this.fire(this.player, true)) this.keyDelay.fire = FIRE_TICKS;
  }

  private movePlayer(dir: Dir): boolean {
    const next = moveTank(this.buildBoard(this.player), PLAYER_KIND, this.player, dir, false);
    if (next === this.player) return false;
    this.player = next;
    return true;
  }

  // ---------------------------------------------------------------- снаряды

  /**
   * Выстрел: снаряд появляется на клетке ствола и сразу делает первый шаг (`fire` + `flightOfBullet`). Свободной
   * ячейки нет — выстрела нет. Звук выстрела (`shot`) — только у игрока: у донора вражеские выстрелы беззвучны.
   */
  private fire(tank: Tank, byPlayer: boolean): boolean {
    const slots = byPlayer ? this.playerBullets : this.enemyBullets;
    const index = slots.indexOf(null);
    if (index < 0) return false;
    if (byPlayer) this.emit({ type: 'shot' });
    slots[index] = { x: tank.x + DX[tank.dir], y: tank.y + DY[tank.dir], dir: tank.dir };
    this.flightOfBullet(byPlayer, index);
    return true;
  }

  private static bulletAt(list: readonly (Bullet | null)[], x: number, y: number): number {
    return list.findIndex((bullet) => bullet !== null && bullet.x === x && bullet.y === y);
  }

  /**
   * Один шаг снаряда на клетку (`flightOfBullet`). Вылет за поле — снаряд пропадает. Занятая клетка — попадание
   * (событие `hit`), и снаряд пропадает; дальше по порядку донора: встреча со вражеским снарядом (а для снаряда врага —
   * и с чужим снарядом игрока) убирает оба снаряда; вражеский снаряд, попавший в танк игрока, подбивает игрока
   * (возвращается `false`); снаряд игрока, попавший во врага, уничтожает его; иначе разрушается клетка препятствия.
   * Снаряд игрока, попавший в снаряд игрока, и снаряд врага, попавший во вражеский танк, просто пропадают.
   */
  private flightOfBullet(byPlayer: boolean, index: number): boolean {
    const slots = byPlayer ? this.playerBullets : this.enemyBullets;
    const bullet = slots[index];
    if (!bullet) return true;
    const x = bullet.x + DX[bullet.dir];
    const y = bullet.y + DY[bullet.dir];
    if (x < 0 || x >= FIELD_W || y < 0 || y >= FIELD_H) {
      slots[index] = null;
      return true;
    }
    const enemyShot = TanksGame.bulletAt(this.enemyBullets, x, y);
    const playerShot = TanksGame.bulletAt(this.playerBullets, x, y);
    const hitPlayer = coversCell(PLAYER_KIND, this.player, x, y);
    const hitEnemy = this.enemies.findIndex((tank) => tank !== null && coversCell(ENEMY_KIND, tank, x, y));
    const cell = boardIndex(x, y);
    if (enemyShot < 0 && playerShot < 0 && !hitPlayer && hitEnemy < 0 && this.obstacles[cell] === 0) {
      slots[index] = { x, y, dir: bullet.dir };
      return true;
    }

    this.emit({ type: 'hit' });
    slots[index] = null;
    if (enemyShot >= 0) {
      this.enemyBullets[enemyShot] = null;
    } else if (playerShot >= 0 && !byPlayer) {
      this.playerBullets[playerShot] = null;
    } else if (playerShot < 0) {
      if (hitPlayer && !byPlayer) {
        this.dead = true;
        return false;
      }
      if (hitEnemy >= 0) {
        if (byPlayer) this.destroyEnemy(hitEnemy);
      } else {
        this.obstacles[cell] = 0;
      }
    }
    return true;
  }

  /** Шаг всех снарядов: сначала вражеские, затем игрока; после попадания в игрока остальные в этот раз стоят. */
  private flightOfBullets(): void {
    for (let i = 0; i < this.enemyBullets.length; i++) if (!this.flightOfBullet(false, i)) return;
    for (let i = 0; i < this.playerBullets.length; i++) if (!this.flightOfBullet(true, i)) return;
  }

  /** Враг убит снарядом игрока: +1 очко, +1 к убитым на уровне (`destroyEnemyTank`). */
  private destroyEnemy(index: number): void {
    this.enemies[index] = null;
    this.killed++;
    this.onBoard--;
    this.emit({ type: 'explode' });
    this.addScore(POINTS_PER_KILL);
  }

  // ---------------------------------------------------------------- враги

  /**
   * Ход врагов: действует один танк — первый по кругу, у которого получилось (`aiTurn`); если у всех не вышло, ход
   * пропускается. Один ход происходит раз в `genuineTicks(скорость, 1500 мс, 350 мс)`.
   */
  private aiRound(): void {
    let tries = this.enemies.length;
    do {
      if (this.enemyIndex >= this.enemies.length) this.enemyIndex = 0;
      tries--;
    } while (!this.aiTurn(this.enemyIndex++) && tries > 0);
  }

  /**
   * Ход одной ячейки врага (`aiTurn`). Пустая ячейка: если убитые и стоящие на поле ещё не набрали 25, то с вероятностью
   * 3/4 пытается появиться танк; новичок стреляет сразу с шансом 1 к (21 − уровень), иначе ход на этом закончен. Живой
   * танк выбирает направление (`chooseMove`) и решает, стрелять ли (`wantsToShoot`): стреляет в сторону игрока —
   * если эта сторона совпала с направлением движения, то стреляет на ходу, иначе только поворачивается и стреляет.
   * Возвращает, сделал ли танк ход. Задержку донора в 60 мс между появлением и выстрелом новичка не моделирует.
   */
  private aiTurn(index: number): boolean {
    let bornWithGun = false;
    let tank = this.enemies[index] ?? null;
    if (tank === null) {
      if (this.killed + this.onBoard >= KILLS_TO_NEXT_LEVEL) return false;
      if (this.rng.int(4) === 0 || !this.respawn(index)) return false;
      this.onBoard++;
      if (this.rng.int(10 + 11 - this.level) !== 0) return true;
      bornWithGun = true;
      tank = this.enemies[index] ?? null;
      if (tank === null) return true;
    }
    const board = this.buildBoard(tank);
    const move = chooseMove(board, tank, this.player, this.rng);
    if (bornWithGun || wantsToShoot(board, tank, this.player, this.enemies, this.rng)) {
      const shot = shootDirection(tank.x, tank.y, this.player);
      const next =
        shot === move && !bornWithGun
          ? moveTank(board, ENEMY_KIND, tank, move, false)
          : moveTank(board, ENEMY_KIND, tank, shot, true);
      this.enemies[index] = next;
      this.fire(next, false);
    } else {
      this.enemies[index] = moveTank(board, ENEMY_KIND, tank, move, false);
    }
    return true;
  }

  /**
   * Появление врага (`respawn`): до трёх попыток выбрать случайное из шести мест (центр сдвигается внутрь поля) с
   * пустым квадратом 3 × 3; танк сразу смотрит в сторону игрока. Как у донора, удача только на третьей попытке не
   * считается — на деле попыток две.
   */
  private respawn(index: number): boolean {
    const board = this.buildBoard();
    const mask = tankMask(ENEMY_KIND, UP);
    let x: number;
    let y: number;
    let tries = 3;
    do {
      const point = SPAWN_POINTS[this.rng.int(SPAWN_POINTS.length)] ?? [0, 0];
      x = point[0];
      y = point[1];
      if (x + mask.minX < 0) x -= mask.minX;
      else if (x + mask.maxX >= FIELD_W) x -= mask.maxX;
      if (y + mask.minY < 0) y -= mask.minY;
      else if (y + mask.maxY >= FIELD_H) y -= mask.maxY;
      tries--;
    } while (hitsBoard(board, BOX_KIND, UP, x, y) && tries > 0);
    if (tries <= 0) return false;
    this.enemies[index] = { x, y, dir: shootDirection(x, y, this.player) };
    return true;
  }

  // ---------------------------------------------------------------- рисунок

  /** Поле целиком в донорских координатах: препятствия, танки (кроме `skip`) и снаряды. 1 — клетка занята. */
  private buildBoard(skip: Tank | null = null): Uint8Array {
    const board = this.obstacles.slice();
    if (this.player !== skip) putTank(board, PLAYER_KIND, this.player);
    for (const tank of this.enemies) if (tank !== null && tank !== skip) putTank(board, ENEMY_KIND, tank);
    for (const bullet of this.playerBullets) if (bullet) board[boardIndex(bullet.x, bullet.y)] = 1;
    for (const bullet of this.enemyBullets) if (bullet) board[boardIndex(bullet.x, bullet.y)] = 1;
    return board;
  }

  /** Матрица экрана: все клетки горят ровно (у донора мигающих клеток в танках нет); y переворачивается. */
  protected draw(): Uint8Array {
    const board = this.buildBoard();
    const out = emptyField();
    for (let y = 0; y < FIELD_H; y++) {
      for (let x = 0; x < FIELD_W; x++) {
        if (board[boardIndex(x, y)] !== 0) out[cellIndex(x, toScreenRow(y))] = CELL_ON;
      }
    }
    return out;
  }
}

export const tanksDef: BrickGameDef = {
  id: 'tank',
  declaredModes: 5,
  modes: MODES,
  create: (options) => new TanksGame(options),
};
