/**
 * Музыка «Ремастер»: готовая запись (m4a / AAC, любой формат, который браузер умеет декодировать) вместо мелодии-пищалки.
 * Запись лежит в `public/audio/remaster.m4a`, грузится один раз при первом выборе «Ремастер», декодируется Web Audio и
 * играет по кругу, пока идёт игра; пауза держит позицию, остановка сбрасывает. Нет файла, он не декодируется или Web Audio
 * недоступен — тихо остаётся оригинальная мелодия. Эффекты (прыжок, выстрел и т. д.) остаются пищалкой поверх записи.
 *
 * Минимальные структурные типы Web Audio: логика проверяется без браузера, как и в beeper.ts.
 */

export interface BufferLike {
  readonly duration: number;
}

export interface BufferSourceLike {
  buffer: BufferLike | null;
  loop: boolean;
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

/** Состояние записи: `idle` — ещё не грузили, `loading`, `ready` — декодирована, `failed` — нет файла или не декодируется. */
export type TrackStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Загрузчик байтов записи; `null` — файла нет. */
export type TrackFetcher = () => Promise<ArrayBuffer | null>;

export class RemasterTrack {
  private state: TrackStatus = 'idle';
  private buffer: BufferLike | null = null;
  private source: BufferSourceLike | null = null;
  private loading: Promise<void> | null = null;
  /** Позиция в записи (с), с которой начнётся следующий запуск. */
  private offset = 0;
  /** Время контекста (с), когда запущен текущий источник. */
  private startedAt = 0;
  private readonly fetchData: TrackFetcher;

  constructor(fetchData: TrackFetcher) {
    this.fetchData = fetchData;
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
      try {
        const data = await this.fetchData();
        if (!data || data.byteLength === 0) throw new Error('нет данных');
        const buffer = await decode(data);
        if (!(buffer.duration > 0)) throw new Error('пустая запись');
        this.buffer = buffer;
        this.state = 'ready';
      } catch {
        this.buffer = null;
        this.state = 'failed';
      }
    })();
    return this.loading;
  }

  /** Запускает (или продолжает) воспроизведение с сохранённой позиции в `destination`; без записи — ничего. */
  play(context: TrackContextLike, destination: unknown): void {
    if (!this.buffer || this.source || !context.createBufferSource) return;
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(destination);
    source.start(0, this.offset % this.buffer.duration);
    this.source = source;
    this.startedAt = context.currentTime;
  }

  /** Позиция в записи (с) на момент `now` (время контекста). */
  position(now: number): number {
    if (!this.buffer) return 0;
    const played = this.source ? Math.max(0, now - this.startedAt) : 0;
    return (this.offset + played) % this.buffer.duration;
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
