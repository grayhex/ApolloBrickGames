/** B0202 A01. The other catalogue variants retain their documented donor rules.
 * Original row scheduler / run lengths: bank 1 $1227 / $11F7. Timer: $0856.
 * RNG and cutscenes remain adaptations; see docs/brick/rom-arcade.md.
 */
import { BrickBase } from '../../base';
import { B0202_CLOCK_HZ, B0202_TIMER_CYCLES } from '../../b0202';
import { Repeater } from '../../timing';
import type { BrickGameOptions, BrickInput } from '../../types';

export const B0202_FROG_GROUPS = [
  [[15, 1], [13, 1], [10, 1], [7, -1], [4, -1]],
  [[16, -1], [14, -1], [9, -1], [3, 1], [1, 1]],
  [[17, 1], [12, -1], [8, 1], [6, 1], [2, -1]],
] as const;
export const B0202_FROG_LENGTHS = [6,5,4,5,3,4,2,2,6,5,6,4,5,3,4,3,7,8,7,6,5,5,4,4,3,4,2,4,5,6,5,4,2,3,2,4,3,4,2,4,2,2,3,2,2,3,3,2] as const;
export const b0202FrogPeriod = (speed: number): number => (20 - 2 * (speed - 1)) * 25 * B0202_TIMER_CYCLES * 60 / B0202_CLOCK_HZ;
const INITIAL_PERIOD = 5 * 25 * B0202_TIMER_CYCLES * 60 / B0202_CLOCK_HZ;
export class B0202FrogGame extends BrickBase {
  readonly id = 'frog';
  x = 5;
  y = 0; // counted from the bottom
  readonly road = new Uint8Array(200);
  private clocks = Array(20).fill(3) as number[];
  private solid = Array(20).fill(true) as boolean[];
  private group = 0;
  private untilRoad = INITIAL_PERIOD;
  private readonly keys = new Repeater(8, 8);
  constructor(options: BrickGameOptions = {}) { super(options, 1); this.init(); }
  protected reset(): void {
    this.setLives(4); this.road.fill(0); this.clocks.fill(3); this.solid.fill(true); this.group = 0;
    this.x = 5; this.y = 0; this.untilRoad = INITIAL_PERIOD; this.keys.reset();
    // $4F/$50 = CC; two traffic islands, rather than a solid divider every other row.
    for (const y of [5, 11]) for (let x = 0; x < 10; x++) this.road[y * 10 + x] = x % 4 < 2 ? 1 : 0;
  }
  protected update(input: BrickInput): void {
    if (--this.untilRoad <= 0) {
      this.untilRoad += b0202FrogPeriod(this.speed);
      this.shiftRoad();
      if (this.busy) return;
    }
    const left = this.keys.fire('left', input), right = this.keys.fire('right', input);
    const up = this.keys.fire('up', input), rotate = this.keys.fire('rotate', input), fire = this.keys.fire('fire', input);
    const down = this.keys.fire('down', input);
    if (!(left || right || up || rotate || fire || down)) return;
    const forward = up || rotate || fire;
    const x = this.x + Number(right) - Number(left);
    const y = this.y + (forward ? this.y === 17 ? 2 : 1 : down ? -1 : 0);
    if (y < 0) return;
    if (x < 0 || x > 9 || this.road[y * 10 + x]) { this.lose(); return; }
    if (y >= 19) {
      this.x = x; this.y = 19;
      const thousands=Math.floor(this.score/1000);
      this.addScore(this.speed);
      if(Math.floor(this.score/1000)>thousands && this.speed<10)this.setSpeed(this.speed+1);
      this.emit({ type: 'bonus' });
      // Measured $2588 crossing blink: 1935.820 ms, rounded only for this finite scene.
      this.cutscene(117, null, () => { this.x = 5; this.y = 0; this.keys.reset(); });
    } else { this.x = x; this.y = y; this.emit({ type: 'move' }); }
  }
  private shiftRoad(): void {
    // The sixth record at $126D wraps its byte offset with BA; it repeats group A,
    // rather than C. This asymmetry is present in the executed original ROM.
    const group = [0, 1, 2, 0, 1, 0][this.group]!;
    this.group = (this.group + 1) % 6;
    for (const [y, dx] of B0202_FROG_GROUPS[group]!) {
      const row = this.road.subarray(y * 10, y * 10 + 10);
      if (dx > 0) row.copyWithin(1, 0, 9); else row.copyWithin(0, 1, 10);
      row[dx > 0 ? 0 : 9] = Number(this.solid[y]);
      if (--this.clocks[y]! <= 0) {
        const offset = this.solid[y] ? 24 : 0;
        this.clocks[y] = B0202_FROG_LENGTHS[offset + (2 - group) * 8 + (this.level > 1 ? 4 : 0) + this.rng.int(4)]!;
        this.solid[y] = !this.solid[y];
      }
      if (this.y === y) this.x += dx;
    }
    if (this.x < 0 || this.x > 9 || this.road[this.y * 10 + this.x]) this.lose();
  }
  private lose(): void {
    this.setLives((this.lives ?? 1) - 1); this.emit({ type: 'crash' }); this.emit({ type: 'lifeLost' });
    if (!this.lives) this.gameOver();
    else this.cutscene(60, null, () => { this.x = 5; this.y = 0; this.keys.reset(); });
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200);
    for (let y = 0; y < 20; y++) out.set(this.road.subarray(y * 10, y * 10 + 10), (19 - y) * 10);
    if (this.x >= 0 && this.x < 10) out[(19 - this.y) * 10 + this.x] = 2;
    return out;
  }
}
