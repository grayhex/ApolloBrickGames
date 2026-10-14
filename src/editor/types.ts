import type { ContentStatus, LegendEntry, LevelMark, ObjectDef, ObservationStatus, Transition } from '../content/schema';

export interface Pt {
  x: number;
  y: number;
}

/** Четыре угла игровой области на фото в пикселях исходного файла: верхний левый, верхний правый, нижний правый, нижний левый. */
export type Quad = readonly [Pt, Pt, Pt, Pt];

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

/** Референс (фото/кадр оригинала): только метаданные; байты хранятся отдельно и не входят в историю изменений. */
export interface ReferenceImage {
  id: string;
  name: string;
  description: string;
  /** Временная отметка видео, если кадр оттуда (произвольный текст, например «00:01:23»). */
  videoTime: string;
  mime: ImageMime;
  /** Размер исходного файла в пикселях. */
  width: number;
  height: number;
  /** Калибровка: углы игровой области (без HUD, рамки и корпуса). null — не откалибровано. */
  quad: Quad | null;
  /** Левый верхний угол откалиброванной области в клетках карты (может быть дробным). */
  origin: Pt;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

/**
 * Документ редактора = игровой уровень (общий формат) + слой референсов. Изменяется только копированием:
 * история изменений хранит снимки, а неизменяемость делает их дешёвыми.
 * `start` может отсутствовать — это неполный черновик, и он помечается как проблема, а не исправляется молча.
 */
export interface EditorDoc {
  /** Идентификатор проекта: стабилен при переименовании, используется как ключ хранилища. */
  projectId: string;
  /** Каталог пакета данных (public/content/<pack>), по профилю экрана и правилам которого редактируется карта. */
  pack: string;
  /** Название для людей. */
  name: string;
  /** Идентификатор уровня в общем формате. */
  id: string;
  status: ContentStatus;
  /** Буквальная подпись наблюдения (например «1-03»); не трактуется как мир/уровень. */
  hudLabel: string;
  note: string;
  width: number;
  height: number;
  legend: Record<string, LegendEntry>;
  rows: string[];
  start: Pt | null;
  objects: ObjectDef[];
  transitions: Transition[];
  marks: LevelMark[];
  refs: ReferenceImage[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CellChange {
  x: number;
  y: number;
  char: string;
}

/** Фрагмент карты для копирования/вставки: прямоугольник символов легенды. */
export interface Clip {
  w: number;
  h: number;
  rows: string[];
}

export type ToolName =
  | 'brush'
  | 'eraser'
  | 'rect'
  | 'fill'
  | 'eyedropper'
  | 'select'
  | 'start'
  | 'object'
  | 'mark'
  | 'photo'
  | 'pan';

export type Selection =
  | { kind: 'cells'; rect: Rect }
  | { kind: 'object'; id: string }
  | { kind: 'mark'; id: string }
  | { kind: 'start' }
  | { kind: 'ref'; id: string };

/** Что показывать на рабочей области: только фото, только карту, фото под тайлами или рядом. */
export type ViewMode = 'photo' | 'map' | 'overlay' | 'side';

export const MAX_LEVEL_SIZE = 256;
export const MIN_LEVEL_SIZE = 1;

export type { ObservationStatus };
