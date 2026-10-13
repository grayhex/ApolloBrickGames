import { describe, expect, it } from 'vitest';
import { Game, makeFrame, NEUTRAL_FRAME } from '../../src/core';
import { contextFor, corridor, startedGame } from '../helpers/builders';
import { idle, run } from '../helpers/script';

const fast = (p: { deathDelayTicks: number }): void => {
  p.deathDelayTicks = 2;
};

describe('фазы игры', () => {
  it('ready: ввод мира игнорируется до start', () => {
    const ctx = contextFor([{ rows: corridor(10), start: { x: 0, y: 1 } }]);
    const game = new Game(ctx);
    expect(game.state.phase).toBe('ready');
    run(game, { held: ['right', 'jump', 'fire'], press: ['right', 'jump', 'fire'], ticks: 5 });
    expect(game.state.hero.x).toBe(0);
    expect(game.state.projectiles).toHaveLength(0);
    expect(game.state.worldTick).toBe(0);
  });

  it('start переводит ready → playing, и ровно одним переходом', () => {
    const ctx = contextFor([{ rows: corridor(10), start: { x: 0, y: 1 } }]);
    const game = new Game(ctx);
    const events = run(game, { press: ['start', 'pause'] });
    expect(game.state.phase).toBe('playing');
    expect(events.filter((e) => e.type === 'phaseChanged')).toEqual([
      { type: 'phaseChanged', from: 'ready', to: 'playing', tick: 1 },
    ]);
  });

  it('pause замораживает мир: тики идут, worldTick, герой, таймер и перезарядка — нет', () => {
    const ctx = contextFor([{ rows: corridor(20), start: { x: 0, y: 1 } }]);
    const game = startedGame(ctx);
    run(game, { held: ['right'], press: ['right'], ticks: 3 }, { press: ['fire'], held: ['fire'] });
    const before = JSON.stringify({ ...game.state, tick: 0 });
    run(game, { press: ['pause'] });
    expect(game.state.phase).toBe('paused');
    const frozen = JSON.stringify({ ...game.state, tick: 0, phase: 'playing' });
    expect(frozen).toBe(before);
    const tickBefore = game.state.tick;
    run(game, { held: ['right', 'fire', 'jump'], ticks: 50 });
    expect(game.state.tick).toBe(tickBefore + 50);
    expect(JSON.stringify({ ...game.state, tick: 0, phase: 'playing' })).toBe(before);
  });

  it('продолжение: и pause, и start возвращают в playing; ввод в паузе опрашивается', () => {
    const ctx = contextFor([{ rows: corridor(10), start: { x: 0, y: 1 } }]);
    const a = startedGame(ctx);
    run(a, { press: ['pause'] }, { press: ['pause'] });
    expect(a.state.phase).toBe('playing');
    const b = startedGame(ctx);
    run(b, { press: ['pause'] }, { press: ['start'] });
    expect(b.state.phase).toBe('playing');
  });

  it('после продолжения нет «отложенных» действий: удержанные кнопки не дают шаг/прыжок/выстрел сразу', () => {
    const ctx = contextFor([{ rows: ['.....', '.....', '.....', '#####'], start: { x: 2, y: 2 } }]);
    const game = startedGame(ctx);
    run(game, { press: ['pause'] });
    // игрок держит jump и fire, затем нажимает pause: на этом такте pressed только у pause
    run(game, { held: ['jump', 'fire'], ticks: 5 });
    run(game, { held: ['jump'], press: ['pause'] });
    expect(game.state.phase).toBe('playing');
    run(game, { held: ['jump'], ticks: 3 });
    expect(game.state.hero.y).toBe(2);
    expect(game.state.projectiles).toHaveLength(0);
  });

  it('шаг в паузе считает ровно один такт мира и остаётся в paused', () => {
    const ctx = contextFor([{ rows: corridor(10), start: { x: 0, y: 1 } }]);
    const game = startedGame(ctx);
    run(game, { press: ['pause'] });
    const world = game.state.worldTick;
    game.step(makeFrame({ held: ['right'], pressed: ['right'] }), { simulateWhilePaused: true });
    expect(game.state.phase).toBe('paused');
    expect(game.state.worldTick).toBe(world + 1);
    expect(game.state.hero.x).toBe(1);
  });

  it('dead: ввод игнорируется, пауза недоступна', () => {
    const ctx = contextFor(
      [{ rows: corridor(6), start: { x: 0, y: 1 }, objects: [{ id: 'h', type: 'hazard', x: 1, y: 1 }] }],
      (p) => {
        p.deathDelayTicks = 30;
      },
    );
    const game = startedGame(ctx);
    run(game, { held: ['right'], press: ['right'] });
    expect(game.state.phase).toBe('dead');
    run(game, { press: ['pause', 'start'], ticks: 3 });
    expect(game.state.phase).toBe('dead');
  });
});

describe('смерть, жизни и перезапуск', () => {
  const hazardLevel = {
    rows: corridor(8),
    start: { x: 0, y: 1 },
    objects: [{ id: 'h', type: 'hazard', x: 3, y: 1 }],
  };

  it('опасная область убивает; жизнь списывается; после паузы смерти участок перезапускается в ready', () => {
    const ctx = contextFor([hazardLevel], fast);
    const game = startedGame(ctx);
    const events = run(game, { held: ['right'], ticks: 20 });
    expect(events.find((e) => e.type === 'death')).toMatchObject({ cause: 'hazard' });
    expect(game.state.lives).toBe(2);
    expect(game.state.phase).toBe('ready');
    expect(game.state.hero.x).toBe(0);
    expect(game.state.deathCause).toBe('hazard');
  });

  it('при перезапуске участка объекты возвращаются, а счёт и жизни сохраняются', () => {
    const ctx = contextFor(
      [
        {
          rows: corridor(12),
          start: { x: 5, y: 1 },
          objects: [
            { id: 'h', type: 'hazard', x: 0, y: 1 },
            { id: 't', type: 'target', x: 9, y: 1, params: { hp: 1, score: 100 } },
          ],
        },
      ],
      fast,
    );
    const game = startedGame(ctx);
    run(game, { press: ['fire'], held: ['fire'] }, idle(5));
    expect(game.state.score).toBe(100);
    expect(game.state.objects[1]?.active).toBe(false);
    run(game, { held: ['left'], ticks: 30 });
    expect(game.state.phase).toBe('ready');
    expect(game.state.objects[1]?.active).toBe(true);
    expect(game.state.score).toBe(100);
    expect(game.state.lives).toBe(2);
  });

  it('падение за нижнюю границу — смерть «pit»', () => {
    const ctx = contextFor([{ rows: ['...', '...', '#.#'], start: { x: 1, y: 1 } }], fast);
    const game = startedGame(ctx);
    const events = run(game, idle(12));
    expect(events.find((e) => e.type === 'death')).toMatchObject({ cause: 'pit' });
  });

  it('контакт с патрулём — смерть «enemy»', () => {
    const ctx = contextFor(
      [
        {
          rows: corridor(10),
          start: { x: 3, y: 1 },
          objects: [{ id: 'p', type: 'patroller', x: 6, y: 1, params: { range: 3, stepTicks: 1 } }],
        },
      ],
      fast,
    );
    const game = startedGame(ctx);
    const events = run(game, idle(10));
    expect(events.find((e) => e.type === 'death')).toMatchObject({ cause: 'enemy' });
  });

  it('таймер: по истечении — смерть «time»', () => {
    const ctx = contextFor([{ rows: corridor(10), start: { x: 0, y: 1 } }], (p) => {
      p.timerLimitTicks = 5;
      p.deathDelayTicks = 2;
    });
    const game = startedGame(ctx);
    const events = run(game, idle(4));
    expect(events.some((e) => e.type === 'death')).toBe(false);
    const last = run(game, idle(1));
    expect(last.find((e) => e.type === 'death')).toMatchObject({ cause: 'time' });
  });

  it('жизни кончились → gameOver; start начинает новую игру со сброшенными счётом и жизнями', () => {
    const ctx = contextFor([hazardLevel], (p) => {
      p.lives = 1;
      p.deathDelayTicks = 1;
    });
    const game = startedGame(ctx);
    const events = run(game, { held: ['right'], ticks: 20 });
    expect(game.state.phase).toBe('gameOver');
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
    run(game, { press: ['pause'] });
    expect(game.state.phase).toBe('gameOver');
    run(game, { press: ['start'] });
    expect(game.state.phase).toBe('playing');
    expect(game.state.lives).toBe(1);
    expect(game.state.score).toBe(0);
    expect(game.state.hero.x).toBe(0);
  });

  it('reset() создаёт новую игру в ready с тем же seed', () => {
    const ctx = contextFor([hazardLevel]);
    const game = startedGame(ctx, 42);
    run(game, { held: ['right'], ticks: 5 });
    game.reset();
    expect(game.state.phase).toBe('ready');
    expect(game.state.seed).toBe(42);
    expect(game.state.tick).toBe(0);
    expect(game.state.hero.x).toBe(0);
    game.step(NEUTRAL_FRAME);
    expect(game.state.tick).toBe(1);
  });
});

describe('финиш и переход на другой участок', () => {
  const first = {
    id: 'a',
    rows: corridor(6),
    start: { x: 0, y: 1 },
    objects: [{ id: 'fa', type: 'finish', x: 2, y: 1, params: { score: 500 } }],
    transitions: [{ from: 'fa', to: 'b' }],
  };
  const second = {
    id: 'b',
    rows: corridor(8),
    start: { x: 1, y: 1 },
    objects: [
      { id: 'fb', type: 'finish', x: 4, y: 1, params: { score: 1000 } },
      { id: 'hb', type: 'hazard', x: 7, y: 1 },
    ],
    transitions: [{ from: 'fb', to: null }],
  };

  it('финиш загружает следующий участок, не сбрасывая счёт и жизни, фаза остаётся playing', () => {
    const ctx = contextFor([first, second]);
    const game = startedGame(ctx);
    const events = run(game, { held: ['right'], ticks: 5 }); // шаги на тактах удержания 0 и 4 → финиш
    expect(events.find((e) => e.type === 'levelCompleted')).toMatchObject({ levelId: 'a', next: 'b' });
    expect(events.find((e) => e.type === 'levelStarted')).toMatchObject({ levelId: 'b' });
    expect(game.state.levelId).toBe('b');
    expect(game.state.phase).toBe('playing');
    expect(game.state.score).toBe(500);
    expect(game.state.hero).toMatchObject({ x: 1, y: 1 });
    expect(game.state.objects.map((o) => o.id)).toEqual(['fb', 'hb']);
  });

  it('последний финиш (to: null) завершает игру: фаза completed', () => {
    const ctx = contextFor([first, second]);
    const game = startedGame(ctx);
    const events = run(game, { held: ['right'], ticks: 40 });
    expect(game.state.phase).toBe('completed');
    expect(game.state.score).toBe(1500);
    expect(events.some((e) => e.type === 'gameCompleted')).toBe(true);
    run(game, { press: ['start'] });
    expect(game.state.phase).toBe('playing');
    expect(game.state.levelId).toBe('a');
  });

  it('смерть на втором участке перезапускает именно второй участок', () => {
    const hazardous = { ...second, objects: [{ id: 'hb', type: 'hazard', x: 3, y: 1 }], transitions: [] };
    const ctx = contextFor([first, hazardous], (p) => {
      p.deathDelayTicks = 1;
    });
    const game = startedGame(ctx);
    run(game, { held: ['right'], ticks: 5 });
    expect(game.state.levelId).toBe('b');
    run(game, idle(1), { held: ['right'], ticks: 12 });
    expect(game.state.phase).toBe('ready');
    expect(game.state.levelId).toBe('b');
    expect(game.state.hero).toMatchObject({ x: 1, y: 1 });
    expect(game.state.lives).toBe(2);
    expect(game.state.score).toBe(500);
  });
});
