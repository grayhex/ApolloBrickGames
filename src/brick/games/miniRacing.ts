/** B-S96 00/01: owner video IMG_2447 (1).mov and clarifications.
 * Shape-only variants, a flag/count-in, accelerating scrolling obstacles and collectible rods.
 * Rod points (20/30/40) and +10 per second are owner-confirmed. Road spacing and acceleration interval remain reconstruction parameters.
 */
import { BrickBase } from '../base';
import { emptyField } from '../grid';
import { MINI_RACE_INTRO_TICKS } from '../miniTiming';
import { Repeater } from '../timing';
import type { BrickGameOptions, BrickInput } from '../types';
export const MINI_CARS = [['.#.','###','.#.','.#.','###'], ['.#.','###','###','.#.','###']] as const;
export const MINI_RACE_ACCEL_TICKS = 60;
export const MINI_CAR_TOP = 12; // three empty rows below the five-row car, owner photo
export const MINI_RACE_SPACING = 14;
interface RoadObject {x:number;y:number;rows:readonly string[];pickup:boolean}
export class MiniRacingGame extends BrickBase {
  readonly id = 'racing';
  private x = 5;
  private scroll = 0;
  private clock = 0;
  private driveTicks = 0;
  private objects: RoadObject[] = [];
  private readonly repeat = new Repeater(8,3);
  constructor(options:BrickGameOptions={}) {super(options,2);this.init();}
  protected reset():void {this.x=5;this.scroll=0;this.clock=0;this.driveTicks=0;this.objects=[];this.repeat.reset();this.setSpeed(1);}
  protected override onStart():void {
    this.cutscene(MINI_RACE_INTRO_TICKS,t=>{this.overlay=this.startFrame(t);},()=>{this.overlay=null;this.setSpeed(2);});
  }
  private startFrame(t:number):Uint8Array {
    const out=emptyField();
    // Pole and diagonal flag fill alternate, rather than translating the whole flag.
    for(let y=2;y<8;y++)out[y*10+2]=1;
    for(let y=2;y<6;y++)for(let x=3;x<8;x++) if((x+y+Math.floor(t/15))%3!==0)out[y*10+x]=1;
    const opening=Math.floor(Math.min(1,t/(MINI_RACE_INTRO_TICKS-1))*5);
    for(let x=0;x<10;x++)if(x<5-opening||x>=5+opening)out[10*10+x]=1;
    return out;
  }
  private carCells():[number,number][] {
    return MINI_CARS[this.mode]!.flatMap((row,y)=>[...row].flatMap((v,x)=>v==='#'?[[this.x+x-1,MINI_CAR_TOP+y] as [number,number]]:[]));
  }
  private collide():void {
    const car=this.carCells();
    for(const o of [...this.objects]) {
      if(!car.some(([x,y])=>o.rows[y-o.y]?.[x-o.x]==='#'))continue;
      if(o.pickup){this.addScore(o.rows.length*10);this.emit({type:'bonus'});this.objects=this.objects.filter(item=>item!==o);}
      else {this.emit({type:'crash'});this.gameOver();return;}
    }
  }
  private spawn():void {
    const corridor=2+this.rng.int(6);
    const pickup=this.rng.int(3)===0;
    if(pickup){const height=2+this.rng.int(3);this.objects.push({x:corridor,y:-height,rows:Array<string>(height).fill('#'),pickup:true});return;}
    const tunnel=this.rng.int(2)===0;
    if(!tunnel) {
      const shapes=[['###','###','###'],['###','..#','..#'],['.#.','###','.#.'],['##.','.##','..#']] as const;
      const rows=shapes[this.rng.int(shapes.length)]!;
      const x=this.rng.int(2)===0?1:6;
      this.objects.push({x,y:-rows.length,rows,pickup:false});return;
    }
    const rows=Array.from({length:3},()=>Array.from({length:8},(_,i)=>Math.abs(i+1-corridor)<=1?'.':'#').join(''));
    this.objects.push({x:1,y:-rows.length,rows,pickup:false});
  }
  protected update(input:BrickInput):void {
    if(this.repeat.fire('left',input))this.x=Math.max(2,this.x-1);
    if(this.repeat.fire('right',input))this.x=Math.min(7,this.x+1);
    this.collide();if(this.busy)return;
    this.driveTicks++;if(this.driveTicks%60===0)this.addScore(10);this.setSpeed(Math.min(10,2+Math.floor(this.driveTicks/MINI_RACE_ACCEL_TICKS)));
    if(++this.clock<Math.max(6,20-(this.speed-2)*1.75))return;
    this.clock=0;this.scroll++;
    for(const o of this.objects)o.y++;
    this.objects=this.objects.filter(o=>o.y<20);
    if(this.scroll%MINI_RACE_SPACING===1)this.spawn();
    this.collide();
  }
  protected draw():Uint8Array {
    const out=emptyField();
    for(let y=0;y<20;y++)if((y+this.scroll)%5<3){out[y*10]=1;out[y*10+9]=1;}
    for(const o of this.objects)o.rows.forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='#'&&o.y+y>=0&&o.y+y<20)out[(o.y+y)*10+o.x+x]=1;}));
    for(const [x,y]of this.carCells())out[y*10+x]=1;
    return out;
  }
  protected override drawPreview():Uint8Array {return Uint8Array.from([1,0,1,0,0,1,0,0,1,0,1,0,0,0,0,0]);}
}
