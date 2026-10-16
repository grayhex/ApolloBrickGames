/**
 * Полосы «Лягушки»: данные донора и построение случайной дороги (`FroggerGame.loadRoad`).
 * Дорога — восемь полос («трактов») по 16 клеток по кругу; на поле видны десять клеток окна, которое сдвигается
 * по полосе. Полосы лежат на чётных рядах донора 2, 4, …, 16 (счёт снизу), нечётные ряды между ними сплошные.
 * Код написан заново: правила, таблица и порядок вызовов ГСЧ — донорские, сам ГСЧ — наш seeded `Rng`.
 */
import type { Rng } from '../../rng';

/** Число полос (у донора `tracts.length`). */
export const LANE_COUNT = 8;
/** Длина кругового узора полосы (у донора `tracts[i].length`). */
export const LANE_LENGTH = 16;

/** Полоса: `true` — машина (горящая клетка), `false` — пусто. */
export type Lane = boolean[];

/** «Готовые» полосы донора (`tracts` в `loadRoad`), `#` — машина. Проверено построчным сравнением с исходником. */
const PRELOADED_LANES: readonly string[] = [
  '..##.....####...',
  '...##.....####..',
  '#....##.....####',
  '...#....##....##',
  '#....####....###',
  '###....####....#',
  '#....####....###',
  '##.....###.....#',
];

/** Встречные полосы готовой дороги: в конце и посередине (`tracts.length / 2 - 1` и `tracts.length - 1`). */
const PRELOADED_ONCOMING: readonly number[] = [LANE_COUNT / 2 - 1, LANE_COUNT - 1];

/** Свежая копия готовых полос. */
export function preloadedLanes(): Lane[] {
  return PRELOADED_LANES.map((row) => Array.from(row, (ch) => ch === '#'));
}

/**
 * Встречные полосы (те, что едут против остальных), если в варианте есть встречное движение.
 * Готовая дорога — фиксированные 3 и 7; случайная — от одной полосы на 1-м уровне до четырёх на 10-м
 * (`level / 3 + 1` разных полос, как у донора). Случайный выбор расходует ГСЧ и в вариантах без встречного движения
 * (у донора полосы выбираются всегда, а применяются только при `isRoadWithOncomingTraffic`).
 */
export function oncomingLanes(rng: Rng, level: number, preloaded: boolean): Set<number> {
  if (preloaded) return new Set(PRELOADED_ONCOMING);
  const chosen = new Set<number>();
  const count = Math.floor(level / 3) + 1;
  while (chosen.size < count) chosen.add(rng.int(LANE_COUNT));
  return chosen;
}

/**
 * Случайная дорога: восемь полос подряд, от стартовой к финишной.
 * Каждая полоса — круг из 16 клеток, который строится от случайной точки: пустой участок 3–4 клетки, затем машина 1–3 клетки,
 * дальше пустой участок 3–4 (но не вылезая за круг) и машина на остаток, не длиннее 4 (иначе 1–3), и так до конца круга.
 * Начало узора полосы (кроме двух первых) стоит над пустой клеткой предыдущей полосы — так дорогу можно пройти.
 */
export function randomLanes(rng: Rng): Lane[] {
  const lanes: Lane[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    lanes.push(randomLane(rng, i > 1 ? (lanes[i - 1] ?? null) : null));
  }
  return lanes;
}

function randomLane(rng: Rng, previous: Lane | null): Lane {
  const lane: Lane = new Array<boolean>(LANE_LENGTH).fill(false);
  let emptyLeft = rng.int(2) + 3;
  let fullLeft = rng.int(3) + 1;
  let start = rng.int(LANE_LENGTH);
  // «пока под начальной точкой машина» — у донора do/while без предела; предел здесь лишь страховка от зависания
  for (let attempt = 0; previous && previous[start] && attempt < 1000; attempt++) start = rng.int(LANE_LENGTH);

  for (let j = 0; j < LANE_LENGTH; j++) {
    const index = (start + j) % LANE_LENGTH;
    if (emptyLeft > 0) {
      lane[index] = false;
      emptyLeft--;
    } else if (fullLeft > 0) {
      lane[index] = true;
      fullLeft--;
    }
    if (emptyLeft === 0 && fullLeft === 0) {
      // обе части построены: новые длины; пустой участок не должен упереться в конец круга, на машину остаётся хотя бы клетка
      const remaining = LANE_LENGTH - j - 1;
      emptyLeft = rng.int(2) + 3;
      while (remaining <= emptyLeft) emptyLeft--;
      fullLeft = remaining - emptyLeft;
      if (fullLeft > 4) fullLeft = rng.int(3) + 1;
    }
  }
  return lane;
}

/** Остаток по модулю 16, всегда неотрицательный. */
export const wrapLane = (offset: number): number => ((offset % LANE_LENGTH) + LANE_LENGTH) % LANE_LENGTH;
