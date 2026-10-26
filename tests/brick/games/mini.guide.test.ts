import { describe, expect, it } from 'vitest';
import { makeBrickInput } from '../../../src/brick';
import { MINI_GAME_COUNT, MINI_RACING_COUNT, MINI_TETRIS_COUNT } from '../../../src/brick/games/mini';
import { guideProblems } from '../../../src/brick/guide';
import { MINI_GAMES, MINI_GAME_RANGE, MINI_RACING_GUIDE, MINI_TETRIS_GUIDE } from '../../../src/brick/guides/mini';
import { MiniConsole } from '../../../src/brick/miniConsole';

describe('описание игр Mini Brick Game B-S96', () => {
  it('две игры, общее описание на каждую; тексты на двух языках в пределах длины', () => {
    expect(MINI_GAMES.map((game) => game.id)).toEqual(['racing', 'tetris']);
    expect(guideProblems(MINI_RACING_GUIDE)).toEqual([]);
    expect(guideProblems(MINI_TETRIS_GUIDE)).toEqual([]);
  });

  it('номера на вкладках берутся из данных игры: гонки 00–01, тетрис — остальные', () => {
    expect(MINI_RACING_COUNT).toBe(2);
    expect(MINI_GAME_RANGE).toEqual({ racing: '00–01', tetris: `02–${String(MINI_GAME_COUNT - 1).padStart(2, '0')}` });
    expect(MINI_GAME_RANGE.tetris).toBe('02–96');
    expect(MINI_TETRIS_GUIDE.facts[0]).toMatchObject({ value: String(MINI_TETRIS_COUNT) });
    expect(MINI_RACING_GUIDE.facts[0]).toMatchObject({ value: '2' });
  });

  it('гонки описаны по коду: +10 за секунду, палочки 20/30/40, жизней нет; тетрис общий, без перечня вариаций', () => {
    expect(MINI_RACING_GUIDE.scoring.map((row) => row.points)).toEqual(['+10', '+20', '+30', '+40']);
    expect(MINI_RACING_GUIDE.lives).toBeNull();
    expect(MINI_TETRIS_GUIDE.summary.ru).toContain('общее');
    expect(MINI_TETRIS_GUIDE.rules.length).toBeLessThan(9);
  });
});

describe('вкладки левой панели ведут курсор меню', () => {
  const menu = (): MiniConsole => {
    const mini = new MiniConsole();
    mini.powerOn();
    mini.menu(makeBrickInput(['left']));
    return mini;
  };

  it('тетрис — первый номер тетриса, гонки — 00; номер той же игры не меняется', () => {
    const mini = menu();
    expect(mini.gameNumber).toBe(0);
    mini.selectGame('tetris');
    expect(mini.gameNumber).toBe(MINI_RACING_COUNT);
    mini.menu(makeBrickInput(['down']));
    mini.selectGame('tetris');
    expect(mini.gameNumber).toBe(MINI_RACING_COUNT + 1); // уже тетрис — курсор остался
    mini.selectGame('racing');
    expect(mini.gameNumber).toBe(0);
  });

  it('на заставке и в партии вкладки курсор не трогают', () => {
    const intro = new MiniConsole();
    intro.powerOn();
    intro.selectGame('tetris');
    expect(intro.gameNumber).toBe(0);
    const playing = menu();
    playing.start();
    playing.selectGame('tetris');
    expect(playing.gameNumber).toBe(0);
  });
});
