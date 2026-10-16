/** Reconstructions from the rules catalog, not a recovered Apollo ROM. */
import { BrickBase } from '../../base';
import { Repeater } from '../../timing';
import type { BrickAction, BrickGameOptions, BrickInput } from '../../types';
export const DIRS = ['up', 'right', 'down', 'left'] as const;
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const action = (input: BrickInput): boolean => input.pressed.has('rotate') || input.pressed.has('fire');
export const heldAction = (input: BrickInput): boolean => input.held.has('rotate') || input.held.has('fire');
export const put = (out: Uint8Array, x: number, y: number, v = 1): void => { if (x >= 0 && x < 10 && y >= 0 && y < 20) out[y * 10 + x] = v; };
export abstract class LibraryGame extends BrickBase {
  protected repeat = new Repeater(12, 5);
  protected constructor(options: BrickGameOptions = {}, modes = 1) { super(options, modes); }
  protected direction(input: BrickInput): number {
    let result = -1;
    DIRS.forEach((key, i) => { if (this.repeat.fire(key, input)) result = i; });
    return result;
  }
  protected tap(input: BrickInput): number { return DIRS.findIndex((key) => input.pressed.has(key)); }
  protected horizontal(input: BrickInput, x: number, max = 9): number {
    const left = this.repeat.fire('left', input), right = this.repeat.fire('right', input);
    return Math.max(0, Math.min(max, x + Number(right) - Number(left)));
  }
  protected lose(reset: () => void): void {
    this.setLives(Math.max(0, (this.lives ?? 1) - 1)); this.emit({ type: 'lifeLost' });
    if (!this.lives) this.gameOver(); else this.animateClear(60, reset);
  }
  protected win(reset: () => void): void {
    this.addScore(100); this.emit({ type: 'win' });
    this.animateClear(60, () => { this.nextLevel(); this.repeat.reset(); reset(); });
  }
  protected period(slow = 30, fast = 6): number { return Math.round(slow - (slow - fast) * (this.speed - 1) / 9); }
}
export const keyFor = (d: number): BrickAction => DIRS[d] ?? 'up';
