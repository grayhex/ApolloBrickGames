import { describe, expect, it } from 'vitest';
import reference from '../fixtures/brickemu/rom-arcade.json';
import { B0202FrogGame, B0202_FROG_LENGTHS, b0202FrogPeriod } from '../../src/brick/games/frogger/b0202';
import { froggerDef } from '../../src/brick/games/frogger';
import { NEUTRAL_BRICK_INPUT as idle, makeBrickInput as input } from '../../src/brick/types';
import { BRICK_GUIDES } from '../../src/brick/guides';
import { guideProblems } from '../../src/brick/guide';

describe('Frog A01 reference, original B0202 code', () => {
  it('uses the observed row scheduler and six successive original road states, without random-stage assumptions', () => {
    const g=new B0202FrogGame();g.start();
    expect(B0202_FROG_LENGTHS).toEqual(reference.frog.runLengths);
    let previous=g.cells().slice(0,190).join('');
    for(const [index,trace] of reference.frog.roadGroups.entries()){
      let ticks=0;
      while(g.cells().slice(0,190).join('')===previous && ticks++<100)g.step(idle);
      const expected=new Uint8Array(190);for(const [x,y] of trace.cells)if(y!<19)expected[y!*10+x!]=1;
      expect(g.cells().slice(0,190),`group ${index}; expected ${Array.from({length:19},(_,y)=>[...expected.slice(y*10,y*10+10)].join('')).join('/')}; got ${Array.from({length:19},(_,y)=>[...g.cells().slice(y*10,y*10+10)].join('')).join('/')}`).toEqual(expected);previous=g.cells().slice(0,190).join('');
    }
    const groups=reference.frog.roadGroups;
    for(let i=1;i<groups.length;i++)expect(Math.abs((groups[i]!.cycle-groups[i-1]!.cycle)/690-b0202FrogPeriod(1)*1000/60)).toBeLessThan(1);
  });
  it('replays normal steps: one row per ROTATE and one column per horizontal press', () => {
    const g=new B0202FrogGame();g.start();
    for(const trace of reference.frog.moves){
      g.step(input([trace.key==='Rotate'?'rotate':trace.key==='Left'?'left':trace.key==='Right'?'right':'down']));
      expect([g.x,g.y]).toEqual(trace.head);
      g.step(idle);
    }
  });
  for(const crossing of reference.frog.crossings)it(`crossing scores ${crossing.score} at speed digit ${crossing.speedDigit}; no ten-home goal`,()=>{
    const g=new B0202FrogGame({speed:crossing.speedDigit+1});g.start();g.road.fill(0);g.y=17;
    g.step(input(['rotate']));expect(g.score).toBe(crossing.score);expect(g.y).toBe(19);
    for(let i=0;i<117;i++)g.step(idle);expect([g.x,g.y]).toEqual(crossing.head);
  });
  it('preserves canonical indices and the other documented donor variants',()=>{
    expect(froggerDef.modes).toHaveLength(16);expect(froggerDef.create({mode:0})).toBeInstanceOf(B0202FrogGame);
    expect(froggerDef.create({mode:16})).toBeInstanceOf(B0202FrogGame);
    expect(froggerDef.create({mode:1})).not.toBeInstanceOf(B0202FrogGame);
    expect(guideProblems(BRICK_GUIDES.frog!)).toEqual([]);
  });
});
