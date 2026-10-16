/**
 * Описание игры 2 «Лягушка» (`frog`) по коду `games/frogger.ts`: числа берутся из его констант, правила — из его документа `docs/brick/frogger.md`.
 * Что взято у донора n0Live/BrickGame (MIT) и что допущение — в списке `assumptions` и в `modes[].note`.
 */
import { genuineTicks } from '../timing';
import { BRICK_COLS } from '../types';
import { gt, secondsText, type GameGuideData } from '../guide';
import {
  FROG_SCORES_TO_EXTRA_LIFE,
  ROAD_SHIFT_FACTOR,
  SCORE_PER_FROG,
  SCORE_PER_ROW,
  SPEED_OF_FIRST_LEVEL_MS,
  SPEED_OF_TENTH_LEVEL_MS,
  froggerDef,
} from '../games/frogger';
import { LANE_COUNT } from '../games/frogger/lanes';

/** Лягушка стартует с четырьмя жизнями (`reset()` игры: `setLives(4)`). */
export const FROGGER_LIVES = 4;

const SLOW = secondsText(genuineTicks(1, SPEED_OF_FIRST_LEVEL_MS, SPEED_OF_TENTH_LEVEL_MS) * ROAD_SHIFT_FACTOR);
const FAST = secondsText(genuineTicks(10, SPEED_OF_FIRST_LEVEL_MS, SPEED_OF_TENTH_LEVEL_MS) * ROAD_SHIFT_FACTOR);

export const FROGGER_GUIDE: GameGuideData = {
  summary: gt(
    `Лягушка внизу переходит дорогу из ${LANE_COUNT} полос с машинами и прыгает в один из ${BRICK_COLS} домов наверху поля.`,
    `A frog crosses a road of ${LANE_COUNT} traffic lanes and jumps into one of ${BRICK_COLS} homes at the top of the field.`,
  ),
  goal: gt(`Заполнить все ${BRICK_COLS} домов, не попав под машину.`, `Fill all ${BRICK_COLS} homes without getting hit by a car.`),
  rules: [
    gt(
      `Между полосами — сплошные разделители; лягушка перепрыгивает их: прыжок вперёд идёт на два ряда, с обочины в дом — на один.`,
      `Solid dividers lie between the lanes; the frog jumps over them: a forward jump covers two rows, from the verge into a home just one.`,
    ),
    gt(
      `Дорога сама сдвигается на клетку: раз в ${SLOW.ru} на скорости 1 и раз в ${FAST.ru} на скорости 10.`,
      `The road shifts one cell by itself: every ${SLOW.en} at speed 1 and every ${FAST.en} at speed 10.`,
    ),
    gt(
      'Машина, боковая стена поля или край дороги отнимают жизнь; тот же уровень начинается заново, занятые дома остаются.',
      'A car, the side wall or the edge of the road costs a life; the same level restarts and the filled homes stay.',
    ),
    gt('Прыжок в уже занятый дом тоже стоит жизни.', 'Jumping into a home that is already filled also costs a life.'),
    gt(
      'В вариантах «с переносом» лягушку несёт вместе с полосой; если дорога вынесет её за край, жизнь потеряна.',
      'In the “carry” variants the frog rides along with its lane; if the road carries it off the edge, a life is lost.',
    ),
    gt(
      'В вариантах «встречные» часть полос едет навстречу остальным; в случайных вариантах дорога новая на каждую жизнь и уровень.',
      'In the “oncoming” variants some lanes run against the rest; in the random variants the road is new on every life and level.',
    ),
    gt(
      `Когда заполнены все ${BRICK_COLS} домов, ряд стирается и открывается следующий уровень.`,
      `When all ${BRICK_COLS} homes are filled, the row is wiped away and the next level opens.`,
    ),
  ],
  controls: [
    { button: 'left', text: gt('Прыжок на клетку влево; удержание повторяет прыжки.', 'Jump one cell left; holding repeats the jump.') },
    { button: 'right', text: gt('Прыжок на клетку вправо; удержание повторяет прыжки.', 'Jump one cell right; holding repeats the jump.') },
    { button: 'up', text: gt('Прыжок вперёд (к домам).', 'Jump forward (toward the homes).') },
    { button: 'down', text: gt('Прыжок назад (к старту).', 'Jump back (toward the start).') },
    { button: 'rotate', text: gt('То же, что «вверх».', 'Same as UP.') },
  ],
  scoring: [
    { what: gt('Лягушка дошла до дома', 'A frog reaches a home'), points: `+${SCORE_PER_FROG}` },
    { what: gt(`Заполнен весь ряд из ${BRICK_COLS} домов`, `The whole row of ${BRICK_COLS} homes is filled`), points: `+${SCORE_PER_ROW}` },
  ],
  facts: [
    { value: String(LANE_COUNT), label: gt('полос с машинами', 'traffic lanes') },
    { value: String(BRICK_COLS), label: gt('домов наверху', 'homes at the top') },
    { value: String(FROGGER_LIVES), label: gt('жизни в начале', 'starting lives') },
    { value: String(FROG_SCORES_TO_EXTRA_LIFE), label: gt('очков до добавочной жизни', 'points per extra life') },
  ],
  progression: gt(
    'Пройденный уровень добавляет уровень; после десятого — снова первый, но скорость на единицу выше. На случайной дороге с уровнем растёт число встречных полос.',
    'Each cleared level adds a level; after the tenth it is level 1 again with the speed one step higher. On a random road the number of oncoming lanes grows with the level.',
  ),
  lives: gt(
    `Четыре жизни. Добавочная — за каждые ${FROG_SCORES_TO_EXTRA_LIFE} очков; если жизней уже четыре, прибавляется 50 очков.`,
    `Four lives. An extra one comes with every ${FROG_SCORES_TO_EXTRA_LIFE} points; with four lives already, 50 bonus points are added instead.`,
  ),
  schemes: [
    {
      cells: ['##########', '.####....#', '##########', '###....###', '##########', '....##....', '##########', '....*.....'],
      caption: gt('Внизу: старт (лягушка мигает), полосы с машинами и разделители.', 'Bottom: the start (the frog blinks), traffic lanes and dividers.'),
    },
    {
      cells: ['.#..#...#.', '..........', '##########'],
      caption: gt('Наверху: дома (заняты три), обочина и первый разделитель.', 'Top: the homes (three filled), the verge and the first divider.'),
    },
  ],
  assumptions: [
    gt(
      `Реализованы ${froggerDef.modes.length} вариантов из 32 донорских; их соответствие вариантам Apollo не установлено.`,
      `${froggerDef.modes.length} of the donor's 32 variants are implemented; how they map to the Apollo variants is not established.`,
    ),
    gt(
      'Одновременные «вперёд» (вверх и ROTATE) дают один прыжок, звуки и автоповтор кнопок выбраны нами.',
      'Simultaneous “forward” buttons (UP and ROTATE) give one jump; the sounds and key auto-repeat are our choice.',
    ),
  ],
};
