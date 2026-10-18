import { BRICK_TICK_HZ, type BrickEvent } from '../brick/types';

import { BRICK_PHRASES, type BrickSound, type BrickTone } from './brickPhrases';
import { MASTER_GAIN } from './beeper';

const TETRIS = new Set(['tetris', 'tetris-big', 'tetris-pentix', 'tetris-flicker']);
export function brickSound(event: BrickEvent, game: string, inMenu: boolean): BrickSound | null {
  if (game === 'snake' && !inMenu) {
    switch (event.type) {
      case 'started': return 'e88_start';
      case 'move': return 'e88_move';
      case 'bonus': return 'e88_bonus';
      case 'lifeLost': return 'e88_crash';
      case 'win': return 'e88_win';
      case 'gameOver': return 'e88_over';
    }
  }
  switch (event.type) {
    case 'started':
      return game === 'brickgame' ? 'welcome' : TETRIS.has(game) ? 'select' : 'start';
    case 'move':
      return inMenu ? 'select' : TETRIS.has(game) ? 'b0202_move' : 'move';
    case 'rotate':
      return TETRIS.has(game) ? 'b0202_turn' : 'turn';
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
const PAD_HZ = [523, 659, 392, 330] as const;
const MUSIC = new Set<BrickSound>(['welcome', 'start', 'win', 'game_over', 'kaboom', 'tetris']);
const PRIORITY = (sound: BrickSound): number =>
  sound.startsWith('e88_') ? 0 : MUSIC.has(sound) ? 3 : sound === 'move' || sound === 'b0202_move' ? 0 : sound === 'turn' || sound === 'b0202_turn' ? 1 : 2;

/** Synthesized tones with priority; B0202 effects may overlay its separate noise channel. */
export class BrickAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private voices = new Set<{ oscillator: OscillatorNode; envelope: GainNode }>();
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
    const padHz = event.type === 'tone' ? PAD_HZ[event.pad] : undefined;
    const notes: readonly BrickTone[] | null =
      event.type === 'tone' && padHz && Number.isFinite(event.ticks) && event.ticks > 0
        ? [{ hz: padHz, ms: (Math.max(1, event.ticks) * 1000) / BRICK_TICK_HZ }]
        : sound
          ? BRICK_PHRASES[sound]
          : null;
    // A pad is gameplay information: startup music and reward jingles must not mask it.
    const priority = event.type === 'tone' ? 3 : sound ? PRIORITY(sound) : 0;
    const context = this.context;
    // Allow the first gesture's cue while resume() settles, but never queue stale background events.
    if (
      !notes ||
      !context ||
      !this.gain ||
      this.muted ||
      this.disposed ||
      (context.state !== 'running' && !(context.state === 'suspended' && performance.now() - this.gestureAt < 400))
    )
      return;
    if (context.currentTime < this.until && priority < this.priority) return;
    this.silence();
    const start = context.currentTime;
    for (const track of new Set(notes.map((note) => note.track ?? 0))) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'square';
      oscillator.connect(envelope);
      envelope.connect(this.gain);
      const voice = { oscillator, envelope };
      this.voices.add(voice);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        this.voices.delete(voice);
      };
      envelope.gain.setValueAtTime(0, start);
      let at = start;
      let random = 0x2545f491;
      for (const note of notes.filter((note) => (note.track ?? 0) === track)) {
        if (note.atMs !== undefined) at = start + note.atMs / 1000;
        const duration = note.ms / 1000;
        const end = at + duration;
        const gain = note.gain ?? 1;
        envelope.gain.setValueAtTime(0, at);
        if (note.hz > 0) {
          envelope.gain.linearRampToValueAtTime(gain, at + Math.min(0.002, duration / 4));
          envelope.gain.setValueAtTime(gain, end - Math.min(0.004, duration / 4));
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
      oscillator.start(start);
      oscillator.stop(at);
      this.until = Math.max(this.until, at);
    }
    this.priority = priority;
  }
  silence(): void {
    for (const { oscillator, envelope } of this.voices) {
      envelope.disconnect();
      try {
        oscillator.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
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
