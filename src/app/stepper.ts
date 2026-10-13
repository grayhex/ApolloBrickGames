export interface StepperOptions {
  /** Максимум догоняющих тактов за один кадр отрисовки. */
  maxCatchUpSteps?: number;
  /** Один кадр не может «принести» больше времени, чем это значение (мс). */
  maxFrameMs?: number;
}

/**
 * Накопитель времени для фиксированного шага симуляции.
 * Частота отрисовки (30/60/144 Гц) число тактов в секунду не меняет.
 */
export class FixedStepper {
  readonly stepMs: number;
  private readonly maxCatchUp: number;
  private readonly maxFrameMs: number;
  private last: number | null = null;
  private accumulator = 0;

  constructor(stepMs: number, options: StepperOptions = {}) {
    this.stepMs = stepMs;
    this.maxCatchUp = options.maxCatchUpSteps ?? 5;
    this.maxFrameMs = options.maxFrameMs ?? 250;
  }

  /**
   * Вызывает tick() столько раз, сколько тактов набралось. Возвращает число тактов.
   * Первый вызов после reset() только запоминает время — скачка не будет.
   */
  advance(nowMs: number, tick: () => void): number {
    if (this.last === null) {
      this.last = nowMs;
      return 0;
    }
    const delta = Math.min(Math.max(nowMs - this.last, 0), this.maxFrameMs);
    this.last = nowMs;
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator + 1e-6 >= this.stepMs && steps < this.maxCatchUp) {
      this.accumulator -= this.stepMs;
      steps += 1;
      tick();
    }
    // Не успеваем — лишнее время отбрасываем, чтобы не копить «долг» тактов.
    if (this.accumulator + 1e-6 >= this.stepMs) this.accumulator %= this.stepMs;
    if (this.accumulator < 0) this.accumulator = 0;
    return steps;
  }

  /** Забыть накопленное время и последнюю отметку (пауза, скрытие вкладки, потеря фокуса). */
  reset(): void {
    this.last = null;
    this.accumulator = 0;
  }
}
