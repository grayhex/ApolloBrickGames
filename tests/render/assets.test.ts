import { describe, expect, it } from 'vitest';
import type { AssetCatalog } from '../../src/content/schema';
import { cueForEvent, NullAudio } from '../../src/audio/audio';
import { AssetStore } from '../../src/render/assets';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { drawText, textWidth } from '../../src/render/font';

const catalog: AssetCatalog = {
  schemaVersion: 1,
  id: 'c',
  status: 'demo',
  assets: {
    block: { kind: 'placeholder', glyph: 'block' },
    hero: { kind: 'image', src: 'img/hero.png', frameWidth: 8, frameHeight: 8, frames: 4, frameTicks: 3, fallbackGlyph: 'hero' },
    lost: { kind: 'image', src: 'img/lost.png', frameWidth: 8, frameHeight: 8, frames: 1, frameTicks: 1, fallbackGlyph: 'unknown' },
  },
};

describe('AssetStore', () => {
  it('загружает картинки по адресу относительно каталога; недоступные заменяются заглушкой с предупреждением', async () => {
    const requested: string[] = [];
    const store = new AssetStore(catalog, 'https://example.test/CrocodileMario/content/demo/assets.json', async (url) => {
      requested.push(url);
      return url.endsWith('hero.png') ? ({} as CanvasImageSource) : null;
    });
    const warnings = await store.load();
    expect(requested.sort()).toEqual([
      'https://example.test/CrocodileMario/content/demo/img/hero.png',
      'https://example.test/CrocodileMario/content/demo/img/lost.png',
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/«lost».*заглушка/);
  });

  it('кадр анимации выбирается по такту симуляции', () => {
    const store = new AssetStore(catalog, 'https://example.test/a.json', async () => null);
    const frames = [0, 1, 2, 3, 4, 5, 6, 9, 11, 12].map((tick) => store.frameIndex('hero', tick));
    expect(frames).toEqual([0, 0, 0, 1, 1, 1, 2, 3, 3, 0]);
    expect(store.frameIndex('block', 99)).toBe(0);
    expect(store.frameIndex('missing', 99)).toBe(0);
  });

  it('набор заглушек содержит всё, что использует демо-каталог', () => {
    for (const name of ['block', 'platform', 'deco', 'hero', 'life', 'projectile', 'target', 'patroller', 'hazard', 'finish', 'unknown']) {
      expect(GLYPH_NAMES).toContain(name);
    }
  });
});

describe('шрифт HUD', () => {
  it('ширина текста: 3 пикселя на знак и 1 между знаками', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('0')).toBe(3);
    expect(textWidth('00000')).toBe(19);
  });

  it('drawText рисует только пиксели 1×1 и не падает на незнакомых символах', () => {
    const rects: number[][] = [];
    const ctx = { fillStyle: '', fillRect: (...a: number[]) => rects.push(a) } as unknown as CanvasRenderingContext2D;
    drawText(ctx, 'D-1 ?', 0, 0, '#000');
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.every((r) => r[2] === 1 && r[3] === 1)).toBe(true);
  });
});

describe('аудио-порт', () => {
  it('NullAudio ничего не воспроизводит, но хранит mute', () => {
    const audio = new NullAudio();
    expect(audio.muted).toBe(true);
    audio.setMuted(false);
    expect(audio.muted).toBe(false);
    expect(() => audio.play()).not.toThrow();
  });

  it('события ядра переводятся в реплики; служебные — нет', () => {
    expect(cueForEvent({ type: 'shot', x: 0, y: 0, dir: 1, tick: 1 })).toBe('shot');
    expect(cueForEvent({ type: 'hit', x: 0, y: 0, targetId: 't', destroyed: true, tick: 1 })).toBe('hit');
    expect(cueForEvent({ type: 'projectileBlocked', x: 0, y: 0, tick: 1 })).toBe('blocked');
    expect(cueForEvent({ type: 'death', cause: 'pit', x: 0, y: 0, tick: 1 })).toBe('death');
    expect(cueForEvent({ type: 'levelCompleted', levelId: 'a', next: null, tick: 1 })).toBe('levelCompleted');
    expect(cueForEvent({ type: 'phaseChanged', from: 'ready', to: 'playing', tick: 1 })).toBeNull();
  });
});
