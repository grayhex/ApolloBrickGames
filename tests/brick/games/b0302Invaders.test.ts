import { describe, expect, it } from 'vitest';
import { B0302Invaders } from '../../../src/devices/b0302-invaders';
import { makeBrickInput, NEUTRAL_BRICK_INPUT } from '../../../src/brick/types';

class Probe extends B0302Invaders {
  insert(x:number,y:number):void { this.wall.cells[y*10+x]=1;this.wall.count++; }
  grow():void { this.processInvasion(); }
  value(x:number,y:number):number { return this.wall.cells[y*10+x]!; }
}

describe('17-row array shooter', () => {
  it('keeps the wall, gun and projectile updates within the physical field', () => {
    const game=new B0302Invaders({seed:7});
    game.start();
    for(let i=0;i<300;i++) {
      game.step(NEUTRAL_BRICK_INPUT);
      expect([...game.cells().slice(170)].every(cell=>cell===0)).toBe(true);
    }
  });
  it('moves the existing array down and adds a new row at the top', () => {
    const game=new Probe({seed:7});
    game.insert(2,10);game.grow();
    expect(game.value(2,9)).toBe(1);
    expect(game.value(2,10)).toBe(0);
    expect(Array.from({length:10},(_,x)=>game.value(x,16)).some(Boolean)).toBe(true);
  });
  it('fires a fast shot and awards one point for a cell without ending an empty wall', () => {
    const game=new Probe({seed:7});game.start();
    for(let i=0;i<92;i++)game.step(NEUTRAL_BRICK_INPUT);
    game.insert(4,8);
    game.step(makeBrickInput(['rotate']));
    game.step(NEUTRAL_BRICK_INPUT);
    expect(game.value(4,8)).toBe(0);
    expect(game.score).toBe(1);
    expect(game.phase).toBe('playing');
  });
});
