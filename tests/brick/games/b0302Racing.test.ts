import { describe, expect, it } from 'vitest';
import { B0302Racing } from '../../../src/devices/b0302-racing';
import { carsOverlap } from '../../../src/brick/games/racing/road';
import { GAME_OVER_HOLD_TICKS, GAME_OVER_TICKS_PER_ROW } from '../../../src/brick/base';
import { NEUTRAL_BRICK_INPUT } from '../../../src/brick/types';

class RacingProbe extends B0302Racing {
  end(): void { this.gameOver(); }
  clearTraffic():void { this.road.opponents=[]; }
  collide():void { this.onCrash(); }
  placeOpponent(x:number,y:number):void { this.road.opponents=[{x,y}]; }
}

describe('B0302 racing geometry', () => {
  it('draws the observed five-row car with three rows below it on a 17-row field', () => {
    const game=new B0302Racing({seed:7});
    const screen=game.cells();
    const shape=Array.from({length:5},(_,y)=>Array.from({length:3},(_,x)=>screen[(9+y)*10+5+x]?'#':'.').join(''));
    expect(shape).toEqual(['.#.','.#.','###','.#.','#.#']);
    expect([...screen.slice(170)].every(cell=>cell===0)).toBe(true);
  });
  it('uses every cell of the longer car when checking a collision', () => {
    const car=['#.#','.#.','###','.#.','.#.'];
    expect(carsOverlap(3,4,3,7,car)).toBe(true);
    expect(carsOverlap(3,4,3,8,car)).toBe(false);
    expect(carsOverlap(3,4,6,4,car)).toBe(false);
  });
  it('draws and collides with the shorter observed traffic shape',()=>{
    const game=new RacingProbe();game.placeOpponent(3,11);
    const screen=game.cells();
    const shape=Array.from({length:3},(_,y)=>Array.from({length:3},(_,x)=>screen[(4+y)*10+2+x]?'#':'.').join(''));
    expect(shape).toEqual(['..#','.##','.#.']);
    const player=['#.#','.#.','###','.#.','.#.'];
    const traffic=['.#.','.##','..#'];
    expect(carsOverlap(3,4,3,8,player,traffic)).toBe(true);
    expect(carsOverlap(3,4,3,9,player,traffic)).toBe(false);
  });
  it('earns one point per road movement and accelerates every two points', () => {
    const game=new RacingProbe({seed:7});game.start();
    let last=0;
    for(let tick=0;tick<600&&game.score<18;tick++) {
      game.clearTraffic();game.step(NEUTRAL_BRICK_INPUT);
      if(game.score!==last){
        expect(game.score).toBe(last+1);
        expect(game.speed).toBe(Math.min(10,1+Math.ceil(game.score/2)));
        last=game.score;
      }
    }
    expect(game.score).toBeGreaterThanOrEqual(18);
    expect(game.speed).toBe(10);
    const score=game.score;
    game.collide();
    expect(game.score).toBe(score);
    expect(game.speed).toBe(1);
    while(game.score===score){game.clearTraffic();game.step(NEUTRAL_BRICK_INPUT);}
    expect(game.speed).toBe(2);
  });
  it('ends the fill animation after seventeen rows', () => {
    const game=new RacingProbe();game.start();game.end();
    const ticks=Math.ceil(17*GAME_OVER_TICKS_PER_ROW+GAME_OVER_HOLD_TICKS);
    for(let i=0;i<ticks;i++)game.step(NEUTRAL_BRICK_INPUT);
    expect(game.overFill).toBe(17);
    expect(game.phase).toBe('over');
  });
});
