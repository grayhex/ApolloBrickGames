import { describe, expect, it } from 'vitest';
import {
  cellAtScreen,
  clientToCanvas,
  fitView,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  resizeKeepCenter,
  screenToWorld,
  visibleCells,
  worldToScreen,
  zoomAt,
  type View,
} from '../../src/editor/viewport';

const view: View = { scale: 32, tx: 100, ty: 50 };

describe('координаты рабочей области', () => {
  it('пересчёт экран → карта → экран обратим, клетка берётся по floor', () => {
    const w = screenToWorld(view, 100 + 32 * 3.5, 50 + 32 * 1.25);
    expect(w).toEqual({ x: 3.5, y: 1.25 });
    expect(worldToScreen(view, 3.5, 1.25)).toEqual({ x: 212, y: 90 });
    expect(cellAtScreen(view, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(cellAtScreen(view, 100 + 31.9, 50 + 31.9)).toEqual({ x: 0, y: 0 });
    expect(cellAtScreen(view, 100 + 32, 50 + 32)).toEqual({ x: 1, y: 1 });
    expect(cellAtScreen(view, 99, 49)).toEqual({ x: -1, y: -1 });
  });

  it('масштабирование к точке: клетка под курсором остаётся той же при любом масштабе', () => {
    let v = view;
    const cursor = { x: 333, y: 222 };
    const before = cellAtScreen(v, cursor.x, cursor.y);
    for (const factor of [1.25, 1.25, 0.5, 2, 0.8, 3]) {
      v = zoomAt(v, factor, cursor.x, cursor.y);
      expect(cellAtScreen(v, cursor.x, cursor.y)).toEqual(before);
    }
  });

  it('масштаб ограничен; при упоре вид не «ползёт»', () => {
    let v: View = view;
    for (let i = 0; i < 50; i++) v = zoomAt(v, 2, 300, 200);
    expect(v.scale).toBe(MAX_SCALE);
    const same = zoomAt(v, 2, 300, 200);
    expect(same).toBe(v);
    for (let i = 0; i < 50; i++) v = zoomAt(v, 0.5, 300, 200);
    expect(v.scale).toBe(MIN_SCALE);
  });

  it('pan двигает карту на столько же пикселей; клетка под курсором меняется предсказуемо', () => {
    const panned = panBy(view, -64, 32);
    expect(cellAtScreen(panned, 100, 50)).toEqual({ x: 2, y: -1 });
  });

  it('изменение размера окна сохраняет центр: клетка в центре та же', () => {
    const v = fitView(800, 600, 13, 6);
    const center = cellAtScreen(v, 400, 300);
    const resized = resizeKeepCenter(v, 800, 600, 1000, 500);
    expect(cellAtScreen(resized, 500, 250)).toEqual(center);
  });

  it('вписывание карты в холст: вся карта видна и отцентрована', () => {
    const v = fitView(800, 600, 13, 6, 20);
    const topLeft = worldToScreen(v, 0, 0);
    const bottomRight = worldToScreen(v, 13, 6);
    expect(topLeft.x).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(bottomRight.x).toBeLessThanOrEqual(780 + 1e-9);
    expect(topLeft.x + bottomRight.x).toBeCloseTo(800, 6);
    expect(topLeft.y + bottomRight.y).toBeCloseTo(600, 6);
  });

  it('координаты события мыши пересчитываются по рамке элемента (масштаб страницы, CSS-трансформации, DPR)', () => {
    // Холст 800×600 CSS-пикселей показан в рамке 400×300 (увеличение ×0,5), рамка смещена на (20, 30).
    const rect = { left: 20, top: 30, width: 400, height: 300 };
    expect(clientToCanvas(220, 180, rect, 800, 600)).toEqual({ x: 400, y: 300 });
    // Тот же клик попадает в ту же клетку, что и при неизменённом холсте.
    const v: View = { scale: 40, tx: 0, ty: 0 };
    const p = clientToCanvas(220, 180, rect, 800, 600);
    expect(cellAtScreen(v, p.x, p.y)).toEqual({ x: 10, y: 7 });
    expect(clientToCanvas(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 100, 100)).toEqual({ x: 5, y: 5 });
  });

  it('видимый диапазон клеток ограничен картой', () => {
    expect(visibleCells(view, 800, 600, 13, 6)).toEqual({ x0: 0, y0: 0, x1: 13, y1: 6 });
    expect(visibleCells({ scale: 32, tx: -64, ty: 0 }, 160, 96, 13, 6)).toEqual({ x0: 2, y0: 0, x1: 7, y1: 3 });
  });

  it('неквадратная клетка LCD (128 × 112): клетка под курсором считается по своей высоте, zoom и вписывание сохраняют пропорцию', () => {
    const v: View = { scale: 64, ratio: 0.875, tx: 10, ty: 20 };
    // Высота клетки 56 CSS-пикселей: строка 3 начинается на 20 + 3 * 56 = 188.
    expect(cellAtScreen(v, 10 + 64 * 2, 187)).toEqual({ x: 2, y: 2 });
    expect(cellAtScreen(v, 10 + 64 * 2, 189)).toEqual({ x: 2, y: 3 });
    expect(worldToScreen(v, 1, 1)).toEqual({ x: 74, y: 76 });
    const zoomed = zoomAt(v, 1.5, 200, 100);
    expect(zoomed.ratio).toBe(0.875);
    expect(cellAtScreen(zoomed, 200, 100)).toEqual(cellAtScreen(v, 200, 100));
    const fit = fitView(800, 600, 13, 6, 20, 0.875);
    expect(fit.ratio).toBe(0.875);
    const br = worldToScreen(fit, 13, 6);
    const tl = worldToScreen(fit, 0, 0);
    expect(tl.x + br.x).toBeCloseTo(800, 6);
    expect(tl.y + br.y).toBeCloseTo(600, 6);
    expect(resizeKeepCenter(fit, 800, 600, 900, 700).ratio).toBe(0.875);
  });
});

