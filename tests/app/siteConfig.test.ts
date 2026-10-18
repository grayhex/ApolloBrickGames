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

it('expands assigned native games for physical MODE without mutating config',()=>{
 const original=structuredClone(TOYS),config=defaultConfig();
 try{
  const snapshot=structuredClone(config);applyConfig(config);expect(config).toEqual(snapshot);
  expect(TOYS['apollo-b0202'].games.map(g=>g.entryId)).toEqual(['apollo-b0202.A01','apollo-b0202.B01','apollo-b0202.C01','apollo-b0202.D01','apollo-b0202.E01','apollo-b0202.E02','apollo-b0202.F01','apollo-b0202.G01','apollo-b0202.H01','apollo-b0202.H02','apollo-b0202.I01']);
  config.toys['apollo-b0202'].games.find(g=>g.id==='tetris')!.variants=[];
  applyConfig(config);expect(TOYS['apollo-b0202'].games.some(g=>g.entryId==='apollo-b0202.H02')).toBe(false);
 }finally{Object.assign(TOYS,original);}
});
it('upgrades the old universal palette once and preserves intentional later restrictions',()=>{
 const legacy=defaultConfig();delete legacy.toys.brickgame.shellPaletteVersion;legacy.toys.brickgame.shells=['gray','black'];
 const normalized=validateConfig(legacy);expect(normalized.toys.brickgame.shells).toEqual(['gray','black','clear','smoke']);
 normalized.toys.brickgame.shells=['gray','black'];expect(validateConfig(normalized).toys.brickgame.shells).toEqual(['gray','black']);
});
