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

it('filters unfinished native slots without mutating the published config or losing a playable default',()=>{
 const original=structuredClone(TOYS),config=defaultConfig();
 try{
  config.toys['apollo-b0202'].defaultEntry='apollo-b0202.H03';config.toys['apollo-b0202'].defaultGame='tetris';
  const snapshot=structuredClone(config);applyConfig(config);
  expect(config).toEqual(snapshot);
  expect(TOYS['apollo-b0202'].games.map(g=>g.entryId)).toEqual(['apollo-b0202.A01','apollo-b0202.D01','apollo-b0202.E02','apollo-b0202.H01','apollo-b0202.H02']);
  expect(TOYS['apollo-b0202'].defaultEntry).toBe('apollo-b0202.A01');
  config.toys['apollo-b0202'].defaultEntry='apollo-b0202.H02';applyConfig(config);expect(TOYS['apollo-b0202'].defaultEntry).toBe('apollo-b0202.H02');
  config.toys['apollo-b0202'].games=[{id:'tetris',entryId:'apollo-b0202.H03'}];config.toys['apollo-b0202'].defaultEntry='apollo-b0202.H03';
  applyConfig(config);expect(TOYS['apollo-b0202'].games).toHaveLength(1);expect(TOYS['apollo-b0202'].defaultEntry).toBe('apollo-b0202.A01');
 }finally{Object.assign(TOYS,original);}
});
