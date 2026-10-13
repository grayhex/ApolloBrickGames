import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../../src/app/stepper';
import { GameSession } from '../../src/app/session';
import { ACTIONS, Game, maskOf, actionBit, type Action, type GameEvent, type InputFrame } from '../../src/core';
import { ActionTracker } from '../../src/input/tracker';
import { contextFor, corridor } from '../helpers/builders';

interface Rig {
  game: Game;
  tracker: ActionTracker;
  session: GameSession;
  events: GameEvent[];
  menu: InputFrame[];
  resets: { count: number };
  /** Прокрутить время на ms кадрами по ~16 мс (≈60 FPS). */
  run(ms: number): void;
  hold(...actions: Action[]): void;
  now(): number;
}

function rig(rows = corridor(30, 4), start = { x: 0, y: 2 }): Rig {
  const ctx = contextFor([{ rows, start }]);
  const game = new Game(ctx);
  const tracker = new ActionTracker();
  const stepper = new FixedStepper(1000 / ctx.rules.params.tickRateHz);
  const events: GameEvent[] = [];
  const menu: InputFrame[] = [];
  const resets = { count: 0 };
  const session = new GameSession({
    game,
    tracker,
    stepper,
    onEvents: (e) => events.push(...e),
    onMenuInput: (frame) => menu.push(frame),
    resetDevices: () => void (resets.count += 1),
  });
  let time = 1000;
  session.frame(time); // первый кадр только запоминает время
  return {
    game,
    tracker,
    session,
    events,
    menu,
    resets,
    run: (ms) => {
      for (let t = 0; t < ms; t += 16) {
        time += 16;
        session.frame(time);
      }
    },
    hold: (...actions) => tracker.setSource('kb', maskOf(...actions)),
    now: () => time,
  };
}

describe('GameSession: контексты ввода', () => {
  it('Enter (start+confirm) запускает игру; confirm тоже работает как start вне фазы playing', () => {
    const a = rig();
    a.hold('start', 'confirm');
    a.run(100);
    expect(a.game.state.phase).toBe('playing');

    const b = rig();
    b.hold('confirm');
    b.run(100);
    expect(b.game.state.phase).toBe('playing');
  });

  it('в игре confirm и back не доходят до ядра: Space — только прыжок, а не «прыжок + команда оболочки»', () => {
    const r = rig(corridor(30, 5), { x: 2, y: 3 });
    r.hold('start');
    r.run(100);
    expect(r.game.state.phase).toBe('playing');
    r.hold('jump', 'confirm', 'back');
    r.run(120);
    expect(r.game.state.phase).toBe('playing'); // не поставилась пауза и не перезапустилась игра
    expect(r.game.state.hero.y).toBeLessThan(3); // а прыжок был
    for (const action of ['confirm', 'back'] as const) {
      expect(r.session.lastFrame.held & actionBit(action)).toBe(0);
    }
  });

  it('в контексте menu мир ввода не получает; меню получает «сырой» ввод', () => {
    const r = rig();
    r.hold('start');
    r.run(100);
    r.session.setContext('menu');
    r.hold('right', 'confirm');
    r.run(300);
    expect(r.game.state.hero.x).toBe(0);
    expect(r.menu.some((f) => (f.pressed & actionBit('confirm')) !== 0)).toBe(true);
    expect(r.menu.some((f) => (f.held & actionBit('right')) !== 0)).toBe(true);
  });

  it('смена контекста очищает ввод и устройства — удержанное не «протекает» в игру', () => {
    const r = rig();
    r.hold('start');
    r.run(100);
    r.hold('right');
    const before = r.resets.count;
    r.session.setContext('menu');
    expect(r.tracker.down).toBe(0);
    expect(r.resets.count).toBe(before + 1);
  });
});

describe('GameSession: пауза, скрытие вкладки, возврат', () => {
  function playing(): Rig {
    const r = rig(corridor(30, 4), { x: 0, y: 2 });
    r.hold('start');
    r.run(100);
    r.hold();
    r.run(50);
    expect(r.game.state.phase).toBe('playing');
    return r;
  }

  it('suspend (скрытие вкладки / потеря фокуса): пауза, сброс ввода и накопленного времени', () => {
    const r = playing();
    r.hold('right', 'jump');
    r.run(200);
    const worldTick = r.game.state.worldTick;
    const hero = { ...r.game.state.hero };
    r.session.suspend();
    expect(r.game.state.phase).toBe('paused');
    expect(r.tracker.down).toBe(0);
    expect(r.resets.count).toBeGreaterThan(0);

    // вкладка была скрыта 10 секунд; после возврата первый кадр тактов не даёт
    const returnAt = r.now() + 10_000;
    expect(r.session.frame(returnAt)).toBe(0);
    r.session.frame(returnAt + 16);
    r.session.frame(returnAt + 32);
    expect(r.game.state.worldTick).toBe(worldTick + 0); // мир не считался
    expect(r.game.state.hero).toEqual(hero); // героя не «подбросило»
  });

  it('продолжение только явное; на паузе опрос ввода работает', () => {
    const r = playing();
    r.session.suspend();
    r.run(500);
    expect(r.game.state.phase).toBe('paused');
    r.hold('pause'); // Esc/P/Start
    r.run(100);
    expect(r.game.state.phase).toBe('playing');
  });

  it('после продолжения нет скачка героя и отложенных выстрелов', () => {
    const r = playing();
    r.hold('right', 'fire');
    r.run(60);
    r.session.suspend();
    const hero = { ...r.game.state.hero };
    const shots = r.events.filter((e) => e.type === 'shot').length;
    r.run(1000); // на паузе ввода нет — клавиши были сброшены
    r.hold('pause');
    r.run(32);
    r.hold();
    r.run(200);
    expect(r.game.state.hero.x).toBe(hero.x);
    expect(r.events.filter((e) => e.type === 'shot').length).toBe(shots);
  });

  it('кнопка продолжения в интерфейсе (requestStart) и requestPause работают как start/pause', () => {
    const r = playing();
    r.session.requestPause();
    expect(r.game.state.phase).toBe('paused');
    r.session.requestStart();
    expect(r.game.state.phase).toBe('playing');
  });

  it('отладочный шаг: один такт мира на паузе, фаза остаётся paused', () => {
    const r = playing();
    r.session.requestPause();
    r.hold('right');
    r.session.stepWhilePaused();
    expect(r.game.state.phase).toBe('paused');
    expect(r.game.state.hero.x).toBe(1);
    r.hold('right', 'start', 'pause'); // start/pause в шаге игнорируются
    r.session.stepWhilePaused();
    expect(r.game.state.phase).toBe('paused');
  });

  it('suspend на паузе или в ready ничего не ломает', () => {
    const r = rig();
    r.session.suspend();
    expect(r.game.state.phase).toBe('ready');
    r.hold('start');
    r.run(100);
    expect(r.game.state.phase).toBe('playing');
  });

  it('restart: новая игра в ready, ввод и время очищены', () => {
    const r = playing();
    r.hold('right');
    r.run(200);
    r.session.restart();
    expect(r.game.state.phase).toBe('ready');
    expect(r.game.state.tick).toBe(0);
    expect(r.game.state.hero.x).toBe(0);
    expect(r.tracker.down).toBe(0);
  });

  it('длинный кадр отрисовки (подвисание) не даёт лавины тактов', () => {
    const r = playing();
    const worldBefore = r.game.state.worldTick;
    const ticks = r.session.frame(r.now() + 5000);
    expect(ticks).toBeLessThanOrEqual(5);
    expect(r.game.state.worldTick - worldBefore).toBeLessThanOrEqual(5);
  });

  it('все логические действия различимы в маске (проверка словаря)', () => {
    expect(new Set(ACTIONS.map((a) => actionBit(a))).size).toBe(ACTIONS.length);
  });
});
