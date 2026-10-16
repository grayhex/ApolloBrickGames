/**
 * Описание игры 6 «Стрельба по фигурам / достройка» (`shooting-figures`, модуль `shapes`) для левой панели — по коду
 * `games/shapes.ts`, `games/gun/*` и документу `docs/brick/shapes.md`. Числа берутся из констант игры. Правил самой игры у донора
 * n0Live/BrickGame нет (есть только механика пушки), их источник — описание MT1997, поэтому почти всё здесь — допущения; самые
 * существенные вынесены в `assumptions`, остальное — в документе.
 */
import { MAX_LIVES } from '../base';
import {
  CELL_POINTS,
  DESCENT_FIRST_MS,
  DESCENT_TENTH_MS,
  EXTRA_LIFE_SCORE,
  RECTANGLE_CELL_POINTS,
  SHAPES_MODES,
  SPAWN_EVERY,
  SPEED_STEP_SCORE,
  START_FIGURES_MAX,
  START_FIGURES_PER_LEVEL,
  VANISH_TICKS,
} from '../games/shapes';
import { HANGING_HEIGHT, HANGING_WIDTH } from '../games/gun/figures';
import { gt, secondsText, type GameGuideData, type GuideScheme } from '../guide';
import { MAX_LEVEL, MAX_SPEED, MIN_LEVEL, MIN_SPEED } from '../types';

const VANISH = secondsText(VANISH_TICKS, 1);
/** Бонус вместо добавочной жизни, когда жизни полные (`BrickBase.setScore`: десятая часть порога). */
const FULL_LIVES_BONUS = EXTRA_LIFE_SCORE / 10;
/** Уровни, на которых стартует одна, две и три фигуры: `ceil(уровень / 4)`, не больше трёх. */
const ONE_FIGURE_UNTIL = START_FIGURES_PER_LEVEL;
const TWO_FIGURES_UNTIL = START_FIGURES_PER_LEVEL * 2;

/** Схемы — кадры игры (низ поля, пушка в колонке 4): тетрамино и пуля; висячая фигура и пуля; фигура, ставшая прямоугольником. */
export const SHAPES_SCHEMES: readonly GuideScheme[] = [
  {
    cells: ['...##.....', '....##....', '..........', '..........', '....*.....', '..........', '....#.....', '...###....'],
    caption: gt('Отстрел: пуля (мигает) разрушит нижнюю клетку фигуры в своей колонке.', 'The blinking bullet will destroy the shape’s lowest cell in its column.'),
  },
  {
    cells: ['...###....', '...#.#....', '.....#....', '..........', '....*.....', '..........', '....#.....', '...###....'],
    caption: gt('Достройка: пуля встанет под клеткой своей колонки и заполнит провал.', 'Completing: the bullet will stop under the cell in its column and fill the gap.'),
  },
  {
    cells: ['...***....', '...***....', '...***....', '..........', '....#.....', '...###....'],
    caption: gt(
      `Ставшая прямоугольником фигура мигает ${VANISH.ru} и исчезает (+${RECTANGLE_CELL_POINTS} за клетку).`,
      `A shape that became a rectangle blinks for ${VANISH.en} and disappears (+${RECTANGLE_CELL_POINTS} per cell).`,
    ),
  },
];

export const SHAPES_GUIDE: GameGuideData = {
  summary: gt(
    'Сверху спускаются фигуры. Пушка либо разрушает их выстрелами (варианты 1–2), либо достраивает до прямоугольников, и те исчезают (варианты 3–4).',
    'Shapes come down from the top. The gun either destroys them with shots (variants 1–2) or completes them into rectangles, which then vanish (variants 3–4).',
  ),
  goal: gt(
    'Не дать фигурам дойти до пушки: сбивайте их выстрелами или достраивайте до прямоугольников.',
    'Keep the shapes from reaching the gun: shoot them down or complete them into rectangles.',
  ),
  rules: [
    gt(
      `Фигуры появляются сверху в случайной колонке и опускаются все вместе на ряд за шаг; новая — каждые ${SPAWN_EVERY} шагов или на ближайшем, если поле пусто.`,
      `Shapes appear at the top in a random column and all drop one row per step; a new one comes every ${SPAWN_EVERY} steps, or on the next step if the field is empty.`,
    ),
    gt(
      'Отстрел: фигуры — тетрамино; пуля уничтожает первую клетку на пути, без цели исчезает. Обломки падают вместе со всем полем.',
      'Shooting: tetromino shapes; a bullet destroys the first cell in its way (meeting none, it vanishes). Fragments fall along with the whole field.',
    ),
    gt(
      `Достройка: фигуры — «висячие» столбики (${HANGING_WIDTH.min}–${HANGING_WIDTH.max} колонки высотой ${HANGING_HEIGHT.min}–${HANGING_HEIGHT.max}); пуля встаёт под первую клетку колонки и добавляет клетку.`,
      `Completing: shapes are “hanging” bars (${HANGING_WIDTH.min}–${HANGING_WIDTH.max} columns, ${HANGING_HEIGHT.min}–${HANGING_HEIGHT.max} high); a bullet stops under the first cell of its column and adds a cell.`,
    ),
    gt(
      `Группа клеток, ставшая сплошным прямоугольником, мигает ${VANISH.ru} и исчезает; лишняя клетка не страшна — прямоугольник выйдет больше.`,
      `A group of cells that becomes a solid rectangle blinks for ${VANISH.en} and vanishes; an extra cell does no harm — the rectangle just comes out bigger.`,
    ),
    gt(
      'Соприкоснувшиеся фигуры — одна группа: клетка между ними может собрать общий прямоугольник. В достройке пуля без цели улетает.',
      'Touching shapes form one group: a cell between them can complete a joint rectangle. In completing, a bullet that meets nothing flies away.',
    ),
    gt(
      'В вариантах «в бок» (2 и 4) после каждого шага спуска всё поле сдвигается на клетку влево или вправо, без оборачивания.',
      'In the “sideways” variants (2 and 4) the whole field shifts one cell left or right after every descent step, without wrapping.',
    ),
    gt(
      `Клетка дошла до ряда ствола — потеря жизни: взрыв, очистка поля, тот же уровень заново. На уровнях 1–${ONE_FIGURE_UNTIL} стартует одна фигура, ${ONE_FIGURE_UNTIL + 1}–${TWO_FIGURES_UNTIL} две, дальше ${START_FIGURES_MAX}.`,
      `A cell reaching the barrel row costs a life: explosion, field cleared, same level again. Levels 1–${ONE_FIGURE_UNTIL} start with one shape, ${ONE_FIGURE_UNTIL + 1}–${TWO_FIGURES_UNTIL} two, then ${START_FIGURES_MAX}.`,
    ),
    gt(
      'Пока мигает прямоугольник и пока взрыв, кнопки не работают; пули в воздухе пропадают.',
      'While a rectangle blinks or the gun explodes, the buttons do nothing; bullets in the air vanish.',
    ),
  ],
  controls: [
    { button: 'left', text: gt('Пушка на клетку влево; зажатая кнопка повторяется.', 'The gun one cell left; holding repeats.') },
    { button: 'right', text: gt('Пушка на клетку вправо; зажатая кнопка повторяется.', 'The gun one cell right; holding repeats.') },
    { button: 'rotate', text: gt('Выстрел; зажатая кнопка стреляет очередью (клавиша «огонь» — то же).', 'Fire; holding fires a burst (the fire key does the same).') },
  ],
  scoring: [
    { what: gt('Клетка, сбитая пулей (отстрел)', 'A cell shot down (shooting)'), points: `+${CELL_POINTS}` },
    { what: gt('Клетка, добавленная пулей (достройка)', 'A cell a bullet adds (completing)'), points: `+${CELL_POINTS}` },
    { what: gt('Клетка исчезнувшего прямоугольника', 'A cell of a vanished rectangle'), points: `+${RECTANGLE_CELL_POINTS} за клетку` },
  ],
  facts: [
    { value: String(MAX_LIVES), label: gt('жизни в начале', 'starting lives') },
    { value: String(SPEED_STEP_SCORE), label: gt('очков на следующую скорость', 'points per speed step') },
    { value: String(EXTRA_LIFE_SCORE), label: gt('очков до добавочной жизни', 'points per extra life') },
    { value: `${DESCENT_FIRST_MS}→${DESCENT_TENTH_MS}`, label: gt('мс на шаг спуска (скорость 1→10)', 'ms per descent step (speed 1→10)') },
  ],
  progression: gt(
    `Каждые ${SPEED_STEP_SCORE} очков скорость растёт на единицу (спуск чаще). После скорости ${MAX_SPEED} — снова скорость ${MIN_SPEED} и уровень выше (стартовых фигур больше), поле очищается; после уровня ${MAX_LEVEL} — уровень ${MIN_LEVEL}.`,
    `Every ${SPEED_STEP_SCORE} points the speed goes up one step (descent is faster). After speed ${MAX_SPEED} it is speed ${MIN_SPEED} again and the level rises (more starting shapes) with the field cleared; after level ${MAX_LEVEL}, level ${MIN_LEVEL}.`,
  ),
  lives: gt(
    `${MAX_LIVES} жизни. Добавочная — за каждые ${EXTRA_LIFE_SCORE} очков; если жизней уже ${MAX_LIVES}, вместо неё прибавляется ${FULL_LIVES_BONUS} очков.`,
    `${MAX_LIVES} lives. An extra one for every ${EXTRA_LIFE_SCORE} points; with ${MAX_LIVES} lives already, ${FULL_LIVES_BONUS} bonus points are added instead.`,
  ),
  schemes: SHAPES_SCHEMES,
  assumptions: [
    gt(
      `У донора игры «фигуры» нет: правила — из описания MT1997 (${SHAPES_MODES.length} варианта: 2 отстрела и 2 достройки, с движением в бок и без); пушка, пули, жизни — донорские.`,
      `The donor has no “shapes” game: rules follow the MT1997 description (${SHAPES_MODES.length} variants: 2 shooting, 2 completing); gun, bullets and lives are the donor’s.`,
    ),
    gt(
      'Вид фигур, частота появления, скорость спуска, очки, слияние соприкоснувшихся фигур и мигание прямоугольника — выбраны нами.',
      'The shapes, spawn rate, descent speed, points, merging of touching shapes and the rectangle’s blink are our own choices.',
    ),
    gt(
      '«Движение в бок» понято как сдвиг всего поля после шага спуска; что именно движется в MT1997, не установлено.',
      '“Sideways motion” is read as a shift of the whole field after a descent step; what exactly moves in MT1997 is not established.',
    ),
    gt(
      '«Подмога» (вторая пушка за потерянную жизнь) и вишенки-награды MT1997 не восстановлены.',
      'The MT1997 “help” (a second gun for a lost life) and cherry rewards are not restored.',
    ),
  ],
};
