/**
 * Описание игры 8 «Тетрис» (`tetris`) по коду `games/tetris.ts`, `games/tetris/*` и документу `docs/brick/tetris.md`: числа берутся из констант игры.
 * Правила донора n0Live/BrickGame (`TetrisGameI…P`, MIT); таблица 51 варианта устройства неизвестна — соответствие номеров вариантов донора устройству допущение.
 * Здесь же — общие части описания, которыми пользуется и Pentix (`guides/pentix.ts`): очки за ряды и кнопки.
 */
import { gt, type GameGuideData, type GuideControl, type GuideScore, type GuideText } from '../guide';
import { TETRIS_VARIANTS } from '../games/tetris';
import { BLAST_SIZE, FIRST_LEVEL_MS, LINE_POINTS, LINE_TIMER_SECONDS, POINTS_PER_SPEED, SPECIAL_CHANCE, TENTH_LEVEL_MS } from '../games/tetris/core';
import { TETRIS_POOL } from '../games/tetris/shapes';
import { MORPH_EXTRA_MS, SUPER_NAMES } from '../games/tetris/variants';
import { BRICK_COLS, BRICK_ROWS, PREVIEW_COLS, PREVIEW_ROWS } from '../types';

/** Очки за `rows` рядов, снятых одной фигурой: 1, 3, 7, 15 для 1–4 рядов (сумма `LINE_POINTS`: 1 + 2 + 4 + 8). */
export const pointsForRows = (rows: number): number => LINE_POINTS.slice(1, rows + 1).reduce((sum, points) => sum + points, 0);

/** Строки очков: ряды одной фигурой (общие у тетриса и Pentix) и то, за что очков нет. */
export const LINE_SCORING: readonly GuideScore[] = [
  { what: gt('Один ряд', 'One row'), points: `+${pointsForRows(1)}` },
  { what: gt('Два ряда одной фигурой', 'Two rows with one piece'), points: `+${pointsForRows(2)}` },
  { what: gt('Три ряда одной фигурой', 'Three rows with one piece'), points: `+${pointsForRows(3)}` },
  { what: gt('Четыре ряда одной фигурой', 'Four rows with one piece'), points: `+${pointsForRows(4)}` },
  { what: gt('Падение, бросок, спецфигуры', 'Falling, drops, special pieces'), points: '0' },
];

/** Кнопки игры; текст кнопки поворота у тетриса и Pentix разный (в Pentix у смены фигуры 26 фигур). */
export function tetrisControls(rotate: GuideText): readonly GuideControl[] {
  return [
    { button: 'left', text: gt('Фигура влево; зажатая — повторяет сдвиг.', 'Move the piece left; holding repeats.') },
    { button: 'right', text: gt('Фигура вправо; зажатая — повторяет сдвиг.', 'Move the piece right; holding repeats.') },
    { button: 'rotate', text: rotate },
    {
      button: 'up',
      text: gt('Поворот, как ROTATE; на перевёрнутом поле «вверх» и «вниз» меняются ролями.', 'Rotate, like ROTATE; on the upside-down board UP and DOWN swap roles.'),
    },
    {
      button: 'down',
      text: gt('Ускоренное падение; бросок до упора — клавиша «огонь» (клавиатура, геймпад).', 'Faster fall; drop to the bottom — the “fire” key (keyboard, gamepad).'),
    },
    { button: 'start', text: gt('Старт и пауза; после конца игры — новая партия.', 'Start and pause; after game over — a new game.') },
  ];
}

/** Схема 1: семь фигур тетриса в начальном положении (угол 0°), по клеткам каталога `FIGURES`. */
export const TETRIS_PIECES_SCHEME: readonly string[] = [
  '......#...',
  '#...#.#...',
  '##.##.#.##',
  '.#.#..#.##',
  '..........',
  '.....#.#..',
  '.#...#.#..',
  '###.##.##.',
];

/** Схема 2: палка падает в колодец и закрывает сразу четыре ряда. */
export const TETRIS_WELL_SCHEME: readonly string[] = [
  '#.........',
  '#.........',
  '#.........',
  '#.........',
  '..........',
  '.#########',
  '.#########',
  '.#########',
  '.#########',
];

/** Схема 3: четыре спецфигуры (мигают `*`) над кучей клеток (`#`): точка, пушка, грязевая пушка, бомба. */
export const SPECIAL_PIECES_SCHEME: readonly string[] = ['....*.*.*.', '..*.*..*..', '*.*.*.*.*.', '..........', '.#...##...', '##.#.####.'];

export const TETRIS_GUIDE: GameGuideData = {
  summary: gt(
    `Классический тетрис на поле ${BRICK_COLS}×${BRICK_ROWS}: ${TETRIS_POOL.length} фигур из четырёх клеток падают сверху, собранный ряд исчезает. Варианты (всего ${TETRIS_VARIANTS.length}) добавляют спецфигуры, особые мигающие фигуры, новые ряды, смену фигуры, сдвиг и переворот поля.`,
    `Classic Tetris on a ${BRICK_COLS}×${BRICK_ROWS} field: ${TETRIS_POOL.length} four-cell pieces fall from the top and a completed row vanishes. ${TETRIS_VARIANTS.length} variants add special pieces, blinking special pieces, new rows, piece swap, board shift and an upside-down board.`,
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
      `Поворот — на 90°; у стенки фигуру сдвигает внутрь поля, а если места нет, она не поворачивается. Фигуры выпадают случайно.`,
      `A turn is 90°; next to a wall the piece is nudged back into the field, and with no room it does not turn. Pieces come up at random.`,
    ),
    gt(
      `Полный ряд из ${BRICK_COLS} клеток исчезает, всё выше опускается на клетку.`,
      `A full row of ${BRICK_COLS} cells vanishes and everything above drops one cell.`,
    ),
    gt(
      'Число на LEVEL — сколько случайных рядов лежит снизу в начале партии; в каждом ряду есть и клетки, и дыры.',
      'The LEVEL number is how many random rows lie at the bottom at the start; every row has both cells and gaps.',
    ),
    gt(
      `Спецфигуры мигают: суперточка падает в нижнюю пустую клетку своего столбца, супербомба после посадки стирает квадрат ${BLAST_SIZE}×${BLAST_SIZE}.`,
      `Special pieces blink: the super point falls into the lowest empty cell of its column, the super bomb wipes a ${BLAST_SIZE}×${BLAST_SIZE} square after landing.`,
    ),
    gt(
      'Пушки стреляют кнопкой ROTATE: суперпушка убирает ближайшую клетку под собой, грязевая пушка достраивает клетку над препятствием.',
      'Guns fire with ROTATE: the super gun removes the nearest cell below it, the mud gun adds a cell on top of the nearest obstacle.',
    ),
    gt(
      `В вариантах с рассыпающимися, кислотными, сквозными и случайными фигурами каждая ${SPECIAL_CHANCE}-я мигает: рассыпается, прожигает клетки или проходит сквозь.`,
      `In the crumbling, acid, pass-through and random variants one piece in ${SPECIAL_CHANCE} blinks: it crumbles, burns cells with acid or passes through.`,
    ),
    gt(
      `Другие варианты: новый ряд раз в ~${LINE_TIMER_SECONDS} с, смена фигуры вместо поворота (падение на ${MORPH_EXTRA_MS} мс медленнее), сдвиг поля, перевёрнутое поле.`,
      `Other variants: a new row every ~${LINE_TIMER_SECONDS} s, piece swap instead of turning (falling ${MORPH_EXTRA_MS} ms slower), board shift, an upside-down board.`,
    ),
  ],
  controls: tetrisControls(
    gt('Поворот на 90°; у пушки — выстрел; при смене фигуры — следующая фигура.', 'Rotate 90°; a gun fires; with piece swap — the next piece.'),
  ),
  scoring: LINE_SCORING,
  facts: [
    { value: String(TETRIS_VARIANTS.length), label: gt('вариантов реализовано', 'variants implemented') },
    { value: String(TETRIS_POOL.length), label: gt('фигур по четыре клетки', 'four-cell pieces') },
    { value: `${FIRST_LEVEL_MS}→${TENTH_LEVEL_MS}`, label: gt('падение на клетку, мс (скорость 1→10)', 'fall per cell, ms (speed 1→10)') },
    { value: String(POINTS_PER_SPEED), label: gt('очков на ступень скорости', 'points per speed step') },
  ],
  progression: gt(
    `Каждые ${POINTS_PER_SPEED} очков скорость +1 (падение ${FIRST_LEVEL_MS}→${TENTH_LEVEL_MS} мс). После десятой — снова первая, уровень +1 и столько новых случайных рядов снизу, какое число теперь на LEVEL.`,
    `Every ${POINTS_PER_SPEED} points the speed goes up one step (fall ${FIRST_LEVEL_MS}→${TENTH_LEVEL_MS} ms). After the tenth it is speed 1 again, the level rises and as many new random rows appear at the bottom as the LEVEL number now shows.`,
  ),
  lives: null,
  schemes: [
    {
      cells: TETRIS_PIECES_SCHEME,
      caption: gt('Семь фигур в начальном положении; ROTATE крутит их на 90°.', 'The seven pieces in their start pose; ROTATE turns them 90°.'),
    },
    {
      cells: TETRIS_WELL_SCHEME,
      caption: gt(`Палка в колодец закрывает четыре ряда сразу: +${pointsForRows(4)}.`, `A line dropped into the well clears four rows at once: +${pointsForRows(4)}.`),
    },
    {
      cells: SPECIAL_PIECES_SCHEME,
      caption: gt(
        `Спецфигуры мигают: ${SUPER_NAMES.ru.join(', ')}.`,
        `Special pieces blink: ${SUPER_NAMES.en.join(', ')}.`,
      ),
    },
  ],
  assumptions: [
    gt(
      'Таблица 51 варианта устройства неизвестна: реализованы 51 вариант донора n0Live/BrickGame, их номера и порядок — наш выбор.',
      'The device’s table of 51 variants is unknown: 51 donor (n0Live/BrickGame) variants are implemented, their numbers and order are our choice.',
    ),
    gt(
      'У «Морского боя» (E) показаны первые 20 из 51 варианта; какие 20 на устройстве, не установлено.',
      'On “Sea Battle” (E) the first 20 of 51 variants are shown; which 20 the device has is not established.',
    ),
    gt(
      'Очки, скорость падения и спецфигуры — правила донора; у Apollo они не проверены.',
      'Scoring, fall speed and special pieces are the donor’s rules; they are not verified on Apollo.',
    ),
    gt(
      '«Вверх» поворачивает (у донора — бросок), бросок вынесен на «огонь»; ряды нового уровня не теряются (у донора теряются).',
      'UP rotates (the donor drops), the drop moved to “fire”; new-level rows are kept (the donor loses them).',
    ),
  ],
};
