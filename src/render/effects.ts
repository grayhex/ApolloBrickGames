import type { AnimationsDef, CellPos, LevelDef } from '../content/schema';
import { nextRandom } from '../core/rng';
import type { GameContext } from '../core/sim';
import type { GameEvent, GameState } from '../core/state';
import { bannerCells } from './banner';

/**
 * Презентационные эффекты по наблюдениям видео (docs/video-observations.md): отскок перекладины при ударе головой
 * и интро участка. Состояние симуляции они не меняют и в replay не входят: время считается по `state.tick`,
 * стартовые тики приходят из событий ядра. Без DOM и часов — чистые вычисления, их можно проверять тестами.
 */

export interface FillCells {
  /** Ресурс блока заливки (первая «твёрдая» запись легенды с рисунком). */
  asset: string;
  /** Клетки экрана (в клетках поля, без камеры). */
  cells: readonly CellPos[];
}

export interface ExtraTile {
  x: number;
  y: number;
  /** Ресурс, которым рисуется клетка. */
  asset: string;
}

/** Что нужно эффектам знать о мире в момент события. */
export interface EffectsWorld {
  level: LevelDef;
  state: GameState;
  /** Твёрдый ли тип объекта (из реестра поведений). */
  isSolidType(type: string): boolean;
}

/** Что дорисовать или спрятать в этом кадре. */
export interface EffectsFrame {
  /** Идёт интро — оболочка не показывает оверлей «Старт» (старт по-прежнему можно нажать: интро пропускается). */
  intro: boolean;
  /** Заливка поля блоками (интро). */
  fill: FillCells | null;
  /** Тайлы карты, которые не рисуются: все (`'all'`) либо набор индексов `y * width + x`. */
  hiddenTiles: 'all' | ReadonlySet<number> | null;
  /** Объекты уровня рисуются (в интро — нет). */
  objects: boolean;
  /** Герой: по состоянию игры, скрыт или в клетке маршрута. */
  hero: 'state' | 'hidden' | CellPos;
  /** Дополнительные тайлы (отскок перекладины). */
  extra: readonly ExtraTile[];
  /** Значки жизни сейчас погашены: они мигают после секрета с бонусными жизнями (в LCD-HUD). */
  livesHidden: boolean;
}

export const NO_EFFECTS: EffectsFrame = {
  intro: false,
  fill: null,
  hiddenTiles: null,
  objects: true,
  hero: 'state',
  extra: [],
  livesHidden: false,
};

/** Сколько тактов мигают значки жизни после секрета и сколько тактов длится одна фаза мигания (допущение: в оригинале реакции на секрет не измерено). */
export const SECRET_BLINK_TICKS = 40;
export const SECRET_BLINK_PHASE_TICKS = 4;

interface BumpRecord {
  levelId: string;
  tick: number;
  tiles: readonly ExtraTile[];
}

/** Хэш строки (FNV-1a) → начальное состояние ГСЧ: порядок заливки у каждого участка свой, но всегда одинаковый. */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Перестановка 0…count−1 (Фишер—Йетс на детерминированном ГСЧ). */
export function shuffledOrder(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  let state = seed >>> 0;
  for (let i = count - 1; i > 0; i--) {
    const roll = nextRandom(state);
    state = roll.state;
    const j = Math.floor(roll.value * (i + 1));
    const a = order[i] as number;
    order[i] = order[j] as number;
    order[j] = a;
  }
  return order;
}

/** Мир для эффектов из контекста игры и её состояния; null — участка нет. */
export function effectsWorld(ctx: GameContext, state: GameState): EffectsWorld | null {
  const level = ctx.levels.get(state.levelId)?.def;
  return level ? { level, state, isSolidType: (type) => ctx.behaviors[type]?.solid === true } : null;
}

/** Ресурс видимого блока в клетке: твёрдый тайл либо активный твёрдый объект. null — блока нет. */
export function blockAssetAt(world: EffectsWorld, x: number, y: number): string | null {
  const { level, state } = world;
  const char = level.rows[y]?.[x];
  if (char !== undefined) {
    const entry = level.legend[char];
    if (entry?.collision === 'solid') return entry.asset ?? fillAssetOf(level);
  }
  for (let i = 0; i < level.objects.length; i++) {
    const def = level.objects[i];
    const object = state.objects[i];
    if (!def || !object || !object.active || !world.isSolidType(def.type)) continue;
    if (x >= object.x && x < object.x + def.w && y >= object.y && y < object.y + def.h) return def.asset ?? fillAssetOf(level);
  }
  return null;
}

/**
 * Копия блока, по которому ударили головой, и его соседей по ряду без разрывов — на ряд выше.
 * Клетка удара берётся даже если блок только что разрушен (в видео вспышка была и при разрушении).
 */
export function bumpTiles(world: EffectsWorld, x: number, y: number): ExtraTile[] {
  if (y < 1) return [];
  const hit = blockAssetAt(world, x, y) ?? fillAssetOf(world.level);
  if (hit === null) return [];
  const run = new Map<number, string>([[x, hit]]);
  for (const step of [-1, 1]) {
    for (let nx = x + step; nx >= 0 && nx < world.level.width; nx += step) {
      const asset = blockAssetAt(world, nx, y);
      if (asset === null) break;
      run.set(nx, asset);
    }
  }
  const tiles: ExtraTile[] = [];
  for (const [nx, asset] of run) {
    if (blockAssetAt(world, nx, y - 1) === null) tiles.push({ x: nx, y: y - 1, asset });
  }
  return tiles.sort((a, b) => a.x - b.x);
}

function fillAssetOf(level: LevelDef): string | null {
  for (const entry of Object.values(level.legend)) {
    if (entry.collision === 'solid' && entry.asset) return entry.asset;
  }
  return null;
}

export interface EffectsOptions {
  /** Колонки и строки поля на экране (для заливки интро). */
  viewport: { columns: number; rows: number };
  /** Играть интро; в тестовом запуске редактора — нет. */
  intro: boolean;
}

/**
 * Хранит стартовые такты эффектов и по состоянию игры строит `EffectsFrame`.
 * События ядра приходят в `onEvent` (в том же порядке, что и в звук).
 */
export class LevelEffects {
  private introStart = 0;
  private bumps: BumpRecord[] = [];
  private secretTick: number | null = null;
  private gameOverTick: number | null = null;
  private readonly orders = new Map<string, number[]>();
  private readonly animations: AnimationsDef | null;
  private readonly options: EffectsOptions;

  constructor(animations: AnimationsDef | null, options: EffectsOptions) {
    this.animations = animations;
    this.options = options;
  }

  onEvent(event: GameEvent, world: EffectsWorld): void {
    if (event.type === 'levelStarted') {
      this.introStart = event.tick;
      this.bumps = [];
      this.secretTick = null;
      this.gameOverTick = null;
    } else if (event.type === 'gameOver') {
      this.gameOverTick = event.tick;
    } else if (event.type === 'secretLives') {
      this.secretTick = event.tick;
    } else if (event.type === 'bump' && this.animations?.bump) {
      const tiles = bumpTiles(world, event.x, event.y);
      if (tiles.length > 0) this.bumps.push({ levelId: world.level.id, tick: event.tick, tiles });
    }
  }

  /** Полное время интро в тактах для участка (0 — интро нет). */
  introTicks(levelId: string): number {
    const intro = this.animations?.intro;
    if (!intro || !this.options.intro) return 0;
    const route = intro.routes[levelId];
    return (
      intro.blankTicks +
      intro.fillTicks +
      intro.holdTicks +
      intro.dissolveTicks +
      intro.emptyTicks +
      (route ? route.length * intro.stepTicks : 0)
    );
  }

  frame(state: GameState, level: LevelDef): EffectsFrame {
    const base = this.sceneFrame(state, level);
    return this.livesHidden(state) ? { ...base, livesHidden: true } : base;
  }

  private sceneFrame(state: GameState, level: LevelDef): EffectsFrame {
    if (state.phase === 'gameOver') return this.gameOverFrame(state, level);
    const intro = this.introFrame(state, level);
    if (intro) return intro;
    const extra = this.bumpFrame(state, level);
    return extra.length === 0 ? NO_EFFECTS : { ...NO_EFFECTS, extra };
  }

  /** Конец игры: поле пустеет, и по нему плывёт надпись «GAME OVER» из блоков (презентация, как в оригинале). */
  private gameOverFrame(state: GameState, level: LevelDef): EffectsFrame {
    const asset = fillAssetOf(level);
    const dt = state.tick - (this.gameOverTick ?? state.tick);
    const cells = asset ? bannerCells(dt, this.options.viewport) : [];
    return {
      ...NO_EFFECTS,
      hiddenTiles: 'all',
      objects: false,
      hero: 'hidden',
      fill: asset ? { asset, cells } : null,
    };
  }

  /** Мигание значков жизни после секрета: фаза «погашены» чередуется с «горят», начиная с погашенных. */
  private livesHidden(state: GameState): boolean {
    if (this.secretTick === null) return false;
    const dt = state.tick - this.secretTick;
    if (dt < 0 || dt >= SECRET_BLINK_TICKS) return false;
    return Math.floor(dt / SECRET_BLINK_PHASE_TICKS) % 2 === 0;
  }

  private bumpFrame(state: GameState, level: LevelDef): ExtraTile[] {
    const bump = this.animations?.bump;
    if (!bump) return [];
    this.bumps = this.bumps.filter((b) => state.tick - b.tick < bump.ticks);
    return this.bumps.filter((b) => b.levelId === level.id).flatMap((b) => b.tiles);
  }

  private order(level: LevelDef): number[] {
    const { columns, rows } = this.options.viewport;
    let order = this.orders.get(level.id);
    if (!order) {
      order = shuffledOrder(columns * rows, seedOf(level.id));
      this.orders.set(level.id, order);
    }
    return order;
  }

  private introFrame(state: GameState, level: LevelDef): EffectsFrame | null {
    const intro = this.animations?.intro;
    if (!intro || !this.options.intro || state.phase !== 'ready') return null;
    const route = intro.routes[level.id] ?? [];
    const total = this.introTicks(level.id);
    const t = state.tick - this.introStart;
    if (t < 0 || t >= total) return null;

    const hidden: EffectsFrame = { ...NO_EFFECTS, intro: true, hiddenTiles: 'all', objects: false, hero: 'hidden' };
    let left = t;
    if (left < intro.blankTicks) return hidden;
    left -= intro.blankTicks;

    const { columns } = this.options.viewport;
    const asset = fillAssetOf(level);
    const cellsOf = (indices: readonly number[]): CellPos[] =>
      indices.map((i) => ({ x: i % columns, y: Math.floor(i / columns) }));
    const filled = (): number[] => {
      const order = this.order(level);
      return order.slice(0, Math.round(order.length * intro.coverage));
    };

    if (left < intro.fillTicks) {
      const all = filled();
      const count = Math.ceil((all.length * (left + 1)) / intro.fillTicks);
      return { ...hidden, fill: asset ? { asset, cells: cellsOf(all.slice(0, count)) } : null };
    }
    left -= intro.fillTicks;

    if (left < intro.holdTicks) return { ...hidden, fill: asset ? { asset, cells: cellsOf(filled()) } : null };
    left -= intro.holdTicks;

    if (left < intro.dissolveTicks) {
      const all = filled().reverse();
      const gone = Math.ceil((all.length * (left + 1)) / intro.dissolveTicks);
      return { ...hidden, fill: asset ? { asset, cells: cellsOf(all.slice(gone)) } : null };
    }
    left -= intro.dissolveTicks;

    if (left < intro.emptyTicks) return hidden;
    left -= intro.emptyTicks;

    // Построение: герой идёт по маршруту, покинутые им клетки становятся видимыми.
    const step = Math.min(Math.floor(left / intro.stepTicks), route.length - 1);
    const pending = new Set<number>();
    route.forEach((cell, index) => {
      if (index >= step) pending.add(cell.y * level.width + cell.x);
    });
    const here = route[step];
    // Объекты в построении появляются так же, как тайлы: когда герой покинул их клетку (проверка — в рендерере).
    return {
      intro: true,
      fill: null,
      hiddenTiles: pending,
      objects: true,
      hero: here ?? 'hidden',
      extra: [],
      livesHidden: false,
    };
  }
}
