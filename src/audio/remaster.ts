/**
 * Музыка «Ремастер»: готовая запись (m4a / AAC, любой формат, который браузер умеет декодировать) вместо мелодии-пищалки.
 * Запись лежит в `public/audio/remaster.m4a` (Opus) и `remaster-aac.m4a` (та же запись в AAC — запасной вариант для браузеров, которые Opus в MP4
 * не декодируют, прежде всего Safari); грузится один раз при первом выборе «Ремастер», декодируется Web Audio и
 * играет по кругу, пока идёт игра; пауза держит позицию, остановка сбрасывает. Нет файла, он не декодируется или Web Audio
 * недоступен — тихо остаётся оригинальная мелодия (а на кнопке «Ремастер» виден статус). Эффекты (прыжок, выстрел и т. д.) остаются пищалкой поверх записи.
 *
 * Минимальные структурные типы Web Audio: логика проверяется без браузера, как и в beeper.ts.
 */

export interface BufferLike {
  readonly duration: number;
  /** Нужны, чтобы найти тишину в конце записи (если декодер их даёт; иначе зацикливается вся запись). */
  readonly sampleRate?: number;
  readonly numberOfChannels?: number;
  getChannelData?(channel: number): Float32Array;
}

export interface BufferSourceLike {
  buffer: BufferLike | null;
  loop: boolean;
  loopStart?: number;
  loopEnd?: number;
  connect(destination: unknown): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

/** То, что нужно проигрывателю записи от аудиоконтекста. */
export interface TrackContextLike {
  readonly currentTime: number;
  readonly state: string;
  createBufferSource?(): BufferSourceLike;
  decodeAudioData?(data: ArrayBuffer): Promise<BufferLike>;
}

/** Что тише этого порога (≈ −60 дБ) в конце записи считается тишиной. */
export const TAIL_SILENCE = 0.001;
/** Запас после последнего слышимого звука, с: хвост затухания не обрезается резко. */
export const TAIL_MARGIN = 0.05;

/**
 * До какого места зацикливать запись, с: тишина в конце (у сгенерированных и экспортированных треков она бывает) обрезается,
 * иначе между кругами повисала бы пауза. Нет данных каналов или тишины — вся длительность.
 */
export function loopEndOf(buffer: BufferLike): number {
  const { duration, sampleRate, numberOfChannels, getChannelData } = buffer;
  if (!sampleRate || !numberOfChannels || !getChannelData) return duration;
  let last = -1;
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const data = getChannelData.call(buffer, channel);
    for (let i = data.length - 1; i > last; i--) {
      if (Math.abs(data[i] ?? 0) > TAIL_SILENCE) {
        last = i;
        break;
      }
    }
  }
  if (last < 0) return duration; // сплошная тишина — зацикливать нечего, оставляем как есть
  return Math.min(duration, (last + 1) / sampleRate + TAIL_MARGIN);
}

/** Состояние записи: `idle` — ещё не грузили, `loading`, `ready` — декодирована, `failed` — нет файла или не декодируется. */
export type TrackStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Загрузчик байтов записи; `null` — файла нет. */
export type TrackFetcher = () => Promise<ArrayBuffer | null>;

/**
 * Источники записи по порядку: Opus в MP4 (лучше при том же размере), затем AAC. Браузер, который Opus в MP4 не играет (`canPlay` вернул пустую
 * строку — как Safari старых версий), начинает с AAC и не качает файл, который не сможет декодировать; если `canPlay` ошибся и декодирование
 * всё равно не удалось, пробуется следующий источник. `base` — адрес каталога с файлами (с косой чертой на конце).
 */
export function remasterSources(base: string, canPlay: (type: string) => string): TrackFetcher[] {
  const opus = fetchTrack(`${base}audio/remaster.m4a`);
  const aac = fetchTrack(`${base}audio/remaster-aac.m4a`);
  return canPlay('audio/mp4; codecs="opus"') === '' ? [aac, opus] : [opus, aac];
}

export class RemasterTrack {
  private state: TrackStatus = 'idle';
  private buffer: BufferLike | null = null;
  /** Длина круга, с: запись без тишины в конце. */
  private loopLength = 0;
  private source: BufferSourceLike | null = null;
  private loading: Promise<void> | null = null;
  /** Позиция в записи (с), с которой начнётся следующий запуск. */
  private offset = 0;
  /** Время контекста (с), когда запущен текущий источник. */
  private startedAt = 0;
  private readonly sources: readonly TrackFetcher[];
  /** Номер источника, который удалось декодировать (-1 — пока никакой). */
  private loadedFrom = -1;

  /** Один источник или несколько по порядку: берётся первый, который и загрузился, и декодировался. */
  constructor(sources: TrackFetcher | readonly TrackFetcher[]) {
    this.sources = Array.isArray(sources) ? sources : [sources as TrackFetcher];
  }

  /** Номер источника, из которого играет запись (0 — основной, 1 — запасной); -1 — запись не загружена. */
  get loadedSource(): number {
    return this.loadedFrom;
  }

  get status(): TrackStatus {
    return this.state;
  }

  get playing(): boolean {
    return this.source !== null;
  }

  /** Длительность записи, с (0 — ещё не декодирована). */
  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  /** Длина круга зацикливания, с: длительность без тишины в конце (0 — запись ещё не декодирована). */
  get loopSeconds(): number {
    return this.loopLength;
  }

  /** Грузит и декодирует запись (один раз; повторные вызовы возвращают тот же ожидающий результат). */
  load(context: TrackContextLike): Promise<void> {
    if (this.loading) return this.loading;
    if (!context.decodeAudioData || !context.createBufferSource) {
      this.state = 'failed';
      return Promise.resolve();
    }
    const decode = context.decodeAudioData.bind(context);
    this.state = 'loading';
    this.loading = (async () => {
      for (const [index, fetchData] of this.sources.entries()) {
        try {
          const data = await fetchData();
          if (!data || data.byteLength === 0) throw new Error('нет данных');
          const buffer = await decode(data);
          if (!(buffer.duration > 0)) throw new Error('пустая запись');
          this.buffer = buffer;
          this.loopLength = loopEndOf(buffer);
          this.loadedFrom = index;
          this.state = 'ready';
          return;
        } catch {
          // Этот источник не загрузился или не декодируется — пробуем следующий.
        }
      }
      this.buffer = null;
      this.state = 'failed';
    })();
    return this.loading;
  }

  /** Запускает (или продолжает) воспроизведение с сохранённой позиции в `destination`; без записи — ничего. */
  play(context: TrackContextLike, destination: unknown): void {
    if (!this.buffer || this.source || !context.createBufferSource) return;
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    if (this.loopLength < this.buffer.duration) {
      source.loopStart = 0;
      source.loopEnd = this.loopLength;
    }
    source.connect(destination);
    source.start(0, this.offset % this.loopLength);
    this.source = source;
    this.startedAt = context.currentTime;
  }

  /** Позиция в записи (с) на момент `now` (время контекста). */
  position(now: number): number {
    if (!this.buffer) return 0;
    const played = this.source ? Math.max(0, now - this.startedAt) : 0;
    return (this.offset + played) % this.loopLength;
  }

  /** Пауза: звук обрывается, позиция запоминается. */
  pause(now: number): void {
    if (!this.source) return;
    this.offset = this.position(now);
    this.halt();
  }

  /** Остановка: звук обрывается, следующий запуск — с начала. */
  stop(): void {
    this.halt();
    this.offset = 0;
  }

  /** Перемотка: звук обрывается, следующий запуск — с позиции `seconds` (по кругу записи). Запись не готова — с начала. */
  seek(seconds: number): void {
    this.halt();
    const length = this.loopLength;
    this.offset = length > 0 && Number.isFinite(seconds) ? ((seconds % length) + length) % length : 0;
  }

  private halt(): void {
    const source = this.source;
    this.source = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // Уже остановлен.
    }
  }
}

/** Загрузка записи по адресу через fetch; любой сбой (нет сети, 404, не тот ответ) — «файла нет». */
export function fetchTrack(url: string): TrackFetcher {
  return async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.arrayBuffer();
    } catch {
      return null;
    }
  };
}
