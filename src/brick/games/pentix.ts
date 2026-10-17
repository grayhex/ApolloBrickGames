/**
 * Игра 9 «Усложнённый тетрис» (`pentix`) консоли «168 в 1 танк»: тот же тетрис, но фигуры из трёх, четырёх и пяти клеток (26 штук).
 * Донор правил — `PentixGameQ…X` (наследники тетриса, меняют только выбор фигур, смену фигур и скорость), ядро общее с игрой 8
 * (`tetris/core.ts`). Реальные набор и частоты фигур Apollo неизвестны — это допущение; число вариантов устройства у «168 в 1 танк» неизвестно
 * (`declaredModes: null`), у «Тетриса с большими фигурами» «Морского боя» (D) владелец насчитал 20 — столько и реализовано (см. `PENTIX_VARIANTS`).
 */
import type { BrickGameDef, BrickGameOptions } from '../types';
import { TetrisCore } from './tetris/core';
import { describeVariant, variantOf, type TetrisVariant } from './tetris/variants';

/**
 * Варианты по порядку:
 * 01–08 — классы Q–X донора (обычный, новые ряды по таймеру, смена фигуры, оба, сдвиг поля и сочетания с ним);
 * 09–14 — допущение: набор типов класса Q (все спецфигуры; рассыпающиеся, кислотные, сквозные и случайные особые фигуры; перевёрнутое поле);
 * 15–20 — допущение: сочетания классов R…X с типами донора (механика класса плюс особые фигуры или спецфигуры), чтобы вариантов было 20, как насчитал владелец у «Морского боя» (D).
 */
export const PENTIX_VARIANTS: readonly TetrisVariant[] = [
  ...[...'QRSTUVWX'].map((letter) => variantOf(letter, 1)),
  variantOf('Q', 9),
  variantOf('Q', 10),
  variantOf('Q', 19),
  variantOf('Q', 28),
  variantOf('Q', 37),
  variantOf('Q', 46),
  variantOf('R', 10),
  variantOf('S', 19),
  variantOf('T', 28),
  variantOf('U', 37),
  variantOf('V', 9),
  variantOf('X', 54),
];

export class PentixGame extends TetrisCore {
  readonly id = 'pentix';

  constructor(options: BrickGameOptions = {}) {
    super(options, PENTIX_VARIANTS);
    this.init();
  }
}

export const pentixDef: BrickGameDef = {
  id: 'pentix',
  declaredModes: null,
  modes: PENTIX_VARIANTS.map(describeVariant),
  create: (options) => new PentixGame(options),
};
