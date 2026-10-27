import { BRICK_GAMES } from '../brick/games';
import { TetrisCore } from '../brick/games/tetris/core';
import { variantOf } from '../brick/games/tetris/variants';
import { FIRST_PENTOMINO, FIRST_SUPER, SHAPE_NONE, makePiece, rotatePiece, type Piece } from '../brick/games/tetris/shapes';
import { E88Blocks } from './e88-blocks';
import { B0302Racing } from './b0302-racing';
import { E23Array } from './e23-array';
import type { BrickGameDef, BrickGameOptions } from '../brick/types';
import type { NativeEntry } from './catalog';

/** B0302 mode 03: observed at 690 kHz with 5 ms LCD sampling, speeds 0–9. */
export const B0302_BLOCK_FALL_MS = [445.18,355.15,340.15,295.13,265.12,235.1,220.11,192.59,165.05,135.04] as const;

/** Native profiles use the common collision/line engine; they never change old toy factories. */
class NativeBlocks extends TetrisCore {
  readonly id = 'tetris';
  private readonly flipped: boolean;
  constructor(options: BrickGameOptions, flipped = false) {
    super(options, [variantOf('I', 1)]);
    this.flipped = flipped;
    this.init();
  }
  protected override rowOf(y: number): number { return this.flipped ? y : super.rowOf(y); }
  protected override drawPreview(): Uint8Array { const out=super.drawPreview(); return this.flipped ? Uint8Array.from(Array.from({length:16},(_,i)=>out[(3-Math.floor(i/4))*4+i%4]!)) : out; }
}
/** B0302 has a 17-row well; timing and variant rules are investigated separately. */
class B0302Blocks extends TetrisCore {
  readonly id='tetris';
  private readonly slot:number;
  private readonly direction:1|-1;
  protected override get fieldRows(): number { return 17; }
  protected override fallTicks():number { return B0302_BLOCK_FALL_MS[this.speed-1]!*60/1000; }
  constructor(options:BrickGameOptions,slot:number) {
    super(options,[variantOf('I',1)]);
    this.slot=slot;this.direction=options.rotationDirection??1;this.init();
  }
  // In the observed ROM, even block slots 04–16 rise from the bottom.
  // DOWN still accelerates the piece on the physical device.
  protected override rowOf(y:number):number { return this.slot % 2 === 0 ? y : super.rowOf(y); }
  protected override drawPreview():Uint8Array {
    const preview=super.drawPreview();
    return this.slot % 2 === 0 ? Uint8Array.from(Array.from({length:16},(_,i)=>preview[(3-Math.floor(i/4))*4+i%4]!)) : preview;
  }
  private fiveCellPiece():Piece {return makePiece(FIRST_PENTOMINO+this.rng.int(FIRST_SUPER-FIRST_PENTOMINO),this.rng.int(4));}
  protected override firstPiece():Piece { return this.pickNext(); }
  protected override pickNext():Piece {
    // ROM samples in 09–16 contain mixed families; exact pools and RNG are
    // still being studied, so these weights are explicitly provisional.
    if(this.slot>=9){
      if(this.rng.int(8)===0)return makePiece(SHAPE_NONE);
      if(this.rng.int(2)===0)return this.fiveCellPiece();
    }
    return super.pickNext();
  }
  protected override rotatedPiece(piece:Piece):Piece {return rotatePiece(piece,this.direction);}
}
export function nativeDefinition(entry: NativeEntry): BrickGameDef | null {
  if (!entry.available) return null;
  const base = BRICK_GAMES[entry.gameId]!;
  return {
    id: entry.gameId, modes: [{ name: entry.name, note: `${entry.profileId} / ${entry.nativeCode}` }], declaredModes: 1,
    create: options => entry.gameId === 'tetris'
      ? entry.profileId === 'e88' ? new E88Blocks({...options,mode:0},Number(entry.nativeCode))
        : entry.profileId === 'e23' ? new E88Blocks({...options,mode:0},((Number(entry.nativeCode)-1)%8)+1)
        : entry.profileId === 'apollo-b0302' ? new B0302Blocks({...options,mode:0},Number(entry.nativeCode))
        : new NativeBlocks({...options, mode:0}, entry.nativeCode === 'H02')
      : entry.profileId === 'apollo-b0302' && entry.gameId === 'racing' ? new B0302Racing(options)
        : entry.profileId === 'e23' && entry.gameId === 'shooting-array' ? new E23Array(options)
        : base.create({...options, mode:0, ...(entry.profileId==='e88'?{levelLimit:13 as const}:{})}),
  };
}
