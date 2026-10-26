import { RacingBase } from '../brick/games/racing/base';
import type { BrickGameOptions } from '../brick/types';

/** Five-row car and 17-row field observed in B0302 01/02.
 * Traffic generation, scoring and timing remain donor approximations.
 */
export class B0302Racing extends RacingBase {
  readonly id = 'racing';
  protected override get fieldRows(): number { return 17; }
  protected override get carRows(): readonly string[] { return ['#.#','.#.','###','.#.','.#.']; }
  protected override get carY(): number { return 4; }
  constructor(options: BrickGameOptions = {}) {
    super({...options,mode:0},1);
    this.init();
  }
}
