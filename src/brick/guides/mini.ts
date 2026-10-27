/**
 * Описание игр Mini Brick Game B-S96 («96 IN 1») для левой панели: две «игры» — гонки (номера 00 и 01) и тетрис (остальные номера). Общее описание
 * на каждую игру, а не на каждый номер: вариации тетриса по отдельности не описываются (какая вариация стоит под каким номером, неизвестно).
 * Числа берутся из констант игр (`games/mini.ts`, `games/miniRacing.ts`); тексты по коду и по наблюдениям владельца (`docs/minibrick.md`).
 */
import { gt, type GameGuideData, type GuideText } from '../guide';
import { MINI_CARS, MINI_RACE_ACCEL_TICKS } from '../games/miniRacing';
import { MINI_GAME_COUNT, MINI_RACING_COUNT, MINI_TETRIS_COUNT, miniRacingDef } from '../games/mini';
import { BRICK_TICK_HZ } from '../types';
import { TETRIS_GUIDE } from './tetris';

export type MiniGameId = 'racing' | 'tetris';
export const MINI_GAME_IDS: readonly MiniGameId[] = ['racing', 'tetris'];

const pad = (n: number): string => String(n).padStart(2, '0');
/** Номера на экране консоли, которые занимает игра: `00–01` и `02–96`. */
export const MINI_GAME_RANGE: Readonly<Record<MiniGameId, string>> = {
  racing: `${pad(0)}–${pad(MINI_RACING_COUNT - 1)}`,
  tetris: `${pad(MINI_RACING_COUNT)}–${pad(MINI_GAME_COUNT - 1)}`,
};

const ACCEL_SECONDS = MINI_RACE_ACCEL_TICKS / BRICK_TICK_HZ;

export const MINI_RACING_GUIDE: GameGuideData = {
  summary: gt(
    `Гонка на поле 10×20 в ${miniRacingDef.modes.length} вариациях (${MINI_GAME_RANGE.racing}): отличается только форма носа машины — крест или треугольник. Дорога с прерывистыми бортами.`,
    `A race on a 10×20 field in ${miniRacingDef.modes.length} variations (${MINI_GAME_RANGE.racing}); only the car nose differs — a cross or a triangle. The road has dashed borders.`,
  ),
  goal: gt('Ехать как можно дольше, объезжая туннели и фигуры и собирая палочки.', 'Drive as long as possible, avoiding tunnels and shapes and collecting rods.'),
  rules: [
    gt('Туннели и фигуры нужно объезжать: столкновение заканчивает партию, жизней нет.', 'Tunnels and shapes must be avoided: a collision ends the game, there are no lives.'),
    gt('Вертикальные палочки из 2–4 клеток нужно собирать: касание даёт 20, 30 или 40 очков один раз.', 'Collect the vertical rods of 2–4 cells: touching one gives 20, 30 or 40 points once.'),
    gt('Каждая полная секунда езды даёт +10 очков.', 'Every full second of driving gives +10 points.'),
    gt(`Скорость растёт сама, раз в ${ACCEL_SECONDS} с, до максимальной; кнопки DOWN и ROTATE в гонке не действуют.`, `Speed rises by itself, once every ${ACCEL_SECONDS} s, up to the maximum; DOWN and ROTATE do nothing in the race.`),
    gt('У препятствий остаётся проход шириной не меньше трёх колонок.', 'Obstacles always leave a gap at least three columns wide.'),
  ],
  controls: [
    { button: 'left', text: gt('Машина влево; удержание повторяет.', 'Car left; holding repeats.') },
    { button: 'right', text: gt('Машина вправо; удержание повторяет.', 'Car right; holding repeats.') },
    { button: 'start', text: gt('Пауза; в конце партии — новая. RESET — выход в меню.', 'Pause; after the game — a new one. RESET returns to the menu.') },
  ],
  scoring: [
    { what: gt('Каждая секунда езды', 'Each second of driving'), points: '+10' },
    { what: gt('Палочка из 2 клеток', 'A rod of 2 cells'), points: '+20' },
    { what: gt('Палочка из 3 клеток', 'A rod of 3 cells'), points: '+30' },
    { what: gt('Палочка из 4 клеток', 'A rod of 4 cells'), points: '+40' },
  ],
  facts: [
    { value: String(miniRacingDef.modes.length), label: gt('вариации: крест и треугольник', 'variations: cross and triangle') },
    { value: '+10', label: gt('очков за секунду езды', 'points per driving second') },
    { value: '20–40', label: gt('очков за палочку', 'points per rod') },
  ],
  progression: gt('Скорость растёт автоматически; скорость, выбранная в меню, на гонку не влияет.', 'Speed rises automatically; the speed chosen in the menu does not affect the race.'),
  lives: null,
  schemes: [
    { cells: MINI_CARS[0], caption: gt('Вариация 00: машина с крестообразным носом, 3 × 5 клеток.', 'Variation 00: a car with a cross-shaped nose, 3 × 5 cells.') },
    { cells: MINI_CARS[1], caption: gt('Вариация 01: машина с треугольным носом.', 'Variation 01: a car with a triangular nose.') },
  ],
  assumptions: [
    gt('Фигуры препятствий, расстояние между ними и интервал разгона подобраны по записи владельца, а не измерены по прошивке.', 'Obstacle shapes, their spacing and the acceleration interval follow the owner recording, not a firmware measurement.'),
    gt('Перед стартом один раз звучит куплет «Коробейников»; пока идёт заставка с флагом, машина и дорога стоят, очки не начисляются.', 'Before the start one verse of “Korobeiniki” plays; during the flag scene the car and road stand still and no points are scored.'),
    gt('Рисунок треугольного носа — по уточнению владельца.', 'The triangular nose drawing follows the owner clarification.'),
  ],
};

export const MINI_TETRIS_GUIDE: GameGuideData = {
  ...TETRIS_GUIDE,
  summary: gt(
    `Тетрис на поле 10×20: фигуры падают сверху, собранный ряд исчезает. Номера ${MINI_GAME_RANGE.tetris} — вариации одной игры.`,
    `Tetris on a 10×20 field: pieces fall from the top and a completed row vanishes. Numbers ${MINI_GAME_RANGE.tetris} are variations of one game.`,
  ),
  rules: [
    ...TETRIS_GUIDE.rules.slice(0, 3),
    gt(
      'Вариации различаются фигурами, поворотом (где-то вместо него смена фигуры), новыми рядами по таймеру, сдвигом и перевёрнутым полем.',
      'Variations differ in pieces, turning (in some a piece swap instead), timed new rows, board shifts and an upside-down board.',
    ),
    gt('Уровень 0–12 и скорость 0–9 выбираются в меню перед партией.', 'Level 0–12 and speed 0–9 are chosen in the menu before the game.'),
  ],
  facts: [
    { value: String(MINI_TETRIS_COUNT), label: gt('вариации тетриса', 'Tetris variations') },
    { value: '0–12', label: gt('уровень в меню', 'level in the menu') },
    { value: '0–9', label: gt('скорость в меню', 'speed in the menu') },
  ],
  assumptions: [
    gt('Какой вариации соответствует какой номер, не установлено: порядок номеров — допущение, таблицы устройства нет.', 'Which number holds which variation is unknown: the order of the numbers is an assumption, there is no device table.'),
    gt('Перед партией один раз звучит куплет «Коробейников».', 'One verse of “Korobeiniki” plays before the game.'),
  ],
};

export interface MiniGameInfo {
  id: MiniGameId;
  /** Короткая пометка под описанием: какие номера занимает игра и как описаны вариации. */
  note: GuideText;
  /** Метка на вкладке и в заголовке: номера на экране консоли. */
  key: string;
  name: GuideText;
  guide: GameGuideData;
}

/** Игры консоли по порядку номеров. */
export const MINI_GAMES: readonly MiniGameInfo[] = [
  {
    id: 'racing',
    key: MINI_GAME_RANGE.racing,
    name: gt('Гонки', 'Racing'),
    note: gt(`Номера ${MINI_GAME_RANGE.racing}: 00 — машина с крестообразным носом, 01 — с треугольным.`, `Numbers ${MINI_GAME_RANGE.racing}: 00 — a car with a cross-shaped nose, 01 — with a triangular one.`),
    guide: MINI_RACING_GUIDE,
  },
  {
    id: 'tetris',
    key: MINI_GAME_RANGE.tetris,
    name: gt('Тетрис', 'Tetris'),
    note: gt(
      `Номера ${MINI_GAME_RANGE.tetris}: ${MINI_TETRIS_COUNT} вариаций одной игры.`,
      `Numbers ${MINI_GAME_RANGE.tetris}: ${MINI_TETRIS_COUNT} variations of one game.`,
    ),
    guide: MINI_TETRIS_GUIDE,
  },
];
