import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemblePack, type RawPack } from '../../src/content/validate';
import type { ContentPack } from '../../src/content/schema';
import { createContext, validationEnv, type GameContext } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contentDir = join(root, 'public', 'content');

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** Сырые файлы пакета из public/content/<имя>/. */
export function loadRawPack(name: string): RawPack {
  const dir = join(contentDir, name);
  const manifest = readJson(join(dir, 'pack.json')) as {
    screen: string;
    rules: string;
    assets: string;
    animations?: string;
    levels: string[];
  };
  const raw: RawPack = {
    manifest,
    screen: readJson(join(dir, manifest.screen)),
    rules: readJson(join(dir, manifest.rules)),
    assets: readJson(join(dir, manifest.assets)),
    levels: manifest.levels.map((file) => readJson(join(dir, file))),
  };
  if (manifest.animations !== undefined) raw.animations = readJson(join(dir, manifest.animations));
  return raw;
}

export function loadRawDemoPack(): RawPack {
  return loadRawPack('demo');
}

/** Однокомнатное демо (основной маршрут). */
export function loadRoomPack(): ContentPack {
  return assemblePack(loadRawPack('room'), validationEnv(undefined, GLYPH_NAMES));
}

/** Тестовый уровень по видео (маршрут #/clip). */
export function loadClipPack(): ContentPack {
  return assemblePack(loadRawPack('clip'), validationEnv(undefined, GLYPH_NAMES));
}

export function clipContext(): GameContext {
  return createContext(loadClipPack());
}

export function roomContext(): GameContext {
  return createContext(loadRoomPack());
}

export function loadDemoPack(): ContentPack {
  return assemblePack(loadRawDemoPack(), validationEnv(undefined, GLYPH_NAMES));
}

export function demoContext(): GameContext {
  return createContext(loadDemoPack());
}
