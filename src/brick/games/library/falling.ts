import { LibraryGame, put } from './common';
import { QUARTH_MODES } from './modes';
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

/**
 * Силуэт Quarth: прямоугольник, у которого колонки обрезаны снизу. `heights[i]` — высота колонки `x + i` (клетки от `top` вниз); выстрел прилипает под колонку,
 * поэтому полный прямоугольник получается добавлением клеток под короткими колонками (всего `Σ(max − высота)` выстрелов). Задачи собственные — набор из десяти уровней.
 */
export interface QuarthPiece { x: number; top: number; heights: readonly number[] }
export const QUARTH_LEVELS: readonly (readonly QuarthPiece[])[] = [
  [{ x: 3, top: 2, heights: [3, 2, 3, 3] }],
  [{ x: 2, top: 2, heights: [3, 2, 3, 2, 3] }],
  [{ x: 3, top: 2, heights: [4, 3, 2, 1] }],
  [{ x: 1, top: 2, heights: [2, 1, 2] }, { x: 6, top: 5, heights: [3, 2, 3] }],
  [{ x: 1, top: 2, heights: [2, 3, 3, 2, 2, 3] }],
  [{ x: 2, top: 1, heights: [3, 3, 3, 2, 3] }, { x: 3, top: 7, heights: [2, 1, 2, 2] }],
  [{ x: 1, top: 2, heights: [4, 3, 4, 2, 4, 3, 4] }],
  [{ x: 0, top: 1, heights: [2, 1, 2] }, { x: 4, top: 1, heights: [3, 1, 3, 2] }, { x: 2, top: 7, heights: [2, 2, 1, 2, 2] }],
  [{ x: 2, top: 1, heights: [5, 4, 3, 2, 3, 4] }],
  [{ x: 0, top: 1, heights: [3, 2, 3, 1, 3] }, { x: 6, top: 1, heights: [2, 1, 2, 2] }, { x: 1, top: 8, heights: [3, 3, 2, 3, 1, 3, 3] }],
];
export class QuarthGame extends LibraryGame {
  readonly id = 'quarth'; board = new Uint8Array(200); x = 4; private timer = 0; private cooldown = 0;
  constructor(o: BrickGameOptions = {}) { super(o, QUARTH_MODES.length); this.flipped = this.mode === 1; this.init(); } // вариант 02 — «invert»
  protected reset(): void { this.setLives(4); this.setup(); }
  private setup(): void {
    this.board.fill(0); this.timer = this.cooldown = 0; this.repeat.reset();
    // Уровень выбирает силуэт; после десятого они повторяются. Каждый силуэт — прямоугольник с обрезанными снизу колонками (см. QUARTH_LEVELS).
    for (const piece of QUARTH_LEVELS[(this.level - 1) % QUARTH_LEVELS.length]!) piece.heights.forEach((height, i) => { for (let dy = 0; dy < height; dy++) this.board[(piece.top + dy) * 10 + piece.x + i] = 1; });
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

/**
 * Капсулы и колонны на поле 4 × 9 (клетки `y * 4 + x`), типы 1–3 — узоры в 2 × 2.
 * Три профиля с общим вычислением, но разными правилами:
 * - `dr-mario`: капсула из двух половинок со связью — пока цела обе, падают вместе; повернуть можно в четыре положения (порядок цветов сохраняется);
 *   после посадки: падение несвязанного → совпадения от четырёх подряд по горизонтали и вертикали → падение оставшегося → … до покоя. Вирусы неподвижны.
 * - `columns`: тройка падает вертикально, поворот меняет порядок; совпадения от четырёх, в том числе по диагонали, оседают поклеточно.
 * - `columns-flicker`: как `columns`, но совпадение — от трёх, а мигающие клетки неподвижны и должны исчезнуть.
 * Порядок после посадки одинаков у всех: падение → совпадения → падение → … пока что-то удаляется.
 */
export class CapsuleGame extends LibraryGame {
  readonly id: 'dr-mario' | 'columns' | 'columns-flicker'; board = new Uint8Array(36); viruses = new Set<number>(); piece: number[] = []; x = 1; y = 0;
  /** Положение падающей фигуры: 0 — по горизонтали (первая половина слева), 1 — по вертикали (первая сверху), 2 и 3 — то же с обратным порядком; у колонн только вертикальное. */
  orientation = 0;
  /** Связь половинок капсулы после посадки: клетка → индекс второй половинки или −1. Только у `dr-mario`. */
  link = new Int8Array(36).fill(-1);
  private timer = 0;
  constructor(id: CapsuleGame['id'], o: BrickGameOptions = {}) { super(o); this.id = id; this.init(); }
  /** Фигура лежит горизонтально (только у капсулы). */
  get horizontalPiece(): boolean { return this.orientation % 2 === 0 && this.id === 'dr-mario'; }
  protected reset(): void { this.repeat.reset(); this.board.fill(0); this.link.fill(-1); this.viruses.clear(); this.timer = 0;
    if (this.id !== 'columns') for (const p of this.rng.shuffled(Array.from({ length: 12 }, (_, i) => i + 24)).slice(0, Math.min(10, this.level + 2))) { this.viruses.add(p); this.board[p] = this.rng.range(1,3); }
    this.spawn();
  }
  private spawn(): void { this.piece = Array.from({ length: this.id === 'dr-mario' ? 2 : 3 }, () => this.rng.range(1,3)); this.x = 1; this.y = 0; this.orientation = this.id === 'dr-mario' ? 0 : 1; this.timer = 0; if (!this.fits(this.x, this.y, this.orientation)) this.gameOver(); }
  /** Клетки фигуры в порядке половинок/гемов `piece`. */
  private positions(x = this.x, y = this.y, orientation = this.orientation): number[] {
    const n = this.piece.length, flip = orientation >= 2;
    return this.piece.map((_, i) => { const k = flip ? n - 1 - i : i; return orientation % 2 === 0 ? y * 4 + x + k : (y + k) * 4 + x; });
  }
  /** Клетки падающей фигуры с цветами (для проверок и рисунка). */
  capsuleCells(): { cell: number; color: number }[] { return this.positions().map((cell, i) => ({ cell, color: this.piece[i]! })); }
  private fits(x: number, y: number, orientation: number): boolean {
    const flat = orientation % 2 === 0, n = this.piece.length;
    return x >= 0 && y >= 0 && x + (flat ? n : 1) <= 4 && y + (flat ? 1 : n) <= 9 && this.positions(x, y, orientation).every((p) => !this.board[p]);
  }
  protected update(input: BrickInput): void {
    const nextX = this.horizontal(input, this.x, 3); if (this.fits(nextX, this.y, this.orientation)) this.x = nextX;
    if (input.pressed.has('rotate') || input.pressed.has('up')) {
      if (this.id === 'dr-mario') {
        const next = (this.orientation + 1) % 4;
        if (this.fits(this.x, this.y, next)) { this.orientation = next; this.emit({ type: 'rotate' }); } else this.emit({ type: 'blocked' }); // у стенки поворот не сдвигает фигуру: отскок не восстановлен
      } else this.piece.unshift(this.piece.pop()!);
    }
    const hard = input.pressed.has('fire'); if (hard) while (this.fits(this.x, this.y + 1, this.orientation)) this.y++;
    if (!hard && ++this.timer < (input.held.has('down') ? 3 : this.period(45, 10))) return; this.timer = 0;
    if (this.fits(this.x, this.y + 1, this.orientation)) { this.y++; return; }
    const cells = this.positions();
    cells.forEach((p, i) => { this.board[p] = this.piece[i]!; });
    if (this.id === 'dr-mario') { this.link[cells[0]!] = cells[1]!; this.link[cells[1]!] = cells[0]!; }
    this.emit({ type: 'lock' }); this.resolve();
    if (this.id !== 'columns' && !this.viruses.size) this.win(() => this.reset()); else this.spawn();
  }
  /** Одна клетка или связанная пара падает на одну строку, если под ней пусто (под второй половинкой — тоже). Вирусы не двигаются. */
  private settle(): boolean {
    let movedAny = false;
    for (let moved = true; moved;) {
      moved = false;
      for (let p = 31; p >= 0; p--) {
        if (!this.board[p] || this.viruses.has(p)) continue;
        const partner = this.link[p]!;
        // Пару двигает нижняя из половинок: верхнюю пропускаем, пока не обработана нижняя (обход идёт снизу вверх).
        if (partner >= 0 && partner > p && Math.floor(partner / 4) === Math.floor(p / 4) + 1) continue;
        const unit = partner >= 0 ? [p, partner] : [p];
        if (!unit.every((c) => c + 4 < 36 && (!this.board[c + 4] || unit.includes(c + 4)))) continue;
        if (partner >= 0) this.link[p] = this.link[partner] = -1;
        for (const c of unit.sort((a, b) => b - a)) { this.board[c + 4] = this.board[c]!; this.board[c] = 0; }
        if (partner >= 0) { this.link[p + 4] = partner + 4; this.link[partner + 4] = p + 4; }
        moved = movedAny = true;
      }
    }
    return movedAny;
  }
  resolve(): void {
    // Ограниченный каскад: каждый проход удаляет хотя бы одну клетку, иначе выходим.
    this.settle();
    for (let pass = 0; pass < 36; pass++) {
      const remove = new Set<number>(), threshold = this.id === 'columns-flicker' ? 3 : 4;
      const axes = this.id === 'dr-mario' ? [[1,0],[0,1]] : [[1,0],[0,1],[1,1],[-1,1]];
      for (let p = 0; p < 36; p++) if (this.board[p]) for (const [dx,dy] of axes) {
        const run: number[] = []; let x = p % 4, y = Math.floor(p / 4);
        while (x >= 0 && x < 4 && y >= 0 && y < 9 && this.board[y * 4 + x] === this.board[p]) { run.push(y * 4 + x); x += dx!; y += dy!; }
        if (run.length >= threshold) run.forEach((n) => remove.add(n));
      }
      if (!remove.size) break;
      for (const p of remove) { this.board[p] = 0; this.viruses.delete(p); const partner = this.link[p]!; if (partner >= 0) this.link[partner] = -1; this.link[p] = -1; }
      this.addScore(remove.size * 10); this.emit({ type: 'lines', count: 1 });
      this.settle();
    }
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200); const render = (p: number, type: number, blink: boolean): void => { if (!type) return; const x = p % 4 * 2 + 1, y = Math.floor(p / 4) * 2 + 1, v = blink ? 2 : 1; put(out,x,y,v); if (type >= 2) put(out,x+1,y+1,v); if (type === 3) { put(out,x+1,y,v); put(out,x,y+1,v); } };
    this.board.forEach((v,p) => render(p,v,this.viruses.has(p))); this.positions().forEach((p,i) => render(p,this.piece[i]!,false)); return out;
  }
}
