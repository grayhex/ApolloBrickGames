import {describe,it,expect} from 'vitest';
import {MiniRacingGame,MINI_CARS,MINI_CAR_TOP} from '../../../src/brick/games/miniRacing';
import {MINI_RACE_INTRO_TICKS,MINI_VERSE_MS} from '../../../src/brick/miniTiming';
import {MINI_KOROBEINIKI_MS} from '../../../src/audio/miniTunes';
import {makeBrickInput} from '../../../src/brick/types';
const run=(g:MiniRacingGame,n:number)=>{for(let i=0;i<n;i++)g.step(makeBrickInput());};
const ready=(mode=0)=>{const g=new MiniRacingGame({mode,seed:7});g.start();run(g,MINI_RACE_INTRO_TICKS);return g;};
describe('Mini 96 racing reference',()=>{
 it('holds racing and scoring until one verse finishes; flag fill waves and the central barrier opens outward',()=>{
  expect(MINI_KOROBEINIKI_MS).toBe(MINI_VERSE_MS);
  const g=new MiniRacingGame();g.start();const first=g.cells().slice();
  expect([...first.slice(100,110)]).toEqual(Array(10).fill(1));
  run(g,15);expect(g.cells().slice(20,60)).not.toEqual(first.slice(20,60));
  run(g,Math.floor(MINI_RACE_INTRO_TICKS/2)-15);
  expect([...g.cells().slice(100,110)]).toEqual([1,1,1,0,0,0,0,1,1,1]);
  expect(g.score).toBe(0);g.pause();const tick=g.tick;run(g,300);expect(g.tick).toBe(tick);g.resume();
  run(g,MINI_RACE_INTRO_TICKS-tick);expect(g.speed).toBe(2);expect(g.score).toBe(0);
 });
 it('accelerates automatically from displayed speed 1 to 9, awards 10 per driving second, and pause awards nothing',()=>{
  const g=ready();g['spawn']=()=>{};run(g,8*60);expect(g.speed-1).toBe(9);expect(g.score).toBe(80);
  const scroll=g['scroll'];run(g,6);expect(g['scroll']-scroll).toBe(1);
  g.pause();run(g,600);expect(g.score).toBe(80);g.resume();run(g,60);expect(g.score).toBe(90);
 });
 it.each([2,3,4])('collects a %i-cell rod once for 10 points per cell',height=>{
  const g=ready();g['objects']=[{x:5,y:MINI_CAR_TOP,rows:Array<string>(height).fill('#'),pickup:true}];
  g.step(makeBrickInput());expect(g.score).toBe(height*10);expect(g['objects']).toHaveLength(0);
  run(g,10);expect(g.score).toBe(height*10);
 });
 it('an obstacle is a collision, not a collectible; input moves before the next road scroll',()=>{
  const g=ready();g['objects']=[{x:5,y:MINI_CAR_TOP,rows:['#'],pickup:false}];
  g.step(makeBrickInput());expect(g['busy']).toBe(true);expect(g.score).toBe(0);
  const steer=ready();const x=steer['x'];steer.step(makeBrickInput(['left']));expect(steer['x']).toBe(x-1);
 });
 it('00/01 have the same timing and road, differing only in the nose pixels',()=>{
  const a=ready(0),b=ready(1);expect(MINI_CARS[0]).not.toEqual(MINI_CARS[1]);
  expect(a['objects']).toEqual(b['objects']);expect(a.speed).toBe(b.speed);
  const diffs=[...a.cells()].flatMap((v,i)=>v!==b.cells()[i]?[i]:[]);
  expect(diffs).toEqual([(MINI_CAR_TOP+2)*10+4,(MINI_CAR_TOP+2)*10+6]);
 });
 it('a reactive driver can survive seeded tunnels and figures at the maximum speed',()=>{
  for(let seed=1;seed<=30;seed++){
   const g=new MiniRacingGame({seed});g.start();run(g,MINI_RACE_INTRO_TICKS);
   for(let t=0;t<2400;t++){
    const o=g['objects'].filter(o=>o.y+o.rows.length>0&&o.y<=MINI_CAR_TOP+4).sort((a,b)=>b.y-a.y)[0];
    let target=g['x'];
    if(o){
     if(o.pickup)target=o.x;
     else {const safe=Array.from({length:6},(_,i)=>i+2).filter(x=>o.rows.every(row=>[-1,0,1].every(dx=>row[x+dx-o.x]!=='#')));target=safe.sort((a,b)=>Math.abs(a-g['x'])-Math.abs(b-g['x']))[0]??target;}
    }
    const action=target<g['x']?'left':target>g['x']?'right':null;
    g.step(makeBrickInput(t%6===0 && action?[action]:[]));
    if(g['busy'])break;
   }
   expect(g['busy'],`seed ${seed}`).toBe(false);expect(g.speed-1).toBe(9);expect(g.score).toBeGreaterThanOrEqual(400);
  }
 });
});
