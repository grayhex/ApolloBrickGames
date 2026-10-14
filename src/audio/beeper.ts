import type { AudioCue, AudioPort } from './audio';

/**
 * Базовый 1-битный звук: один канал, прямоугольная волна фиксированной громкости, без огибающих и миксования.
 * Это условные сигналы демо — оригинальные звуки устройства не измерены и сюда не перенесены.
 */
export interface Beep {
  /** Частота, Гц; 0 — пауза. */
  freq: number;
  ms: number;
}

export const CUE_BEEPS: Readonly<Record<AudioCue, readonly Beep[]>> = {
  start: [{ freq: 1047, ms: 45 }, { freq: 1568, ms: 70 }],
  jump: [{ freq: 880, ms: 40 }, { freq: 1175, ms: 55 }],
  land: [{ freq: 196, ms: 35 }],
  shot: [{ freq: 1480, ms: 30 }, { freq: 988, ms: 40 }],
  hit: [{ freq: 660, ms: 45 }, { freq: 0, ms: 20 }, { freq: 660, ms: 60 }],
  blocked: [{ freq: 330, ms: 30 }],
  death: [{ freq: 440, ms: 90 }, { freq: 330, ms: 90 }, { freq: 247, ms: 90 }, { freq: 196, ms: 200 }],
  levelCompleted: [{ freq: 523, ms: 80 }, { freq: 659, ms: 80 }, { freq: 784, ms: 80 }, { freq: 1047, ms: 180 }],
  gameOver: [{ freq: 392, ms: 130 }, { freq: 330, ms: 130 }, { freq: 262, ms: 130 }, { freq: 196, ms: 320 }],
};

/** Важные сигналы не обрываются мелкими: один канал, побеждает более высокий приоритет. */
export const CUE_PRIORITY: Readonly<Record<AudioCue, number>> = {
  land: 0,
  blocked: 0,
  jump: 1,
  shot: 1,
  hit: 2,
  start: 2,
  death: 3,
  levelCompleted: 3,
  gameOver: 3,
};

export function cueDurationMs(cue: AudioCue): number {
  return CUE_BEEPS[cue].reduce((sum, beep) => sum + beep.ms, 0);
}

/** Расписание сигнала от момента `start` (секунды): только звучащие отрезки. */
export function scheduleBeeps(cue: AudioCue, start: number): { freq: number; start: number; end: number }[] {
  const result: { freq: number; start: number; end: number }[] = [];
  let at = start;
  for (const beep of CUE_BEEPS[cue]) {
    const end = at + beep.ms / 1000;
    if (beep.freq > 0) result.push({ freq: beep.freq, start: at, end });
    at = end;
  }
  return result;
}

// Минимальные структурные типы Web Audio: порт тестируется без браузера.
export interface OscillatorLike {
  type: string;
  frequency: { value: number };
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainLike {
  gain: { value: number };
  connect(destination: unknown): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume(): Promise<void>;
}

export interface WebAudioOptions {
  muted?: boolean;
  /** Громкость (0…1): фиксирована, 1-битный звук без динамики. */
  volume?: number;
  factory?: () => AudioContextLike | null;
}

const defaultFactory = (): AudioContextLike | null =>
  typeof AudioContext === 'undefined' ? null : (new AudioContext() as unknown as AudioContextLike);

/** Звук через Web Audio: прямоугольные сигналы по расписанию CUE_BEEPS; без API или при mute молчит. */
export class WebAudioPort implements AudioPort {
  muted: boolean;
  private context: AudioContextLike | null = null;
  private gain: GainLike | null = null;
  private active: OscillatorLike[] = [];
  private busyUntil = 0;
  private busyPriority = -1;
  private readonly volume: number;
  private readonly factory: () => AudioContextLike | null;

  constructor(options: WebAudioOptions = {}) {
    this.muted = options.muted ?? false;
    this.volume = options.volume ?? 0.07;
    this.factory = options.factory ?? defaultFactory;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.silence();
  }

  /** Создаёт и «будит» контекст; вызывается по жесту пользователя (политика автовоспроизведения браузеров). */
  unlock(): void {
    const context = this.ensure();
    if (context && context.state === 'suspended') void context.resume().catch(() => {});
  }

  play(cue: AudioCue): void {
    if (this.muted) return;
    const context = this.ensure();
    if (!context || !this.gain) return;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const now = context.currentTime;
    const priority = CUE_PRIORITY[cue];
    if (now < this.busyUntil && priority < this.busyPriority) return;
    this.silence(now);
    for (const piece of scheduleBeeps(cue, now)) {
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = piece.freq;
      oscillator.connect(this.gain);
      oscillator.start(piece.start);
      oscillator.stop(piece.end);
      this.active.push(oscillator);
    }
    this.busyUntil = now + cueDurationMs(cue) / 1000;
    this.busyPriority = priority;
  }

  private ensure(): AudioContextLike | null {
    if (this.context) return this.context;
    try {
      this.context = this.factory();
    } catch {
      this.context = null;
    }
    if (this.context) {
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    return this.context;
  }

  private silence(at?: number): void {
    for (const oscillator of this.active) {
      try {
        oscillator.stop(at);
      } catch {
        // Уже остановлен.
      }
    }
    this.active = [];
    this.busyUntil = 0;
    this.busyPriority = -1;
  }
}
