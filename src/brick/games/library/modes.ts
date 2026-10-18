/**
 * Варианты библиотечных игр, для которых вики retroconsoles (Brick Game → раздел Modes) перечисляет номера вариантов: Dancing Game (2), Obstacles Race (2),
 * Quarth (2), Snake (2), Pneumatic Ball (8), Pong (16), Little Honeybee (8). Сводная таблица «вики → у нас» — `docs/brick/modes-reference.md`.
 *
 * Что здесь установлено, а что нет. Вики описывает ДРУГУЮ прошивку, а не Apollo: номера и числа вариантов Apollo не установлены. Из вики взяты только перечень и порядок
 * вариантов (строки `*_WIKI` ниже, дословно); значение каждого признака — наша реализация, то есть допущение (она описана в `modes[].note` и в документе игры).
 * Нумерация на устройстве у проекта задаётся порядком `modes`: вариант 01 (индекс 0) — прежняя игра без изменений (рекорды категорий считаются по индексу варианта),
 * новые варианты только добавлены после него в порядке вики. Для Quarth перечень (default, invert) — со слов владельца: в сохранённом тексте раздела Modes строки Quarth нет.
 *
 * Признаки вариантов читают игры (`traits…` ниже) и тексты вариантов (`describe…`) из одного места, чтобы название и поведение не расходились.
 */
import type { BrickModeDef } from '../../types';
import type { LibraryId } from '../../../games/library';

/** Сколько вариантов у игр библиотеки по вики (`declaredModes`): это число семейства устройств вики, а не Apollo. */
export const WIKI_MODE_COUNT: Readonly<Partial<Record<LibraryId, number>>> = {
  dance: 2,
  'obstacle-race': 2,
  quarth: 2,
  snake: 2,
  'pneumatic-ball': 8,
  pong: 16,
  honeybee: 8,
};

const SOURCE = 'вики retroconsoles (Brick Game → Modes; другая прошивка, не Apollo)';
const wiki = (game: string, line: string): string => `Источник: ${SOURCE}, ${game}, «${line}».`;

/** Платформа вики «Three / Two / One paddle size»: размеры 3, 2 и 1 клетка; индекс 0 — «Default» (у нас это прежние 3 клетки). */
export const PADDLE_CELLS: readonly number[] = [3, 3, 2, 1];
/** Кирпичи «Brick move» сдвигаются на клетку раз в столько тактов (как стена арканоида: 400 мс); у края направление меняется. */
export const BRICK_MOVE_TICKS = 24;

// ---------------------------------------------------------------- Dancing Game, Obstacles Race, Quarth: default / invert upside-down

const FLIP_NOTE = 'Допущение: поле отражено по вертикали, кнопки ↑ и ↓ меняются местами, ← и → остаются.';

export const DANCE_MODES: readonly BrickModeDef[] = [
  { name: { ru: 'Обычные танцы', en: 'Default' }, note: `Прежняя игра без изменений. ${wiki('Dancing Game', 'Mode 1: Default')}` },
  {
    name: { ru: 'Вверх дном', en: 'Upside down' },
    note: `${wiki('Dancing Game', 'Mode 2: Invert upside-down')} ${FLIP_NOTE} Площадки вверху, ноты идут снизу вверх; колонки дорожек прежние.`,
  },
];

export const OBSTACLE_RACE_MODES: readonly BrickModeDef[] = [
  { name: { ru: 'Обычная трасса', en: 'Default' }, note: `Прежняя игра без изменений. ${wiki('Obstacles Race', 'Mode 1: Default')}` },
  {
    name: { ru: 'Вверх дном', en: 'Upside down' },
    note: `${wiki('Obstacles Race', 'Mode 2: Invert upside-down')} ${FLIP_NOTE} Машина вверху, трасса идёт к ней снизу; ускоряет ↓, а не ↑.`,
  },
];

export const QUARTH_MODES: readonly BrickModeDef[] = [
  { name: { ru: 'Обычный', en: 'Default' }, note: 'Прежняя игра без изменений. Перечень режимов Quarth (default, invert) — со слов владельца; в сохранённом тексте раздела Modes строки Quarth нет, не проверено.' },
  {
    name: { ru: 'Вверх дном', en: 'Upside down' },
    note: `Режим invert — со слов владельца (в сохранённом тексте раздела Modes Quarth нет, не проверено). ${FLIP_NOTE} Пушка вверху стреляет вниз, силуэт поднимается снизу.`,
  },
];

// ---------------------------------------------------------------- Snake: default / Frame

export const SNAKE_MODES: readonly BrickModeDef[] = [
  { name: { ru: 'Обычная змейка', en: 'Default' }, note: `Допущение: победа и усложнение; E88 5 / E-23 93: старт снизу, разворот тела и десять скоростей по ROM. Прогрессия и ГСЧ частично адаптированы. ${wiki('Snake', 'Mode 1: Default')}` },
  {
    name: { ru: 'Рамка', en: 'Frame' },
    note:
      `${wiki('Snake', 'Mode 2: Frame')} Значение слова «Frame» вики не раскрывает. Допущение: по периметру горит рамка в одну клетку (колонки 0 и 9, строки 0 и 19), ` +
      'игровая область 8 × 18; касание рамки — потеря жизни, как любой стены. В режиме 01 края поля тоже смертельны, но не нарисованы.',
  },
];

// ---------------------------------------------------------------- Pneumatic Ball и Pong: размер платформы × invert × brick move

/** Признаки варианта игр с ракеткой: ширина ракетки игрока и вратаря (верхней ракетки), перевёрнутое поле, движение кирпичей. */
export interface BallTraits {
  readonly paddle: number;
  readonly guard: number;
  readonly invert: boolean;
  readonly move: boolean;
}

const BALL_DEFAULT: BallTraits = { paddle: 3, guard: 3, invert: false, move: false };

/**
 * Номер варианта Pong с нуля: младшие два бита — размер платформы (0 — Default, 1 — Three, 2 — Two, 3 — One; он же у верхней ракетки, «both»), бит 2 — invert,
 * бит 3 — Brick move: ровно порядок вики (1–4 размеры, 5–8 с invert, 9–12 с Brick move, 13–16 оба).
 */
export function pongTraits(mode: number): BallTraits {
  const size = mode & 3;
  const cells = PADDLE_CELLS[size] ?? 3;
  return { paddle: cells, guard: size > 0 ? cells : 3, invert: (mode & 4) !== 0, move: (mode & 8) !== 0 };
}

/** Pneumatic Ball: размер платформы игрока (0 — Default, 1 — Three, 2 — Two, 3 — One) и бит 2 — invert; вратарь всегда три клетки. */
export function pneumaticTraits(mode: number): BallTraits {
  return { paddle: PADDLE_CELLS[mode & 3] ?? 3, guard: 3, invert: (mode & 4) !== 0, move: false };
}

export function ballTraits(id: 'pong' | 'pong-double' | 'pneumatic-ball' | 'arkanoid-dots', mode: number): BallTraits {
  return id === 'pong' ? pongTraits(mode) : id === 'pneumatic-ball' ? pneumaticTraits(mode) : BALL_DEFAULT;
}

const PONG_WIKI = [
  'Mode 1: Default',
  'Mode 2: Three paddle size with both',
  'Mode 3: Two paddle size with both',
  'Mode 4: One paddle size with both',
  'Mode 5: Invert upside-down with brick',
  'Mode 6: Three paddle size with Invert upside-down, brick and both',
  'Mode 7: Two paddle size with Invert upside-down, brick and both',
  'Mode 8: One paddle size with Invert upside-down, brick and both',
  'Mode 9: Default with Brick move',
  'Mode 10: Three paddle size with Brick move and both',
  'Mode 11: Two paddle size with Brick move and both',
  'Mode 12: One paddle size with Brick move and both',
  'Mode 13: Invert upside-down with Brick move',
  'Mode 14: Invert upside-down with Three paddle size, Brick move and both',
  'Mode 15: Invert upside-down with Two paddle size, Brick move and both',
  'Mode 16: Invert upside-down with One paddle size, Brick move and both',
] as const;

const PNEUMATIC_WIKI = [
  'Mode 1: Default',
  'Mode 2: Three paddle size',
  'Mode 3: Two paddle size',
  'Mode 4: One paddle size',
  'Mode 5: Invert upside-down',
  'Mode 6: Three paddle size with Invert upside-down',
  'Mode 7: Two paddle size with Invert upside-down',
  'Mode 8: One paddle size with Invert upside-down',
] as const;

const SIZE_NAME_RU = ['', 'платформа 3', 'платформа 2', 'платформа 1'] as const;
const SIZE_NAME_EN = ['', 'paddle 3', 'paddle 2', 'paddle 1'] as const;
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const join = (parts: readonly string[], fallback: string): string => (parts.length ? capital(parts.join(', ')) : fallback);

const PADDLE_NOTE =
  'Допущение: размер платформы по умолчанию вики не называет; у нас прежние 3 клетки. Ракетка из двух клеток отбивает каждой клеткой в свою сторону, из одной — как центр трёхклеточной.';
const TWIN_NOTE = 'Поэтому режим «Three paddle size» по правилам совпадает с режимом без размера (строка оставлена ради номеров вики).';

function describePong(mode: number): BrickModeDef {
  const t = pongTraits(mode);
  const size = mode & 3;
  const ru = [SIZE_NAME_RU[size] ?? '', ...(size ? ['обе ракетки'] : []), ...(t.invert ? ['вверх дном'] : []), ...(t.move ? ['кирпичи едут'] : [])].filter(Boolean);
  const en = [SIZE_NAME_EN[size] ?? '', ...(size ? ['both paddles'] : []), ...(t.invert ? ['upside down'] : []), ...(t.move ? ['moving bricks'] : [])].filter(Boolean);
  const parts = [
    wiki('Pong', PONG_WIKI[mode] ?? ''),
    `Допущение: «both» — размер платформы действует и на нижнюю ракетку, и на верхнюю (вратаря); «Brick move» — стенка из кирпичей в центре едет на клетку вбок каждые ${BRICK_MOVE_TICKS} такта и отражается от краёв поля;`,
    `${t.invert ? 'invert — поле вверх дном, ↑ и ↓ меняются местами (в игре они не нужны); ' : ''}правила, очки и скорость как у режима 01.`,
    ...(size > 0 ? [PADDLE_NOTE] : []),
    ...(size === 1 ? [TWIN_NOTE] : []),
  ];
  return { name: { ru: join(ru, 'Обычный теннис'), en: join(en, 'Default') }, note: mode === 0 ? `Прежняя игра без изменений. ${wiki('Pong', PONG_WIKI[0] ?? '')}` : parts.join(' ') };
}

function describePneumatic(mode: number): BrickModeDef {
  const t = pneumaticTraits(mode);
  const size = mode & 3;
  const ru = [SIZE_NAME_RU[size] ?? '', ...(t.invert ? ['вверх дном'] : [])].filter(Boolean);
  const en = [SIZE_NAME_EN[size] ?? '', ...(t.invert ? ['upside down'] : [])].filter(Boolean);
  const parts = [
    wiki('Pneumatic Ball', PNEUMATIC_WIKI[mode] ?? ''),
    'Допущение: размер платформы — ширина нижней платформы игрока (вратарь остаётся из трёх клеток);',
    `${t.invert ? 'invert — поле вверх дном, платформа вверху, ↑ и ↓ меняются местами (в игре они не нужны); ' : ''}правила, очки и подача как у режима 01.`,
    ...(size > 0 ? [PADDLE_NOTE] : []),
    ...(size === 1 ? [TWIN_NOTE] : []),
  ];
  return { name: { ru: join(ru, 'Обычный мяч'), en: join(en, 'Default') }, note: mode === 0 ? `Прежняя игра без изменений. ${wiki('Pneumatic Ball', PNEUMATIC_WIKI[0] ?? '')}` : parts.join(' ') };
}

export const PONG_MODES: readonly BrickModeDef[] = Array.from({ length: 16 }, (_, mode) => describePong(mode));
export const PNEUMATIC_MODES: readonly BrickModeDef[] = Array.from({ length: 8 }, (_, mode) => describePneumatic(mode));

// ---------------------------------------------------------------- Little Honeybee: Brick move diagonally × invert × two shooters

/** Признаки варианта «Пчёлки»: бит 0 — кирпичи едут по диагонали, бит 1 — invert, бит 2 — два ствола: порядок вики (1–4 с одним стволом, 5–8 с двумя). */
export interface ShooterTraits {
  readonly diagonal: boolean;
  readonly invert: boolean;
  readonly twin: boolean;
}

export function honeybeeTraits(mode: number): ShooterTraits {
  return { diagonal: (mode & 1) !== 0, invert: (mode & 2) !== 0, twin: (mode & 4) !== 0 };
}

const HONEYBEE_WIKI = [
  'Mode 1: Default',
  'Mode 2: Brick move diagonally',
  'Mode 3: Invert upside-down',
  'Mode 4: Invert upside-down with Brick move diagonally',
  'Mode 5: Default have two shooters',
  'Mode 6: Have two shooters with Brick move diagonally',
  'Mode 7: Invert upside-down with have two shooters',
  'Mode 8: Have two shooters with Invert upside-down and Brick move diagonally',
] as const;

function describeHoneybee(mode: number): BrickModeDef {
  const t = honeybeeTraits(mode);
  const ru = [...(t.twin ? ['два ствола'] : []), ...(t.invert ? ['вверх дном'] : []), ...(t.diagonal ? ['фигура идёт по диагонали'] : [])];
  const en = [...(t.twin ? ['two shooters'] : []), ...(t.invert ? ['upside down'] : []), ...(t.diagonal ? ['diagonal movement'] : [])];
  const parts = [
    wiki('Little Honeybee', HONEYBEE_WIKI[mode] ?? ''),
    'Допущение: «Brick move diagonally» — фигура каждые 90…30 тактов (по скорости) сдвигается на клетку вбок и на ряд вниз, у боковой стены меняя сторону; достигла пушки — потеря жизни;',
    'два ствола — выстрелы из колонок x − 1 и x + 1 (колонки за краем поля пропускаются);',
    `${t.invert ? 'invert — поле вверх дном, ↑ и ↓ меняются местами (в игре они не нужны); ' : ''}остальное — прежняя фигура с ответным огнём: +5 за клетку, +100 за очищенную фигуру.`,
  ];
  return { name: { ru: mode===0?'Жуки · B0202 D01':join(ru, 'Обычная пчёлка'), en: mode===0?'Beetle · B0202 D01':join(en, 'Default') }, note: mode === 0 ? `Основной вариант заменён по выбору владельца: B0202 D01 Beetle. ГСЧ и сцены — допущение. Прежний источник (не Apollo): ${wiki('Little Honeybee', HONEYBEE_WIKI[0] ?? '')}` : parts.join(' ') };
}

export const HONEYBEE_MODES: readonly BrickModeDef[] = Array.from({ length: 8 }, (_, mode) => describeHoneybee(mode));

/** Варианты библиотечных игр, у которых их больше одного; остальные игры библиотеки по-прежнему с единственным вариантом. */
export const LIBRARY_MODES: Readonly<Partial<Record<LibraryId, readonly BrickModeDef[]>>> = {
  dance: DANCE_MODES,
  'obstacle-race': OBSTACLE_RACE_MODES,
  quarth: QUARTH_MODES,
  snake: SNAKE_MODES,
  'pneumatic-ball': PNEUMATIC_MODES,
  pong: PONG_MODES,
  honeybee: HONEYBEE_MODES,
};
