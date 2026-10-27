import {expect,it} from 'vitest';
import {FMConsole} from '../../src/brick/fmConsole';
import {makeBrickInput,NEUTRAL_BRICK_INPUT} from '../../src/brick/types';
it('FM-38 powers into autoplay, configures A/B and starts a fresh voluntary game',()=>{
 const c=new FMConsole({seed:7});c.powerOn();const before=c.cells();
 for(let i=0;i<180;i++)c.menu(NEUTRAL_BRICK_INPUT);
 expect(c.cells()).not.toEqual(before);expect(c.inMenu).toBe(true);expect(c.score).toBe(0);
 c.menu(makeBrickInput(['down','right','left']));expect(c.mode).toBe(1);expect(c.displaySpeed).toBe(1);expect(c.displayLevel).toBe(1);
 c.start();expect(c.phase).toBe('playing');expect(c.inMenu).toBe(false);expect(c.score).toBe(0);expect(c.game.id).toBe('pentix');
 c.pause();const paused=c.cells();for(let i=0;i<50;i++)c.step(NEUTRAL_BRICK_INPUT);expect(c.cells()).toEqual(paused);
 c.resume();expect(c.phase).toBe('playing');
 c.restart();expect(c.inMenu).toBe(true);expect(c.mode).toBe(1);
});
