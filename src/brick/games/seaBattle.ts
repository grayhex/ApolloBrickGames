/** Classic blind fleet battle. Two 10×10 boards match the owner's photo; timing/scoring are project choices. */
import { BrickBase } from '../base';
import { emptyField } from '../grid';
import { Repeater } from '../timing';
import { Rng } from '../rng';
import type { BrickGameDef, BrickGameOptions, BrickInput } from '../types';

export const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1] as const;
/** Bounded backtracking, seeded and reproducible. Ships may not touch, including diagonally. */
export function placeFleet(rng: Rng): Uint8Array {
  const board = new Uint8Array(100);
  const place = (index: number): boolean => {
    const length = FLEET[index];
    if (!length) return true;
    const candidates = Array.from({ length: 200 }, (_, i) => i);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = rng.int(i + 1); [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }
    for (const candidate of candidates) {
      const vertical = candidate >= 100;
      const x = candidate % 10, y = Math.floor((candidate % 100) / 10);
      if (x + (vertical ? 1 : length) > 10 || y + (vertical ? length : 1) > 10) continue;
      const cells = Array.from({ length }, (_, i) => (y + (vertical ? i : 0)) * 10 + x + (vertical ? 0 : i));
      if (cells.some((cell) => {
        const cx = cell % 10, cy = Math.floor(cell / 10);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (cx + dx >= 0 && cx + dx < 10 && cy + dy >= 0 && cy + dy < 10 && board[(cy + dy) * 10 + cx + dx]) return true;
        }
        return false;
      })) continue;
      for (const cell of cells) board[cell] = index + 1;
      if (place(index + 1)) return true;
      for (const cell of cells) board[cell] = 0;
    }
    return false;
  };
  if (!place(0)) throw new Error('Fleet placement failed');
  return board;
}

export class SeaBattleGame extends BrickBase {
  readonly id = 'sea-battle';
  private own: Uint8Array = new Uint8Array(100);
  private enemy: Uint8Array = new Uint8Array(100);
  private ownShots = new Uint8Array(100);
  private enemyShots = new Uint8Array(100);
  private x = 0;
  private y = 0;
  private reply = 0;
  private readonly repeat = new Repeater(10, 4);
  constructor(options: BrickGameOptions = {}) { super(options, 1); this.init(); }
  protected reset(): void { this.prepare(); }
  private prepare(): void {
    this.own = placeFleet(this.rng); this.enemy = placeFleet(this.rng);
    this.ownShots.fill(0); this.enemyShots.fill(0); this.x = 0; this.y = 0; this.reply = 0; this.repeat.reset();
  }
  private sunk(board: Uint8Array, shots: Uint8Array, id: number): boolean {
    return board.every((value, i) => value !== id || shots[i] !== 0);
  }
  private defeated(board: Uint8Array, shots: Uint8Array): boolean {
    return board.every((value, i) => !value || shots[i] !== 0);
  }
  protected update(input: BrickInput): void {
    if (this.reply > 0) {
      if (--this.reply > 0) return;
      // Opponent samples untried coordinates only, without inspecting the hidden fleet.
      const available = Array.from({ length: 100 }, (_, i) => i).filter((i) => !this.enemyShots[i]);
      const cell = available[this.rng.int(available.length)];
      if (cell === undefined) return;
      this.enemyShots[cell] = 1;
      this.emit({ type: this.own[cell] ? 'hit' : 'shot' });
      if (this.defeated(this.own, this.enemyShots)) this.gameOver();
      return;
    }
    if (this.repeat.fire('left', input)) this.x = (this.x + 9) % 10;
    if (this.repeat.fire('right', input)) this.x = (this.x + 1) % 10;
    if (this.repeat.fire('up', input)) this.y = (this.y + 9) % 10;
    if (this.repeat.fire('down', input)) this.y = (this.y + 1) % 10;
    if (!input.pressed.has('rotate') && !input.pressed.has('fire')) return;
    const cell = this.y * 10 + this.x;
    if (this.ownShots[cell]) { this.emit({ type: 'blocked' }); return; }
    this.ownShots[cell] = 1;
    const ship = this.enemy[cell] ?? 0;
    this.emit({ type: ship ? 'hit' : 'shot' });
    if (ship) {
      this.addScore(10);
      if (this.sunk(this.enemy, this.ownShots, ship)) { this.addScore(50); this.emit({ type: 'explode' }); }
    }
    if (this.defeated(this.enemy, this.ownShots)) {
      this.addScore(100); this.emit({ type: 'win' });
      this.animateClear(120, () => { this.nextLevel(); this.prepare(); });
    } else this.reply = 30;
  }
  protected draw(): Uint8Array {
    const out = emptyField();
    for (let i = 0; i < 100; i++) {
      out[i] = this.own[i] ? (this.enemyShots[i] ? 2 : 1) : 0;
      out[100 + i] = this.ownShots[i] ? (this.enemy[i] ? 2 : 0) : 1;
    }
    // Fast cursor pulse differs from the renderer's slower blinking hit markers.
    if (this.reply === 0) out[100 + this.y * 10 + this.x] = this.tick % 12 < 6 ? 0 : 1;
    return out;
  }
  protected override drawPreview(): Uint8Array {
    const out = new Uint8Array(16);
    let remaining = 0;
    for (let id = 1; id <= FLEET.length; id++) if (!this.sunk(this.enemy, this.ownShots, id)) remaining++;
    out.fill(1, 0, remaining);
    return out;
  }
}
export const seaBattleDef: BrickGameDef = {
  id: 'sea-battle', declaredModes: null,
  modes: [{ name: { ru: 'Скрытый флот', en: 'Hidden fleet' }, note: 'Два поля и поочерёдные выстрелы — по владельцу; состав флота, автопостановка, темп и очки — выбор проекта.' }],
  create: (options) => new SeaBattleGame(options),
};
