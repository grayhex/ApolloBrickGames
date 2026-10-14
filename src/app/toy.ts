import { actionBit, maskOf, type ActionMask } from '../core/actions';
import type { Phase } from '../core';
import type { InputHub } from './hub';

/** Кнопки на корпусе игрушки (подписи — как на устройстве). */
export type ToyKeyId = 'onoff' | 'sp' | 'sound' | 'fire' | 'up' | 'down' | 'left' | 'right' | 'jump';

export const TOY_KEY_IDS: readonly ToyKeyId[] = ['onoff', 'sp', 'sound', 'fire', 'up', 'down', 'left', 'right', 'jump'];

/** Игровые действия кнопок (ON/OFF, SOUND и S./P. задаются отдельно). */
export const KEY_ACTIONS: Partial<Record<ToyKeyId, ActionMask>> = {
  fire: maskOf('fire'),
  up: maskOf('up'),
  down: maskOf('down'),
  left: maskOf('left'),
  right: maskOf('right'),
  jump: maskOf('jump'),
};

const START = actionBit('start');
const PAUSE = actionBit('pause');
const UP = actionBit('up');
const DOWN = actionBit('down');
const LEFT = actionBit('left');
const RIGHT = actionBit('right');

/** Мёртвая зона крестовины пульта для телефона: доля радиуса от центра, где палец ничего не нажимает. */
const DPAD_DEAD_ZONE = 0.2;
/** Косинус угла к оси, начиная с которого направление считается нажатым: между осями — диагональ (две клавиши сразу). */
const DPAD_AXIS = 0.4;

/**
 * Крестовина пульта для телефона: положение пальца (x вправо, y вниз; −1…1 от центра зоны) → нажатые направления. 8 направлений:
 * около оси — одно, между осями (≈ 43° полосой) — два сразу, например «влево + вверх» — прыжок влево. Палец можно вести за пределы зоны —
 * направление определяется углом. В центре (мёртвая зона) ничего не нажато.
 */
export function dpadMask(x: number, y: number): ActionMask {
  const reach = Math.hypot(x, y);
  if (reach < DPAD_DEAD_ZONE) return 0;
  let mask = 0;
  if (Math.abs(x) / reach > DPAD_AXIS) mask |= x < 0 ? LEFT : RIGHT;
  if (Math.abs(y) / reach > DPAD_AXIS) mask |= y < 0 ? UP : DOWN;
  return mask;
}

/** Лёгкий отклик на нажатие там, где браузер умеет вибрировать (Android); iOS вибрацию не даёт — молча ничего. */
function buzz(ms = 8): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    // Вибрация недоступна (политика браузера) — не страшно.
  }
}
/** S./P. — одна кнопка старта и паузы: подсвечивается и от start, и от pause. */
export const START_PAUSE_MASK: ActionMask = START | PAUSE;

/** Что делает нажатие S./P. в этой фазе: в игре — пауза, в остальных — старт или продолжение. */
export function startPauseAction(phase: Phase): ActionMask {
  return phase === 'playing' ? PAUSE : START;
}

/** Какие кнопки корпуса подсвечены при такой маске удерживаемых действий (клавиатура, геймпад, мышь). */
export function pressedKeys(down: ActionMask): Set<ToyKeyId> {
  const pressed = new Set<ToyKeyId>();
  for (const [id, mask] of Object.entries(KEY_ACTIONS) as [ToyKeyId, ActionMask][]) {
    if ((down & mask) !== 0) pressed.add(id);
  }
  if ((down & START_PAUSE_MASK) !== 0) pressed.add('sp');
  return pressed;
}

export interface ToyHooks {
  phase(): Phase;
  /** Включена ли игрушка: выключенная кнопки игры не слушает. */
  powered(): boolean;
  onPower(): void;
  onSound(): void;
}

/**
 * Кнопки корпуса: нажимаются мышью и пальцем (игровые — через общий слой ввода, как клавиши),
 * а подсвечиваются по любому источнику — клавиатура, геймпад, мышь. Кнопки не берут фокус,
 * чтобы клавиатура осталась у игры. На телефоне те же действия дублирует пульт под экраном (`[data-pad]`, крестовина
 * `[data-pad-zone="dpad"]` со стрелками `[data-pad-dir]`): одна кнопка может быть в нескольких местах, подсвечиваются все.
 */
export class ToyPanel {
  private readonly buttons = new Map<ToyKeyId, HTMLElement[]>();
  private readonly lit = new Set<ToyKeyId>();
  /** Подсветка от указателей и горячих клавиш (ON/OFF, SOUND). */
  private readonly extra = new Map<ToyKeyId, number>();
  private readonly hub: InputHub;
  private readonly hooks: ToyHooks;

  constructor(root: HTMLElement, hub: InputHub, hooks: ToyHooks) {
    this.hub = hub;
    this.hooks = hooks;
    for (const id of TOY_KEY_IDS) {
      const pressable = [...root.querySelectorAll<HTMLElement>(`[data-key="${id}"], [data-pad="${id}"]`)];
      if (pressable.length === 0) continue;
      for (const button of pressable) this.bind(id, button);
      // Стрелки крестовины пульта только подсвечиваются: нажимает их сама зона (см. bindDpad).
      this.buttons.set(id, [...pressable, ...root.querySelectorAll<HTMLElement>(`[data-pad-dir="${id}"]`)]);
    }
    const zone = root.querySelector<HTMLElement>('[data-pad-zone="dpad"]');
    if (zone) this.bindDpad(zone);
  }

  /** Подсветить нажатые кнопки по маске удерживаемых действий трекера. */
  sync(down: ActionMask): void {
    const wanted = pressedKeys(down);
    for (const id of this.extra.keys()) wanted.add(id);
    for (const [id, elements] of this.buttons) {
      const on = wanted.has(id);
      if (on === this.lit.has(id)) continue;
      if (on) this.lit.add(id);
      else this.lit.delete(id);
      for (const element of elements) {
        if (on) element.dataset['pressed'] = '';
        else delete element.dataset['pressed'];
      }
    }
  }

  /** Горячая клавиша (O, M): подсветить и выполнить действие кнопки. */
  hotkey(id: 'onoff' | 'sound', pressed: boolean): void {
    if (pressed) {
      this.extra.set(id, -1);
      this.trigger(id);
    } else {
      this.extra.delete(id);
    }
    this.sync(this.hub.tracker.down);
  }

  private trigger(id: ToyKeyId): void {
    if (id === 'onoff') this.hooks.onPower();
    else if (id === 'sound') this.hooks.onSound();
  }

  private bind(id: ToyKeyId, button: HTMLElement): void {
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault(); // не забирать фокус у игры и не выделять текст
      button.setPointerCapture(event.pointerId);
      this.extra.set(id, event.pointerId);
      if (event.pointerType !== 'mouse') buzz();
      if (id === 'onoff' || id === 'sound') {
        this.trigger(id);
      } else if (this.hooks.powered()) {
        const mask = id === 'sp' ? startPauseAction(this.hooks.phase()) : (KEY_ACTIONS[id] ?? 0);
        if (mask !== 0) this.hub.screen.press(event.pointerId, mask);
      }
      this.sync(this.hub.tracker.down);
    });
    const release = (event: PointerEvent): void => {
      this.hub.screen.release(event.pointerId);
      if (this.extra.get(id) === event.pointerId) this.extra.delete(id);
      this.sync(this.hub.tracker.down);
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /**
   * Крестовина пульта для телефона — одна зона на все четыре стрелки: палец ведут по ней, и направление меняется без отрыва
   * (с отдельными кнопками захват указателя держал бы первую). Диагонали — две стрелки сразу (`dpadMask`).
   */
  private bindDpad(zone: HTMLElement): void {
    const last = new Map<number, number>();
    const update = (event: PointerEvent): void => {
      const rect = zone.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      const mask = this.hooks.powered() ? dpadMask(x, y) : 0;
      if (mask !== 0 && mask !== (last.get(event.pointerId) ?? 0) && event.pointerType !== 'mouse') buzz(6);
      last.set(event.pointerId, mask);
      this.hub.screen.press(event.pointerId, mask);
      this.sync(this.hub.tracker.down);
    };
    zone.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      zone.setPointerCapture(event.pointerId);
      update(event);
    });
    zone.addEventListener('pointermove', (event) => {
      if (zone.hasPointerCapture(event.pointerId)) update(event);
    });
    const release = (event: PointerEvent): void => {
      last.delete(event.pointerId);
      this.hub.screen.release(event.pointerId);
      this.sync(this.hub.tracker.down);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
    zone.addEventListener('lostpointercapture', release);
    zone.addEventListener('contextmenu', (event) => event.preventDefault());
  }
}
