/** Apollo 126 in 1 B0202, BrickEmuPy 376cca92c6d000ffd6046e5491f2a1c3d1a5eab0.
 * ROM table $0C38, loaded by $063C into $63; measured by scripts/research/brickemu_probe.py.
 * These are RC-clock parameters of that reference device, not a claim about every Apollo.
 */
export const B0202_CLOCK_HZ = 690_000;
export const B0202_TIMER_CYCLES = 16 * 128;
export const B0202_TETRIS_COUNTS = [150, 120, 100, 82, 60, 41, 35, 31, 27, 25] as const;
export function b0202FallMs(speed: number): number {
  const index = Math.min(9, Math.max(0, Math.trunc(speed) - 1));
  return (B0202_TETRIS_COUNTS[index]! * B0202_TIMER_CYCLES * 1000) / B0202_CLOCK_HZ;
}
