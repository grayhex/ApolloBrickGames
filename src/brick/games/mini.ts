/**
 * Игры Mini Brick Game B-S96 («96 IN 1»). Владелец: настоящие только две — 00 и 01 («гонки» в двух вариациях), а 02–96 — вариации тетриса.
 * Гонки — отдельная реконструкция по записи владельца и его уточнениям; тетрис — TetrisCore.
 * Какая вариация стоит под каким номером, неизвестно — порядок ниже допущение: 02–46 — типы 1–45 класса I донора (обычные и особые семейства фигур),
 * 47–51 — классы J, K, L, M, N (новые ряды по таймеру, смена фигуры вместо поворота, сдвиг поля и сочетания), 52–96 — перевёрнутое поле (типы 46–90).
 */
import type { BrickGameDef, BrickGameOptions } from '../types';
import { MiniRacingGame } from './miniRacing';

import { TetrisCore } from './tetris/core';
import { describeVariant, variantOf, type TetrisVariant } from './tetris/variants';

/** Номера игр на экране: 00 … 96. */
export const MINI_GAME_COUNT = 97;
/** Гонки занимают первые два номера. */
export const MINI_RACING_COUNT = 2;
/** Вариаций тетриса — 95 (номера 02–96). */
export const MINI_TETRIS_COUNT = MINI_GAME_COUNT - MINI_RACING_COUNT;

export const MINI_TETRIS_VARIANTS: readonly TetrisVariant[] = [
  ...Array.from({ length: 45 }, (_, i) => variantOf('I', i + 1)),
  ...['J', 'K', 'L', 'M', 'N'].map((letter) => variantOf(letter, 1)),
  ...Array.from({ length: 45 }, (_, i) => variantOf('I', i + 46)),
];

export class MiniTetrisGame extends TetrisCore {
  readonly id = 'tetris';

  constructor(options: BrickGameOptions = {}) {
    super(options, MINI_TETRIS_VARIANTS);
    this.init();
  }
}

/** Гонки: одна механика, две формы носа машины по владельцу. */
export const miniRacingDef: BrickGameDef = {
  id: 'racing',
  declaredModes: MINI_RACING_COUNT,
  modes: [{name:{ru:'Крест',en:'Cross'},note:'По видео владельца: различается только форма машины.'},{name:{ru:'Треугольник',en:'Triangle'},note:'По уточнению владельца: треугольный нос вместо креста.'}],
  create: (options) => new MiniRacingGame(options),
};

export const miniTetrisDef: BrickGameDef = {
  id: 'tetris',
  declaredModes: MINI_TETRIS_COUNT,
  modes: MINI_TETRIS_VARIANTS.map(describeVariant),
  create: (options) => new MiniTetrisGame(options),
};

/** Игра и вариация для номера на экране (0–96). */
export function miniEntry(number: number): { def: BrickGameDef; mode: number } {
  return number < MINI_RACING_COUNT ? { def: miniRacingDef, mode: number } : { def: miniTetrisDef, mode: number - MINI_RACING_COUNT };
}
