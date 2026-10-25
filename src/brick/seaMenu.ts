/**
 * Главное меню «Морского боя» — по фотографиям экрана оригинала (владелец, 25 октября 2026): буква игры 5 × 5 в колонках 3–7 с первой строки,
 * номер варианта двумя цифрами 3 × 5 в строках 8–12 (десятки — с колонки 2, единицы — с колонки 6; «1» — стебель по центру цифры и «флажок» слева),
 * под ними рисунок игры в нижних строках. Рисунки A, B, D, E, F — снимки с фотографий, C («Ромео и Джульетта») на настоящем устройстве движется
 * (см. `SEA_ROMEO_MENU` — кадры из видео). Буквы и «0», «1» сняты с фото; остальные цифры (2–9) на фото не видны — допущение: тот же рисунок 3 × 5, что и у остальных консолей.
 */
import { blit, emptyField, type Sprite } from './grid';
import { SMALL_DIGITS } from './menuArt';
import { SEA_ROMEO_MENU } from './seaAnimations';
import { BRICK_COLS } from './types';

/** Буквы A–F: 5 × 5, левый верхний угол в клетке (3, 1). Рисунки точно по фотографиям (у «D» левая стойка сдвинута на колонку вправо — так на экране). */
export const SEA_LETTERS: Readonly<Record<string, Sprite>> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#...#', '.###.'],
  D: ['####.', '.#..#', '.#..#', '.#..#', '####.'],
  E: ['####.', '#....', '####.', '#....', '####.'],
  F: ['####.', '#....', '####.', '#....', '#....'],
};

export const SEA_MENU_LAYOUT = {
  letter: { x: 3, y: 1 },
  tens: { x: 2, y: 8 },
  units: { x: 6, y: 8 },
} as const;

/** Цифры номера варианта: «1» как на фото (стебель по центру, флажок слева, без основания), остальные — как у прочих консолей. */
const SEA_DIGITS: readonly Sprite[] = SMALL_DIGITS.map((digit, index) => (index === 1 ? ['.#.', '##.', '.#.', '.#.', '.#.'] : digit));

/** Нижний рисунок меню: строки поля 13–19 (7 строк × 10 клеток); `#` горит. */
export type SeaArt = readonly string[];
export const SEA_ART_TOP = 13;

/** A — «Морской бой», B — танки, D — тетрис с большими фигурами, E — тетрис, F — арканоид: статичные рисунки с фото (строки 13–19). */
export const SEA_MENU_ART: Readonly<Record<string, SeaArt>> = {
  A: ['..........', '..........', '..........', '...#......', '...#......', '.#.##.#...', '#########.'],
  B: ['..........', '..........', '..........', '..........', '.##....#..', '..##..###.', '.##...###.'],
  D: ['..........', '..........', '..#.......', '..####....', '.....#..#.', '.......##.', '#####.####'],
  E: ['..........', '..........', '..........', '....###...', '.....#..#.', '.......##.', '#####.####'],
  F: ['..........', '..........', '..........', '..........', '..#.......', '..........', '...####...'],
};

function putRows(field: Uint8Array, rows: SeaArt, top: number): void {
  rows.forEach((row, dy) => {
    for (let x = 0; x < BRICK_COLS; x++) if (row[x] === '#') field[(top + dy) * BRICK_COLS + x] = 1;
  });
}

/** Экран меню: буква, номер варианта (с единицы), рисунок игры; `tick` — такты с выбора игры (двигается только «C»). */
export function seaMenuField(letter: string, mode: number, tick = 0): Uint8Array {
  const field = emptyField();
  const big = SEA_LETTERS[letter.toUpperCase()];
  if (big) blit(field, big, SEA_MENU_LAYOUT.letter.x, SEA_MENU_LAYOUT.letter.y);
  const tens = SEA_DIGITS[Math.floor(mode / 10) % 10];
  const units = SEA_DIGITS[mode % 10];
  if (tens) blit(field, tens, SEA_MENU_LAYOUT.tens.x, SEA_MENU_LAYOUT.tens.y);
  if (units) blit(field, units, SEA_MENU_LAYOUT.units.x, SEA_MENU_LAYOUT.units.y);
  const key = letter.toUpperCase();
  if (key === 'C') {
    // «Ромео и Джульетта» на настоящем устройстве движется: сердце, затем лестница к башне (кадры из видео, начало — с выбором игры).
    const frame = SEA_ROMEO_MENU.at(tick).cells;
    for (let i = SEA_ART_TOP * BRICK_COLS; i < field.length; i++) field[i] = frame[i] ?? 0;
  } else putRows(field, SEA_MENU_ART[key] ?? [], SEA_ART_TOP);
  return field;
}
