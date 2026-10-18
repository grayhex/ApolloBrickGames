import { BRICK_GAMES } from '../brick/games';
import { TetrisCore } from '../brick/games/tetris/core';
import { variantOf } from '../brick/games/tetris/variants';
import { E88Blocks } from './e88-blocks';
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
export function nativeDefinition(entry: NativeEntry): BrickGameDef | null {
  if (!entry.available) return null;
  const base = BRICK_GAMES[entry.gameId]!;
  return {
    id: entry.gameId, modes: [{ name: entry.name, note: `${entry.profileId} / ${entry.nativeCode}` }], declaredModes: 1,
    create: options => entry.gameId === 'tetris'
      ? entry.profileId === 'e88' ? new E88Blocks({...options,mode:0},Number(entry.nativeCode)) : new NativeBlocks({...options, mode:0}, entry.nativeCode === 'H02')
      : base.create({...options, mode:0, ...(entry.profileId==='e88'?{levelLimit:13 as const}:{})}),
  };
}
