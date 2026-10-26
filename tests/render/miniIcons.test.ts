import { expect, it } from 'vitest';
import { MINI_ICONS } from '../../src/render/miniIcons';
import { SEA_CUP_OUTLINE } from '../../src/render/seaCup';

it('шкала Mini Brick Game: 13 значков в порядке присланной колонки, контуры замкнуты и укладываются в 100 единиц', () => {
  expect(MINI_ICONS.map((icon) => icon.name)).toEqual([
    'crown', 'star', 'mushroom', 'eggplant', 'agave', 'pepper', 'pineapple', 'watermelon', 'pieces', 'grapes', 'tomato', 'bananas', 'cherries',
  ]);
  for (const icon of MINI_ICONS) {
    expect(icon.d.startsWith('M')).toBe(true);
    expect(icon.d.length).toBeGreaterThan(500);
    expect(icon.d.match(/Z/g)!.length).toBe(icon.d.match(/M/g)!.length); // каждый контур замкнут
    expect(icon.w).toBeLessThanOrEqual(100);
    expect(icon.h).toBeLessThanOrEqual(100);
    expect(icon.d).not.toMatch(/NaN|undefined/);
  }
  expect(Math.max(...MINI_ICONS.map((icon) => icon.w))).toBe(100);
  // Вишни — два круга-ягоды и черенок: контуров не меньше одного, и у значка с дырками (гриб, ананас, виноград) их больше.
  const contours = (name: string): number => MINI_ICONS.find((icon) => icon.name === name)!.d.match(/M/g)!.length;
  expect(contours('mushroom')).toBeGreaterThan(5);
  expect(contours('pineapple')).toBeGreaterThan(5);
  expect(contours('grapes')).toBeGreaterThan(5);
});

it('чашка паузы Mini Brick Game берёт тот же контур, что «Морской бой»', () => {
  expect(SEA_CUP_OUTLINE.startsWith('M')).toBe(true);
  expect(SEA_CUP_OUTLINE.match(/Z/g)!.length).toBeGreaterThanOrEqual(3);
});
