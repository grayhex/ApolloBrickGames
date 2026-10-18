/** E88 8 in 1, game 5; executed in pinned BrickEmuPy (see rom-arcade.json).
 * Median complete movement periods include the HT943 timer and drawing instructions.
 * E-23 game 93 independently agrees to within 1 ms. No integer-frame rounding.
 */
export const E88_SNAKE_MS = [332.358, 299.334, 266.316, 233.764, 200.738, 168.178, 135.156, 102.128, 70.056, 37.038] as const;
export const e88SnakeTicks = (speed: number): number => E88_SNAKE_MS[Math.max(0, Math.min(9, Math.trunc(speed) - 1))]! * 60 / 1000;
