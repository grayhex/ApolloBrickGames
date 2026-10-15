import { describe, expect, it } from 'vitest';
import {
  CLEAR_TICKS,
  FIELD_COLUMNS,
  GRAVITY_TICKS,
  LINE_SCORES,
  MAX_SCORE,
  NEUTRAL_TETRIS_INPUT,
  type TetrisGame,
} from '../../src/tetris';
import { bottomRows, filledCount, hardDrop, hold, paint, place, press, rowsOf, run, startedGame, typesOf } from './helpers';

/** Очки за жёсткий сброс вертикальной I с самого верха до пола: 16 строк по 2. */
const DROP_SCORE = 32;

/** Нижние `rows` рядов забиты, кроме колонки 9; над ней висит вертикальная I (клетки в колонке 9). */
function wellSetup(game: TetrisGame, rows: number): void {
  paint(game, Array.from({ length: rows }, () => '#########.'));
  place(game, 'I', 1, 7, 0);
}

describe('очистка линий: счёт и события', () => {
  it('таблица очков за 1, 2, 3, 4 линии: 100, 300, 700, 1500', () => {
    expect([...LINE_SCORES]).toEqual([0, 100, 300, 700, 1500]);
    expect(CLEAR_TICKS).toBe(24);
  });

  it.each([
    [1, 100],
    [2, 300],
    [3, 700],
    [4, 1500],
  ] as const)('%i линий за ход: +%i очков, событие lines с номерами рядов, анимация запущена', (count, points) => {
    const game = startedGame();
    wellSetup(game, count);
    const events = hardDrop(game);
    const rows = Array.from({ length: count }, (_, i) => 20 - count + i);
    expect(events).toEqual([{ type: 'drop' }, { type: 'lock' }, { type: 'lines', count, rows }]);
    expect(game.score).toBe(points + DROP_SCORE);
    expect(game.lines).toBe(count);
    expect(game.clearRows).toEqual(rows);
    expect(game.clearTimer).toBe(CLEAR_TICKS);
    expect(game.piece).toBeNull();
  });

  it('ряды дальше мигают на поле целиком, а не исчезают сразу', () => {
    const game = startedGame();
    wellSetup(game, 2);
    hardDrop(game);
    expect(bottomRows(game.field, 2)).toEqual(['1111111111', '1111111111']);
    run(game, CLEAR_TICKS - 1);
    expect(bottomRows(game.field, 2)).toEqual(['1111111111', '1111111111']);
  });

  it('линии, собранные фигурой, упавшей по тактовому падению (без жёсткого сброса), тоже считаются', () => {
    const game = startedGame();
    paint(game, ['#########.', '#########.', '#########.', '#########.']);
    place(game, 'I', 1, 7, 16); // уже стоит на полу
    const events = run(game, 2, hold('down'));
    expect(typesOf(events)).toEqual(['lock', 'lines']);
    expect(game.score).toBe(1500);
    expect(game.lines).toBe(4);
  });

  it('очки и линии копятся за несколько очисток подряд', () => {
    const game = startedGame();
    wellSetup(game, 1);
    hardDrop(game);
    run(game, CLEAR_TICKS);
    expect(game.piece).not.toBeNull();
    game.field.fill(0);
    wellSetup(game, 2);
    hardDrop(game);
    expect(game.lines).toBe(3);
    expect(game.score).toBe(100 + DROP_SCORE + 300 + DROP_SCORE);
  });
});

describe('очистка линий: анимация и оседание', () => {
  it('отсчёт 24 такта: на нуле ряды схлопываются и в том же такте появляется следующая фигура', () => {
    const game = startedGame();
    wellSetup(game, 1);
    const expectedNext = game.next;
    hardDrop(game);
    expect(game.clearTimer).toBe(24);
    for (let left = 23; left >= 1; left--) {
      expect(game.step(NEUTRAL_TETRIS_INPUT)).toEqual([]);
      expect(game.clearTimer).toBe(left);
      expect(game.piece).toBeNull();
      expect(game.clearRows).toEqual([19]);
    }
    expect(game.step(NEUTRAL_TETRIS_INPUT)).toEqual([]);
    expect(game.clearTimer).toBe(0);
    expect(game.clearRows).toEqual([]);
    expect(game.piece?.kind).toBe(expectedNext);
    expect(game.piece?.rotation).toBe(0);
  });

  it('во время вспышки ввод игнорируется: поле, счёт и события не меняются', () => {
    const game = startedGame();
    wellSetup(game, 2);
    hardDrop(game);
    const field = rowsOf(game.field);
    const score = game.score;
    for (let i = 0; i < CLEAR_TICKS - 1; i++) {
      const input = [press('left'), press('rotate'), press('drop'), hold('down'), press('right')][i % 5];
      expect(game.step(input ?? NEUTRAL_TETRIS_INPUT)).toEqual([]);
    }
    expect(rowsOf(game.field)).toEqual(field);
    expect(game.score).toBe(score);
    expect(game.clearTimer).toBe(1);
  });

  it('нажатия во время вспышки не откладываются: новая фигура появляется на штатном месте', () => {
    const game = startedGame();
    wellSetup(game, 1);
    hardDrop(game);
    run(game, CLEAR_TICKS - 1, press('rotate'));
    game.step(press('rotate'));
    expect(game.piece?.rotation).toBe(0);
    expect(game.piece?.x).toBe(3);
  });

  it('одна линия: всё выше оседает на ряд, остаток вертикальной I остаётся в колонке 9', () => {
    const game = startedGame();
    wellSetup(game, 1);
    hardDrop(game);
    run(game, CLEAR_TICKS);
    expect(bottomRows(game.field, 4)).toEqual(['..........', '.........1', '.........1', '.........1']);
    expect(filledCount(game.field)).toBe(3);
  });

  it('две линии не подряд: нижний и верхний ряды уходят, ряд между ними и мусор выше оседают в правильном порядке', () => {
    const game = startedGame();
    paint(game, [
      '4.........', // ряд 14
      '.5........', // ряд 15
      '#########.', // ряд 16 — станет полным
      '.6........', // ряд 17 — не полный
      '#########.', // ряд 18 — станет полным
      '7.7.7.7.7.', // ряд 19 — не полный
    ]);
    place(game, 'I', 1, 7, 0);
    const events = hardDrop(game);
    expect(events.at(-1)).toEqual({ type: 'lines', count: 2, rows: [16, 18] });
    expect(game.score).toBe(300 + DROP_SCORE);
    run(game, CLEAR_TICKS);
    expect(bottomRows(game.field, 5)).toEqual([
      '..........',
      '4.........',
      '.5........',
      '.6.......1',
      '7.7.7.7.71',
    ]);
  });

  it('четыре линии (тетрис): мусор выше оседает ровно на четыре ряда', () => {
    const game = startedGame();
    paint(game, ['4.........', '.5........', '#########.', '#########.', '#########.', '#########.']);
    place(game, 'I', 1, 7, 0);
    hardDrop(game);
    expect(game.clearRows).toEqual([16, 17, 18, 19]);
    run(game, CLEAR_TICKS);
    expect(bottomRows(game.field, 3)).toEqual(['..........', '4.........', '.5........']);
    expect(filledCount(game.field)).toBe(2);
  });

  it('после очистки поле выше не затронуто и число занятых клеток сходится', () => {
    const game = startedGame();
    paint(game, ['..........', '3.3.3.3.3.', '#########.', '#########.']);
    place(game, 'I', 1, 7, 0);
    hardDrop(game);
    const before = filledCount(game.field); // 5 + 9 + 9 + 4 клетки I
    run(game, CLEAR_TICKS);
    expect(filledCount(game.field)).toBe(before - 2 * FIELD_COLUMNS);
    expect(bottomRows(game.field, 3)).toEqual(['..........', '.........1', '3.3.3.3.31']);
  });

  it('после очистки следующая фигура обновляет next и дальше падает с обнулённым счётчиком', () => {
    const game = startedGame();
    wellSetup(game, 1);
    hardDrop(game);
    run(game, CLEAR_TICKS);
    const y0 = game.piece?.y ?? NaN;
    run(game, (GRAVITY_TICKS[0] ?? 48) - 1);
    expect(game.piece?.y).toBe(y0);
    run(game, 1);
    expect(game.piece?.y).toBe(y0 + 1);
  });
});

describe('скорость растёт каждые 10 линий', () => {
  it('на десятой линии скорость 2 и событие levelUp сразу после lines', () => {
    const game = startedGame();
    game.lines = 9;
    wellSetup(game, 1);
    expect(hardDrop(game)).toEqual([
      { type: 'drop' },
      { type: 'lock' },
      { type: 'lines', count: 1, rows: [19] },
      { type: 'levelUp', speed: 2 },
    ]);
    expect(game.speed).toBe(2);
    expect(game.lines).toBe(10);
  });

  it('до десятой линии скорость прежняя и события нет', () => {
    const game = startedGame();
    game.lines = 8;
    wellSetup(game, 1);
    expect(typesOf(hardDrop(game))).toEqual(['drop', 'lock', 'lines']);
    expect(game.speed).toBe(1);
  });

  it('тетрис через границу десятка (8 + 4 = 12) даёт один levelUp', () => {
    const game = startedGame();
    game.lines = 8;
    wellSetup(game, 4);
    const events = hardDrop(game);
    expect(events.filter((event) => event.type === 'levelUp')).toEqual([{ type: 'levelUp', speed: 2 }]);
    expect(game.speed).toBe(2);
  });

  it('вторая граница: 20 линий — скорость 3', () => {
    const game = startedGame();
    game.lines = 19;
    wellSetup(game, 1);
    hardDrop(game);
    expect(game.speed).toBe(3);
  });

  it('отсчёт идёт от стартовой скорости: с 5 после 10 линий станет 6', () => {
    const game = startedGame({ startSpeed: 5 });
    game.lines = 9;
    wellSetup(game, 1);
    expect(hardDrop(game)).toContainEqual({ type: 'levelUp', speed: 6 });
    expect(game.speed).toBe(6);
  });

  it('потолок скорости 10: с 9 после 20 линий — 10, дальше без новых levelUp', () => {
    const game = startedGame({ startSpeed: 9 });
    game.lines = 19;
    wellSetup(game, 1);
    expect(hardDrop(game)).toContainEqual({ type: 'levelUp', speed: 10 });
    run(game, CLEAR_TICKS);
    game.field.fill(0);
    game.lines = 39;
    wellSetup(game, 1);
    expect(typesOf(hardDrop(game))).not.toContain('levelUp');
    expect(game.speed).toBe(10);
  });

  it('на скорости 10 из старта levelUp не приходит никогда', () => {
    const game = startedGame({ startSpeed: 10 });
    game.lines = 9;
    wellSetup(game, 1);
    expect(typesOf(hardDrop(game))).not.toContain('levelUp');
    expect(game.speed).toBe(10);
  });

  it('новая скорость действует на следующую фигуру: после levelUp до 2 строка падает за 43 такта', () => {
    const game = startedGame();
    game.lines = 9;
    wellSetup(game, 1);
    hardDrop(game);
    run(game, CLEAR_TICKS);
    const y0 = game.piece?.y ?? NaN;
    run(game, 42);
    expect(game.piece?.y).toBe(y0);
    run(game, 1);
    expect(game.piece?.y).toBe(y0 + 1);
  });

  it('level остаётся заглушкой: всегда 1', () => {
    const game = startedGame();
    game.lines = 29;
    wellSetup(game, 1);
    hardDrop(game);
    expect(game.speed).toBe(4);
    expect(game.level).toBe(1);
  });
});

describe('счёт: потолок и хай-скор', () => {
  it('счёт упирается в 9 999 999', () => {
    const game = startedGame();
    game.score = MAX_SCORE - 5;
    place(game, 'O', 0, 3, 0);
    hardDrop(game);
    expect(game.score).toBe(MAX_SCORE);
    wellSetup(game, 4);
    hardDrop(game);
    expect(game.score).toBe(MAX_SCORE);
  });

  it('хай-скор обновляется сразу, как только счёт его обгоняет', () => {
    const game = startedGame({ hiScore: 40 });
    place(game, 'O', 0, 3, 0);
    game.step(hold('down'));
    game.step(hold('down'));
    expect(game.score).toBe(1);
    expect(game.hiScore).toBe(40);
    game.score = 39;
    hardDrop(game);
    expect(game.score).toBe(39 + 2 * 17);
    expect(game.hiScore).toBe(game.score);
  });

  it('хай-скор выше счёта остаётся прежним', () => {
    const game = startedGame({ hiScore: 5000 });
    place(game, 'O', 0, 3, 0);
    hardDrop(game);
    expect(game.score).toBe(36);
    expect(game.hiScore).toBe(5000);
  });
});
