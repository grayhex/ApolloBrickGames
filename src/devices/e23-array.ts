import { InvadersGame } from '../brick/games/invaders';
import { countBricks, type Wall } from '../brick/games/invaders/wall';
import type { BrickGameOptions, BrickInput } from '../brick/types';

/** E-23 slot 06: observed five-row opening and one-cell player. The later
 * row generator, timers and collision effects remain approximations.
 */
export class E23Array extends InvadersGame {
  private openingStep=true;
  private pointY=-1;
  private pointTimer=24;
  private pointRespawn=120;
  protected override get singleCellGun():boolean { return true; }
  protected override get initialInvasionDelay():number { return 30; }
  protected override invasionInterval():number { return 120; }
  /** The opening step and the descending point belong to one level: every new wall (a new game, a cleared array, a lost life) starts them afresh. */
  private resetLevelState():void { this.openingStep=true;this.pointY=-1;this.pointTimer=24;this.pointRespawn=120; }
  protected override createWall():Wall {
    this.resetLevelState();
    const cells=new Uint8Array(this.fieldRows*10);
    const rows=['##########','##########','.########.','.########.','..######..'];
    rows.forEach((row,i)=>Array.from(row).forEach((cell,x)=>{if(cell==='#')cells[(this.fieldRows-1-i)*10+x]=1;}));
    const wall:Wall={height:this.fieldRows,cells,count:0};wall.count=countBricks(wall);return wall;
  }
  protected override processInvasion():void {
    const cells=this.wall.cells;
    if(this.openingStep){
      this.openingStep=false;
      cells.copyWithin(0,10);
      cells.fill(0,(this.fieldRows-1)*10);
      this.spawnPoint();
      return;
    }
    let bottom=-1;
    for(let y=0;y<this.fieldRows;y++)if(cells.subarray(y*10,(y+1)*10).some(Boolean)){bottom=y;break;}
    if(bottom<0)return;
    if(bottom<=1){this.dead=true;return;}
    const row=(bottom-1)*10;
    for(let x=1;x<9;x++)cells[row+x]=this.rng.int(3)===0?0:1;
    if(!cells.subarray(row,row+10).some(Boolean))cells[row+4]=1;
    this.wall.count=countBricks(this.wall);
  }
  private spawnPoint():void {
    for(let y=0;y<this.fieldRows;y++)if(this.wall.cells.subarray(y*10,(y+1)*10).some(Boolean)){
      this.pointY=Math.max(1,y-1);this.pointTimer=24;return;
    }
  }
  protected override specialTargetAt(x:number,y:number):boolean { return this.pointY===y && this.gunX===x; }
  protected override hitSpecialTarget():void { this.pointY=-1;this.pointRespawn=120; }
  protected override update(input:BrickInput):void {
    super.update(input);
    if(this.busy || this.phase!=='playing' || this.openingStep)return;
    if(this.pointY<0){if(--this.pointRespawn<=0)this.spawnPoint();return;}
    if(--this.pointTimer>0)return;
    this.pointTimer=24;
    this.pointY--;
    if(this.pointY>0)return;
    this.pointY=-1;this.pointRespawn=120;
    this.setLives((this.lives??0)-1);
    this.emit({type:'lifeLost'});
    if((this.lives??0)===0)this.gameOver();
  }
  protected override draw():Uint8Array {
    const out=super.draw();
    if(this.pointY>0 && this.pointY<this.fieldRows)out[(this.fieldRows-1-this.pointY)*10+this.gunX]=1;
    return out;
  }
  constructor(options:BrickGameOptions={}) { super({...options,mode:0}); }
}
