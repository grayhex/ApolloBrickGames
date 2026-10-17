import { expect, it } from 'vitest';
import { BRICK_GAMES } from '../../src/brick/games';
import { LIBRARY_IDS } from '../../src/games/library';
import { SCENARIO_GROUPS } from './scenarioCoverage';

it('сценарии покрывают весь каталог, включая алиасы и старые игры; без повторов и пропусков', () => {
  const ids = Object.values(SCENARIO_GROUPS).flat();
  expect(ids.length).toBe(new Set(ids).size);
  expect([...ids].sort()).toEqual(Object.keys(BRICK_GAMES).sort());
  expect(ids.filter((id) => LIBRARY_IDS.includes(id as (typeof LIBRARY_IDS)[number])).sort()).toEqual([...LIBRARY_IDS].sort());
});
