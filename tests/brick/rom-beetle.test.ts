import { describe, expect, it } from 'vitest';
import reference from '../fixtures/brickemu/rom-arcade.json';
import { BeetleGame, B0202_BEETLE_MASKS } from '../../src/brick/games/beetle';
import { LIBRARY_GAMES } from '../../src/brick/games/library';
import { NEUTRAL_BRICK_INPUT as idle, makeBrickInput as input } from '../../src/brick/types';
import { BRICK_GUIDES } from '../../src/brick/guides';
import { guideProblems } from '../../src/brick/guide';
const run=(g:BeetleGame,n:number)=>{for(let i=0;i<n;i++)g.step(idle);};
describe('Beetle B0202 D01 reference',()=>{
  it('keeps the canonical main slot; the seven wiki variants retain their implementation',()=>{
    expect(LIBRARY_GAMES.honeybee.create({mode:0})).toBeInstanceOf(BeetleGame);
    expect(LIBRARY_GAMES.honeybee.create({mode:8})).toBeInstanceOf(BeetleGame);
    for(let mode=1;mode<8;mode++)expect(LIBRARY_GAMES.honeybee.create({mode})).not.toBeInstanceOf(BeetleGame);
    expect(guideProblems(BRICK_GUIDES.honeybee!)).toEqual([]);
  });
  it('uses the original reserve masks and a four-enemy one-cell diagonal step at the recorded period',()=>{
    expect(B0202_BEETLE_MASKS).toEqual(reference.beetle.formationMasks);
    const g=new BeetleGame();g.start();
    expect(g.enemies).toEqual([0,2,4,6].map(x=>({x,y:16})));
    let last=g.enemies[0]!.y;const ticks:number[]=[];
    for(let t=1;t<150;t++){g.step(idle);if(g.enemies[0]!.y!==last){ticks.push(t);last=g.enemies[0]!.y;}}
    const steps=reference.beetle.steps;
    const measured=(steps.at(-1)!.cycle-steps[0]!.cycle)/(steps.length-1)/690;
    expect(Math.abs((ticks.at(-1)!-ticks[0]!)*1000/60/(ticks.length-1)-measured)).toBeLessThan(1000/60);
    expect(g.enemies.every(e=>e.x>=0&&e.x<10)).toBe(true);
  });
  for(const hit of reference.beetle.hits)it(`one ray hits at y=${hit.target[1]}, scores ${hit.points} and consumes the rightmost reserve`,()=>{
    const g=new BeetleGame();g.start();g.enemies=[{x:4,y:hit.target[1]!}];
    g.step(input(['rotate']));expect(g.score).toBe(hit.points);
    expect(g.enemies[0]).toEqual({x:hit.replacement[0],y:hit.replacement[1]});
    expect(g.formation[178]).toBe(0);
  });
  it('holding ROTATE does not auto-fire; a miss is safe; the reserve cannot be shot directly',()=>{
    const g=new BeetleGame();g.start();g.enemies=[];
    for(let t=0;t<100;t++)expect(g.step(input([],['rotate'])).some(e=>e.type==='shot')).toBe(false);
    const reserve=g.formation.slice();g.step(input(['rotate']));expect(g.score).toBe(0);expect(g.formation).toEqual(reserve);
  });
  it('wraps missed enemies, loses a life only at contact, and advances after reserves without a +100 bonus',()=>{
    const g=new BeetleGame();g.start();g.x=4;g.enemies=[{x:0,y:2}];run(g,27);
    expect(g.enemies[0]!.y).toBe(16);expect(g.lives).toBe(4);
    const h=new BeetleGame();h.start();h.enemies=[{x:4,y:2}];run(h,27);expect(h.lives).toBe(3);
    const win=new BeetleGame();win.start();win.enemies=[{x:4,y:10}];win.formation.fill(0);
    win.step(input(['rotate']));expect(win.score).toBe(1);expect(win.level).toBe(2);
    expect(win.enemies[0]!.y).toBe(17);expect(win.enemies[0]!.x).toBe(7);
  });
});
