/** Apollo B0202 E02: four-dice pair comparison, bank and paid wagers.
 * Code/fixtures: docs/brick/rom-arcade.md. Seeded randomness and the result hold are adaptations.
 */
import { BrickBase } from '../base';
import { Repeater } from '../timing';
import type { BrickEvent, BrickGameOptions, BrickInput } from '../types';
import { action, put } from './library/common';

/** ROM $189B (bank 1): zero means rethrow, 255 means four equal dice.
 * Stored ROM faces are 0..5; a normal result adds two to get the visible face sum.
 */
export function diceValue(dice: readonly number[]): number {
  if (dice.length !== 4 || dice.some(d => !Number.isInteger(d) || d < 1 || d > 6)) throw new Error('Four dice with faces 1–6 required');
  const counts = new Map<number, number>();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  if (counts.size === 1) return 255;
  const pairs = [...counts].filter(([, count]) => count === 2).map(([face]) => face);
  if (!pairs.length) return 0;
  if (pairs.length === 2) return Math.max(...pairs) * 2;
  return dice.filter(d => d !== pairs[0]).reduce((a, b) => a + b, 0);
}

type Stage = 'bet' | 'bank' | 'player' | 'rolling-bank' | 'rolling-player' | 'result';
export class DiceGame extends BrickBase {
  readonly id = 'dice';
  dice = [1, 1, 1, 1];
  bankerDice = [1, 1, 1, 1];
  prediction: 'higher' | 'lower' = 'higher';
  stake = 0;
  peakBank = 0;
  stage: Stage = 'bet';
  bankerValue = 0;
  playerValue = 0;
  private rollClock = 0;
  private resultLeft = 0;
  private showBanker = false;
  private readonly wagers = new Repeater(8, 8);
  constructor(options: BrickGameOptions = {}) { super(options, 1); this.init(); }
  protected reset(): void {
    this.prediction = 'higher'; this.stake = 0; this.stage = 'bet'; this.bankerValue = this.playerValue = 0;
    this.dice = [1, 1, 1, 1]; this.bankerDice = [...this.dice]; this.rollClock = this.resultLeft = 0;
    this.showBanker = false; this.wagers.reset();
    this.setScore(Math.max(1, this.startLevel - 1) * 1000); this.peakBank = this.score;
  }
  /** The original START/P switch selects bigger/smaller. The separate UI Pause still pauses. */
  startButton(): BrickEvent[] {
    if (this.phase !== 'playing' || this.stage !== 'bet') return [];
    this.prediction = this.prediction === 'higher' ? 'lower' : 'higher';
    return [{ type: 'move' }];
  }
  protected update(input: BrickInput): void {
    if (this.stage === 'result') {
      if (--this.resultLeft <= 0) {
        this.stake = 0; this.bankerValue = this.playerValue = 0; this.stage = 'bet';
        if (this.score === 0) { this.setScore(this.peakBank); this.gameOver(); }
      }
      return;
    }
    if (this.stage === 'rolling-bank' || this.stage === 'rolling-player') {
      if (++this.rollClock % 3 === 0) this.roll();
      if (input.pressed.has('down')) this.stopRoll();
      return;
    }
    if (input.pressed.has('left')) this.showBanker = !this.showBanker;
    if (this.stage === 'bet' && this.wagers.fire('right', input) && this.stake < 100 && this.score >= 10) {
      this.stake++; this.setScore(this.score - 10); this.emit({ type: 'move' });
    }
    if (!action(input) || !this.stake) return;
    this.showBanker = false; this.rollClock = 0;
    this.stage = this.stage === 'player' ? 'rolling-player' : 'rolling-bank';
    this.roll();
  }
  private roll(): void { this.dice = Array.from({ length: 4 }, () => this.rng.range(1, 6)); }
  private stopRoll(): void {
    const value = diceValue(this.dice);
    if (!value) { this.stage = this.stage === 'rolling-bank' ? 'bank' : 'player'; this.emit({ type: 'blocked' }); return; }
    if (this.stage === 'rolling-bank') {
      this.bankerDice = [...this.dice]; this.bankerValue = value;
      if (value === 255) this.settle(0); else this.stage = 'player';
      return;
    }
    this.playerValue = value;
    if (value === 255) this.settle(4);
    else if (value === this.bankerValue) {
      // A push keeps the already-paid wager; another pair of throws costs nothing extra.
      this.stage = 'bet'; this.bankerValue = this.playerValue = 0; this.emit({ type: 'lock' });
    } else this.settle((value > this.bankerValue) === (this.prediction === 'higher') ? 2 : 0);
  }
  private settle(multiplier: number): void {
    this.addScore(this.stake * 10 * multiplier); this.peakBank = Math.max(this.peakBank, this.score);
    this.stage = 'result'; this.resultLeft = 60;
    this.emit({ type: multiplier ? 'bonus' : 'blocked' });
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200), dice = this.showBanker ? this.bankerDice : this.dice;
    const pips = [[[1,1]],[[0,0],[2,2]],[[0,0],[1,1],[2,2]],[[0,0],[2,0],[0,2],[2,2]],[[0,0],[2,0],[1,1],[0,2],[2,2]],[[0,0],[2,0],[0,1],[2,1],[0,2],[2,2]]];
    dice.forEach((face, i) => { for (const [dx,dy] of pips[face - 1]!) put(out, 1 + i % 2 * 5 + dx!, 1 + Math.floor(i / 2) * 4 + dy!); });
    for (let n = 0; n < this.stake; n++) put(out, n % 10, 19 - Math.floor(n / 10));
    return out;
  }
  override preview(): Uint8Array { return Uint8Array.from(this.prediction === 'higher' ? [0,1,0,0,1,1,1,0,0,1,0,0,0,1,0,0] : [0,1,0,0,0,1,0,0,1,1,1,0,0,1,0,0]); }
}
