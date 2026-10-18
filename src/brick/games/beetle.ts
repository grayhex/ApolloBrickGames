/** Apollo B0202 D01 (Beetle), main Honeybee profile by the owner's choice.
 * Original updates $1DD5, gun $1DB9, shot $1EBF, score/replacement $1F25.
 * Source observations and remaining adaptations: docs/brick/rom-arcade.md.
 */
import { BrickBase } from '../base';
import { b0202FallMs } from '../b0202';
import { Repeater } from '../timing';
import type { BrickGameOptions, BrickInput } from '../types';
export const B0202_BEETLE_MASKS = [85,170,129,255,255,195,231,240,15,162,0,32] as const;
export interface Beetle { x: number; y: number } // y from the bottom
export class BeetleGame extends BrickBase {
  readonly id = 'honeybee';
  x = 4;
  enemies: Beetle[] = [];
  readonly formation = new Uint8Array(200);
  private clock = 0;
  private beam: {x:number;y:number} | null = null;
  private beamLeft = 0;
  private readonly keys = new Repeater(8, 3);
  constructor(options: BrickGameOptions = {}) { super(options, 8); this.init(); }
  protected reset(): void { this.setLives(4); this.setup(); }
  private setup(): void {
    this.x = 4; this.clock = 0; this.beam = null; this.beamLeft = 0; this.keys.reset();
    this.enemies = [0,2,4,6].map(x => ({x,y:16})); this.loadFormation();
  }
  private loadFormation(): void {
    this.formation.fill(0);
    for (let row=0;row<3;row++) {
      const mask=B0202_BEETLE_MASKS[this.level-1+row]!;
      for(let x=1;x<=8;x++) this.formation[(17+row)*10+x]=(mask >> (8-x)) & 1;
    }
  }
  protected update(input: BrickInput): void {
    const left=this.keys.fire('left',input),right=this.keys.fire('right',input);
    const next=Math.max(0,Math.min(9,this.x+Number(right)-Number(left)));
    if(next!==this.x){this.x=next;this.emit({type:'move'});}
    if(this.beamLeft && --this.beamLeft===0)this.beam=null;
    // One shot per physical press. The original scans the entire ray synchronously;
    // a held ROTATE is not an automatic gun and DOWN does not accelerate it.
    if(input.pressed.has('rotate')||input.pressed.has('fire'))this.shoot();
    this.clock++;
    const period=b0202FallMs(this.speed)*60/1000;
    if(this.clock>=period){
      this.clock-=period;
      const bits=this.rng.int(16); // original uses bits of a free-running timer; seeded adaptation
      for(const [index,enemy] of this.enemies.entries()){
        enemy.x=(enemy.x+((bits>>index)&1?1:9))%10; enemy.y--;
        if(enemy.y===1){
          enemy.y=16;
          if(Math.abs(enemy.x-this.x)<=1){this.lose();return;}
        }
      }
    }
  }
  private shoot(): void {
    // D01 cannot hit the reserve formation above y=16 directly.
    const target=this.enemies.filter(e=>e.x===this.x && e.y>=2 && e.y<=16).sort((a,b)=>a.y-b.y)[0];
    this.beam={x:this.x,y:target?.y??16};this.beamLeft=3;this.emit({type:'shot'});
    if(!target)return;
    this.addScore(1);
    if(this.score%1000===0 && this.speed<10)this.setSpeed(this.speed+1);
    this.emit({type:'hit'});
    // Reserves are consumed from right to left in bottom-to-top formation rows.
    if(this.takeReserve(target))return;
    // ROM advances the formation when all reserve cells are gone; there is no +100 wave bonus.
    this.nextLevel();this.emit({type:'win'});this.loadFormation();
    this.takeReserve(target);
  }
  private takeReserve(target: Beetle): boolean {
    for(let y=17;y<20;y++)for(let x=8;x>=1;x--)if(this.formation[y*10+x]){
      this.formation[y*10+x]=0;target.x=x;target.y=y;return true;
    }
    return false;
  }
  private lose(): void {
    this.setLives((this.lives??1)-1);this.emit({type:'lifeLost'});
    if(!this.lives)this.gameOver();else this.cutscene(60,null,()=>this.setup());
  }
  protected draw(): Uint8Array {
    const out=new Uint8Array(200);
    for(let y=0;y<20;y++)out.set(this.formation.subarray(y*10,y*10+10),(19-y)*10);
    for(const e of this.enemies)out[(19-e.y)*10+e.x]=1;
    if(this.beam)for(let y=1;y<=this.beam.y;y++)out[(19-y)*10+this.beam.x]=1;
    out[18*10+this.x]=2;
    for(let dx=-1;dx<=1;dx++)if(this.x+dx>=0&&this.x+dx<10)out[19*10+this.x+dx]=1;
    return out;
  }
}
