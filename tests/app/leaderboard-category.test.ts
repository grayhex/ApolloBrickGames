import { rulesetFor, localHiSuffix } from '../../src/games/rulesets';
import { describe, it, expect } from 'vitest';
import { categoryFor, validateCategory, rankedPage, selection, STANDARD_START, nickname } from '../../src/leaderboards/category';
import { createCabinet } from '../../src/app/cabinet';
import { TOYS } from '../../src/app/toys';
import { BRICK_GAMES } from '../../src/brick/games';
import { makeFrame } from '../../src/core';
const s = (toyId = 'clock99', gameId = 'tetris', mode = 0) => ({
  gameId,
  toyId,
  mode,
  rulesetVersion: rulesetFor(gameId,mode),
  startProfile: STANDARD_START,
});
describe('stable leaderboard categories', () => {
  it('resets only games whose rules changed, including local and global records', () => {
    for(const gameId of ['snake','dice','frog','honeybee']){
      expect(categoryFor(s('clock99',gameId))).toContain(':r2:');
      expect(localHiSuffix(gameId)).toBe(':r2:hi');
      expect(()=>selection({...s('clock99',gameId),rulesetVersion:'1'})).toThrow();
      expect(()=>validateCategory(`${gameId}:0:r1:standard-v1:matrix`)).toThrow();
    }
    expect(categoryFor(s('mario','mario'))).toBe('mario:0:r1:standard-v1:mario');
    expect(categoryFor(s())).toBe('tetris:0:r1:standard-v1:matrix');
    expect(localHiSuffix('tetris')).toBe(':hi');
  });
  it('uses the canonical engine mode, never the on-screen/menu position', () => {
    const model = {
      ...TOYS.clock99,
      defaultGame: 'tetris' as const,
      games: [{ id: 'tetris' as const, label: 'Tetris', status: 'ready' as const, modes: [5, 2] }],
    };
    const c = createCabinet(model, { seed: 1, loadHi: () => 0, defs: BRICK_GAMES });
    expect(c.info['mode']).toBe(1);
    expect(c.ranking).toEqual({ mode: 5, speed: 0, level: 0 });
    expect(categoryFor(s('clock99', 'tetris', c.ranking.mode))).toBe(categoryFor(s('seabattle', 'tetris', 5)));
    c.menu(makeFrame({ pressed: ['up'] }));
    expect(c.info['mode']).toBe(2);
    expect(c.ranking.mode).toBe(2);
    c.menu(makeFrame({ pressed: ['left', 'right'] }));
    c.start();
    expect(c.ranking).toEqual({ mode: 2, speed: 1, level: 1 });
  });
  it('merges only identical rules and effective controls', () => {
    expect(categoryFor(s('clock99', 'racing'))).toBe(categoryFor(s('brickgame', 'racing')));
    // Tetris на универсальной модели без FIRE (кнопка нужна только Jig Saw): управление то же, что у Apollo, — рейтинг общий.
    expect(categoryFor(s('clock99'))).toBe(categoryFor(s('brickgame')));
    expect(categoryFor(s('brickgame', 'jigsaw'))).toMatch(/matrix-fire$/); // единственная игра, где FIRE необходима, рейтинг отдельный
    expect(categoryFor(s('clock99', 'tetris', 2))).not.toBe(categoryFor(s('clock99', 'tetris', 1)));
    for (const toy of ['clock99', 'seabattle', 'tank168', 'brickgame']) expect(validateCategory(categoryFor(s(toy)))).toBe(categoryFor(s(toy)));
    expect(() => validateCategory('tetris:01:r1:standard-v1:matrix')).toThrow();
    expect(() => validateCategory('tetris:0:r2:standard-v1:matrix')).toThrow();
  });
  it('excludes debug, manual seeds, custom/editor and nonstandard starts, including invalid values', () => {
    for (const search of ['?debug', '?debug=false', '?seed=', '?seed=7', '?level=1', '?speed=9', '?mode=4', '?unknown=yes'])
      expect(rankedPage(search, '')).toBe(false);
    expect(rankedPage('?toy=brickgame&power=on&view=screen', '')).toBe(true);
    expect(rankedPage('?toy=mario', '#/room')).toBe(true);
    expect(rankedPage('?toy=mario&level=1', '')).toBe(true);
    expect(rankedPage('?toy=mario&level=2', '')).toBe(false);
    for (const hash of ['#/editor', '#/tech', '#/sheet']) expect(rankedPage('', hash)).toBe(false);
    expect(() => selection({ ...s(), startProfile: 'speed-9' })).toThrow();
    expect(() => selection({ ...s(), seed: 7 })).toThrow();
  });
  it('normalizes Unicode names and rejects HTML and invisible/control characters', () => {
    expect(nickname('  Игрок_42  ')).toBe('Игрок_42');
    expect(nickname('ＡＢ')).toBe('AB');
    expect(nickname('玩家')).toBe('玩家');
    expect(nickname('😀😀')).toBe('😀😀');
    expect(nickname("O'Neil")).toBe("O'Neil");
    for (const name of ['<img src=x>', 'a\nb', 'ab\u200B', 'x', 'x'.repeat(21)]) expect(() => nickname(name)).toThrow();
  });
});

it('isolates the photographed Sea Arkanoid start without changing the donor categories', () => {
  const photo = {...s('seabattle','arkanoid'), startProfile:'sea-arkanoid-photo-v1'};
  expect(categoryFor(photo)).not.toBe(categoryFor(s('clock99','arkanoid')));
  expect(validateCategory(categoryFor(photo))).toBe(categoryFor(photo));
  expect(()=>selection(s('seabattle','arkanoid'))).toThrow();
  expect(()=>selection({...photo,toyId:'brickgame'})).toThrow();
  expect(localHiSuffix('arkanoid',0,'seabattle')).toBe(':sea-photo-v1:hi');
  expect(localHiSuffix('arkanoid')).toBe(':hi');
});
