import { expect, it } from 'vitest';
import { brickSound } from '../../src/audio/brick';
it('maps donor effects and music without duplicating death or playing Mario cues', () => {
  expect(brickSound({ type: 'crash' }, 'tank', false)).toBe('kaboom');
  expect(brickSound({ type: 'lifeLost' }, 'tank', false)).toBeNull();
  expect(brickSound({ type: 'started' }, 'tank', false)).toBe('start');
  expect(brickSound({ type: 'started' }, 'tetris', false)).toBe('select');
  expect(brickSound({ type: 'lines', count: 4 }, 'tetris', false)).toBe('tetris');
  expect(brickSound({ type: 'lines', count: 1 }, 'tetris', false)).toBe('remove_line');
});

import { afterEach, vi } from 'vitest';
import { BrickAudio, BRICK_SOUNDS } from '../../src/audio/brick';
afterEach(() => vi.unstubAllGlobals());
function audioHarness() {
  const voices: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const gain = { gain: { value: 0 }, connect: vi.fn() };
  const context = {
    state: 'running', currentTime: 0, destination: {},
    createGain: () => gain,
    createBufferSource: () => { const voice = { start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), onended: null, buffer: null }; voices.push(voice); return voice; },
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({ duration: 1 })),
  };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  return { port: new BrickAudio(), context, gain, voices };
}
it('preloads once, drops unready cues and never replays them after decoding', async () => {
  const { port, voices } = audioHarness();
  port.unlock(); port.play({ type: 'shot' }, 'tank', false);
  expect(voices).toHaveLength(0);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(BRICK_SOUNDS.length));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(voices).toHaveLength(0);
  port.unlock(); expect(fetch).toHaveBeenCalledTimes(BRICK_SOUNDS.length);
  port.play({ type: 'shot' }, 'tank', false); expect(voices).toHaveLength(1);
  port.dispose();
});
it('priority, pause, mute and disposal stop active playback and adjust gain', async () => {
  const { port, voices, context, gain } = audioHarness();
  port.unlock(); await new Promise((resolve) => setTimeout(resolve, 0));
  port.play({ type: 'win' }, 'tank', false);
  port.play({ type: 'move' }, 'tank', false);
  expect(voices).toHaveLength(1);
  port.play({ type: 'paused' }, 'tank', false);
  expect(voices[0]?.stop).toHaveBeenCalledOnce();
  port.play({ type: 'shot' }, 'tank', false); expect(voices).toHaveLength(2);
  port.setMuted(true); expect(voices[1]?.stop).toHaveBeenCalledOnce(); expect(gain.gain.value).toBe(0);
  port.play({ type: 'shot' }, 'tank', false); expect(voices).toHaveLength(2);
  port.setVolume(0.5); port.setMuted(false); expect(gain.gain.value).toBeCloseTo(0.175);
  port.dispose(); expect(context.close).toHaveBeenCalledOnce();
  port.unlock(); expect(fetch).toHaveBeenCalledTimes(BRICK_SOUNDS.length);
});
