import { InvadersGame } from '../brick/games/invaders';
import type { BrickGameOptions } from '../brick/types';
import { countBricks, type Wall } from '../brick/games/invaders/wall';

/** B0302 17/18 observations: a growing random array descends, and fast shots
 * remove cells for one point. Generation, lives and progression remain provisional.
 */
export class B0302Invaders extends InvadersGame {
  protected override get fieldRows(): number { return 17; }
  protected override get projectileStepsPerTick():number { return 5; }
  protected override get winWhenWallEmpty():boolean { return false; }
  protected override get invasionWhenWallEmpty():boolean { return true; }
  protected override createWall():Wall { return {height:this.fieldRows,cells:new Uint8Array(this.fieldRows*10),count:0}; }
  protected override invasionInterval():number { return 120; }
  protected override processInvasion():void {
    const cells=this.wall.cells;
    if(cells.subarray(0,20).some(Boolean)){this.dead=true;return;}
    cells.copyWithin(0,10);
    const top=(this.fieldRows-1)*10;
    for(let x=0;x<10;x++)cells[top+x]=this.rng.int(3)===0?0:1;
    if(!cells.subarray(top).some(Boolean))cells[top+this.rng.int(10)]=1;
    this.wall.count=countBricks(this.wall);
  }
  constructor(options:BrickGameOptions={}) { super({...options,mode:4}); }
}
