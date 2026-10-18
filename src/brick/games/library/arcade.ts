import { LibraryGame, action, DIRS, DX, DY, put } from './common';
import { e88SnakeTicks } from '../../e88';
import { DANCE_MODES, SNAKE_MODES } from './modes';
import type { BrickGameOptions, BrickInput } from '../../types';

export class SnakeGame extends LibraryGame {
  readonly id = 'snake'; body: number[] = []; directionNow = 1; food = 0; eaten = 0; walls = new Set<number>(); private timer = 0;
  /** Вариант 02 «Frame» (вики): по периметру поля горит рамка в одну клетку, игровая область 8 × 18. */
  readonly frame: boolean;
  constructor(o: BrickGameOptions = {}) { super(o, SNAKE_MODES.length); this.frame = this.mode === 1; this.init(); }
  protected reset(): void { this.setLives(4); this.setup(); }
  private setup(): void {
    // ROM coordinates: head (5,0), tail (3,0), with y counted from the bottom.
    const row = this.frame ? 18 : 19;
    this.body = [row * 10 + 5, row * 10 + 4, row * 10 + 3]; this.directionNow = 1; this.eaten = 0; this.timer = 0; this.walls.clear();
    if (this.frame) for (let p = 0; p < 200; p++) { const x = p % 10, y = Math.floor(p / 10); if (x === 0 || x === 9 || y === 0 || y === 19) this.walls.add(p); }
    this.spawnFood();
  }
  private spawnFood(): void { const free = Array.from({ length: 200 }, (_, p) => p).filter((p) => !this.walls.has(p) && !this.body.includes(p)); this.food = this.rng.pick(free); }
  protected update(input: BrickInput): void {
    // ROTATE is the fourth direction (up), not an invented turbo key.
    const d = this.tap(input) >= 0 ? this.tap(input) : action(input) ? 0 : -1;
    if (d === (this.directionNow + 2) % 4) {
      // The firmware reverses the whole worm, even when its tail is around a corner.
      this.body.reverse();
      const head = this.body[0]!, neck = this.body[1]!;
      this.directionNow = head === neck - 10 ? 0 : head === neck + 1 ? 1 : head === neck + 10 ? 2 : 3;
      return; // reversal itself does not advance the new head or restart gravity
    }
    if (d >= 0) { this.directionNow = d; this.timer = 0; }
    else { this.timer++; const period = e88SnakeTicks(this.speed); if (this.timer < period) return; this.timer -= period; }
    const head = this.body[0]!, x = head % 10 + DX[this.directionNow]!, y = Math.floor(head / 10) + DY[this.directionNow]!;
    const to = y * 10 + x, eat = to === this.food;
    if (x < 0 || x >= 10 || y < 0 || y >= 20 || this.walls.has(to) || this.body.slice(0, eat ? undefined : -1).includes(to)) { this.lose(() => this.setup()); return; }
    this.body.unshift(to); if (!eat) { this.body.pop(); this.emit({ type: 'move' }); } else { this.addScore(10); this.emit({ type: 'bonus' }); if (++this.eaten === 13) this.win(() => this.setup()); else this.spawnFood(); }
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); for (const p of this.walls) out[p] = 1; for (const p of this.body) out[p] = 1; out[this.body[0]!] = 2; out[this.food] = 2; return out; }
}

/** The same four pads serve reaction, memorisation and scrolling rhythm games. */
export class PadsGame extends LibraryGame {
  readonly id: 'whack-a-mole' | 'simon' | 'dance'; target = 0; sequence: number[] = []; response = 0; showing = 0; timer = 0; hits = 0;
  notes: { direction: number; y: number }[] = []; private beat = 0;
  constructor(id: PadsGame['id'], o: BrickGameOptions = {}) {
    super(o, id === 'dance' ? DANCE_MODES.length : 1); this.id = id;
    this.flipped = id === 'dance' && this.mode === 1; // вариант 02 «Invert upside-down»
    this.init();
  }
  protected reset(): void { this.setLives(4); this.hits = 0; this.sequence = []; this.setup(); }
  private setup(): void {
    this.target = this.rng.int(4); this.timer = this.period(120, 35); this.response = 0; this.showing = 0; this.beat = 0; this.notes = [];
    if (this.id === 'simon') { this.sequence.push(this.target); this.showing = this.sequence.length * 40 + 20; }
  }
  protected update(input: BrickInput): void {
    const d = this.tap(input);
    if (this.id === 'dance') {
      if (++this.beat % this.period(12, 5) === 0) {
        for (const note of this.notes) note.y++;
        if (this.notes.some((note) => note.y > 19)) { this.notes = this.notes.filter((n) => n.y <= 19); this.lose(() => this.setup()); return; }
        if (!this.notes.length || this.notes.at(-1)!.y >= 5) this.notes.push({ direction: this.rng.int(4), y: 0 });
      }
      if (d >= 0) {
        const i = this.notes.findIndex((n) => n.direction === d && n.y >= 16 && n.y <= 19);
        if (i < 0) this.lose(() => this.setup()); else { this.notes.splice(i, 1); this.emit({ type: 'tone', pad: d, ticks: 12 }); this.reward(); }
      } return;
    }
    if (this.showing > 0) {
      // Показ последовательности: на начало каждого сигнала — его тон (рисунок `draw` считает те же такты).
      const elapsed = this.sequence.length * 40 + 20 - this.showing;
      if (this.showing > 20 && elapsed % 40 === 0) this.emit({ type: 'tone', pad: this.sequence[elapsed / 40]!, ticks: 25 });
      this.showing--; return;
    }
    if (--this.timer <= 0) { this.lose(() => { if (this.id === 'simon') this.sequence = []; this.setup(); }); return; }
    if (d < 0 && !action(input)) return;
    // Action corresponds to the bottom pad, permitting the original fire-button layout too.
    const chosen = d >= 0 ? d : 2;
    const expected = this.id === 'simon' ? this.sequence[this.response] : this.target;
    if (chosen !== expected) { this.lose(() => { this.sequence = []; this.setup(); }); return; }
    this.emit(this.id === 'simon' ? { type: 'tone', pad: chosen, ticks: 12 } : { type: 'hit' });
    if (this.id === 'simon' && ++this.response < this.sequence.length) { this.timer = this.period(180, 90); return; }
    this.reward(); if (!this.busy) this.setup();
  }
  private reward(): void { this.addScore(10); if (++this.hits % 10 === 0) this.win(() => { this.sequence = []; this.setup(); }); else if (this.id !== 'dance') this.emit({ type: 'bonus' }); }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200);
    if (this.id === 'dance') { for (let i = 0; i < 4; i++) put(out, i * 2 + 1, 18); for (const n of this.notes) { put(out, n.direction * 2 + 1, n.y, 2); if (n.y > 0) put(out, n.direction * 2 + 1, n.y - 1); } return out; }
    let lit = this.target;
    if (this.id === 'simon') { const elapsed = this.sequence.length * 40 + 20 - this.showing; lit = this.showing > 20 && elapsed % 40 < 25 ? this.sequence[Math.floor(elapsed / 40)]! : -1; }
    const positions = [[4, 5], [7, 10], [4, 15], [1, 10]];
    positions.forEach(([x, y], i) => { put(out, x!, y!, i === lit ? 2 : 1); if (i === lit) { put(out, x! + 1, y!); put(out, x!, y! + 1); } }); return out;
  }
}

export class MatchingGame extends LibraryGame {
  readonly id = 'matching-blocks'; bottom = [0, 1, 2]; falling = [0, 1, 2]; y = 0; selected = 0; private timer = 0; private matches = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.setLives(4); this.matches = 0; this.repeat.reset(); this.setup(); }
  private setup(): void { this.bottom = [0, 1, 2]; this.falling = this.rng.shuffled([0, 1, 2]); this.y = 0; this.timer = 0; }
  protected update(input: BrickInput): void {
    this.selected = this.horizontal(input, this.selected, 2);
    if (action(input) || input.pressed.has('up') || input.pressed.has('down')) this.bottom[this.selected] = (this.bottom[this.selected]! + 1) % 3;
    if (++this.timer < this.period(45, 12)) return; this.timer = 0;
    if (++this.y >= 16) { if (this.bottom.every((v, i) => v === this.falling[i])) { this.addScore(30); if (++this.matches % 5 === 0) this.win(() => this.setup()); else this.setup(); } else this.lose(() => this.setup()); }
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200); const shapes = [[[0,0],[1,0],[0,1],[1,1]], [[0,0],[0,1],[1,1]], [[0,0],[0,1]]];
    for (let i = 0; i < 3; i++) { for (const [dx,dy] of shapes[this.falling[i]!]!) put(out, 1 + i * 3 + dx!, this.y + dy!); for (const [dx,dy] of shapes[this.bottom[i]!]!) put(out, 1 + i * 3 + dx!, 17 + dy!, i === this.selected ? 2 : 1); } return out;
  }
}

export class FlappyGame extends LibraryGame {
  readonly id = 'flappy-bird'; bird = 10; velocity = 0; pipes: { x: number; gap: number; passed: boolean }[] = []; private timer = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.bird = 10; this.velocity = 0; this.timer = 0; this.pipes = [{ x: 9, gap: this.rng.range(4, 10), passed: false }]; }
  protected update(input: BrickInput): void {
    if (action(input) || input.pressed.has('up')) this.velocity = -0.22;
    this.velocity = Math.min(0.22, this.velocity + 0.009); this.bird += this.velocity;
    if (++this.timer >= this.period(22, 10)) { this.timer = 0; for (const p of this.pipes) { p.x--; if (p.x < 2 && !p.passed) { p.passed = true; this.addScore(1); } } this.pipes = this.pipes.filter((p) => p.x >= 0); if (this.pipes.at(-1)!.x <= 4) this.pipes.push({ x: 9, gap: Math.max(3,Math.min(12,this.pipes.at(-1)!.gap+this.rng.range(-3,3))), passed: false }); }
    const y = Math.floor(this.bird); if (y < 0 || y >= 20 || this.pipes.some((p) => p.x === 2 && (y < p.gap || y >= p.gap + 6))) this.gameOver();
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); for (const p of this.pipes) for (let y = 0; y < 20; y++) if (y < p.gap || y >= p.gap + 6) put(out, p.x, y); put(out, 2, Math.floor(this.bird), 2); return out; }
}

export class BasketGame extends LibraryGame {
  readonly id = 'basket'; x = 4; drops: { x: number; y: number; bad: boolean }[] = []; private timer = 0; private caught = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.setLives(4); this.caught = 0; this.setup(); }
  private setup(): void { this.x = 4; this.drops = []; this.timer = 0; this.repeat.reset(); }
  protected update(input: BrickInput): void {
    this.x = this.horizontal(input, this.x, 7);
    if (++this.timer % this.period(24, 9)) return;
    for (const drop of this.drops) {
      drop.y++; if (drop.y !== 18) continue;
      const catchIt = drop.x >= this.x && drop.x <= this.x + 2;
      if (catchIt && drop.bad || !catchIt && !drop.bad) { this.lose(() => this.setup()); return; }
      if (catchIt) { this.addScore(10); if (++this.caught % 20 === 0) { this.win(() => this.setup()); return; } }
    }
    this.drops = this.drops.filter((d) => d.y < 18);
    if (!this.drops.length || this.drops.at(-1)!.y >= 6) this.drops.push({ x: this.rng.int(10), y: 1, bad: this.rng.chance(0.25) });
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); for (let dx = 0; dx < 3; dx++) put(out, this.x + dx, 19); put(out, this.x, 18); put(out, this.x + 2, 18); for (const d of this.drops) { put(out, d.x, d.y, d.bad ? 1 : 2); if (d.bad) put(out, d.x, d.y - 1); } return out; }
}

export class DiggerGame extends LibraryGame {
  readonly id = 'digger'; player = 194; dirt = new Uint8Array(200); gems = new Set<number>(); monsters: number[] = []; missiles = 4; facing = 0; private timer = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.setLives(4); this.missiles = 4; this.setup(); }
  private setup(): void { this.dirt.fill(1); this.player = 194; this.dirt[this.player] = 0; this.gems = new Set(this.rng.shuffled(Array.from({ length: 170 }, (_, p) => p)).slice(0, 5 + this.level)); this.monsters = []; this.timer = 0; this.repeat.reset(); }
  protected update(input: BrickInput): void {
    const d = this.direction(input);
    if (d >= 0) { this.facing = d; const x = this.player % 10 + DX[d]!, y = Math.floor(this.player / 10) + DY[d]!; if (x >= 0 && x < 10 && y >= 0 && y < 20) { this.player = y * 10 + x; this.dirt[this.player] = 0; if (this.gems.delete(this.player)) this.addScore(10); } }
    if (!this.gems.size) { this.win(() => this.setup()); return; }
    if (action(input) && this.missiles) {
      this.missiles--; this.emit({ type: 'shot' }); let x = this.player % 10, y = Math.floor(this.player / 10);
      while (x >= 0 && x < 10 && y >= 0 && y < 20) { const p = y * 10 + x; if (this.monsters.includes(p)) { this.monsters = this.monsters.filter((m) => m !== p); this.addScore(25); break; } x += DX[this.facing]!; y += DY[this.facing]!; }
    }
    this.timer++; if (this.timer % 600 === 0 && this.monsters.length < 4) this.monsters.push(this.rng.int(10));
    if (this.timer % this.period(35, 15) === 0) this.monsters = this.monsters.map((p) => { const dx = Math.sign(this.player % 10 - p % 10), dy = Math.sign(Math.floor(this.player / 10) - Math.floor(p / 10)); return p + (dx && (this.timer % 2 || !dy) ? dx : dy * 10); });
    if (this.monsters.includes(this.player)) this.lose(() => this.setup());
  }
  protected draw(): Uint8Array { const out = this.dirt.slice(); for (const p of this.gems) out[p] = 2; for (const p of this.monsters) out[p] = this.tick % 10 < 5 ? 1 : 0; out[this.player] = this.tick % 6 < 3 ? 2 : 0; return out; }
}

export class BomberGame extends LibraryGame {
  readonly id = 'helicopter-bomber'; buildings = new Uint8Array(10); x = 0; y = 1; bomb: { x: number; y: number } | null = null; private timer = 0; private laps = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.setLives(4); this.setup(); }
  private setup(): void { this.laps = 0; this.buildings = Uint8Array.from({ length: 10 }, () => this.rng.range(2, 5 + this.level)); this.x = 0; this.y = 1; this.bomb = null; this.timer = 0; }
  protected update(input: BrickInput): void {
    if (action(input) && !this.bomb) this.bomb = { x: this.x, y: this.y + 1 };
    this.timer++;
    if (this.timer % 4 === 0 && this.bomb) {
      this.bomb.y++; if (this.bomb.y >= 20 - this.buildings[this.bomb.x]!) { if (this.buildings[this.bomb.x]) { this.buildings[this.bomb.x]!--; this.addScore(10); this.emit({ type: 'explode' }); } this.bomb = null; }
    }
    if (!this.buildings.some(Boolean)) { this.win(() => this.setup()); return; }
    if (this.timer % (input.held.has('right') ? 4 : this.period(18, 7)) === 0) { if (++this.x >= 10) { this.x = 0; if(++this.laps % 2 === 0)this.y++; } }
    if (this.y >= 20 - this.buildings[this.x]!) this.lose(() => this.setup());
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); this.buildings.forEach((h, x) => { for (let y = 20 - h; y < 20; y++) put(out, x, y); }); put(out, this.x, this.y, 2); if (this.bomb) put(out, this.bomb.x, this.bomb.y, 2); return out; }
}

export { DiceGame } from '../dice';

// Keep directions exported alongside the pad order for guide illustrations.
export const PAD_ORDER = DIRS;
