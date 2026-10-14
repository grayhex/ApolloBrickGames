import type { CellPos } from '../content/schema';

/**
 * Бегущая надпись «GAME OVER» из блоков — как на раскадровке оригинала (docs/video-observations.md, 288–326 с):
 * буквы 3 × 5 клеток выложены теми же блоками, что и поле, одна пустая колонка между буквами, надпись плывёт справа налево
 * примерно на 6 колонок в секунду (≈3 такта на колонку при 20 тактах/с) и повторяется. Чистые вычисления: без DOM и часов.
 *
 * Начертания букв сняты с кадров: у «M» перемычка идёт на двух средних рядах, у «G» нет левой «ножки» посередине.
 */
export const BANNER_TEXT = 'GAME OVER';
/** Высота букв в клетках и такты на сдвиг на одну колонку. */
export const BANNER_ROWS = 5;
export const BANNER_COLUMN_TICKS = 3;
/** Пустых колонок между буквами и между словами. */
const LETTER_GAP = 1;
const WORD_GAP = 3;

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  G: ['XXX', 'X..', 'X..', 'X.X', 'XXX'],
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  M: ['X.X', 'X.X', 'XXX', 'XXX', 'X.X'],
  E: ['XXX', 'X..', 'XXX', 'X..', 'XXX'],
  O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
};

/** Битовая карта текста: `columns[x][y]` — клетка заполнена. Неизвестные символы и пробел дают пустой промежуток. */
export function bannerBitmap(text: string = BANNER_TEXT): boolean[][] {
  const columns: boolean[][] = [];
  const blank = (): boolean[] => Array.from({ length: BANNER_ROWS }, () => false);
  let first = true;
  for (const char of text) {
    const glyph = GLYPHS[char];
    if (!glyph) {
      for (let i = 0; i < WORD_GAP - LETTER_GAP; i++) columns.push(blank());
      continue;
    }
    if (!first) for (let i = 0; i < LETTER_GAP; i++) columns.push(blank());
    first = false;
    for (let x = 0; x < 3; x++) columns.push(glyph.map((row) => row[x] === 'X'));
  }
  return columns;
}

/** Ширина надписи в колонках. */
export function bannerWidth(text: string = BANNER_TEXT): number {
  return bannerBitmap(text).length;
}

/** Сколько тактов длится один проход: надпись целиком проплывает через экран шириной `columns`. */
export function bannerLoopTicks(columns: number, text: string = BANNER_TEXT): number {
  return (columns + bannerWidth(text)) * BANNER_COLUMN_TICKS;
}

/**
 * Заполненные клетки экрана на такте `dt` после начала надписи (отрицательный — пусто).
 * Надпись входит у правого края, уходит за левый и сразу начинает новый проход.
 */
export function bannerCells(dt: number, viewport: { columns: number; rows: number }, text: string = BANNER_TEXT): CellPos[] {
  if (dt < 0) return [];
  const bitmap = bannerBitmap(text);
  const loop = (viewport.columns + bitmap.length) * BANNER_COLUMN_TICKS;
  const shift = Math.floor((dt % loop) / BANNER_COLUMN_TICKS);
  const cells: CellPos[] = [];
  bitmap.forEach((column, index) => {
    const x = viewport.columns - shift + index;
    if (x < 0 || x >= viewport.columns) return;
    column.forEach((lit, y) => {
      if (lit && y < viewport.rows) cells.push({ x, y });
    });
  });
  return cells;
}
