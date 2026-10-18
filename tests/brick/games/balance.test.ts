import {arcadePilot} from '../arcadePilot';
import {describe,it,expect} from 'vitest';
import {MazeGame} from '../../../src/brick/games/library/puzzles';
import {RoadGame,ShooterGame,BallGame} from '../../../src/brick/games/library/action';
import {BomberGame,BasketGame,FlappyGame} from '../../../src/brick/games/library/arcade';
import {makeBrickInput,NEUTRAL_BRICK_INPUT as N,type BrickAction,type BrickGame} from '../../../src/brick/types';
import {rulesetFor} from '../../../src/games/rulesets';
import {categoryFor,validateCategory,STANDARD_START} from '../../../src/leaderboards/category';
const run=(g:BrickGame,n:number):void=>{for(let t=0;t<n;t++)g.step(N);};
function route(g:MazeGame): BrickAction[] {
  const q=[g.goal],dist=new Map([[g.goal,0]]),steps:BrickAction[]=[];
  for(const p of q)for(const d of [-10,1,10,-1])if(g.walls[p+d]===0&&!dist.has(p+d)){dist.set(p+d,dist.get(p)!+1);q.push(p+d);}
  let p=g.player;
  while(p!==g.goal){const i=[-10,1,10,-1].findIndex(d=>dist.get(p+d)===dist.get(p)!-1);if(i<0)throw Error('Unreachable exit');steps.push((['up','right','down','left'] as const)[i]!);p+=[-10,1,10,-1][i]!;}
  return steps;
}
describe('maze sprint',()=>{
  it('starts at 15 seconds, stops during pause and ends on timeout',()=>{
    const g=new MazeGame();g.start();expect(g.remaining).toBe(900);run(g,120);g.pause();run(g,300);expect(g.remaining).toBe(780);g.resume();run(g,779);expect(g.remaining).toBe(1);expect(g.step(N)).toContainEqual({type:'gameOver'});run(g,200);expect(g.phase).toBe('over');
  });
  it('100 generated maps at both time limits allow 1s to read and 10 ticks per move',()=>{
    for(const level of [1,10])for(let seed=1;seed<=100;seed++){
      const g=new MazeGame({seed,level});g.start();const path=route(g);expect(path.length*10+60,`seed ${seed}, level ${level}`).toBeLessThan(g.remaining);run(g,60);
      let won=false;for(const key of path){won ||= g.step(makeBrickInput([key])).some(e=>e.type==='win');run(g,9);}
      expect(won).toBe(true);expect(g.score).toBeGreaterThanOrEqual(level*100);
    }
  });
  it('reward grows and the six-second floor survives the level-number wrap',()=>{
    const g=new MazeGame({level:9});g.start();const scores=[];
    for(let i=0;i<4;i++){const old=g.score;for(const key of route(g)){g.step(makeBrickInput([key]));g.step(N);}scores.push(g.score-old);run(g,60);expect(g.seconds).toBe(6);}
    expect(scores).toEqual([...scores].sort((a,b)=>a-b));expect(new Set(scores).size).toBe(4);expect(g.level).toBe(3);expect(g.speed).toBe(2);
  });
});
describe('fair arcade pacing',()=>{
  for(const speed of [1,5,10])it(`road speed ${speed}: 30 seeds have a navigable stage, with six-tick steering`,()=>{
    for(let seed=1;seed<=30;seed++){
      const g=new RoadGame('obstacle-race',{seed,speed});g.start();let won=false;
      for(let t=0;t<5000;t++){
        const o=g.obstacles.find(o=>o.y>=12&&o.y<=19);let target=g.road[19]!+3;
        if(o)target=o.x+(o.x-g.road[Math.min(19,o.y)]!<=3?2:-2);
        target=Math.max(g.road[19]!+2,Math.min(g.road[19]!+4,target));
        const key=t%6===0&&g.x!==target?[g.x<target?'right' as const:'left' as const]:[];
        const ev=g.step(makeBrickInput(key));if(ev.some(e=>e.type==='win')){won=true;break;}if(g.lives!==4)break;
      }
      expect(won,`seed ${seed}`).toBe(true);expect(g.lives).toBe(4);expect(g.score).toBe(160);
    }
  });
  it('idle input no longer completes obstacle-race or two-ball tennis stages',()=>{
    for(const seed of [1,7,19,42])for(const id of ['obstacle-race','pong-double'] as const){
      const g=id==='obstacle-race'?new RoadGame(id,{seed}):new BallGame(id,{seed});g.start();let wins=0;
      for(let t=0;t<18000&&g.phase==='playing';t++)wins+=g.step(N).filter(e=>e.type==='win').length;
      expect(wins,id).toBe(0);expect(g.phase,id).toBe('over');
    }
  });
  it('two-ball tennis can be won across 30 seeds at each speed with six-tick steering',()=>{
    for(const speed of [1,5,10])for(let seed=1;seed<=30;seed++){
      const g=new BallGame('pong-double',{seed,speed});g.start();let won=false;
      for(let t=0;t<18000&&g.phase==='playing';t++){
        const b=g.balls.filter(b=>b.dy>0).sort((a,b)=>b.y-a.y)[0];let target=3;
        if(b){let x=b.x,dx=b.dx;for(let y=b.y;y<18;y++){if(x+dx<0||x+dx>9)dx*=-1;x+=dx;}target=Math.max(0,Math.min(7,x-1));}
        const key=t%6===0&&g.x!==target?[g.x<target?'right' as const:'left' as const]:[];
        if(g.step(makeBrickInput(key)).some(e=>e.type==='win')){won=true;break;}
      }
      expect(won,`speed ${speed}, seed ${seed}`).toBe(true);
    }
  });
  it('flappy allows sustained play using visible gaps and at most ten taps per second',()=>{
    for(const speed of [1,5,10]){
      let clears=0;
      for(let seed=1;seed<=30;seed++){
        const g=new FlappyGame({seed,speed});g.start();
        for(let t=0;t<12000&&g.phase==='playing';t++){
          const pipe=g.pipes.find(p=>p.x>=2)!;
          const flap=t%6===0&&g.bird+Math.max(0,g.velocity)*6>pipe.gap+4;
          g.step(makeBrickInput(flap?['rotate']:[]));if(g.score>=20){clears++;break;}
        }
      }
      // All beginner/intermediate streams, and a majority of the hardest ones,
      // are playable even with this simple reactive policy and no lookahead.
      expect(clears).toBeGreaterThanOrEqual(speed===10?20:30);
    }
  });
  it('two-ball tennis keeps two balls after a goal',()=>{
    const g=new BallGame('pong-double');g.start();g.guard=0;g.balls=[{x:8,y:2,dx:0,dy:-1},{x:5,y:10,dx:1,dy:1}];run(g,20);expect(g.score).toBe(10);expect(g.balls).toHaveLength(2);
  });
  it('bomber maximum speed/height is winnable across 30 cities by prioritising tall buildings',()=>{
    for(let seed=1;seed<=30;seed++){
      let won=false;
      for(const margin of [0,1,2,3,4,20]){
        const g=new BomberGame({seed,speed:10,level:10});g.start();
        for(let t=0;t<24000&&g.phase==='playing';t++){
          const fire=g.buildings[g.x]!>=Math.max(...g.buildings)-margin&&g.buildings[g.x]!>0;
          if(g.step(fire?makeBrickInput(['rotate']):N).some(e=>e.type==='win')){won=true;break;}
        }
        if(won)break;
      }
      expect(won,`seed ${seed}`).toBe(true);
    }
  });
  it('basket max speed leaves time for cross-screen travel between catches',()=>{
    const g=new BasketGame({speed:10});g.start();g.x=0;g.drops=[{x:0,y:17,bad:false},{x:9,y:11,bad:false}];run(g,9);expect(g.score).toBe(10);
    // 12-tick reaction, followed by a held move across seven columns.
    run(g,12);for(let t=0;t<42;t++)g.step(makeBrickInput(t===0?['right']:[],['right']));
    expect(g.lives).toBe(4);expect(g.score).toBe(20);
  });
  it('flappy adjacent gaps never jump more than three rows',()=>{
    for(let seed=1;seed<=30;seed++){
      const g=new FlappyGame({seed,speed:10});g.start();let previous=g.pipes[0]!.gap;
      for(let t=0;t<1800;t++){
        // Keep the bird away from collisions to inspect a long generated stream.
        const pipe=g.pipes.find(p=>p.x===2);g.bird=(pipe?.gap??previous)+2;g.velocity=0;
        g.step(N);const last=g.pipes.at(-1)!;if(last.x===9){expect(Math.abs(last.gap-previous)).toBeLessThanOrEqual(3);previous=last.gap;}
      }
    }
  });
});
describe('approximate shooter hitboxes and health',()=>{
  it('hits the drawn nose and body, not the empty row below them',()=>{
    const g=new ShooterGame('talking-shooting');g.start();g.bullets=[{x:4,y:19,enemy:true}];g.step(N);expect(g.lives).toBe(4);
    g.bullets=[{x:4,y:17,enemy:true}];g.step(N);expect(g.lives).toBe(3);
  });
  it('entering a stationary shot counts and adjacent shots cannot consume all health at once',()=>{
    const g=new ShooterGame('dual-shooting');g.start();g.bullets=[{x:6,y:18,enemy:true},{x:5,y:18,enemy:true}];g.step(makeBrickInput(['right']));expect(g.health).toBe(2);expect(g.lives).toBe(4);expect(g.bullets).toHaveLength(0);
    g.bullets=[{x:5,y:17,enemy:true}];g.step(N);expect(g.health).toBe(2);run(g,45);g.bullets=[{x:5,y:17,enemy:true}];g.step(N);expect(g.health).toBe(1);
  });
  it('a formation stepping into a shot takes damage on that tick',()=>{
    const g=new ShooterGame('talking-shooting');g.start();g.targets=[{x:4,y:5},{x:6,y:4}];g.bullets=[{x:5,y:5,enemy:false}];g['timer']=44;g.step(N);expect(g.score).toBe(5);expect(g.targets).toEqual([{x:7,y:4}]);
  });
  it('boss armour cannot farm points, but the visible core takes damage',()=>{
    const g=new ShooterGame('dual-shooting');g.start();const armour=g.targets[0]!,core=g['weakPoint']!;expect(g.cells()[core.y*10+core.x]).toBe(2);
    g.bullets=[{...armour,enemy:false}];g.step(N);expect(g.score).toBe(0);expect(g.bossHP).toBe(10);
    g.bullets=[{...core,enemy:false}];g.step(N);expect(g.score).toBe(5);expect(g.bossHP).toBe(9);
  });
  for(const id of ['meteor-fighter','dual-shooting','talking-shooting','space-invaders','tetris-shooting'] as const)it(`${id}: aiming and dodging reaches a win on low/mid/high speed`,()=>{
    for(const speed of [1,5,10])for(const seed of [1,7,19]){
      const g=new ShooterGame(id,{seed,speed});g.start();let won=false;
      for(let t=0;t<12000&&g.phase==='playing';t++){
        if(g.step(arcadePilot(g,t)).some(e=>e.type==='win')){won=true;break;}
      }
      expect(won,`speed ${speed}, seed ${seed}`).toBe(true);
    }
  });
});
it('isolates new balance records while preserving ROM modes and native profiles',()=>{
  const spec={gameId:'honeybee',toyId:'brickgame',mode:0,startProfile:STANDARD_START};
  expect(categoryFor({...spec,rulesetVersion:'2'})).toContain(':0:r2:');
  expect(()=>categoryFor({...spec,mode:1,rulesetVersion:'2'})).toThrow();
  const next=categoryFor({...spec,mode:1,rulesetVersion:'3'});expect(validateCategory(next)).toBe(next);
  for(const id of ['snake','dice','frog','honeybee'])expect(rulesetFor(id,0)).toBe('2');
  expect(rulesetFor('tetris')).toBe('1');
  expect(categoryFor({gameId:'honeybee',toyId:'apollo-b0202',mode:0,profileId:'apollo-b0202',variantId:'d01',rulesetVersion:'1',startProfile:STANDARD_START})).toContain(':r1:');
  expect(()=>categoryFor({gameId:'maze',toyId:'brickgame',mode:0,rulesetVersion:'1',startProfile:STANDARD_START})).toThrow();
});
