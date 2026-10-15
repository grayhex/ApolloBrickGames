import {
  FIELD_COLUMNS,
  FIELD_ROWS,
  NEUTRAL_TETRIS_INPUT,
  TetrisGame,
  makeTetrisInput,
  type PieceKind,
  type TetrisAction,
  type TetrisEvent,
  type TetrisInput,
  type TetrisOptions,
} from '../../src/tetris';

/** Ввод одного такта: нажатые кнопки считаются и зажатыми. */
export const press = (...actions: TetrisAction[]): TetrisInput => makeTetrisInput(actions);

/** Кнопки только зажаты (фронта нет). */
export const hold = (...actions: TetrisAction[]): TetrisInput => makeTetrisInput([], actions);

/** Прогнать `count` тактов с одним и тем же вводом, вернуть все события подряд. */
export function run(game: TetrisGame, count: number, input: TetrisInput = NEUTRAL_TETRIS_INPUT): TetrisEvent[] {
  const events: TetrisEvent[] = [];
  for (let i = 0; i < count; i++) events.push(...game.step(input));
  return events;
}

/** Партия, уже запущенная кнопкой «старт»; по умолчанию с фиксированным зерном. */
export function startedGame(options: TetrisOptions = {}): TetrisGame {
  const game = new TetrisGame({ seed: 7, ...options });
  game.start();
  return game;
}

/** Поставить падающую фигуру в нужное место (внутри теста — без учёта правил появления). */
export function place(game: TetrisGame, kind: PieceKind, rotation: number, x: number, y: number): void {
  game.piece = { kind, rotation, x, y };
}

/**
 * Нарисовать низ поля: строки задаются сверху вниз и прижимаются к нижнему краю.
 * `.` — пусто, `#` — клетка вида 1, цифра — клетка с этим значением.
 */
export function paint(game: TetrisGame, art: readonly string[]): void {
  art.forEach((line, index) => {
    if (line.length !== FIELD_COLUMNS) throw new Error(`строка рисунка «${line}» не ${FIELD_COLUMNS} символов`);
    const y = FIELD_ROWS - art.length + index;
    for (let x = 0; x < FIELD_COLUMNS; x++) {
      const ch = line.charAt(x);
      game.field[y * FIELD_COLUMNS + x] = ch === '.' ? 0 : ch === '#' ? 1 : Number(ch);
    }
  });
}

/** Поле (или снимок) как массив строк по 10 символов: `.` — пусто, иначе цифра значения. */
export function rowsOf(cells: Uint8Array): string[] {
  const rows: string[] = [];
  for (let y = 0; y < FIELD_ROWS; y++) {
    let row = '';
    for (let x = 0; x < FIELD_COLUMNS; x++) {
      const value = cells[y * FIELD_COLUMNS + x] ?? 0;
      row += value === 0 ? '.' : String(value);
    }
    rows.push(row);
  }
  return rows;
}

/** Нижние `count` строк поля. */
export function bottomRows(cells: Uint8Array, count: number): string[] {
  return rowsOf(cells).slice(FIELD_ROWS - count);
}

/** Число занятых клеток. */
export function filledCount(cells: Uint8Array): number {
  let n = 0;
  for (const value of cells) if (value !== 0) n++;
  return n;
}

/** Типы событий подряд — для сравнения порядка. */
export const typesOf = (events: readonly TetrisEvent[]): string[] => events.map((event) => event.type);

/** Жёстко сбросить текущую фигуру. */
export function hardDrop(game: TetrisGame): TetrisEvent[] {
  return game.step(press('drop'));
}
