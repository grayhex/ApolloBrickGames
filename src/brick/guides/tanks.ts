/**
 * Описание игры 1 «Танки» (`id: 'tank'`) для левой панели — по факту реализации (`games/tanks.ts`, `docs/brick/tanks.md`).
 * Числа не вписаны руками, а берутся из констант игры; схемы-рисунки сверяются с настоящим экраном игры в `tests/brick/games/tanks.guide.test.ts`.
 */
import { gt, type GameGuideData, type GuideText } from '../guide';
import {
  BULLET_TICKS,
  DONOR_TYPES,
  FIRE_TICKS,
  KILLS_TO_NEXT_LEVEL,
  MOVE_TICKS,
  PLAYER_BULLET_LIMIT,
  POINTS_PER_KILL,
  ROTATE_TICKS,
  SCORES_TO_EXTRA_LIFE,
  SPEED_FIRST_MS,
  SPEED_TENTH_MS,
  START_LIVES,
  START_TICKS,
  tanksRules,
} from '../games/tanks';
import { ENEMY_KIND, PLAYER_KIND, TANK_SIZE, UP, tankMask } from '../games/tanks/geometry';
import { BRICK_TICK_HZ, MAX_LEVEL, MAX_SPEED } from '../types';

/** Секунды из тактов, с точностью до сотых (`0.23`); в русском тексте точка заменяется запятой в `ru`. */
const seconds = (ticks: number): number => Math.round((ticks / BRICK_TICK_HZ) * 100) / 100;
/** Русская запись десятичной дроби: `1.5` -> `1,5`. */
const comma = (text: string): string => text.replace(/(\d)\.(\d)/g, '$1,$2');
/** Строка на двух языках; в русской части дроби пишутся через запятую. */
const tx = (ru: string, en: string): GuideText => gt(comma(ru), en);

const PLAYER_CELLS = tankMask(PLAYER_KIND, UP).cells.length;
const ENEMY_CELLS = tankMask(ENEMY_KIND, UP).cells.length;
/** Врагов по пяти вариантам меню. */
const ENEMIES = DONOR_TYPES.map((type) => tanksRules(type).enemies);
const MIN_ENEMIES = Math.min(...ENEMIES);
const MAX_ENEMIES = Math.max(...ENEMIES);
/** Бонус при полных жизнях: десятая часть очков на добавочную жизнь (правило основы `BrickBase.setScore`). */
const FULL_LIVES_BONUS = Math.floor(SCORES_TO_EXTRA_LIFE / 10);
/** Шанс «выстрела с порога» у нового врага: 1 из `10 + 11 − уровень` (от 20 на уровне 1 до 11 на уровне 10). */
const BORN_SHOT_FIRST = 10 + 11 - 1;
const BORN_SHOT_LAST = 10 + 11 - MAX_LEVEL;

export const TANKS_GUIDE: GameGuideData = {
  summary: tx(
    `Танк игрока (${PLAYER_CELLS} клеток) против вражеских танков (${ENEMY_CELLS} клеток): они по очереди появляются по краям поля, едут к игроку и стреляют. Снаряд — одна клетка; он стирает клетку препятствия.`,
    `The player's tank (${PLAYER_CELLS} cells) against enemy tanks (${ENEMY_CELLS} cells): they appear one by one around the field, drive towards the player and shoot. A shell is one cell and wipes out one obstacle cell.`,
  ),
  goal: tx(
    `Уничтожить ${KILLS_TO_NEXT_LEVEL} вражеских танков на уровне и не потерять все ${START_LIVES} жизни.`,
    `Destroy ${KILLS_TO_NEXT_LEVEL} enemy tanks per level without losing all ${START_LIVES} lives.`,
  ),
  rules: [
    tx(
      `Танки, препятствия и край поля непроходимы. Попадание считается по клеткам рисунка танка, а не по его квадрату ${TANK_SIZE}×${TANK_SIZE}.`,
      `Tanks, obstacles and the field edge are solid. Hits are checked against the tank's drawn cells, not its ${TANK_SIZE}×${TANK_SIZE} square.`,
    ),
    tx(
      `Враги появляются по одному в углах и на серединах боковых краёв; на поле их ${MIN_ENEMIES}–${MAX_ENEMIES} (по варианту), новые идут, пока убитых и стоящих меньше ${KILLS_TO_NEXT_LEVEL}.`,
      `Enemies enter one at a time in corners and mid-sides, ${MIN_ENEMIES}–${MAX_ENEMIES} on the field (by variant); new ones come while kills plus those standing are under ${KILLS_TO_NEXT_LEVEL}.`,
    ),
    tx(
      'За раз ходит один враг: едет к игроку и стреляет вдоль большей разницы координат; чем ближе игрок, тем чаще выстрелы.',
      'One enemy acts at a time: it drives towards the player and shoots along the larger coordinate gap; the closer the player, the more often it fires.',
    ),
    tx(
      `Игрок стреляет вперёд: до ${PLAYER_BULLET_LIMIT} снарядов в полёте, не чаще раза в ${seconds(FIRE_TICKS)} с; снаряд проходит клетку за ${seconds(BULLET_TICKS)} с.`,
      `The player shoots forward: up to ${PLAYER_BULLET_LIMIT} shells in flight, at most one shot per ${seconds(FIRE_TICKS)} s; a shell crosses a cell in ${seconds(BULLET_TICKS)} s.`,
    ),
    tx(
      'Снаряд стирает одну клетку препятствия и пропадает. Снаряды врага и игрока гасят друг друга; враги друг друга не бьют.',
      'A shell wipes out one obstacle cell and vanishes. Enemy and player shells cancel each other; enemies never hit each other.',
    ),
    tx(
      'Препятствия — с уровня 2: в вариантах «готовые поля» они берутся из таблицы уровней, в «случайных» ставятся случайно (на уровне N — до N−1).',
      'Obstacles start at level 2: "preset fields" variants use a table of levels, "random fields" place them randomly (up to N−1 on level N).',
    ),
    tx(
      `Перед каждым уровнем и после потери жизни — пауза ${seconds(START_TICKS)} с: ввод не принимается, врагов на поле нет.`,
      `Before each level and after losing a life there is a ${seconds(START_TICKS)} s pause: input is ignored and no enemies are on the field.`,
    ),
    tx(
      `Чем выше уровень, тем чаще новый враг стреляет сразу при появлении: от 1 из ${BORN_SHOT_FIRST} на уровне 1 до 1 из ${BORN_SHOT_LAST} на ${MAX_LEVEL}-м.`,
      `The higher the level, the more often a new enemy fires at once on arrival: from 1 in ${BORN_SHOT_FIRST} at level 1 to 1 in ${BORN_SHOT_LAST} at level ${MAX_LEVEL}.`,
    ),
  ],
  controls: [
    {
      button: 'left',
      text: tx(
        `Влево: поворот, затем шаги (удержание: шаг раз в ${seconds(MOVE_TICKS)} с, после поворота — ${seconds(ROTATE_TICKS)} с)`,
        `Left: turn, then steps (held: a step every ${seconds(MOVE_TICKS)} s, ${seconds(ROTATE_TICKS)} s after a turn)`,
      ),
    },
    {
      button: 'right',
      text: tx('Вправо: если танк смотрит не вправо — поворот, иначе шаг вперёд', 'Right: turns the tank if it faces elsewhere, otherwise a step forward'),
    },
    {
      button: 'up',
      text: tx('Вверх: если танк смотрит не вверх — поворот, иначе шаг вперёд', 'Up: turns the tank if it faces elsewhere, otherwise a step forward'),
    },
    {
      button: 'down',
      text: tx('Вниз: если танк смотрит не вниз — поворот, иначе шаг вперёд', 'Down: turns the tank if it faces elsewhere, otherwise a step forward'),
    },
    {
      button: 'rotate',
      text: tx(
        `Огонь вперёд, удержание — автоогонь; шаг вперёд откладывает выстрел на ${seconds(FIRE_TICKS)} с`,
        `Fire forward, held for auto-fire; a step forward delays the next shot by ${seconds(FIRE_TICKS)} s`,
      ),
    },
  ],
  scoring: [
    { what: gt('Уничтоженный вражеский танк', 'Destroyed enemy tank'), points: `+${POINTS_PER_KILL}` },
    { what: gt('Стёртая клетка препятствия, победа в уровне', 'Wiped obstacle cell, clearing a level'), points: '0' },
  ],
  facts: [
    { value: String(START_LIVES), label: gt('Жизней в начале партии', 'Lives at start') },
    { value: String(KILLS_TO_NEXT_LEVEL), label: gt('Врагов до победы в уровне', 'Kills to clear a level') },
    { value: `${MIN_ENEMIES}–${MAX_ENEMIES}`, label: gt('Врагов на поле (по варианту)', 'Enemies on field (by variant)') },
    { value: String(SCORES_TO_EXTRA_LIFE), label: gt('Очков до добавочной жизни', 'Points per extra life') },
  ],
  progression: tx(
    `${KILLS_TO_NEXT_LEVEL} убитых — уровень выше, счёт убитых заново; после ${MAX_LEVEL}-го снова 1-й, скорость +1. Темп врагов: ход раз в ${SPEED_FIRST_MS / 1000} с на скорости 1 и в ${SPEED_TENTH_MS / 1000} с на ${MAX_SPEED}-й.`,
    `${KILLS_TO_NEXT_LEVEL} kills — next level, kill count restarts; after level ${MAX_LEVEL} back to 1 with speed +1. Enemy pace: a move every ${SPEED_FIRST_MS / 1000} s at speed 1 and ${SPEED_TENTH_MS / 1000} s at speed ${MAX_SPEED}.`,
  ),
  lives: tx(
    `${START_LIVES} жизни. Вражеский снаряд в танке — взрыв, минус жизнь, уровень заново (убитые остаются). Добавочная жизнь за каждые ${SCORES_TO_EXTRA_LIFE} очков, при ${START_LIVES} жизнях — +${FULL_LIVES_BONUS} очков.`,
    `${START_LIVES} lives. An enemy shell hit means an explosion, minus a life and a level restart (kills are kept). An extra life every ${SCORES_TO_EXTRA_LIFE} points; at ${START_LIVES} lives, +${FULL_LIVES_BONUS} points instead.`,
  ),
  schemes: [
    {
      cells: ['.#..#.#', '###.###', '###..#.'],
      caption: gt(
        'Танк игрока (7 клеток, слева) и вражеский (6, справа): позади центра пусто',
        'Player tank (7 cells, left) and enemy (6, right): empty cell behind the centre',
      ),
    },
    {
      cells: ['........##', '........##', '....#...##', '...###....', '...###....', '..........', '.#.....#..', '.##...##..'],
      caption: gt(
        'Уровень 2 в вариантах «готовые поля» (фрагмент) и танк игрока на старте',
        'Level 2 of the "preset fields" variants (excerpt) with the player tank at start',
      ),
    },
    {
      cells: ['.#.', '...', '.#.', '...', '.#.', '...', '.#.', '.#.', '###', '###'],
      caption: gt(
        'Четыре снаряда игрока в полёте идут через клетку один за другим',
        'Four player shells in flight, every other cell apart',
      ),
    },
  ],
  assumptions: [
    gt(
      'Пять вариантов из восьми донорских (3, 4, 6 врагов с готовыми полями; 3 и 6 со случайными) выбраны нами: смысл вариантов устройства не установлен.',
      'Five of the donor\'s eight variants (3, 4, 6 enemies on preset fields; 3 and 6 on random ones) are our pick; what the device\'s variants are is not established.',
    ),
    gt(
      'Правила, числа и рисунки танков — донора n0Live/BrickGame, а не прошивки Apollo; есть ли на устройстве база, стены или босс, не установлено.',
      'Rules, numbers and tank shapes come from the n0Live/BrickGame donor, not Apollo firmware; whether the device has a base, walls or a boss is not established.',
    ),
    gt(
      'Во время паузы перед уровнем ввод не принимается совсем (у донора танк уже можно двигать); ROTATE и «огонь» стреляют одинаково.',
      'During the pause before a level input is ignored entirely (the donor lets the tank move already); ROTATE and "fire" both shoot.',
    ),
  ],
};
