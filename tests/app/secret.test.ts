import { describe, expect, it } from 'vitest';
import { EntryScript } from '../../src/app/entry';
import { GameSession } from '../../src/app/session';
import { FixedStepper } from '../../src/app/stepper';
import { Game, maskOf, type Action, type GameEvent } from '../../src/core';
import { ActionTracker } from '../../src/input/tracker';
import { loadRoomPack, marioContext } from '../helpers/content';

/**
 * Секрет «200 жизней»: аккорд LEFT + DOWN должен дойти до ядра и тогда, когда ввод игрока подменён сценарием входа
 * (герой сам выпрыгивает из колодца), и не мешать этому сценарию.
 */

function rig() {
  const pack = loadRoomPack();
  const ctx = marioContext(1);
  const game = new Game(ctx);
  const entry = new EntryScript(pack.animations?.entry);
  entry.arm(game.state.levelId);
  const tracker = new ActionTracker();
  const events: GameEvent[] = [];
  const session = new GameSession({
    game,
    tracker,
    stepper: new FixedStepper(1000 / ctx.rules.params.tickRateHz),
    entry,
    onEvents: (e) => {
      events.push(...e);
      for (const event of e) entry.onEvent(event);
    },
    resetDevices: () => undefined,
  });
  let time = 1000;
  session.frame(time);
  return {
    game,
    entry,
    events,
    hold: (...actions: Action[]) => tracker.setSource('kb', maskOf(...actions)),
    run: (ms: number) => {
      for (let t = 0; t < ms; t += 16) {
        time += 16;
        session.frame(time);
      }
    },
  };
}

const secrets = (events: readonly GameEvent[]) => events.filter((e) => e.type === 'secretLives');

describe('секрет «200 жизней» в оболочке', () => {
  it('до старта: LEFT + DOWN вместе — 200 жизней (по одной клавише — нет)', () => {
    const a = rig();
    a.hold('left');
    a.run(200);
    a.hold('down');
    a.run(200);
    expect(a.game.state.lives).toBe(4);
    a.hold('left', 'down');
    a.run(100);
    expect(a.game.state.lives).toBe(200);
    expect(secrets(a.events)).toHaveLength(1);
  });

  it('во время сценария входа (удары головой о крышку колодца): аккорд доходит до ядра, сценарий не нарушен', () => {
    const a = rig();
    a.hold('start');
    a.run(100);
    a.hold();
    a.run(400); // идёт сценарий: герой бьётся головой о крышку
    expect(a.entry.active).toBe(true);
    expect(a.game.state.hero.x).toBe(1); // ещё в колодце
    expect(a.game.state.lives).toBe(4);

    a.hold('left', 'down');
    a.run(300);
    expect(a.game.state.lives).toBe(200);
    a.hold();
    a.run(3000); // сценарий доигран
    expect(a.entry.active).toBe(false);
    expect(a.game.state.hero).toMatchObject({ x: 2, y: 2 }); // LEFT не помешал выпрыгнуть и встать на правую стойку
    expect(a.game.state.phase).toBe('playing');
    expect(secrets(a.events)).toHaveLength(1);
  });

  it('аккорд, удерживаемый всё время сценария, тоже не ломает выход героя', () => {
    const a = rig();
    a.hold('left', 'down', 'start');
    a.run(100);
    a.hold('left', 'down');
    a.run(4000);
    expect(a.game.state.lives).toBe(200);
    expect(a.entry.active).toBe(false);
    expect(a.game.state.hero.x).toBeLessThanOrEqual(2); // героя не унесло вправо; сценарий довёл его до стойки (дальше LEFT двигает героя сам)
  });

  it('после выхода из колодца аккорд ничего не даёт', () => {
    const a = rig();
    a.hold('start');
    a.run(100);
    a.hold();
    a.run(4000); // сценарий доигран, герой на стойке (2, 2)
    expect(a.entry.active).toBe(false);
    expect(a.game.state.inWell).toBe(false);
    a.hold('left', 'down');
    a.run(300);
    expect(a.game.state.lives).toBe(4);
    expect(secrets(a.events)).toHaveLength(0);
  });
});
