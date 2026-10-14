import { describe, expect, it } from 'vitest';
import type { AnimationsDef, LevelDef } from '../../src/content/schema';
import { Game, makeFrame, type GameEvent, type GameEventBody } from '../../src/core';
import {
  blockAssetAt,
  bumpTiles,
  effectsWorld,
  LevelEffects,
  NO_EFFECTS,
  shuffledOrder,
  type EffectsWorld,
} from '../../src/render/effects';
import { clipContext, loadClipPack } from '../helpers/content';

const pack = loadClipPack();
const animations = pack.animations as AnimationsDef;
const level = pack.levels[0] as LevelDef;
const viewport = pack.screen.viewport;
const intro = animations.intro as NonNullable<AnimationsDef['intro']>;
const route = intro.routes['clip-room'] ?? [];

const world = (game: Game): EffectsWorld => effectsWorld(clipContext(), game.state) as EffectsWorld;
const ev = (event: GameEventBody, tick: number): GameEvent => ({ ...event, tick });

function gameAt(tick: number, phase: Game['state']['phase'] = 'ready'): Game {
  const game = new Game(clipContext());
  game.state.tick = tick;
  game.state.phase = phase;
  return game;
}

describe('отскок перекладины: клетки эффекта', () => {
  it('блок и его соседи по ряду без разрывов копируются на ряд выше (крышка арки — три клетки)', () => {
    const game = new Game(clipContext());
    expect(blockAssetAt(world(game), 0, 3)).toBe('cell.obstacle'); // тайл
    expect(blockAssetAt(world(game), 1, 3)).toBe('cell.obstacle'); // объект brick
    expect(blockAssetAt(world(game), 1, 4)).toBeNull();
    expect(bumpTiles(world(game), 1, 3).map((t) => [t.x, t.y])).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it('вспышка есть и при разрушении блока: клетка удара берётся, даже если блок уже исчез', () => {
    const game = new Game(clipContext());
    (game.state.objects[0] as { active: boolean }).active = false;
    expect(bumpTiles(world(game), 1, 3).map((t) => t.x)).toEqual([0, 1, 2]);
  });

  it('у верхнего края карты и над занятыми клетками копий нет', () => {
    const game = new Game(clipContext());
    expect(bumpTiles(world(game), 0, 0)).toEqual([]);
    // Над полом первого ряда стойки (x = 0, y = 5) уже стоит тайл y = 4: копия клетки не дублируется.
    expect(bumpTiles(world(game), 0, 5).filter((t) => t.x === 0)).toEqual([]);
  });

  it('копия живёт заданное число тактов и только на своём участке', () => {
    const game = new Game(clipContext());
    const fx = new LevelEffects(animations, { viewport, intro: false });
    fx.onEvent(ev({ type: 'bump', x: 1, y: 3 }, 100), world(game));
    const at = (tick: number): number => {
      game.state.tick = tick;
      return fx.frame(game.state, level).extra.length;
    };
    expect(at(100)).toBe(3);
    expect(at(104)).toBe(3);
    expect(at(105)).toBe(0); // bump.ticks = 5
    fx.onEvent(ev({ type: 'bump', x: 1, y: 3 }, 200), world(game));
    expect(at(201)).toBe(3);
    expect(fx.frame(game.state, { ...level, id: 'other' }).extra).toEqual([]);
  });

  it('без раздела bump эффекта нет', () => {
    const game = new Game(clipContext());
    const fx = new LevelEffects({ ...animations, bump: null }, { viewport, intro: false });
    fx.onEvent(ev({ type: 'bump', x: 1, y: 3 }, 1), world(game));
    expect(fx.frame(game.state, level)).toBe(NO_EFFECTS);
    const none = new LevelEffects(null, { viewport, intro: true });
    none.onEvent(ev({ type: 'bump', x: 1, y: 3 }, 1), world(game));
    expect(none.frame(game.state, level)).toBe(NO_EFFECTS);
  });
});

describe('интро участка (наблюдение по видео)', () => {
  const total = intro.blankTicks + intro.fillTicks + intro.holdTicks + intro.dissolveTicks + intro.emptyTicks + route.length * intro.stepTicks;
  const fillCount = Math.round(viewport.columns * viewport.rows * intro.coverage);
  const effects = (): LevelEffects => new LevelEffects(animations, { viewport, intro: true });
  const frameAt = (fx: LevelEffects, tick: number) => fx.frame(gameAt(tick).state, level);

  it('данные: маршрут — 18 клеток от правого края пола до ямы, шаг 3 такта (на видео ≈ 4,4 кадра)', () => {
    expect(route).toHaveLength(18);
    expect(route[0]).toEqual({ x: 12, y: 5 });
    expect(route[route.length - 1]).toEqual(level.start);
    expect(intro.stepTicks).toBe(3);
    expect(effects().introTicks('clip-room')).toBe(total);
  });

  it('пустой экран → заливка растёт → пауза → растворение → пустой экран', () => {
    const fx = effects();
    let t = 0;
    expect(frameAt(fx, t)).toMatchObject({ intro: true, hiddenTiles: 'all', objects: false, hero: 'hidden', fill: null });
    t = intro.blankTicks;
    const first = frameAt(fx, t).fill?.cells.length ?? 0;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(fillCount);
    t = intro.blankTicks + intro.fillTicks - 1;
    expect(frameAt(fx, t).fill?.cells).toHaveLength(fillCount); // заполнено
    t += 1;
    expect(frameAt(fx, t).fill?.cells).toHaveLength(fillCount); // держится
    t += intro.holdTicks;
    const dissolving = frameAt(fx, t).fill?.cells.length ?? -1;
    expect(dissolving).toBeLessThan(fillCount);
    expect(dissolving).toBeGreaterThan(0);
    t += intro.dissolveTicks - 1;
    expect(frameAt(fx, t).fill?.cells ?? []).toHaveLength(0); // растворилось полностью
    t += 1;
    expect(frameAt(fx, t)).toMatchObject({ fill: null, hiddenTiles: 'all', hero: 'hidden' });
    // Заливка монотонна: растёт при заполнении и убывает при растворении, клетки не выходят за поле.
    const counts = Array.from({ length: intro.fillTicks }, (_, i) => frameAt(fx, intro.blankTicks + i).fill?.cells.length ?? 0);
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
    for (const c of frameAt(fx, intro.blankTicks + 2).fill?.cells ?? []) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(viewport.columns);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(viewport.rows);
    }
  });

  it('построение: герой идёт по маршруту, покинутые клетки открываются; объект (крышка) — когда герой её покинул', () => {
    const fx = effects();
    const build = intro.blankTicks + intro.fillTicks + intro.holdTicks + intro.dissolveTicks + intro.emptyTicks;
    const w = level.width;
    const f0 = frameAt(fx, build);
    expect(f0.hero).toEqual(route[0]);
    expect(f0.objects).toBe(true);
    expect((f0.hiddenTiles as ReadonlySet<number>).size).toBe(route.length);
    const f1 = frameAt(fx, build + intro.stepTicks);
    expect(f1.hero).toEqual(route[1]);
    expect((f1.hiddenTiles as ReadonlySet<number>).has(5 * w + 12)).toBe(false); // (12,5) покинута
    expect((f1.hiddenTiles as ReadonlySet<number>).has(5 * w + 11)).toBe(true);
    const lidIndex = route.findIndex((c) => c.x === 1 && c.y === 3);
    const before = frameAt(fx, build + lidIndex * intro.stepTicks);
    const after = frameAt(fx, build + (lidIndex + 1) * intro.stepTicks);
    expect((before.hiddenTiles as ReadonlySet<number>).has(3 * w + 1)).toBe(true);
    expect((after.hiddenTiles as ReadonlySet<number>).has(3 * w + 1)).toBe(false);
    const last = frameAt(fx, total - 1);
    expect(last).toMatchObject({ intro: true, hero: level.start });
    expect((last.hiddenTiles as ReadonlySet<number>).size).toBe(1); // скрыта только клетка, где стоит герой
  });

  it('после интро — обычная сцена; вне фазы ready интро не показывается (нажатие Start пропускает его)', () => {
    const fx = effects();
    expect(frameAt(fx, total)).toBe(NO_EFFECTS);
    expect(fx.frame(gameAt(10, 'playing').state, level)).toBe(NO_EFFECTS);
    expect(fx.frame(gameAt(10, 'paused').state, level)).toBe(NO_EFFECTS);
  });

  it('интро отсчитывается от события levelStarted (перезапуск и возрождение), а не от нуля страницы', () => {
    const fx = effects();
    const game = gameAt(500);
    expect(fx.frame(game.state, level)).toBe(NO_EFFECTS); // 500 тактов после старта страницы
    fx.onEvent(ev({ type: 'levelStarted', levelId: 'clip-room' }, 500), world(game));
    expect(fx.frame(game.state, level).intro).toBe(true);
    game.state.tick = 500 + total;
    expect(fx.frame(game.state, level)).toBe(NO_EFFECTS);
  });

  it('в тестовом запуске редактора интро выключено; у участка без маршрута — только заливка', () => {
    const off = new LevelEffects(animations, { viewport, intro: false });
    expect(off.introTicks('clip-room')).toBe(0);
    expect(off.frame(gameAt(0).state, level)).toBe(NO_EFFECTS);
    const fx = effects();
    expect(fx.introTicks('нет-такого-участка')).toBe(total - route.length * intro.stepTicks);
  });

  it('порядок заливки детерминирован: один и тот же для одного участка, разный для разных', () => {
    expect(shuffledOrder(78, 7)).toEqual(shuffledOrder(78, 7));
    expect(shuffledOrder(78, 7)).not.toEqual(shuffledOrder(78, 8));
    expect([...shuffledOrder(78, 7)].sort((a, b) => a - b)).toEqual(Array.from({ length: 78 }, (_, i) => i));
    const a = frameAt(effects(), intro.blankTicks + intro.fillTicks - 1).fill?.cells;
    const b = frameAt(effects(), intro.blankTicks + intro.fillTicks - 1).fill?.cells;
    expect(a).toEqual(b);
  });

  it('симуляцию эффекты не трогают: ход игры в ready не меняется', () => {
    const game = new Game(clipContext());
    const before = game.serialize();
    const fx = effects();
    fx.frame(game.state, level);
    fx.onEvent(ev({ type: 'bump', x: 1, y: 3 }, 0), world(game));
    expect(game.serialize()).toBe(before);
    game.step(makeFrame({ pressed: ['start'] }));
    expect(game.state.phase).toBe('playing');
  });
});
