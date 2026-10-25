/**
 * Анимации «Морского боя», снятые с видео владельца (25 октября 2026): заставка при включении, анимация игры A и анимация пункта меню «Ромео и Джульетта».
 * Кадры — состояние матрицы 10 × 20 (и превью NEXT 4 × 4 у игры A), снятое с видео 30 кадров в секунду и сжатое до смены состояния; длительности
 * в кадрах видео (1/30 с), у игры 1 кадр видео = 2 такта по 1/60 с. Как снято: `scripts/research/sea_video_*.py`, `docs/brick/sea-battle-originals.md`.
 * Видео — съёмка камерой с руки: переходные «серые» состояния жидкого кристалла сведены к ближайшему включённому/выключенному; что не видно на видео, не восстановлено.
 */
import data from './data/sea-animations.json';
import { BRICK_CELLS, BRICK_COLS, BRICK_ROWS, BRICK_TICK_HZ, PREVIEW_CELLS } from './types';

/** Кадр анимации в тактах. */
export interface SeaFrame {
  readonly ticks: number;
  /** Поле 10 × 20 (0 — пусто, 1 — горит). */
  readonly cells: Uint8Array;
  /** Превью 4 × 4, если оно есть в записи. */
  readonly preview: Uint8Array | null;
}

export interface SeaSequence {
  readonly frames: readonly SeaFrame[];
  /** Длительность всей петли в тактах. */
  readonly total: number;
  /** Кадр на такте `tick` (петля повторяется). */
  at(tick: number): SeaFrame;
}

interface RawSequence {
  readonly fps: number;
  readonly loop: readonly (readonly (number | string)[])[];
  readonly lead?: number;
  readonly top?: number;
}

const TICKS_PER_VIDEO_FRAME = BRICK_TICK_HZ / 30;

function decode(raw: RawSequence, rowsInState: number): SeaSequence {
  const top = raw.top ?? 0;
  const frames = raw.loop.map((state): SeaFrame => {
    const [videoFrames, hex] = state as [number, string];
    const cells = new Uint8Array(BRICK_CELLS);
    const preview = rowsInState > BRICK_ROWS - top ? new Uint8Array(PREVIEW_CELLS) : null;
    for (let row = 0; row < rowsInState; row++) {
      const bits = parseInt(hex.slice(row * 3, row * 3 + 3), 16);
      for (let col = 0; col < BRICK_COLS; col++) {
        if (((bits >> (BRICK_COLS - 1 - col)) & 1) === 0) continue;
        if (row < BRICK_ROWS - top) cells[(top + row) * BRICK_COLS + col] = 1;
        else if (preview && col < 4) preview[(row - (BRICK_ROWS - top)) * 4 + col] = 1;
      }
    }
    return { ticks: Math.round(videoFrames * TICKS_PER_VIDEO_FRAME), cells, preview };
  });
  const total = frames.reduce((sum, frame) => sum + frame.ticks, 0);
  return {
    frames,
    total,
    at(tick: number): SeaFrame {
      let t = ((tick % total) + total) % total;
      for (const frame of frames) {
        if (t < frame.ticks) return frame;
        t -= frame.ticks;
      }
      return frames[0]!;
    },
  };
}

/** Заставка при включении: 7 кадров пустого экрана, затем петля из 404 кадров (≈ 13,5 с): якорь с волнами, парусник, труба на насыпи, ромб, чайки и снова якорь. */
export const SEA_START_LEAD_TICKS = Math.round((data.start.lead ?? 0) * TICKS_PER_VIDEO_FRAME);
export const SEA_START: SeaSequence = decode(data.start, BRICK_ROWS);

/** Анимация пункта меню C («Ромео и Джульетта»): рисунок в строках 13–19 (сердце, затем лестница к башне). Начинается с сердца (допущение: длительность сердца 1,6 с). */
export const SEA_ROMEO_MENU: SeaSequence = decode(data.romeoMenu, 7);

/** Анимация игры A на экране перед партией (≈ 23,6 с): поле и превью NEXT (одна или две вертикальные палки). */
export const SEA_GAME_A: SeaSequence = decode(data.gameA, BRICK_ROWS + 4);
