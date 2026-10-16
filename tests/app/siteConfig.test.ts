import { describe, expect, it } from 'vitest';
import { defaultConfig, applyConfig } from '../../src/config/runtime';
import { validateConfig } from '../../src/config/schema';
import { TOYS } from '../../src/app/toys';
describe('published configuration', () => {
  it('preserves the existing toy defaults and restricted Sea Battle variants', () => {
    const config = defaultConfig(); expect(config.toys.clock99.games).toHaveLength(10); expect(config.toys.seabattle.defaultGame).toBe('sea-battle'); expect(config.toys.seabattle.games.find((g) => g.id === 'tetris')?.modes).toHaveLength(20);
  });
  it('rejects unknown or duplicate games, invalid modes, incompatible screens and unusable colours', () => {
    for (const edit of [
      (c: ReturnType<typeof defaultConfig>) => { c.toys.clock99.games = [{ id:'clock' }]; },
      (c: ReturnType<typeof defaultConfig>) => { c.toys.clock99.games.push(c.toys.clock99.games[0]!); },
      (c: ReturnType<typeof defaultConfig>) => { c.toys.clock99.games[0]!.modes = [-1]; },
      (c: ReturnType<typeof defaultConfig>) => { c.toys.mario.games = [{ id:'snake' }]; },
      (c: ReturnType<typeof defaultConfig>) => { c.toys.clock99.shells = []; },
      (c: ReturnType<typeof defaultConfig>) => { c.toys.clock99.defaultShell = 'blue'; },
    ]) { const c = defaultConfig(); edit(c); expect(() => validateConfig(c)).toThrow(); }
  });
  it('applies ordered games, default selection and colours; retains planned original Mario slots', () => {
    const original = structuredClone(TOYS); const c = defaultConfig(); c.toys.clock99.games = [{ id:'snake' },{ id:'reversi' }]; c.toys.clock99.defaultGame = 'reversi'; c.toys.clock99.defaultShell = 'white';
    try { applyConfig(validateConfig(c)); expect(TOYS.clock99.games.map((g) => g.id)).toEqual(['snake','reversi']); expect(TOYS.clock99.defaultGame).toBe('reversi'); expect(TOYS.clock99.defaultShell).toBe('white'); expect(TOYS.mario.games.filter((g) => g.status === 'planned')).toHaveLength(2); }
    finally { Object.assign(TOYS,original); }
  });
});
