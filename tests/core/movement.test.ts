import { describe, expect, it } from 'vitest';
import { contextFor, corridor, startedGame } from '../helpers/builders';
import { idle, run } from '../helpers/script';

describe('движение и столкновения', () => {
  it('падает на пол и останавливается; событие land приходит один раз', () => {
    const ctx = contextFor([{ rows: ['.....', '.....', '.....', '.....', '#####'], start: { x: 2, y: 0 } }]);
    const game = startedGame(ctx);
    const events = run(game, idle(20));
    expect(game.state.hero.y).toBe(3);
    expect(game.state.hero.airborne).toBe(false);
    expect(events.filter((e) => e.type === 'land')).toHaveLength(1);
  });

  it('падение идёт с заданным периодом, а не быстрее', () => {
    const ctx = contextFor([{ rows: ['...', '...', '...', '...', '###'], start: { x: 1, y: 0 } }], (p) => {
      p.fall.periodTicks = 3;
    });
    const game = startedGame(ctx);
    const ys: number[] = [];
    for (let i = 0; i < 6; i++) {
      run(game, idle(1));
      ys.push(game.state.hero.y);
    }
    expect(ys).toEqual([0, 0, 1, 1, 1, 2]);
  });

  it('стена справа и слева не пускает героя (направление взгляда всё равно меняется)', () => {
    const ctx = contextFor([{ rows: ['.....', '#...#', '#####'].map((r) => r), start: { x: 2, y: 1 } }]);
    const game = startedGame(ctx);
    run(game, { held: ['right'], ticks: 30 });
    expect(game.state.hero.x).toBe(3);
    expect(game.state.hero.facing).toBe(1);
    run(game, idle(1), { held: ['left'], ticks: 40 });
    expect(game.state.hero.x).toBe(1);
    expect(game.state.hero.facing).toBe(-1);
  });

  it('внутренний блок на пути останавливает героя', () => {
    const ctx = contextFor([{ rows: ['.......', '...#...', '#######'], start: { x: 0, y: 1 } }]);
    // y=1 — это уровень блока: герой упрётся в клетку x=3.
    const game = startedGame(ctx);
    run(game, { held: ['right'], ticks: 40 });
    expect(game.state.hero.x).toBe(2);
  });

  it('границы карты — стены слева, справа и сверху', () => {
    const ctx = contextFor([{ rows: corridor(4, 3), start: { x: 0, y: 1 } }]);
    const game = startedGame(ctx);
    run(game, { held: ['left'], ticks: 10 });
    expect(game.state.hero.x).toBe(0);
    run(game, idle(1), { held: ['right'], ticks: 60 });
    expect(game.state.hero.x).toBe(3);
  });

  it('потолок обрывает прыжок: выше потолка герой не поднимается', () => {
    const ctx = contextFor([{ rows: ['#####', '.....', '.....', '#####'], start: { x: 2, y: 2 } }]);
    const game = startedGame(ctx);
    const ys: number[] = [];
    run(game, { press: ['jump'], held: ['jump'], ticks: 1 });
    ys.push(game.state.hero.y);
    for (let i = 0; i < 30; i++) {
      run(game, idle(1));
      ys.push(game.state.hero.y);
    }
    expect(Math.min(...ys)).toBe(1); // y=0 — потолок
    expect(game.state.hero.y).toBe(2); // вернулся на пол
  });

  it('повтор шага при удержании задаётся правилами: первый шаг сразу, затем задержка и интервал', () => {
    const ctx = contextFor([{ rows: corridor(30), start: { x: 0, y: 1 } }]); // delay 4, interval 3
    const game = startedGame(ctx);
    const xs: number[] = [];
    for (let i = 0; i < 12; i++) {
      run(game, { held: ['right'] });
      xs.push(game.state.hero.x);
    }
    // такты удержания 0..11: шаг на 0, затем на 4, 7, 10
    expect(xs).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]);
  });

  it('короткий тап (один такт) даёт ровно один шаг', () => {
    const ctx = contextFor([{ rows: corridor(10), start: { x: 0, y: 1 } }]);
    const game = startedGame(ctx);
    run(game, { press: ['right'], held: ['right'], ticks: 1 }, idle(20));
    expect(game.state.hero.x).toBe(1);
  });

  it('одновременные left и right взаимно гасятся', () => {
    const ctx = contextFor([{ rows: corridor(10), start: { x: 5, y: 1 } }]);
    const game = startedGame(ctx);
    run(game, { held: ['left', 'right'], ticks: 20 });
    expect(game.state.hero.x).toBe(5);
  });
});
