import type { ContentPack, ObjectDef, RuleSetDef } from '../content/schema';
import { actionBit, isAction, maskOf, SECRET_CHORD, type ActionMask, type InputFrame } from './actions';
import { DEMO_BEHAVIORS, type BehaviorRegistry, type SimApi } from './behaviors';
import { prepareLevel, tileSolid, type LevelRuntime } from './level';
import type {
  DeathCause,
  GameEvent,
  GameEventBody,
  GameState,
  HeroState,
  ObjectState,
  Phase,
  ProjectileState,
} from './state';

/**
 * Всё, что нужно симуляции помимо состояния: правила, уровни, обработчики.
 * Контекст неизменяемый и в сериализацию состояния не входит.
 */
export interface GameContext {
  readonly rules: RuleSetDef;
  readonly contentId: string;
  readonly contentVersion: number;
  readonly levels: ReadonlyMap<string, LevelRuntime>;
  readonly firstLevel: string;
  readonly behaviors: BehaviorRegistry;
  /** Действия, запускающие прыжок (связь up/jump задаёт профиль правил). */
  readonly jumpMask: ActionMask;
}

export function createContext(
  pack: Pick<ContentPack, 'manifest' | 'rules' | 'levels'>,
  behaviors: BehaviorRegistry = DEMO_BEHAVIORS,
): GameContext {
  return {
    rules: pack.rules,
    contentId: pack.manifest.id,
    contentVersion: pack.manifest.version,
    levels: new Map(pack.levels.map((level) => [level.id, prepareLevel(level)])),
    firstLevel: pack.manifest.firstLevel,
    behaviors,
    jumpMask: maskOf(...pack.rules.params.jump.triggers.filter(isAction)),
  };
}

export interface StepOptions {
  /** Отладочный шаг: посчитать мир на один такт, оставаясь в `paused`. */
  simulateWhilePaused?: boolean;
}

const LEFT = actionBit('left');
const RIGHT = actionBit('right');
const FIRE = actionBit('fire');
const START = actionBit('start');
const PAUSE = actionBit('pause');

function overlaps(state: ObjectState, def: ObjectDef, x: number, y: number): boolean {
  return x >= state.x && x < state.x + def.w && y >= state.y && y < state.y + def.h;
}

/**
 * Игровое ядро. Не знает про DOM, Canvas, Gamepad API, звук и часы:
 * вся динамика — вызов `step(inputFrame)` на один логический такт.
 */
export class Game implements SimApi {
  readonly ctx: GameContext;
  state: GameState;
  private events: GameEvent[] = [];
  /** Меняется при загрузке участка; защищает от «хвоста» такта на старом участке. */
  private serial = 0;
  /** Идёт шаг героя вниз: касание объекта в этот момент — наступание сверху (см. `ObjectBehavior.stomp`). */
  private stomping = false;

  constructor(ctx: GameContext, seed = 1, state?: GameState) {
    this.ctx = ctx;
    this.state = state ?? this.createState(seed);
  }

  // ── Публичный API ────────────────────────────────────────────────────────

  /** Один логический такт. Возвращает события такта в стабильном порядке. */
  step(frame: InputFrame, options: StepOptions = {}): readonly GameEvent[] {
    this.events = [];
    const s = this.state;
    s.tick += 1;

    if ((s.phase === 'ready' || s.phase === 'playing') && (frame.held & SECRET_CHORD) !== 0) this.applySecret();

    switch (s.phase) {
      case 'ready':
        if (frame.pressed & START) {
          s.gameStarted = true;
          this.setPhase('playing');
        }
        break;
      case 'playing':
        if (frame.pressed & PAUSE) this.setPhase('paused');
        else this.simulate(frame);
        break;
      case 'paused':
        if (frame.pressed & (START | PAUSE)) this.setPhase('playing');
        else if (options.simulateWhilePaused) this.simulatePaused(frame);
        break;
      case 'dead':
        s.phaseTimer -= 1;
        if (s.phaseTimer <= 0) this.afterDeath();
        break;
      case 'gameOver':
      case 'completed':
        if (frame.pressed & START) {
          this.resetState();
          this.setPhase('playing');
        }
        break;
    }
    return this.events;
  }

  /** Новая игра с тем же seed; фаза `ready`. */
  reset(): readonly GameEvent[] {
    this.events = [];
    this.resetState();
    return this.events;
  }

  serialize(): string {
    return JSON.stringify(this.state);
  }

  static restore(ctx: GameContext, json: string): Game {
    const state = JSON.parse(json) as GameState;
    const { meta } = state;
    if (
      state.stateVersion !== 1 ||
      meta.rulesId !== ctx.rules.id ||
      meta.rulesVersion !== ctx.rules.version ||
      meta.contentId !== ctx.contentId ||
      meta.contentVersion !== ctx.contentVersion
    ) {
      throw new Error('Сохранённое состояние относится к другим правилам или контенту.');
    }
    if (!ctx.levels.has(state.levelId)) throw new Error(`Неизвестный уровень в состоянии: ${state.levelId}`);
    return new Game(ctx, state.seed, state);
  }

  get level(): LevelRuntime {
    const level = this.ctx.levels.get(this.state.levelId);
    if (!level) throw new Error(`Уровень «${this.state.levelId}» не найден.`);
    return level;
  }

  /**
   * Секрет оригинала: аккорд, пока герой ещё в «колодце» (с начала участка не уходил из столбца старта), даёт бонусные жизни.
   * Повторное нажатие ничего не меняет (жизни только растут до `secret.lives`); после гибели герой снова на старте — секрет снова доступен.
   */
  private applySecret(): void {
    const secret = this.ctx.rules.params.secret;
    const s = this.state;
    if (!secret || !s.inWell || s.lives >= secret.lives) return;
    s.lives = secret.lives;
    this.emit({ type: 'secretLives', lives: secret.lives });
  }

  // ── SimApi для обработчиков объектов ─────────────────────────────────────

  emit(event: GameEventBody): void {
    this.events.push({ ...event, tick: this.state.tick });
  }

  addScore(points: number): void {
    this.state.score += points;
  }

  die(cause: DeathCause): void {
    const s = this.state;
    if (s.phase !== 'playing') return;
    s.lives = Math.max(0, s.lives - 1);
    s.deathCause = cause;
    s.phaseTimer = this.ctx.rules.params.deathDelayTicks;
    this.emit({ type: 'death', cause, x: s.hero.x, y: s.hero.y });
    this.setPhase('dead');
  }

  completeLevel(objectId: string): void {
    const level = this.level;
    const next = level.transitions.get(objectId) ?? null;
    this.emit({ type: 'levelCompleted', levelId: level.def.id, next });
    if (next !== null) {
      this.enterSection(next);
    } else {
      this.setPhase('completed');
      this.emit({ type: 'gameCompleted' });
    }
  }

  isBlockedForObject(x: number, y: number): boolean {
    const level = this.level;
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return true;
    return tileSolid(level, x, y) || this.solidObjectAt(x, y);
  }

  // ── Создание состояния и участков ────────────────────────────────────────

  private createState(seed: number): GameState {
    const { ctx } = this;
    const level = this.levelById(ctx.firstLevel);
    return {
      stateVersion: 1,
      meta: {
        rulesId: ctx.rules.id,
        rulesVersion: ctx.rules.version,
        contentId: ctx.contentId,
        contentVersion: ctx.contentVersion,
      },
      seed,
      rng: seed >>> 0,
      tick: 0,
      worldTick: 0,
      phase: 'ready',
      levelId: level.def.id,
      hero: this.newHero(level),
      projectiles: [],
      nextProjectileId: 1,
      objects: this.newObjects(level),
      score: 0,
      lives: ctx.rules.params.lives,
      timerTicks: ctx.rules.params.timerLimitTicks,
      inWell: true,
      gameStarted: false,
      phaseTimer: 0,
      deathCause: null,
    };
  }

  private resetState(): void {
    this.state = this.createState(this.state.seed);
    this.serial += 1;
    this.emit({ type: 'levelStarted', levelId: this.state.levelId });
  }

  private levelById(id: string): LevelRuntime {
    const level = this.ctx.levels.get(id);
    if (!level) throw new Error(`Уровень «${id}» не найден.`);
    return level;
  }

  private newHero(level: LevelRuntime): HeroState {
    return {
      x: level.def.start.x,
      y: level.def.start.y,
      facing: 1,
      moveDir: 0,
      moveHold: 0,
      jumpIndex: -1,
      jumpTimer: 0,
      fallTimer: 0,
      airborne: false,
      fireCooldown: 0,
    };
  }

  private newObjects(level: LevelRuntime): ObjectState[] {
    return level.def.objects.map((def) => {
      const state: ObjectState = { id: def.id, x: def.x, y: def.y, active: true, hp: 1, dir: 1, timer: 0 };
      this.ctx.behaviors[def.type]?.init?.(def, state);
      return state;
    });
  }

  /** Загрузить участок: герой на старт, объекты и таймер заново; счёт и жизни остаются. */
  private enterSection(levelId: string): void {
    const level = this.levelById(levelId);
    const s = this.state;
    s.levelId = levelId;
    s.hero = this.newHero(level);
    s.objects = this.newObjects(level);
    s.projectiles = [];
    if (this.ctx.rules.params.timerScope !== 'game') s.timerTicks = this.ctx.rules.params.timerLimitTicks;
    s.inWell = true;
    this.serial += 1;
    this.emit({ type: 'levelStarted', levelId });
  }

  private setPhase(to: Phase): void {
    const from = this.state.phase;
    if (from === to) return;
    this.state.phase = to;
    this.emit({ type: 'phaseChanged', from, to });
  }

  private afterDeath(): void {
    const s = this.state;
    if (s.lives > 0) {
      this.enterSection(s.levelId);
      this.setPhase('ready');
    } else {
      this.setPhase('gameOver');
      this.emit({ type: 'gameOver' });
    }
  }

  // ── Симуляция такта ──────────────────────────────────────────────────────

  private alive(serial: number): boolean {
    return this.state.phase === 'playing' && this.serial === serial;
  }

  private simulatePaused(frame: InputFrame): void {
    this.state.phase = 'playing';
    this.simulate(frame);
    if (this.state.phase === 'playing') this.state.phase = 'paused';
  }

  private simulate(frame: InputFrame): void {
    const s = this.state;
    const params = this.ctx.rules.params;
    const serial = this.serial;
    s.worldTick += 1;

    if (params.timerLimitTicks > 0) {
      s.timerTicks -= 1;
      if (s.timerTicks <= 0) {
        if (params.timerScope === 'game') s.lives = 1; // время игры вышло — игра окончена, а не потеря одной жизни
        this.die('time');
        return;
      }
    }

    this.updateHero(frame);
    if (s.hero.x !== this.level.def.start.x) s.inWell = false; // выпрыгнул из колодца — секрет закрыт до возрождения
    if (!this.alive(serial)) return;
    this.updateFire(frame);
    this.updateObjects();
    if (!this.alive(serial)) return;
    this.updateProjectiles();
    this.checkHeroTouch();
  }

  /** Клетка непроходима для героя. Левая/правая граница и потолок — стены, низ — провал (или земля, см. `bottomEdge`). */
  private blocked(x: number, y: number): boolean {
    const level = this.level;
    if (x < 0 || x >= level.width || y < 0) return true;
    if (y >= level.height) return this.ctx.rules.params.bottomEdge === 'floor';
    return tileSolid(level, x, y) || this.solidObjectAt(x, y);
  }

  private solidObjectAt(x: number, y: number): boolean {
    const defs = this.level.def.objects;
    const objects = this.state.objects;
    for (let i = 0; i < objects.length; i++) {
      const state = objects[i];
      const def = defs[i];
      if (!state || !def || !state.active) continue;
      if (this.ctx.behaviors[def.type]?.solid && overlaps(state, def, x, y)) return true;
    }
    return false;
  }

  /** Удар головой в клетку: твёрдые объекты в ней получают `headHit` (например, ломаются). */
  private headHitObjects(x: number, y: number): void {
    const defs = this.level.def.objects;
    const objects = this.state.objects;
    for (let i = 0; i < objects.length; i++) {
      const state = objects[i];
      const def = defs[i];
      if (!state || !def || !state.active || !overlaps(state, def, x, y)) continue;
      const behavior = this.ctx.behaviors[def.type];
      if (behavior?.solid) behavior.headHit?.(this, state, def);
    }
  }

  /** Шаг героя на одну клетку. false — путь закрыт. */
  private tryMoveHero(dx: number, dy: number): boolean {
    const hero = this.state.hero;
    const nx = hero.x + dx;
    const ny = hero.y + dy;
    if (ny >= this.level.height && this.ctx.rules.params.bottomEdge !== 'floor') {
      hero.y = ny;
      this.die('pit');
      return true;
    }
    if (this.blocked(nx, ny)) return false;
    hero.x = nx;
    hero.y = ny;
    this.stomping = dy > 0; // вошёл в клетку сверху (спуск) — это наступание, а не касание
    this.checkHeroTouch();
    this.stomping = false;
    return true;
  }

  /** Вертикальное перемещение по клеткам (каждая клетка проверяется отдельно). */
  private moveVertical(delta: number): boolean {
    const serial = this.serial;
    const step = Math.sign(delta);
    for (let i = 0; i < Math.abs(delta); i++) {
      if (!this.tryMoveHero(0, step)) return false;
      if (!this.alive(serial)) return false;
    }
    return true;
  }

  private updateHero(frame: InputFrame): void {
    const serial = this.serial;
    const hero = this.state.hero;
    // Прыжок решается по состоянию на начало такта: нажать прыжок в тот же такт,
    // когда герой шагает с края, — это прыжок, а не падение.
    const groundedAtStart = this.blocked(hero.x, hero.y + 1);
    this.updateHorizontal(frame);
    if (!this.alive(serial)) return;
    this.updateVertical(frame, groundedAtStart);
  }

  private updateHorizontal(frame: InputFrame): void {
    const hero = this.state.hero;
    const move = this.ctx.rules.params.move;
    const left = (frame.held & LEFT) !== 0;
    const right = (frame.held & RIGHT) !== 0;
    const dir: -1 | 0 | 1 = left === right ? 0 : left ? -1 : 1;

    if (dir === 0) {
      hero.moveDir = 0;
      hero.moveHold = 0;
      return;
    }
    hero.facing = dir;
    if (dir !== hero.moveDir) {
      hero.moveDir = dir;
      hero.moveHold = 0;
    } else {
      hero.moveHold += 1;
    }
    const hold = hero.moveHold;
    const due =
      hold === 0 || (hold >= move.repeatDelayTicks && (hold - move.repeatDelayTicks) % move.repeatIntervalTicks === 0);
    if (due) this.tryMoveHero(dir, 0);
  }

  private endJump(): void {
    const hero = this.state.hero;
    hero.jumpIndex = -1;
    hero.jumpTimer = 0;
    hero.fallTimer = 0;
  }

  private updateVertical(frame: InputFrame, groundedAtStart: boolean): void {
    const hero = this.state.hero;
    const { jump, fall } = this.ctx.rules.params;

    if (hero.jumpIndex < 0 && groundedAtStart && (frame.pressed & this.ctx.jumpMask) !== 0) {
      hero.jumpIndex = 0;
      hero.jumpTimer = 0;
      hero.airborne = true;
      this.emit({ type: 'jump', x: hero.x, y: hero.y });
    }

    if (hero.jumpIndex >= 0) {
      const serial = this.serial;
      if (hero.jumpTimer === 0) {
        const delta = jump.table[hero.jumpIndex] ?? 0;
        if (delta !== 0 && !this.moveVertical(delta)) {
          if (this.alive(serial)) {
            // Голова упёрлась в блок (за верхним краем карты блока нет — эффекта нет).
            if (delta < 0 && hero.y > 0) {
              this.emit({ type: 'bump', x: hero.x, y: hero.y - 1 });
              this.headHitObjects(hero.x, hero.y - 1);
            }
            this.endJump(); // упёрлись в потолок или пол
          }
          return;
        }
      }
      hero.jumpTimer += 1;
      if (hero.jumpTimer >= jump.stepTicks) {
        hero.jumpTimer = 0;
        hero.jumpIndex += 1;
        if (hero.jumpIndex >= jump.table.length) this.endJump();
      }
      return;
    }

    if (!this.blocked(hero.x, hero.y + 1)) {
      hero.airborne = true;
      hero.fallTimer += 1;
      if (hero.fallTimer >= fall.periodTicks) {
        hero.fallTimer = 0;
        this.moveVertical(1);
      }
    } else {
      hero.fallTimer = 0;
      if (hero.airborne) {
        hero.airborne = false;
        this.emit({ type: 'land', x: hero.x, y: hero.y });
      }
    }
  }

  private updateFire(frame: InputFrame): void {
    const s = this.state;
    const hero = s.hero;
    const fire = this.ctx.rules.params.fire;
    if (!fire) return; // стрельбы в этих правилах нет
    if (hero.fireCooldown > 0) hero.fireCooldown -= 1;

    const wantsFire = (frame.pressed & FIRE) !== 0 || (fire.holdRepeat && (frame.held & FIRE) !== 0);
    if (!wantsFire || hero.fireCooldown > 0 || s.projectiles.length >= fire.maxProjectiles) return;

    s.projectiles.push({ id: s.nextProjectileId, x: hero.x, y: hero.y, dir: hero.facing, travelled: 0, timer: 0 });
    s.nextProjectileId += 1;
    hero.fireCooldown = fire.intervalTicks;
    this.emit({ type: 'shot', x: hero.x, y: hero.y, dir: hero.facing });
  }

  private updateObjects(): void {
    const defs = this.level.def.objects;
    const objects = this.state.objects;
    for (let i = 0; i < objects.length; i++) {
      const state = objects[i];
      const def = defs[i];
      if (!state || !def || !state.active) continue;
      this.ctx.behaviors[def.type]?.update?.(this, state, def);
    }
  }

  private updateProjectiles(): void {
    const s = this.state;
    const fire = this.ctx.rules.params.fire;
    if (!fire) return;
    const { stepTicks } = fire.projectile;
    const survivors: ProjectileState[] = [];
    for (const projectile of s.projectiles) {
      projectile.timer += 1;
      if (projectile.timer < stepTicks) {
        survivors.push(projectile);
        continue;
      }
      projectile.timer = 0;
      if (this.advanceProjectile(projectile, fire.projectile)) survivors.push(projectile);
    }
    s.projectiles = survivors;
  }

  /**
   * Движение снаряда на cellsPerStep клеток. Проверяется КАЖДАЯ клетка пути,
   * поэтому быстрый снаряд не пролетает сквозь стену или цель.
   * Возвращает false, если снаряд удалён.
   */
  private advanceProjectile(
    projectile: ProjectileState,
    { cellsPerStep, maxRangeCells }: { cellsPerStep: number; maxRangeCells: number },
  ): boolean {
    const level = this.level;

    // Объект мог сам зайти в клетку снаряда (патруль едет навстречу).
    if (this.projectileHitsAt(projectile.x, projectile.y)) return false;

    for (let i = 0; i < cellsPerStep; i++) {
      const nx = projectile.x + projectile.dir;
      if (nx < 0 || nx >= level.width || tileSolid(level, nx, projectile.y)) {
        this.emit({ type: 'projectileBlocked', x: nx, y: projectile.y });
        return false;
      }
      projectile.x = nx;
      projectile.travelled += 1;
      if (this.projectileHitsAt(nx, projectile.y)) return false;
      if (projectile.travelled >= maxRangeCells) return false;
    }
    return true;
  }

  private projectileHitsAt(x: number, y: number): boolean {
    const defs = this.level.def.objects;
    const objects = this.state.objects;
    for (let i = 0; i < objects.length; i++) {
      const state = objects[i];
      const def = defs[i];
      if (!state || !def || !state.active || !overlaps(state, def, x, y)) continue;
      if (this.ctx.behaviors[def.type]?.projectileHit?.(this, state, def)) return true;
    }
    return false;
  }

  private checkHeroTouch(): void {
    const s = this.state;
    if (s.phase !== 'playing') return;
    const serial = this.serial;
    const defs = this.level.def.objects;
    const objects = s.objects;
    for (let i = 0; i < objects.length; i++) {
      const state = objects[i];
      const def = defs[i];
      if (!state || !def || !state.active || !overlaps(state, def, s.hero.x, s.hero.y)) continue;
      const behavior = this.ctx.behaviors[def.type];
      if (this.stomping && behavior?.stomp?.(this, state, def)) continue;
      behavior?.heroTouch?.(this, state, def);
      if (!this.alive(serial)) return;
    }
  }
}
