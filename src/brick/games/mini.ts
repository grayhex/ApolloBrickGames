/**
 * Игры Mini Brick Game B-S96 («96 IN 1»). Владелец: настоящие только две — 00 и 01 («гонки» в двух вариациях), а 02–96 — вариации тетриса.
 * Правил оригинала нет, поэтому игры — общие ядра проекта: гонки (`RacingGame`, схемы «две полосы» и «три полосы») и тетрис (`TetrisCore`).
 * Какая вариация стоит под каким номером, неизвестно — порядок ниже допущение: 02–46 — типы 1–45 класса I донора (обычные и особые семейства фигур),
 * 47–51 — классы J, K, L, M, N (новые ряды по таймеру, смена фигуры вместо поворота, сдвиг поля и сочетания), 52–96 — перевёрнутое поле (типы 46–90).
 */
import type { BrickGameDef, BrickGameOptions } from '../types';
import { RacingGame } from './racing';
import { RACING_ID, RACING_MODES } from './racing/modes';
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

/** Гонки: вариации 0 и 1 — «две полосы» и «три полосы» (4 схемы дороги донора у «168 в 1 танк» здесь не нужны). */
export const miniRacingDef: BrickGameDef = {
  id: RACING_ID,
  declaredModes: MINI_RACING_COUNT,
  modes: RACING_MODES.slice(0, MINI_RACING_COUNT),
  create: (options) => new RacingGame(options),
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
