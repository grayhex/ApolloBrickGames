import type { BrickEvent } from '../brick/types';

import { BRICK_PHRASES, type BrickSound, type BrickTone } from './brickPhrases';
import { MASTER_GAIN } from './beeper';

const TETRIS = new Set(['tetris', 'tetris-big', 'tetris-pentix']);
export function brickSound(event: BrickEvent, game: string, inMenu: boolean): BrickSound | null {
  switch (event.type) {
    case 'started':
      return TETRIS.has(game) ? 'select' : 'start';
    case 'move':
      return inMenu ? 'select' : 'move';
    case 'rotate':
      return 'turn';
    case 'lock':
      return 'fall';
    case 'drop':
      return 'fall_super';
    case 'shot':
      return 'move';
    case 'hit':
    case 'explode':
      return 'hit_cell';
    case 'crash':
      return 'kaboom';
    case 'bonus':
      return 'bonus';
    case 'win':
      return 'win';
    case 'gameOver':
      return 'game_over';
    case 'lines':
      return event.count >= 4 ? 'tetris' : 'remove_line';
    default:
      return null; // lifeLost follows crash: do not play a second death cue
  }
}
const MUSIC = new Set<BrickSound>(['start', 'win', 'game_over', 'kaboom', 'tetris']);
const PRIORITY = (sound: BrickSound): number => (MUSIC.has(sound) ? 3 : sound === 'move' ? 0 : sound === 'turn' ? 1 : 2);

/** One synthesized square-wave channel, with priority and a short anti-click envelope. */
export class BrickAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private voice: { oscillator: OscillatorNode; envelope: GainNode } | null = null;
  private until = 0;
  private priority = 0;
  private volume = 0.25;
  private muted = false;
  private disposed = false;
  private gestureAt = -Infinity;
  unlock(): void {
    if (this.disposed) return;
    this.gestureAt = performance.now();
    if (!this.context) {
      try {
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.gain = this.context.createGain();
        this.gain.connect(this.context.destination);
        this.setVolume(this.volume);
      } catch {
        return;
      } // Web Audio unavailable: gameplay remains usable.
    }
    void this.context.resume().catch(() => {});
  }
  setMuted(value: boolean): void {
    this.muted = value;
    if (value) this.silence();
    this.setVolume(this.volume);
  }
  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.25;
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume * MASTER_GAIN;
  }
  play(event: BrickEvent, game: string, inMenu: boolean): void {
    if (event.type === 'paused') {
      this.silence();
      return;
    }
    const sound = brickSound(event, game, inMenu);
    const context = this.context;
    // Allow the first gesture's cue while resume() settles, but never queue stale background events.
    if (
      !sound ||
      !context ||
      !this.gain ||
      this.muted ||
      this.disposed ||
      (context.state !== 'running' && !(context.state === 'suspended' && performance.now() - this.gestureAt < 400))
    )
      return;
    if (context.currentTime < this.until && PRIORITY(sound) < this.priority) return;
    this.silence();
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'square';
    oscillator.connect(envelope);
    envelope.connect(this.gain);
    const voice = { oscillator, envelope };
    this.voice = voice;
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      if (this.voice === voice) this.voice = null;
    };
    let at = context.currentTime;
    let random = 0x2545f491;
    for (const note of BRICK_PHRASES[sound] as readonly BrickTone[]) {
      const end = at + note.ms / 1000;
      envelope.gain.setValueAtTime(0, at);
      if (note.hz > 0) {
        envelope.gain.linearRampToValueAtTime(1, at + 0.002);
        envelope.gain.setValueAtTime(1, end - 0.004);
        envelope.gain.linearRampToValueAtTime(0, end);
        oscillator.frequency.setValueAtTime(note.hz, at);
        if (note.noise) {
          for (let t = at + 0.004; t < end; t += 0.004) {
            random ^= random << 13;
            random ^= random >>> 17;
            random ^= random << 5;
            const center = note.hz + (((note.to ?? note.hz) - note.hz) * (t - at)) / (end - at);
            oscillator.frequency.setValueAtTime(center * (0.65 + ((random >>> 0) / 0x100000000) * 0.7), t);
          }
        } else if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to, end);
      }
      at = end;
    }
    oscillator.start(context.currentTime);
    oscillator.stop(at);
    this.until = at;
    this.priority = PRIORITY(sound);
  }
  silence(): void {
    if (this.voice) {
      const { oscillator, envelope } = this.voice;
      this.voice = null;
      // Disconnect immediately, including scheduled notes, so pause/mute cannot leak a tail.
      envelope.disconnect();
      try {
        oscillator.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.until = 0;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.silence();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.gain = null;
  }
}
