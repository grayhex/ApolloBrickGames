import { afterEach, expect, it, vi } from 'vitest';
import { BrickAudio, brickSound } from '../../src/audio/brick';
import { BRICK_PHRASES } from '../../src/audio/brickPhrases';
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
      expect(note.ms).toBeGreaterThan(4);
      expect(note.hz).toBeGreaterThanOrEqual(0);
      expect(note.hz).toBeLessThan(5000);
    }
  const { port, voices } = harness();
  port.unlock();
  port.play({ type: 'crash' }, 'tank', false);
  const first = voices[0]!.frequency.setValueAtTime.mock.calls;
  port.play({ type: 'crash' }, 'tank', false);
  expect(voices[1]!.frequency.setValueAtTime.mock.calls).toEqual(first);
  expect(first.length).toBeGreaterThan(200);
});
