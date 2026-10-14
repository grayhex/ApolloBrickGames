import { describe, expect, it } from 'vitest';
import type { HudLives } from '../../src/content/schema';
import { lifeIconCount, shownLives } from '../../src/render/hudLives';
import { loadRoomPack } from '../helpers/content';

const base: HudLives = { asset: 'hud.life', x: 0, y: 0, width: 1, height: 1, pitch: 1 };

describe('значки жизни в LCD-HUD', () => {
  it('запасные жизни: 4 жизни — три значка, последняя жизнь — ни одного; без «spare» — по значку на жизнь', () => {
    const spare = { ...base, spare: true };
    expect(shownLives(spare, 4)).toBe(3);
    expect(shownLives(spare, 1)).toBe(0);
    expect(shownLives(spare, 0)).toBe(0);
    expect(shownLives(base, 4)).toBe(4);
  });

  it('ряд не длиннее max (по умолчанию 9): при 200 жизнях рисуются все три места, а не 199 значков', () => {
    const hud = { ...base, spare: true, max: 3 };
    expect(lifeIconCount(hud, shownLives(hud, 4))).toBe(3);
    expect(lifeIconCount(hud, shownLives(hud, 200))).toBe(3);
    expect(lifeIconCount(hud, shownLives(hud, 2))).toBe(1);
    expect(lifeIconCount(base, 200)).toBe(9);
    expect(lifeIconCount(base, -1)).toBe(0);
  });

  it('в пакете комнаты: запасные жизни, три места (по видео — три значка при 4 жизнях)', () => {
    const { hud } = loadRoomPack().screen;
    expect(hud.kind).toBe('lcd');
    if (hud.kind === 'lcd') expect(hud.lives).toMatchObject({ spare: true, max: 3 });
  });
});
