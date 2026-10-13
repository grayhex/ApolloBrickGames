import { describe, expect, it } from 'vitest';
import { makeFrame } from '../../src/core';
import { contextFor, startedGame } from '../helpers/builders';
import { idle, run } from '../helpers/script';

const tall = ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '#####'];

describe('прыжок и приземление', () => {
  it('траектория идёт по таблице: подъём на 3 клетки, пауза, падение, посадка', () => {
    const ctx = contextFor([{ rows: tall, start: { x: 2, y: 6 } }]); // table [-1,-1,-1,0,0], stepTicks 2, fall 2
    const game = startedGame(ctx);
    const ys: number[] = [];
    const events = [];
    events.push(...run(game, { press: ['jump'], ticks: 1 }));
    ys.push(game.state.hero.y);
    for (let i = 0; i < 20; i++) {
      events.push(...run(game, idle(1)));
      ys.push(game.state.hero.y);
    }
    // такты: подъём на тактах 1, 3, 5; зависание до 10; падение по клетке каждые 2 такта
    expect(ys.slice(0, 6)).toEqual([5, 5, 4, 4, 3, 3]);
    expect(Math.min(...ys)).toBe(3);
    expect(ys[15]).toBe(6); // такт 16 — снова на полу
    expect(events.filter((e) => e.type === 'jump')).toHaveLength(1);
    const land = events.filter((e) => e.type === 'land');
    expect(land).toHaveLength(1);
    expect(land[0]?.tick).toBe(18);
  });

  it('в воздухе повторный прыжок не запускается', () => {
    const ctx = contextFor([{ rows: tall, start: { x: 2, y: 6 } }]);
    const game = startedGame(ctx);
    const ys: number[] = [];
    run(game, { press: ['jump'] });
    for (let i = 0; i < 6; i++) {
      run(game, { press: ['jump'] }); // жмём прыжок на каждом такте
      ys.push(game.state.hero.y);
    }
    expect(Math.min(...ys)).toBe(3);
  });

  it('удержание кнопки без нового нажатия не даёт прыжок (нужен фронт pressed)', () => {
    const ctx = contextFor([{ rows: tall, start: { x: 2, y: 6 } }]);
    const game = startedGame(ctx);
    game.step({ pressed: 0, held: makeFrame({ held: ['jump'] }).held, released: 0 });
    expect(game.state.hero.y).toBe(6);
    expect(game.state.hero.airborne).toBe(false);
  });

  it('сойдя с края, герой падает, а не прыгает', () => {
    const ctx = contextFor([{ rows: ['.....', '.....', '##...', '#####'], start: { x: 1, y: 1 } }]);
    const game = startedGame(ctx);
    const events = run(game, { held: ['right'], ticks: 12 });
    expect(game.state.hero.x).toBeGreaterThanOrEqual(2);
    expect(game.state.hero.y).toBe(2);
    expect(events.some((e) => e.type === 'jump')).toBe(false);
    expect(events.some((e) => e.type === 'land')).toBe(true);
  });

  it('связь up → прыжок задаётся данными профиля правил', () => {
    const withoutUp = contextFor([{ rows: tall, start: { x: 2, y: 6 } }]);
    const gameA = startedGame(withoutUp);
    run(gameA, { press: ['up'], held: ['up'], ticks: 3 });
    expect(gameA.state.hero.y).toBe(6);

    const withUp = contextFor([{ rows: tall, start: { x: 2, y: 6 } }], (p) => {
      p.jump.triggers = ['jump', 'up'];
    });
    const gameB = startedGame(withUp);
    run(gameB, { press: ['up'], held: ['up'], ticks: 3 });
    expect(gameB.state.hero.y).toBeLessThan(6);
  });

  it('другая таблица прыжка меняет траекторию без правок кода', () => {
    const ctx = contextFor([{ rows: tall, start: { x: 2, y: 6 } }], (p) => {
      p.jump.table = [-1, -1, 0, 1];
      p.jump.stepTicks = 1;
    });
    const game = startedGame(ctx);
    const ys: number[] = [];
    run(game, { press: ['jump'] });
    ys.push(game.state.hero.y);
    for (let i = 0; i < 5; i++) {
      run(game, idle(1));
      ys.push(game.state.hero.y);
    }
    // такты 1–4: -1, -1, 0, +1; затем падение с периодом 2 (такт 6: ещё одна клетка)
    expect(ys).toEqual([5, 4, 4, 5, 5, 6]);
  });

  it('прыжок вправо и приземление на уступ', () => {
    const rows = ['.......', '.......', '.......', '.......', '...##..', '#######'];
    const ctx = contextFor([{ rows, start: { x: 1, y: 4 } }]);
    const game = startedGame(ctx);
    run(game, { press: ['jump'], held: ['right'] }, { held: ['right'], ticks: 18 });
    expect(game.state.hero.y).toBeLessThanOrEqual(4);
    expect(game.state.hero.airborne).toBe(false);
  });
});

describe('прыжок с края', () => {
  it('прыжок в тот же такт, когда герой шагает с уступа, — это прыжок, а не падение', () => {
    // Герой на краю пола (x=1); следующая клетка (x=2) — пропасть. Шаг вправо и прыжок на одном такте.
    const rows = ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '##...'];
    const ctx = contextFor([{ rows, start: { x: 1, y: 6 } }]);
    const game = startedGame(ctx);
    const events = run(game, { press: ['jump', 'right'], held: ['right'], ticks: 1 });
    expect(events.some((e) => e.type === 'jump')).toBe(true);
    expect(game.state.hero).toMatchObject({ x: 2, y: 5 });
  });
});
