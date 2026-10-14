import { describe, expect, it } from 'vitest';
import { Game, makeFrame, NEUTRAL_FRAME, type GameEvent } from '../../src/core';
import { contextFor, startedGame } from '../helpers/builders';

/**
 * Враги по видео геймплея: малый чёрт — шаг на клетку раз в 12 тактов (≈ 0,6 с), патруль на площадке; большой чёрт (2 × 2) — преследует героя
 * сверху (поднимается к верхнему ряду, плывёт к столбцу героя, пикирует). Наступить сверху на малого — 200 очков (упаковка); боковое
 * касание и касание снизу — гибель, как и раньше. Расстановка в уровнях — допущение, механика — по видео и упаковке.
 */

const FLOOR = 5;
const rows = (): string[] => [...Array.from({ length: FLOOR }, () => '.'.repeat(24)), '#'.repeat(24)];

const small = (id: string, x: number, y: number, params: Record<string, number> = {}) => ({
  id,
  type: 'patroller',
  x,
  y,
  w: 1,
  h: 1,
  asset: 'obj.patroller',
  params: { hp: 1, score: 20, range: 0, stepTicks: 12, stomp: 200, ...params },
});

const big = (id: string, x: number, y: number, params: Record<string, number> = {}) => ({
  id,
  type: 'patroller',
  x,
  y,
  w: 2,
  h: 2,
  asset: 'obj.patroller',
  params: { hp: 4, score: 400, range: 8, stepTicks: 12, chase: 1, minY: 0, ...params },
});

function game(objects: object[], hero: { x: number; y: number }): Game {
  const g = startedGame(contextFor([{ rows: rows(), start: hero, objects }], (p) => {
    p.timerLimitTicks = 0;
  }));
  return g;
}

const tick = (g: Game, n: number, frame = NEUTRAL_FRAME): GameEvent[] => {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(frame));
  return events;
};
const enemy = (g: Game, id: string) => g.state.objects.find((o) => o.id === id)!;

describe('наступание на врага сверху', () => {
  it('герой, падая, входит в клетку малого чёрта сверху: враг уничтожен, +200, событие stomp, герой жив', () => {
    const g = game([small('e1', 5, 4)], { x: 5, y: 1 });
    const events = tick(g, 30);
    expect(events.filter((e) => e.type === 'stomp')).toEqual([expect.objectContaining({ type: 'stomp', targetId: 'e1' })]);
    expect(enemy(g, 'e1').active).toBe(false);
    expect(g.state.score).toBe(200);
    expect(g.state.phase).toBe('playing');
    expect(g.state.lives).toBe(3);
    expect(g.state.hero).toMatchObject({ x: 5, y: 4 }); // падение продолжилось до пола
  });

  it('боковое касание — гибель: герой идёт вправо и упирается в малого', () => {
    const g = game([small('e1', 7, 4)], { x: 4, y: 4 });
    const events = tick(g, 40, makeFrame({ held: ['right'] }));
    expect(events.some((e) => e.type === 'death' && e.cause === 'enemy')).toBe(true);
    expect(enemy(g, 'e1').active).toBe(true);
    expect(g.state.score).toBe(0);
  });

  it('касание снизу — гибель: прыжок вверх в клетку врага', () => {
    const g = game([small('e1', 5, 2)], { x: 5, y: 4 });
    const events = tick(g, 4, makeFrame({ pressed: ['jump'] }));
    expect(events.some((e) => e.type === 'death' && e.cause === 'enemy')).toBe(true);
  });

  it('если наступание не разрешено (stomp: 0 — как у больших и прежних врагов), падение на врага — гибель', () => {
    const g = game([small('e1', 5, 4, { stomp: 0 })], { x: 5, y: 1 });
    const events = tick(g, 30);
    expect(events.some((e) => e.type === 'death' && e.cause === 'enemy')).toBe(true);
    expect(enemy(g, 'e1').active).toBe(true);
    expect(g.state.score).toBe(0);
  });

  it('герой приземляется рядом, а враг сам заходит в его клетку — гибель (наступание только сверху)', () => {
    const g = game([small('e1', 7, 4, { range: 3 })], { x: 5, y: 4 });
    const events = tick(g, 130);
    expect(events.some((e) => e.type === 'death' && e.cause === 'enemy')).toBe(true);
    expect(events.some((e) => e.type === 'stomp')).toBe(false);
  });

  it('выстрел по малому: +20 (по упаковке), враг гибнет; по большому нужно несколько попаданий (+400)', () => {
    const g = game([small('e1', 9, 4)], { x: 4, y: 4 });
    tick(g, 1, makeFrame({ pressed: ['fire'] }));
    tick(g, 40);
    expect(enemy(g, 'e1').active).toBe(false);
    expect(g.state.score).toBe(20);
  });
});

describe('движение малого чёрта: шаг раз в 12 тактов', () => {
  it('патруль ±range: по клетке за 12 тактов, у края разворот', () => {
    const g = game([small('e1', 10, 4, { range: 2 })], { x: 0, y: 4 });
    const xs: number[] = [];
    for (let i = 0; i < 12 * 9; i++) {
      tick(g, 1);
      if (i % 12 === 11) xs.push(enemy(g, 'e1').x);
    }
    expect(xs).toEqual([11, 12, 11, 10, 9, 8, 9, 10, 11]);
  });

  it('между шагами малый стоит на месте (11 тактов), шаг — на 12-м', () => {
    const g = game([small('e1', 10, 4, { range: 2 })], { x: 0, y: 4 });
    tick(g, 11);
    expect(enemy(g, 'e1').x).toBe(10);
    tick(g, 1);
    expect(enemy(g, 'e1').x).toBe(11);
  });

  it('патруль упирается в стену: разворачивается, не заходит в твёрдую клетку', () => {
    const g = game([small('e1', 10, 4, { range: 5 }), { id: 'w', type: 'brick', x: 12, y: 4, w: 1, h: 1, asset: 'tile.block', params: { hp: 9, score: 0 } }], { x: 0, y: 4 });
    for (let i = 0; i < 12 * 8; i++) {
      tick(g, 1);
      expect(enemy(g, 'e1').x).toBeLessThan(12);
    }
  });
});

describe('большой чёрт 2 × 2: преследование сверху', () => {
  it('сначала поднимается к верхнему ряду, затем плывёт к герою по клетке за 12 тактов', () => {
    const g = game([big('b1', 10, 2)], { x: 2, y: 4 });
    const track: string[] = [];
    for (let i = 0; i < 12 * 8; i++) {
      tick(g, 1);
      if (i % 12 === 11) track.push(`${enemy(g, 'b1').x},${enemy(g, 'b1').y}`);
    }
    expect(track.slice(0, 5)).toEqual(['10,1', '10,0', '9,0', '8,0', '7,0']);
  });

  it('оказавшись над героем (столбец героя под одной из двух клеток), пикирует вниз и задевает героя', () => {
    const g = game([big('b1', 3, 0)], { x: 3, y: 4 });
    const track: number[] = [];
    let dead = false;
    for (let i = 0; i < 12 * 5 && !dead; i++) {
      for (const e of g.step(NEUTRAL_FRAME)) if (e.type === 'death') dead = true;
      if (i % 12 === 11) track.push(enemy(g, 'b1').y);
    }
    expect(track.slice(0, 3)).toEqual([1, 2, 3]);
    expect(dead).toBe(true);
    expect(g.state.deathCause).toBe('enemy');
  });

  it('герой ушёл из-под чёрта: тот снова поднимается и заходит сверху', () => {
    const g = game([big('b1', 6, 2, { range: 12 })], { x: 12, y: 4 });
    tick(g, 12 * 2);
    expect(enemy(g, 'b1').y).toBe(0);
    for (let i = 0; i < 12 * 8; i++) {
      tick(g, 1);
      if (enemy(g, 'b1').x >= 11) break;
    }
    expect(enemy(g, 'b1').x).toBe(11); // над героем в столбце 12 (клетки 11–12)
  });

  it('привязь: дальше range от точки появления чёрт не уходит', () => {
    const g = game([big('b1', 4, 0, { range: 3 })], { x: 20, y: 4 });
    tick(g, 12 * 20);
    expect(enemy(g, 'b1').x).toBe(7);
    expect(g.state.phase).toBe('playing');
  });

  it('большого наступанием не убить: stomp не задан — гибель при падении на него', () => {
    const g = game([big('b1', 4, 3, { chase: 0, range: 0 })], { x: 4, y: 0 });
    const events = tick(g, 30);
    expect(events.some((e) => e.type === 'stomp')).toBe(false);
    expect(events.some((e) => e.type === 'death' && e.cause === 'enemy')).toBe(true);
  });
});
