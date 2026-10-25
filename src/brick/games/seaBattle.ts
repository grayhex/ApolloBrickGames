/**
 * Classic blind fleet battle. Two 10×10 boards match the owner's photo; timing/scoring are project choices.
 * Every shot (yours and the opponent's) plays the turn scene recorded from the original (`game-a.MOV`, owner: the video is gameplay, not a title screen):
 * a ship with a mine above it, then the ship vanishes and the cross-shaped mine falls onto the field. The result is applied when the scene ends.
 */
import { BrickBase } from '../base';
import { emptyField } from '../grid';
import { Repeater } from '../timing';
import { Rng } from '../rng';
import { SEA_SHOT, SEA_SHOT_CROSS_COLUMN, SEA_SHOT_LAND_TICK, SEA_SHOT_SHIP_TICKS } from '../seaAnimations';
import { BRICK_COLS, type BrickGameDef, type BrickGameOptions, type BrickInput } from '../types';

/** Ticks of the playing field shown before the scene (the sound of the shot starts here: on the video the burst is ≈ 0.35 s ahead of the picture changing). */
export const SHOT_LEAD_TICKS = 20;
/** Pause after your shot before the opponent answers. */
const REPLY_TICKS = 12;

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
  private animating = false;
  private readonly repeat = new Repeater(10, 4);
  constructor(options: BrickGameOptions = {}) { super(options, 1); this.init(); }
  protected reset(): void { this.prepare(); }
  private prepare(): void {
    this.own = placeFleet(this.rng); this.enemy = placeFleet(this.rng);
    this.ownShots.fill(0); this.enemyShots.fill(0); this.x = 0; this.y = 0; this.reply = 0; this.animating = false; this.repeat.reset();
  }
  private sunk(board: Uint8Array, shots: Uint8Array, id: number): boolean {
    return board.every((value, i) => value !== id || shots[i] !== 0);
  }
  private defeated(board: Uint8Array, shots: Uint8Array): boolean {
    return board.every((value, i) => !value || shots[i] !== 0);
  }
  /** The recorded scene over the live field: rows above the field's lower part come from the video with the mine moved over column `column`, the lower rows are the live board. */
  private sceneFrame(elapsed: number, column: number): Uint8Array {
    const board = this.draw();
    const t = elapsed - SHOT_LEAD_TICKS;
    if (t < 0) return board;
    const clip = SEA_SHOT.at(Math.min(t, SEA_SHOT.total - 1)).cells;
    const falling = t >= SEA_SHOT_SHIP_TICKS;
    const moved = Math.min(BRICK_COLS - 2, Math.max(1, column)) - SEA_SHOT_CROSS_COLUMN;
    const out = clip.slice();
    // The mine is the only thing above row 8 while the ship is shown and above row 14 while it falls: shift just those rows.
    const shifted = falling ? 14 : 8;
    for (let y = 0; y < shifted; y++)
      for (let x = 0; x < BRICK_COLS; x++) out[y * BRICK_COLS + x] = clip[y * BRICK_COLS + x - moved] && x - moved >= 0 && x - moved < BRICK_COLS ? 1 : 0;
    if (falling) out.set(board.subarray(14 * BRICK_COLS), 14 * BRICK_COLS);
    return out;
  }

  /** One turn scene: `hit`/`sunk` are known in advance, the result (marks, score) is applied by `resolve` when the scene ends. */
  private shoot(column: number, hit: boolean, sunk: boolean, resolve: () => void): void {
    const total = SHOT_LEAD_TICKS + SEA_SHOT.total;
    this.animating = true;
    this.cutscene(
      total,
      (elapsed) => {
        if (elapsed === 0) this.emit({ type: 'launch' });
        if (elapsed === SHOT_LEAD_TICKS + SEA_SHOT_LAND_TICK) {
          // On the recording a ship that goes down is a noise burst instead of the rising "drop" heard for every other result.
          this.emit({ type: sunk ? 'explode' : hit ? 'hit' : 'shot' });
        }
        this.overlay = this.sceneFrame(elapsed, column);
      },
      () => { this.animating = false; resolve(); },
    );
  }

  private opponentShoots(): void {
    // Opponent samples untried coordinates only, without inspecting the hidden fleet.
    const available = Array.from({ length: 100 }, (_, i) => i).filter((i) => !this.enemyShots[i]);
    const cell = available[this.rng.int(available.length)];
    if (cell === undefined) return;
    const id = this.own[cell] ?? 0;
    const sunk = id > 0 && this.own.every((value, i) => value !== id || i === cell || this.enemyShots[i] !== 0);
    this.shoot(cell % 10, id > 0, sunk, () => {
      this.enemyShots[cell] = 1;
      if (this.defeated(this.own, this.enemyShots)) this.gameOver();
    });
  }

  protected update(input: BrickInput): void {
    if (this.reply > 0) {
      if (--this.reply === 0) this.opponentShoots();
      return;
    }
    if (this.repeat.fire('left', input)) this.x = (this.x + 9) % 10;
    if (this.repeat.fire('right', input)) this.x = (this.x + 1) % 10;
    if (this.repeat.fire('up', input)) this.y = (this.y + 9) % 10;
    if (this.repeat.fire('down', input)) this.y = (this.y + 1) % 10;
    if (!input.pressed.has('rotate') && !input.pressed.has('fire')) return;
    const cell = this.y * 10 + this.x;
    if (this.ownShots[cell]) { this.emit({ type: 'blocked' }); return; }
    const ship = this.enemy[cell] ?? 0;
    const sunk = ship > 0 && this.enemy.every((value, i) => value !== ship || i === cell || this.ownShots[i] !== 0);
    this.shoot(this.x, ship > 0, sunk, () => {
      this.ownShots[cell] = 1;
      if (ship) { this.addScore(10); if (sunk) this.addScore(50); }
      if (this.defeated(this.enemy, this.ownShots)) {
        this.addScore(100); this.emit({ type: 'win' });
        this.animateClear(120, () => { this.nextLevel(); this.prepare(); });
      } else this.reply = REPLY_TICKS;
    });
  }
  protected draw(): Uint8Array {
    const out = emptyField();
    for (let i = 0; i < 100; i++) {
      out[i] = this.own[i] ? (this.enemyShots[i] ? 2 : 1) : 0;
      out[100 + i] = this.ownShots[i] ? (this.enemy[i] ? 2 : 0) : 1;
    }
    // Fast cursor pulse differs from the renderer's slower blinking hit markers.
    if (this.reply === 0 && !this.animating) out[100 + this.y * 10 + this.x] = this.tick % 12 < 6 ? 0 : 1;
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
  modes: [{ name: { ru: 'Скрытый флот', en: 'Hidden fleet' }, note: 'Два поля и поочерёдные выстрелы — по владельцу; после каждого выстрела сцена с кораблём и падающей миной-крестом (по записи оригинала). Состав флота, автопостановка, темп и очки — выбор проекта.' }],
  create: (options) => new SeaBattleGame(options),
};
