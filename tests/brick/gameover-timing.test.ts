import { describe, expect, it } from 'vitest';
import reference from '../fixtures/brickemu/gameover.json';
import { BRICK_GAMES } from '../../src/brick/games';
import { BRICK_ROWS, BRICK_TICK_HZ, GAME_OVER_HOLD_TICKS, GAME_OVER_ROW_MS, GAME_OVER_TICKS, NEUTRAL_BRICK_INPUT } from '../../src/brick';

/** Когда (в тактах после `gameOver`) заливка доходит до k-го ряда снизу, k = 1…20. */
function fillTicks(): number[] {
  const game = BRICK_GAMES['dance']!.create({ seed: 3 });
  game.start();
  (game as unknown as { gameOver(): void }).gameOver();
  const at: number[] = [];
  for (let tick = 1; tick <= GAME_OVER_TICKS + 5; tick++) {
    game.step(NEUTRAL_BRICK_INPUT);
    while (at.length < game.overFill) at.push(tick);
  }
  return at;
}

describe('game over: screen fill pace follows the HT943 ROM traces', () => {
  it('pins the dump the numbers come from', () => {
    expect(reference.reference.revision).toBe('376cca92c6d000ffd6046e5491f2a1c3d1a5eab0');
    expect(Object.keys(reference.devices)).toEqual(['E23PlusMarkII96in1', 'E88_8in1']);
  });
  it('each device fills a row every ~127 ms, bottom to top, then clears from the top at the same pace', () => {
    for (const device of Object.values(reference.devices)) {
      const fill = device.rowFilledMs;
      expect(fill).toHaveLength(BRICK_ROWS);
      const steps = fill.slice(1).map((ms, i) => ms - fill[i]!);
      expect(Math.min(...steps)).toBeGreaterThan(GAME_OVER_ROW_MS - 8);
      expect(Math.max(...steps)).toBeLessThan(GAME_OVER_ROW_MS + 8);
      // Очистка начинается через такой же интервал после последнего ряда и идёт с тем же шагом.
      expect(device.rowClearedMs[0]! - fill.at(-1)!).toBeGreaterThan(GAME_OVER_ROW_MS - 8);
      expect(device.rowClearedMs[0]! - fill.at(-1)!).toBeLessThan(GAME_OVER_ROW_MS + 8);
    }
  });
  it('our fill reaches every row within 2.5 ticks of the ROM, relative to the first row', () => {
    const ours = fillTicks();
    expect(ours).toHaveLength(BRICK_ROWS);
    for (const device of Object.values(reference.devices))
      ours.forEach((tick, row) => {
        const ourMs = ((tick - ours[0]!) * 1000) / BRICK_TICK_HZ;
        expect(Math.abs(ourMs - device.rowFilledMs[row]!), `row ${row + 1}`).toBeLessThan(40);
      });
    // Вся заливка — около 2,5 с (а не 0,67 с, как было при двух тактах на ряд).
    expect((ours.at(-1)! * 1000) / BRICK_TICK_HZ).toBeGreaterThan(2400);
    expect((ours.at(-1)! * 1000) / BRICK_TICK_HZ).toBeLessThan(2700);
  });
  it('then holds the full screen before the over phase', () => {
    expect(GAME_OVER_TICKS).toBeGreaterThanOrEqual(BRICK_ROWS * ((GAME_OVER_ROW_MS * BRICK_TICK_HZ) / 1000) + GAME_OVER_HOLD_TICKS);
  });
});
