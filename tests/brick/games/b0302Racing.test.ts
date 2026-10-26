import { describe, expect, it } from 'vitest';
import { B0302Racing } from '../../../src/devices/b0302-racing';
import { carsOverlap } from '../../../src/brick/games/racing/road';
import { GAME_OVER_HOLD_TICKS, GAME_OVER_TICKS_PER_ROW } from '../../../src/brick/base';
import { NEUTRAL_BRICK_INPUT } from '../../../src/brick/types';

class RacingProbe extends B0302Racing {
  end(): void { this.gameOver(); }
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
  it('ends the fill animation after seventeen rows', () => {
    const game=new RacingProbe();game.start();game.end();
    const ticks=Math.ceil(17*GAME_OVER_TICKS_PER_ROW+GAME_OVER_HOLD_TICKS);
    for(let i=0;i<ticks;i++)game.step(NEUTRAL_BRICK_INPUT);
    expect(game.overFill).toBe(17);
    expect(game.phase).toBe('over');
  });
});
