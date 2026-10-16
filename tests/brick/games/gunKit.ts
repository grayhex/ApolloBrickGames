/**
 * Общие помощники тестов игр с пушкой («Стройка» и «Стрельба по фигурам»): шаги без ввода, нажатия, снимки поля.
 * Поле пушки — донорская система координат: x слева направо, y = 0 — ряд пушки, верх — ряд 19 (в обычном виде строка экрана = 19 - y).
 */
import {
  BRICK_COLS,
  BRICK_ROWS,
  NEUTRAL_BRICK_INPUT,
  makeBrickInput,
  msToTicks,
  type BrickAction,
  type BrickEvent,
  type BrickGame,
  type BrickInput,
} from '../../../src/brick';

/** «Мелодия» перед уровнем: столько тактов игра не принимает ввод. */
export const INTRO = msToTicks(1500);
/** Сколько тактов длится взрыв потери жизни (4 прохода по 7 волн по 4 такта) и очистка поля после неё. */
export const KABOOM = 4 * 7 * 4;
export const CLEAR_LOSE = 72;
export const CLEAR_WIN = 314;

/** Один такт без ввода; возвращает события. */
export const idle = (game: BrickGame, ticks = 1): BrickEvent[] => run(game, ticks, () => NEUTRAL_BRICK_INPUT);

/** Такты с одним и тем же вводом, который задаёт функция от номера такта; события всех тактов подряд. */
export function run(game: BrickGame, ticks: number, input: (tick: number) => BrickInput): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let tick = 0; tick < ticks; tick++) events.push(...game.step(input(tick)));
  return events;
}

/** Нажатие кнопки на один такт (фронт и зажатие), затем `after` тактов тишины. */
export function tap(game: BrickGame, action: BrickAction | BrickAction[], after = 0): BrickEvent[] {
  const actions = Array.isArray(action) ? action : [action];
  const events = game.step(makeBrickInput(actions));
  events.push(...idle(game, after));
  return events;
}

/** Кнопки зажаты `ticks` тактов подряд: в первом такте — фронт нажатия, дальше — только зажатие. */
export function hold(game: BrickGame, action: BrickAction | BrickAction[], ticks: number): BrickEvent[] {
  const actions = Array.isArray(action) ? action : [action];
  return run(game, ticks, (tick) => (tick === 0 ? makeBrickInput(actions) : makeBrickInput([], actions)));
}

/** Пройти «мелодию» перед уровнем. */
export const skipIntro = (game: BrickGame): void => {
  idle(game, INTRO);
};

export const types = (events: readonly BrickEvent[]): string[] => events.map((event) => event.type);

/** Клетка экрана (x, строка экрана y). */
export const at = (cells: Uint8Array, x: number, y: number): number => cells[y * BRICK_COLS + x] ?? 0;

/** Поле строками для сообщений об ошибках: `.` пусто, `#` горит, `*` мигает. */
export function show(cells: Uint8Array): string {
  const rows: string[] = [];
  for (let y = 0; y < BRICK_ROWS; y++) {
    rows.push([...cells.slice(y * BRICK_COLS, (y + 1) * BRICK_COLS)].map((value) => '.#*'[value] ?? '?').join(''));
  }
  return rows.join('\n');
}

/** Строки экрана, в которых есть горящие клетки, по порядку сверху вниз. */
export function litRows(cells: Uint8Array): number[] {
  const rows: number[] = [];
  for (let y = 0; y < BRICK_ROWS; y++) {
    for (let x = 0; x < BRICK_COLS; x++) {
      if (at(cells, x, y) === 1) {
        rows.push(y);
        break;
      }
    }
  }
  return rows;
}

/** Сколько клеток в строке экрана y с заданным значением (по умолчанию горят). */
export function rowCells(cells: Uint8Array, y: number, value = 1): number {
  let count = 0;
  for (let x = 0; x < BRICK_COLS; x++) if (at(cells, x, y) === value) count++;
  return count;
}

/** Поле, отражённое по вертикали (строка 0 <-> 19). */
export function flipped(cells: Uint8Array): Uint8Array {
  const out = new Uint8Array(cells.length);
  for (let y = 0; y < BRICK_ROWS; y++) {
    out.set(cells.subarray(y * BRICK_COLS, (y + 1) * BRICK_COLS), (BRICK_ROWS - 1 - y) * BRICK_COLS);
  }
  return out;
}

/** Строки поля как картинка: `rows[0]` — верхняя строка экрана; допускает `.`, `#`, `*`. */
export function cellsOf(rows: readonly string[]): Uint8Array {
  const out = new Uint8Array(BRICK_COLS * BRICK_ROWS);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) out[y * BRICK_COLS + x] = row[x] === '#' ? 1 : row[x] === '*' ? 2 : 0;
  });
  return out;
}
