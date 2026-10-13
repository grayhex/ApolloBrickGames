import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../../src/app/stepper';
import { GameSession } from '../../src/app/session';
import { InputHub } from '../../src/app/hub';
import { actionBit, Game, type GameEvent } from '../../src/core';
import type { GamepadLike, GamepadStatus, PadInfo } from '../../src/input/gamepad';
import type { StorageLike } from '../../src/input/settings';
import { contextFor, corridor } from '../helpers/builders';
import { FakePad } from '../helpers/fakePad';

interface Rig {
  hub: InputHub;
  game: Game;
  session: GameSession;
  pads: (GamepadLike | null)[];
  win: EventTarget;
  disconnects: PadInfo[];
  statuses: GamepadStatus[];
  events: GameEvent[];
  keyActive: { value: boolean };
  /** Один кадр отрисовки: опрос устройств, затем такты. */
  frame(): void;
  key(type: 'keydown' | 'keyup', code: string): void;
}

function rig(storage: StorageLike | null = null): Rig {
  const ctx = contextFor([{ rows: corridor(40, 5), start: { x: 2, y: 3 } }]);
  const game = new Game(ctx);
  const pads: (GamepadLike | null)[] = [];
  const win = new EventTarget();
  const disconnects: PadInfo[] = [];
  const statuses: GamepadStatus[] = [];
  const events: GameEvent[] = [];
  const keyActive = { value: true };
  const holder: { session: GameSession | null } = { session: null };
  const hub = new InputHub({
    keyboardTarget: win,
    provider: () => pads,
    storage,
    isKeyboardActive: () => keyActive.value,
    onGamepadStatus: (s) => statuses.push(s),
    onGamepadDisconnect: (pad) => {
      disconnects.push(pad);
      holder.session?.suspend(); // как делает оболочка
    },
  });
  hub.attach();
  const session = new GameSession({
    game,
    tracker: hub.tracker,
    stepper: new FixedStepper(1000 / ctx.rules.params.tickRateHz),
    onEvents: (e) => events.push(...e),
    resetDevices: () => hub.resetDevices(),
  });
  holder.session = session;
  let time = 0;
  session.frame(time);
  return {
    hub,
    game,
    session,
    pads,
    win,
    disconnects,
    statuses,
    events,
    keyActive,
    frame: () => {
      time += 50; // ровно один такт на кадр
      hub.poll();
      session.frame(time);
    },
    key: (type, code) => {
      win.dispatchEvent(
        Object.assign(new Event(type), {
          code,
          repeat: false,
          ctrlKey: false,
          altKey: false,
          metaKey: false,
          preventDefault: () => undefined,
        }),
      );
    },
  };
}

function startGame(r: Rig): void {
  r.key('keydown', 'Enter');
  r.frame();
  r.key('keyup', 'Enter');
  r.frame();
  expect(r.game.state.phase).toBe('playing');
}

describe('InputHub: клавиатура и геймпад в одном слое действий', () => {
  it('клавиатура и геймпад дают одни и те же логические действия и объединяются', () => {
    const r = rig();
    startGame(r);
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    r.frame(); // активация (кнопка разоружена)
    pad.release(0);
    r.frame();

    r.key('keydown', 'ArrowRight');
    pad.press(2); // огонь на геймпаде
    r.frame();
    expect(r.hub.tracker.down & actionBit('right')).not.toBe(0);
    expect(r.hub.tracker.down & actionBit('fire')).not.toBe(0);
    expect(r.events.some((e) => e.type === 'shot')).toBe(true);
    expect(r.game.state.hero.x).toBeGreaterThan(2);
  });

  it('геймпад: Start запускает игру, Start же ставит на паузу и продолжает', () => {
    const r = rig();
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    r.frame();
    pad.release(0);
    r.frame();
    for (const expected of ['playing', 'paused', 'playing']) {
      pad.press(9);
      r.frame();
      pad.release(9);
      r.frame();
      expect(r.game.state.phase).toBe(expected);
    }
  });

  it('геймпад: нижняя лицевая кнопка в паузе — подтверждение (продолжение), в игре — только прыжок', () => {
    const r = rig();
    startGame(r);
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    r.frame();
    pad.release(0);
    r.frame();
    pad.press(0);
    r.frame();
    expect(r.game.state.phase).toBe('playing');
    expect(r.events.some((e) => e.type === 'jump')).toBe(true);
    pad.release(0);
    r.frame();
    r.session.requestPause();
    pad.press(0);
    r.frame();
    expect(r.game.state.phase).toBe('playing'); // confirm продолжил игру
  });
});

describe('InputHub: отключение геймпада', () => {
  function playingWithPad(): { r: Rig; pad: FakePad } {
    const r = rig();
    startGame(r);
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    r.frame();
    pad.release(0);
    r.frame();
    return { r, pad };
  }

  it('отключение активного геймпада: сброс удерживаемого и пауза', () => {
    const { r, pad } = playingWithPad();
    pad.press(15, 2);
    r.frame();
    r.frame();
    expect(r.game.state.hero.x).toBeGreaterThan(2);
    r.pads.length = 0;
    r.frame();
    expect(r.disconnects).toHaveLength(1);
    expect(r.game.state.phase).toBe('paused');
    expect(r.hub.tracker.down).toBe(0);
    const x = r.game.state.hero.x;
    for (let i = 0; i < 10; i++) r.frame();
    expect(r.game.state.hero.x).toBe(x);
  });

  it('после reconnect и продолжения удерживаемая кнопка не даёт случайный прыжок/выстрел', () => {
    const { r } = playingWithPad();
    r.pads.length = 0;
    r.frame();
    expect(r.game.state.phase).toBe('paused');

    const again = new FakePad();
    again.press(0, 2); // прыжок и огонь остались зажаты
    r.pads.push(again);
    for (let i = 0; i < 5; i++) r.frame();
    expect(r.game.state.phase).toBe('paused'); // подключение само не продолжает игру
    const shots = r.events.filter((e) => e.type === 'shot').length;

    r.key('keydown', 'KeyP'); // явное продолжение с клавиатуры
    r.frame();
    r.key('keyup', 'KeyP');
    for (let i = 0; i < 8; i++) r.frame();
    expect(r.game.state.phase).toBe('playing');
    expect(r.events.filter((e) => e.type === 'jump')).toHaveLength(0);
    expect(r.events.filter((e) => e.type === 'shot')).toHaveLength(shots);
    expect(r.game.state.hero.y).toBe(3);

    again.release(0, 2); // отпустили — и дальше управление работает
    r.frame();
    again.press(0);
    r.frame();
    expect(r.events.some((e) => e.type === 'jump')).toBe(true);
  });

  it('статус геймпада сообщается оболочке для индикации', () => {
    const r = rig();
    r.frame();
    expect(r.hub.gamepad.currentStatus.kind).toBe('none'); // начальное значение событием не сообщается
    const pad = new FakePad();
    r.pads.push(pad);
    r.frame();
    expect(r.statuses.at(-1)?.kind).toBe('idle'); // «Нажмите кнопку на геймпаде»
    pad.press(0);
    r.frame();
    expect(r.statuses.at(-1)?.kind).toBe('active');
  });

  it('недоступный Gamepad API не мешает клавиатуре', () => {
    const r = rig();
    const original = r.pads;
    original.push(null);
    const hub = new InputHub({
      keyboardTarget: r.win,
      provider: () => {
        throw new Error('нет API');
      },
      storage: null,
      isKeyboardActive: () => true,
    });
    hub.attach();
    hub.poll();
    expect(hub.gamepad.currentStatus.kind).toBe('unavailable');
    r.key('keydown', 'ArrowLeft');
    expect(hub.tracker.down & actionBit('left')).not.toBe(0);
  });
});

describe('InputHub: настройки и клавиатура', () => {
  function memory(): StorageLike & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  it('переназначение: новая клавиша действует, старая — нет; настройки сохраняются и переживают «перезагрузку»', () => {
    const storage = memory();
    const r = rig(storage);
    r.hub.updateSettings((s) => {
      s.keyboard.fire = ['k:KeyF'];
    });
    r.key('keydown', 'KeyX');
    expect(r.hub.tracker.down & actionBit('fire')).toBe(0);
    r.key('keydown', 'KeyF');
    expect(r.hub.tracker.down & actionBit('fire')).not.toBe(0);
    expect(r.hub.settingsPersisted).toBe(true);

    const reloaded = rig(storage);
    reloaded.key('keydown', 'KeyF');
    expect(reloaded.hub.tracker.down & actionBit('fire')).not.toBe(0);
  });

  it('сброс к стандартному профилю', () => {
    const storage = memory();
    const r = rig(storage);
    r.hub.updateSettings((s) => {
      s.keyboard.fire = [];
    });
    r.hub.resetSettings();
    r.key('keydown', 'KeyX');
    expect(r.hub.tracker.down & actionBit('fire')).not.toBe(0);
  });

  it('недоступное хранилище: приложение работает, но сообщает, что настройки не сохраняются', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const r = rig(broken);
    r.hub.updateSettings((s) => {
      s.gamepad.stickThreshold = 0.7;
    });
    expect(r.hub.settingsPersisted).toBe(false);
    expect(r.hub.settings.gamepad.stickThreshold).toBe(0.7);
  });

  it('клавиатура не перехватывается, когда игровая область неактивна', () => {
    const r = rig();
    r.keyActive.value = false;
    r.key('keydown', 'ArrowRight');
    expect(r.hub.tracker.down).toBe(0);
  });

  it('потеря фокуса: resetDevices отпускает клавиши без «залипания»', () => {
    const r = rig();
    startGame(r);
    r.key('keydown', 'ArrowRight');
    r.frame();
    r.session.suspend();
    expect(r.hub.tracker.down).toBe(0);
    r.key('keyup', 'ArrowRight'); // keyup после сброса ничего не ломает
    expect(r.hub.tracker.down).toBe(0);
  });
});
