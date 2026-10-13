import { describe, expect, it } from 'vitest';
import { actionBit } from '../../src/core';
import { emptyBindings, type Bindings } from '../../src/input/bindings';
import {
  browserGamepadProvider,
  GamepadInput,
  type GamepadLike,
  type GamepadStatus,
  type PadInfo,
} from '../../src/input/gamepad';
import { defaultSettings, gamepadBindingsFor, needsGamepadSetup } from '../../src/input/settings';
import { FakePad } from '../helpers/fakePad';

const L = actionBit('left');
const R = actionBit('right');
const U = actionBit('up');
const J = actionBit('jump');
const F = actionBit('fire');

interface Rig {
  pads: (GamepadLike | null)[];
  input: GamepadInput;
  masks: number[];
  statuses: GamepadStatus[];
  disconnects: PadInfo[];
  threshold: { value: number };
  preferred: { value: string | null };
  settings: ReturnType<typeof defaultSettings>;
  /** Опрос и последняя маска. */
  poll(): number;
}

function rig(): Rig {
  const settings = defaultSettings();
  const pads: (GamepadLike | null)[] = [];
  const masks: number[] = [];
  const statuses: GamepadStatus[] = [];
  const disconnects: PadInfo[] = [];
  const threshold = { value: 0.5 };
  const preferred = { value: null as string | null };
  const input = new GamepadInput({
    provider: () => pads,
    bindingsFor: (pad) => gamepadBindingsFor(settings, pad),
    getThreshold: () => threshold.value,
    getPreferredId: () => preferred.value,
    sink: (mask) => masks.push(mask),
    onStatus: (status) => statuses.push(status),
    onDisconnect: (pad) => disconnects.push(pad),
  });
  return {
    pads,
    input,
    masks,
    statuses,
    disconnects,
    threshold,
    preferred,
    settings,
    poll: () => {
      input.poll();
      return masks.at(-1) ?? 0;
    },
  };
}

describe('GamepadInput: подключение и активация', () => {
  it('до первого нажатия устройство «ожидает» — подсказка «Нажмите кнопку на геймпаде»', () => {
    const r = rig();
    r.pads.push(new FakePad());
    expect(r.poll()).toBe(0);
    expect(r.input.currentStatus.kind).toBe('idle');
  });

  it('нет устройств → status none', () => {
    const r = rig();
    r.poll();
    expect(r.input.currentStatus).toEqual({ kind: 'none' });
  });

  it('нажатие активирует устройство, но само по себе действием не становится', () => {
    const r = rig();
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    expect(r.poll()).toBe(0); // активация: кнопка «разоружена»
    expect(r.input.currentStatus.kind).toBe('active');
    pad.release(0);
    r.poll();
    pad.press(0);
    expect(r.poll() & J).toBe(J); // новое нажатие — уже прыжок
  });

  it('подключение после загрузки: устройство появляется в провайдере позже', () => {
    const r = rig();
    expect(r.poll()).toBe(0);
    const pad = new FakePad();
    r.pads.push(pad);
    r.poll();
    pad.press(2);
    r.poll();
    pad.release(2);
    r.poll();
    pad.press(2);
    expect(r.poll() & F).toBe(F);
  });

  it('активное устройство может быть не с индексом 0', () => {
    const r = rig();
    const pad = new FakePad(3, 'Second Pad');
    r.pads.push(null, null, null, pad);
    pad.press(9);
    r.poll();
    pad.release(9);
    r.poll();
    pad.press(14);
    expect(r.poll() & L).toBe(L);
    expect(r.input.currentStatus).toMatchObject({ kind: 'active', pad: { index: 3 } });
  });

  it('при двух устройствах активно первое нажатое; второе не мешает, пока первое подключено', () => {
    const r = rig();
    const a = new FakePad(0, 'A');
    const b = new FakePad(1, 'B');
    r.pads.push(a, b);
    b.press(0);
    r.poll();
    b.release(0);
    r.poll();
    a.press(0);
    expect(r.poll()).toBe(0); // A игнорируется: активно B
    b.press(0);
    expect(r.poll() & J).toBe(J);
  });

  it('выбранное устройство (preferredId) активируется без нажатия', () => {
    const r = rig();
    r.pads.push(new FakePad(0, 'A'), new FakePad(1, 'B'));
    r.preferred.value = 'B';
    r.poll();
    expect(r.input.currentStatus).toMatchObject({ kind: 'active', pad: { id: 'B' } });
  });
});

describe('GamepadInput: стандартная раскладка', () => {
  function active(): { r: Rig; pad: FakePad } {
    const r = rig();
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    r.poll();
    pad.release(0);
    r.poll();
    return { r, pad };
  }

  it('D-pad и левый стик дают направления; Start — start+pause; кнопки 0 и 2', () => {
    const { r, pad } = active();
    pad.press(14);
    expect(r.poll()).toBe(L);
    pad.release(14);
    pad.axes[0] = 0.9;
    expect(r.poll()).toBe(R);
    pad.axes[0] = 0;
    pad.axes[1] = -0.9;
    expect(r.poll()).toBe(U);
    pad.axes[1] = 0;
    pad.press(9);
    expect(r.poll()).toBe(actionBit('start') | actionBit('pause'));
    pad.release(9);
    pad.press(0);
    expect(r.poll()).toBe(J | actionBit('confirm'));
    pad.release(0).press(2);
    expect(r.poll()).toBe(F);
  });

  it('движение + прыжок + огонь одновременно', () => {
    const { r, pad } = active();
    pad.press(15, 0, 2);
    expect(r.poll()).toBe(R | J | F | actionBit('confirm'));
  });

  it('аналоговая кнопка срабатывает по value, даже если pressed = false', () => {
    const { r, pad } = active();
    pad.buttons[2] = { pressed: false, value: 0.8 };
    expect(r.poll()).toBe(F);
  });
});

describe('GamepadInput: стик — мёртвая зона и гистерезис', () => {
  function withStick(): { r: Rig; pad: FakePad; at(value: number): number } {
    const r = rig();
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    r.poll();
    pad.release(0);
    r.poll();
    return {
      r,
      pad,
      at: (value) => {
        pad.axes[0] = value;
        return r.poll();
      },
    };
  }

  it('ниже порога — нет направления; выше — есть', () => {
    const { at } = withStick();
    expect(at(0.3)).toBe(0);
    expect(at(0.49)).toBe(0);
    expect(at(0.51)).toBe(R);
  });

  it('около порога направление не дрожит: включилось — держится до заметно меньшего значения', () => {
    const { at } = withStick();
    const seen = [0.4, 0.6, 0.45, 0.52, 0.48, 0.51, 0.4, 0.34].map(at);
    expect(seen).toEqual([0, R, R, R, R, R, R, 0]);
  });

  it('смена знака оси — смена направления без «залипания»', () => {
    const { at } = withStick();
    expect(at(0.9)).toBe(R);
    expect(at(-0.9)).toBe(L);
    expect(at(0)).toBe(0);
  });

  it('порог настраивается', () => {
    const { r, at } = withStick();
    r.threshold.value = 0.8;
    expect(at(0.6)).toBe(0);
    expect(at(0.85)).toBe(R);
    r.threshold.value = 0.2;
    expect(at(0)).toBe(0);
    expect(at(0.25)).toBe(R);
  });

  it('значение NaN игнорируется', () => {
    const { at } = withStick();
    expect(at(Number.NaN)).toBe(0);
  });
});

describe('GamepadInput: отключение, повторное подключение, нейтральная синхронизация', () => {
  function active(): { r: Rig; pad: FakePad } {
    const r = rig();
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    r.poll();
    pad.release(0);
    r.poll();
    return { r, pad };
  }

  it('отключение активного устройства сбрасывает удерживаемое и сообщает оболочке', () => {
    const { r, pad } = active();
    pad.press(15, 2);
    expect(r.poll()).toBe(R | F);
    r.pads.length = 0; // устройство пропало
    expect(r.poll()).toBe(0);
    expect(r.disconnects).toHaveLength(1);
    expect(r.disconnects[0]).toMatchObject({ id: 'Fake Pad (STANDARD)' });
    expect(r.input.currentStatus).toEqual({ kind: 'none' });
  });

  it('смена устройства под тем же индексом считается отключением', () => {
    const { r } = active();
    r.pads[0] = new FakePad(0, 'Another Pad');
    r.poll();
    expect(r.disconnects).toHaveLength(1);
  });

  it('флаг connected = false тоже считается отключением', () => {
    const { r, pad } = active();
    pad.connected = false;
    r.poll();
    expect(r.disconnects).toHaveLength(1);
  });

  it('после повторного подключения удерживаемая кнопка не даёт случайный прыжок/выстрел', () => {
    const { r } = active();
    r.pads.length = 0;
    r.poll();
    const again = new FakePad();
    again.press(0, 2); // владелец держит прыжок и огонь
    r.pads.push(again);
    expect(r.poll()).toBe(0);
    expect(r.poll()).toBe(0);
    again.release(0); // отпустил прыжок — огонь всё ещё держит
    expect(r.poll()).toBe(0);
    again.release(2);
    r.poll();
    again.press(0);
    expect(r.poll() & J).toBe(J);
  });

  it('sync() (возврат из паузы) разоружает то, что уже удерживается', () => {
    const { r, pad } = active();
    pad.press(0, 15);
    expect(r.poll() & J).toBe(J);
    r.input.sync();
    expect(r.poll()).toBe(0);
    pad.release(0);
    expect(r.poll()).toBe(0);
    pad.press(0);
    expect(r.poll() & J).toBe(J);
  });
});

describe('GamepadInput: нестандартный mapping и недоступный API', () => {
  it('нестандартный mapping: автоматической раскладки нет, предлагается настройка', () => {
    const r = rig();
    const pad = new FakePad(0, 'Odd Pad', '');
    r.pads.push(pad);
    pad.press(1);
    r.poll();
    pad.release(1);
    r.poll();
    pad.press(0, 14);
    expect(r.poll()).toBe(0);
    const info = { index: 0, id: 'Odd Pad', mapping: '' };
    expect(needsGamepadSetup(r.settings, info)).toBe(true);

    const custom: Bindings = { ...emptyBindings(), jump: ['b:0'], left: ['b:14'] };
    r.settings.gamepad.byId['Odd Pad'] = custom;
    expect(needsGamepadSetup(r.settings, info)).toBe(false);
    expect(r.poll()).toBe(J | L);
  });

  it('API недоступен или бросает исключение — статус unavailable, без падения; затем восстановление', () => {
    let broken = true;
    const statuses: GamepadStatus[] = [];
    const masks: number[] = [];
    const input = new GamepadInput({
      provider: () => {
        if (broken) throw new Error('SecurityError');
        return [];
      },
      bindingsFor: () => emptyBindings(),
      getThreshold: () => 0.5,
      getPreferredId: () => null,
      sink: (mask) => masks.push(mask),
      onStatus: (s) => statuses.push(s),
    });
    input.poll();
    expect(input.currentStatus).toEqual({ kind: 'unavailable', reason: 'SecurityError' });
    expect(masks.at(-1)).toBe(0);
    broken = false;
    input.poll();
    expect(input.currentStatus).toEqual({ kind: 'none' });
    expect(statuses.map((s) => s.kind)).toEqual(['unavailable', 'none']);
  });

  it('браузерный провайдер без navigator.getGamepads сообщает понятную причину', () => {
    const provider = browserGamepadProvider();
    expect(() => provider()).toThrow(/Gamepad API недоступен/);
  });
});

describe('GamepadInput: захват кнопки для настройки', () => {
  it('захватывает первое новое нажатие, уже удерживаемое игнорирует; ввод в игру на время захвата не идёт', () => {
    const r = rig();
    const pad = new FakePad();
    r.pads.push(pad);
    pad.press(0);
    r.poll();
    pad.release(0);
    r.poll();

    pad.press(5); // уже удерживается к моменту начала захвата
    const captured: { pad: PadInfo; source: string }[] = [];
    r.input.beginCapture((p, source) => captured.push({ pad: p, source }));
    expect(r.poll()).toBe(0);
    expect(captured).toEqual([]);

    pad.press(3);
    expect(r.poll()).toBe(0);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.source).toBe('b:3');
    expect(r.input.capturing).toBe(false);

    pad.axes[2] = 0.9; // после захвата ввод снова идёт (с нейтральной синхронизацией)
    pad.release(3, 5);
    r.poll();
    pad.press(2);
    expect(r.poll() & F).toBe(F);
  });

  it('ось тоже захватывается как источник; cancelCapture отменяет', () => {
    const r = rig();
    const pad = new FakePad();
    r.pads.push(pad);
    const captured: string[] = [];
    r.input.beginCapture((_, source) => captured.push(source));
    r.poll();
    pad.axes[1] = -0.9;
    r.poll();
    expect(captured).toEqual(['a:1:-']);

    r.input.beginCapture((_, source) => captured.push(source));
    r.input.cancelCapture();
    pad.axes[1] = 0;
    r.poll();
    pad.axes[1] = 0.9;
    r.poll();
    expect(captured).toEqual(['a:1:-']);
  });
});

describe('GamepadInput: выбор устройства в настройках', () => {
  it('смена preferredId переключает активное устройство без сообщения об отключении; удерживаемое разоружается', () => {
    const r = rig();
    const a = new FakePad(0, 'A');
    const b = new FakePad(1, 'B');
    r.pads.push(a, b);
    a.press(0);
    r.poll();
    a.release(0);
    r.poll();
    expect(r.input.currentStatus).toMatchObject({ kind: 'active', pad: { id: 'A' } });

    r.preferred.value = 'B';
    b.press(2); // на B уже зажат огонь
    r.poll();
    expect(r.input.currentStatus).toMatchObject({ kind: 'active', pad: { id: 'B' } });
    expect(r.disconnects).toHaveLength(0);
    expect(r.poll()).toBe(0); // зажатое при переключении не считается вводом
    b.release(2);
    r.poll();
    b.press(2);
    expect(r.poll() & F).toBe(F);
  });
});
