import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/core';
import { formatRunTime, Speedrun } from '../../src/app/speedrun';

const done = (levelId: string, next: string | null): GameEvent => ({ type: 'levelCompleted', levelId, next, tick: 0 });

describe('спидран: время уровней и общее время', () => {
  const order = ['mario-1', 'mario-2', 'mario-3'];

  it('идущий уровень копит время, остальные ждут; общее время равно такту мира', () => {
    const run = new Speedrun(order);
    const view = run.view(100);
    expect(view.totalTicks).toBe(100);
    expect(view.rows.map((r) => r.state)).toEqual(['current', 'pending', 'pending']);
    expect(view.rows[0]?.ticks).toBe(100);
    expect(view.rows[1]?.ticks).toBeNull();
    expect(view).toMatchObject({ done: 0, count: 3, finished: false });
  });

  it('финиш уровня фиксирует его время; следующий считается с момента финиша', () => {
    const run = new Speedrun(order);
    run.view(10);
    run.onEvent(done('mario-1', 'mario-2'), 400);
    const view = run.view(520);
    expect(view.rows.map((r) => [r.state, r.ticks])).toEqual([
      ['done', 400],
      ['current', 120],
      ['pending', null],
    ]);
    expect(view).toMatchObject({ totalTicks: 520, done: 1, finished: false });
  });

  it('после последнего уровня время замораживается', () => {
    const run = new Speedrun(['a', 'b']);
    run.onEvent(done('a', 'b'), 200);
    run.onEvent(done('b', null), 500);
    const view = run.view(9999);
    expect(view).toMatchObject({ totalTicks: 500, done: 2, finished: true });
    expect(view.rows.map((r) => r.ticks)).toEqual([200, 300]);
  });

  it('гибель и возрождение (levelStarted того же уровня) отсчёт не сбрасывают', () => {
    const run = new Speedrun(order);
    run.view(50);
    run.onEvent({ type: 'levelStarted', levelId: 'mario-1', tick: 60 }, 60);
    const view = run.view(80);
    expect(view.rows[0]).toMatchObject({ state: 'current', ticks: 80 });
  });

  it('рестарт обнуляет забег; часы мира, пошедшие назад, — тоже (новая игра внутри ядра)', () => {
    const run = new Speedrun(order);
    run.onEvent(done('mario-1', 'mario-2'), 300);
    run.view(300);
    run.reset();
    expect(run.view(0)).toMatchObject({ done: 0, totalTicks: 0 });

    run.onEvent(done('mario-1', 'mario-2'), 300);
    expect(run.view(400).done).toBe(1);
    expect(run.view(5)).toMatchObject({ done: 0, totalTicks: 5 });
  });

  it('уровень вне списка (карта пользователя) добавляется строкой', () => {
    const run = new Speedrun(['custom-1'], 'custom-1');
    run.onEvent({ type: 'levelStarted', levelId: 'my-map', tick: 0 }, 0);
    const view = run.view(40);
    expect(view.rows.map((r) => r.levelId)).toEqual(['custom-1', 'my-map']);
  });

  it('формат времени: м:сс.д при 20 тактах в секунду', () => {
    expect(formatRunTime(0, 20)).toBe('0:00.0');
    expect(formatRunTime(30, 20)).toBe('0:01.5');
    expect(formatRunTime(20 * 83 + 7, 20)).toBe('1:23.3');
    expect(formatRunTime(20 * 3600, 20)).toBe('60:00.0');
  });
});
