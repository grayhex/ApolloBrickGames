/**
 * Описание игры 3 «Гонки» (`racing`) по коду `games/racing/*` и документу `docs/brick/racing.md`: числа берутся из констант игры.
 * Правила донора n0Live/BrickGame (`RacingGame`, MIT); число и вид вариантов устройства не установлены.
 */
import { MAX_LIVES } from '../base';
import { gt, type GameGuideData } from '../guide';
import { racingDef } from '../games/racing';
import { LEVELUP_POINT, SCORES_TO_EXTRA_LIFE } from '../games/racing/base';
import { CAR_ROWS } from '../games/racing/road';

/** Рисунок машины на экране: нос вверху (в перевёрнутых вариантах — внизу). */
export const CAR_SCHEME: readonly string[] = ['.#.', '###', '.#.', '#.#'];

export const RACING_GUIDE: GameGuideData = {
  summary: gt(
    'Машина едет по дороге с двумя или тремя полосами навстречу потоку машин: нужно перестраиваться и не врезаться.',
    'A car drives along a road of two or three lanes into oncoming traffic: change lanes and avoid crashing.',
  ),
  goal: gt('Не врезаться во встречные машины и набрать как можно больше очков.', 'Avoid crashing into oncoming cars and score as many points as possible.'),
  rules: [
    gt(
      `Машина занимает ${CAR_ROWS[0]?.length ?? 3} клетки в ширину и ${CAR_ROWS.length} в высоту; встречные машины появляются над полем группами.`,
      `The car is ${CAR_ROWS[0]?.length ?? 3} cells wide and ${CAR_ROWS.length} high; oncoming cars appear above the field in groups.`,
    ),
    gt(
      'Столкновение — авария: взрыв, потеря жизни и новая дорога. Перестроение на полосу, где стоит машина, — тоже авария.',
      'A collision is a crash: an explosion, a lost life and a fresh road. Changing into a lane occupied by a car is a crash too.',
    ),
    gt(
      'На трёх полосах иногда сразу две машины в разных полосах или одна, перекрывающая две полосы (шанс 10 + уровень, %); дорога идёт в 1,5 раза медленнее.',
      'On three lanes there are sometimes two cars at once in different lanes, or one straddling two lanes (10 + level, %); the road runs 1.5 times slower.',
    ),
    gt(
      'Рамка дороги движется, показывая скорость: на двух полосах она с обеих сторон, на трёх — справа.',
      'The road border moves to show the speed: on two lanes it is on both sides, on three lanes on the right.',
    ),
    gt(
      'В вариантах «вверх ногами» поле перевёрнуто: машина вверху, едет «вниз», ускоряет «вниз».',
      'In the “upside down” variants the field is flipped: the car is at the top, drives “down” and accelerates with DOWN.',
    ),
  ],
  controls: [
    { button: 'left', text: gt('Перестроиться на соседнюю полосу влево; удержание повторяет.', 'Change to the next lane on the left; holding repeats.') },
    { button: 'right', text: gt('Перестроиться на соседнюю полосу вправо; удержание повторяет.', 'Change to the next lane on the right; holding repeats.') },
    { button: 'up', text: gt('Ускорение — лишние шаги дороги (в вариантах вверх ногами — «вниз»).', 'Acceleration — extra road steps (DOWN in the upside-down variants).') },
    { button: 'rotate', text: gt('То же ускорение.', 'The same acceleration.') },
  ],
  scoring: [{ what: gt('Встречная машина проехала мимо', 'An oncoming car passed by'), points: '+1' }],
  facts: [
    { value: String(racingDef.modes.length), label: gt('варианта дороги', 'road variants') },
    { value: String(MAX_LIVES), label: gt('жизни в начале', 'starting lives') },
    { value: String(LEVELUP_POINT), label: gt('очков на следующую скорость', 'points per speed step') },
    { value: String(SCORES_TO_EXTRA_LIFE), label: gt('очков до добавочной жизни', 'points per extra life') },
  ],
  progression: gt(
    `Каждые ${LEVELUP_POINT} очков скорость растёт на единицу; после десятой — снова первая и уровень выше (после десятого — первый): дорога быстрее, поток машин теснее.`,
    `Every ${LEVELUP_POINT} points the speed goes up one step; after the tenth it is speed 1 again and the level rises (after level 10, level 1): the road is faster and the traffic denser.`,
  ),
  lives: gt(
    `Четыре жизни. Добавочная — за каждые ${SCORES_TO_EXTRA_LIFE} очков; если жизней уже четыре, прибавляется 200 очков.`,
    `Four lives. An extra one for every ${SCORES_TO_EXTRA_LIFE} points; with four lives already, 200 bonus points are added instead.`,
  ),
  schemes: [
    {
      cells: CAR_SCHEME,
      caption: gt('Машина: 3 × 4 клетки.', 'The car: 3 × 4 cells.'),
    },
    {
      cells: ['#........#', '#..#.....#', '#.###....#', '...#......', '..#.#.....', '#........#', '#........#', '#........#', '..........', '..........', '#........#', '#.....#..#', '#....###.#', '......#...', '.....#.#..'],
      caption: gt('Дорога на две полосы: рамка по краям, встречная машина и машина игрока внизу.', 'A two-lane road: border, an oncoming car and the player car at the bottom.'),
    },
  ],
  assumptions: [
    gt(
      'Названия и номера вариантов условные: сколько их на устройстве и какие, не установлено; реализованы четыре схемы донора.',
      'Variant names and numbers are conventional: how many the device has and which is not established; four donor layouts are implemented.',
    ),
    gt(
      'Перестроение мгновенное (у донора — с анимацией); звуки выбраны нами.',
      'The lane change is instant (animated in the donor); the sounds are our choice.',
    ),
  ],
};
