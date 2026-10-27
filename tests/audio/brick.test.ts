import { afterEach, expect, it, vi } from 'vitest';
import { BrickAudio, brickSound, seekTones } from '../../src/audio/brick';
import { BRICK_PHRASES } from '../../src/audio/brickPhrases';
import rom from '../fixtures/brickemu/b0202.json';
import b0302Tune from '../fixtures/brickemu/b0302-tetris-tune.json';
import { MASTER_GAIN } from '../../src/audio/beeper';
afterEach(() => vi.unstubAllGlobals());
it('FM-38 switches synthesized melodies, keeps them through demo settings and resumes after pause',()=>{
  expect(brickSound({type:'started'},'tetris',false,'fm38-0')).toBe('fm38_korobeiniki');
  expect(brickSound({type:'started'},'pentix',false,'fm38-1')).toBe('fm38_joy');
  const {port,voices,context}=harness();port.unlock();
  port.play({type:'started'},'tetris',false,'fm38-0');
  const first=voices[0]!;
  port.play({type:'move'},'tetris',true,'fm38-0');
  expect(first.stop).toHaveBeenCalledTimes(1); // only its scheduled natural end
  port.play({type:'started'},'tetris',false,'fm38-1');
  expect(first.stop).toHaveBeenCalledTimes(2);
  const joy=voices[2]!;
  expect(joy.type).toBe('square');
  expect(joy.frequency.setValueAtTime.mock.calls.slice(0,3).map(call=>call[0])).toEqual([76,76,77].map(midi=>440*2**((midi-69)/12)));
  context.currentTime=1;
  port.play({type:'paused'},'tetris',false,'fm38-1');
  expect(joy.stop).toHaveBeenCalledTimes(2);
  port.play({type:'resumed'},'tetris',false,'fm38-1');
  expect(voices).toHaveLength(4);
  expect(voices[3]!.frequency.setValueAtTime.mock.calls[0]![0]).toBe(440*2**((77-69)/12));
  port.dispose();
});
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
it('B0302 Tetris plays the measured tone-channel melody without cutting it on movement',()=>{
  expect(BRICK_PHRASES.b0302_tetris_music).toEqual(b0302Tune.notes);
  expect(brickSound({type:'started'},'tetris',false,'apollo-b0302')).toBe('b0302_tetris_music');
  expect(brickSound({type:'started'},'racing',false,'apollo-b0302')).toBe('start');
  const {port,voices}=harness();port.unlock();
  port.play({type:'started'},'tetris',false,'apollo-b0302');
  expect(voices).toHaveLength(1);
  expect(voices[0]!.frequency.setValueAtTime.mock.calls[0]![0]).toBe(b0302Tune.notes[0]!.hz);
  port.play({type:'move'},'tetris',false,'apollo-b0302');
  expect(voices).toHaveLength(2);
  expect(voices[0]!.stop).toHaveBeenCalledTimes(1);
});
it('Sea Battle: intro, its flashes, Romeo music and the falling-figure tick are only mapped for the sea profile', () => {
  expect(brickSound({ type: 'intro' }, 'sea-battle', true, 'sea')).toBe('sea_intro');
  expect(brickSound({ type: 'introFx' }, 'sea-battle', true, 'sea')).toBe('sea_blast');
  expect(brickSound({ type: 'step' }, 'romeo-juliet', false, 'sea')).toBe('sea_fall_tick');
  expect(brickSound({ type: 'step' }, 'sea-battle', false, 'sea')).toBeNull();
  expect(brickSound({ type: 'introFx' }, 'sea-battle', true)).toBeNull();
  expect(brickSound({ type: 'started' }, 'romeo-juliet', false, 'sea')).toBe('sea_romeo_music');
  expect(brickSound({ type: 'started' }, 'romeo-juliet', false)).toBe('start');
  // Музыка партии (владелец): у всех игр, кроме A, мелодия «Ромео» по кругу; в игре A один раз, без повтора, мелодия заставки.
  for (const game of ['tank', 'tetris', 'romeo-juliet']) expect(brickSound({ type: 'started' }, game, false, 'sea')).toBe('sea_romeo_music');
  expect(brickSound({ type: 'started' }, 'sea-battle', false, 'sea')).toBe('sea_intro_once');
  expect(brickSound({ type: 'started' }, 'tank', false)).toBe('start');
  expect(brickSound({ type: 'intro' }, 'sea-battle', true)).toBeNull();
});
it('Sea Battle: game A plays the intro melody once and stops, other games play the Romeo music once', () => {
  const total = (notes: readonly { ms: number; atMs?: number; track?: number }[]) => Math.max(...notes.map((n) => (n.atMs ?? 0) + n.ms));
  expect(total(BRICK_PHRASES.sea_intro_once)).toBeLessThan(11000); // one pass: 10.435 s, no pause in front
  expect(total(BRICK_PHRASES.sea_romeo_music)).toBeLessThan(20000); // one pass
  expect(BRICK_PHRASES.sea_intro_once.every((tone) => tone.atMs === undefined || tone.atMs === 0)).toBe(true);
  const { port, voices } = harness();
  port.unlock();
  port.play({ type: 'started' }, 'tank', false, 'sea');
  expect(voices).toHaveLength(2);
  const first = voices[0]!;
  expect(first.stop.mock.calls[0]![0]).toBeGreaterThan(19);
  expect(first.stop.mock.calls[0]![0]).toBeLessThan(20);
  port.play({ type: 'started' }, 'sea-battle', false, 'sea'); // a new game: the previous music is cut
  expect(first.stop).toHaveBeenCalledTimes(2);
  expect(voices.slice(2).map((voice) => voice.stop.mock.calls[0]![0] as number).every((end) => end < 11)).toBe(true);
});
it('Sea Battle: background tunes use their own voices, so a key beep does not cut them, and the next menu event silences them', () => {
  const { port, voices } = harness();
  port.unlock();
  port.play({ type: 'started' }, 'romeo-juliet', false, 'sea');
  expect(voices).toHaveLength(2); // the two voices of the tune
  port.play({ type: 'move' }, 'romeo-juliet', false, 'sea'); // in-game beep layers over the music
  expect(voices).toHaveLength(3);
  expect(voices[0]!.stop).toHaveBeenCalledTimes(1); // only the scheduled end, not cut
  expect(voices[1]!.stop).toHaveBeenCalledTimes(1);
  port.play({ type: 'step' }, 'romeo-juliet', false, 'sea'); // falling-figure tick is a quiet effect, it layers too
  expect(voices[0]!.stop).toHaveBeenCalledTimes(1);
  port.play({ type: 'intro' }, 'sea-battle', true, 'sea');
  expect(voices[0]!.stop).toHaveBeenCalledTimes(2); // menu events silence everything first
  port.play({ type: 'move' }, 'sea-battle', true, 'sea');
  expect(voices.length).toBeGreaterThan(3);
});
it('Sea Battle: an intro flash plays over the intro melody without cutting it', () => {
  const { port, voices } = harness();
  port.unlock();
  port.play({ type: 'intro' }, 'sea-battle', true, 'sea');
  expect(voices).toHaveLength(2); // two voices of the tune
  expect(voices.map((voice) => voice.type)).toEqual(['square', 'square']);
  port.play({ type: 'introFx' }, 'sea-battle', true, 'sea');
  expect(voices).toHaveLength(3);
  expect(voices[0]!.stop).toHaveBeenCalledTimes(1); // the melody keeps going
  expect(voices[1]!.stop).toHaveBeenCalledTimes(1);
});
it('seekTones continues a two-voice tune from a given time on the shared clock', () => {
  const tune = [
    { hz: 800, ms: 100, track: 0, atMs: 50 },
    { hz: 900, ms: 200, track: 0 },
    { hz: 1000, ms: 400, track: 1, atMs: 0 },
  ];
  expect(seekTones(tune, 0)).toEqual([
    { hz: 800, ms: 100, track: 0, atMs: 50 },
    { hz: 900, ms: 200, track: 0, atMs: 150 },
    { hz: 1000, ms: 400, track: 1, atMs: 0 },
  ]);
  expect(seekTones(tune, 200)).toEqual([
    { hz: 900, ms: 150, track: 0, atMs: 0 },
    { hz: 1000, ms: 200, track: 1, atMs: 0 },
  ]);
  expect(seekTones(tune, 400)).toEqual([]);
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
  expect(brickSound({type:'started'},'tetris',false,'e23')).toBe('e88_tetris_music');
  expect(brickSound({type:'move'},'tetris',true,'e23')).toBe('e88_menu');
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

it('Sea intro repeats after the last voice, but game melodies stop and disposed loops cannot restart', () => {
  const { port, voices } = harness(); port.unlock();
  port.play({type:'intro'}, 'sea-battle', true, 'sea');
  voices[0]!.onended!(); expect(voices).toHaveLength(2);
  voices[1]!.onended!(); expect(voices).toHaveLength(4);
  port.silence(); voices[2]!.onended!(); voices[3]!.onended!(); expect(voices).toHaveLength(4);
  port.play({type:'started'}, 'romeo-juliet', false, 'sea');
  voices[4]!.onended!(); voices[5]!.onended!(); expect(voices).toHaveLength(6);
});

it('Sea falling-piece landings use the clean pitched cue instead of generic noise', () => {
  for (const game of ['tetris','romeo-juliet']) {
    expect(brickSound({type:'lock'}, game, false, 'sea')).toBe('sea_fall_tick');
    expect(brickSound({type:'drop'}, game, false, 'sea')).toBe('sea_fall_tick');
  }
});

it('Romeo harmonic correction removes the spurious low note and duplicated octave', () => {
  const sounding = (at: number) => seekTones(BRICK_PHRASES.sea_romeo_music,at).filter(t=>t.atMs===0 && t.hz>0).map(t=>t.hz).sort((a,b)=>a-b);
  expect(sounding(1600)).toEqual([836.8]); // weak 664.8 line was formerly promoted to an equal-volume note
  expect(sounding(7300)).toEqual([664.8]); // 1327 Hz is the overlapping harmonic, not an extra voice
});
