import { describe, expect, it } from 'vitest';
import { applyMatrix, defaultQuad, homography, quadArea, quadProblems, warpImage } from '../../src/editor/calibration';
import type { Pt, Quad } from '../../src/editor/types';

const square: Quad = [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }, { x: 10, y: 110 }];

describe('калибровка четырёх углов', () => {
  it('нормальный четырёхугольник (в том числе перспективный) принимается', () => {
    expect(quadProblems(square)).toEqual([]);
    const perspective: Quad = [{ x: 40, y: 20 }, { x: 300, y: 5 }, { x: 330, y: 200 }, { x: 10, y: 180 }];
    expect(quadProblems(perspective)).toEqual([]);
    expect(quadProblems(defaultQuad(640, 360))).toEqual([]);
  });

  it('вырожденные: совпавшие углы, тонкая полоса, три угла на одной прямой', () => {
    const same: Quad = [{ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 110, y: 110 }, { x: 10, y: 110 }];
    expect(quadProblems(same)[0]).toMatch(/вырожден/);
    const thin: Quad = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 2 }, { x: 0, y: 2 }];
    expect(quadProblems(thin)[0]).toMatch(/вырожден/);
    const line: Quad = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(quadProblems(line)[0]).toMatch(/вырожден/);
  });

  it('самопересекающийся («бабочка») отвергается с подсказкой про порядок', () => {
    const bow: Quad = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    expect(quadProblems(bow)[0]).toMatch(/самопересека/);
    const bow2: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }];
    expect(quadProblems(bow2)[0]).toMatch(/самопересека/);
  });

  it('невыпуклый и обратный порядок обхода отвергаются', () => {
    const concave: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 80, y: 20 }];
    expect(quadProblems(concave)[0]).toMatch(/невыпукл/);
    const reversed: Quad = [square[0], square[3], square[2], square[1]];
    expect(quadProblems(reversed)[0]).toMatch(/против часовой/);
    expect(quadProblems([{ x: Number.NaN, y: 0 }, square[1], square[2], square[3]])[0]).toMatch(/числами/);
  });

  it('площадь четырёхугольника', () => {
    expect(quadArea(square)).toBe(10000);
  });

  it('гомография переводит углы ровно в углы и сохраняет центр квадрата', () => {
    const dst: Pt[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];
    const m = homography(square, dst);
    expect(m).not.toBeNull();
    if (!m) return;
    square.forEach((p, i) => {
      const q = applyMatrix(m, p.x, p.y);
      expect(q?.x).toBeCloseTo(dst[i]?.x ?? 0, 6);
      expect(q?.y).toBeCloseTo(dst[i]?.y ?? 0, 6);
    });
    const center = applyMatrix(m, 60, 60);
    expect(center?.x).toBeCloseTo(100, 6);
    expect(center?.y).toBeCloseTo(50, 6);
    expect(homography([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], dst)).toBeNull();
  });

  it('выпрямление: клетка шахматного поля после коррекции перспективы попадает на свои пиксели', () => {
    // Исходник 100×100: левая половина красная, правая синяя; игровая область — вся картинка.
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const left = x < 50;
        data[o] = left ? 255 : 0;
        data[o + 2] = left ? 0 : 255;
        data[o + 3] = 255;
      }
    }
    const whole: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const out = warpImage({ width, height, data }, whole, 20, 10);
    const px = (x: number, y: number): number[] => [...out.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 4)];
    expect(px(2, 5)).toEqual([255, 0, 0, 255]);
    expect(px(17, 5)).toEqual([0, 0, 255, 255]);

    // Область = только правая половина: все пиксели синие.
    const right: Quad = [{ x: 60, y: 10 }, { x: 95, y: 10 }, { x: 95, y: 90 }, { x: 60, y: 90 }];
    const blue = warpImage({ width, height, data }, right, 8, 8);
    for (let i = 0; i < 64; i++) expect([blue[i * 4], blue[i * 4 + 2], blue[i * 4 + 3]]).toEqual([0, 255, 255]);

    // Перспектива: трапеция из квадрата изображения тоже даёт полностью заполненный результат без прозрачных пикселей.
    const trapezoid: Quad = [{ x: 20, y: 10 }, { x: 80, y: 10 }, { x: 95, y: 90 }, { x: 5, y: 90 }];
    const warped = warpImage({ width, height, data }, trapezoid, 30, 20);
    expect([...warped].filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
    // Исходные данные не изменены.
    expect(data[0]).toBe(255);
  });

  it('область за пределами кадра остаётся прозрачной', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4).fill(255);
    const outside: Quad = [{ x: 50, y: 50 }, { x: 80, y: 50 }, { x: 80, y: 80 }, { x: 50, y: 80 }];
    const out = warpImage({ width: 10, height: 10, data }, outside, 4, 4);
    expect([...out].every((v) => v === 0)).toBe(true);
  });
});
