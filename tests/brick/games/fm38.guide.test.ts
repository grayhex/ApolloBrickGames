import { describe, expect, it } from 'vitest';
import { FMConsole } from '../../../src/brick/fmConsole';
import { guideProblems } from '../../../src/brick/guide';
import { FM38_A_GUIDE, FM38_B_GUIDE, FM38_GAMES } from '../../../src/brick/guides/fm38';
import { PENTIX_POOL, TETRIS_POOL } from '../../../src/brick/games/tetris/shapes';
import { makeBrickInput } from '../../../src/brick';

describe('описание игр FM-38', () => {
  it('две игры A и B; тексты на двух языках в пределах длины', () => {
    expect(FM38_GAMES.map((game) => [game.id, game.key])).toEqual([['a', 'A'], ['b', 'B']]);
    expect(guideProblems(FM38_A_GUIDE)).toEqual([]);
    expect(guideProblems(FM38_B_GUIDE)).toEqual([]);
  });

  it('числа берутся из набора фигур: A — семь обычных, B — 26 фигур по 3–5 клеток', () => {
    expect(FM38_A_GUIDE.facts[0]).toMatchObject({ value: String(TETRIS_POOL.length) });
    expect(FM38_B_GUIDE.facts[0]).toMatchObject({ value: String(PENTIX_POOL.length) });
    expect(FM38_B_GUIDE.rules[1]!.ru).toContain(String(PENTIX_POOL.length));
  });

  it('в описаниях только правила игры: ни «тайминги», ни «приближено» в правилах, прогрессии и подсказках; это уходит в допущения', () => {
    for (const guide of [FM38_A_GUIDE, FM38_B_GUIDE]) {
      const shown = [guide.summary, guide.goal, ...guide.rules, guide.progression, ...guide.controls.map((control) => control.text)];
      for (const text of shown) {
        expect(text.ru).not.toMatch(/приближен|тайминг|допущен|реконструкц/i);
        expect(text.en).not.toMatch(/approximat|timing|assum|reconstruct/i);
      }
      expect(guide.assumptions.length).toBeGreaterThan(0);
    }
  });

  it('управление совпадает с корпусом: стрелки, поворот, ускорение и старт; UP и FIRE нет', () => {
    for (const guide of [FM38_A_GUIDE, FM38_B_GUIDE]) expect(guide.controls.map((control) => control.button)).toEqual(['sides', 'rotate', 'down', 'start']);
  });
});

describe('вкладки A и B ведут игру в меню FM-38', () => {
  it('вкладка B выбирает большие фигуры, A — обычные; в партии курсор не трогается', () => {
    const fm = new FMConsole({ seed: 7 });
    fm.powerOn();
    expect(fm.gameNumber).toBe(0);
    fm.selectGame('b');
    expect(fm.gameNumber).toBe(1);
    fm.selectGame('a');
    expect(fm.gameNumber).toBe(0);
    fm.selectGame('b');
    fm.menu(makeBrickInput(['down'])); // DOWN переключает A/B
    expect(fm.gameNumber).toBe(0);
    fm.start();
    fm.selectGame('b');
    expect(fm.gameNumber).toBe(0);
  });
});
