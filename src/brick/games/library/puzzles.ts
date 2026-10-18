import { LibraryGame, action, DX, DY, put } from './common';
import type { BrickGameOptions, BrickInput } from '../../types';
import { SOKOBAN_LEVELS } from './sokobanLevels';

export function toggleLights(board: Uint8Array, x: number, y: number): void {
  for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const xx = x + (dx ?? 0), yy = y + (dy ?? 0);
    if (xx >= 0 && xx < 10 && yy >= 0 && yy < 10) board[yy * 10 + xx] = 1 - (board[yy * 10 + xx] ?? 0);
  }
}
export class LightsGame extends LibraryGame {
  readonly id = 'lights-out'; board = new Uint8Array(100); x = 0; y = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.repeat.reset(); this.setup(); }
  private setup(): void {
    this.board.fill(0); this.x = this.y = 0;
    // Applying legal moves to an empty board guarantees a solvable puzzle.
    for (let i = 0; i < 3 + this.level; i++) toggleLights(this.board, this.rng.int(10), this.rng.int(10));
    if (!this.board.some(Boolean)) toggleLights(this.board, 4, 4);
  }
  protected update(input: BrickInput): void {
    const d = this.direction(input);
    if (d >= 0) { this.x = Math.max(0, Math.min(9, this.x + DX[d]!)); this.y = Math.max(0, Math.min(9, this.y + DY[d]!)); }
    if (action(input)) { toggleLights(this.board, this.x, this.y); this.emit({ type: 'rotate' }); if (!this.board.some(Boolean)) this.win(() => this.setup()); }
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); out.set(this.board, 40); put(out, this.x, this.y + 4, this.tick % 12 < 6 ? 2 : 0); return out; }
}

export class SokobanGame extends LibraryGame {
  readonly id = 'sokoban'; walls = new Set<number>(); crates = new Set<number>(); goals = new Set<number>(); player = 0;
  private history: { player: number; crates: number[] }[] = [];
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.repeat.reset(); this.setup(); }
  /** Задача уровня `level` из десяти собственных (`sokobanLevels.ts`, с проверенными решениями); после десятой они повторяются. Карта стоит по центру, с четвёртой строки. */
  private setup(): void {
    this.walls.clear(); this.crates.clear(); this.goals.clear(); this.history = [];
    const rows = SOKOBAN_LEVELS[(this.level - 1) % SOKOBAN_LEVELS.length]!.map;
    const ox = Math.floor((10 - Math.max(...rows.map((r) => r.length))) / 2);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const p = (4 + y) * 10 + ox + x;
      if (ch === '#') this.walls.add(p);
      if (ch === '$' || ch === '*') this.crates.add(p);
      if (ch === '.' || ch === '*' || ch === '+') this.goals.add(p);
      if (ch === '@' || ch === '+') this.player = p;
    }));
  }
  protected update(input: BrickInput): void {
    if (input.pressed.has('fire')) { this.setup(); return; }
    if (input.pressed.has('rotate')) { const last = this.history.pop(); if (last) { this.player = last.player; this.crates = new Set(last.crates); } return; }
    const d = this.direction(input); if (d < 0) return;
    const delta = DX[d]! + DY[d]! * 10, to = this.player + delta;
    if (this.walls.has(to)) return;
    const push = this.crates.has(to), beyond = to + delta;
    if (push && (this.walls.has(beyond) || this.crates.has(beyond))) { this.emit({ type: 'blocked' }); return; }
    this.history.push({ player: this.player, crates: [...this.crates] }); if (this.history.length > 200) this.history.shift();
    if (push) { this.crates.delete(to); this.crates.add(beyond); }
    this.player = to; this.emit({ type: 'move' });
    if ([...this.goals].every((p) => this.crates.has(p))) this.win(() => this.setup());
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200); for (const p of this.walls) out[p] = 1;
    for (const p of this.goals) out[p] = 2; for (const p of this.crates) out[p] = 1; out[this.player] = this.tick % 12 < 6 ? 2 : 0; return out;
  }
}

export const PEG_HOLES = Array.from({ length: 49 }, (_, p) => p).filter((p) => (p % 7 >= 2 && p % 7 <= 4) || (Math.floor(p / 7) >= 2 && Math.floor(p / 7) <= 4));
export class SolitaireGame extends LibraryGame {
  readonly id = 'peg-solitaire'; pegs = new Set<number>(); cursor = 24; selected: number | null = null;
  /** Счёт на начало текущей задачи: повтор возвращает его, поэтому «прыжок → повтор» не копит очки. Рекорд не уменьшается — он хранит лучшую попытку. */
  private checkpoint = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.pegs = new Set(PEG_HOLES.filter((p) => p !== 24)); this.cursor = 24; this.selected = null; this.repeat.reset(); this.checkpoint = this.score; }
  protected update(input: BrickInput): void {
    const d = this.direction(input);
    if (d >= 0) { const x = this.cursor % 7 + DX[d]!, y = Math.floor(this.cursor / 7) + DY[d]!; if (x >= 0 && x < 7 && y >= 0 && y < 7) this.cursor = y * 7 + x; }
    if (input.pressed.has('fire')) { this.setScore(this.checkpoint); this.reset(); return; }
    if (!input.pressed.has('rotate')) return;
    if (this.pegs.has(this.cursor)) { this.selected = this.cursor; return; }
    if (this.selected === null || !PEG_HOLES.includes(this.cursor)) return;
    const dx = this.cursor % 7 - this.selected % 7, dy = Math.floor(this.cursor / 7) - Math.floor(this.selected / 7);
    const middle = (this.cursor + this.selected) / 2;
    if ((Math.abs(dx) === 2 && dy === 0 || Math.abs(dy) === 2 && dx === 0) && this.pegs.has(middle)) {
      this.pegs.delete(this.selected); this.pegs.delete(middle); this.pegs.add(this.cursor); this.selected = null; this.addScore(10);
      if (this.pegs.size === 1) this.win(() => this.reset());
      else if (![...this.pegs].some((p) => [1, -1, 7, -7].some((delta) => {
        const to = p + delta * 2;
        return PEG_HOLES.includes(to) && Math.abs(to % 7 - p % 7) + Math.abs(Math.floor(to / 7) - Math.floor(p / 7)) === 2 && this.pegs.has(p + delta) && !this.pegs.has(to);
      }))) this.gameOver();
    } else this.emit({ type: 'blocked' });
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200); for (const p of this.pegs) put(out, p % 7 + 1, Math.floor(p / 7) + 6, p === this.selected ? 2 : 1);
    put(out, this.cursor % 7 + 1, Math.floor(this.cursor / 7) + 6, this.tick % 12 < 6 ? 2 : 0); return out;
  }
}

export function reversiFlips(board: Int8Array, p: number, side: number): number[] {
  if (board[p] !== 0) return [];
  const all: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const ray: number[] = []; let x = p % 8 + dx, y = Math.floor(p / 8) + dy;
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && board[y * 8 + x] === -side) { ray.push(y * 8 + x); x += dx; y += dy; }
    if (ray.length && x >= 0 && x < 8 && y >= 0 && y < 8 && board[y * 8 + x] === side) all.push(...ray);
  }
  return all;
}
export class ReversiGame extends LibraryGame {
  readonly id = 'reversi'; board = new Int8Array(64); cursor = 19; private reply = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.board.fill(0); this.board[27] = this.board[36] = -1; this.board[28] = this.board[35] = 1; this.cursor = 19; this.reply = 0; this.repeat.reset(); }
  private moves(side: number): number[] { return Array.from({ length: 64 }, (_, p) => p).filter((p) => reversiFlips(this.board, p, side).length); }
  private place(p: number, side: number): void { for (const f of reversiFlips(this.board, p, side)) this.board[f] = side; this.board[p] = side; this.emit({ type: 'lock' }); }
  private finish(): boolean {
    if (this.moves(1).length || this.moves(-1).length) return false;
    const mine = this.board.filter((v) => v === 1).length, theirs = this.board.filter((v) => v === -1).length;
    this.addScore(mine); if (mine > theirs) this.emit({ type: 'win' }); this.gameOver(); return true;
  }
  protected update(input: BrickInput): void {
    if (this.reply > 0) {
      if (--this.reply) return;
      const moves = this.moves(-1).sort((a, b) => reversiFlips(this.board, b, -1).length - reversiFlips(this.board, a, -1).length);
      if (moves[0] !== undefined) this.place(moves[0], -1);
      if (!this.finish() && !this.moves(1).length) this.reply = 30;
      return;
    }
    const d = this.direction(input);
    if (d >= 0) this.cursor = Math.max(0, Math.min(7, Math.floor(this.cursor / 8) + DY[d]!)) * 8 + Math.max(0, Math.min(7, this.cursor % 8 + DX[d]!));
    if (action(input)) {
      if (!reversiFlips(this.board, this.cursor, 1).length) { this.emit({ type: 'blocked' }); return; }
      this.place(this.cursor, 1); if (!this.finish()) this.reply = 30;
    }
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200); this.board.forEach((v, p) => { if (v) put(out, p % 8 + 1, Math.floor(p / 8) + 5, v === 1 ? 1 : 2); });
    put(out, this.cursor % 8 + 1, Math.floor(this.cursor / 8) + 5, this.tick % 12 < 6 ? 1 : 0); return out;
  }
}

/** Наибольший показатель степени плитки: на поле 4 × 4 больше 2^17 не собрать; плитки с этим показателем не сливаются (определённое поведение на пределе). */
export const MAX_TILE_EXPONENT = 17;
export function slideTiles(line: readonly number[]): { cells: number[]; score: number } {
  const packed = line.filter(Boolean), cells: number[] = []; let score = 0;
  for (let i = 0; i < packed.length; i++) {
    let value = packed[i]!; if (packed[i + 1] === value && value < MAX_TILE_EXPONENT) { value++; i++; score += 2 ** value; } cells.push(value);
  }
  while (cells.length < line.length) cells.push(0); return { cells, score };
}
/** Клетки плитки с показателем степени `exponent` (1…17) в рамке 2 × 4: `[столбец, строка]`. */
export function tileGlyph(exponent: number): [number, number][] {
  const cells: [number, number][] = [];
  const tall = exponent >= 16;
  for (let b = 0; b < 4; b++) {
    if (!(tall && b === 3)) cells.push([0, b]);
    if (exponent & (1 << b)) cells.push([1, b]);
  }
  return cells;
}
export class MergeGame extends LibraryGame {
  readonly id = '2048'; board = new Uint8Array(16); private won = false;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.board.fill(0); this.won = false; this.spawn(); this.spawn(); }
  private spawn(): void { const free = Array.from({ length: 16 }, (_, p) => p).filter((p) => !this.board[p]); if (free.length) this.board[this.rng.pick(free)] = this.rng.chance(0.9) ? 1 : 2; }
  protected update(input: BrickInput): void {
    const d = this.tap(input); if (d < 0) return; const before = this.board.slice();
    for (let n = 0; n < 4; n++) {
      const positions = Array.from({ length: 4 }, (_, i) => d === 0 ? i * 4 + n : d === 2 ? (3 - i) * 4 + n : d === 3 ? n * 4 + i : n * 4 + 3 - i);
      const moved = slideTiles(positions.map((p) => this.board[p]!)); positions.forEach((p, i) => { this.board[p] = moved.cells[i]!; }); this.addScore(moved.score);
    }
    if (before.some((v, p) => v !== this.board[p])) { this.spawn(); this.emit({ type: 'move' }); }
    if (!this.won && this.board.some((v) => v >= 11)) { this.won = true; this.emit({ type: 'win' }); }
    if (this.board.every(Boolean) && this.board.every((v, p) => (p % 4 === 3 || this.board[p + 1] !== v) && (p >= 12 || this.board[p + 4] !== v))) this.gameOver();
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200);
    // Плитка 2 × 4: слева полоса (четыре клетки; у показателей 16 и 17 — три, нижняя погашена), справа четыре двоичных разряда младших бит показателя.
    // Всё горит постоянно (не мигает), поэтому в обеих фазах мигания экрана плитки различимы; для 1…17 рисунки не повторяются (см. tileGlyph).
    this.board.forEach((v, p) => { if (!v) return; const x = p % 4 * 2 + 1, y = Math.floor(p / 4) * 5;
      for (const [dx, dy] of tileGlyph(v)) put(out, x + dx, y + dy, 1);
    }); return out;
  }
}

export class FillGame extends LibraryGame {
  readonly id = 'fill-connect'; path: number[] = [0]; remaining = 3600; private awarded = new Set([0]);
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.path = [0]; this.awarded = new Set([0]); this.remaining = Math.max(900, 3600 - this.level * 120); this.repeat.reset(); }
  protected update(input: BrickInput): void {
    if (--this.remaining <= 0) { this.gameOver(); return; }
    if (action(input) && this.path.length > 1) this.path.pop();
    const d = this.direction(input); if (d < 0) return;
    const last = this.path.at(-1)!, x = last % 8 + DX[d]!, y = Math.floor(last / 8) + DY[d]!;
    if (x < 0 || x >= 8 || y < 0 || y >= 8) return; const p = y * 8 + x;
    if (this.path.includes(p)) return; this.path.push(p); if (!this.awarded.has(p)) { this.awarded.add(p); this.addScore(1); }
    if (this.path.length === 64) this.win(() => this.reset());
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); for (const p of this.path) put(out, p % 8 + 1, Math.floor(p / 8) + 5, p === this.path.at(-1) ? 2 : 1); for (let x = 0; x < Math.ceil(this.remaining / 360); x++) put(out, x, 1); return out; }
}

export class MazeGame extends LibraryGame {
  readonly id = 'maze'; walls = new Uint8Array(200); player = 171; goal = 17;
  remaining = 900; round = 0;
  get seconds(): number { return Math.max(6, 15 - this.round); }
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.round = this.startLevel - 1 + (this.startSpeed - 1) * 10; this.repeat.reset(); this.setup(); }
  private setup(): void {
    this.walls.fill(1); this.player = 171; this.goal = 17;
    const visited = new Set([this.player]), stack = [this.player]; this.walls[this.player] = 0;
    while (stack.length) {
      const p = stack.at(-1)!, choices = [0,1,2,3].filter((d) => { const x = p % 10 + DX[d]! * 2, y = Math.floor(p / 10) + DY[d]! * 2; return x >= 1 && x <= 7 && y >= 1 && y <= 17 && !visited.has(y * 10 + x); });
      if (!choices.length) { stack.pop(); continue; }
      const d = this.rng.pick(choices), delta = DX[d]! + DY[d]! * 10, to = p + delta * 2;
      this.walls[p + delta] = this.walls[to] = 0; visited.add(to); stack.push(to);
    }
    // Short clocks must still allow a human route: open useful shortcuts, keeping
    // the full connected maze and its dead ends. Never generate an impossible sprint.
    const distance = (): number => {
      const queue = [this.player], dist = new Map([[this.player, 0]]);
      for (const p of queue) {
        if (p === this.goal) return dist.get(p)!;
        for (const delta of [-10, 10, -1, 1]) if (this.walls[p + delta] === 0 && !dist.has(p + delta)) {
          dist.set(p + delta, dist.get(p)! + 1); queue.push(p + delta);
        }
      }
      return Infinity;
    };
    let length = distance();
    const limit = Math.max(26, Math.floor(this.seconds * 3.5));
    const shortcuts = this.rng.shuffled(Array.from({length: 200}, (_,p)=>p).filter(p=>{
      const x=p%10,y=Math.floor(p/10);
      return x>0&&x<8&&y>0&&y<18&&this.walls[p]===1;
    }));
    for (const p of shortcuts) {
      if (length <= limit) break;
      this.walls[p]=0;const next=distance();
      if(next<length)length=next;else this.walls[p]=1;
    }
    this.remaining = this.seconds * 60;
  }
  protected update(input: BrickInput): void {
    if (--this.remaining <= 0) { this.gameOver(); return; }
    if (this.remaining <= 180 && this.remaining % 60 === 0) this.emit({type:'tone',pad:0,ticks:6});
    const d = this.direction(input); if (d < 0) return;
    const to = this.player + DX[d]! + DY[d]! * 10;
    if (this.walls[to] !== 0) { this.emit({ type:'blocked' }); return; }
    this.player = to; this.emit({type:'move'});
    if (to === this.goal) {
      this.addScore(100 * (this.round + 1) + 5 * Math.ceil(this.remaining / 60)); this.emit({type:'win'});
      this.animateClear(60,()=>{this.round++;this.nextLevel();this.repeat.reset();this.setup();});
    }
  }
  protected draw(): Uint8Array {
    const out = this.walls.slice(); out[this.player] = 2; out[this.goal] = this.tick % 12 < 6 ? 1 : 0;
    for(let y=0;y<20;y++)out[y*10+9]=0;
    for(let s=0;s<Math.ceil(this.remaining/60);s++)put(out,9,17-s,this.remaining<=180?2:1);
    return out;
  }
}

/**
 * A small packing puzzle. Pieces come from a known partition, so each board has a solution.
 * Управление: стрелки двигают фигуру, ROTATE поворачивает, **«огонь» укладывает** (с DOWN — задача заново). Укладка требует отдельной кнопки «огонь»,
 * которой на корпусах игрушек 1–4 нет (RESET корпуса — выход в меню, не огонь), поэтому игра объявлена с `needs: ['fire']` и игрушке не назначается
 * (проверка в схеме конфигурации и в списке админки): обходных способов — удержания, сочетаний, клавиатуры — не придумано, это не аутентично.
 */
export class JigsawGame extends LibraryGame {
  readonly id = 'jigsaw'; board = new Uint8Array(16); pieceIndex = 0; shape: number[][] = []; x = 0; y = 0;
  private pieces: number[][][] = [];
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.repeat.reset(); this.setup(); }
  private setup(): void {
    this.board.fill(0); this.pieceIndex = 0;
    // Four L tetrominoes tile a 4×4 square; two paired 2×4 rectangles give the construction.
    this.pieces = this.rng.shuffled([[[0,0],[0,1],[0,2],[1,2]], [[0,0],[1,0],[1,1],[1,2]], [[0,0],[0,1],[0,2],[1,2]], [[0,0],[1,0],[1,1],[1,2]]]);
    this.next();
  }
  private next(): void { this.shape = this.pieces[this.pieceIndex]!.map((p) => [...p]); this.x = this.y = 0; }
  protected update(input: BrickInput): void {
    if (input.pressed.has('fire') && input.held.has('down')) { this.setup(); return; }
    const d = this.direction(input); if (d >= 0) { this.x = Math.max(0,Math.min(3,this.x + DX[d]!)); this.y = Math.max(0,Math.min(3,this.y + DY[d]!)); }
    if (input.pressed.has('rotate')) {
      const turned = this.shape.map(([x,y]) => [-y!,x!]); const minX = Math.min(...turned.map((p) => p[0]!)), minY = Math.min(...turned.map((p) => p[1]!)); this.shape = turned.map(([x,y]) => [x!-minX,y!-minY]);
    }
    if (!input.pressed.has('fire')) return;
    const cells = this.shape.map(([x,y]) => [this.x+x!,this.y+y!]);
    if (cells.some(([x,y]) => x! >= 4 || y! >= 4 || this.board[y!*4+x!])) { this.emit({ type:'blocked' }); return; }
    for (const [x,y] of cells) this.board[y!*4+x!] = 1;
    if (++this.pieceIndex === this.pieces.length) this.win(() => this.setup()); else this.next();
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200);
    const block = (x: number,y: number,v: number): void => { if (x >= 4 || y >= 4) return; for (let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) put(out,x*2+1+dx,y*2+6+dy,v); };
    this.board.forEach((v,p) => { if(v) block(p%4,Math.floor(p/4),1); }); for(const [x,y] of this.shape) block(this.x+x!,this.y+y!,2); return out; }
}
