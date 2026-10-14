import type { DeathCause, GameState } from '../core';
import { describeSource, type Bindings } from '../input/bindings';
import type { GamepadStatus } from '../input/gamepad';

/** Почему игра на паузе (для подсказки в оверлее). */
export type SuspendReason = 'hidden' | 'blur' | 'gamepad' | 'settings' | null;

export interface OverlayView {
  title: string;
  hint: string;
  /** Подпись главной кнопки; null — кнопки нет. */
  action: string | null;
}

const DEATH_TEXT: Record<DeathCause, string> = {
  enemy: 'столкновение с врагом',
  hazard: 'опасная область',
  pit: 'падение в провал',
  time: 'время вышло',
};

export function deathText(cause: DeathCause | null): string {
  return cause ? DEATH_TEXT[cause] : 'неизвестная причина';
}

const RESUME_HINT = 'Продолжить: Esc, P, Start на геймпаде или кнопка ниже.';

/** Что показать поверх игры. null — ничего (идёт игра). */
export function overlayView(state: GameState, reason: SuspendReason): OverlayView | null {
  switch (state.phase) {
    case 'playing':
      return null;
    case 'ready':
      return {
        title: state.deathCause ? `Герой погиб: ${deathText(state.deathCause)}` : 'Готов к старту',
        hint: state.deathCause
          ? `Жизней осталось: ${state.lives}. Enter, Start на геймпаде или кнопка ниже.`
          : 'Enter, Start на геймпаде или кнопка ниже.',
        action: 'Старт',
      };
    case 'paused': {
      const cause =
        reason === 'hidden' || reason === 'blur'
          ? 'Окно потеряло фокус — игра поставлена на паузу. '
          : reason === 'gamepad'
            ? 'Геймпад отключён — игра поставлена на паузу. '
            : reason === 'settings'
              ? 'Открыты настройки. '
              : '';
      return { title: 'Пауза', hint: cause + RESUME_HINT, action: 'Продолжить' };
    }
    case 'dead':
      return { title: `Герой погиб: ${deathText(state.deathCause)}`, hint: `Жизней осталось: ${state.lives}`, action: null };
    case 'gameOver':
      return { title: 'Игра окончена', hint: `Счёт: ${state.score}. Enter, Start или кнопка ниже — новая игра.`, action: 'Новая игра' };
    case 'completed':
      return {
        title: 'Демо пройдено',
        hint: `Счёт: ${state.score}. Это только техническая сцена движка. Enter, Start или кнопка ниже — заново.`,
        action: 'Новая игра',
      };
  }
}

export function gamepadStatusText(status: GamepadStatus, needsSetup: boolean): string {
  switch (status.kind) {
    case 'unavailable':
      return `недоступен (${status.reason}). Управление — с клавиатуры. Нужны HTTPS или localhost.`;
    case 'none':
      return 'не обнаружен. Подключите геймпад и нажмите на нём кнопку.';
    case 'idle': {
      const names = status.pads.map((pad) => pad.id).join('; ');
      return `обнаружен: ${names}. Нажмите кнопку на геймпаде, чтобы активировать.`;
    }
    case 'active':
      return needsSetup
        ? `активен: ${status.pad.id}. Нестандартный mapping — назначьте кнопки в «Настройках».`
        : `активен: ${status.pad.id}${status.pad.mapping === 'standard' ? ' (standard)' : ''}.`;
  }
}

export function keyboardStatusText(active: boolean): string {
  return active ? 'активна' : 'не активна — кликните по игровой области.';
}

/** Секунды до конца таймера участка (demo) или «выкл.». */
export function timerText(state: GameState, tickRateHz: number, limitTicks: number): string {
  if (limitTicks <= 0) return 'выкл.';
  return `${Math.max(0, Math.ceil(state.timerTicks / tickRateHz))} с`;
}

/** Краткая подсказка по клавишам — по текущим привязкам, поэтому после переназначения она меняется. */
export function controlsHint(bindings: Bindings, withFire: boolean): string {
  const keys = (...actions: (keyof Bindings)[]): string => {
    const list = [...new Set(actions.flatMap((action) => bindings[action]))].map((source) => describeSource(source));
    return list.length === 0 ? 'не назначено' : list.join(' · ');
  };
  const parts = [`Ходьба: ${keys('left', 'right')}`, `Прыжок: ${keys('jump')}`];
  if (withFire) parts.push(`Огонь: ${keys('fire')}`);
  parts.push(`Старт: ${keys('start')}`, `Пауза: ${keys('pause')}`);
  return parts.join(' — ') + '. Геймпад: крестовина или левый стик, нижняя кнопка — прыжок, Start — старт/пауза.';
}

/** Состояние значка устройства: `on` — сейчас ведёт игру, `ready` — доступно, `hidden` — нет. */
export type DeviceState = 'on' | 'ready' | 'hidden';

export interface DeviceView {
  keyboard: Exclude<DeviceState, 'hidden'>;
  gamepad: DeviceState;
  /** Имя подключённого геймпада (для подсказки); null — геймпада нет. */
  padName: string | null;
}

/**
 * Какие значки показать в панели справа. Клавиатура есть всегда; значок геймпада появляется при подключении
 * (`ready` — подключён, ждёт нажатия любой кнопки или не он нажимался последним; `on` — игрой управляют с него).
 */
export function deviceView(status: GamepadStatus, last: 'keyboard' | 'gamepad'): DeviceView {
  if (status.kind === 'none' || status.kind === 'unavailable') return { keyboard: 'on', gamepad: 'hidden', padName: null };
  if (status.kind === 'idle') return { keyboard: 'on', gamepad: 'ready', padName: status.pads[0]?.id ?? null };
  const padLast = last === 'gamepad';
  return { keyboard: padLast ? 'ready' : 'on', gamepad: padLast ? 'on' : 'ready', padName: status.pad.id };
}
