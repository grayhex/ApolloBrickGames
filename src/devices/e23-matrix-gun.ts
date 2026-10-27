import { InvadersGame } from '../brick/games/invaders';
import { countBricks, type Wall } from '../brick/games/invaders/wall';
import type { BrickGameOptions } from '../brick/types';

/** E-23 slots 07/08: an array grows from above; ROTATE destroys or adds a
 * cell in the player's column. Row generation and end conditions are estimates.
 */
export class E23MatrixGun extends InvadersGame {
  private get building():boolean { return this.mode===1; }
  protected override get singleCellGun():boolean { return true; }
  protected override get projectileStepsPerTick():number { return 10; }
  protected override get constructOnFire():boolean { return this.building; }
  protected override get repeatFire():boolean { return !this.building; }
  protected override get winWhenWallEmpty():boolean { return false; }
  protected override get invasionWhenWallEmpty():boolean { return true; }
  protected override createWall():Wall { return {height:this.fieldRows,cells:new Uint8Array(this.fieldRows*10),count:0}; }
  protected override invasionInterval():number { return this.building?210:60; }
  protected override onStart():void { /* The ROM begins drawing the array immediately. */ }
  protected override processInvasion():void {
    const cells=this.wall.cells;
    if(cells.subarray(0,10).some(Boolean)){this.dead=true;return;}
    cells.copyWithin(0,10);
    const top=(this.fieldRows-1)*10;
    for(let x=0;x<10;x++)cells[top+x]=this.rng.int(3)===0?1:0;
    if(!cells.subarray(top).some(Boolean))cells[top+this.rng.int(10)]=1;
    this.wall.count=countBricks(this.wall);
  }
  constructor(options:BrickGameOptions={},building=false) { super({...options,mode:building?1:0}); }
}
