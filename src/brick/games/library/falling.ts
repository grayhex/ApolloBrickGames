import { LibraryGame, put } from './common';
import { TetrisCore } from '../tetris/core';
import { variantOf } from '../tetris/variants';
import type { BrickGameOptions, BrickInput } from '../../types';

export class FlickerTetrisGame extends TetrisCore {
  readonly id = 'tetris-flicker';
  constructor(o: BrickGameOptions = {}) { super(o, [variantOf('I', 1)]); this.init(); }
  protected override reset(): void {
    super.reset(); this.board.fill(0);
    for (let y = 0; y < Math.min(6, this.level + 1); y++) {
      const gap = this.rng.int(10); for (let x = 0; x < 10; x++) if (x !== gap) this.board[y * 10 + x] = x === (gap + 1) % 10 ? 2 : 1;
    }
  }
  protected override update(input: BrickInput): void {
    super.update(input);
    if (!this.busy && !this.over && !this.board.includes(2)) {
      this.addScore(100); this.emit({ type: 'win' }); this.animateClear(60, () => { this.nextLevel(); this.reset(); });
    }
  }
}

export class QuarthGame extends LibraryGame {
  readonly id = 'quarth'; board = new Uint8Array(200); x = 4; private timer = 0; private cooldown = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.setLives(4); this.setup(); }
  private setup(): void {
    this.board.fill(0); this.timer = this.cooldown = 0; this.repeat.reset();
    // Each separate silhouette has one notch; completing its bounding rectangle removes it.
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 5; x++) if (!(x === 3 && y === 4)) this.board[y * 10 + x] = 1;
  }
  protected update(input: BrickInput): void {
    this.x = this.horizontal(input, this.x); if (this.cooldown) this.cooldown--;
    if ((input.held.has('rotate') || input.held.has('fire')) && !this.cooldown) {
      this.cooldown = 12; let y = 16; while (y > 0 && !this.board[(y - 1) * 10 + this.x]) y--;
      if (y >= 16) { this.lose(() => this.setup()); return; }
      this.board[y * 10 + this.x] = 1; this.emit({ type: 'shot' }); this.clearRectangles();
      if (!this.board.some(Boolean)) { this.win(() => this.setup()); return; }
    }
    if (++this.timer >= this.period(180, 50)) { this.timer = 0; this.board.copyWithin(10, 0, 190); this.board.fill(0, 0, 10); if (this.board.slice(160).some(Boolean)) this.lose(() => this.setup()); }
  }
  private clearRectangles(): void {
    const seen = new Set<number>();
    for (let p = 0; p < 160; p++) {
      if (!this.board[p] || seen.has(p)) continue; const group = [p]; seen.add(p);
      for (let i = 0; i < group.length; i++) { const at = group[i]!; for (const next of [at - 10, at + 10, at % 10 ? at - 1 : -1, at % 10 < 9 ? at + 1 : -1]) if (next >= 0 && next < 160 && this.board[next] && !seen.has(next)) { seen.add(next); group.push(next); } }
      const xs = group.map((n) => n % 10), ys = group.map((n) => Math.floor(n / 10));
      const width = Math.max(...xs) - Math.min(...xs) + 1, height = Math.max(...ys) - Math.min(...ys) + 1;
      if (width >= 2 && height >= 2 && width * height === group.length) { for (const n of group) this.board[n] = 0; this.addScore(group.length); this.emit({ type: 'lines', count: height }); }
    }
  }
  protected draw(): Uint8Array { const out = this.board.slice(); put(out, this.x, 18, 2); for (let dx = -1; dx <= 1; dx++) put(out, this.x + dx, 19); return out; }
}

/** Logical cells use 2×2 patterns, so three monochrome types remain distinguishable. */
export class CapsuleGame extends LibraryGame {
  readonly id: 'dr-mario' | 'columns' | 'columns-flicker'; board = new Uint8Array(36); viruses = new Set<number>(); piece: number[] = []; x = 1; y = 0; horizontalPiece = false; private timer = 0;
  constructor(id: CapsuleGame['id'], o: BrickGameOptions = {}) { super(o); this.id = id; this.init(); }
  protected reset(): void { this.repeat.reset(); this.board.fill(0); this.viruses.clear(); this.timer = 0;
    if (this.id !== 'columns') for (const p of this.rng.shuffled(Array.from({ length: 12 }, (_, i) => i + 24)).slice(0, Math.min(10, this.level + 2))) { this.viruses.add(p); this.board[p] = this.rng.range(1,3); }
    this.spawn();
  }
  private spawn(): void { this.piece = Array.from({ length: this.id === 'dr-mario' ? 2 : 3 }, () => this.rng.range(1,3)); this.x = 1; this.y = 0; this.horizontalPiece = this.id === 'dr-mario'; this.timer = 0; if (!this.fits(this.x, this.y, this.horizontalPiece)) this.gameOver(); }
  private positions(x = this.x, y = this.y, horizontal = this.horizontalPiece): number[] { return this.piece.map((_, i) => (y + (horizontal ? 0 : i)) * 4 + x + (horizontal ? i : 0)); }
  private fits(x: number, y: number, horizontal: boolean): boolean { return x >= 0 && y >= 0 && x + (horizontal ? this.piece.length : 1) <= 4 && y + (horizontal ? 1 : this.piece.length) <= 9 && this.positions(x,y,horizontal).every((p) => !this.board[p]); }
  protected update(input: BrickInput): void {
    const nextX = this.horizontal(input, this.x, 3); if (this.fits(nextX, this.y, this.horizontalPiece)) this.x = nextX;
    if (input.pressed.has('rotate') || input.pressed.has('up')) {
      if (this.id === 'dr-mario') { if (this.fits(this.x, this.y, !this.horizontalPiece)) this.horizontalPiece = !this.horizontalPiece; }
      else this.piece.unshift(this.piece.pop()!);
    }
    const hard = input.pressed.has('fire'); if (hard) while (this.fits(this.x, this.y + 1, this.horizontalPiece)) this.y++;
    if (!hard && ++this.timer < (input.held.has('down') ? 3 : this.period(45, 10))) return; this.timer = 0;
    if (this.fits(this.x, this.y + 1, this.horizontalPiece)) { this.y++; return; }
    this.positions().forEach((p, i) => { this.board[p] = this.piece[i]!; }); this.emit({ type: 'lock' }); this.resolve();
    if (this.id !== 'columns' && !this.viruses.size) this.win(() => this.reset()); else this.spawn();
  }
  resolve(): void {
    // Bounded cascade: every pass removes at least one cell.
    for (let pass = 0; pass < 36; pass++) {
      const remove = new Set<number>(), threshold = this.id === 'columns-flicker' ? 3 : 4;
      const axes = this.id === 'dr-mario' ? [[1,0],[0,1]] : [[1,0],[0,1],[1,1],[-1,1]];
      for (let p = 0; p < 36; p++) if (this.board[p]) for (const [dx,dy] of axes) {
        const run: number[] = []; let x = p % 4, y = Math.floor(p / 4);
        while (x >= 0 && x < 4 && y >= 0 && y < 9 && this.board[y * 4 + x] === this.board[p]) { run.push(y * 4 + x); x += dx!; y += dy!; }
        if (run.length >= threshold) run.forEach((n) => remove.add(n));
      }
      if (!remove.size) break;
      for (const p of remove) { this.board[p] = 0; this.viruses.delete(p); }
      this.addScore(remove.size * 10); this.emit({ type: 'lines', count: 1 });
      // Viruses remain anchored; capsule halves become independent after settling (documented approximation).
      for (let x = 0; x < 4; x++) for (let y = 7; y >= 0; y--) { const p = y * 4 + x; if (!this.board[p] || this.viruses.has(p)) continue; let to = p; while (to + 4 < 36 && !this.board[to + 4]) to += 4; if (to !== p) { this.board[to] = this.board[p]!; this.board[p] = 0; } }
    }
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200); const render = (p: number, type: number, blink: boolean): void => { if (!type) return; const x = p % 4 * 2 + 1, y = Math.floor(p / 4) * 2 + 1, v = blink ? 2 : 1; put(out,x,y,v); if (type >= 2) put(out,x+1,y+1,v); if (type === 3) { put(out,x+1,y,v); put(out,x,y+1,v); } };
    this.board.forEach((v,p) => render(p,v,this.viruses.has(p))); this.positions().forEach((p,i) => render(p,this.piece[i]!,false)); return out;
  }
}
