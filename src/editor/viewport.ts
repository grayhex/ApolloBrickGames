import type { Pt } from './types';

/**
 * Вид рабочей области: масштаб (CSS-пикселей на клетку) и положение начала карты (клетка 0,0) в CSS-пикселях
 * относительно левого верхнего угла холста. Все пересчёты — в CSS-пикселях, поэтому devicePixelRatio,
 * масштаб страницы и размер холста на попадание в клетку не влияют.
 */
export interface View {
  scale: number;
  tx: number;
  ty: number;
  /** Высота клетки относительно её ширины (у LCD-клетки 128 × 112 это 0,875); по умолчанию 1. */
  ratio?: number;
}

/** CSS-пикселей на клетку по вертикали. */
export function yScale(view: View): number {
  return view.scale * (view.ratio ?? 1);
}

export const MIN_SCALE = 4;
export const MAX_SCALE = 160;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Точка холста (CSS-пиксели) → координаты карты в клетках (дробные). */
export function screenToWorld(view: View, sx: number, sy: number): Pt {
  return { x: (sx - view.tx) / view.scale, y: (sy - view.ty) / yScale(view) };
}

export function worldToScreen(view: View, wx: number, wy: number): Pt {
  return { x: view.tx + wx * view.scale, y: view.ty + wy * yScale(view) };
}

/** Клетка под точкой холста. */
export function cellAtScreen(view: View, sx: number, sy: number): Pt {
  const w = screenToWorld(view, sx, sy);
  return { x: Math.floor(w.x), y: Math.floor(w.y) };
}

/** Масштабирование с неподвижной точкой под курсором. */
export function zoomAt(view: View, factor: number, sx: number, sy: number): View {
  const scale = clampScale(view.scale * factor);
  if (scale === view.scale) return view;
  const k = scale / view.scale;
  return { ...view, scale, tx: sx - (sx - view.tx) * k, ty: sy - (sy - view.ty) * k };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, tx: view.tx + dx, ty: view.ty + dy };
}

/** Вписать область (в клетках) в холст с отступом. */
export function fitView(viewW: number, viewH: number, cols: number, rows: number, margin = 24, ratio = 1): View {
  const availW = Math.max(1, viewW - margin * 2);
  const availH = Math.max(1, viewH - margin * 2);
  const scale = clampScale(Math.min(availW / Math.max(1, cols), availH / Math.max(1, rows * ratio)));
  return { scale, ratio, tx: (viewW - cols * scale) / 2, ty: (viewH - rows * scale * ratio) / 2 };
}

/** Изменение размера холста: центр видимой области остаётся на месте, масштаб тот же. */
export function resizeKeepCenter(view: View, oldW: number, oldH: number, newW: number, newH: number): View {
  return { ...view, tx: view.tx + (newW - oldW) / 2, ty: view.ty + (newH - oldH) / 2 };
}

/** Пересчёт clientX/clientY события мыши в CSS-координаты холста (учитывает масштаб и рамку элемента). */
export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  cssWidth: number,
  cssHeight: number,
): Pt {
  const kx = rect.width > 0 ? cssWidth / rect.width : 1;
  const ky = rect.height > 0 ? cssHeight / rect.height : 1;
  return { x: (clientX - rect.left) * kx, y: (clientY - rect.top) * ky };
}

/** Диапазон клеток, попадающих в холст (включительно по x0/y0, исключительно по x1/y1), с ограничением размером карты. */
export function visibleCells(
  view: View,
  viewW: number,
  viewH: number,
  cols: number,
  rows: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const a = screenToWorld(view, 0, 0);
  const b = screenToWorld(view, viewW, viewH);
  return {
    x0: Math.max(0, Math.floor(a.x)),
    y0: Math.max(0, Math.floor(a.y)),
    x1: Math.min(cols, Math.ceil(b.x)),
    y1: Math.min(rows, Math.ceil(b.y)),
  };
}
