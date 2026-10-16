/**
 * Детерминированный ГСЧ для игр (обёртка над `core/rng`, mulberry32): состояние — одно число, `Math.random()` в ядре запрещён.
 */
import { nextInt, nextRandom } from '../core/rng';
import { DEFAULT_SEED } from './types';

export class Rng {
  private state: number;

  constructor(seed: number = DEFAULT_SEED) {
    this.state = seed >>> 0;
  }

  /** Число в [0, 1). */
  next(): number {
    const result = nextRandom(this.state);
    this.state = result.state;
    return result.value;
  }

  /** Целое в [0, maxExclusive); для maxExclusive <= 1 всегда 0 (и ГСЧ не расходуется). */
  int(maxExclusive: number): number {
    if (!(maxExclusive > 1)) return 0;
    const result = nextInt(this.state, Math.trunc(maxExclusive));
    this.state = result.state;
    return result.value;
  }

  /** Целое в [min, max] включительно. */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** `true` с вероятностью `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Случайный элемент непустого массива. */
  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error('Rng.pick: пустой массив');
    return item;
  }

  /** Перемешанная копия (Фишер — Йетс). */
  shuffled<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = out[i];
      const b = out[j];
      if (a !== undefined && b !== undefined) {
        out[i] = b;
        out[j] = a;
      }
    }
    return out;
  }
}
