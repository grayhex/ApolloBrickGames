import { describe, expect, it } from 'vitest';
import { E23MatrixGun } from '../../../src/devices/e23-matrix-gun';
import { makeBrickInput, NEUTRAL_BRICK_INPUT } from '../../../src/brick/types';

class Probe extends E23MatrixGun {
  clear():void { this.wall.cells.fill(0);this.wall.count=0; }
  add(x:number,y:number):void { this.wall.cells[y*10+x]=1;this.wall.count++; }
  value(x:number,y:number):number { return this.wall.cells[y*10+x]!; }
}

describe('E-23 matrix gun modes',()=>{
  it('slot 07 uses one player cell and removes a hit cell',()=>{
    const game=new Probe({seed:7},false);game.start();game.step(NEUTRAL_BRICK_INPUT);
    expect([...game.cells().slice(190)]).toEqual([0,0,0,0,1,0,0,0,0,0]);
    game.clear();game.add(4,10);
    game.step(makeBrickInput(['rotate']));
    expect(game.value(4,10)).toBe(0);
    expect(game.score).toBe(1);
  });

  it('slot 08 adds one cell at the top without repeating while held',()=>{
    const game=new Probe({seed:7},true);game.start();game.step(NEUTRAL_BRICK_INPUT);game.clear();
    game.step(makeBrickInput(['rotate']));
    for(let tick=0;tick<50;tick++)game.step(makeBrickInput([],['rotate']));
    expect(game.value(4,19)).toBe(1);
    expect(game.score).toBe(1);
  });
});
