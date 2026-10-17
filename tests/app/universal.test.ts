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
    for (const id of APOLLO_IDS) config.toys[id].games = config.toys[id].games.filter((g) => g.id !== 'frog');
    expect(universalGames(config).map((g) => g.id)).toContain('frog');
    config.toys.clock99.games.push({ id: 'frog' });
    expect(universalGames(config).map((g) => g.id)).not.toContain('frog');
    config.toys.brickgame.games.push({ id: 'frog', modes: [0] });
    expect(universalGames(config).filter((g) => g.id === 'frog')).toEqual([{ id: 'frog', modes: [0] }]);
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
});
