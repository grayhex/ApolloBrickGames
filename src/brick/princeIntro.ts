/**
 * Заставка Prince 皇太子 при включении. Владелец: играет «Финал» увертюры к «Вильгельму Теллю» (один раз), а внизу вверх поднимаются по одной цифры «9 9 9 9 in 1».
 * Допущение по раскладке: матрица 10 × 20 вмещает две крупные цифры в ряд, поэтому четыре девятки стоят в два ряда («99» над «99»), под ними — надпись «in 1» мелким шрифтом;
 * каждый элемент выезжает снизу и останавливается на своём месте, следующий начинает, когда предыдущий встал.
 */
import { BIG_DIGITS } from './menuArt';
import { blit, emptyField, type Sprite } from './grid';

/** Тактов на один ряд подъёма (12 рядов в секунду) и пауза между элементами. */
const STEP_TICKS = 5;
const GAP_TICKS = 15;

const NINE = BIG_DIGITS[9]!;
/** «in 1» мелкими буквами 3 × 5: `i` — одна колонка, `n`, пробел и `1` с флажком; ровно 10 колонок. */
const IN_ONE: Sprite = ['#.##....#.', '..#.#..##.', '#.#.#...#.', '#.#.#...#.', '#.#.#..###'];

interface Item {
  sprite: Sprite;
  x: number;
  y: number;
}

/** Конечные места элементов, в порядке появления: четыре девятки и «in 1». */
const ITEMS: readonly Item[] = [
  { sprite: NINE, x: 0, y: 0 },
  { sprite: NINE, x: 6, y: 0 },
  { sprite: NINE, x: 0, y: 7 },
  { sprite: NINE, x: 6, y: 7 },
  { sprite: IN_ONE, x: 0, y: 15 },
];

const ROWS = 20;
/** Начало движения каждого элемента, такты от включения. */
const STARTS: readonly number[] = ITEMS.reduce<number[]>((starts, _item, index) => {
  if (index === 0) return [0];
  const previous = ITEMS[index - 1]!;
  return [...starts, starts[index - 1]! + (ROWS - previous.y) * STEP_TICKS + GAP_TICKS];
}, []);

/** Такт, когда последний элемент встал на место (дальше картинка неподвижна). */
export const PRINCE_INTRO_BUILD_TICKS = STARTS[ITEMS.length - 1]! + (ROWS - ITEMS[ITEMS.length - 1]!.y) * STEP_TICKS;

/** Длительность заставки, такты: мелодия «Финала» (11,4 с) целиком плюс короткая пауза; потом начинается автоплей. */
export const PRINCE_INTRO_TICKS = 720;

/** Кадр заставки на такте `tick` от включения. */
export function princeIntroField(tick: number): Uint8Array {
  const out = emptyField();
  ITEMS.forEach((item, index) => {
    const elapsed = tick - STARTS[index]!;
    if (elapsed < 0) return;
    const y = Math.max(item.y, ROWS - Math.floor(elapsed / STEP_TICKS));
    blit(out, item.sprite, item.x, y);
  });
  return out;
}
