import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateAnimations,
  validateAssetCatalog,
  validateLevel,
  validatePackManifest,
  validateRuleSet,
  validateScreenProfile,
} from '../../src/content/validate';
import { validationEnv } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { loadRawDemoPack } from '../helpers/content';

/** Примеры в docs/content-format.md — настоящие данные: проходят тот же валидатор, что и игра. */
const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'content-format.md'), 'utf-8');
const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => JSON.parse(match[1] ?? '') as unknown);
const env = validationEnv(undefined, GLYPH_NAMES);

describe('примеры из docs/content-format.md', () => {
  it('в документе шесть JSON-примеров: пакет, экран, правила, ресурсы, уровень, анимации', () => {
    expect(blocks).toHaveLength(6);
  });

  it('все примеры проходят проверку', () => {
    const [pack, screen, rules, assets, level, animations] = blocks;
    expect(validatePackManifest(pack).id).toBe('demo-pack');
    const parsedScreen = validateScreenProfile(screen);
    expect(parsedScreen.viewport.columns).toBe(13);
    expect(parsedScreen.cell).toEqual({ width: 128, height: 112 });
    expect(parsedScreen.hud.kind).toBe('lcd');
    expect(parsedScreen.colors.ink).toBe('#303a30');
    expect(validateRuleSet(rules, env).params.tickRateHz).toBe(20);
    expect(validateAssetCatalog(assets, env).assets['hero']).toMatchObject({
      kind: 'image',
      mirrorWhenLeft: false,
      origin: { x: 4, y: 4 },
      provenance: { status: 'blocked' },
    });
    const demoAssets = validateAssetCatalog(loadRawDemoPack().assets, env);
    expect(validateLevel(level, demoAssets, env, 'пример').objects).toHaveLength(3);
    const parsedAnimations = validateAnimations(animations);
    expect(parsedAnimations.bump).toEqual({ ticks: 5 });
    expect(parsedAnimations.intro?.routes['mini']).toHaveLength(5);
  });
});
