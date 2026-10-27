/**
 * Описание «Арканоида» для левой панели — по факту реализации (`src/brick/games/arkanoid.ts`, `arkanoid/wall.ts`).
 * Числа не вписаны руками: они берутся из констант игры и подставляются в тексты, а `tests/brick/games/arkanoid.guide.test.ts`
 * проверяет каждое из них поведением самой игры. Схемы собраны из данных стены и совпадают с экраном игры в тех же состояниях.
 */
import { gt, type GameGuideData, type GuideText } from '../guide';
import {
  ANIMATION_DELAY_MS,
  BALL_FACTOR_SLOWEST,
  BALL_FACTOR_STEP,
  BRICK_SCORE,
  FIRST_LEVEL_MS,
  INTRO_TICKS,
  KICK_TICKS,
  MODE_COUNT,
  SCORES_TO_EXTRA_LIFE,
  SHIFT_TICKS,
  START_LIVES,
  TENTH_LEVEL_MS,
} from '../games/arkanoid';
import { BricksWall, PRELOADED_WALLS, WALL_WIDTH, generatedWallHeight } from '../games/arkanoid/wall';
import { BRICK_ROWS, BRICK_TICK_HZ, MAX_LEVEL } from '../types';

/** Самая большая платформа — четыре клетки (тип донора 3; множитель шага мяча у неё меньше всего). */
const MAX_PLATFORM_CELLS = 4;

/** Секунды из тактов: русская запись с запятой и английская с точкой (`90 тактов` -> `1,5` / `1.5`). */
const seconds = (ticks: number): GuideText => {
  const value = String(ticks / BRICK_TICK_HZ);
  return gt(value.replace('.', ','), value);
};
/** Дробный множитель с одним знаком: `0,6` / `0.6`. */
const factor = (value: number): GuideText => {
  const text = value.toFixed(1);
  return gt(text.replace('.', ','), text);
};

const introSeconds = seconds(INTRO_TICKS);
const shiftSeconds = seconds(SHIFT_TICKS);
const factorBig = factor(BALL_FACTOR_SLOWEST - (MAX_PLATFORM_CELLS - 1) * BALL_FACTOR_STEP); // платформа из 4 клеток
const factorSmall = factor(BALL_FACTOR_SLOWEST); // платформа из 1 клетки
/** Бонус к счёту вместо добавочной жизни при полных жизнях (`GameWithLives.setScore`: десятая часть порога). */
const FULL_LIVES_BONUS = SCORES_TO_EXTRA_LIFE / 10;
/** Удар по мячу зажатой кнопкой: раз в `KICK_TICKS` тактов. */
const KICKS_PER_SECOND = BRICK_TICK_HZ / KICK_TICKS;

/** Кирпичей в готовых стенах по уровням — счётчик самой стены. */
const PRESET_BRICKS = Array.from({ length: MAX_LEVEL }, (_, index) => BricksWall.preloaded(index + 1).remaining);
const MIN_PRESET_BRICKS = Math.min(...PRESET_BRICKS);
const MAX_PRESET_BRICKS = Math.max(...PRESET_BRICKS);
/** Высота случайной стены на первом и на последнем уровне. */
const MIN_RANDOM_HEIGHT = generatedWallHeight(1);
const MAX_RANDOM_HEIGHT = generatedWallHeight(MAX_LEVEL);

const BLANK = '.'.repeat(WALL_WIDTH);
const blanks = (count: number): string[] => Array.from({ length: count }, () => BLANK);
/** Готовая стена уровня 1, как она лежит в игре (первая строка — верхний ряд). */
const WALL_1: readonly string[] = PRELOADED_WALLS[0] ?? [];
const BALL_START = '....#.....';
const PADDLE_4 = '...####...';

/** Вариант 01 (платформа 4, готовые стены) в начале уровня 1: стена прижата к верху, мяч над платформой — целое поле. */
const START_FIELD: readonly string[] = [...WALL_1, ...blanks(BRICK_ROWS - WALL_1.length - 2), BALL_START, PADDLE_4];

/** Двухсторонний вариант 09: платформы внизу и вверху, стена по центру поля — целое поле. */
const DOUBLE_TOP_GAP = Math.floor((BRICK_ROWS - WALL_1.length) / 2) - 1;
const DOUBLE_FIELD: readonly string[] = [
  PADDLE_4,
  ...blanks(DOUBLE_TOP_GAP),
  ...WALL_1,
  ...blanks(BRICK_ROWS - 3 - DOUBLE_TOP_GAP - WALL_1.length), // 3 = верхняя платформа, мяч и нижняя платформа
  BALL_START,
  PADDLE_4,
];

export const ARKANOID_GUIDE: GameGuideData = {
  summary: gt(
    `Мяч летит по диагонали и выбивает кирпичи стены, платформа внизу его отбивает. ${MODE_COUNT} варианта: платформа 1–4 клетки, готовая или случайная стена, едущая стена, вторая платформа сверху.`,
    `The ball flies diagonally and knocks out the wall's bricks; a paddle at the bottom bounces it back. ${MODE_COUNT} variants: paddle of 1–4 cells, preset or random wall, shifting wall, second paddle on top.`,
  ),
  goal: gt('Выбить все кирпичи стены, не упустив мяч мимо платформы.', 'Knock out every brick without letting the ball get past the paddle.'),
  rules: [
    gt(
      'Мяч — одна клетка. Летит строго по диагонали (угол всегда 45°), отскакивает от боковых стен поля и от верха.',
      'The ball is one cell and flies strictly diagonally (always 45°); it bounces off the side walls and the top of the field.',
    ),
    gt(
      'Платформа разворачивает мяч вверх, от места удара угол не зависит. Мяч, лежащий на платформе, едет вместе с ней — так его и направляют.',
      'The paddle turns the ball upward; the hit position never changes the angle. A ball resting on the paddle moves with it: that is how you steer.',
    ),
    gt(
      'Задев кирпич гранью или углом, мяч выбивает его и отскакивает; в проёме между кирпичами выбивает сразу два.',
      'Touching a brick with a side or a corner, the ball breaks it and bounces; in a gap between bricks it breaks two at once.',
    ),
    gt(
      'Мяч ушёл мимо платформы — взрыв и минус жизнь. Поле очищается, уровень начинается заново с оставшимися кирпичами.',
      'The ball got past the paddle: an explosion and a life lost. The field is cleared and the level restarts with the remaining bricks.',
    ),
    gt(
      `Перед каждым стартом (и после потери мяча) ${introSeconds.ru} с мяч стоит на платформе и едет с ней, затем летит вверх-вправо.`,
      `Before every start (and after a lost ball) the ball rests on the paddle for ${introSeconds.en} s and moves with it, then flies up and to the right.`,
    ),
    gt(
      `Стена: «готовые» варианты — одна из ${PRELOADED_WALLS.length} стен по номеру уровня (${MIN_PRESET_BRICKS}–${MAX_PRESET_BRICKS} кирпичей); «случайные» — зеркальная слева направо, ${MIN_RANDOM_HEIGHT}–${MAX_RANDOM_HEIGHT} рядов.`,
      `Wall: "preset" variants use one of ${PRELOADED_WALLS.length} walls by level number (${MIN_PRESET_BRICKS}–${MAX_PRESET_BRICKS} bricks); "random" ones are mirrored left to right, ${MIN_RANDOM_HEIGHT}–${MAX_RANDOM_HEIGHT} rows.`,
    ),
    gt(
      `«Стена едет»: раз в ${shiftSeconds.ru} с стена сдвигается на клетку вправо по кругу, ушедшие за край кирпичи возвращаются слева.`,
      `"Shifting wall": every ${shiftSeconds.en} s the wall moves one cell to the right in a loop; bricks pushed off the edge come back on the left.`,
    ),
    gt(
      `«Две платформы» (внизу и вверху) едут вместе; мяч за любым краем — потеря жизни. Стена по центру, шаг мяча дольше на ${ANIMATION_DELAY_MS} мс.`,
      `"Two paddles" (bottom and top) move together; a ball past either edge costs a life. The wall sits mid-field and the ball step is ${ANIMATION_DELAY_MS} ms longer.`,
    ),
  ],
  controls: [
    { button: 'left', text: gt('Платформа влево; зажатая — едет (чем меньше платформа, тем медленнее).', 'Paddle left; held, it keeps going (the smaller the paddle, the slower).') },
    { button: 'right', text: gt('Платформа вправо; зажатая — едет (чем меньше платформа, тем медленнее).', 'Paddle right; held, it keeps going (the smaller the paddle, the slower).') },
    {
      button: 'rotate',
      text: gt(
        `«Удар»: лишний шаг мяча сразу; зажатая — ${KICKS_PER_SECOND} раз в секунду (после вступления).`,
        `"Kick": an extra ball step at once; held, ${KICKS_PER_SECOND} times a second (after the intro).`,
      ),
    },
  ],
  scoring: [
    { what: gt('Выбитый кирпич', 'A broken brick'), points: `+${BRICK_SCORE}` },
    { what: gt(`Каждые ${SCORES_TO_EXTRA_LIFE} очков — добавочная жизнь`, `Every ${SCORES_TO_EXTRA_LIFE} points: an extra life`), points: '+1 жизнь' },
    { what: gt(`То же при полных ${START_LIVES} жизнях — бонус к счёту`, `Same with all ${START_LIVES} lives full: a score bonus`), points: `+${FULL_LIVES_BONUS}` },
  ],
  facts: [
    { value: String(START_LIVES), label: gt('Жизни в начале партии', 'Lives at the start') },
    { value: String(SCORES_TO_EXTRA_LIFE), label: gt('Очков до добавочной жизни', 'Points per extra life') },
    { value: String(MODE_COUNT), label: gt('Вариантов игры', 'Game variants') },
    { value: `${MIN_PRESET_BRICKS}–${MAX_PRESET_BRICKS}`, label: gt('Кирпичей в готовых стенах', 'Bricks in preset walls') },
  ],
  progression: gt(
    `Шаг мяча — от ${FIRST_LEVEL_MS} мс (скорость 1) до ${TENTH_LEVEL_MS} мс (10); платформа 4 клетки ×${factorBig.ru}, 1 клетка ×${factorSmall.ru}. Уровень меняет стену; после ${MAX_LEVEL}-го снова 1-й, скорость +1.`,
    `The ball step runs from ${FIRST_LEVEL_MS} ms (speed 1) to ${TENTH_LEVEL_MS} ms (10); 4-cell paddle ×${factorBig.en}, 1-cell ×${factorSmall.en}. The level changes the wall; after level ${MAX_LEVEL} comes level 1 and speed +1.`,
  ),
  lives: gt(
    `${START_LIVES} жизни. Мяч упал — минус жизнь; выбитые кирпичи не возвращаются, счёт остаётся. Каждые ${SCORES_TO_EXTRA_LIFE} очков — жизнь (при полных ${START_LIVES} — +${FULL_LIVES_BONUS} очков). Жизней нет — конец игры.`,
    `${START_LIVES} lives. A lost ball costs one; broken bricks stay broken and the score is kept. Every ${SCORES_TO_EXTRA_LIFE} points adds a life (+${FULL_LIVES_BONUS} points if all ${START_LIVES} are full). No lives left: game over.`,
  ),
  schemes: [
    { cells: START_FIELD, caption: gt('Вариант 01, уровень 1: стена, мяч над платформой из 4 клеток', 'Variant 01, level 1: the wall and the ball on a 4-cell paddle') },
    {cells:[...blanks(4),'.########.','..######..','.########.','..######..','.########.',...blanks(9),'.#........','.####.....'], caption:gt('«Морской бой» F01: стартовая расстановка','Sea Battle F01: the opening layout')},
    { cells: DOUBLE_FIELD, caption: gt('Вариант 09: платформы внизу и вверху, стена по центру', 'Variant 09: paddles at the bottom and the top, wall mid-field') },
  ],
  assumptions: [
    gt('В «Морском бое» F01 на первом уровне: пять рядов 8/6/8/6/8 кирпичей ниже верхней границы, мяч и платформа слева — по фото оригинала.', 'Sea Battle F01, level one: five rows of 8/6/8/6/8 bricks below the top edge, with ball and paddle on the left, matching the original photo.'),

    gt(
      'Правила и числа — донора n0Live/BrickGame, а не прошивки Apollo: у настоящей игры они не измерены.',
      'Rules and numbers come from the n0Live/BrickGame donor, not from Apollo firmware: they are not measured on the real game.',
    ),
    gt(
      'Номера вариантов — типы донора 1–32, названия наши; что значат 32 режима Apollo, не установлено. Типы 33–64 (поле вверх ногами) не включены.',
      'Variant numbers are donor types 1–32 and the names are ours; what the 32 Apollo modes mean is not established. Types 33–64 (upside-down field) are left out.',
    ),
    gt(
      'Мяч всегда стартует вверх-вправо, стена едет вправо: направление «по часовой» взято у донора по умолчанию, выбора нет.',
      'The ball always starts up and to the right and the wall shifts right: the donor default "clockwise" is used, with no way to change it.',
    ),
  ],
};
