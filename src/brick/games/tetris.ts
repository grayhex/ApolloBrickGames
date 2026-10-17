/**
 * Игра 8 «Тетрис» (`tetris`) консоли «168 в 1 танк»: падающие фигуры из четырёх клеток, ряды, спецфигуры и особые режимы.
 * Ядро (падение, повороты, ряды, очки) — в `tetris/core.ts`, каталог фигур — `tetris/shapes.ts`, варианты — `tetris/variants.ts`.
 *
 * Владелец насчитал на устройстве 51 вариант (`declaredModes`); их таблица неизвестна, поэтому реализованы 51 вариант донора
 * `TetrisGameI…P` (см. `TETRIS_VARIANTS`), а соответствие номеров устройства им — допущение. Вариант 01 — обычный тетрис.
 * Донор правил — `TetrisGameI` и семейство (Java, MIT); всё, чего у донора нет, помечено словом «допущение».
 */
import type { BrickGameDef, BrickGameOptions } from '../types';
import { TetrisCore } from './tetris/core';
import { describeVariant, variantOf, type TetrisVariant } from './tetris/variants';

/**
 * Варианты по порядку:
 * 01–45 — типы 1–45 класса I донора: пять семейств (обычные, рассыпающиеся, кислотные, сквозные, случайные особые) по девять наборов
 * спецфигур каждое; 46–49 — классы J, K, L, M (новые ряды по таймеру, смена фигуры вместо поворота, оба, сдвиг поля);
 * 50–51 — перевёрнутое поле: без спецфигур (тип 46) и со всеми четырьмя (тип 54).
 */
export const TETRIS_VARIANTS: readonly TetrisVariant[] = [
  ...Array.from({ length: 45 }, (_, i) => variantOf('I', i + 1)),
  variantOf('J', 1),
  variantOf('K', 1),
  variantOf('L', 1),
  variantOf('M', 1),
  variantOf('I', 46),
  variantOf('I', 54),
];

export class TetrisGame extends TetrisCore {
  readonly id = 'tetris';

  constructor(options: BrickGameOptions = {}) {
    super(options, TETRIS_VARIANTS);
    this.init();
  }
}

export { TetrisCore };

export const tetrisDef: BrickGameDef = {
  id: 'tetris',
  usesFire: true, // жёсткое падение
  declaredModes: 51,
  modes: TETRIS_VARIANTS.map(describeVariant),
  create: (options) => new TetrisGame(options),
};
