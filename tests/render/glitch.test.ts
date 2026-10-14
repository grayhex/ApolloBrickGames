import { describe, expect, it } from 'vitest';
import { coverage, dropoutRects, prng } from '../../src/render/glitch';

const frame = { width: 1728, height: 864, tileWidth: 64, tileHeight: 56 };

describe('prng', () => {
  it('детерминирован по зерну и даёт числа в [0, 1)', () => {
    const a = prng(7);
    const b = prng(7);
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(prng(8)()).not.toBe(prng(7)());
  });
});

describe('сбой шлейфа: прямоугольники потери', () => {
  it('уровень 0 — ничего не закрыто, 1 — весь холст, выше и ниже границ — как на границе', () => {
    expect(dropoutRects({ ...frame, level: 0, seed: 1 })).toEqual([]);
    expect(dropoutRects({ ...frame, level: -3, seed: 1 })).toEqual([]);
    expect(dropoutRects({ ...frame, level: 1, seed: 1 })).toEqual([{ x: 0, y: 0, w: 1728, h: 864 }]);
    expect(dropoutRects({ ...frame, level: 4, seed: 1 })).toEqual([{ x: 0, y: 0, w: 1728, h: 864 }]);
  });

  it('одно зерно и уровень — один и тот же набор; другое зерно — другой (потеря мерцает)', () => {
    const a = dropoutRects({ ...frame, level: 0.5, seed: 12 });
    expect(dropoutRects({ ...frame, level: 0.5, seed: 12 })).toEqual(a);
    expect(dropoutRects({ ...frame, level: 0.5, seed: 13 })).not.toEqual(a);
  });

  it('чем выше уровень, тем больше закрыто (по среднему за несколько зёрен), и всё остаётся в пределах холста', () => {
    const mean = (level: number): number => {
      let sum = 0;
      for (let seed = 1; seed <= 12; seed++) sum += coverage(dropoutRects({ ...frame, level, seed }), frame.width, frame.height);
      return sum / 12;
    };
    const levels = [0.1, 0.3, 0.5, 0.7, 0.9].map(mean);
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    expect(levels[0]!).toBeLessThan(0.1); // чуть-чуть
    expect(levels[3]!).toBeGreaterThan(0.4); // 70 % — экран уже рассыпался
    for (const r of dropoutRects({ ...frame, level: 0.7, seed: 3 })) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(frame.width + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(frame.height + 1e-6);
    }
  });
});
