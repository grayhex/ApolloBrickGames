import { BRICK_GAMES } from '../brick/games';
import { TetrisCore } from '../brick/games/tetris/core';
import { variantOf } from '../brick/games/tetris/variants';
import { FIRST_PENTOMINO, FIRST_SUPER, SHAPE_NONE, makePiece, rotatePiece, type Piece } from '../brick/games/tetris/shapes';
import { E88Blocks } from './e88-blocks';
import { B0302Racing } from './b0302-racing';
import type { BrickGameDef, BrickGameOptions } from '../brick/types';
import type { NativeEntry } from './catalog';

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
  constructor(options:BrickGameOptions,slot:number) {
    super(options,[variantOf('I',1)]);
    this.slot=slot;this.direction=options.rotationDirection??1;this.init();
  }
  private fiveCellPiece():Piece {return makePiece(FIRST_PENTOMINO+this.rng.int(FIRST_SUPER-FIRST_PENTOMINO),this.rng.int(4));}
  protected override firstPiece():Piece {
    if(this.slot===10||this.slot===15)return makePiece(SHAPE_NONE);
    return [9,13,14].includes(this.slot)?this.fiveCellPiece():super.firstPiece();
  }
  protected override pickNext():Piece {
    if(this.slot===15)return makePiece(SHAPE_NONE);
    if(this.slot===10&&this.rng.int(8)===0)return makePiece(SHAPE_NONE);
    return [9,13,14].includes(this.slot)?this.fiveCellPiece():super.pickNext();
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
        : base.create({...options, mode:0, ...(entry.profileId==='e88'?{levelLimit:13 as const}:{})}),
  };
}
