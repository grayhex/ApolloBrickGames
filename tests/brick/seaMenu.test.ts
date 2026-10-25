import { describe, expect, it } from 'vitest';
import {
  BRICK_CELLS,
  BRICK_COLS,
  BRICK_ROWS,
  BrickConsole,
  NEUTRAL_BRICK_INPUT,
  makeBrickInput,
  type BrickConsoleEntry,
} from '../../src/brick';
import { SEA_ROMEO_MENU, SEA_SHOT, SEA_SHOT_LAND_TICK, SEA_SHOT_SHIP_TICKS, SEA_START, SEA_START_FX_TICKS, SEA_START_LEAD_TICKS } from '../../src/brick/seaAnimations';
import { SEA_ART_TOP, SEA_MENU_ART, seaMenuField } from '../../src/brick/seaMenu';
import { BRICK_GAMES } from '../../src/brick/games';
import { seekTones } from '../../src/audio/brick';
import type { BrickTone } from '../../src/audio/brickPhrases';
import { SEA_BLAST_TONES, SEA_FALL_TICK_TONES, SEA_INTRO_TUNE, SEA_ROMEO_TUNE } from '../../src/audio/seaTunes';

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

  it('анимация «Ромео и Джульетты» — лестница к башне, петля заканчивается сердцем (не начинается им) и занимает только нижние строки', () => {
    const total = SEA_ROMEO_MENU.total;
    expect(total).toBe(238 * 2);
    const heart = SEA_ROMEO_MENU.frames.at(-1)!;
    expect(heart.ticks).toBe(48 * 2);
    expect(rows(seaMenuField('C', 1, total - 1)).slice(SEA_ART_TOP)[0]).toBe('...##.##..'); // верх сердца
    expect(rows(seaMenuField('C', 1, 0)).slice(SEA_ART_TOP)[0]).not.toBe('...##.##..');
    const first = rows(seaMenuField('C', 1, 0));
    const later = rows(seaMenuField('C', 1, 60));
    expect(first.slice(0, SEA_ART_TOP)).toEqual(later.slice(0, SEA_ART_TOP));
    expect(first.slice(SEA_ART_TOP)).not.toEqual(later.slice(SEA_ART_TOP));
    expect(rows(seaMenuField('C', 1, total))).toEqual(first);
  });
});

describe('записи анимаций с видео', () => {
  it('длительности петель совпадают с видео (30 кадров в секунду = 2 такта)', () => {
    expect(SEA_START.total).toBe(416 * 2);
    expect(SEA_SHOT.total).toBe(53 * 2);
    expect(SEA_SHOT_SHIP_TICKS).toBe(23 * 2);
    expect(SEA_SHOT_LAND_TICK).toBeLessThan(SEA_SHOT.total);
    expect(SEA_START_LEAD_TICKS).toBe(14);
  });

  it('кадры заставки, меню и хода игры A — поле 10 × 20 без превью', () => {
    for (const frame of [...SEA_START.frames, ...SEA_ROMEO_MENU.frames, ...SEA_SHOT.frames]) {
      expect(frame.cells).toHaveLength(BRICK_CELLS);
      expect(frame.preview).toBeNull();
    }
  });

  it('сцена хода: корабль с миной над ним, затем крест падает вниз', () => {
    const cross = (tick: number): number[] => {
      const rowsOn = rows(SEA_SHOT.at(tick).cells).map((row, y) => (y < 14 && row.includes('#') && !/#\.{6}#/.test(row) ? y : -1)).filter((y) => y >= 0);
      return rowsOn;
    };
    expect(cross(0)).toEqual(expect.arrayContaining([2, 3, 4])); // мина над кораблём
    expect(cross(SEA_SHOT_SHIP_TICKS + 40).some((y) => y >= 7)).toBe(true); // и ниже при падении
    expect(rows(SEA_SHOT.at(10).cells)[13]).not.toBe('..........'); // корабль виден
    expect(rows(SEA_SHOT.at(SEA_SHOT_SHIP_TICKS + 2).cells)[13]).toBe('..........'); // потом исчез
  });
});

describe('звук «Морского боя»', () => {
  /** Конец каждой дорожки в мс (дорожки идут параллельно и начинаются с `atMs`). */
  const ends = (tones: readonly BrickTone[]): number[] => {
    const clocks = new Map<number, number>();
    for (const tone of seekTones(tones, 0)) clocks.set(tone.track ?? 0, Math.max(clocks.get(tone.track ?? 0) ?? 0, tone.atMs! + tone.ms));
    return [...clocks.values()];
  };

  it('мелодии — два голоса, 24 прохода: заставка 10,435 с + пауза 0,5 с (старт через 0,347 с), Ромео 19,115 с + 0,5 с', () => {
    expect(ends(SEA_INTRO_TUNE)).toEqual([347 + 23 * 10935 + 10435, 347 + 23 * 10935 + 10435]);
    expect(ends(SEA_ROMEO_TUNE)).toEqual([23 * 19615 + 19115, 23 * 19615 + 19115]);
    expect(new Set(SEA_INTRO_TUNE.map((tone) => tone.track))).toEqual(new Set([0, 1]));
  });

  it('все ноты мелодий — ступени звукоряда устройства (синус, усиление по уровню ступени), без шума', () => {
    const scale = [664.8, 703.5, 745.8, 836.8, 885, 938.4, 994.5, 1116.2, 1253, 1327];
    for (const tone of [...SEA_INTRO_TUNE, ...SEA_ROMEO_TUNE]) {
      expect(tone.ms).toBeGreaterThan(0);
      expect(tone.wave).toBe('sine');
      expect(tone.noise).toBeUndefined();
      expect(tone.hz === 0 || scale.includes(tone.hz)).toBe(true);
    }
    const level = (hz: number): number => SEA_INTRO_TUNE.find((tone) => tone.hz === hz)!.gain!;
    expect(level(885)).toBeGreaterThan(level(745.8)); // слабые ноты на записи на 20 дБ тише
    expect(level(745.8)).toBeGreaterThan(level(664.8));
  });

  it('эффекты — шум: вспышка заставки 0,5 с, щелчок падения фигуры 55 мс', () => {
    expect(SEA_BLAST_TONES).toEqual([expect.objectContaining({ ms: 500, noise: true })]);
    expect(SEA_FALL_TICK_TONES).toEqual([expect.objectContaining({ ms: 55, noise: true })]);
  });

  it('вспышки заставки привязаны к кадрам: выстрел — труба появляется (состояние 24, кадр 211), взрыв — вспышка над парусником (состояние 31, кадр 317)', () => {
    expect(SEA_START_FX_TICKS).toEqual([425, 633]);
    const startOf = (tick: number): number => {
      let t = 0;
      for (const frame of SEA_START.frames) {
        if (tick < t + frame.ticks) return t;
        t += frame.ticks;
      }
      return -1;
    };
    expect(startOf(425)).toBe(422); // состояние 24 с 211-го кадра; звук на 212,6 (задержка обнаружения ≈ 2 кадра)
    expect(startOf(640)).toBe(634); // состояние 31 с 317-го кадра; звук на 316,4
    const tubeRows = (tick: number): number => Array.from({ length: BRICK_ROWS }, (_, y) => SEA_START.at(tick).cells[y * BRICK_COLS + 4]).filter(Boolean).length;
    expect(tubeRows(450)).toBeGreaterThan(tubeRows(400)); // к выстрелу труба выросла
    expect(SEA_START.at(640).cells).not.toEqual(SEA_START.at(600).cells); // взрыв рассыпал картинку
  });
});

const entries: BrickConsoleEntry[] = ['sea-battle', 'tank', 'romeo-juliet'].map((id, index) => ({
  id,
  symbol: 'ABC'[index]!,
  def: BRICK_GAMES[id] ?? null,
}));
const press = (...actions: ('rotate' | 'up' | 'left' | 'right' | 'down')[]) => makeBrickInput(actions);

describe('консоль в стиле sea: заставка → меню → партия', () => {
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

  it('заставка подаёт вспышки в такт анимации: на тактах 425 и 633 петли (через 7 пустых кадров), и больше нигде', () => {
    const c = make();
    c.powerOn();
    const fx: number[] = [];
    for (let i = 1; i <= SEA_START_LEAD_TICKS + 2 * SEA_START.total + 500; i++)
      if (c.menu(NEUTRAL_BRICK_INPUT).some((event) => event.type === 'introFx')) fx.push(i - SEA_START_LEAD_TICKS);
    expect(fx).toEqual([425, 633, 425 + SEA_START.total, 633 + SEA_START.total, 425 + 2 * SEA_START.total]);
  });

  it('вспышки идут только в заставке: в меню их нет', () => {
    const c = make();
    c.powerOn();
    c.menu(press('rotate'));
    for (let i = 0; i < SEA_START.total + SEA_START_LEAD_TICKS; i++) expect(c.menu(NEUTRAL_BRICK_INPUT)).toEqual([]);
  });

  it('«старт» на игре A сразу начинает партию (заставки игры нет: запись game-a.MOV — геймплей); RESET возвращает в меню', () => {
    const c = make();
    c.powerOn();
    c.menu(press('rotate')); // из заставки в меню: A
    expect(c.start()).toContainEqual({ type: 'started' });
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
