/**
 * Описание игры 5 «Стрельба по массиву и точкам-врагам» (`shooting-array`) по коду `games/invaders.ts` и документу `docs/brick/invaders.md`:
 * числа берутся из констант игры. Правила донора n0Live/BrickGame (MIT); число вариантов устройства не установлено.
 */
import { genuineTicks } from '../timing';
import { gt, secondsText, type GameGuideData } from '../guide';
import {
  EXTRA_LIFE_SCORE,
  MAX_BULLETS_PER_COLUMN,
  SLOW_BRICKS,
  SPEED_FIRST_MS,
  SPEED_TENTH_MS,
  START_LIVES,
  invadersDef,
} from '../games/invaders';

const SLOW = secondsText(genuineTicks(1, SPEED_FIRST_MS, SPEED_TENTH_MS));
const FAST = secondsText(genuineTicks(10, SPEED_FIRST_MS, SPEED_TENTH_MS));

export const INVADERS_GUIDE: GameGuideData = {
  summary: gt(
    'Сверху висит стена из кирпичей и ступенчато опускается; от неё по одной отделяются точки-«шары» и летят на орудие. Орудие внизу стреляет вверх.',
    'A wall of bricks hangs from the top and steps down; single “ball” dots break away from it and fly at the gun. The gun at the bottom shoots upward.',
  ),
  goal: gt('Выбить все кирпичи и сбить шар, пока стена не дошла до орудия.', 'Knock out every brick and the ball before the wall reaches the gun.'),
  rules: [
    gt(
      `Стена опускается на строку: раз в ${SLOW.ru} на скорости 1 и раз в ${FAST.ru} на скорости 10 (на 1 мс медленнее за каждый кирпич сверх ${SLOW_BRICKS}).`,
      `The wall drops one row every ${SLOW.en} at speed 1 and every ${FAST.en} at speed 10 (1 ms slower per brick above ${SLOW_BRICKS}).`,
    ),
    gt(
      'Кирпич, дошедший до строки «дула» орудия, отнимает жизнь.',
      'A brick that reaches the row of the gun barrel costs a life.',
    ),
    gt(
      'От правого кирпича нижнего ряда отделяется шар: целится в орудие, летит по диагонали вниз и отскакивает от краёв; пока он летит, стена стоит.',
      'A ball breaks off the bottom row, aims at the gun, flies diagonally down and bounces off the edges; the wall stands still meanwhile.',
    ),
    gt(
      'Шар, попавший в орудие, отнимает жизнь; улетевший за нижний край пропадает без вреда; пулей его можно сбить.',
      'A ball that hits the gun costs a life; one that leaves through the bottom is harmless; a bullet can shoot it down.',
    ),
    gt(
      `Пуля разрушает первый кирпич в своей колонке; в колонке не больше ${MAX_BULLETS_PER_COLUMN} пуль.`,
      `A bullet destroys the first brick in its column; there are at most ${MAX_BULLETS_PER_COLUMN} bullets per column.`,
    ),
    gt(
      `Варианты различаются: один ствол или два (выстрел реже, пуля медленнее), готовая или случайная стена, сдвиг стены после каждого шага, поле вверх дном.`,
      `Variants differ: one barrel or two (slower fire and bullets), preset or random wall, wall shifting after every step, an upside-down field.`,
    ),
    gt(
      'Все кирпичи выбиты и шар исчез — поле очищается, начинается следующий уровень с новой стеной.',
      'All bricks gone and the ball vanished — the field is wiped and the next level starts with a new wall.',
    ),
  ],
  controls: [
    { button: 'left', text: gt('Орудие влево; удержание повторяет.', 'Gun left; holding repeats.') },
    { button: 'right', text: gt('Орудие вправо; удержание повторяет.', 'Gun right; holding repeats.') },
    { button: 'rotate', text: gt('Огонь; удержание — автоогонь.', 'Fire; holding auto-fires.') },
    { button: 'down', text: gt('Лишний шаг стены (в вариантах вверх дном — «вверх»).', 'An extra step of the wall (UP in the upside-down variants).') },
  ],
  scoring: [
    { what: gt('Выбитый кирпич', 'A brick destroyed'), points: '+1' },
    { what: gt('Сбитый шар', 'A ball shot down'), points: '0' },
  ],
  facts: [
    { value: String(invadersDef.modes.length), label: gt('вариантов игры', 'game variants') },
    { value: String(START_LIVES), label: gt('жизни в начале', 'starting lives') },
    { value: String(EXTRA_LIFE_SCORE), label: gt('очков до добавочной жизни', 'points per extra life') },
    { value: String(MAX_BULLETS_PER_COLUMN), label: gt('пуль в колонке не больше', 'bullets per column at most') },
  ],
  progression: gt(
    'Скорость задана в меню и меняется только после победы: пройденный уровень добавляет уровень (стена выше), после десятого — снова первый и скорость на единицу выше.',
    'The speed is set in the menu and changes only after a win: each cleared level adds a level (a taller wall); after the tenth it is level 1 again with the speed one step higher.',
  ),
  lives: gt(
    `Четыре жизни. Добавочная — за каждые ${EXTRA_LIFE_SCORE} очков (при полных — бонус 100 очков). После потери жизни — тот же уровень с новой стеной.`,
    `Four lives. An extra one for every ${EXTRA_LIFE_SCORE} points (with a full set, a 100-point bonus). After a lost life the same level restarts with a new wall.`,
  ),
  schemes: [
    {
      cells: ['..........', '.#.#..#.#.', '..#....#..', '.###..###.', '##########', '###.##.###', '.########.', '..######..', '...###....'],
      caption: gt('Стена из кирпичей наверху (готовая стена первого уровня).', 'The brick wall at the top (the preset wall of level 1).'),
    },
    {
      cells: ['......#...', '..........', '..........', '.....*....', '..........', '....#.....', '...###....'],
      caption: gt('Орудие, пуля (мигает) и шар, летящий на него.', 'The gun, a bullet (blinking) and a ball flying at it.'),
    },
  ],
  assumptions: [
    gt(
      'Число вариантов устройства не установлено: реализованы все 16 донорских.',
      "The number of variants on the device is not established: all 16 donor variants are implemented.",
    ),
    gt(
      'Во время «мелодии» перед уровнем орудие не двигается (у донора можно); звуки и повтор кнопок выбраны нами.',
      "During the jingle before a level the gun cannot move (it can in the donor); the sounds and key repeat are our choice.",
    ),
  ],
};
