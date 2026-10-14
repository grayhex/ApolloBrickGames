import type { Phase } from '../core';

export interface LedState {
  red: boolean;
  yellow: boolean;
  green: boolean;
}

/** Период мигания в тактах симуляции (20 тактов/с → медленно 0,5 с, быстро 0,2 с). */
export const SLOW_BLINK_TICKS = 5;
export const FAST_BLINK_TICKS = 2;

function blink(tick: number, half: number): boolean {
  return Math.floor(tick / half) % 2 === 0;
}

/**
 * Три светодиода над экраном как индикатор состояния игры. Логика оригинала НЕ установлена
 * (на фото при включённом экране горят все три) — это условная схема демо:
 * готов к старту — горят все три (как на фото); идёт игра — зелёный; пауза — жёлтый мигает;
 * герой погиб — красный мигает часто; игра окончена — красный; участок пройден — все три мигают.
 */
export function ledState(phase: Phase, tick: number): LedState {
  switch (phase) {
    case 'ready':
      return { red: true, yellow: true, green: true };
    case 'playing':
      return { red: false, yellow: false, green: true };
    case 'paused':
      return { red: false, yellow: blink(tick, SLOW_BLINK_TICKS), green: false };
    case 'dead':
      return { red: blink(tick, FAST_BLINK_TICKS), yellow: false, green: false };
    case 'gameOver':
      return { red: true, yellow: false, green: false };
    case 'completed': {
      const on = blink(tick, SLOW_BLINK_TICKS);
      return { red: on, yellow: on, green: on };
    }
  }
}
