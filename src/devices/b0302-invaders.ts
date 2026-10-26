import { InvadersGame } from '../brick/games/invaders';
import type { BrickGameOptions } from '../brick/types';

/** Seventeen-row array shooter; generation, timing and score are provisional. */
export class B0302Invaders extends InvadersGame {
  protected override get fieldRows(): number { return 17; }
  constructor(options:BrickGameOptions={}) { super({...options,mode:4}); }
}
