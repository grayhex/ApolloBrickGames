import { describe, expect, it } from 'vitest';
import { Game, makeFrame, NEUTRAL_FRAME, timerUnits } from '../../src/core';
import { contextFor, corridor, startedGame } from '../helpers/builders';
import { enteredGame } from '../helpers/solver';
import { loadRoomPack, marioContext } from '../helpers/content';

/**
 * Таймер по видео геймплея: на HUD вместо подписи `TIME 397`, отсчёт от 400 по ≈ 0,77 с (15,4 такта) на единицу.
 * Область действия `level`: 400 — на один уровень: на новом уровне заново, гибель его не сбрасывает, пока герой не играет — он стоит;
 * когда время вышло — игра окончена.
 */

const pack = loadRoomPack();
const units = (game: Game): number | null => timerUnits(game.ctx.rules, game.state);
const tick = (game: Game, n: number): void => {
  for (let i = 0; i < n; i++) game.step(NEUTRAL_FRAME);
};

describe('таймер: единицы и вид', () => {
  it('до старта на HUD подпись (таймера нет), после старта — 400 и дальше по единице за 15,4 такта', () => {
    const game = new Game(marioContext(1));
    expect(units(game)).toBeNull();
    game.step(makeFrame({ pressed: ['start'] }));
    expect(game.state.gameStarted).toBe(true);
    expect(units(game)).toBe(400);
    tick(game, 15);
    expect(units(game)).toBe(400); // 15 тактов < 15,4: единица ещё не прошла
    tick(game, 1);
    expect(units(game)).toBe(399);
  });

  it('сверка с видео: к концу сценария выхода из колодца (≈ 53 такта, ≈ 2,65 с) на таймере 397, как на первом кадре с TIME в записи', () => {
    const { game, ticks } = enteredGame(pack, 'mario-1', false);
    expect(ticks).toBeGreaterThan(50);
    expect(ticks).toBeLessThan(57);
    expect(units(game)).toBe(397);
  });

  it('скорость отсчёта: за 60 единиц (≈ 46 с) уходит ровно 60 единиц', () => {
    const game = startedGame(marioContext(1));
    tick(game, Math.round(60 * 15.4)); // 924 такта
    expect(units(game)).toBe(340);
  });

  it('на паузе и в фазе гибели таймер стоит', () => {
    const game = startedGame(marioContext(1));
    tick(game, 100);
    const before = game.state.timerTicks;
    game.step(makeFrame({ pressed: ['pause'] }));
    tick(game, 50);
    expect(game.state.phase).toBe('paused');
    expect(game.state.timerTicks).toBe(before - 0); // тик на постановку паузы мир не считал
    game.step(makeFrame({ pressed: ['start'] }));
    tick(game, 20);
    expect(game.state.timerTicks).toBe(before - 20);
    game.die('pit');
    const atDeath = game.state.timerTicks;
    tick(game, 30);
    expect(game.state.phase).toBe('dead');
    expect(game.state.timerTicks).toBe(atDeath);
  });

  it('гибель и возрождение таймер не сбрасывают, на HUD остаётся TIME; новая игра начинает с 400 и с подписи', () => {
    const game = startedGame(marioContext(1));
    tick(game, 200);
    const left = game.state.timerTicks;
    game.die('pit');
    tick(game, game.ctx.rules.params.deathDelayTicks + 2);
    expect(game.state.phase).toBe('ready');
    expect(game.state.lives).toBe(3);
    expect(game.state.timerTicks).toBe(left); // не сброшен
    expect(units(game)).toBe(Math.ceil(left / 15.4)); // на экране по-прежнему время
    game.reset();
    expect(game.state.timerTicks).toBe(400 * 15.4);
    expect(units(game)).toBeNull();
  });

  it('переход на следующий уровень начинает таймер заново: 400 на один уровень, а не на всю игру', () => {
    const game = startedGame(marioContext(1));
    tick(game, 300);
    expect(game.state.timerTicks).toBeLessThan(400 * 15.4);
    (game as unknown as { completeLevel(id: string): void }).completeLevel('goal');
    expect(game.state.levelId).toBe('mario-2');
    expect(game.state.timerTicks).toBe(400 * 15.4);
    expect(units(game)).toBe(400);
    tick(game, 31);
    expect(units(game)).toBe(398);
  });

  it('вход в комнату колодца и возврат из неё таймер не сбрасывают: уровень тот же', () => {
    const game = startedGame(marioContext(3));
    tick(game, 200);
    const left = game.state.timerTicks;
    const well = game.level.def.objects.find((o) => o.type === 'sewer')!;
    game.state.hero.x = well.x;
    game.state.hero.y = 1;
    tick(game, 60);
    expect(game.state.levelId).toMatch(/^mario-3-/);
    expect(game.state.timerTicks).toBeLessThan(left);
    expect(game.state.timerTicks).toBeGreaterThan(left - 80);
  });
});

describe('таймер: время вышло', () => {
  it('таймер игры: конец времени — игра окончена сразу (все жизни потеряны), причина — time', () => {
    const game = startedGame(marioContext(1));
    game.state.timerTicks = 3;
    const events = [] as string[];
    for (let i = 0; i < 4; i++) for (const e of game.step(NEUTRAL_FRAME)) events.push(e.type === 'death' ? `death:${e.cause}` : e.type);
    expect(events).toContain('death:time');
    expect(game.state.phase).toBe('dead');
    expect(game.state.lives).toBe(0);
    for (let i = 0; i < game.ctx.rules.params.deathDelayTicks + 1; i++) game.step(NEUTRAL_FRAME);
    expect(game.state.phase).toBe('gameOver');
    expect(units(game)).toBe(0);
  });

  it('при 200 жизнях время всё равно кончает игру', () => {
    const game = startedGame(marioContext(1));
    game.state.lives = 200;
    game.state.timerTicks = 1;
    game.step(NEUTRAL_FRAME);
    expect(game.state.lives).toBe(0);
    expect(game.state.deathCause).toBe('time');
  });

  it('участковый таймер (по умолчанию): после гибели начинается заново — прежнее поведение демо', () => {
    const ctx = contextFor([{ rows: corridor(20, 4), start: { x: 0, y: 2 } }], (p) => {
      p.timerLimitTicks = 100;
    });
    const game = startedGame(ctx);
    tick(game, 40);
    expect(game.state.timerTicks).toBe(60);
    game.die('pit');
    tick(game, ctx.rules.params.deathDelayTicks + 2);
    expect(game.state.timerTicks).toBe(100); // сброшен: таймер участка
    expect(game.state.lives).toBe(2);
    expect(timerUnits(ctx.rules, game.state)).toBe(Math.ceil(100 / ctx.rules.params.tickRateHz));
  });

  it('без таймера в правилах (лимит 0) на HUD всегда подпись', () => {
    const ctx = contextFor([{ rows: corridor(20, 4), start: { x: 0, y: 2 } }], (p) => {
      p.timerLimitTicks = 0;
    });
    const game = startedGame(ctx);
    expect(timerUnits(ctx.rules, game.state)).toBeNull();
  });
});

describe('таймер: области действия', () => {
  const twoLevels = (scope: 'section' | 'level' | 'game') =>
    startedGame(
      contextFor(
        [
          {
            id: 'a',
            rows: corridor(20, 4),
            start: { x: 0, y: 2 },
            objects: [{ id: 'goal', type: 'finish', x: 19, y: 2, w: 1, h: 1, asset: 'tile.block', params: { score: 0 } }],
            transitions: [{ from: 'goal', to: 'b' }],
          },
          { id: 'b', rows: corridor(20, 4), start: { x: 0, y: 2 } },
        ],
        (p) => {
          p.timerLimitTicks = 100;
          p.timerScope = scope;
        },
      ),
    );

  it('level: гибель таймер не сбрасывает, новый уровень — сбрасывает, а когда время вышло, игра окончена', () => {
    const game = twoLevels('level');
    tick(game, 40);
    game.die('pit');
    tick(game, game.ctx.rules.params.deathDelayTicks + 2);
    expect(game.state.timerTicks).toBe(60); // после гибели не сброшен
    (game as unknown as { completeLevel(id: string): void }).completeLevel('goal');
    expect(game.state.levelId).toBe('b');
    expect(game.state.timerTicks).toBe(100); // новый уровень — заново
    game.step(makeFrame({ pressed: ['start'] })); // после гибели игра ждёт S./P.
    game.state.timerTicks = 1;
    game.step(NEUTRAL_FRAME);
    expect(game.state.lives).toBe(0);
    expect(game.state.deathCause).toBe('time');
  });

  it('game: ни гибель, ни новый уровень таймер не сбрасывают', () => {
    const game = twoLevels('game');
    tick(game, 40);
    (game as unknown as { completeLevel(id: string): void }).completeLevel('goal');
    expect(game.state.timerTicks).toBe(60);
  });

  it('section: новый уровень и гибель начинают заново (прежнее поведение), время вышло — потеря одной жизни', () => {
    const game = twoLevels('section');
    tick(game, 40);
    (game as unknown as { completeLevel(id: string): void }).completeLevel('goal');
    expect(game.state.timerTicks).toBe(100);
    game.state.timerTicks = 1;
    game.step(NEUTRAL_FRAME);
    expect(game.state.deathCause).toBe('time');
    expect(game.state.lives).toBe(game.ctx.rules.params.lives - 1);
  });
});
