import { describe, expect, it } from 'vitest';
import { contextFor, corridor, fire, startedGame } from '../helpers/builders';
import { idle, run } from '../helpers/script';

const fireOnce = { press: ['fire'], held: ['fire'], ticks: 1 } as const;

describe('выстрел и снаряд', () => {
  it('снаряд появляется при выстреле, летит по cellsPerStep и исчезает по дальности', () => {
    const ctx = contextFor([{ rows: corridor(30), start: { x: 1, y: 1 } }]); // 2 клетки/такт, дальность 10
    const game = startedGame(ctx);
    const events = run(game, fireOnce);
    expect(events.filter((e) => e.type === 'shot')).toHaveLength(1);
    expect(game.state.projectiles.map((p) => p.x)).toEqual([3]);
    run(game, idle(3));
    expect(game.state.projectiles.map((p) => p.x)).toEqual([9]);
    run(game, idle(1));
    expect(game.state.projectiles).toHaveLength(0); // пролетел 10 клеток
  });

  it('попадание в мишень: снаряд удаляется, мишень разрушена, очки начислены, мишень перестаёт блокировать', () => {
    const ctx = contextFor([
      {
        rows: corridor(12),
        start: { x: 1, y: 1 },
        objects: [{ id: 'm', type: 'target', x: 6, y: 1, params: { hp: 1, score: 100 } }],
      },
    ]);
    const game = startedGame(ctx);
    run(game, { held: ['right'], ticks: 30 });
    expect(game.state.hero.x).toBe(5); // мишень твёрдая

    const events = run(game, fireOnce, idle(3));
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ type: 'hit', targetId: 'm', destroyed: true });
    expect(game.state.score).toBe(100);
    expect(game.state.projectiles).toHaveLength(0);
    expect(game.state.objects[0]?.active).toBe(false);

    run(game, { held: ['right'], ticks: 10 });
    expect(game.state.hero.x).toBeGreaterThan(6);
  });

  it('мишень с hp 2 выдерживает первое попадание', () => {
    const ctx = contextFor([
      {
        rows: corridor(12),
        start: { x: 1, y: 1 },
        objects: [{ id: 'm', type: 'target', x: 8, y: 1, params: { hp: 2, score: 50 } }],
      },
    ]);
    const game = startedGame(ctx);
    const first = run(game, fireOnce, idle(4));
    expect(first.find((e) => e.type === 'hit')).toMatchObject({ destroyed: false });
    expect(game.state.objects[0]?.active).toBe(true);
    run(game, idle(4));
    const second = run(game, fireOnce, idle(4));
    expect(second.find((e) => e.type === 'hit')).toMatchObject({ destroyed: true });
    expect(game.state.score).toBe(50);
  });

  it('снаряд останавливается о стену', () => {
    const ctx = contextFor([{ rows: ['..........', '..........', '....#.....', '##########'], start: { x: 1, y: 2 } }]);
    const game = startedGame(ctx);
    const events = run(game, fireOnce, idle(2));
    expect(events.find((e) => e.type === 'projectileBlocked')).toMatchObject({ x: 4, y: 2 });
    expect(game.state.projectiles).toHaveLength(0);
  });

  it('быстрый снаряд (8 клеток за такт) не пролетает сквозь тонкую стену', () => {
    const ctx = contextFor(
      [{ rows: ['..........', '..........', '....#.....', '##########'], start: { x: 1, y: 2 } }],
      (p) => {
        fire(p).projectile.cellsPerStep = 8;
      },
    );
    const game = startedGame(ctx);
    const events = run(game, fireOnce);
    expect(game.state.projectiles).toHaveLength(0);
    expect(events.some((e) => e.type === 'projectileBlocked')).toBe(true);
  });

  it('быстрый снаряд не пролетает сквозь мишень: попадание на пути, дальше не летит', () => {
    const ctx = contextFor(
      [
        {
          rows: corridor(20),
          start: { x: 1, y: 1 },
          objects: [
            { id: 'near', type: 'target', x: 4, y: 1 },
            { id: 'far', type: 'target', x: 9, y: 1 },
          ],
        },
      ],
      (p) => {
        fire(p).projectile.cellsPerStep = 12;
      },
    );
    const game = startedGame(ctx);
    const events = run(game, fireOnce);
    const hits = events.filter((e) => e.type === 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ targetId: 'near' });
    expect(game.state.objects[1]?.active).toBe(true);
  });

  it('стреляет в направлении взгляда', () => {
    const ctx = contextFor([{ rows: corridor(20), start: { x: 10, y: 1 } }]);
    const game = startedGame(ctx);
    run(game, { held: ['left'], press: ['left'] }, idle(1));
    run(game, fireOnce);
    expect(game.state.projectiles[0]?.dir).toBe(-1);
    expect(game.state.projectiles[0]?.x).toBeLessThan(game.state.hero.x);
  });

  it('удержание огня повторяет выстрелы с заданным интервалом', () => {
    const ctx = contextFor([{ rows: corridor(60), start: { x: 1, y: 1 } }], (p) => {
      fire(p).maxProjectiles = 16;
      fire(p).projectile.maxRangeCells = 100;
      fire(p).projectile.cellsPerStep = 1;
    });
    const game = startedGame(ctx);
    const events = run(game, { held: ['fire'], ticks: 13 });
    const ticks = events.filter((e) => e.type === 'shot').map((e) => e.tick);
    expect(ticks).toHaveLength(4);
    expect(ticks.slice(1).map((t, i) => t - (ticks[i] ?? 0))).toEqual([4, 4, 4]);
  });

  it('быстрые повторные нажатия внутри интервала не дают лишних выстрелов', () => {
    const ctx = contextFor([{ rows: corridor(60), start: { x: 1, y: 1 } }], (p) => {
      fire(p).holdRepeat = false;
      fire(p).maxProjectiles = 16;
    });
    const game = startedGame(ctx);
    const events = run(game, { press: ['fire'] }, { press: ['fire'] }, { press: ['fire'] });
    expect(events.filter((e) => e.type === 'shot')).toHaveLength(1);
  });

  it('лимит снарядов: пока снаряд в полёте, новый не создаётся', () => {
    const ctx = contextFor([{ rows: corridor(60), start: { x: 1, y: 1 } }], (p) => {
      fire(p).maxProjectiles = 1;
      fire(p).intervalTicks = 1;
      fire(p).projectile.cellsPerStep = 1;
      fire(p).projectile.maxRangeCells = 100;
    });
    const game = startedGame(ctx);
    const events = run(game, { held: ['fire'], ticks: 8 });
    expect(events.filter((e) => e.type === 'shot')).toHaveLength(1);
    expect(game.state.projectiles).toHaveLength(1);
  });

  it('патруль, сам зашедший в клетку снаряда, получает попадание (проверка стартовой клетки)', () => {
    // Снаряд идёт по 1 клетке. Патруль (x 2..4, шаг каждый такт) сначала уходит вправо,
    // разворачивается и на 3-м такте становится на клетку x=3, где уже стоит снаряд.
    const ctx = contextFor(
      [
        {
          rows: corridor(12),
          start: { x: 1, y: 1 },
          objects: [{ id: 'p', type: 'patroller', x: 3, y: 1, params: { range: 1, stepTicks: 1, hp: 1, score: 200 } }],
        },
      ],
      (p) => {
        fire(p).projectile.cellsPerStep = 1;
      },
    );
    const game = startedGame(ctx);
    const events = run(game, fireOnce, idle(2));
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ targetId: 'p', destroyed: true });
    expect(game.state.score).toBe(200);
    expect(game.state.projectiles).toHaveLength(0);
  });
});
