import { describe, expect, it } from 'vitest';
import { assemblePack } from '../../src/content/validate';
import type { LevelDef } from '../../src/content/schema';
import { createContext, Game, makeFrame, validationEnv, type GameEvent } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { clipContext, loadClipPack, loadRawPack, loadRoomPack, roomContext } from '../helpers/content';
import { idle, run, type Segment } from '../helpers/script';

/**
 * Параметры физики взяты из видео фрагмента (30 кадров/с) — это НАБЛЮДЕНИЯ, а не правила оригинала.
 * Один такт движка = 50 мс = 1,5 кадра видео. Подробности и методика — docs/video-observations.md.
 */
const FRAMES_PER_TICK = 1.5;

function started(ctx = roomContext()): Game {
  const game = new Game(ctx);
  game.step(makeFrame({ pressed: ['start'] }));
  return game;
}

/** Длительности пребывания героя в одной и той же строке (в тактах), подряд, пока не вернулся на землю. */
function dwellTicks(game: Game, ticks: number, press: (i: number) => boolean): { y: number; ticks: number }[] {
  const out: { y: number; ticks: number }[] = [];
  for (let i = 0; i < ticks; i++) {
    game.step(makeFrame({ pressed: press(i) ? ['jump'] : [] }));
    const y = game.state.hero.y;
    const last = out[out.length - 1];
    if (last?.y === y) last.ticks += 1;
    else out.push({ y, ticks: 1 });
  }
  return out;
}

describe('физика по видео: параметры правил', () => {
  const rules = loadRoomPack().rules.params;

  it('темп 20 тактов/с; ходьба, подъём и падение — одним шагом в 3 такта (150 мс)', () => {
    expect(rules.tickRateHz).toBe(20);
    expect(rules.move).toEqual({ repeatDelayTicks: 3, repeatIntervalTicks: 3 });
    expect(rules.jump.stepTicks).toBe(3);
    expect(rules.fall.periodTicks).toBe(3);
    expect((rules.move.repeatIntervalTicks * 1000) / rules.tickRateHz).toBe(150);
  });

  it('прыжок поднимает на 3 клетки (таблица из трёх шагов); нижний край карты — земля', () => {
    expect(rules.jump.table).toEqual([-1, -1, -1]);
    expect(rules.bottomEdge).toBe('floor');
  });

  it('основной пакет и пакет по видео делят одну физику (различаются только id, версия и жизни)', () => {
    const clip = loadClipPack().rules.params;
    expect({ ...clip, lives: rules.lives }).toEqual(rules);
    expect(clip.lives).toBe(3);
  });
});

describe('физика по видео: движение', () => {
  it('ходьба при удержании — клетка каждые 3 такта с первого же такта (на видео 4,4 кадра на клетку ≈ 150 мс)', () => {
    const game = started();
    const xs: number[] = [];
    for (let i = 0; i < 13; i++) {
      game.step(makeFrame({ held: ['right'] }));
      xs.push(game.state.hero.x);
    }
    expect(xs).toEqual([2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6]);
    const frames = 3 * FRAMES_PER_TICK;
    expect(Math.abs(frames - 4.4)).toBeLessThan(0.5); // измерено по видео: 4–5 кадров на клетку
  });

  it('свободный прыжок: подъём по клетке за 3 такта, на вершине 5, спуск по клетке за 3 такта', () => {
    const game = started(); // герой на полу, y = 4
    const dwell = dwellTicks(game, 22, (i) => i === 0);
    expect(dwell).toEqual([
      { y: 3, ticks: 3 },
      { y: 2, ticks: 3 },
      { y: 1, ticks: 5 },
      { y: 2, ticks: 3 },
      { y: 3, ticks: 3 },
      { y: 4, ticks: 5 },
    ]);
    // В кадрах видео (измерено: подъём 4,7; вершина 6,7; спуск 5,0 кадра на клетку) — в пределах полутора кадра.
    expect(Math.abs((dwell[0]?.ticks ?? 0) * FRAMES_PER_TICK - 4.7)).toBeLessThan(1.5);
    expect(Math.abs((dwell[2]?.ticks ?? 0) * FRAMES_PER_TICK - 6.7)).toBeLessThan(1.5);
    expect(Math.abs((dwell[3]?.ticks ?? 0) * FRAMES_PER_TICK - 5.0)).toBeLessThan(1.5);
  });

  it('нижний край карты — земля: герой стоит в нижнем ряду и не погибает (bottomEdge: floor)', () => {
    const game = started(clipContext());
    expect(game.level.height - 1).toBe(game.state.hero.y);
    const events = run(game, idle(40));
    expect(events.some((e) => e.type === 'death')).toBe(false);
    expect(game.state.phase).toBe('playing');
    expect(game.state.hero.y).toBe(5);
  });

  it('при bottomEdge: pit тот же нижний ряд — провал (поведение по умолчанию сохранено)', () => {
    const raw = loadRawPack('clip');
    (raw.rules as { params: { bottomEdge?: string } }).params.bottomEdge = 'pit';
    const game = started(createContext(assemblePack(raw, validationEnv(undefined, GLYPH_NAMES))));
    run(game, idle(8));
    expect(game.state.deathCause).toBe('pit');
  });
});

describe('удар головой: событие bump и пробиваемый блок', () => {
  const events = (game: Game, ...segments: Segment[]): GameEvent[] => run(game, ...segments);
  const bumps = (list: GameEvent[]): GameEvent[] => list.filter((e) => e.type === 'bump');

  it('голова упёрлась в тайл платформы — одно событие bump с клеткой блока; на потолке карты события нет', () => {
    const game = started();
    run(game, { held: ['right'], ticks: 7 }); // под платформой (x = 4)
    const list = events(game, idle(1), { press: ['jump'], ticks: 12 });
    expect(bumps(list)).toHaveLength(1);
    expect(bumps(list)[0]).toMatchObject({ type: 'bump', x: 4, y: 3 });

    const raw = loadRawPack('room');
    (raw.rules as { params: { jump: { table: number[] } } }).params.jump.table = [-1, -1, -1, -1, -1];
    const tall = started(createContext(assemblePack(raw, validationEnv(undefined, GLYPH_NAMES))));
    const top = run(tall, { press: ['jump'], ticks: 50 });
    expect(tall.state.hero.y).toBe(4);
    expect(bumps(top)).toHaveLength(0); // выше карты блока нет — эффекта нет
  });

  it('крышка арки (brick, 3 удара): два удара блок держит, на третьем исчезает без очков', () => {
    const game = started(clipContext());
    const lid = (): { active: boolean; hp: number } => game.state.objects[0] as { active: boolean; hp: number };
    const hits: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const list = run(game, { press: ['jump'], ticks: 14 });
      expect(bumps(list)).toHaveLength(1);
      expect(bumps(list)[0]).toMatchObject({ x: 1, y: 3 });
      for (const e of list) if (e.type === 'hit') hits.push(e.destroyed);
      expect(game.state.hero.y).toBe(5); // вернулся в яму
      if (i < 2) expect(lid().active).toBe(true);
    }
    expect(hits).toEqual([false, false, true]);
    expect(lid().active).toBe(false);
    expect(game.state.score).toBe(0);
  });

  it('побег из ямы: после разрушения крышки прыжок на 3 клетки и шаг вправо — герой на верхушке правой стойки', () => {
    const game = started(clipContext());
    for (let i = 0; i < 3; i++) run(game, { press: ['jump'], ticks: 14 });
    run(game, { press: ['jump'], ticks: 7 }); // подъём: y = 4, 3, 2 на 0-м, 3-м и 6-м тактах
    expect(game.state.hero).toMatchObject({ x: 1, y: 2 });
    run(game, { held: ['right'], ticks: 1 });
    run(game, idle(12));
    expect(game.state.hero).toMatchObject({ x: 2, y: 2 }); // верх стойки (x = 2, y = 3) — опора
    run(game, { held: ['right'], ticks: 1 });
    run(game, idle(15));
    expect(game.state.hero.x).toBe(3);
    expect(game.state.hero.y).toBe(4); // сошёл вниз на пол
  });

  it('уровень по видео: яма под крышкой, старт в яме, пометки наблюдений на месте', () => {
    const level = loadClipPack().levels[0] as LevelDef;
    expect(level.id).toBe('clip-room');
    expect(level.start).toEqual({ x: 1, y: 5 });
    expect(level.hudLabel).toBe('1-09');
    expect(level.rows).toEqual(['.............', '.............', '.............', '#.#..........', '#.#..........', '#.###########']);
    expect(level.objects).toHaveLength(1);
    expect(level.objects[0]).toMatchObject({ type: 'brick', x: 1, y: 3, params: { hp: 3 } });
    expect(level.note).toMatch(/не правила оригинала/);
    expect(level.marks.map((m) => m.status).sort()).toEqual(['assumed', 'unknown']);
  });
});
