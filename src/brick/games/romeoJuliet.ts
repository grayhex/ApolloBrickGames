/**
 * Owner: falling figures build a staircase for an automatic dot heading up/right to Juliet's column.
 * Owner (25 Oct 2026): the original starts every attempt with starting points that shrink with time, which pushes the player to finish the staircase fast.
 * The starting value and the pace are assumptions (`BONUS_START`, `BONUS_STEP_TICKS`): the counter shows what has been earned plus the starting points still left
 * (the counter can go down, and, as with Dice's bank, the record never drops below it), and reaching Juliet's column keeps whatever is left.
 */
import { BrickBase } from '../base';
import { emptyField } from '../grid';
import { Countdown, genuineTicks, Repeater } from '../timing';
import type { BrickGameDef, BrickGameOptions, BrickInput } from '../types';
import { makePiece, rotatePiece, type Piece } from './tetris/shapes';

/** Starting points of an attempt and the time per point (assumption: 500 points, one per half second — a minute and a half of building leaves about 320). */
export const BONUS_START = 500;
export const BONUS_STEP_TICKS = 30;

export class RomeoJulietGame extends BrickBase {
  readonly id = 'romeo-juliet';
  private board = emptyField();
  private hero = { x: 0, y: 19 };
  private piece: Piece = makePiece(1);
  private next: Piece = makePiece(1);
  private x = 3;
  private y = 0;
  private readonly fall = new Countdown(40);
  private readonly walk = new Countdown(12);
  private readonly repeat = new Repeater(10, 4);
  private banked = 0;
  private bonus = 0;
  private age = 0;
  constructor(options: BrickGameOptions = {}) { super(options, 1); this.init(); }
  protected reset(): void { this.banked = 0; this.setLives(4); this.prepare(); }
  private prepare(): void {
    this.board = emptyField(); this.hero = { x: 0, y: 19 };
    const height = 7 + Math.min(2, this.level - 1);
    for (let y = 20 - height; y < 20; y++) this.board[y * 10 + 9] = 1;
    this.repeat.reset(); this.walk.reset();
    this.bonus = BONUS_START; this.age = 0; this.show();
    this.next = this.randomPiece(); this.spawn();
  }
  /** Earned points go to `banked`; the counter shows them together with the starting points still left. */
  protected override addScore(points: number): void { this.banked += points; this.show(); }
  private show(): void { this.setScore(this.banked + this.bonus); }
  private randomPiece(): Piece { return makePiece(1 + this.rng.int(9)); } // two trominoes + seven tetrominoes
  private pieceCells(piece = this.piece, x = this.x, y = this.y): [number, number][] {
    return piece.cells.map(([cx, cy]) => [x + cx - piece.minX, y + piece.maxY - cy]);
  }
  private fits(piece: Piece, x: number, y: number): boolean {
    return this.pieceCells(piece, x, y).every(([cx, cy]) => cx >= 0 && cx < 9 && cy >= 0 && cy < 20 && !this.board[cy * 10 + cx]);
  }
  private spawn(): void {
    this.piece = this.next; this.next = this.randomPiece(); this.x = 3; this.y = 0;
    this.fall.reset(genuineTicks(this.speed, 700, 120));
    if (!this.fits(this.piece, this.x, this.y)) this.lose();
  }
  private lose(): void {
    this.emit({ type: 'crash' }); this.setLives((this.lives ?? 0) - 1);
    this.bonus = 0; this.show();
    if (this.lives === 0) this.gameOver();
    else this.animateKaboom(this.hero.x, this.hero.y, () => this.prepare());
  }
  private settle(): void {
    const cells = this.pieceCells();
    if (cells.some(([x, y]) => x === this.hero.x && y === this.hero.y)) { this.lose(); return; }
    for (const [x, y] of cells) this.board[y * 10 + x] = 1;
    this.emit({ type: 'lock' }); this.addScore(cells.length);
    this.spawn();
  }
  private climb(): void {
    const x = this.hero.x + 1, y = this.hero.y;
    const solid = (cx: number, cy: number): boolean => cy >= 0 && cy < 20 && !!this.board[cy * 10 + cx];
    // Wait for a built step; never walk across the empty bottom towards an unclimbable column.
    if (solid(x, y) && y > 0 && !solid(x, y - 1) && !solid(this.hero.x, y - 1)) this.hero = { x, y: y - 1 };
    else if (!solid(x, y) && solid(x, y + 1)) this.hero = { x, y };
    else return;
    this.addScore(10);
    if (x === 9) {
      this.addScore(100 + this.bonus); this.bonus = 0; this.show(); this.emit({ type: 'win' });
      this.animateClear(120, () => { this.nextLevel(); this.prepare(); });
    }
  }
  protected update(input: BrickInput): void {
    if (this.repeat.fire('left', input) && this.fits(this.piece, this.x - 1, this.y)) this.x--;
    if (this.repeat.fire('right', input) && this.fits(this.piece, this.x + 1, this.y)) this.x++;
    if (input.pressed.has('rotate') || input.pressed.has('up')) {
      const rotated = rotatePiece(this.piece);
      if (this.fits(rotated, this.x, this.y)) { this.piece = rotated; this.emit({ type: 'rotate' }); }
    }
    if (input.pressed.has('fire')) {
      while (this.fits(this.piece, this.x, this.y + 1)) this.y++;
      this.settle();
    } else if (this.repeat.fire('down', input) || this.fall.fire()) {
      if (this.fits(this.piece, this.x, this.y + 1)) { this.y++; this.emit({ type: 'step' }); }
      else this.settle();
    }
    if (!this.busy && this.walk.fire()) this.climb();
    if (!this.busy && this.bonus > 0 && ++this.age % BONUS_STEP_TICKS === 0) { this.bonus--; this.show(); }
  }
  protected draw(): Uint8Array {
    const out = this.board.slice();
    for (const [x, y] of this.pieceCells()) if (x >= 0 && x < 9 && y >= 0 && y < 20) out[y * 10 + x] = 1;
    out[this.hero.y * 10 + this.hero.x] = 2;
    return out;
  }
  protected override drawPreview(): Uint8Array {
    const out = new Uint8Array(16);
    for (const [x, y] of this.pieceCells(this.next, 0, 0)) out[y * 4 + x] = 1;
    return out;
  }
}
export const romeoJulietDef: BrickGameDef = {
  id: 'romeo-juliet', declaredModes: null,
  modes: [{ name: { ru: 'Лестница из фигур', en: 'Falling-piece stairway' }, note: 'Падающие фигуры, автоматическая точка и столбик справа — по владельцу и фото; стартовые очки убывают со временем, остаток достаётся в конце уровня (по владельцу). Высота шага, значения очков и темп — допущения.' }],
  create: (options) => new RomeoJulietGame(options),
};
