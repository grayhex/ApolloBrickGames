import type { Phase } from '../core';

export interface LedState {
  red: boolean;
  yellow: boolean;
  green: boolean;
}

/** Период мигания в тактах симуляции (20 тактов/с → 0,25 с на половину периода). */
export const SLOW_BLINK_TICKS = 5;

function blink(tick: number, half: number): boolean {
  return Math.floor(tick / half) % 2 === 0;
}

const NONE: LedState = { red: false, yellow: false, green: false };

/** Светодиод `beat` (0 красный, 1 жёлтый, 2 зелёный) один; прочие погашены. */
function only(beat: number): LedState {
  return { red: beat === 0, yellow: beat === 1, green: beat === 2 };
}

/**
 * Три светодиода над экраном. Наблюдения по записи со звуком (docs/video-observations.md §8): пока играет мелодия
 * (фанфара, игра, тон готовности), горит ровно один светодиод и переключается красный → жёлтый → зелёный на каждой ноте;
 * в тишине (построение комнаты, гибель героя) все погашены. `beat` — какой горит по мелодии (audio.ledBeat()); часы мелодии идут и при
 * заглушённом звуке — светодиоды от кнопки «Звук» не зависят (допущение: в записи звук не переключали).
 * Остальное — условная схема демо (в записи не встретилось): пауза — жёлтый мигает; игра окончена — красный горит;
 * участок пройден — все три мигают.
 */
export function ledState(phase: Phase, tick: number, beat = -1): LedState {
  switch (phase) {
    case 'ready':
    case 'playing':
      return beat >= 0 ? only(beat) : NONE;
    case 'paused':
      return { red: false, yellow: blink(tick, SLOW_BLINK_TICKS), green: false };
    case 'dead':
      return NONE;
    case 'gameOver':
      return { red: true, yellow: false, green: false };
    case 'completed': {
      const on = blink(tick, SLOW_BLINK_TICKS);
      return { red: on, yellow: on, green: on };
    }
  }
}
