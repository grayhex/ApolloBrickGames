import { TetrisCore } from '../brick/games/tetris/core';
import { variantOf } from '../brick/games/tetris/variants';
import type { Piece } from '../brick/games/tetris/shapes';
import type { BrickGameOptions } from '../brick/types';
import poses from './e88-pieces.json';
/** Observed complete movement periods, 2 ms sampling; separate from the Snake timer. */
export const E88_BLOCK_FALL_MS = [340.204, 306.19, 274.176, 241.146, 208.136, 174.108, 143.108, 110.082, 78.044, 45.024] as const;
export function e88Piece(shape:number,angle:number):Piece {
  angle=((angle%4)+4)%4;
  const cells=poses[shape]![angle]! as [number,number][];
  return {shape,angle,blink:false,cells,minX:Math.min(...cells.map(c=>c[0])),maxX:Math.max(...cells.map(c=>c[0])),minY:Math.min(...cells.map(c=>c[1])),maxY:Math.max(...cells.map(c=>c[1]))};
}
/** Modes 2/4: each fourth piece uses the second seven-shape pool ($786).
 * Modes 3/4: permanent blinking obstruction at bottom x=4 ($99D / $34D).
 */
export class E88Blocks extends TetrisCore {
  readonly id='tetris';
  private readonly nativeMode:number;
  private readonly direction:1|-1;
  private sequence=0;
  constructor(options:BrickGameOptions,nativeMode:number) {
    super({...options,levelLimit:13},[variantOf('I',1)]);this.nativeMode=nativeMode;this.direction=options.rotationDirection??1;this.init();
  }
  protected override reset():void { this.sequence=0;super.reset(); }
  protected override firstPiece():Piece { return this.pickNext(); }
  protected override pickNext():Piece {
    const extra=this.nativeMode%2===0 && ++this.sequence%4===0;
    return e88Piece(this.rng.int(7)+(extra?7:0),this.rng.int(4));
  }
  protected override rotatedPiece(piece:Piece):Piece {return e88Piece(piece.shape,piece.angle+this.direction);}
  protected override linePoints(removed:number):number {return super.linePoints(removed)*10;}
  protected override fallTicks():number {return E88_BLOCK_FALL_MS[this.speed-1]!*60/1000;}
  protected override cellAt(x:number,y:number):number {return this.nativeMode>=3 && x===4 && y===0 ? 1 : super.cellAt(x,y);}
  protected override draw():Uint8Array {const out=super.draw();if(this.nativeMode>=3)out[194]=2;return out;}
}
