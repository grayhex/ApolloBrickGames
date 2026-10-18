import {expect,it} from 'vitest';
import trace from '../fixtures/brickemu/e88-audio.json';
import {E88_TETRIS_EFFECTS as sounds} from '../../src/audio/e88TetrisEffects';
import {brickSound} from '../../src/audio/brick';
const decode=(key:keyof typeof trace.channels)=>{
 const notes:{hz:number;ms:number;noise?:boolean}[]=[];
 const commands=trace.channels[key];
 for(let i=0;i<commands.length-1;i++){
  const a=commands[i]!,b=commands[i+1]!,hz=a.tone?.[0]??0,noise=!!a.tone?.[1],ms=(b.cycle-a.cycle)/1000,last=notes.at(-1);
  if(last&&last.hz===hz&&!!last.noise===noise)last.ms+=ms;
  else notes.push({hz,ms,...(noise?{noise:true}:{})});
 }
 return notes;
};
for(const [channel,key]of [['3','e88_lock'],['4','e88_hit'],['10','e88_turn']]as const){
 it(`replays every decoded frequency and duration from E88 channel ${channel}`,()=>{
  const expected=decode(channel);expect(sounds[key]).toHaveLength(expected.length);
  sounds[key].forEach((note,i)=>{expect(note.hz).toBe(expected[i]!.hz);expect(note.ms).toBeCloseTo(expected[i]!.ms,6);expect('noise'in note&&note.noise).toBe(!!expected[i]!.noise);});
 });
}
it('includes both original Korobeiniki channels, with all 128 sound-ROM steps',()=>{
 expect(trace.startup.map(c=>c.channel)).toEqual([14,15]);
 const expected=[...decode('14'),...decode('15')];expect(sounds.e88_tetris_music).toHaveLength(expected.length);
 expected.forEach((note,i)=>{expect(sounds.e88_tetris_music[i]!.hz).toBe(note.hz);expect(sounds.e88_tetris_music[i]!.ms).toBeCloseTo(note.ms,6);});
 expect(trace.channels['14']).toHaveLength(65);expect(trace.channels['15']).toHaveLength(65);
});
it('routes Tetris actions to channels observed in executed ROM input and prepared wells',()=>{
 expect(trace.actions.Left.map(c=>c.channel)).toEqual([0]);expect(trace.actions.Rotate.map(c=>c.channel)).toEqual([10]);
 expect(brickSound({type:'move'},'tetris',false,'e88')).toBe('e88_move');
 expect(brickSound({type:'rotate'},'tetris',false,'e88')).toBe('e88_turn');
 for(const row of trace.clears){
  expect(row.commands.some(c=>c.channel===3)).toBe(true);
  expect(row.commands.filter(c=>c.channel===11)).toHaveLength(row.rows);
  if(row.rows)expect(brickSound({type:'lines',count:row.rows},'tetris',false,'e88')).toBe(`e88_lines_${row.rows}`);
 }
});
for(const count of [1,2,3,4] as const)it(`preserves channel 11 and ROM retrigger timing for ${count} cleared rows`,()=>{
 const commands=trace.clears[count]!.commands.filter(c=>c.channel===11);
 const expected:{hz:number;ms:number;noise?:boolean}[]=[];
 commands.forEach((command,index)=>{
  let remaining=index+1<commands.length ? (commands[index+1]!.cycle-command.cycle)/1000 : Infinity;
  for(const note of decode('11')){
   if(remaining<=0)break;
   const ms=Math.min(note.ms,remaining);expected.push({...note,ms});remaining-=ms;
  }
 });
 const actual=sounds[`e88_lines_${count}`];expect(actual).toHaveLength(expected.length);
 actual.forEach((note,i)=>{expect(note.hz).toBe(expected[i]!.hz);expect(note.ms).toBeCloseTo(expected[i]!.ms,6);});
});
