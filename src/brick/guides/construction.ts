/**
 * Описание игры 7 «Строитель» (`construction`) для левой панели — по коду `games/construction.ts`, общей части `games/gun/*`
 * и документу `docs/brick/construction.md`. Числа берутся из констант игры; правила — донора n0Live/BrickGame (`GunGame`, режим
 * создания клеток, MIT), а не прошивки Apollo; допущения — в `assumptions` (подробнее — в документе).
 */
import { MAX_LIVES } from '../base';
import {
  CELL_POINTS,
  CONSTRUCTION_MODES,
  DROP_FIRST_MS,
  DROP_TENTH_MS,
  EXTRA_LIFE_SCORE,
  LINE_POINTS,
  SPEED_STEP_SCORE,
} from '../games/construction';
import { INTRO_TICKS } from '../games/gun/gunGame';
import { gt, secondsText, type GameGuideData, type GuideScheme } from '../guide';
import { genuineTicks } from '../timing';
import { MAX_LEVEL, MAX_SPEED, MIN_LEVEL, MIN_SPEED } from '../types';

/** Шаг стены на скорости 1 и 10 в секундах для текстов (у двух пушек вдвое дольше). */
const SLOW_STEP = secondsText(genuineTicks(1, DROP_FIRST_MS, DROP_TENTH_MS), 1);
const FAST_STEP = secondsText(genuineTicks(10, DROP_FIRST_MS, DROP_TENTH_MS), 1);
const INTRO = secondsText(INTRO_TICKS, 1);
/** Бонус вместо добавочной жизни, когда жизни полные (`BrickBase.setScore`: десятая часть порога). */
const FULL_LIVES_BONUS = EXTRA_LIFE_SCORE / 10;

/** Схемы — кадры игры: верх поля со стеной; выстрел, который замкнёт ряд; две пушки (низ поля, пушка в колонке 4). */
export const CONSTRUCTION_SCHEMES: readonly GuideScheme[] = [
  {
    cells: ['#.##.#.###', '.##.#..#.#', '##..#.##..', '..........'],
    caption: gt('Верх поля: стена из случайных рядов (в каждом есть и клетки, и пропуски).', 'Top of the field: a wall of random rows (each row has both cells and gaps).'),
  },
  {
    cells: ['..........', '....#.....', '####.#####', '..........', '....*.....', '..........', '....#.....', '...###....'],
    caption: gt(
      `Пуля (мигает) встанет в пропуск под клеткой: ряд заполнится и исчезнет (+${LINE_POINTS}).`,
      `The blinking bullet fills the gap: the row completes and vanishes (+${LINE_POINTS}).`,
    ),
  },
  {
    cells: ['...*.*....', '....#.....', '...###....'],
    caption: gt('Две пушки: пули вылетают из колонок по бокам от центра пушки.', 'Two guns: bullets leave from the columns on both sides of the gun centre.'),
  },
];

export const CONSTRUCTION_GUIDE: GameGuideData = {
  summary: gt(
    'Сверху висит стена из случайных рядов и ступенчато опускается к пушке. Пушка стреляет «грязью»: пуля встаёт перед первой клеткой стены и достраивает её; полный ряд исчезает.',
    'A wall of random rows hangs from the top and steps down toward the gun. The gun fires “mud”: a bullet stops before the first wall cell and adds to it; a full row disappears.',
  ),
  goal: gt(
    'Не дать стене дойти до пушки: достраивайте ряды выстрелами, чтобы они заполнялись и исчезали.',
    'Keep the wall from reaching the gun: fill rows with shots so they complete and vanish.',
  ),
  rules: [
    gt(
      'На уровне N стена стартует с N рядов; в каждом ряду клетки случайные, но не пусто и не полно.',
      'On level N the wall starts with N rows; each row is random, but never empty and never full.',
    ),
    gt(
      `Стена опускается на ряд раз в ${SLOW_STEP.ru} … ${FAST_STEP.ru} (скорость 1…10); у двух пушек шаг вдвое дольше.`,
      `The wall drops a row every ${SLOW_STEP.en} … ${FAST_STEP.en} (speed 1…10); with two guns the step is twice as long.`,
    ),
    gt(
      'Пуля летит вверх по колонке и встаёт перед первой клеткой стены (в пустой колонке — у верхнего края); вплотную к дулу клетка не создаётся.',
      'A bullet flies up its column and stops before the first wall cell (in an empty column, at the top edge); no cell is made right against the muzzle.',
    ),
    gt(
      'Полный ряд гаснет от пушки к краям и исчезает; ряды между ним и пушкой поднимаются на его место, остальные стоят.',
      'A full row goes out from the gun toward the edges and disappears; rows between it and the gun rise into its place, the others stay.',
    ),
    gt(
      'Стена опустилась до ряда дула (хоть одной клеткой) — потеря жизни: взрыв, очистка поля, тот же уровень заново.',
      'The wall dropping to the muzzle row (even one cell) costs a life: an explosion, the field is cleared, the same level restarts.',
    ),
    gt(
      `Пока убирается ряд, идёт взрыв или играет «мелодия» перед уровнем (${INTRO.ru}), кнопки не работают; пули пропадают.`,
      `While a row is removed, the gun explodes or the pre-level jingle plays (${INTRO.en}), the buttons do nothing; bullets vanish.`,
    ),
    gt(
      `${CONSTRUCTION_MODES.length} вариантов: одна или две пушки (пули из колонок по бокам, вдвое медленнее), сдвиг поля, поле вверх ногами.`,
      `${CONSTRUCTION_MODES.length} variants: one or two guns (bullets from the side columns, twice as slow), board shift, upside-down field.`,
    ),
    gt(
      'Со сдвигом: после спуска ряда всё поле сдвигается на клетку влево или вправо, клетки переходят с края на край.',
      'With the shift: after a row drops, the whole field moves one cell left or right, cells wrapping from edge to edge.',
    ),
  ],
  controls: [
    { button: 'left', text: gt('Пушка на клетку влево: одно нажатие — один шаг, зажатая не повторяется.', 'The gun one cell left: one press, one step; holding does not repeat.') },
    { button: 'right', text: gt('Пушка на клетку вправо: одно нажатие — один шаг, зажатая не повторяется.', 'The gun one cell right: one press, one step; holding does not repeat.') },
    { button: 'rotate', text: gt('Выстрел: одно нажатие — одна пуля (клавиша «огонь» — то же).', 'Fire: one press, one bullet (the fire key does the same).') },
    { button: 'down', text: gt('Уронить стену на ряд сразу; зажатая повторяет.', 'Drop the wall one row at once; holding repeats.') },
    { button: 'up', text: gt('В вариантах «вверх ногами» роняет стену (вместо «вниз»).', 'In the “upside down” variants it drops the wall (instead of down).') },
  ],
  scoring: [
    { what: gt('Клетка, добавленная пулей к стене', 'A cell a bullet adds to the wall'), points: `+${CELL_POINTS}` },
    { what: gt('Убранный ряд (сверх очка за последнюю клетку)', 'A removed row (on top of the point for the last cell)'), points: `+${LINE_POINTS}` },
  ],
  facts: [
    { value: String(MAX_LIVES), label: gt('жизни в начале', 'starting lives') },
    { value: String(SPEED_STEP_SCORE), label: gt('очков на следующую скорость', 'points per speed step') },
    { value: String(EXTRA_LIFE_SCORE), label: gt('очков до добавочной жизни', 'points per extra life') },
    { value: `${DROP_FIRST_MS}→${DROP_TENTH_MS}`, label: gt('мс на шаг стены (скорость 1→10)', 'ms per wall step (speed 1→10)') },
  ],
  progression: gt(
    `Каждые ${SPEED_STEP_SCORE} очков скорость растёт на единицу (стена опускается чаще). После скорости ${MAX_SPEED} — снова скорость ${MIN_SPEED} и уровень выше (стартовых рядов больше), поле очищается; после уровня ${MAX_LEVEL} — уровень ${MIN_LEVEL}.`,
    `Every ${SPEED_STEP_SCORE} points the speed goes up one step (the wall drops more often). After speed ${MAX_SPEED} it is speed ${MIN_SPEED} again and the level rises (more starting rows) with the field cleared; after level ${MAX_LEVEL}, level ${MIN_LEVEL}.`,
  ),
  lives: gt(
    `${MAX_LIVES} жизни. Добавочная — за каждые ${EXTRA_LIFE_SCORE} очков; если жизней уже ${MAX_LIVES}, вместо неё прибавляется ${FULL_LIVES_BONUS} очков.`,
    `${MAX_LIVES} lives. An extra one for every ${EXTRA_LIFE_SCORE} points; with ${MAX_LIVES} lives already, ${FULL_LIVES_BONUS} bonus points are added instead.`,
  ),
  schemes: CONSTRUCTION_SCHEMES,
  assumptions: [
    gt(
      'Правила — донора n0Live/BrickGame (режим создания GunGame), не прошивки Apollo: очки, пороги и скорости на устройстве не проверены.',
      'The rules are the n0Live/BrickGame donor’s (GunGame creating mode), not Apollo firmware: points, thresholds and speeds are unchecked on the device.',
    ),
    gt(
      'Из 16 вариантов донора взяты восемь «создающих»; сколько вариантов у Apollo и какие, не установлено — номера условные.',
      'Eight “creating” variants of the donor’s 16 are used; how many variants Apollo has, and which, is not established — the numbers are nominal.',
    ),
    gt(
      `Перед уровнем ${INTRO.ru} без управления (у донора пушку в это время можно двигать); таймер спуска стены на каждом уровне начинается заново.`,
      `No control for ${INTRO.en} before a level (the donor lets the gun move then); the wall timer restarts on every level.`,
    ),
  ],
};
