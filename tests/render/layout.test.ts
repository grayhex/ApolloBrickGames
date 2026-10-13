import { describe, expect, it } from 'vitest';
import { centerCamera, followCamera, type CameraArea } from '../../src/render/camera';
import { computeLayout } from '../../src/render/layout';

describe('computeLayout: масштаб и пропорции', () => {
  it('берёт наибольший целый масштаб, который помещается; пропорции сохраняются', () => {
    const l = computeLayout(800, 600, 1, 104, 64);
    expect(l.scale).toBe(7); // 104*7 = 728, 64*7 = 448
    expect(l.backingWidth / l.backingHeight).toBeCloseTo(104 / 64, 5);
    expect(l.cssWidth).toBe(728);
  });

  it('поле не растягивается: при росте окна масштаб растёт только скачком до следующего целого', () => {
    const widths = [728, 780, 831, 832, 900].map((w) => computeLayout(w, 2000, 1, 104, 64).scale);
    expect(widths).toEqual([7, 7, 7, 8, 8]);
  });

  it('devicePixelRatio учитывается: масштаб считается в физических пикселях, CSS-размер остаётся в контейнере', () => {
    // Контейнер 728 CSS-пикселей: на DPR 1 масштаб 7, на DPR 2 — 14 (те же 728 CSS-пикселей, но вдвое чётче).
    const one = computeLayout(728, 600, 1, 104, 64);
    const two = computeLayout(728, 600, 2, 104, 64);
    expect(one.scale).toBe(7);
    expect(two.scale).toBe(14);
    expect(two.backingWidth).toBe(one.backingWidth * 2);
    expect(two.cssWidth).toBe(one.cssWidth);
    expect(two.cssHeight).toBe(one.cssHeight);
    // Некратный контейнер: берётся наибольший целый физический масштаб (15 при 800 CSS × 2).
    const wide = computeLayout(800, 600, 2, 104, 64);
    expect(wide.scale).toBe(15);
    expect(wide.cssWidth).toBeLessThanOrEqual(800);
  });

  it('дробный DPR (масштаб страницы 125%) даёт целый физический масштаб и корректный CSS-размер', () => {
    const l = computeLayout(800, 600, 1.25, 104, 64);
    expect(Number.isInteger(l.scale)).toBe(true);
    expect(l.cssWidth).toBeCloseTo(l.backingWidth / 1.25, 5);
    expect(l.cssWidth).toBeLessThanOrEqual(800);
    expect(l.cssHeight).toBeLessThanOrEqual(600);
  });

  it('ограничивает высота, а не ширина, когда контейнер «высокий» или «низкий»', () => {
    expect(computeLayout(2000, 200, 1, 104, 64).scale).toBe(3);
    expect(computeLayout(208, 2000, 1, 104, 64).scale).toBe(2);
  });

  it('контейнер меньше экрана: дробный масштаб, картинка всё равно влезает', () => {
    const l = computeLayout(52, 40, 1, 104, 64);
    expect(l.scale).toBeLessThan(1);
    expect(l.backingWidth).toBeLessThanOrEqual(52);
    expect(l.backingHeight).toBeLessThanOrEqual(40);
  });

  it('некорректные входные значения не ломают расчёт', () => {
    expect(computeLayout(0, 0, 0, 104, 64).backingWidth).toBeGreaterThan(0);
    expect(computeLayout(800, 600, Number.NaN, 104, 64).scale).toBe(7);
  });
});

describe('камера', () => {
  const area: CameraArea = { columns: 13, rows: 7, levelWidth: 40, levelHeight: 7 };

  it('центрирует на герое и зажимает по краям карты', () => {
    expect(centerCamera({ x: 1, y: 5 }, area)).toEqual({ x: 0, y: 0 });
    expect(centerCamera({ x: 20, y: 5 }, area)).toEqual({ x: 14, y: 0 });
    expect(centerCamera({ x: 39, y: 5 }, area)).toEqual({ x: 27, y: 0 });
  });

  it('карта меньше окна: показывается по центру (отрицательное смещение)', () => {
    const small: CameraArea = { ...area, levelWidth: 9, levelHeight: 5 };
    expect(centerCamera({ x: 4, y: 2 }, small)).toEqual({ x: -2, y: -1 });
    expect(followCamera({ x: -2, y: -1 }, { x: 8, y: 4 }, small)).toEqual({ x: -2, y: -1 });
  });

  it('следует за героем только когда он выходит за «мёртвую рамку»', () => {
    let cam = centerCamera({ x: 20, y: 5 }, area);
    const start = cam;
    cam = followCamera(cam, { x: 21, y: 5 }, area);
    expect(cam).toEqual(start); // шаг внутри рамки — камера на месте
    for (let x = 21; x < 30; x++) cam = followCamera(cam, { x, y: 5 }, area);
    expect(cam.x).toBeGreaterThan(start.x);
    expect(cam.x).toBeLessThanOrEqual(area.levelWidth - area.columns);
  });

  it('вертикаль: прыжки внутри рамки не дёргают камеру, подъём по высокой карте — прокручивает', () => {
    const tall: CameraArea = { columns: 13, rows: 7, levelWidth: 20, levelHeight: 14 };
    let cam = centerCamera({ x: 3, y: 12 }, tall);
    expect(cam.y).toBe(7);
    const rest = cam;
    cam = followCamera(cam, { x: 3, y: 11 }, tall);
    expect(cam).toEqual(rest);
    for (let y = 12; y >= 0; y--) cam = followCamera(cam, { x: 3, y }, tall);
    expect(cam.y).toBe(0);
  });

  it('падение за нижнюю границу карты не выводит камеру за пределы', () => {
    const cam = followCamera({ x: 0, y: 0 }, { x: 5, y: 9 }, area);
    expect(cam.y).toBe(0);
  });
});
