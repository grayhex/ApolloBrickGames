import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemblePack, type RawPack } from '../../src/content/validate';
import type { ContentPack, LevelDef } from '../../src/content/schema';
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

/**
 * Пакет комнаты, игра которого начинается с тестового уровня по видео (`tunnel-run`): на нём выверены тесты механики.
 * Страница по умолчанию начинается с `mario-1` — см. `marioContext`.
 */
export function roomContext(): GameContext {
  const pack = loadRoomPack();
  return createContext({ ...pack, manifest: { ...pack.manifest, firstLevel: 'tunnel-run' } });
}

/** Пакет комнаты с игрой, начинающейся на уровне `mario-N` (геймплейное приближение оригинального уровня N). */
export function marioContext(n: number): GameContext {
  const pack = loadRoomPack();
  return createContext({ ...pack, manifest: { ...pack.manifest, firstLevel: `mario-${n}` } });
}

/** Тот же пакет, но игра начинается с тестовой комнаты `demo-room` (песочница для тестов механики и редактора). */
export function demoRoomContext(): GameContext {
  const pack = loadRoomPack();
  return createContext({ ...pack, manifest: { ...pack.manifest, firstLevel: 'demo-room' } });
}

export function levelOf(pack: ContentPack, id: string): LevelDef {
  const level = pack.levels.find((l) => l.id === id);
  if (!level) throw new Error(`В пакете нет уровня «${id}»`);
  return level;
}

export function loadDemoPack(): ContentPack {
  return assemblePack(loadRawDemoPack(), validationEnv(undefined, GLYPH_NAMES));
}

export function demoContext(): GameContext {
  return createContext(loadDemoPack());
}
