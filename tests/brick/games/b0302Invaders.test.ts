import { describe, expect, it } from 'vitest';
import { B0302Invaders } from '../../../src/devices/b0302-invaders';
import { NEUTRAL_BRICK_INPUT } from '../../../src/brick/types';

describe('17-row array shooter', () => {
  it('keeps the wall, gun and projectile updates within the physical field', () => {
    const game=new B0302Invaders({seed:7});
    game.start();
    for(let i=0;i<300;i++) {
      game.step(NEUTRAL_BRICK_INPUT);
      expect([...game.cells().slice(170)].every(cell=>cell===0)).toBe(true);
    }
  });
});
