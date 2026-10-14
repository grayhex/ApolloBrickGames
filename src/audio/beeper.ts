import type { AudioCue, AudioPort, MelodyKind, MusicKind } from './audio';
import { MelodyPlayer } from './melody';
import { CUES, type Note } from './phrases';
import { RemasterTrack, type TrackContextLike, type TrackFetcher } from './remaster';

/**
 * Звук через Web Audio в духе пищалки игрушки: только прямоугольные волны, до двух голосов, никаких огибающих.
 * Два слоя поверх одного выхода: мелодия (идёт по часам, не прерывается) и эффекты (один канал, приоритеты).
 * Всё планируется заранее из `update()` (раз в кадр, окно ~0,3 с) — таймеры не нужны, а пауза просто глушит голоса.
 */

/** Общий множитель: при громкости 0,5 ползунка выходное усиление ≈ 0,07 — как у прежнего демо-сигнала. */
export const MASTER_GAIN = 0.14;
/** Мелодия тише эффектов (допущение: в записи эффекты слышны отчётливо поверх мелодии). */
export const MELODY_GAIN = 0.6;
/**
 * Усиление готовой записи «ремастера»: она идёт мимо общего усилителя (тот занижен под резкую прямоугольную волну), поэтому
 * свой множитель; итоговый уровень — громкость ползунка × TRACK_GAIN. Подобран по измерению громкости (tools/audio/loudness.mjs):
 * мелодия-пищалка при ползунке 100 % звучит на −22,2 LUFS, запись public/audio/remaster.m4a без усиления — на −14,1 LUFS, то есть
 * на 8,1 дБ громче; множитель 0,38 (−8,4 дБ) даёт −22,5 LUFS — запись не громче оригинала при любом положении ползунка.
 */
export const TRACK_GAIN = 0.38;
/** На сколько вперёд ставить мелодию в расписание, мс. */
export const LOOKAHEAD_MS = 300;
/**
 * Сколько после жеста пользователя (`unlock`) эффекты ещё ставятся в расписание, пока браузер не «разбудил» контекст, мс.
 * Без жеста (автоматическое интро при открытии страницы) контекст не создаётся и эффекты отбрасываются: иначе они копились бы
 * в замороженном контексте и разом прозвучали бы по первому нажатию.
 */
export const GESTURE_GRACE_MS = 400;
const FALLBACK_VOLUME = 0.25;

// Минимальные структурные типы Web Audio: порт тестируется без браузера.
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

export interface OscillatorLike {
  type: string;
  frequency: AudioParamLike;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainLike {
  gain: { value: number };
  connect(destination: unknown): void;
}

export interface AudioContextLike extends TrackContextLike {
  readonly currentTime: number;
  /** Задержка вывода звука, с (если браузер сообщает): светодиоды отстают на столько же, чтобы совпасть со слышимым. */
  readonly baseLatency?: number;
  readonly outputLatency?: number;
  readonly state: string;
  readonly destination: unknown;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume(): Promise<void>;
}

export interface WebAudioOptions {
  muted?: boolean;
  /** Громкость 0…1 (ползунок страницы). */
  volume?: number;
  factory?: () => AudioContextLike | null;
  /** Загрузчик записи «ремастера» (байты m4a); без него «Ремастер» недоступен и звучит оригинал. */
  remaster?: TrackFetcher;
  /** Стенные часы, мс (по умолчанию `performance.now`); в тестах подменяются. */
  clock?: () => number;
}

const defaultFactory = (): AudioContextLike | null =>
  typeof AudioContext === 'undefined' ? null : (new AudioContext() as unknown as AudioContextLike);

const defaultClock = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

const clampVolume = (volume: number): number => (Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : FALLBACK_VOLUME);

interface Voice {
  oscillator: OscillatorLike;
  /** Когда голос закончит звучать (время контекста, с). */
  end: number;
}

export class WebAudioPort implements AudioPort {
  muted: boolean;
  volume: number;
  private context: AudioContextLike | null = null;
  private master: GainLike | null = null;
  private melodyBus: GainLike | null = null;
  private sfxBus: GainLike | null = null;
  private melodyVoices: Voice[] = [];
  private sfxVoices: Voice[] = [];
  private busyUntil = 0;
  private busyPriority = -1;
  private noise = 0x2545f491;
  private lastResume = Number.NEGATIVE_INFINITY;
  private gestureAt = Number.NEGATIVE_INFINITY;
  private readonly melody = new MelodyPlayer();
  private readonly track: RemasterTrack | null;
  private trackGain: GainLike | null = null;
  private music: MusicKind = 'original';
  /** Текущая мелодия идёт записью «ремастера» (а не пищалкой); решается при запуске мелодии. */
  private trackMode = false;
  private trackPaused = false;
  private readonly factory: () => AudioContextLike | null;
  private readonly clock: () => number;

  constructor(options: WebAudioOptions = {}) {
    this.muted = options.muted ?? false;
    this.volume = clampVolume(options.volume ?? FALLBACK_VOLUME);
    this.factory = options.factory ?? defaultFactory;
    this.clock = options.clock ?? defaultClock;
    this.track = options.remaster ? new RemasterTrack(options.remaster) : null;
  }

  /** Чем звучит мелодия: запись «ремастера» играет, только пока контекст идёт и запись запущена. */
  get musicSource(): MusicKind {
    return this.trackMode && this.track?.playing ? 'remaster' : 'original';
  }

  setMusic(music: MusicKind): void {
    this.music = music;
    this.prepareTrack();
    const kind = this.melody.active(this.clock()) ? this.melody.kind : null;
    if (kind === null || kind === 'ready') return;
    // Мелодия уже звучит: переключение действует сразу — запись начинается с начала, пищалка продолжает с места, где шли её часы.
    if (music === 'remaster' && this.track?.status === 'ready') {
      this.cut(this.melodyVoices);
      this.track.stop();
      this.trackMode = true;
      this.trackPaused = false;
    } else if (music === 'original' && this.trackMode) {
      this.track?.stop();
      this.trackMode = false;
    }
  }

  get melodyKind(): MelodyKind | null {
    return this.melody.active(this.clock()) ? this.melody.kind : null;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyTrackGain();
    if (muted) {
      this.cut(this.melodyVoices);
      this.melody.rewind(this.clock());
      this.cut(this.sfxVoices);
      this.busyUntil = 0;
      this.busyPriority = -1;
    }
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    if (this.master) this.master.gain.value = this.volume * MASTER_GAIN;
    this.applyTrackGain();
  }

  /** Создаёт и «будит» контекст; вызывается по жесту пользователя (политика автовоспроизведения браузеров). */
  unlock(): void {
    this.gestureAt = this.clock();
    this.wake(this.ensure());
    this.prepareTrack();
  }

  play(cue: AudioCue): void {
    if (this.muted) return;
    const gesture = this.clock() - this.gestureAt <= GESTURE_GRACE_MS;
    if (!this.context && !gesture) return; // жеста ещё не было: контекст не создаём (политика автовоспроизведения)
    const context = this.ensure();
    if (!context || !this.sfxBus) return;
    this.wake(context);
    // Контекст приостановлен, а жеста нет: время в нём стоит, поставленный эффект зазвучал бы устаревшим при первом нажатии.
    if (context.state !== 'running' && !gesture) return;
    const def = CUES[cue];
    const now = context.currentTime;
    if (now < this.busyUntil && def.priority < this.busyPriority) return;
    this.cut(this.sfxVoices);
    let target: GainLike = this.sfxBus;
    if (def.gain !== undefined && def.gain !== 1) {
      target = context.createGain();
      target.gain.value = def.gain;
      target.connect(this.sfxBus);
    }
    let at = now + (def.delayMs ?? 0) / 1000;
    for (const note of def.notes) {
      this.sound(context, note, at, note.ms, target, this.sfxVoices);
      at += note.ms / 1000;
    }
    this.busyUntil = at;
    this.busyPriority = def.priority;
  }

  startMelody(kind: MelodyKind): void {
    this.cut(this.melodyVoices);
    this.melody.start(kind, this.clock());
    // «Ремастер» подменяет и фанфару, и мелодию (тон готовности `ready` остаётся пищалкой); запись ещё не готова — играет оригинал.
    this.track?.stop();
    this.trackMode = kind !== 'ready' && this.music === 'remaster' && this.track?.status === 'ready';
    this.trackPaused = false;
    if (kind !== 'ready') this.prepareTrack();
  }

  pauseMelody(): void {
    this.melody.pause(this.clock());
    this.cut(this.melodyVoices);
    if (this.trackMode) {
      this.trackPaused = true;
      if (this.context) this.track?.pause(this.context.currentTime);
    }
  }

  resumeMelody(): void {
    this.melody.resume(this.clock());
    this.trackPaused = false;
  }

  stopMelody(): void {
    this.melody.stop();
    this.cut(this.melodyVoices);
    this.track?.stop();
    this.trackMode = false;
    this.trackPaused = false;
  }

  silence(): void {
    this.stopMelody();
    this.cut(this.sfxVoices);
    this.busyUntil = 0;
    this.busyPriority = -1;
  }

  update(): void {
    const context = this.context;
    if (!context) return;
    this.prune(context.currentTime);
    if (this.trackMode && !this.trackPaused && context.state === 'running' && this.trackGain && this.track) {
      this.track.play(context, this.trackGain); // запись идёт и при заглушённом звуке (усиление 0): позиция не теряется
    }
    if (this.muted || !this.melodyBus) return;
    if (context.state !== 'running') {
      this.wake(context);
      return;
    }
    if (this.trackMode) return; // мелодию ведёт запись, пищалка молчит (её часы идут — светодиоды бегут в такт)
    const now = this.clock();
    const ahead = this.melody.collect(now, LOOKAHEAD_MS);
    for (const item of ahead) {
      const skip = Math.max(0, -item.offsetMs);
      const at = context.currentTime + Math.max(0, item.offsetMs) / 1000;
      this.sound(context, item.note, at, item.note.ms - skip, this.melodyBus, this.melodyVoices);
    }
  }

  ledBeat(): number {
    const context = this.context;
    const latency = context ? ((context.baseLatency ?? 0) + (context.outputLatency ?? 0)) * 1000 : 0;
    return this.melody.led(this.clock() - Math.min(300, Math.max(0, latency)));
  }

  // ── Внутреннее ─────────────────────────────────────────────────────────────

  private ensure(): AudioContextLike | null {
    if (this.context) return this.context;
    try {
      this.context = this.factory();
    } catch {
      this.context = null;
    }
    const context = this.context;
    if (context) {
      this.master = context.createGain();
      this.master.gain.value = this.volume * MASTER_GAIN;
      this.master.connect(context.destination);
      this.melodyBus = context.createGain();
      this.melodyBus.gain.value = MELODY_GAIN;
      this.melodyBus.connect(this.master);
      this.sfxBus = context.createGain();
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(this.master);
      this.trackGain = context.createGain();
      this.trackGain.connect(context.destination);
      this.applyTrackGain();
    }
    return context;
  }

  private applyTrackGain(): void {
    if (this.trackGain) this.trackGain.gain.value = this.muted ? 0 : this.volume * TRACK_GAIN;
  }

  /** Запускает загрузку записи (один раз), когда выбран «Ремастер» и есть контекст; сбой — просто остаётся оригинал. */
  private prepareTrack(): void {
    if (this.music !== 'remaster' || !this.track || !this.context) return;
    void this.track.load(this.context);
  }

  /** Просит у браузера продолжить контекст (без жеста он откажет — это не ошибка); не чаще раза в полсекунды. */
  private wake(context: AudioContextLike | null): void {
    if (!context || context.state !== 'suspended') return;
    const now = this.clock();
    if (now - this.lastResume < 500) return;
    this.lastResume = now;
    void context.resume().catch(() => {});
  }

  /** Ставит ноту в расписание: голоса звучат `ms` мс с момента `at` (с контекстного времени), в конце — артикуляционная пауза. */
  private sound(context: AudioContextLike, note: Note, at: number, ms: number, bus: GainLike, sink: Voice[]): void {
    const length = Math.max(0, ms - (note.gap ?? 0)) / 1000;
    if (length <= 0) return;
    const end = at + length;
    const voices = note.noise ? 1 : note.hz.length;
    if (voices === 0) return;
    let target = bus;
    if (voices > 1) {
      // Два голоса складываются: делим уровень, чтобы аккорд не был вдвое громче одиночной ноты.
      target = context.createGain();
      target.gain.value = 1 / voices;
      target.connect(bus);
    }
    for (let i = 0; i < voices; i++) {
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      const { frequency } = oscillator;
      if (note.noise) {
        const { lo, hi, hop } = note.noise;
        frequency.value = this.noiseHz(lo, hi);
        for (let t = at + hop / 1000; t < end; t += hop / 1000) frequency.setValueAtTime(this.noiseHz(lo, hi), t);
      } else {
        const hz = note.hz[i] ?? 0;
        frequency.value = hz;
        if (i === 0 && note.glideTo !== undefined) {
          frequency.setValueAtTime(hz, at);
          frequency.exponentialRampToValueAtTime(note.glideTo, end);
        }
      }
      oscillator.connect(target);
      oscillator.start(at);
      oscillator.stop(end);
      sink.push({ oscillator, end });
    }
  }

  /** Псевдослучайная частота шума (xorshift): воспроизводимо, без `Math.random`. */
  private noiseHz(lo: number, hi: number): number {
    let x = this.noise;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noise = x >>> 0;
    return lo + (this.noise / 0x100000000) * (hi - lo);
  }

  /** Немедленно обрывает голоса (и ещё не начавшиеся — они так и не прозвучат). */
  private cut(list: Voice[]): void {
    const at = this.context?.currentTime;
    for (const voice of list) {
      try {
        voice.oscillator.stop(at);
      } catch {
        // Уже остановлен.
      }
    }
    list.length = 0;
  }

  private prune(now: number): void {
    this.melodyVoices = this.melodyVoices.filter((voice) => voice.end > now);
    this.sfxVoices = this.sfxVoices.filter((voice) => voice.end > now);
  }
}
