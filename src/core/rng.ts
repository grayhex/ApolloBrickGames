/**
 * Детерминированный ГСЧ (mulberry32). Состояние — одно число, его можно
 * сохранять вместе с GameState. Math.random() в ядре запрещён линтером.
 */
export interface RandomResult {
  /** Число в диапазоне [0, 1). */
  value: number;
  /** Новое состояние генератора. */
  state: number;
}

export function nextRandom(state: number): RandomResult {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Целое в [0, maxExclusive). */
export function nextInt(state: number, maxExclusive: number): { value: number; state: number } {
  const result = nextRandom(state);
  return { value: Math.floor(result.value * maxExclusive), state: result.state };
}
