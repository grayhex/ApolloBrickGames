import type { BrickEvent } from '../brick/types';

/** n0Live/BrickGame (MIT): GameSound + callers. Donor audio, not an Apollo recording. */
export const BRICK_SOUNDS = ['select', 'move', 'turn', 'hit_cell', 'add_cell', 'bonus', 'fall', 'fall_super', 'remove_line', 'start', 'win', 'game_over', 'kaboom', 'tetris'] as const;
type Sound = (typeof BRICK_SOUNDS)[number];
const TETRIS = new Set(['tetris', 'tetris-big', 'tetris-pentix']);
export function brickSound(event: BrickEvent, game: string, inMenu: boolean): Sound | null {
  switch (event.type) {
    case 'started': return TETRIS.has(game) ? 'select' : 'start';
    case 'move': return inMenu ? 'select' : 'move';
    case 'rotate': return 'turn';
    case 'lock': return 'fall';
    case 'drop': return 'fall_super';
    case 'shot': return 'move';
    case 'hit': case 'explode': return 'hit_cell';
    case 'crash': return 'kaboom';
    case 'bonus': return 'bonus';
    case 'win': return 'win';
    case 'gameOver': return 'game_over';
    case 'lines': return event.count >= 4 ? 'tetris' : 'remove_line';
    default: return null; // lifeLost follows crash: do not play a second death cue
  }
}
const MUSIC = new Set<Sound>(['start', 'win', 'game_over', 'kaboom', 'tetris']);
const PRIORITY = (sound: Sound): number => MUSIC.has(sound) ? 3 : sound === 'move' ? 0 : sound === 'turn' ? 1 : 2;

/** Predecoded samples, scheduled immediately; loading never blocks simulation or queues stale effects. */
export class BrickAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private readonly buffers = new Map<Sound, AudioBuffer>();
  private voice: AudioBufferSourceNode | null = null;
  private until = 0;
  private priority = 0;
  private volume = 0.25;
  private muted = false;
  private disposed = false;
  private readonly abort = new AbortController();
  unlock(): void {
    if (this.disposed) return;
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
      this.setVolume(this.volume);
      const context = this.context;
      for (const name of BRICK_SOUNDS) {
        void fetch(`${import.meta.env.BASE_URL}audio/brick/${name}.m4a`, { signal: this.abort.signal })
          .then((response) => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer(); })
          .then((data) => context.decodeAudioData(data))
          .then((buffer) => { if (!this.disposed) this.buffers.set(name, buffer); })
          .catch(() => { /* Unsupported codec/network: leave this cue silent. */ });
      }
    }
    void this.context.resume().catch(() => {});
  }
  setMuted(value: boolean): void { this.muted = value; if (value) this.silence(); this.setVolume(this.volume); }
  setVolume(value: number): void { this.volume = Math.max(0, Math.min(1, value)); if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume * 0.35; }
  play(event: BrickEvent, game: string, inMenu: boolean): void {
    if (event.type === 'paused') { this.silence(); return; }
    const sound = brickSound(event, game, inMenu);
    const context = this.context;
    const buffer = sound && this.buffers.get(sound);
    if (!sound || !buffer || !context || context.state !== 'running' || !this.gain || this.muted) return;
    if (context.currentTime < this.until && PRIORITY(sound) < this.priority) return;
    this.silence();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.onended = () => { source.disconnect(); if (this.voice === source) this.voice = null; };
    source.start();
    this.voice = source;
    this.until = context.currentTime + buffer.duration;
    this.priority = PRIORITY(sound);
  }
  silence(): void { this.voice?.stop(); this.voice = null; this.until = 0; }
  dispose(): void { this.disposed = true; this.abort.abort(); this.silence(); this.buffers.clear(); void this.context?.close(); }
}
