import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemblePack, type RawPack } from '../../src/content/validate';
import type { ContentPack } from '../../src/content/schema';
import { createContext, validationEnv, type GameContext } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const demoDir = join(root, 'public', 'content', 'demo');

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function loadRawDemoPack(): RawPack {
  const manifest = readJson(join(demoDir, 'pack.json')) as { levels: string[] };
  return {
    manifest,
    screen: readJson(join(demoDir, 'screen.json')),
    rules: readJson(join(demoDir, 'rules.json')),
    assets: readJson(join(demoDir, 'assets.json')),
    levels: manifest.levels.map((file) => readJson(join(demoDir, file))),
  };
}

export function loadDemoPack(): ContentPack {
  return assemblePack(loadRawDemoPack(), validationEnv(undefined, GLYPH_NAMES));
}

export function demoContext(): GameContext {
  return createContext(loadDemoPack());
}
