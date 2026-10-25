import { describe, expect, it } from 'vitest';
import {
  BRICK_CELLS,
  BRICK_COLS,
  BRICK_ROWS,
  BrickConsole,
  NEUTRAL_BRICK_INPUT,
  PREVIEW_CELLS,
  makeBrickInput,
  type BrickConsoleEntry,
} from '../../src/brick';
import { SEA_GAME_A, SEA_ROMEO_MENU, SEA_START, SEA_START_LEAD_TICKS } from '../../src/brick/seaAnimations';
import { SEA_ART_TOP, SEA_MENU_ART, seaMenuField } from '../../src/brick/seaMenu';
import { BRICK_GAMES } from '../../src/brick/games';
import { SEA_ATTRACT_TUNE, SEA_INTRO_TUNE, SEA_ROMEO_TUNE } from '../../src/audio/seaTunes';

const rows = (field: Uint8Array): string[] =>
  Array.from({ length: BRICK_ROWS }, (_, y) => Array.from({ length: BRICK_COLS }, (_, x) => (field[y * BRICK_COLS + x] ? '#' : '.')).join(''));

/** Меню «Морского боя» по фотографиям оригинала: буква A, номер «01», рисунок игры (снимок photo 17-54-11). */
describe('меню «Морского боя»', () => {
  it('экран A 01 совпадает с фотографией оригинала', () => {
    expect(rows(seaMenuField('A', 1))).toEqual([
      '..........',
      '....###...',
      '...#...#..',
      '...#...#..',
      '...#####..',
      '...#...#..',
      '..........',
      '..........',
      '..###..#..',
      '..#.#.##..',
      '..#.#..#..',
      '..#.#..#..',
      '..###..#..',
      ...SEA_MENU_ART.A!,
    ]);
  });

  it('у каждой буквы есть рисунок в нижних семи строках, буква и номер не пересекаются с ним', () => {
    for (const letter of 'ABDEF') {
      const art = SEA_MENU_ART[letter]!;
      expect(art, letter).toHaveLength(BRICK_ROWS - SEA_ART_TOP);
      expect(rows(seaMenuField(letter, 1)).slice(SEA_ART_TOP), letter).toEqual([...art]);
    }
  });

  it('анимация «Ромео и Джульетты» начинается с сердца, идёт петлёй и занимает только нижние строки', () => {
    const total = SEA_ROMEO_MENU.total;
    expect(total).toBe(238 * 2);
    expect(SEA_ROMEO_MENU.frames[0]!.ticks).toBe(48 * 2);
    const first = rows(seaMenuField('C', 1, 0));
    const later = rows(seaMenuField('C', 1, 48 * 2 + 5));
    expect(first.slice(0, SEA_ART_TOP)).toEqual(later.slice(0, SEA_ART_TOP));
    expect(first.slice(SEA_ART_TOP)).not.toEqual(later.slice(SEA_ART_TOP));
    expect(rows(seaMenuField('C', 1, total))).toEqual(first);
  });
});

describe('записи анимаций с видео', () => {
  it('длительности петель совпадают с видео (30 кадров в секунду = 2 такта)', () => {
    expect(SEA_START.total).toBe(404 * 2);
    expect(SEA_GAME_A.total).toBe(707 * 2);
    expect(SEA_START_LEAD_TICKS).toBe(14);
  });

  it('кадры заставки и игры A — поле 10 × 20; превью есть только у игры A', () => {
    for (const frame of [...SEA_START.frames, ...SEA_ROMEO_MENU.frames, ...SEA_GAME_A.frames]) expect(frame.cells).toHaveLength(BRICK_CELLS);
    expect(SEA_START.frames.every((frame) => frame.preview === null)).toBe(true);
    expect(SEA_GAME_A.frames.every((frame) => frame.preview?.length === PREVIEW_CELLS)).toBe(true);
    expect(SEA_GAME_A.frames.some((frame) => frame.preview!.some(Boolean))).toBe(true);
  });
});

describe('мелодии «Морского боя»', () => {
  it('петли заканчиваются на длине записи (заставка 11,299 с, Ромео 19,775 с, игра A 23,567 с)', () => {
    const total = (tones: readonly { ms: number }[]): number => tones.reduce((sum, tone) => sum + tone.ms, 0);
    expect(total(SEA_INTRO_TUNE)).toBe(305 + 12 * 11299);
    expect(total(SEA_ROMEO_TUNE)).toBe(20 * 19775);
    expect(total(SEA_ATTRACT_TUNE)).toBe(8 * 23567);
  });

  it('все ноты — в диапазоне пищалки; шум помечен', () => {
    for (const tone of [...SEA_INTRO_TUNE, ...SEA_ROMEO_TUNE, ...SEA_ATTRACT_TUNE]) {
      expect(tone.ms).toBeGreaterThan(0);
      expect(tone.hz === 0 || (tone.hz >= 250 && tone.hz <= 2700)).toBe(true);
    }
    expect(SEA_INTRO_TUNE.some((tone) => tone.noise)).toBe(true);
  });
});

const entries: BrickConsoleEntry[] = ['sea-battle', 'tank', 'romeo-juliet'].map((id, index) => ({
  id,
  symbol: 'ABC'[index]!,
  def: BRICK_GAMES[id] ?? null,
}));
const press = (...actions: ('rotate' | 'up' | 'left' | 'right' | 'down')[]) => makeBrickInput(actions);

describe('консоль в стиле sea: заставка → меню → анимация игры A → партия', () => {
  const make = (): BrickConsole => new BrickConsole({ catalog: entries, seed: 3, menuStyle: 'sea' });

  it('без проверки экрана: сразу заставка с пустой панелью, затем кадры из записи', () => {
    const c = make();
    expect(c.bootCheck).toBe(false);
    expect(c.powerOn()).toEqual([{ type: 'intro' }]);
    expect(c.intro).toBe(true);
    expect(c.cells().some(Boolean)).toBe(false); // семь кадров видео пустой экран
    for (let i = 0; i < SEA_START_LEAD_TICKS + 3; i++) c.menu(NEUTRAL_BRICK_INPUT);
    expect(c.cells()).toEqual(SEA_START.at(3).cells);
    expect(c.cells().some(Boolean)).toBe(true);
  });

  it('любая кнопка уходит из заставки в меню, не меняя выбор; «старт» делает то же', () => {
    const c = make();
    c.powerOn();
    expect(c.menu(press('rotate'))).toEqual([{ type: 'move' }]);
    expect(c.intro).toBe(false);
    expect(c.symbol).toBe('A');
    c.powerOn();
    expect(c.start()).toEqual([{ type: 'move' }]);
    expect(c.inMenu).toBe(true);
    expect(rows(c.cells())).toEqual(rows(seaMenuField('A', 1)));
  });

  it('в меню ROTATE листает игры, а рисунок «C» начинается с первого кадра при выборе', () => {
    const c = make();
    c.powerOn();
    c.menu(press('rotate'));
    c.menu(press('rotate'));
    c.menu(press('rotate'));
    expect(c.symbol).toBe('C');
    for (let i = 0; i < 100; i++) c.menu(NEUTRAL_BRICK_INPUT);
    expect(rows(c.cells())).not.toEqual(rows(seaMenuField('C', 1, 0)));
    c.menu(press('rotate'));
    c.menu(press('rotate'));
    c.menu(press('rotate'));
    expect(c.symbol).toBe('C');
    expect(rows(c.cells())).toEqual(rows(seaMenuField('C', 1, 0)));
  });

  it('«старт» на игре A показывает анимацию с превью, кнопка начинает партию; RESET возвращает в меню', () => {
    const c = make();
    c.powerOn();
    c.menu(press('rotate')); // из заставки в меню: A
    expect(c.start()).toEqual([{ type: 'attract' }]);
    expect(c.inMenu).toBe(true);
    expect(c.cells()).toEqual(SEA_GAME_A.at(0).cells);
    for (let i = 0; i < 40; i++) c.menu(NEUTRAL_BRICK_INPUT);
    expect(c.cells()).toEqual(SEA_GAME_A.at(40).cells);
    expect(c.preview()).toEqual(SEA_GAME_A.at(40).preview);
    expect(c.menu(press('left'))).toContainEqual({ type: 'started' });
    expect(c.inMenu).toBe(false);
    expect(c.phase).toBe('playing');
    c.restart();
    expect(c.inMenu).toBe(true);
    expect(c.intro).toBe(false);
    expect(c.preview()).toBeNull();
  });

  it('остальные игры запускаются сразу, без анимации', () => {
    const c = make();
    c.powerOn();
    c.menu(press('rotate'));
    c.menu(press('rotate'));
    expect(c.symbol).toBe('B');
    expect(c.start()).toContainEqual({ type: 'started' });
    expect(c.inMenu).toBe(false);
  });
});
