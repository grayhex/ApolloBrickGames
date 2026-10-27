import { describe, expect, it } from 'vitest';
import { E23Array } from '../../../src/devices/e23-array';
import { makeBrickInput, NEUTRAL_BRICK_INPUT } from '../../../src/brick/types';

const rows=(game:E23Array):string[]=>Array.from({length:20},(_,y)=>
  Array.from({length:10},(_,x)=>game.cells()[y*10+x]?'#':'.').join(''));

describe('E-23 array opening',()=>{
  it('draws the initial five ROM rows and the single-cell player',()=>{
    const game=new E23Array({seed:7});
    expect(rows(game).slice(0,5)).toEqual(['##########','##########','.########.','.########.','..######..']);
    expect(rows(game)[19]).toBe('....#.....');
  });

  it('moves the opening array down and lets LEFT move the single-cell player',()=>{
    const game=new E23Array({seed:7});game.start();
    for(let tick=0;tick<130;tick++)game.step(NEUTRAL_BRICK_INPUT);
    expect(rows(game).slice(0,6)).toEqual(['..........','##########','##########','.########.','.########.','..######..']);
    expect(rows(game)[6]).toBe('....#.....');
    game.step(makeBrickInput(['left']));
    expect(rows(game)[19]).toBe('...#......');
    expect(rows(game)[6]).toBe('...#......');
  });

  it('loses a life when the falling point reaches the player',()=>{
    const game=new E23Array({seed:7});game.start();
    for(let tick=0;tick<480;tick++)game.step(NEUTRAL_BRICK_INPUT);
    expect(game.lives).toBe(3);
    expect(game.phase).toBe('playing');
    expect(game.score).toBe(0);
  });

  it('starts the opening step and the descending point afresh on every reloaded level',()=>{
    const game=new E23Array({seed:7});game.start();
    for(let tick=0;tick<130;tick++)game.step(NEUTRAL_BRICK_INPUT);
    const inner=game as unknown as {openingStep:boolean;pointY:number;pointTimer:number;pointRespawn:number;beginLevel():void};
    expect(inner.openingStep).toBe(false); // the opening step is spent and a point is already on its way down
    expect(inner.pointY).toBeGreaterThan(0);
    inner.beginLevel(); // a cleared array or a lost life reloads the level through the same path
    expect([inner.openingStep,inner.pointY,inner.pointTimer,inner.pointRespawn]).toEqual([true,-1,24,120]);
    let ticks=0;
    while(rows(game)[0]!=='..........'&&ticks++<600)game.step(NEUTRAL_BRICK_INPUT);
    expect(rows(game).slice(0,6)).toEqual(['..........','##########','##########','.########.','.########.','..######..']);
  });

  it('fires into the selected column when ROTATE is held',()=>{
    const game=new E23Array({seed:7});game.start();
    for(let tick=0;tick<90;tick++)game.step(NEUTRAL_BRICK_INPUT);
    for(let tick=0;tick<50;tick++)game.step(makeBrickInput(tick===0?['rotate']:[],['rotate']));
    expect(game.score).toBeGreaterThan(0);
    expect(rows(game).slice(0,6).some(row=>row[4]==='.')).toBe(true);
  });
});
