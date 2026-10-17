/**
 * Описание игры 9 «Тетрис Pentix» / «Тетрис с большими фигурами» (`pentix`; у «168 в 1 танк» — игра 9, у «Морского боя» — D, один модуль на обе консоли)
 * по коду `games/pentix.ts`, `games/tetris/*` и документу `docs/brick/tetris.md`: числа берутся из констант игры.
 * Правила донора n0Live/BrickGame (`PentixGameQ…X`, MIT); набор и частоты фигур Apollo не установлены — допущение. Очки за ряды и кнопки общие с тетрисом (`guides/tetris.ts`).
 */
import { PENTIX_VARIANTS } from '../games/pentix';
import { BLAST_SIZE, FIRST_LEVEL_MS, LINE_TIMER_SECONDS, POINTS_PER_SPEED, SPECIAL_CHANCE, TENTH_LEVEL_MS } from '../games/tetris/core';
import { PENTIX_POOL, makePiece } from '../games/tetris/shapes';
import { MORPH_EXTRA_MS, PENTIX_EXTRA_MS } from '../games/tetris/variants';
import { gt, type GameGuideData } from '../guide';
import { BRICK_COLS, BRICK_ROWS, PREVIEW_COLS, PREVIEW_ROWS } from '../types';
import { LINE_SCORING, pointsForRows, tetrisControls } from './tetris';

/** Сколько в наборе фигур с данным числом клеток (три, четыре, пять): 2, 7 и 17. */
const piecesWithCells = (cells: number): number => PENTIX_POOL.filter((shape) => makePiece(shape).cells.length === cells).length;

/** Первые варианты по порядку — классы Q–X донора (`PENTIX_VARIANTS[0..7]`), остальные составлены нами. */
const DONOR_CLASSES = 'QRSTUVWX'.length;

/** Время падения на клетку у Pentix, мс: надбавка к тетрису одна и та же на всех скоростях. */
const FALL_FIRST_MS = FIRST_LEVEL_MS + PENTIX_EXTRA_MS;
const FALL_TENTH_MS = TENTH_LEVEL_MS + PENTIX_EXTRA_MS;

/** Схема 1: часть фигур набора в начальном положении (угол 0°): три клетки — диагональ и уголок, пять клеток — P, X, W, Q, по клеткам каталога `FIGURES`. */
export const PENTIX_PIECES_SCHEME: readonly string[] = [
  '..#....##.',
  '.#..#..##.',
  '#...##.#..',
  '..........',
  '........##',
  '.#..#....#',
  '###.##...#',
  '.#...##..#',
];

/** Схема 2: крест из пяти клеток ложится в углубление и закрывает сразу два ряда. */
export const PENTIX_CROSS_SCHEME: readonly string[] = [
  '....#.....',
  '...###....',
  '....#.....',
  '..........',
  '..........',
  '###...####',
  '####.#####',
];

export const PENTIX_GUIDE: GameGuideData = {
  summary: gt(
    `Тетрис с большими фигурами: ${PENTIX_POOL.length} фигур из трёх, четырёх и пяти клеток падают в стакан ${BRICK_COLS}×${BRICK_ROWS}. Ряды и очки как в тетрисе, падение медленнее на ${PENTIX_EXTRA_MS} мс. Вариантов — ${PENTIX_VARIANTS.length}, механики те же.`,
    `Tetris with big pieces: ${PENTIX_POOL.length} pieces of three, four and five cells fall into a ${BRICK_COLS}×${BRICK_ROWS} well. Rows and scoring as in Tetris, falling ${PENTIX_EXTRA_MS} ms slower. ${PENTIX_VARIANTS.length} variants with the same mechanics.`,
  ),
  goal: gt(
    'Собирать ряды без пробелов и не дать стакану заполниться: игра кончается, когда новая фигура не помещается.',
    'Complete gap-free rows and keep the stack from filling up: the game ends when a new piece no longer fits.',
  ),
  rules: [
    gt(
      `Фигура появляется по центру сверху и опускается на клетку за шаг; следующая видна в окошке NEXT ${PREVIEW_COLS}×${PREVIEW_ROWS}.`,
      `A piece appears at the top centre and drops one cell per step; the next one is shown in the ${PREVIEW_COLS}×${PREVIEW_ROWS} NEXT window.`,
    ),
    gt(
      `${PENTIX_POOL.length} фигур: ${piecesWithCells(3)} из трёх клеток (есть диагональная линия), ${piecesWithCells(4)} из четырёх, ${piecesWithCells(5)} из пяти; выпадают случайно.`,
      `${PENTIX_POOL.length} pieces: ${piecesWithCells(3)} of three cells (one is a diagonal line), ${piecesWithCells(4)} of four, ${piecesWithCells(5)} of five; they come up at random.`,
    ),
    gt(
      'Поворот — на 90°; квадрат и крест из пяти клеток при повороте не меняются; у стенки фигуру сдвигает внутрь поля.',
      'A turn is 90°; the square and the five-cell cross do not change when turned; next to a wall the piece is nudged back into the field.',
    ),
    gt(
      `Полный ряд из ${BRICK_COLS} клеток исчезает, всё выше опускается; очки только за ряды, как в тетрисе.`,
      `A full row of ${BRICK_COLS} cells vanishes and everything above drops; points only for rows, as in Tetris.`,
    ),
    gt(
      'Число на LEVEL — сколько случайных рядов лежит снизу в начале партии; в каждом ряду есть и клетки, и дыры.',
      'The LEVEL number is how many random rows lie at the bottom at the start; every row has both cells and gaps.',
    ),
    gt(
      `Спецфигуры (точка, пушки, бомба ${BLAST_SIZE}×${BLAST_SIZE}) и мигающие рассыпающиеся, кислотные и сквозные фигуры (1 из ${SPECIAL_CHANCE}) — как в тетрисе.`,
      `Special pieces (point, guns, ${BLAST_SIZE}×${BLAST_SIZE} bomb) and blinking crumbling, acid and pass-through pieces (1 in ${SPECIAL_CHANCE}) work as in Tetris.`,
    ),
    gt(
      `В вариантах со сменой фигуры ROTATE листает все ${PENTIX_POOL.length} фигур по кругу, а падение ещё на ${MORPH_EXTRA_MS} мс медленнее.`,
      `In variants with piece swap ROTATE cycles through all ${PENTIX_POOL.length} pieces, and falling is another ${MORPH_EXTRA_MS} ms slower.`,
    ),
    gt(
      `Другие варианты: новый ряд раз в ~${LINE_TIMER_SECONDS} с, сдвиг поля на столбец после каждой фигуры, перевёрнутое поле.`,
      `Other variants: a new row every ~${LINE_TIMER_SECONDS} s, a board shift by one column after every piece, an upside-down board.`,
    ),
  ],
  controls: tetrisControls(
    gt(`Поворот на 90°; у пушки — выстрел; при смене фигуры — следующая из ${PENTIX_POOL.length}.`, `Rotate 90°; a gun fires; with piece swap — the next of ${PENTIX_POOL.length}.`),
  ),
  scoring: LINE_SCORING,
  facts: [
    { value: String(PENTIX_VARIANTS.length), label: gt('вариантов реализовано', 'variants implemented') },
    { value: String(PENTIX_POOL.length), label: gt('фигур по 3–5 клеток', 'pieces of 3–5 cells') },
    { value: `${FALL_FIRST_MS}→${FALL_TENTH_MS}`, label: gt('падение на клетку, мс (скорость 1→10)', 'fall per cell, ms (speed 1→10)') },
    { value: String(POINTS_PER_SPEED), label: gt('очков на ступень скорости', 'points per speed step') },
  ],
  progression: gt(
    `Каждые ${POINTS_PER_SPEED} очков скорость +1 (падение ${FALL_FIRST_MS}→${FALL_TENTH_MS} мс). После десятой — снова первая, уровень +1 и столько новых случайных рядов снизу, какое число теперь на LEVEL.`,
    `Every ${POINTS_PER_SPEED} points the speed goes up one step (fall ${FALL_FIRST_MS}→${FALL_TENTH_MS} ms). After the tenth it is speed 1 again, the level rises and as many new random rows appear at the bottom as the LEVEL number now shows.`,
  ),
  lives: null,
  schemes: [
    {
      cells: PENTIX_PIECES_SCHEME,
      caption: gt(`Примеры: фигуры из трёх и пяти клеток (всего ${PENTIX_POOL.length}).`, `Examples: pieces of three and five cells (${PENTIX_POOL.length} in all).`),
    },
    {
      cells: PENTIX_CROSS_SCHEME,
      caption: gt(`Крест из пяти клеток закрывает сразу два ряда: +${pointsForRows(2)}.`, `A five-cell cross clears two rows at once: +${pointsForRows(2)}.`),
    },
  ],
  assumptions: [
    gt(
      `Набор и частоты фигур Pentix у Apollo не установлены: взяты ${PENTIX_POOL.length} фигур донора, все равновероятны.`,
      `Apollo’s Pentix piece set and frequencies are not established: the donor’s ${PENTIX_POOL.length} pieces are used, all equally likely.`,
    ),
    gt(
      `Состав вариантов не установлен: ${PENTIX_VARIANTS.length} насчитал владелец у «Морского боя» (D); ${DONOR_CLASSES} — классы донора Q–X, остальные ${PENTIX_VARIANTS.length - DONOR_CLASSES} — наш подбор.`,
      `The variant list is not established: the owner counted ${PENTIX_VARIANTS.length} on “Sea Battle” (D); ${DONOR_CLASSES} are donor classes Q–X, the other ${PENTIX_VARIANTS.length - DONOR_CLASSES} are our own pick.`,
    ),
    gt(
      'Одна игра у «168 в 1 танк» (9) и «Морского боя» (D): совпадают ли их правила на устройствах, не установлено.',
      'One game on “168 in 1 Tank” (9) and “Sea Battle” (D): whether their rules match on the devices is not established.',
    ),
    gt(
      'Очки, скорость падения и спецфигуры — правила донора; у Apollo они не проверены.',
      'Scoring, fall speed and special pieces are the donor’s rules; they are not verified on Apollo.',
    ),
    gt(
      '«Вверх» поворачивает (у донора — бросок); на Apollo мгновенного броска нет; ряды нового уровня не теряются (у донора теряются).',
      'UP rotates (the donor drops); Apollo has no hard drop; new-level rows are kept (the donor loses them).',
    ),
  ],
};
