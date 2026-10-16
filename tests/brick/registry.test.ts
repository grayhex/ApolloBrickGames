import { describe, expect, it } from 'vitest';
import { BRICK_ALIASES, BRICK_GAMES, implementationId } from '../../src/brick/games';
import { BRICK_GUIDES } from '../../src/brick/guides';
import { consoleEntries } from '../../src/app/cabinet';
import { BrickConsole } from '../../src/brick/console';
import { TOYS } from '../../src/app/toys';
import { GAME_IDS } from '../../src/games/catalog';

/**
 * Контракт реестра игр: ключ каталога, идентификатор реализации и алиасы. Проверяется по полному `BRICK_GAMES` (а не только по исходным определениям):
 * экземпляр игры называется так же, как определение; записи, которые делят одну реализацию, объявлены алиасами явно; у алиасов свои рекорды и справка.
 */
describe('реестр «кирпичных» игр: каталог, реализация, алиасы', () => {
  it('у каждой записи каталога экземпляр игры называется так же, как её определение (идентификатор реализации)', () => {
    for (const [catalogId, def] of Object.entries(BRICK_GAMES)) {
      for (let mode = 0; mode < def.modes.length; mode++) {
        expect(def.create({ seed: 7, mode }).id, `${catalogId}, вариант ${mode + 1}`).toBe(def.id);
      }
      expect(implementationId(catalogId)).toBe(def.id);
    }
  });

  it('записи, делящие одну реализацию, объявлены алиасами; алиас указывает на существующую запись с той же реализацией', () => {
    const byImplementation = new Map<string, string[]>();
    for (const [catalogId, def] of Object.entries(BRICK_GAMES)) byImplementation.set(def.id, [...(byImplementation.get(def.id) ?? []), catalogId]);
    const shared = [...byImplementation.values()].filter((ids) => ids.length > 1);
    expect(shared.flat().sort()).toEqual([...Object.keys(BRICK_ALIASES), ...Object.values(BRICK_ALIASES)].sort());
    for (const [alias, target] of Object.entries(BRICK_ALIASES)) {
      expect(BRICK_GAMES[alias], alias).toBeDefined();
      expect(BRICK_GAMES[target], target).toBeDefined();
      expect(implementationId(alias)).toBe(implementationId(target));
      expect(BRICK_GUIDES[alias], `справка алиаса ${alias}`).toBeDefined();
    }
  });

  it('все записи каталога, у которых есть игра ядра, существуют в каталоге игр, а справка есть ровно у них', () => {
    for (const catalogId of Object.keys(BRICK_GAMES)) expect(GAME_IDS, catalogId).toContain(catalogId);
    expect(Object.keys(BRICK_GUIDES).sort()).toEqual(Object.keys(BRICK_GAMES).sort());
  });

  it('рекорды алиасов раздельны: консоль спрашивает рекорд по ключу записи каталога, а не по реализации', () => {
    const asked: string[] = [];
    const entriesFor = (toy: 'seabattle' | 'tank168') => consoleEntries(TOYS[toy], BRICK_GAMES);
    const seaBig = entriesFor('seabattle').findIndex((e) => e.id === 'tetris-big');
    const tankPentix = entriesFor('tank168').findIndex((e) => e.id === 'tetris-pentix');
    expect(seaBig).toBeGreaterThanOrEqual(0);
    expect(tankPentix).toBeGreaterThanOrEqual(0);
    const make = (toy: 'seabattle' | 'tank168', game: number): BrickConsole => new BrickConsole({ catalog: entriesFor(toy), game, hiScore: (id, mode) => { asked.push(`${id}:${mode}`); return 0; } });
    const a = make('seabattle', seaBig), b = make('tank168', tankPentix);
    void a.hiScore; void b.hiScore;
    expect(a.gameId).toBe('tetris-big');
    expect(b.gameId).toBe('tetris-pentix');
    expect(asked).toEqual(['tetris-big:0', 'tetris-pentix:0']);
    expect(implementationId('tetris-big')).toBe(implementationId('tetris-pentix'));
  });
});
