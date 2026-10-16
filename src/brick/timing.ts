/**
 * Время в тактах: миллисекунды донора -> такты, периодические таймеры и автоповтор зажатых кнопок.
 */
import { BRICK_TICK_HZ, MAX_SPEED, MIN_SPEED, type BrickAction, type BrickInput } from './types';

/** Миллисекунды в такты (не меньше одного такта). */
export const msToTicks = (ms: number): number => Math.max(1, Math.round((ms * BRICK_TICK_HZ) / 1000));

/**
 * «Настоящая» скорость по формуле донора: равномерно от `firstLevelMs` (скорость 1) до `tenthLevelMs` (скорость 10), в тактах на шаг.
 * Чем скорость выше, тем меньше тактов.
 */
export function genuineTicks(speed: number, firstLevelMs: number, tenthLevelMs: number): number {
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.trunc(speed)));
  const step = (firstLevelMs - tenthLevelMs) / (MAX_SPEED - MIN_SPEED);
  return msToTicks(Math.round(firstLevelMs - step * (clamped - 1)));
}

/** Периодический таймер: `fire()` вызывается каждый такт и возвращает `true` раз в `period` тактов. */
export class Countdown {
  period: number;
  private left: number;

  constructor(period: number) {
    this.period = Math.max(1, Math.trunc(period));
    this.left = this.period;
  }

  fire(): boolean {
    this.left--;
    if (this.left > 0) return false;
    this.left = this.period;
    return true;
  }

  /** Начать отсчёт заново, при желании с новым периодом. */
  reset(period: number = this.period): void {
    this.period = Math.max(1, Math.trunc(period));
    this.left = this.period;
  }
}

/**
 * Автоповтор кнопок: срабатывает по фронту нажатия, затем через `delay` тактов и далее каждые `interval` тактов, пока кнопка зажата.
 * Состояние на каждую кнопку своё; отпущенная кнопка сбрасывается.
 */
export class Repeater {
  private readonly counters = new Map<BrickAction, number>();
  private readonly delay: number;
  private readonly interval: number;

  constructor(delay = 12, interval = 3) {
    this.delay = delay;
    this.interval = interval;
  }

  /** Вызывать раз в такт для каждой кнопки, которую проверяет игра. */
  fire(action: BrickAction, input: BrickInput): boolean {
    if (!input.held.has(action) && !input.pressed.has(action)) {
      this.counters.delete(action);
      return false;
    }
    if (input.pressed.has(action)) {
      this.counters.set(action, 0);
      return true;
    }
    const count = (this.counters.get(action) ?? 0) + 1;
    this.counters.set(action, count);
    return count >= this.delay && (count - this.delay) % this.interval === 0;
  }

  reset(): void {
    this.counters.clear();
  }
}
