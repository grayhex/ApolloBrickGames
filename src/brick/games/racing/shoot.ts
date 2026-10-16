/**
 * «Гонки со стрельбой»: гонки (`RacingBase`) плюс оружие и пешеходы.
 *
 * В доноре такого режима нет (`RacingGame` не стреляет), поэтому игра построена так:
 * - **по описанию владельца другого Brick Game (MT1997, «Гонки по трассе»)**: «Сбивая пешеходов машинка приобретает возможность
 *   стрелять»; в игре есть машинки-препятствия и пешеходы;
 * - **по образцу `GameWithGun` донора**: пуля — мигающая клетка, летит по своей колонке вперёд на клетку за шаг, попадание
 *   убирает цель и даёт очко (`removeCell`: `setScore(getScore() + 1)`), пули сбрасываются при потере жизни (`loss`);
 * - всё остальное — **допущение** (в доноре и в описании нет): пешеход — одна мигающая клетка в центре свободной полосы,
 *   патронов за пешехода — `AMMO_PER_PEDESTRIAN`, в магазине не больше `MAX_AMMO`, темп стрельбы — `FIRE_COOLDOWN_TICKS`,
 *   оружие пропадает вместе с машиной при аварии, пули пешеходов не трогают.
 */
import { livesPreview } from '../../base';
import { msToTicks } from '../../timing';
import { BRICK_ROWS, CELL_ON, PREVIEW_COLS, type BrickGameOptions, type BrickInput } from '../../types';
import { RacingBase } from './base';
import { CAR_MAX_Y, CAR_Y, ROAD_MODE_COUNT, carCovers } from './road';

/** Допущение: патронов за сбитого пешехода и размер магазина (одна клетка превью справа — один патрон). */
export const AMMO_PER_PEDESTRIAN = 3;
export const MAX_AMMO = 4;
/** Допущение: темп стрельбы. Взят `FIRE_SPEED` игры «Танки» донора (8 × `ANIMATION_DELAY` = 240 мс); пока кнопка зажата — автоогонь. */
export const FIRE_COOLDOWN_TICKS = msToTicks(240);
/** Пуля летит на клетку за `ANIMATION_DELAY` = 30 мс (в `GameWithGun` пули летят роем по таймеру — здесь так же, все сразу). */
export const BULLET_TICKS = msToTicks(30);
/** Допущение: пешеход появляется у каждой третьей (в среднем) новой группы машин, в полосе, свободной от этой группы. */
export const PEDESTRIAN_ONE_IN = 3;

/** Пешеход: одна мигающая клетка (x, y) в донорских координатах (допущение: стоит в центре полосы). */
export interface Walker {
  x: number;
  y: number;
}

/** Пуля: клетка (x, y) в донорских координатах. */
export interface Shell {
  x: number;
  y: number;
}

export class RacingShootGame extends RacingBase {
  readonly id = 'racing-shoot';

  /** Патроны (допущение: в начале уровня и после аварии — ноль). */
  protected ammo = 0;
  protected shells: Shell[] = [];
  protected walkers: Walker[] = [];
  private cooldown = 0;
  private flightClock = 0;

  constructor(options: BrickGameOptions) {
    super(options, ROAD_MODE_COUNT);
    this.init();
  }

  protected override onSetup(): void {
    this.ammo = 0;
    this.shells = [];
    this.walkers = [];
    this.cooldown = 0;
    this.flightClock = 0;
  }

  protected override onCrash(): void {
    // как `GameWithGun.loss`: пули убираются до взрыва
    this.shells = [];
  }

  /** «Вверх» ускоряет (как у донора), ROTATE и «огонь» стреляют. */
  protected override handleKeys(input: BrickInput): void {
    if (this.accelKeys.fire('up', input)) this.accelerate();
    if (this.busy) return;
    if (input.held.has('rotate') || input.pressed.has('rotate')) this.shoot();
  }

  protected override tickWorld(): void {
    if (this.cooldown > 0) this.cooldown--;
    if (++this.flightClock < BULLET_TICKS) return;
    this.flightClock = 0;
    this.flyShells();
  }

  protected override onTraffic(): void {
    // пешеходы бегут вместе с дорогой
    const walkers: Walker[] = [];
    for (const walker of this.walkers) {
      walker.y--;
      if (walker.y < 0) continue; // убежал за нижний край
      if (this.pickUp(walker)) continue;
      walkers.push(walker);
    }
    this.walkers = walkers;
    // машины, подъехавшие на пулю, получают попадание
    const shells: Shell[] = [];
    for (const shell of this.shells) if (!this.hitAt(shell.x, shell.y)) shells.push(shell);
    this.shells = shells;
    // новая группа машин — иногда и пешеход
    const group = this.road.lastSpawn;
    if (group.length === 0 || this.rng.int(PEDESTRIAN_ONE_IN) !== 0) return;
    const free = this.road.freeLanes(group);
    const lane = free[this.rng.int(free.length)];
    const laneX = lane === undefined ? undefined : this.layout.lanes[lane];
    // допущение: пешеход возникает над полем (не ниже 20-й строки), чтобы не вспыхнуть посреди дороги
    if (laneX !== undefined) this.walkers.push({ x: laneX, y: Math.max((group[0]?.y ?? 0) + 1, BRICK_ROWS) });
  }

  protected override onCarMoved(): void {
    // машина переехала на пешехода
    this.walkers = this.walkers.filter((walker) => !this.pickUp(walker));
  }

  protected override blinkCells(): readonly (readonly [number, number])[] {
    return [...this.walkers, ...this.shells].map((item) => [item.x, item.y] as const);
  }

  /** Допущение: пока есть патроны, нос машины мигает — видно, что можно стрелять. */
  protected override get armed(): boolean {
    return this.ammo > 0;
  }

  /** Превью: жизни, как у донора (колонки 1–2), и патроны (колонка 3, сверху вниз по клетке на патрон) — допущение. */
  protected override drawPreview(): Uint8Array {
    const out = livesPreview(this.lives ?? 0);
    for (let i = 0; i < Math.min(this.ammo, MAX_AMMO); i++) out[i * PREVIEW_COLS + PREVIEW_COLS - 1] = CELL_ON;
    return out;
  }

  // ---------------------------------------------------------------- внутреннее

  /** Выстрел: нужен патрон и истёкший темп; пуля вылетает из клетки перед носом. */
  private shoot(): void {
    if (this.ammo <= 0 || this.cooldown > 0) return;
    this.ammo--;
    this.cooldown = FIRE_COOLDOWN_TICKS;
    this.emit({ type: 'shot' });
    const x = this.carX;
    const y = CAR_Y + CAR_MAX_Y + 1;
    if (!this.hitAt(x, y)) this.shells.push({ x, y });
  }

  /** Пули летят на клетку вперёд; вышедшие за поле и попавшие в машину пропадают. */
  private flyShells(): void {
    const shells: Shell[] = [];
    for (const shell of this.shells) {
      shell.y++;
      if (shell.y >= BRICK_ROWS) continue;
      if (this.hitAt(shell.x, shell.y)) continue;
      shells.push(shell);
    }
    this.shells = shells;
  }

  /** Попадание в клетку (x, y): встречная машина исчезает, очко за попадание. */
  private hitAt(x: number, y: number): boolean {
    const opponents = this.road.opponents;
    const index = opponents.findIndex((opponent) => carCovers(opponent.x, opponent.y, x, y));
    if (index < 0) return false;
    opponents.splice(index, 1);
    this.emit({ type: 'hit' });
    this.addScore(1);
    return true;
  }

  /** Машина игрока задела пешехода: он сбит, оружие заряжено. */
  private pickUp(walker: Walker): boolean {
    if (!carCovers(this.carX, CAR_Y, walker.x, walker.y)) return false;
    this.ammo = Math.min(MAX_AMMO, this.ammo + AMMO_PER_PEDESTRIAN);
    this.emit({ type: 'bonus' });
    return true;
  }
}
