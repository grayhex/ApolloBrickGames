/**
 * Описание игры 4 «Гонки со стрельбой» (`racing-shooting`) по коду `games/racing/shoot.ts` и документу `docs/brick/racing.md`.
 * У донора гонок со стрельбой нет: дорога — как в игре 3 (`RacingGame`, MIT), всё оружие построено нами по описанию владельца другого Brick Game
 * (MT1997) и образцу `GameWithGun`, поэтому почти всё в этой игре — допущение (числа берутся из констант игры).
 */
import { MAX_LIVES } from '../base';
import { gt, secondsText, type GameGuideData } from '../guide';
import { racingShootDef } from '../games/racing';
import { LEVELUP_POINT, SCORES_TO_EXTRA_LIFE } from '../games/racing/base';
import { AMMO_PER_PEDESTRIAN, FIRE_COOLDOWN_TICKS, MAX_AMMO, PEDESTRIAN_ONE_IN } from '../games/racing/shoot';

const COOLDOWN = secondsText(FIRE_COOLDOWN_TICKS);

export const RACING_SHOOT_GUIDE: GameGuideData = {
  summary: gt(
    'Те же гонки, но на дороге появляются пешеходы: сбитый пешеход даёт патроны, а пули уничтожают встречные машины.',
    'The same race, but pedestrians appear on the road: a pedestrian you hit gives ammo, and bullets destroy oncoming cars.',
  ),
  goal: gt('Не врезаться, добывать патроны у пешеходов и расстреливать встречные машины.', 'Avoid crashes, collect ammo from pedestrians and shoot oncoming cars.'),
  rules: [
    gt(
      `Пешеход — мигающая клетка в свободной полосе; он появляется примерно у каждой ${PEDESTRIAN_ONE_IN}-й группы машин.`,
      `A pedestrian is a blinking cell in a free lane; one shows up with roughly every ${PEDESTRIAN_ONE_IN}rd group of cars.`,
    ),
    gt(
      `Наехать на пешехода безопасно: он сбит, и машина получает ${AMMO_PER_PEDESTRIAN} патрона (в запасе не больше ${MAX_AMMO}); нос машины мигает, пока патроны есть.`,
      `Hitting a pedestrian is safe: it is knocked down and the car gets ${AMMO_PER_PEDESTRIAN} rounds (at most ${MAX_AMMO} in stock); the car nose blinks while you have ammo.`,
    ),
    gt(
      'Пуля летит вперёд по колонке машины и целиком уничтожает первую встречную машину; пешеходов пули не трогают.',
      "A bullet flies forward along the car's column and destroys the first oncoming car entirely; bullets ignore pedestrians.",
    ),
    gt(
      'Столкновение с машиной — авария, как в гонках; в начале партии, после аварии и на новом уровне патронов нет.',
      'Hitting a car is a crash, as in the race; there is no ammo at the start of a game, after a crash and on a new level.',
    ),
    gt(
      'Дорога, поток машин, очки и рост скорости — как в «Гонках»; в вариантах «вверх ногами» едем и стреляем вниз, ускоряет «вниз».',
      'The road, traffic, points and speed growth are as in the race; in the “upside down” variants you drive and shoot down, DOWN accelerates.',
    ),
  ],
  controls: [
    { button: 'left', text: gt('Перестроиться влево; удержание повторяет.', 'Change lane left; holding repeats.') },
    { button: 'right', text: gt('Перестроиться вправо; удержание повторяет.', 'Change lane right; holding repeats.') },
    { button: 'rotate', text: gt(`Огонь (не чаще раза в ${COOLDOWN.ru}); удержание — автоогонь.`, `Fire (at most once per ${COOLDOWN.en}); holding auto-fires.`) },
    { button: 'up', text: gt('Ускорение (в вариантах вверх ногами — «вниз»).', 'Acceleration (DOWN in the upside-down variants).') },
  ],
  scoring: [
    { what: gt('Встречная машина проехала мимо', 'An oncoming car passed by'), points: '+1' },
    { what: gt('Встречная машина сбита пулей', 'An oncoming car shot down'), points: '+1' },
  ],
  facts: [
    { value: String(AMMO_PER_PEDESTRIAN), label: gt('патрона за пешехода', 'rounds per pedestrian') },
    { value: String(MAX_AMMO), label: gt('патрона в запасе не больше', 'rounds in stock at most') },
    { value: String(MAX_LIVES), label: gt('жизни в начале', 'starting lives') },
    { value: String(racingShootDef.modes.length), label: gt('варианта дороги', 'road variants') },
  ],
  progression: gt(
    `Как в «Гонках»: каждые ${LEVELUP_POINT} очков скорость растёт на единицу, после десятой — снова первая и уровень выше.`,
    `As in the race: every ${LEVELUP_POINT} points the speed goes up one step; after the tenth it is speed 1 again and the level rises.`,
  ),
  lives: gt(
    `Четыре жизни. Добавочная — за каждые ${SCORES_TO_EXTRA_LIFE} очков; если жизней уже четыре, прибавляется 200 очков.`,
    `Four lives. An extra one for every ${SCORES_TO_EXTRA_LIFE} points; with four lives already, 200 bonus points are added instead.`,
  ),
  schemes: [
    {
      cells: ['.*.', '###', '.#.', '#.#'],
      caption: gt('Машина с патронами: нос мигает.', 'A car with ammo: the nose blinks.'),
    },
    {
      cells: ['..........', '..........', '#........#', '#..#..*..#', '#.###.*..#', '...#.###..', '..#.#.#...', '#....#.#.#'],
      caption: gt('Пуля (мигает) летит вперёд от носа машины; слева — встречная машина.', 'A bullet (blinking) flies ahead of the car nose; an oncoming car on the left.'),
    },
    {
      cells: ['...*.###..', '#.....#..#', '#....#.#.#', '#........#'],
      caption: gt('Пешеход (мигает) стоит в свободной полосе над машиной.', 'A pedestrian (blinking) stands in a free lane above a car.'),
    },
  ],
  assumptions: [
    gt(
      'У донора гонок со стрельбой нет: оружие построено по описанию владельца другого Brick Game (MT1997).',
      'The donor has no shooting race: the weapon is built from the description by the owner of another Brick Game (MT1997).',
    ),
    gt(
      `Пешеход, ${AMMO_PER_PEDESTRIAN} патрона, запас ${MAX_AMMO}, темп стрельбы и дальность пули — наши допущения; других препятствий MT1997 нет.`,
      `The pedestrian, ${AMMO_PER_PEDESTRIAN} rounds, the stock of ${MAX_AMMO}, the fire rate and bullet speed are our assumptions; the other MT1997 obstacles are absent.`,
    ),
  ],
};
