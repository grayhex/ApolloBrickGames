/**
 * Варианты тетриса и Pentix: набор переключателей правил (`TetrisVariant`) и описания для меню (`BrickModeDef`).
 *
 * У донора вариант определяется двумя числами: КЛАСС-БУКВА (`TetrisGameI…P`, `PentixGameQ…X`) задаёт «механику» — новые ряды по таймеру (J),
 * смену фигуры вместо поворота (K), сдвиг поля после каждой фигуры (M) и их сочетания (L, N, O, P); ТИП 1..90 (`TetrisGameI.setPieceFromType`
 * и конструктор) задаёт набор спецфигур (`тип % 9`), «особое» семейство фигур (рассыпающиеся 10–18, кислотные 19–27, сквозные 28–36,
 * случайные 37–45) и перевёрнутое поле (46–90 — то же, что 1–45). Всё это здесь — флаги, а не отдельные игры.
 *
 * Соответствие номеров вариантов на настоящем устройстве этим флагам неизвестно — это допущение; порядок вариантов в играх выбран нами.
 */
import type { BrickModeDef } from '../../types';
import type { PiecePool } from './shapes';

/** Особое семейство мигающих фигур: рассыпающиеся (`liquid`), кислотные (`acid`), проходящие сквозь препятствия (`through`) или случайное из трёх. */
export type FigureFamily = 'plain' | 'liquid' | 'acid' | 'through' | 'random';

/** Специальные фигуры: 0 — суперточка, 1 — суперпушка, 2 — грязевая пушка, 3 — супербомба (как в `getRandomTetraminoesAndSuper`). */
export const SUPER_NAMES = {
  ru: ['суперточка', 'суперпушка', 'грязевая пушка', 'супербомба'],
  en: ['super point', 'super gun', 'mud gun', 'super bomb'],
} as const;

export interface TetrisVariant {
  /** Набор фигур: тетрамино (тетрис) или 3–5 клеток (Pentix). */
  readonly pool: PiecePool;
  /** Класс донора (`I`…`P` у тетриса, `Q`…`X` у Pentix). */
  readonly letter: string;
  /** Тип донора 1..90 (набор спецфигур, семейство, перевёрнутое поле). */
  readonly type: number;
  /** Класс J: раз в ~30 секунд снизу добавляется случайный ряд. */
  readonly lineTimer: boolean;
  /** Класс K: кнопка поворота меняет фигуру на следующую, а не вращает её. */
  readonly morph: boolean;
  /** Класс M: после каждой фигуры всё поле сдвигается на столбец (по кругу). */
  readonly shift: boolean;
  readonly family: FigureFamily;
  /** Какие спецфигуры входят в набор (номера 0..3). */
  readonly supers: readonly number[];
  /** Поле перевёрнуто: фигуры падают вверх, кнопки «вверх» и «вниз» поменяны местами. */
  readonly inverted: boolean;
}

/** Флаги механики по классам донора: J = таймер, K = смена, M = сдвиг, остальные — сочетания. */
const LETTER_FLAGS: Readonly<Record<string, { lineTimer: boolean; morph: boolean; shift: boolean }>> = {
  I: { lineTimer: false, morph: false, shift: false },
  J: { lineTimer: true, morph: false, shift: false },
  K: { lineTimer: false, morph: true, shift: false },
  L: { lineTimer: true, morph: true, shift: false },
  M: { lineTimer: false, morph: false, shift: true },
  N: { lineTimer: true, morph: false, shift: true },
  O: { lineTimer: false, morph: true, shift: true },
  P: { lineTimer: true, morph: true, shift: true },
};

/** Классы Pentix повторяют классы тетриса по порядку: Q = I, R = J, S = K, T = L, U = M, V = N, W = O, X = P. */
const TETRIS_LETTERS = 'IJKLMNOP';
const PENTIX_LETTERS = 'QRSTUVWX';

/** Набор спецфигур по `тип % 9` (`TetrisGameI.setPieceFromType`). */
const SUPER_SETS: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [0],
  3: [1],
  4: [0, 1],
  5: [2],
  6: [1, 2],
  7: [0, 1, 2],
  8: [3],
  0: [0, 1, 2, 3],
};

const FAMILIES: readonly FigureFamily[] = ['plain', 'liquid', 'acid', 'through', 'random'];

/** Вариант по классу донора и типу 1..90. */
export function variantOf(letter: string, type: number): TetrisVariant {
  const pentix = PENTIX_LETTERS.includes(letter);
  const index = (pentix ? PENTIX_LETTERS : TETRIS_LETTERS).indexOf(letter);
  const flags = LETTER_FLAGS[TETRIS_LETTERS[index] ?? 'I'] ?? LETTER_FLAGS['I'];
  const t = Math.min(90, Math.max(1, Math.trunc(type)));
  return {
    pool: pentix ? 'pentix' : 'tetris',
    letter,
    type: t,
    lineTimer: flags?.lineTimer ?? false,
    morph: flags?.morph ?? false,
    shift: flags?.shift ?? false,
    family: FAMILIES[Math.floor(((t - 1) % 45) / 9)] ?? 'plain',
    supers: SUPER_SETS[t % 9] ?? [],
    inverted: t > 45,
  };
}

/** Надбавка к времени падения в миллисекундах: +50 за смену фигур (K, L, O, P) и ещё +50 у любого Pentix (`getSpeedOfFirstLevel`/`getSpeedOfTenthLevel`). */
export const MORPH_EXTRA_MS = 50;
export const PENTIX_EXTRA_MS = 50;

/** Донорская надбавка к времени падения в миллисекундах (см. `MORPH_EXTRA_MS`, `PENTIX_EXTRA_MS`). */
export function speedPenaltyMs(variant: TetrisVariant): number {
  return (variant.morph ? MORPH_EXTRA_MS : 0) + (variant.pool === 'pentix' ? PENTIX_EXTRA_MS : 0);
}

// ------------------------------------------------------------------ описания для меню

const FAMILY_NAME = {
  liquid: { ru: 'рассыпающиеся фигуры', en: 'crumbling pieces' },
  acid: { ru: 'кислотные фигуры', en: 'acid pieces' },
  through: { ru: 'фигуры сквозь препятствия', en: 'pieces passing through' },
  random: { ru: 'случайные особые фигуры', en: 'random special pieces' },
} as const;

const FAMILY_NOTE: Readonly<Record<Exclude<FigureFamily, 'plain'>, string>> = {
  liquid:
    'Примерно каждая седьмая фигура мигает и «рассыпается»: после посадки её клетки по одной стекают вниз по своим столбцам (flowDown).',
  acid:
    'Примерно каждая седьмая фигура мигает и «кислотная»: каждая её клетка прожигает клетку под собой и исчезает вместе с ней (flowDown, isAcid).',
  through:
    'Примерно каждая седьмая фигура мигает и проходит сквозь заполненные клетки, пока под ней есть пустота (specialCheckCollision).',
  random:
    'Примерно каждая седьмая фигура мигает, и каждая такая фигура случайно оказывается рассыпающейся, кислотной или сквозной.',
};

const SUPER_NOTE: readonly string[] = [
  'суперточка (одна клетка падает в самую нижнюю пустую клетку столбца, кнопка поворота не действует)',
  'суперпушка (кнопка поворота стреляет: убирает ближайшую клетку под пушкой)',
  'грязевая пушка (кнопка поворота стреляет: достраивает клетку над ближайшим препятствием)',
  'супербомба (после посадки взрывает область 5 × 5)',
];

const capitalize = (text: string): string => (text.length > 0 ? (text[0] ?? '').toUpperCase() + text.slice(1) : text);

/** Название и пометка варианта для меню и справки. */
export function describeVariant(variant: TetrisVariant): BrickModeDef {
  const ru: string[] = [];
  const en: string[] = [];
  const add = (r: string, e: string): void => {
    ru.push(r);
    en.push(e);
  };
  if (variant.lineTimer) add('новые ряды', 'new rows');
  if (variant.morph) add('смена фигуры', 'piece swap');
  if (variant.shift) add('сдвиг поля', 'board shift');
  if (variant.family !== 'plain') add(FAMILY_NAME[variant.family].ru, FAMILY_NAME[variant.family].en);
  if (variant.supers.length === 4) add('все спецфигуры', 'all special pieces');
  else if (variant.supers.length > 0) {
    add(
      variant.supers.map((i) => SUPER_NAMES.ru[i]).join(' + '),
      variant.supers.map((i) => SUPER_NAMES.en[i]).join(' + '),
    );
  }
  if (variant.inverted) add('перевёрнутое поле', 'upside-down board');
  const name = {
    ru: ru.length > 0 ? capitalize(ru.join(', ')) : 'Обычный',
    en: en.length > 0 ? capitalize(en.join(', ')) : 'Regular',
  };

  const className = variant.pool === 'pentix' ? `PentixGame${variant.letter}` : `TetrisGame${variant.letter}`;
  const parts: string[] = [`Донор: ${className}, тип ${variant.type}.`];
  if (variant.pool === 'pentix') parts.push('Фигуры из 3, 4 и 5 клеток (26 штук).');
  else parts.push('Семь тетрамино.');
  if (variant.lineTimer) parts.push('Примерно раз в 30 секунд снизу добавляется случайный ряд (ждёт, пока фигура опустится достаточно низко).');
  if (variant.morph) parts.push('Кнопка поворота не вращает, а меняет фигуру на следующую из каталога (rotateFigure).');
  if (variant.shift) parts.push('После каждой фигуры всё поле сдвигается на столбец вправо по кругу (boardHorizontalShift).');
  if (variant.family !== 'plain') parts.push(FAMILY_NOTE[variant.family]);
  if (variant.supers.length > 0) parts.push(`Спецфигуры: ${variant.supers.map((i) => SUPER_NOTE[i]).join('; ')}.`);
  if (variant.inverted) parts.push('Поле перевёрнуто: фигуры падают вверх, кнопки «вверх» и «вниз» поменяны местами.');
  parts.push('Соответствие номеру варианта на устройстве — допущение.');
  return { name, note: parts.join(' ') };
}
