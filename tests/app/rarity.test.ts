import { describe, expect, it } from 'vitest';
import { GAMES, type GameId } from '../../src/games/catalog';
import { RARITY_BY_GAME, RARITY_LABEL, RARITY_ORDER, rarityOf, rarityRank, sortByRarity } from '../../src/games/rarity';
import { ENTRIES } from '../../src/encyclopedia/catalog';
import { defaultConfig } from '../../src/config/runtime';
import { universalGames } from '../../src/config/schema';

const UNRATED: readonly GameId[] = ['mario', 'clock', 'romeo-juliet']; // в вики их нет

describe('game rarity (Retro Consoles Wiki · Brick Game)', () => {
  it('classifies every catalog game except the three that the wiki does not list', () => {
    const missing = (Object.keys(GAMES) as GameId[]).filter((id) => rarityOf(id) === null).sort();
    expect(missing).toEqual([...UNRATED].sort());
    for (const id of Object.keys(RARITY_BY_GAME)) expect(Object.keys(GAMES)).toContain(id);
  });
  it('keeps the five wiki sections in order, with labels in both languages', () => {
    expect(RARITY_ORDER).toEqual(['common', 'uncommon', 'rare', 'ultra-rare', 'mobile']);
    for (const rarity of RARITY_ORDER) {
      const label = RARITY_LABEL[rarity];
      for (const text of Object.values(label)) expect(text).not.toBe('');
    }
    expect(rarityRank('tank')).toBeLessThan(rarityRank('simon'));
    expect(rarityRank('simon')).toBeLessThan(rarityRank('dance'));
    expect(rarityRank('dance')).toBeLessThan(rarityRank('sea-battle'));
    expect(rarityRank('sea-battle')).toBeLessThan(rarityRank('2048'));
    expect(rarityRank('mario')).toBe(RARITY_ORDER.length);
  });
  it('sorts stably: ties keep the original order, unrated games go last', () => {
    const input = ['2048', 'dance', 'mario', 'snake', 'tank', 'simon', 'quarth'] as const;
    expect(sortByRarity(input, (id) => id)).toEqual(['snake', 'tank', 'simon', 'dance', 'quarth', '2048', 'mario']);
  });
  it('lists the universal console games from the most common to the rarest, keeping the admin order inside a tier', () => {
    const config = defaultConfig();
    const ranks = universalGames(config).map((g) => rarityRank(g.id));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    config.toys.brickgame.games = [{ id: 'sea-battle' }, { id: 'snake' }, { id: 'tetris' }, { id: 'dance' }];
    config.toys.brickgame.defaultGame = 'sea-battle';
    const ids = universalGames(config).map((g) => g.id);
    expect(ids.slice(0, 2)).toEqual(['snake', 'tetris']); // Common: порядок админки
    expect(ids.indexOf('dance')).toBeLessThan(ids.indexOf('sea-battle'));
  });
  it('sorts the encyclopedia by rarity first and by evidence within a tier', () => {
    const ranks = ENTRIES.map((e) => rarityRank(e.id));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const rank of new Set(ranks)) {
      const scores = ENTRIES.filter((e) => rarityRank(e.id) === rank).map((e) => e.accuracy);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    }
    expect(ENTRIES.at(0)!.id).toBe('tetris');
    expect(ENTRIES.slice(-3).map((e) => e.id).sort()).toEqual([...UNRATED].sort());
  });
});
