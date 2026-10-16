/**
 * Варианты «Лягушки»: правила по номеру («типу») донора и список вариантов консоли.
 * У донора 32 типа; в консоль выведены типы 1–16 (все сочетания четырёх правил дороги), типы 17–32 — те же правила
 * с перевёрнутым полем — механика есть (`flip`), но в меню их нет. Соответствие номеров вариантам Apollo — допущение.
 */
import type { BrickModeDef } from '../../types';

/** Правила одного варианта (в терминах донора: `shiftRoadFromLeftToRigth`, `shiftRoadWithFrog`, `isRoadWithOncomingTraffic`, `usePreloadedTracts`, `setDrawInvertedBoard`). */
export interface FroggerRules {
  /** Прямые полосы едут слева направо (иначе справа налево). */
  readonly leftToRight: boolean;
  /** Дорога несёт лягушку: она сдвигается вместе со своей полосой. */
  readonly carry: boolean;
  /** Часть полос едет навстречу остальным. */
  readonly oncoming: boolean;
  /** Готовые полосы донора (иначе случайные). */
  readonly preloaded: boolean;
  /** Поле перевёрнуто: старт сверху, финиш снизу, кнопки «вверх» и «вниз» поменяны местами. */
  readonly flip: boolean;
}

/**
 * Правила по типу донора 1..32, формулы `FroggerGame` (конструктор). Единственное отступление — готовые полосы:
 * в коде донора `usePreloadedTracts = type <= 8 || type >= 16 && type <= 24`, а в javadoc типа 16 сказано «случайная дорога»
 * (и «16..24» дало бы типу 16 те же правила, что у типа 8). Допущение: берём javadoc — готовые полосы у 1–8 и 17–24.
 */
export function rulesOfDonorType(type: number): FroggerRules {
  const t = Math.trunc(type);
  const cycle8 = t % 8;
  return {
    leftToRight: t % 2 !== 0,
    carry: t % 4 === 1 || t % 4 === 2,
    oncoming: cycle8 === 5 || cycle8 === 6 || cycle8 === 7 || cycle8 === 0,
    preloaded: t <= 8 || (t >= 17 && t <= 24),
    flip: t > 16,
  };
}

/** Какие типы донора выведены в консоль: вариант с индексом i — тип `DONOR_TYPES[i]`. */
export const DONOR_TYPES: readonly number[] = Array.from({ length: 16 }, (_, index) => index + 1);

function describe(type: number): BrickModeDef {
  const rules = rulesOfDonorType(type);
  const arrow = rules.leftToRight ? '→' : '←';
  const ruRoad = rules.preloaded ? 'Готовые полосы' : 'Случайные полосы';
  const enRoad = rules.preloaded ? 'Fixed lanes' : 'Random lanes';
  const name = {
    ru: `${ruRoad} ${arrow}${rules.carry ? ' + перенос' : ''}${rules.oncoming ? ' + встречные' : ''}`,
    en: `${enRoad} ${arrow}${rules.carry ? ' + carry' : ''}${rules.oncoming ? ' + oncoming' : ''}`,
  };
  const parts = [
    `Тип ${type} донора (FroggerGame): ${rules.preloaded ? 'готовые восемь полос' : 'случайные полосы, новые на каждую жизнь и уровень'}`,
    rules.leftToRight ? 'машины едут слева направо' : 'машины едут справа налево',
    rules.carry ? 'дорога несёт лягушку вместе с полосой' : 'лягушка стоит на месте, машины наезжают на неё',
    rules.oncoming
      ? `часть полос едет навстречу (${rules.preloaded ? 'две фиксированные' : 'от одной на 1-м уровне до четырёх на 10-м'})`
      : 'все полосы едут в одну сторону',
  ];
  let note = `${parts.join('; ')}. Соответствие номеру варианта Apollo — допущение.`;
  if (type === 16) {
    note += ' Допущение: по javadoc донора полосы случайные; в коде донора тип 16 по ошибке брал бы готовые полосы и совпал бы с типом 8.';
  }
  return { name, note };
}

/** Варианты, выведенные в консоль (номер на экране — индекс + 1). */
export const FROGGER_MODES: readonly BrickModeDef[] = DONOR_TYPES.map(describe);
