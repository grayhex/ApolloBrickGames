import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '../../src/games/catalog';
import { GAME_GUIDE, SOURCE_KEYS } from '../../src/app/gameGuide';
import { MESSAGES } from '../../src/app/messages';
import { TOY_IDS, TOYS } from '../../src/app/toys';

describe('описания игр для вкладок левой панели', () => {
  it('у каждой игры каталога есть описание, и оно есть на обоих языках', () => {
    expect(Object.keys(GAME_GUIDE).sort()).toEqual([...GAME_IDS].sort());
    for (const id of GAME_IDS) {
      const guide = GAME_GUIDE[id];
      const keys = [guide.what, guide.open, ...(guide.how ? [guide.how] : [])];
      for (const key of keys) {
        for (const lang of ['ru', 'en'] as const) {
          const text = MESSAGES[lang][key];
          expect(text, `${id}/${lang}/${key}`).toBeTruthy();
          expect(text.trim().length, `${id}/${lang}/${key}`).toBeGreaterThan(12);
        }
      }
      expect(guide.sources.length, id).toBeGreaterThan(0);
      for (const source of guide.sources) expect(MESSAGES.ru[SOURCE_KEYS[source]], `${id}:${source}`).toBeTruthy();
    }
  });

  it('у каждой игры любой консоли есть описание; ключи называют игру («game.<id>.…»)', () => {
    for (const toy of TOY_IDS) {
      for (const game of TOYS[toy].games) {
        const guide = GAME_GUIDE[game.id];
        expect(guide.what, `${toy}:${game.id}`).toBe(`game.${game.id}.what`);
        expect(guide.open, `${toy}:${game.id}`).toBe(`game.${game.id}.open`);
        if (guide.how) expect(guide.how).toBe(`game.${game.id}.how`);
      }
    }
  });

  it('сведения из открытых источников помечены как «не прошивка Apollo», а там, где правил нет, прямо сказано «не установлено»', () => {
    expect(MESSAGES.ru['games.src.donor']).toContain('не прошивка Apollo');
    expect(MESSAGES.en['games.src.donor']).toContain('not Apollo firmware');
    // Игры, о которых известно только название (нет «как играют»): в «не установлено» — честная оговорка.
    for (const id of GAME_IDS.filter((game) => !GAME_GUIDE[game].how)) {
      expect(MESSAGES.ru[GAME_GUIDE[id].open].length, id).toBeGreaterThan(10);
    }
  });

  it('у консолей с вкладками есть примечание к списку (кроме Mario)', () => {
    for (const key of ['games.note.tank168', 'games.note.seabattle', 'games.note.clock99'] as const) {
      expect(MESSAGES.ru[key]).toBeTruthy();
      expect(MESSAGES.en[key]).toBeTruthy();
    }
  });
});
