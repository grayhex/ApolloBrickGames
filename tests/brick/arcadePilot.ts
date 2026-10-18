import type {ShooterGame} from '../../src/brick/games/library/action';
import {makeBrickInput,type BrickInput} from '../../src/brick/types';
/** Aiming with travel-time lead, six-tick steering and dodging visible approaching shots.
 * This is a test player, not a source of gameplay decisions in the application. */
export function arcadePilot(g:ShooterGame,t=g.tick):BrickInput {
  const aim=g['weakPoint']??g.targets.toSorted((a,b)=>b.y-a.y)[0];let target=aim?.x??4;
  if(aim){const period=g['period'](45,16);let steps=Math.floor(((17-aim.y)*4+g['timer']%period)/period),dx=g['directionNow'],left=Math.min(...g.targets.map(p=>p.x)),right=Math.max(...g.targets.map(p=>p.x));
    while(steps-->0){if(left+dx<0||right+dx>9)dx*=-1;else{target+=dx;left+=dx;right+=dx;}}
  }
  const safe=Array.from({length:9},(_,x)=>x).filter(x=>!g.bullets.some(b=>b.enemy&&b.y>=12&&b.y<=18&&Math.abs(b.x-x)<=1));
  if(safe.length)target=safe.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0]!;
  const keys=t%6===0&&g.x!==target?[g.x<target?'right' as const:'left' as const]:[];
  return makeBrickInput(keys,['rotate']);
}
