import { describe, expect, it } from 'vitest';
import reference from '../fixtures/brickemu/rom-arcade.json';
import { SnakeGame } from '../../src/brick/games/library/arcade';
import { DiceGame, diceValue } from '../../src/brick/games/dice';
import { NEUTRAL_BRICK_INPUT as idle, makeBrickInput as input } from '../../src/brick/types';
import { E88_EFFECTS } from '../../src/audio/e88Effects';
import { brickSound } from '../../src/audio/brick';

const run = (g: SnakeGame | DiceGame, ticks: number) => { for (let t = 0; t < ticks; t++) g.step(idle); };
const diceGame = () => { const g = new DiceGame({ seed: 1 }); g.start(); g.step(input(['right'])); return g; };
const stop = (g: DiceGame, dice: number[]) => { g.dice = dice; g.step(input(['down'])); };

describe('independent original ROM observations', () => {
  for (const [device, traces] of Object.entries(reference.snake)) for (const trace of traces.speeds) {
    it(`${device}, Snake speed ${trace.speedDigit}: steady movement agrees with the ROM median (food redraw stalls excluded)`, () => {
      const g = new SnakeGame({ speed: trace.speedDigit + 1 }); g.start(); g.food = 0;
      g.step(input(['up']));
      const rows: number[] = []; let y = Math.floor(g.body[0]! / 10);
      for (let t = 1; rows.length < 8 && t < 600; t++) {
        g.step(idle); const next = Math.floor(g.body[0]! / 10);
        if (next !== y) { rows.push(t); y = next; }
      }
      const expectedMs = trace.medianPeriodMs * 7;
      expect(rows).toHaveLength(8);
      expect(Math.abs((rows[7]! - rows[0]!) * 1000 / 60 - expectedMs)).toBeLessThan(1000 / 60 + 2);
    });
  }
  it('agrees with the executed B0202 pair-evaluator on all 1296 four-die combinations', () => {
    let index = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) for (let d = 1; d <= 6; d++) {
      const raw = reference.dice.rawValues[index++]!;
      expect(diceValue([a,b,c,d]), `dice ${a}${b}${c}${d}`).toBe(raw === 0 || raw === 255 ? raw : raw + 2);
    }
    expect(index).toBe(1296);
  });
  for (const [channel, sound] of [[0,'e88_move'],[5,'e88_bonus'],[11,'e88_crash'],[12,'e88_win'],[13,'e88_over'],[14,'e88_start']] as const) {
    it(`synthesizes every audible ROM frequency/duration in sound channel ${channel}`, () => {
      const commands = reference.audio.channels[String(channel) as keyof typeof reference.audio.channels];
      const expected: {hz:number;ms:number;noise:boolean}[] = [];
      for (let i = 0; i < commands.length - 1; i++) {
        const a = commands[i]!, b = commands[i + 1]!, hz = a.tone?.[0] ?? 0, noise = !!a.tone?.[1], ms = (b.cycle-a.cycle)/1000;
        const last = expected.at(-1);
        if (last && last.hz === hz && last.noise === noise) last.ms += ms;
        else expected.push({hz,ms,noise});
      }
      while (expected.at(-1)?.hz === 0) expected.pop();
      const notes = E88_EFFECTS[sound]; expect(notes).toHaveLength(expected.length);
      notes.forEach((note, i) => { expect(note.hz).toBe(expected[i]!.hz); expect(note.ms).toBeCloseTo(expected[i]!.ms, 5); expect('noise' in note && note.noise).toBe(expected[i]!.noise); });
    });
  }
});

describe('Snake input rules from E88', () => {
  it('starts at the bottom with three cells; ROTATE moves up immediately, holding adds no turbo', () => {
    const g = new SnakeGame(); g.start(); g.food = 0;
    expect(g.body).toEqual([195,194,193]);
    g.step(input(['rotate'], ['rotate'])); expect(g.body[0]).toBe(185);
    for (let t=0;t<19;t++) g.step(input([],['rotate'])); expect(g.body[0]).toBe(185);
    g.step(idle); expect(g.body[0]).toBe(175);
  });
  it('opposite input reverses a curved body, using the outward direction of the former tail', () => {
    const g = new SnakeGame(); g.start(); g.food = 0;
    g.body = [105,104,114,113]; g.directionNow = 1;
    g.step(input(['left'])); expect(g.body).toEqual([113,114,104,105]); expect(g.directionNow).toBe(3);
    g.step(input(['left'])); expect(g.body).toEqual([112,113,114,104]);
  });
  it('pause preserves fractional timing; rapid up/left inputs take distinct legal steps', () => {
    const a=new SnakeGame(), b=new SnakeGame(); for (const g of [a,b]) {g.start();g.food=0;run(g,7);}
    a.pause();run(a,300);a.resume();
    for(let t=0;t<45;t++){a.step(idle);b.step(idle);expect(a.body).toEqual(b.body);}
    const c=new SnakeGame();c.start();c.step(input(['up']));c.step(input(['left']));expect(c.body[0]).toBe(184);
  });
  it('routes real Snake signals to the original single sound channel, without a sampled recording', () => {
    expect(brickSound({type:'move'},'snake',false)).toBe('e88_move');
    expect(brickSound({type:'bonus'},'snake',false)).toBe('e88_bonus');
    expect(brickSound({type:'move'},'snake',true)).toBe('select');
  });
});

describe('Dice bank, wager and settlement rules', () => {
  it('starts with 1000; RIGHT purchases a 10-point wager and cannot exceed the bank or 100 units', () => {
    const g=diceGame();expect(g.score).toBe(990);expect(g.stake).toBe(1);
    for(let n=0;n<110;n++)g.step(input(['right']));expect(g.stake).toBe(100);expect(g.score).toBe(0);expect(g.phase).toBe('playing');
  });
  it('a paid bet survives an invalid throw and a push; it is not charged twice', () => {
    const g=diceGame();g.step(input(['rotate']));stop(g,[1,2,3,4]);expect(g.stage).toBe('bank');expect(g.stake).toBe(1);
    g.step(input(['rotate']));stop(g,[1,1,3,4]);expect(g.bankerValue).toBe(7);expect(g.stage).toBe('player');
    g.step(input(['rotate']));stop(g,[2,2,3,4]);expect(g.stage).toBe('bet');expect(g.score).toBe(990);expect(g.stake).toBe(1);
  });
  it('START/P changes bigger/smaller; explicit Pause remains a real pause', () => {
    const g=diceGame();g.startButton();expect(g.prediction).toBe('lower');expect(g.phase).toBe('playing');
    g.pause();const cells=g.cells();run(g,300);expect(g.cells()).toEqual(cells);expect(g.stage).toBe('bet');g.resume();
    g.step(input(['rotate']));g.startButton();expect(g.prediction).toBe('lower');
  });
  it('a winning comparison returns two wager units; four equal dice return four units', () => {
    for(const [dice,bank] of [[[2,2,5,6],1010],[[5,5,5,5],1030]] as const){
      const g=diceGame();g.step(input(['rotate']));stop(g,[1,1,3,4]);g.step(input(['rotate']));stop(g,[...dice]);expect(g.score).toBe(bank);expect(g.peakBank).toBe(bank);
    }
  });
  it('banker four-of-a-kind takes the wager immediately; a losing comparison also costs the paid stake', () => {
    const g=diceGame();g.step(input(['rotate']));stop(g,[6,6,6,6]);expect(g.stage).toBe('result');expect(g.score).toBe(990);
    const h=diceGame();h.step(input(['rotate']));stop(h,[2,2,5,6]);h.step(input(['rotate']));stop(h,[1,1,2,3]);expect(h.score).toBe(990);
  });
  it('publishes the maximum bank of this party at bankruptcy, never a previous party hi-score', () => {
    const g=new DiceGame({hiScore:9999});g.start();for(let i=0;i<100;i++)g.step(input(['right']));
    g.step(input(['rotate']));stop(g,[6,6,6,6]);run(g,60);expect(g.score).toBe(1000);expect(g.hiScore).toBe(9999);
    run(g,300);expect(g.phase).toBe('over');g.start();expect(g.score).toBe(1000);expect(g.stake).toBe(0);expect(g.stage).toBe('bet');
  });
});
