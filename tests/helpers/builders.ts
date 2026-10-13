import type { PackManifest, RuleParams } from '../../src/content/schema';
import { assemblePack } from '../../src/content/validate';
import {
  createContext,
  Game,
  makeFrame,
  validationEnv,
  type GameContext,
} from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { loadRawDemoPack } from './content';

export interface LevelSpec {
  id?: string;
  rows: string[];
  start: { x: number; y: number };
  objects?: object[];
  transitions?: object[];
}

export function rawLevel(spec: LevelSpec): Record<string, unknown> {
  const rows = spec.rows;
  return {
    schemaVersion: 1,
    id: spec.id ?? 't1',
    status: 'demo',
    width: rows[0]?.length ?? 0,
    height: rows.length,
    legend: {
      '.': { collision: 'empty' },
      '#': { collision: 'solid', asset: 'tile.block' },
    },
    rows,
    start: spec.start,
    objects: spec.objects ?? [],
    transitions: spec.transitions ?? [],
  };
}

/** Контекст из маленьких тестовых уровней; правила берутся из демо и могут быть изменены. */
export function contextFor(specs: LevelSpec[], patchRules?: (params: RuleParams) => void): GameContext {
  const raw = loadRawDemoPack();
  const levels = specs.map((spec, index) => rawLevel({ ...spec, id: spec.id ?? `t${index + 1}` }));
  const manifest = raw.manifest as PackManifest;
  manifest.levels = levels.map((_, index) => `levels/t${index + 1}.json`);
  manifest.firstLevel = String((levels[0] as { id: string }).id);
  raw.levels = levels;
  patchRules?.((raw.rules as { params: RuleParams }).params);
  return createContext(assemblePack(raw, validationEnv(undefined, GLYPH_NAMES)));
}

/** Игра уже в фазе `playing`. */
export function startedGame(ctx: GameContext, seed = 1): Game {
  const game = new Game(ctx, seed);
  game.step(makeFrame({ pressed: ['start'] }));
  return game;
}

/** Пустой коридор с полом: герой стоит на (x, h-2). */
export function corridor(width: number, height = 3): string[] {
  const rows = Array.from({ length: height - 1 }, () => '.'.repeat(width));
  rows.push('#'.repeat(width));
  return rows;
}
