import { afterEach, expect, it, vi } from 'vitest';
import { BrickAudio, brickSound } from '../../src/audio/brick';
import { BRICK_PHRASES } from '../../src/audio/brickPhrases';
import rom from '../fixtures/brickemu/b0202.json';
import { MASTER_GAIN } from '../../src/audio/beeper';
afterEach(() => vi.unstubAllGlobals());
function harness() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const voices: {
    type: string;
    frequency: ReturnType<typeof param>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const gains: { gain: ReturnType<typeof param>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createGain: () => {
      const gain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    createOscillator: () => {
      const voice = { type: '', frequency: param(), start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null };
      voices.push(voice);
      return voice;
    },
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context;
      }
    },
  );
  vi.stubGlobal('fetch', vi.fn());
  return { port: new BrickAudio(), context, voices, gains };
}
it('maps effects without duplicate death cues', () => {
  expect(brickSound({ type: 'crash' }, 'tank', false)).toBe('kaboom');
  expect(brickSound({ type: 'lifeLost' }, 'tank', false)).toBeNull();
  expect(brickSound({ type: 'started' }, 'tank', false)).toBe('start');
  expect(brickSound({ type: 'started' }, 'tetris', false)).toBe('select');
  expect(brickSound({ type: 'lines', count: 4 }, 'tetris', false)).toBe('tetris');
});
it('plays the first gesture immediately with no fetch or decoded recording', () => {
  const { port, voices } = harness();
  port.play({ type: 'shot' }, 'tank', false);
  expect(voices).toHaveLength(0);
  port.unlock();
  port.play({ type: 'shot' }, 'tank', false);
  expect(voices).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(voices[0]?.type).toBe('square');
  expect(voices[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(620, 0);
  expect(voices[0]?.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1450, 0.13);
  expect(voices[0]?.stop).toHaveBeenCalledWith(0.13);
});
it('schedules the transcribed startup melody as one channel and releases ended nodes', () => {
  const { port, voices, gains } = harness();
  port.unlock();
  port.play({ type: 'started' }, 'tank', false);
  expect(voices).toHaveLength(1);
  expect(voices[0]?.frequency.setValueAtTime.mock.calls.map((c) => c[0])).toEqual([550, 690, 820, 550, 690, 820, 1100]);
  expect(voices[0]?.stop.mock.calls[0]?.[0]).toBeCloseTo(1.4256);
  voices[0]!.onended!();
  expect(voices[0]?.disconnect).toHaveBeenCalled();
  expect(gains[1]?.disconnect).toHaveBeenCalled();
});
it('priority, pause, mute and disposal cancel scheduled notes', () => {
  const { port, voices, context, gains } = harness();
  port.unlock();
  port.play({ type: 'win' }, 'tank', false);
  port.play({ type: 'move' }, 'tank', false);
  expect(voices).toHaveLength(1);
  port.play({ type: 'paused' }, 'tank', false);
  expect(gains[1]?.disconnect).toHaveBeenCalledOnce();
  port.play({ type: 'shot' }, 'tank', false);
  expect(voices).toHaveLength(2);
  port.setMuted(true);
  expect(gains[2]?.disconnect).toHaveBeenCalledOnce();
  port.play({ type: 'shot' }, 'tank', false);
  expect(voices).toHaveLength(2);
  port.setVolume(0.5);
  port.setMuted(false);
  expect(gains[0]?.gain.value).toBeCloseTo(0.5 * MASTER_GAIN);
  port.setVolume(NaN);
  expect(gains[0]?.gain.value).toBeCloseTo(0.25 * MASTER_GAIN);
  port.dispose();
  port.dispose();
  port.unlock();
  expect(context.close).toHaveBeenCalledOnce();
  port.play({ type: 'shot' }, 'tank', false);
  expect(voices).toHaveLength(2);
});
it('does not queue stale cues while suspended, but permits the unlocking gesture', () => {
  const { port, context, voices } = harness();
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  port.unlock();
  context.state = 'suspended';
  port.play({ type: 'shot' }, 'tank', false);
  expect(voices).toHaveLength(1);
  now = 1000;
  port.play({ type: 'shot' }, 'tank', false);
  expect(voices).toHaveLength(1);
  vi.restoreAllMocks();
});
it('remains usable without Web Audio', () => {
  vi.stubGlobal('AudioContext', undefined);
  const port = new BrickAudio();
  expect(() => {
    port.unlock();
    port.play({ type: 'shot' }, 'tank', false);
    port.dispose();
  }).not.toThrow();
});
it('uses bounded tone schedules, including deterministic pitched noise', () => {
  for (const notes of Object.values(BRICK_PHRASES))
    for (const note of notes) {
      expect(note.ms).toBeGreaterThan(0); // Original channel 10 uses 2.048 ms steps.
      expect(note.hz).toBeGreaterThanOrEqual(0);
      // E88 sound ROM includes notes above 5 kHz; keep the original frequencies.
      expect(note.hz).toBeLessThan(16000);
    }
  const { port, voices } = harness();
  port.unlock();
  port.play({ type: 'crash' }, 'tank', false);
  const first = voices[0]!.frequency.setValueAtTime.mock.calls;
  port.play({ type: 'crash' }, 'tank', false);
  expect(voices[1]!.frequency.setValueAtTime.mock.calls).toEqual(first);
  expect(first.length).toBeGreaterThan(200);
});

it('Simon/Dance tones survive startup/reward cues and use their actual tick duration', () => {
  const { port, voices, context } = harness();
  port.unlock();
  port.play({ type: 'started' }, 'simon', false);
  port.play({ type: 'tone', pad: 0, ticks: 25 }, 'simon', false);
  port.play({ type: 'bonus' }, 'simon', false);
  expect(voices).toHaveLength(2);
  expect(voices[1]?.frequency.setValueAtTime).toHaveBeenCalledWith(523, 0);
  expect(voices[1]?.stop).toHaveBeenCalledWith(25 / 60);
  context.currentTime = 1;
  port.play({ type: 'tone', pad: 3, ticks: 12 }, 'dance', false);
  expect(voices[2]?.frequency.setValueAtTime).toHaveBeenCalledWith(330, 1);
  expect(voices[2]?.stop).toHaveBeenCalledWith(1.2);
  port.play({ type: 'paused' }, 'dance', false);
  expect(voices[2]?.stop).toHaveBeenCalledWith();
});

it('B0202 rotation mixes the measured tone and noise channels; mute stops both', () => {
  const { port, voices, gains } = harness();
  port.unlock();
  port.play({ type: 'rotate' }, 'tetris', false);
  expect(voices).toHaveLength(2);
  expect(voices[0]?.frequency.setValueAtTime.mock.calls.map(([hz]) => hz)).toEqual([
    2679.5196533203125, 2358.3984375, 2105.712890625, 1895.1416015625, 1726.6845703125, 1516.11328125, 1305.5419921875, 1094.970703125,
    884.3994140625,
  ]);
  expect(voices[1]?.frequency.setValueAtTime.mock.calls[0]?.[0]).toBe(1516.11328125);
  port.setMuted(true);
  for (const gain of gains.slice(1)) expect(gain.disconnect).toHaveBeenCalled();
  for (const voice of voices) expect(voice.stop).toHaveBeenCalledWith();
});

for (const [key, sound] of [
  ['Left', 'b0202_move'],
  ['Rotate', 'b0202_turn'],
] as const) {
  it(`${sound} follows the executed ROM channel commands`, () => {
    const commands = rom.b0202.effects[key];
    const first = commands.find((command) => command.tone)!;
    for (const channel of [1, 2]) {
      const trace = commands.filter((command) => command.channel === channel);
      const notes = BRICK_PHRASES[sound].filter((note) => ('track' in note ? note.track : 0) === channel - 1);
      const sounding = trace.filter((command) => command.tone);
      expect(notes).toHaveLength(sounding.length);
      sounding.forEach((command, index) => {
        const note = notes[index]!;
        const next = trace[trace.indexOf(command) + 1]!;
        expect(note.hz).toBeCloseTo(command.tone![0] as number, 9);
        expect(note.gain).toBe(command.tone![2]);
        expect(note.ms).toBeCloseTo((next.cycle - command.cycle) / 690, 5);
        if ('atMs' in note) expect(note.atMs).toBeCloseTo((command.cycle - first.cycle) / 690, 5);
      });
    }
  });
}

it('a terminal game cue can interrupt a pad tone instead of being lost', () => {
  const { port, voices, context, gains } = harness();
  port.unlock();
  port.play({ type: 'tone', pad: 0, ticks: 25 }, 'simon', false);
  context.currentTime = 0.1;
  port.play({ type: 'gameOver' }, 'simon', false);
  expect(gains[1]?.disconnect).toHaveBeenCalledOnce();
  expect(voices).toHaveLength(2);
  expect(voices[1]?.frequency.setValueAtTime).toHaveBeenCalledWith(BRICK_PHRASES.game_over[0]!.hz, 0.1);
});

it('selects E88-native menu/start cues without borrowing B0202 Tetris effects',()=>{
  expect(brickSound({type:'move'},'tetris',true,'e88')).toBe('e88_menu');
  expect(brickSound({type:'started'},'tetris',false,'e88')).toBe('e88_tetris_music');
  expect(brickSound({type:'rotate'},'tetris',false,'e88')).toBe('e88_turn');
  expect(brickSound({type:'rotate'},'tetris',false,'apollo-b0202')).toBe('b0202_turn');
  const {port,voices}=harness();port.unlock();port.play({type:'move'},'tetris',true,'e88');
  expect(voices).toHaveLength(1);port.setMuted(true);expect(voices[0]!.stop).toHaveBeenCalled();
  port.dispose();expect(fetch).not.toHaveBeenCalled();
});

it('E88 plays both Korobeiniki parts while effects remain audible; pause/resume preserves the music cursor',()=>{
 const {port,voices,context,gains}=harness();port.unlock();port.play({type:'started'},'tetris',false,'e88');
 expect(voices[0]!.stop.mock.calls[0]![0]).toBeCloseTo(9.961464,4);
 context.currentTime=1;port.play({type:'move'},'tetris',false,'e88');
 expect(voices).toHaveLength(2);expect(gains[1]!.disconnect).not.toHaveBeenCalled();
 context.currentTime=2;port.play({type:'paused'},'tetris',false,'e88');
 expect(gains[1]!.disconnect).toHaveBeenCalled();expect(gains[2]!.disconnect).toHaveBeenCalled();
 context.currentTime=20;port.play({type:'resumed'},'tetris',false,'e88');
 expect(voices[2]!.stop.mock.calls[0]![0]).toBeCloseTo(27.961464,4);
 port.setMuted(true);expect(gains[3]!.disconnect).toHaveBeenCalled();
 port.setMuted(false);port.play({type:'resumed'},'tetris',false,'e88');expect(voices).toHaveLength(3);
 port.dispose();expect(fetch).not.toHaveBeenCalled();
});
it('terminal cues and explicit silence stop the E88 melody, with no delayed restart',()=>{
 const {port,voices,gains}=harness();port.unlock();port.play({type:'started'},'tetris',false,'e88');
 port.play({type:'gameOver'},'tetris',false,'e88');expect(gains[1]!.disconnect).toHaveBeenCalled();
 port.silence();port.play({type:'resumed'},'tetris',false,'e88');expect(voices).toHaveLength(2);
});
