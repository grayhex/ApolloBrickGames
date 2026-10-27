/**
 * Описание игр FM-38 («2 IN 1») для левой панели: тетрис A (обычные фигуры) и тетрис B (большие фигуры из 3–5 клеток). Числа берутся из констант игр
 * (`games/tetris`, `games/pentix`, `brick/fmConsole.ts`); общие части — очки, кнопки, схемы — те же, что у тетриса и Pentix других устройств.
 * Только правила геймплея: что в этой реконструкции приближено (набор фигур B, темп, демонстрация), вынесено в допущения.
 */
import { gt, type GameGuideData, type GuideText } from '../guide';
import { FIRST_LEVEL_MS, POINTS_PER_SPEED, TENTH_LEVEL_MS } from '../games/tetris/core';
import { PENTIX_POOL, TETRIS_POOL, makePiece } from '../games/tetris/shapes';
import { PENTIX_EXTRA_MS } from '../games/tetris/variants';
import { BRICK_COLS, BRICK_ROWS, PREVIEW_COLS, PREVIEW_ROWS } from '../types';
import { PENTIX_PIECES_SCHEME } from './pentix';
import { LINE_SCORING, TETRIS_PIECES_SCHEME, TETRIS_WELL_SCHEME } from './tetris';

export type Fm38GameId = 'a' | 'b';
export const FM38_GAME_IDS: readonly Fm38GameId[] = ['a', 'b'];

const piecesWithCells = (cells: number): number => PENTIX_POOL.filter((shape) => makePiece(shape).cells.length === cells).length;
const FALL_B_FIRST = FIRST_LEVEL_MS + PENTIX_EXTRA_MS;
const FALL_B_TENTH = TENTH_LEVEL_MS + PENTIX_EXTRA_MS;

/** Кнопки FM-38 в игре: фигура влево и вправо, поворот, ускорение, старт и пауза (UP и FIRE на корпусе нет). */
const controls = (rotate: GuideText): GameGuideData['controls'] => [
  { button: 'sides', text: gt('Фигура влево и вправо; зажатая кнопка повторяет сдвиг.', 'Move the piece left and right; holding repeats.') },
  { button: 'rotate', text: rotate },
  { button: 'down', text: gt('Ускоренное падение.', 'Faster fall.'), hold: true },
  { button: 'start', text: gt('Старт и пауза; после конца игры — новая партия. ON/OFF выключает игрушку.', 'Start and pause; after game over — a new game. ON/OFF switches the toy off.') },
];

const sharedRules: readonly GuideText[] = [
  gt(
    `Фигура появляется по центру сверху и опускается на клетку за шаг; следующая видна в окошке NEXT ${PREVIEW_COLS}×${PREVIEW_ROWS}.`,
    `A piece appears at the top centre and drops one cell per step; the next one is shown in the ${PREVIEW_COLS}×${PREVIEW_ROWS} NEXT window.`,
  ),
  gt(
    'Поворот — на 90°; у стенки фигуру сдвигает внутрь поля, а если места нет, она не поворачивается.',
    'A turn is 90°; next to a wall the piece is nudged back into the field, and with no room it does not turn.',
  ),
  gt(
    `Полный ряд из ${BRICK_COLS} клеток исчезает, всё выше опускается на клетку.`,
    `A full row of ${BRICK_COLS} cells vanishes and everything above drops one cell.`,
  ),
  gt(
    'Число на LEVEL (0–12) — сколько случайных рядов лежит снизу в начале партии; в каждом ряду есть и клетки, и дыры.',
    'The LEVEL number (0–12) is how many random rows lie at the bottom at the start; every row has both cells and gaps.',
  ),
  gt(
    `Число на SPEED (0–9) — стартовая скорость; в партии каждые ${POINTS_PER_SPEED} очков она растёт на ступень.`,
    `The SPEED number (0–9) is the starting speed; during the game it goes up one step every ${POINTS_PER_SPEED} points.`,
  ),
  gt(
    'После включения идёт демонстрация: на экране сама играет партия; DOWN выбирает A или B, LEFT — уровень, RIGHT — скорость.',
    'After power-on a demo game plays itself; DOWN selects A or B, LEFT the level, RIGHT the speed.',
  ),
];

const progression = (first: number, tenth: number): GuideText =>
  gt(
    `Каждые ${POINTS_PER_SPEED} очков скорость +1 (падение ${first}→${tenth} мс на клетку). На максимальной скорости темп сохраняется; LEVEL задаёт начальную высоту.`,
    `Every ${POINTS_PER_SPEED} points the speed goes up one step (fall ${first}→${tenth} ms per cell). At maximum speed the tempo stays fixed; LEVEL sets the initial stack height.`,
  );

const goal = gt(
  'Собирать ряды без пробелов и не дать стакану заполниться: игра кончается, когда новая фигура не помещается.',
  'Complete gap-free rows and keep the stack from filling up: the game ends when a new piece no longer fits.',
);

export const FM38_A_GUIDE: GameGuideData = {
  summary: gt(
    `Тетрис A: ${TETRIS_POOL.length} обычных фигур из четырёх клеток падают в стакан ${BRICK_COLS}×${BRICK_ROWS}, собранный ряд исчезает.`,
    `Tetris A: ${TETRIS_POOL.length} regular four-cell pieces fall into a ${BRICK_COLS}×${BRICK_ROWS} well and a completed row vanishes.`,
  ),
  goal,
  rules: [sharedRules[0]!, gt(`${TETRIS_POOL.length} фигур из четырёх клеток выпадают случайно; поворот — на 90°.`, `${TETRIS_POOL.length} four-cell pieces come up at random; a turn is 90°.`), ...sharedRules.slice(2)],
  controls: controls(gt('Поворот фигуры на 90°.', 'Rotate the piece 90°.')),
  scoring: LINE_SCORING,
  facts: [
    { value: String(TETRIS_POOL.length), label: gt('фигур по четыре клетки', 'four-cell pieces') },
    { value: `${FIRST_LEVEL_MS}→${TENTH_LEVEL_MS}`, label: gt('падение на клетку, мс (скорость 1→10)', 'fall per cell, ms (speed 1→10)') },
    { value: String(POINTS_PER_SPEED), label: gt('очков на ступень скорости', 'points per speed step') },
  ],
  progression: progression(FIRST_LEVEL_MS, TENTH_LEVEL_MS),
  lives: null,
  schemes: [
    { cells: TETRIS_PIECES_SCHEME, caption: gt('Семь фигур в начальном положении; ROTATE крутит их на 90°.', 'The seven pieces in their start pose; ROTATE turns them 90°.') },
    { cells: TETRIS_WELL_SCHEME, caption: gt('Палка в колодец закрывает четыре ряда сразу.', 'A line dropped into the well clears four rows at once.') },
  ],
  assumptions: [
    gt('Алгоритм демонстрации и темп падения заданы приближённо: записи оригинала FM-38 нет.', 'The demo algorithm and the falling tempo are approximate: there is no recording of the original FM-38.'),
  ],
};

export const FM38_B_GUIDE: GameGuideData = {
  summary: gt(
    `Тетрис B: ${PENTIX_POOL.length} фигур из трёх, четырёх и пяти клеток падают в стакан ${BRICK_COLS}×${BRICK_ROWS}; ряды и очки как в A, падение чуть медленнее.`,
    `Tetris B: ${PENTIX_POOL.length} pieces of three, four and five cells fall into a ${BRICK_COLS}×${BRICK_ROWS} well; rows and scoring as in A, falling a little slower.`,
  ),
  goal,
  rules: [
    sharedRules[0]!,
    gt(
      `${PENTIX_POOL.length} фигур: ${piecesWithCells(3)} из трёх клеток, ${piecesWithCells(4)} из четырёх, ${piecesWithCells(5)} из пяти; выпадают случайно.`,
      `${PENTIX_POOL.length} pieces: ${piecesWithCells(3)} of three cells, ${piecesWithCells(4)} of four, ${piecesWithCells(5)} of five; they come up at random.`,
    ),
    gt(
      'Поворот — на 90°; квадрат и крест из пяти клеток при повороте не меняются; у стенки фигуру сдвигает внутрь поля.',
      'A turn is 90°; the square and the five-cell cross do not change when turned; next to a wall the piece is nudged back into the field.',
    ),
    ...sharedRules.slice(2),
  ],
  controls: controls(gt('Поворот фигуры на 90°.', 'Rotate the piece 90°.')),
  scoring: LINE_SCORING,
  facts: [
    { value: String(PENTIX_POOL.length), label: gt('фигур по 3–5 клеток', 'pieces of 3–5 cells') },
    { value: `${FALL_B_FIRST}→${FALL_B_TENTH}`, label: gt('падение на клетку, мс (скорость 1→10)', 'fall per cell, ms (speed 1→10)') },
    { value: String(POINTS_PER_SPEED), label: gt('очков на ступень скорости', 'points per speed step') },
  ],
  progression: progression(FALL_B_FIRST, FALL_B_TENTH),
  lives: null,
  schemes: [
    {
      cells: PENTIX_PIECES_SCHEME,
      caption: gt(`Примеры: фигуры из трёх и пяти клеток (всего ${PENTIX_POOL.length}).`, `Examples: pieces of three and five cells (${PENTIX_POOL.length} in all).`),
    },
  ],
  assumptions: [
    gt('Точный набор фигур B и их частоты неизвестны: взят набор Pentix из 26 фигур по 3–5 клеток.', 'The exact B piece set and frequencies are unknown: the 26-piece Pentix set of 3–5 cells is used.'),
    gt('Темп падения B и алгоритм демонстрации заданы приближённо: записи оригинала FM-38 нет.', 'The B falling tempo and the demo algorithm are approximate: there is no recording of the original FM-38.'),
  ],
};

export interface Fm38GameInfo {
  id: Fm38GameId;
  /** Метка на вкладке и в заголовке: `A` или `B`. */
  key: string;
  name: GuideText;
  guide: GameGuideData;
  /** Короткая пометка под описанием. */
  note: GuideText;
}

export const FM38_GAMES: readonly Fm38GameInfo[] = [
  { id: 'a', key: 'A', name: gt('Тетрис A', 'Tetris A'), guide: FM38_A_GUIDE, note: gt('Игра A: обычные фигуры из четырёх клеток.', 'Game A: regular four-cell pieces.') },
  { id: 'b', key: 'B', name: gt('Тетрис B', 'Tetris B'), guide: FM38_B_GUIDE, note: gt('Игра B: большие фигуры из трёх, четырёх и пяти клеток.', 'Game B: big pieces of three, four and five cells.') },
];
