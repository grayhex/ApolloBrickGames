import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../../src/config/runtime';
import { validateConfig, universalGames } from '../../src/config/schema';
import { BRICK_GAMES } from '../../src/brick/games';
import { TOYS, APOLLO_IDS } from '../../src/app/toys';
import { canAssign, bodyActions } from '../../src/app/bodyButtons';

describe('universal Brick Game', () => {
  it('upgrades old published documents without changing the four original menus', () => {
    const config = defaultConfig();
    const legacy = { version: 1, toys: Object.fromEntries(APOLLO_IDS.map((id) => [id, config.toys[id]])) };
    const loaded = validateConfig(legacy);
    for (const id of APOLLO_IDS) expect(loaded.toys[id]).toEqual(config.toys[id]);
    expect(loaded.toys.brickgame.defaultGame).toBe('tetris');
    expect(loaded.toys.brickgame.shells).toEqual(['gray', 'black']);
    expect(loaded.toys.brickgame.defaultShell).toBe('gray');
    expect(() => validateConfig({ ...legacy, toys: { ...legacy.toys, brickgame: {} } })).toThrow();
    expect(() => validateConfig({ ...legacy, toys: { ...legacy.toys, brickgame: null } })).toThrow();
  });
  it('assigns each unowned game once, ignoring Mario’s unimplemented slots', () => {
    const config = defaultConfig();
    for (const id of ['clock99', 'seabattle', 'tank168'] as const)
      config.toys[id] = { ...config.toys[id], games: [{ id: 'tetris' }], defaultGame: 'tetris' };
    const ids = universalGames(config).map((g) => g.id);
    expect(ids).toContain('shooting');
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of Object.keys(BRICK_GAMES)) expect(ids).toContain(id);
  });
  it('recomputes assignments and preserves explicitly pinned games and modes', () => {
    const config = defaultConfig();
    // По умолчанию универсальной модели назначены все игры (кроме Mario), поэтому пересчёт проверяем на урезанном списке.
    expect(universalGames(config)).toHaveLength(55);
    config.toys.brickgame.games = [{ id: 'tetris' }];
    config.toys.brickgame.defaultGame = 'tetris';
    for (const id of APOLLO_IDS) config.toys[id].games = config.toys[id].games.filter((g) => g.id !== 'frog');
    expect(universalGames(config).map((g) => g.id)).toContain('frog');
    config.toys.clock99.games.push({ id: 'frog' });
    expect(universalGames(config).map((g) => g.id)).not.toContain('frog');
    config.toys.brickgame.games.push({ id: 'frog', modes: [0] });
    expect(universalGames(config).filter((g) => g.id === 'frog')).toEqual([{ id: 'frog', modes: [0] }]);
  });
  it('accepts both monoblock colours and keeps them out of original-model palettes', () => {
    const config = defaultConfig();
    config.toys.brickgame.defaultShell = 'black';
    expect(validateConfig(config).toys.brickgame.defaultShell).toBe('black');
    config.toys.mario.shells.push('black');
    expect(() => validateConfig(config)).toThrow();
  });
  it('physically supports every matrix game without inventing FIRE on Apollo', () => {
    for (const game of Object.values(BRICK_GAMES)) expect(canAssign(game!, TOYS.brickgame)).toBe(true);
    expect(bodyActions(TOYS.brickgame).has('fire')).toBe(true);
    for (const id of APOLLO_IDS) expect(bodyActions(TOYS[id]).has('fire')).toBe(false);
    const config = defaultConfig();
    config.toys.brickgame.games = [{ id: 'jigsaw' }];
    config.toys.brickgame.defaultGame = 'jigsaw';
    expect(validateConfig(config).toys.brickgame.defaultGame).toBe('jigsaw');
  });
  it('colour of the carousel thumbnail is configurable per toy and defaults to the former white', () => {
    const config = defaultConfig();
    for (const id of [...APOLLO_IDS, 'brickgame'] as const) expect(config.toys[id].thumbShell).toBe('white');
    const legacy = structuredClone(config) as unknown as { toys: Record<string, Record<string, unknown>> };
    for (const toy of Object.values(legacy.toys)) delete toy['thumbShell'];
    expect(validateConfig(legacy).toys.tank168.thumbShell).toBe('white');
    config.toys.tank168.thumbShell = 'red';
    config.toys.brickgame.thumbShell = 'black';
    const loaded = validateConfig(config);
    expect([loaded.toys.tank168.thumbShell, loaded.toys.brickgame.thumbShell]).toEqual(['red', 'black']);
    config.toys.tank168.thumbShell = 'black';
    expect(() => validateConfig(config)).toThrow(); // чёрный — не цвет Apollo
    config.toys.tank168.thumbShell = 'red';
    config.toys.brickgame.thumbShell = 'red';
    expect(() => validateConfig(config)).toThrow();
  });
});
