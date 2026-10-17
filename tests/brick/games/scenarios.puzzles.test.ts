/**
 * Сценарные тесты правил Brick Game, часть «головоломки и площадки»: reversi, 2048, matching-blocks, whack-a-mole, simon, dance, dice.
 *
 * Общие контрактные тесты (conformance) и fuzz играбельности не доказывают. Здесь каждая игра проводится через настоящий публичный API
 * (`start()`, `step(makeBrickInput([...]))`, `cells()`, `score`, `lives`, `level`, `phase`, события) к конкретному исходу:
 *  (а) «прогресс» — победа, переход на следующий уровень, очки по правилу;
 *  (б) «неудача» — потеря жизни, конец партии, у игр без жизней — проигрыш или невозможность хода.
 * Ожидаемые числа выписаны по правилам игр и справке (src/brick/guides/library.ts), а не взяты из констант реализации. Состояние готовится прямым
 * присваиванием публичным полям (как в review.test.ts), но исход всегда получается настоящими тактами `step`.
 */
import { describe, expect, it } from 'vitest';
import { NEUTRAL_BRICK_INPUT, makeBrickInput, type BrickAction, type BrickEvent, type BrickGame } from '../../../src/brick';
import { LIBRARY_GAMES } from '../../../src/brick/games/library';
import { MergeGame, ReversiGame } from '../../../src/brick/games/library/puzzles';
import { DiceGame, MatchingGame, PadsGame } from '../../../src/brick/games/library/arcade';
import { deepClone } from '../safePath';

/** Игры, для которых в этом файле есть и сценарий «прогресс», и сценарий «неудача». */
export const SCENARIO_GAMES = ['reversi', '2048', 'matching-blocks', 'whack-a-mole', 'simon', 'dance', 'dice'] as const;
const [REVERSI, MERGE, MATCHING, WHACK, SIMON, DANCE, DICE] = SCENARIO_GAMES;

// ── общие помощники ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Пустые такты (кнопки отпущены); возвращает все события. */
const run = (g: BrickGame, n: number): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
  return events;
};
/** Нажатие и отпускание одной кнопки: два такта (фронт и тишина), чтобы автоповтор не сработал. */
const tap = (g: BrickGame, action: BrickAction): BrickEvent[] => [...g.step(makeBrickInput([action])), ...g.step(NEUTRAL_BRICK_INPUT)];
const count = (events: readonly BrickEvent[], type: BrickEvent['type']): number => events.filter((e) => e.type === type).length;
/** Пустые такты, пока не придёт событие `type`; возвращает число тактов (включая такт события) и все события. Не пришло за `max` тактов — тест падает. */
const waitFor = (g: BrickGame, type: BrickEvent['type'], max: number): { ticks: number; events: BrickEvent[] } => {
  const events: BrickEvent[] = [];
  for (let ticks = 1; ticks <= max; ticks++) {
    const out = g.step(NEUTRAL_BRICK_INPUT);
    events.push(...out);
    if (out.some((e) => e.type === type)) return { ticks, events };
  }
  throw new Error(`событие «${type}» не наступило за ${max} тактов`);
};
/** Площадки Simon, танцев и «Крота»: номер 0–3 — вверх, вправо, вниз, влево (как в справке). */
const KEYS = ['up', 'right', 'down', 'left'] as const;
/** Конец партии: анимация заливки поля (по два такта на ряд и пауза) длится меньше 100 тактов; потом фаза `over`. */
const finishAnimation = (g: BrickGame): void => {
  run(g, 100);
  expect(g.phase).toBe('over');
  expect(g.step(makeBrickInput(['left', 'rotate']))).toEqual([]);
};

// ── reversi ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe(`${REVERSI}: партия против компьютера`, () => {
  /** Доска из восьми строк: X — фишка игрока (горит ровно), O — фишка соперника (мигает), «.» — пусто. */
  const setBoard = (g: ReversiGame, rows: readonly string[]): void => {
    expect(rows).toHaveLength(8);
    rows.forEach((row, y) => {
      expect(row, `строка ${y}`).toHaveLength(8);
      [...row].forEach((ch, x) => {
        g.board[y * 8 + x] = ch === 'X' ? 1 : ch === 'O' ? -1 : 0;
      });
    });
  };
  const fresh = (rows?: readonly string[]): ReversiGame => {
    const g = new ReversiGame({ seed: 5 });
    g.start();
    if (rows) setBoard(g, rows);
    return g;
  };
  const discs = (g: ReversiGame): { mine: number; theirs: number; empty: number } => ({
    mine: g.board.filter((v) => v === 1).length,
    theirs: g.board.filter((v) => v === -1).length,
    empty: g.board.filter((v) => v === 0).length,
  });
  /** Ход игрока: курсор стрелками в (x, y), затем ROTATE. Вызывать только когда очередь игрока. Возвращает события такта постановки. */
  const play = (g: ReversiGame, x: number, y: number): BrickEvent[] => {
    const cx = g.cursor % 8;
    const cy = Math.floor(g.cursor / 8);
    for (let i = cx; i < x; i++) tap(g, 'right');
    for (let i = cx; i > x; i--) tap(g, 'left');
    for (let i = cy; i < y; i++) tap(g, 'down');
    for (let i = cy; i > y; i--) tap(g, 'up');
    expect(g.cursor, 'курсор дошёл до клетки').toBe(y * 8 + x);
    return g.step(makeBrickInput(['rotate']));
  };
  /** Партия на последнем ходу: пуст лишь угол (0,0); ход игрока туда переворачивает ровно одну фишку соперника (1,0). Остальное — по счёту: до хода у игрока finalX − 2 фишек. */
  const lastMoveBoard = (finalX: number): string[] => {
    const cells = Array<string>(64).fill('?');
    Object.assign(cells, { 0: '.', 1: 'O', 2: 'X', 8: 'X', 9: 'X' }); // (0,1) и (1,1) — свои: другие лучи из угла ничего не переворачивают
    let xLeft = finalX - 5; // три игрока уже стоят
    for (let p = 0; p < 64; p++) {
      if (cells[p] !== '?') continue;
      cells[p] = xLeft > 0 ? 'X' : 'O';
      xLeft--;
    }
    return Array.from({ length: 8 }, (_, y) => cells.slice(y * 8, y * 8 + 8).join(''));
  };
  /**
   * Два пустых угла: (0,0) — ход игрока (переворачивает (1,0)), (7,7) — единственный ход соперника: он переворачивает (6,7) по строке и (7,6), (7,5) по столбцу,
   * то есть три фишки игрока ((6,6) своя — по диагонали ничего). До ходов у игрока xBefore фишек, у соперника 62 − xBefore.
   */
  const twoMovesBoard = (xBefore: number): string[] => {
    const cells = Array<string>(64).fill('?');
    Object.assign(cells, { 0: '.', 1: 'O', 2: 'X', 8: 'X', 9: 'X', 63: '.', 62: 'X', 61: 'O', 55: 'X', 47: 'X', 39: 'O', 54: 'O' });
    let xLeft = xBefore - 6; // шесть игрока уже стоят: 2, 8, 9, 62, 55, 47
    for (let p = 0; p < 64; p++) {
      if (cells[p] !== '?') continue;
      cells[p] = xLeft > 0 ? 'X' : 'O';
      xLeft--;
    }
    return Array.from({ length: 8 }, (_, y) => cells.slice(y * 8, y * 8 + 8).join(''));
  };

  it('начальная позиция: у игрока ровно четыре допустимых хода, любая другая клетка отвергается сигналом «нельзя»; свои фишки горят ровно, чужие мигают', () => {
    const g = fresh();
    expect(g.id).toBe(REVERSI);
    expect(g.lives).toBeNull();
    expect(discs(g)).toEqual({ mine: 2, theirs: 2, empty: 60 });
    // Стандартный Отелло: фишки игрока на (4,3) и (3,4), соперника на (3,3) и (4,4). Игрок обязан переворачивать: ходы (3,2), (2,3), (5,4), (4,5).
    const legal: number[] = [];
    for (let p = 0; p < 64; p++) {
      const probe = fresh();
      probe.cursor = p;
      const events = probe.step(makeBrickInput(['rotate']));
      if (count(events, 'lock') > 0) legal.push(p);
      else expect(events, `клетка ${p}`).toEqual([{ type: 'blocked' }]);
    }
    expect(legal).toEqual([19, 26, 37, 44]);
    const cells = g.cells();
    expect(cells.filter((v) => v === 2).length, 'мигают фишки соперника').toBe(2);
    expect(cells.filter((v) => v === 1).length, 'фишки игрока горят ровно (плюс курсор)').toBeGreaterThanOrEqual(2);
  });

  it('прогресс: ход игрока переворачивает луч, компьютер отвечает одним допустимым ходом; очки в ходе партии не начисляются', () => {
    const g = fresh();
    const placed = play(g, 3, 2); // клетка 19: перевернуть (3,3) между новой фишкой и (3,4)
    expect(count(placed, 'lock')).toBe(1);
    expect([...g.board.keys()].filter((p) => g.board[p] === 1)).toEqual([19, 27, 28, 35]);
    expect(g.board[36]).toBe(-1);
    expect(g.score).toBe(0);
    const reply = run(g, 60);
    expect(count(reply, 'lock'), 'компьютер ставит ровно одну фишку').toBe(1);
    // У соперника остаётся единственная фишка (4,4); его допустимые ответы — (2,2), (4,2), (2,4), и каждый переворачивает ровно одну фишку игрока.
    expect(discs(g)).toEqual({ mine: 3, theirs: 3, empty: 58 });
    expect([18, 20, 34].filter((p) => g.board[p] === -1)).toHaveLength(1);
    expect(g.score).toBe(0);
    expect(g.phase).toBe('playing');
    expect(g.cells().filter((v) => v === 2).length, 'на экране мигают ровно фишки соперника').toBe(3);
  });

  it('недопустимый ход не расходует ход: поле и очки прежние, компьютер не отвечает, а допустимый ход принимается сразу', () => {
    const g = fresh();
    const before = Array.from(g.board);
    for (const cell of [0, 27, 28, 20]) {
      // угол без луча, чужая фишка, своя фишка, пустая клетка рядом с фишками, но без переворота
      g.cursor = cell;
      expect(g.step(makeBrickInput(['rotate'])), `клетка ${cell}`).toEqual([{ type: 'blocked' }]);
    }
    expect(Array.from(g.board)).toEqual(before);
    expect(count(run(g, 120), 'lock'), 'на ошибочный ход компьютер не отвечает').toBe(0);
    expect(Array.from(g.board)).toEqual(before);
    expect(g.score).toBe(0);
    // Ход не был израсходован: допустимый ход принимается в первом же такте, а потом очередь переходит к компьютеру.
    const events = play(g, 3, 2);
    expect(count(events, 'lock')).toBe(1);
    expect(count(run(g, 60), 'lock')).toBe(1);
  });

  describe('конец партии на последнем ходу игрока: очки — число фишек игрока на полной доске', () => {
    const finishWith = (finalX: number): { g: ReversiGame; events: BrickEvent[] } => {
      const g = fresh(lastMoveBoard(finalX));
      expect(discs(g)).toEqual({ mine: finalX - 2, theirs: 65 - finalX, empty: 1 });
      expect(g.score).toBe(0);
      const events = play(g, 0, 0);
      expect(count(events, 'lock')).toBe(1);
      expect(g.board[1], 'фишка (1,0) перевёрнута').toBe(1);
      expect(discs(g)).toEqual({ mine: finalX, theirs: 64 - finalX, empty: 0 });
      return { g, events };
    };

    it('победа 41 : 23 — очки 41, событие win, затем конец партии; новая партия начинается с чистой доски и помнит рекорд', () => {
      const { g, events } = finishWith(41);
      expect(count(events, 'win')).toBe(1);
      expect(count(events, 'gameOver')).toBe(1);
      expect(g.score).toBe(41);
      expect(g.hiScore).toBe(41);
      expect(g.phase, 'сначала анимация конца игры').toBe('playing');
      finishAnimation(g);
      expect(g.score).toBe(41);
      expect(count(g.start(), 'started')).toBe(1);
      expect(discs(g)).toEqual({ mine: 2, theirs: 2, empty: 60 });
      expect(g.score).toBe(0);
      expect(g.hiScore).toBe(41);
    });

    it('ничья 32 : 32 — победы нет, очки 32 (число своих фишек), партия заканчивается', () => {
      const { g, events } = finishWith(32);
      expect(count(events, 'win')).toBe(0);
      expect(count(events, 'gameOver')).toBe(1);
      expect(g.score).toBe(32);
      finishAnimation(g);
    });

    it('поражение 19 : 45 — победы нет, очки 19 (число своих фишек), партия заканчивается', () => {
      const { g, events } = finishWith(19);
      expect(count(events, 'win')).toBe(0);
      expect(count(events, 'gameOver')).toBe(1);
      expect(g.score).toBe(19);
      finishAnimation(g);
    });

    it('перевес в одну фишку решает исход: 33 : 31 — победа, 31 : 33 — нет', () => {
      expect(count(finishWith(33).events, 'win')).toBe(1);
      expect(count(finishWith(31).events, 'win')).toBe(0);
    });
  });

  it('неудача: последний ход делает компьютер и переворачивает три фишки игрока — итоговый счёт считается уже после его хода', () => {
    const g = fresh(twoMovesBoard(20));
    expect(discs(g)).toEqual({ mine: 20, theirs: 42, empty: 2 });
    const mine = play(g, 0, 0); // игрок переворачивает (1,0): 22 : 41
    expect(count(mine, 'lock')).toBe(1);
    expect(discs(g)).toEqual({ mine: 22, theirs: 41, empty: 1 });
    expect(g.score, 'партия не окончена: у соперника есть ход').toBe(0);
    expect(g.phase).toBe('playing');
    const reply = run(g, 60);
    expect(count(reply, 'lock')).toBe(1);
    // Соперник занял (7,7) и перевернул (6,7), (7,6), (7,5): 19 : 45.
    expect(discs(g)).toEqual({ mine: 19, theirs: 45, empty: 0 });
    expect(count(reply, 'win')).toBe(0);
    expect(count(reply, 'gameOver')).toBe(1);
    expect(g.score).toBe(19);
    expect(g.hiScore).toBe(19);
    finishAnimation(g);
  });

  it('соперник без хода пропускает: фишка не ставится, игрок ходит снова; когда ходов нет ни у кого, партия заканчивается и без заполненной доски', () => {
    // Фишки игрока в углах не окружить, поэтому у соперника ходов нет вовсе; у игрока два — (2,0) и (2,7), по одной переворачиваемой фишке.
    const g = fresh(['XO......', '........', '........', '........', '........', '........', '........', 'XO......']);
    expect(discs(g)).toEqual({ mine: 2, theirs: 2, empty: 60 });
    const first = play(g, 2, 0);
    expect(count(first, 'lock')).toBe(1);
    expect(g.board[1]).toBe(1);
    expect(g.phase, 'у игрока ещё есть ход — партия идёт').toBe('playing');
    const pause = run(g, 100);
    expect(count(pause, 'lock'), 'соперник ничего не поставил').toBe(0);
    expect(count(pause, 'gameOver')).toBe(0);
    expect(discs(g)).toEqual({ mine: 4, theirs: 1, empty: 59 });
    // Очередь вернулась к игроку: второй ход принимается сразу.
    const second = play(g, 2, 7);
    expect(count(second, 'lock')).toBe(1);
    expect(discs(g)).toEqual({ mine: 6, theirs: 0, empty: 58 });
    // Теперь ходов нет ни у кого: доска не заполнена, но партия окончена, победа и очки по числу фишек.
    expect(count(second, 'win')).toBe(1);
    expect(count(second, 'gameOver')).toBe(1);
    expect(g.score).toBe(6);
    finishAnimation(g);
  });

  it('игрок без хода пропускает: соперник ходит второй раз подряд, а когда у игрока снова появляется ход, очередь возвращается к нему', () => {
    const g = fresh(['XO......', '........', '.XOOOOOO', '........', '........', 'X.......', '.XOOOOOO', '........']);
    // Исходно у игрока единственный ход (2,0); у соперника два — (0,2) и (0,6), каждый переворачивает одну фишку игрока.
    play(g, 2, 0);
    expect(g.board[1]).toBe(1);
    // После (2,0) у игрока ходов нет — сначала соперник ставит (0,2), затем, не дожидаясь игрока, (0,6); игрок за это время ничего не нажимает.
    const reply = run(g, 200);
    expect(count(reply, 'lock')).toBe(2);
    expect(g.board.slice(16, 24).every((v) => v === -1), 'строка 2 целиком у соперника').toBe(true);
    expect(g.board.slice(48, 56).every((v) => v === -1), 'строка 6 целиком у соперника').toBe(true);
    expect(g.phase).toBe('playing');
    expect(g.score).toBe(0);
    // Фишка (0,6) соперника зажата между фишкой игрока (0,5) и пустой клеткой (0,7): у игрока появился ход, и он принимается сразу.
    const back = play(g, 0, 7);
    expect(count(back, 'lock')).toBe(1);
    expect(g.board[48], 'фишка (0,6) перевёрнута').toBe(1);
    expect(g.phase).toBe('playing');
  });

  it('у обоих нет ходов, доска не заполнена: игрок проиграл по числу фишек — победы нет, очки 3, партия окончена', () => {
    // Вариант предыдущей позиции без «своей» фишки (0,5): после двух ходов соперника у игрока ходов не будет вовсе, и у соперника тоже.
    const g = fresh(['XO......', '........', '.XOOOOOO', '........', '........', '........', '.XOOOOOO', '........']);
    play(g, 2, 0);
    const events = run(g, 200);
    expect(count(events, 'lock')).toBe(2);
    expect(discs(g)).toEqual({ mine: 3, theirs: 16, empty: 45 });
    expect(count(events, 'win')).toBe(0);
    expect(count(events, 'gameOver')).toBe(1);
    expect(g.score).toBe(3);
    finishAnimation(g);
  });
});

// ── 2048 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe(`${MERGE}: слияния, победа и конец игры`, () => {
  /** Поле из четырёх строк показателей степени (0 — пусто, 1 — «2», 2 — «4», …, 11 — «2048»). */
  const make = (rows: readonly (readonly number[])[], seed = 3): MergeGame => {
    const g = new MergeGame({ seed });
    g.start();
    g.board.fill(0);
    rows.forEach((row, r) => row.forEach((v, c) => void (g.board[r * 4 + c] = v)));
    return g;
  };
  const tiles = (g: MergeGame): number => g.board.filter(Boolean).length;
  /** Сумма значений плиток: слияние её сохраняет, рождение новой плитки прибавляет 2 или 4. */
  const total = (g: MergeGame): number => Array.from(g.board).reduce((sum, e) => sum + (e ? 2 ** e : 0), 0);

  it('прогресс: сдвиг и слияние по правилам — каждая плитка сливается не более одного раза за ход, очки — значения новых плиток, после изменяющего хода рождается одна плитка', () => {
    const g = make([[1, 1, 2, 2], [1, 1, 1, 1], [1, 1, 1, 0], [0, 0, 0, 0]]);
    expect(g.id).toBe(MERGE);
    expect(g.lives).toBeNull();
    expect(total(g)).toBe(12 + 8 + 6); // 2+2+4+4, четыре двойки, три двойки
    const events = tap(g, 'left');
    // 2+2 → 4 и 4+4 → 8: +12; четыре двойки → две четвёрки: +8; три двойки → четвёрка и двойка: +4. Всего +24.
    expect(g.score).toBe(12 + 8 + 4);
    expect(Array.from(g.board.slice(0, 4))).toEqual([2, 3, 0, 0]);
    expect(Array.from(g.board.slice(4, 8))).toEqual([2, 2, 0, 0]);
    expect(Array.from(g.board.slice(8, 12))).toEqual([2, 1, 0, 0]);
    expect(count(events, 'move')).toBe(1);
    // Слияния сумму плиток сохраняют; рождается ровно одна новая плитка — «2» или «4».
    expect(tiles(g)).toBe(6 + 1);
    expect([26 + 2, 26 + 4]).toContain(total(g));
    expect(g.hiScore).toBe(24);
  });

  it('все четыре стрелки сдвигают плитки к своему краю и дают очки за слияние вдоль этого края', () => {
    // Плитка «32» в клетке 5 (строка 1, столбец 1) и пара «2»+«2» у края сдвига; клетки 0–15 идут по строкам.
    const slide = (key: BrickAction, pair: [number, number], expected: { big: number; merged: number }): void => {
      const g = make([[0, 0, 0, 0], [0, 5, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      g.board[pair[0]] = 1;
      g.board[pair[1]] = 1;
      tap(g, key);
      expect(g.board[expected.big], `${key}: «32» у края`).toBe(5);
      expect(g.board[expected.merged], `${key}: пара слилась в «4»`).toBe(2);
      expect(g.score, `${key}: очки за слияние`).toBe(4);
    };
    slide('up', [8, 12], { big: 1, merged: 0 }); // пара в столбце 0 (строки 2, 3) сливается наверху в (0,0), «32» поднимается из (1,1) в (1,0)
    slide('left', [2, 3], { big: 4, merged: 0 }); // пара в строке 0 (столбцы 2, 3) сливается слева, «32» уходит в (0,1)
    slide('right', [0, 1], { big: 7, merged: 3 }); // пара в строке 0 (столбцы 0, 1) сливается справа в (3,0), «32» уходит в (3,1)
    slide('down', [0, 4], { big: 13, merged: 12 }); // пара в столбце 0 (строки 0, 1) сливается внизу в (0,3), «32» опускается в (1,3)
  });

  it('прогресс: победа — две «1024» сливаются в «2048» (+2048), событие win приходит один раз, партия продолжается и играется дальше', () => {
    const g = make([[10, 10, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 1]]);
    const first = tap(g, 'left');
    expect(g.board[0]).toBe(11);
    expect(g.score).toBe(2048);
    expect(count(first, 'win')).toBe(1);
    expect(g.phase).toBe('playing');
    // Дальше игра идёт как обычно: ходы принимаются, плитка «2048» остаётся, второго win нет, конца игры нет.
    const rest: BrickEvent[] = [];
    for (const key of ['down', 'right', 'up', 'left', 'down', 'right'] as const) rest.push(...tap(g, key));
    expect(count(rest, 'win')).toBe(0);
    expect(count(rest, 'gameOver')).toBe(0);
    expect(g.phase).toBe('playing');
    expect(g.board.some((v) => v === 11)).toBe(true);
    expect(g.score).toBeGreaterThanOrEqual(2048);
    // Дальнейший рост: «2048» + «2048» → «4096» (+4096) без повторной победы.
    const before = g.score;
    g.board.fill(0);
    g.board[0] = 11;
    g.board[4] = 11;
    const next = tap(g, 'up');
    expect(g.board[0]).toBe(12);
    expect(g.score).toBe(before + 4096);
    expect(count(next, 'win')).toBe(0);
    expect(g.phase).toBe('playing');
  });

  it('«1024» ещё не победа: две «512» дают «1024» (+1024) без события win', () => {
    const g = make([[9, 9, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const events = tap(g, 'left');
    expect(g.board[0]).toBe(10);
    expect(g.score).toBe(1024);
    expect(count(events, 'win')).toBe(0);
  });

  it('ход без изменений: плитка не рождается, очки и события прежние, ГСЧ не расходуется (следующий ход рождает ту же плитку, что без пустого хода)', () => {
    const rows = [[3, 1, 0, 0], [2, 0, 0, 0], [4, 3, 0, 0], [0, 0, 0, 0]]; // всё уже прижато влево, равных соседей нет
    const idle = make(rows, 9);
    const before = Array.from(idle.board);
    const events = tap(idle, 'left');
    expect(events).toEqual([]);
    expect(Array.from(idle.board)).toEqual(before);
    expect(tiles(idle)).toBe(5);
    expect(idle.score).toBe(0);
    expect(idle.phase).toBe('playing');
    // Двойник той же партии, который пустого хода не делал, после общего хода «вправо» должен совпасть с первой партией полностью.
    const twin = make(rows, 9);
    tap(idle, 'right');
    tap(twin, 'right');
    expect(Array.from(idle.board)).toEqual(Array.from(twin.board));
    expect(idle.score).toBe(twin.score);
    expect(tiles(idle)).toBe(6);
  });

  it('неудача: поле заполнено, слияний нет — партия заканчивается сразу после последнего рождения плитки', () => {
    // Свободна одна клетка; ход «вправо» сдвигает нижний ряд, освобождает (0,3) и ставит туда «2» или «4». Соседи — 3, 5 и 6: слияний нет нигде.
    const g = make([[3, 4, 3, 4], [4, 3, 4, 3], [3, 4, 3, 4], [5, 6, 5, 0]]);
    expect(tiles(g)).toBe(15);
    const events = tap(g, 'right');
    expect(count(events, 'move')).toBe(1);
    expect([1, 2]).toContain(g.board[12]);
    expect(tiles(g)).toBe(16);
    expect(count(events, 'gameOver')).toBe(1);
    expect(count(events, 'win')).toBe(0);
    expect(g.phase, 'сначала анимация конца игры').toBe('playing');
    finishAnimation(g);
    expect(g.score).toBe(0);
  });

  it('полное поле со слиянием не конец игры: пара сливается (+16), рождается плитка, партия идёт дальше', () => {
    const g = make([[3, 3, 4, 5], [4, 5, 3, 4], [5, 3, 4, 3], [3, 4, 5, 6]]);
    expect(tiles(g)).toBe(16);
    const events = tap(g, 'left'); // 8+8 → 16; ряд становится [4, 4, 5, 0] — «4» из слияния и «4» рядом не сливаются в этом же ходу
    expect(g.score).toBe(16);
    expect(Array.from(g.board.slice(0, 3))).toEqual([4, 4, 5]);
    expect(count(events, 'gameOver')).toBe(0);
    expect(g.phase).toBe('playing');
    expect(tiles(g)).toBe(16 - 1 + 1);
    // Новая пара «4»+«4» (по 16) сливается в «5» (32): очки +32.
    tap(g, 'left');
    expect(g.score).toBe(16 + 32);
    expect(g.phase).toBe('playing');
  });
});

// ── matching-blocks ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe(`${MATCHING}: сопоставление трёх фигур`, () => {
  /** Скорость 10: тройка падает быстро, поэтому раунд — сотни тактов. */
  const make = (seed = 6): MatchingGame => {
    const g = new MatchingGame({ seed, speed: 10 });
    g.start();
    return g;
  };
  /** Игрок меняет нижние фигуры: стрелками выбирает позицию, ROTATE листает фигуру позиции по кругу из трёх. */
  const arrange = (g: MatchingGame, shapes: readonly number[]): void => {
    for (let i = 0; i < 3; i++) {
      for (let n = 0; n < 3 && g.selected < i; n++) tap(g, 'right');
      for (let n = 0; n < 3 && g.selected > i; n++) tap(g, 'left');
      expect(g.selected).toBe(i);
      for (let n = 0; n < 3 && g.bottom[i] !== shapes[i]; n++) tap(g, 'rotate');
      expect(g.bottom[i], `позиция ${i}`).toBe(shapes[i]);
    }
  };
  /** Пустые такты до исхода раунда (смена счёта или жизней); возвращает события вплоть до такта исхода. */
  const resolve = (g: MatchingGame): BrickEvent[] => {
    const score = g.score;
    const lives = g.lives;
    const events: BrickEvent[] = [];
    for (let i = 0; i < 300 && g.score === score && g.lives === lives; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
    expect(g.score !== score || g.lives !== lives, 'раунд завершился за 300 тактов').toBe(true);
    return events;
  };
  /** Раунд сыгран верно: нижние фигуры подогнаны под падающие. Возвращает события до исхода раунда. */
  const solve = (g: MatchingGame): BrickEvent[] => {
    const wanted = [...g.falling];
    arrange(g, wanted);
    expect(g.bottom).toEqual(wanted);
    return resolve(g);
  };
  /** Раунд сыгран с ошибкой в одной позиции (остальные две совпадают). */
  const spoil = (g: MatchingGame, position: number): void => {
    const wanted = g.falling.map((shape, i) => (i === position ? (shape + 1) % 3 : shape));
    arrange(g, wanted);
    expect(g.bottom).not.toEqual(g.falling);
  };
  /** Анимация очистки поля после выигрыша или потери жизни (меньше 100 тактов); после неё начинается новая тройка. */
  const afterScene = (g: MatchingGame): BrickEvent[] => run(g, 100);

  it('прогресс: полное совпадение даёт +30, жизни не тратятся, поле начинается заново с новой тройкой', () => {
    const g = make();
    expect(g.id).toBe(MATCHING);
    expect(g.lives).toBe(4);
    const events = solve(g); // тройка падает сама, все шестнадцать шагов
    expect(count(events, 'lifeLost')).toBe(0);
    expect(g.score).toBe(30);
    expect(g.lives).toBe(4);
    expect(g.level).toBe(1);
    expect(g.y, 'новая падающая тройка начинает сверху').toBeLessThan(16);
    expect(g.bottom, 'нижние фигуры сброшены к исходным').toEqual([0, 1, 2]);
    expect(g.hiScore).toBe(30);
  });

  it('прогресс: пять совпадений подряд — +30 за каждое и +100 за переход; через анимацию начинается уровень 2', () => {
    const g = make();
    let last: BrickEvent[] = [];
    for (let round = 1; round <= 5; round++) {
      g.y = 12; // сокращаем падение до последних шагов (игра сама подвела бы тройку за шестнадцать шагов)
      last = solve(g);
      if (round < 5) {
        expect(g.score, `после совпадения ${round}`).toBe(30 * round);
        expect(count(last, 'win')).toBe(0);
        expect(g.level).toBe(1);
      }
    }
    expect(count(last, 'win'), 'пятое совпадение').toBe(1);
    expect(count(last, 'lifeLost')).toBe(0);
    expect(g.score).toBe(5 * 30 + 100);
    expect(g.level, 'уровень растёт после анимации очистки').toBe(1);
    expect(count(afterScene(g), 'levelUp')).toBe(1);
    expect(g.level).toBe(2);
    expect(g.lives).toBe(4);
    expect(g.phase).toBe('playing');
    // На втором уровне игра продолжается: следующее совпадение даёт ещё +30.
    g.y = 12;
    solve(g);
    expect(g.score).toBe(5 * 30 + 100 + 30);
  });

  it('управление: ↑, ↓ и ROTATE листают фигуру выбранной позиции по кругу из трёх фигур, остальные позиции не трогают', () => {
    for (const key of ['up', 'down', 'rotate'] as const) {
      const g = make();
      tap(g, 'right'); // позиция 1
      const before = [...g.bottom];
      tap(g, key);
      expect(g.bottom[1], key).not.toBe(before[1]);
      expect(g.bottom[0], key).toBe(before[0]);
      expect(g.bottom[2], key).toBe(before[2]);
      tap(g, key);
      tap(g, key);
      expect(g.bottom, `${key}: три нажатия замыкают круг`).toEqual(before);
    }
  });

  it('неудача: несовпадение хотя бы в одной из трёх позиций — потеря жизни без очков, поле начинается заново', () => {
    const g = make();
    spoil(g, 1);
    const events = resolve(g);
    expect(count(events, 'lifeLost')).toBe(1);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    expect(g.phase).toBe('playing');
    afterScene(g);
    expect(g.bottom, 'после потери жизни нижние фигуры сброшены').toEqual([0, 1, 2]);
    expect(g.y).toBeLessThan(16);
    // игра продолжается: верный раунд после ошибки даёт очки
    g.y = 12;
    solve(g);
    expect(g.score).toBe(30);
    expect(g.lives).toBe(3);
  });

  it('неудача: без единого нажатия падающая тройка, отличная от нижней, стоит жизни', () => {
    // нижний ряд исходно «круг, угол, чёрточка» (0, 1, 2); ищем зерно, в котором падающий порядок другой
    let seed = 1;
    for (; seed < 50; seed++) if (make(seed).falling.some((shape, i) => shape !== i)) break;
    const g = make(seed);
    const events = resolve(g);
    expect(count(events, 'lifeLost')).toBe(1);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
  });

  it('неудача: четыре ошибки — конец игры; очки, набранные раньше, остаются рекордом', () => {
    const g = make();
    g.y = 12;
    solve(g);
    expect(g.score).toBe(30);
    for (let miss = 1; miss <= 4; miss++) {
      g.y = 12;
      spoil(g, 0);
      const events = resolve(g);
      expect(count(events, 'lifeLost')).toBe(1);
      expect(g.lives).toBe(4 - miss);
      if (miss < 4) {
        expect(count(events, 'gameOver')).toBe(0);
        expect(g.phase).toBe('playing');
        afterScene(g);
      } else expect(count(events, 'gameOver')).toBe(1);
    }
    expect(g.lives).toBe(0);
    finishAnimation(g);
    expect(g.score).toBe(30);
    expect(g.hiScore).toBe(30);
  });
});

// ── площадки: whack-a-mole, simon, dance ──────────────────────────────────────────────────────────────────────────────────────────────

/** Центры площадок на экране (столбец, строка): вверху, справа, внизу, слева. Горящая площадка мигает (2), остальные горят ровно (1). */
const PAD_CELLS = [[4, 5], [7, 10], [4, 15], [1, 10]] as const;
const litPad = (g: BrickGame): number => {
  const cells = g.cells();
  const lit = PAD_CELLS.map(([x, y], pad) => ({ pad, value: cells[y * 10 + x] })).filter((p) => p.value === 2);
  expect(lit, 'горит ровно одна площадка').toHaveLength(1);
  return lit[0]!.pad;
};

describe(`${WHACK}: «Крот»`, () => {
  const make = (seed = 4, speed = 1): PadsGame => {
    const g = new PadsGame('whack-a-mole', { seed, speed });
    g.start();
    return g;
  };
  /** Нажимает кнопку площадки, которая сейчас горит на экране. */
  const hit = (g: PadsGame): BrickEvent[] => tap(g, KEYS[litPad(g)]!);
  /** Нажимает кнопку любой другой площадки, чем горящая. */
  const miss = (g: PadsGame): BrickEvent[] => tap(g, KEYS[(litPad(g) + 1) % 4]!);

  it('прогресс: верная площадка — +10; десять попаданий — +100 и переход на уровень 2, игра продолжается', () => {
    const g = make();
    expect(g.id).toBe(WHACK);
    expect(g.lives).toBe(4);
    expect(litPad(g), 'на экране горит именно цель').toBe(g.target);
    for (let n = 1; n <= 9; n++) {
      const events = hit(g);
      expect(count(events, 'hit'), `попадание ${n}`).toBe(1);
      expect(count(events, 'lifeLost')).toBe(0);
      expect(g.score).toBe(10 * n);
    }
    expect(g.level).toBe(1);
    const tenth = hit(g);
    expect(count(tenth, 'win')).toBe(1);
    expect(g.score).toBe(10 * 10 + 100);
    expect(g.lives).toBe(4);
    const after = run(g, 80);
    expect(count(after, 'levelUp')).toBe(1);
    expect(g.level).toBe(2);
    // новая серия: следующее попадание снова +10
    hit(g);
    expect(g.score).toBe(210);
    expect(g.hiScore).toBe(210);
  });

  it('ROTATE — нижняя площадка: попадает, только если горит нижняя, иначе это ошибка', () => {
    const g = make();
    g.target = 2;
    expect(count(tap(g, 'rotate'), 'hit')).toBe(1);
    expect(g.score).toBe(10);
    g.target = 0;
    const events = tap(g, 'rotate');
    expect(count(events, 'lifeLost')).toBe(1);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
  });

  it('неудача: неверная площадка — потеря жизни без очков; игра продолжается с новой цели', () => {
    const g = make();
    hit(g);
    expect(g.score).toBe(10);
    const events = miss(g);
    expect(count(events, 'lifeLost')).toBe(1);
    expect(count(events, 'hit')).toBe(0);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
    expect(g.phase).toBe('playing');
    run(g, 80); // сценка потери жизни
    hit(g);
    expect(g.score).toBe(20);
    expect(g.lives).toBe(3);
  });

  it('неудача: время вышло — потеря жизни; верный ответ обновляет окно времени, а запас времени зависит от скорости', () => {
    const slow = make(4, 1);
    const limit = waitFor(slow, 'lifeLost', 400).ticks;
    expect(limit, 'на ответ есть заметное время').toBeGreaterThan(60);
    expect(slow.lives).toBe(3);
    expect(slow.score).toBe(0);
    const fast = make(4, 10);
    expect(waitFor(fast, 'lifeLost', 400).ticks, 'на высокой скорости окно короче').toBeLessThan(limit);
    // Ответ в последний момент отодвигает конец: ждём почти всё окно, отвечаем верно, снова ждём почти всё окно — жизнь цела.
    const g = make(4, 1);
    run(g, limit - 10);
    expect(g.lives).toBe(4);
    hit(g);
    expect(g.score).toBe(10);
    run(g, limit - 14);
    expect(g.lives).toBe(4);
    waitFor(g, 'lifeLost', 40);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
  });

  it('неудача: четыре ошибки — конец игры, очки остаются, а новая партия начинается заново с четырьмя жизнями', () => {
    const g = make();
    hit(g);
    for (let n = 1; n <= 4; n++) {
      const events = miss(g);
      expect(g.lives).toBe(4 - n);
      expect(count(events, 'gameOver')).toBe(n === 4 ? 1 : 0);
      if (n < 4) run(g, 80);
    }
    expect(g.phase).toBe('playing');
    finishAnimation(g);
    expect(g.score).toBe(10);
    expect(g.hiScore).toBe(10);
    g.start();
    expect(g.lives).toBe(4);
    expect(g.score).toBe(0);
    expect(g.hiScore).toBe(10);
  });
});

describe(`${SIMON}: «Саймон»`, () => {
  const make = (seed = 4): PadsGame => {
    const g = new PadsGame('simon', { seed });
    g.start();
    return g;
  };
  const tones = (events: readonly BrickEvent[]): number[] => events.flatMap((e) => (e.type === 'tone' ? [e.pad] : []));
  /** Игрок смотрит показ без нажатий, пока он идёт. Возвращает события показа (тоны сигналов). */
  const watch = (g: PadsGame): BrickEvent[] => {
    const events: BrickEvent[] = [];
    for (let i = 0; i < 1000 && g.showing > 0; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
    expect(g.showing, 'показ закончился').toBe(0);
    return events;
  };
  /** Показ с проверкой экрана: в такт, когда звучит тон площадки, на экране горит именно эта площадка (и только она). */
  const watchScreen = (g: PadsGame): number[] => {
    const shown: number[] = [];
    for (let i = 0; i < 1000 && g.showing > 0; i++) {
      for (const e of g.step(NEUTRAL_BRICK_INPUT)) {
        if (e.type !== 'tone') continue;
        shown.push(e.pad);
        expect(litPad(g), `тон площадки ${e.pad}`).toBe(e.pad);
      }
    }
    expect(g.showing).toBe(0);
    return shown;
  };
  /** Ответ: по нажатию на сигнал, между нажатиями кнопка отпускается; после последнего нажатия пустого такта нет (иначе в него попадёт начало следующего показа). */
  const answer = (g: PadsGame, pads: readonly number[]): BrickEvent[] => {
    const events: BrickEvent[] = [];
    pads.forEach((pad, i) => {
      events.push(...g.step(makeBrickInput([KEYS[pad]!])));
      if (i < pads.length - 1) events.push(...g.step(NEUTRAL_BRICK_INPUT));
    });
    return events;
  };

  it('прогресс: первые два раунда — показ повторяет последовательность тонов, она удлиняется на один сигнал, очки +10 только за полный ответ', () => {
    const g = make();
    expect(g.id).toBe(SIMON);
    expect(g.lives).toBe(4);
    const shown1 = watchScreen(g);
    expect(shown1).toHaveLength(1);
    expect(shown1).toEqual(g.sequence);
    const first = [...g.sequence];
    const ok1 = answer(g, first);
    expect(tones(ok1), 'тон на ответ — той площадки, которую нажали').toEqual(first.slice(0, 1));
    expect(g.score).toBe(10);
    expect(count(ok1, 'lifeLost')).toBe(0);
    expect(g.sequence, 'раунд удлинился на один сигнал, начало прежнее').toHaveLength(2);
    expect(g.sequence.slice(0, 1)).toEqual(first);
    const shown2 = watchScreen(g);
    expect(shown2, 'во втором раунде показаны оба сигнала в порядке последовательности').toEqual(g.sequence);
    const second = [...g.sequence];
    // Первый верный сигнал второго раунда очков не даёт, очки — за всю последовательность.
    answer(g, second.slice(0, 1));
    expect(g.score).toBe(10);
    g.step(NEUTRAL_BRICK_INPUT);
    answer(g, second.slice(1));
    expect(g.score).toBe(20);
    expect(g.sequence).toHaveLength(3);
    expect(g.sequence.slice(0, 2)).toEqual(second);
    expect(g.lives).toBe(4);
  });

  it('прогресс: десять верно повторённых раундов — +10 за каждый и +100 за переход (итого 200), уровень 2, последовательность начинается заново', () => {
    const g = make();
    for (let round = 1; round <= 10; round++) {
      if (round <= 2) watch(g); // первые раунды смотрим по-настоящему, дальше показ пропускаем (иначе он длился бы по сотне тактов)
      else g.showing = 0;
      expect(g.sequence).toHaveLength(round);
      const events = answer(g, [...g.sequence]);
      expect(count(events, 'lifeLost'), `раунд ${round}`).toBe(0);
      if (round < 10) {
        expect(g.score).toBe(10 * round);
        expect(count(events, 'win')).toBe(0);
        expect(g.level).toBe(1);
      } else {
        expect(count(events, 'win')).toBe(1);
        expect(g.score).toBe(10 * 10 + 100);
        expect(g.level, 'уровень растёт после анимации очистки').toBe(1);
      }
    }
    const after = run(g, 80);
    expect(count(after, 'levelUp')).toBe(1);
    expect(g.level).toBe(2);
    expect(g.sequence).toHaveLength(1);
    expect(g.lives).toBe(4);
    expect(g.score).toBe(200);
  });

  it('неудача: неверная площадка — потеря жизни без очков и без тона; последовательность начинается заново с одного сигнала', () => {
    const g = make();
    watch(g);
    const right = g.sequence[0]!;
    const events = tap(g, KEYS[(right + 1) % 4]!);
    expect(count(events, 'lifeLost')).toBe(1);
    expect(tones(events), 'на ошибку тона площадки нет').toEqual([]);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    run(g, 80);
    expect(g.sequence).toHaveLength(1);
    expect(g.phase).toBe('playing');
    // игра идёт дальше: верный круг после ошибки снова даёт +10
    watch(g);
    answer(g, [...g.sequence]);
    expect(g.score).toBe(10);
    expect(g.lives).toBe(3);
  });

  it('неудача: ошибка в середине последовательности — потеря жизни, уже набранные очки остаются, частичный ответ очков не дал', () => {
    const g = make();
    watch(g);
    answer(g, [...g.sequence]);
    expect(g.score).toBe(10);
    watch(g);
    const [a, b] = g.sequence as [number, number];
    const good = answer(g, [a]);
    expect(count(good, 'lifeLost')).toBe(0);
    g.step(NEUTRAL_BRICK_INPUT);
    const bad = answer(g, [(b + 2) % 4]);
    expect(count(bad, 'lifeLost')).toBe(1);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
  });

  it('неудача: молчание после показа — потеря жизни по времени', () => {
    const g = make();
    watch(g);
    const { ticks } = waitFor(g, 'lifeLost', 600);
    expect(ticks, 'на ответ есть заметное время').toBeGreaterThan(60);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
  });

  it('неудача: четыре ошибки — конец игры; новая партия начинается с одного сигнала и четырёх жизней', () => {
    const g = make();
    watch(g);
    answer(g, [...g.sequence]);
    expect(g.score).toBe(10);
    for (let n = 1; n <= 4; n++) {
      watch(g);
      const events = tap(g, KEYS[(g.sequence[0]! + 1) % 4]!);
      expect(g.lives).toBe(4 - n);
      expect(count(events, 'gameOver')).toBe(n === 4 ? 1 : 0);
      if (n < 4) run(g, 80);
    }
    finishAnimation(g);
    expect(g.score).toBe(10);
    expect(g.hiScore).toBe(10);
    g.start();
    expect(g.lives).toBe(4);
    expect(g.sequence).toHaveLength(1);
    expect(g.score).toBe(0);
  });
});

describe(`${DANCE}: танцы`, () => {
  /** Скорость 10: ноты идут быстро, десять нот — сотни тактов. */
  const make = (seed = 2, speed = 10): PadsGame => {
    const g = new PadsGame('dance', { seed, speed });
    g.start();
    return g;
  };
  const tones = (events: readonly BrickEvent[]): number[] => events.flatMap((e) => (e.type === 'tone' ? [e.pad] : []));

  it('дорожки слева направо: вверх, вправо, вниз, влево — нота нужного направления горит в своей колонке', () => {
    const columns = [0, 1, 2, 3].map((pad) => {
      const g = make(2, 1);
      g.notes = [{ direction: pad, y: 10 }];
      const cells = g.cells();
      const lit = [...cells.keys()].filter((p) => cells[p] === 2);
      expect(lit, `дорожка ${pad}`).toHaveLength(1);
      return lit[0]! % 10;
    });
    expect(new Set(columns).size, 'колонки разные').toBe(4);
    expect(columns, 'колонки идут слева направо').toEqual([...columns].sort((a, b) => a - b));
  });

  it('прогресс: игрок жмёт направление, когда нота входит в нижнюю зону, — десять нот дают по +10 и тону дорожки, затем +100 и уровень 2', () => {
    const g = make();
    expect(g.id).toBe(DANCE);
    expect(g.lives).toBe(4);
    const events: BrickEvent[] = [];
    const pressed: number[] = [];
    let ticks = 0;
    while (count(events, 'win') === 0 && ticks < 700) {
      const note = g.notes.find((n) => n.y === 16); // верхняя строка нижней зоны (строки 16–19)
      const out = note ? g.step(makeBrickInput([KEYS[note.direction]!])) : g.step(NEUTRAL_BRICK_INPUT);
      if (note) pressed.push(note.direction);
      events.push(...out);
      ticks++;
      const hitsDone = pressed.length;
      if (count(events, 'win') === 0) expect(g.score, `такт ${ticks}`).toBe(10 * hitsDone);
    }
    expect(count(events, 'lifeLost')).toBe(0);
    expect(count(events, 'win')).toBe(1);
    expect(pressed).toHaveLength(10);
    expect(tones(events)).toEqual(pressed);
    expect(g.score).toBe(10 * 10 + 100);
    expect(g.lives).toBe(4);
    expect(g.level).toBe(1);
    waitFor(g, 'levelUp', 100);
    expect(g.level).toBe(2);
    expect(g.notes, 'новый уровень начинается с пустой дорожки').toEqual([]);
  });

  it('нижняя зона — четыре нижних ряда (16–19): в них нота принимается, выше — это ошибка', () => {
    for (const y of [16, 17, 18, 19]) {
      const g = make(2, 1);
      g.notes = [{ direction: 3, y }];
      const events = tap(g, 'left');
      expect(tones(events), `ряд ${y}`).toEqual([3]);
      expect(g.score).toBe(10);
      expect(g.lives).toBe(4);
      expect(g.notes).toEqual([]);
    }
    const early = make(2, 1);
    early.notes = [{ direction: 3, y: 15 }];
    const events = tap(early, 'left');
    expect(count(events, 'lifeLost'), 'нота ещё выше зоны').toBe(1);
    expect(early.lives).toBe(3);
    expect(early.score).toBe(0);
  });

  it('неудача: неверное направление — потеря жизни без очков и тона; нажатие без ноты — тоже', () => {
    const wrong = make(2, 1);
    wrong.notes = [{ direction: 1, y: 17 }];
    const bad = tap(wrong, 'down');
    expect(count(bad, 'lifeLost')).toBe(1);
    expect(tones(bad)).toEqual([]);
    expect(wrong.lives).toBe(3);
    expect(wrong.score).toBe(0);
    const empty = make(2, 1);
    expect(count(tap(empty, 'up'), 'lifeLost')).toBe(1);
    expect(empty.lives).toBe(3);
    expect(empty.score).toBe(0);
  });

  it('неудача: пропущенная нота — потеря жизни; если ничего не нажимать, первая же нота проходит всё поле и стоит жизни (очки остаются)', () => {
    const g = make();
    g.notes = [{ direction: 0, y: 17 }];
    tap(g, 'up');
    expect(g.score).toBe(10);
    // Ничего не нажимаем: появляется новая нота и опускается до последнего ряда (19); промах засчитывается только когда она уходит за него.
    let lowest = -1;
    let lost: BrickEvent[] | null = null;
    for (let t = 0; t < 400 && !lost; t++) {
      const out = g.step(NEUTRAL_BRICK_INPUT);
      if (out.some((e) => e.type === 'lifeLost')) lost = out;
      else lowest = Math.max(lowest, g.notes[0]?.y ?? -1);
    }
    expect(lost, 'пропущенная нота стоит жизни').not.toBeNull();
    expect(lowest, 'нота прошла до последнего ряда').toBe(19);
    expect(count(lost ?? [], 'tone')).toBe(0);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
    // нота, стоящая в последнем ряду и не принятая, уходит за поле на следующем шаге — тоже промах
    run(g, 80);
    g.notes = [{ direction: 2, y: 19 }];
    const missed = waitFor(g, 'lifeLost', 40);
    expect(missed.ticks).toBeLessThanOrEqual(10);
    expect(g.lives).toBe(2);
    expect(g.score).toBe(10);
  });

  it('неудача: четыре промаха — конец игры; очки остаются рекордом', () => {
    const g = make(2, 10);
    g.notes = [{ direction: 1, y: 17 }];
    tap(g, 'right');
    expect(g.score).toBe(10);
    for (let n = 1; n <= 4; n++) {
      g.notes = [{ direction: 0, y: 19 }];
      const { events } = waitFor(g, 'lifeLost', 40);
      expect(g.lives).toBe(4 - n);
      expect(count(events, 'gameOver')).toBe(n === 4 ? 1 : 0);
      if (n < 4) run(g, 80);
    }
    finishAnimation(g);
    expect(g.score).toBe(10);
    expect(g.hiScore).toBe(10);
  });
});

// ── dice ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe(`${DICE}: три кости`, () => {
  const sum = (dice: readonly number[]): number => dice.reduce((a, b) => a + b, 0);
  /** Верно ли предсказание по правилам справки: 0 — малая сумма 3–10, 1 — большая 11–18, 2 — три пятёрки. */
  const correct = (selection: number, dice: readonly number[]): boolean =>
    selection === 0 ? sum(dice) >= 3 && sum(dice) <= 10 : selection === 1 ? sum(dice) >= 11 && sum(dice) <= 18 : dice.every((v) => v === 5);
  const choose = (g: DiceGame, selection: number): void => {
    for (let n = 0; n < 3 && g.selection < selection; n++) tap(g, 'right');
    for (let n = 0; n < 3 && g.selection > selection; n++) tap(g, 'left');
    expect(g.selection).toBe(selection);
  };
  /** Бросок: ROTATE; затем идут такты, пока кости крутятся (около 36). Возвращает события броска. */
  const roll = (g: DiceGame): BrickEvent[] => [...g.step(makeBrickInput(['rotate'])), ...run(g, 50)];
  /** Игра в начале партии с выбранным предсказанием. */
  const game = (seed: number, selection = 0): DiceGame => {
    const g = new DiceGame({ seed });
    g.start();
    choose(g, selection);
    return g;
  };
  /** Кости, которые выпадут в партии с зерном `seed` на первом броске (проба на отдельной партии). */
  const outcome = (seed: number): number[] => {
    const g = game(seed);
    roll(g);
    return [...g.dice];
  };
  const findSeed = (accept: (dice: number[]) => boolean): number => {
    for (let seed = 1; seed <= 30000; seed++) if (accept(outcome(seed))) return seed;
    throw new Error('подходящее зерно не нашлось');
  };

  it('прогресс: верное предсказание — +1 очко и сигнал «бонус», без жизней и ставок; серия верных предсказаний копит очки', () => {
    const g = game(11);
    expect(g.id).toBe(DICE);
    expect(g.lives).toBeNull();
    for (let n = 1; n <= 6; n++) {
      // Игрок угадывает: пробный бросок по копии партии показывает, что выпадет, и выбирается предсказание, которое сбудется.
      const probe = deepClone(g);
      roll(probe);
      const selection = [0, 1, 2].find((s) => correct(s, probe.dice));
      expect(selection, `бросок ${n}: есть верное предсказание`).toBeDefined();
      choose(g, selection ?? 0);
      const events = roll(g);
      expect(g.dice).toEqual(probe.dice);
      expect(count(events, 'bonus'), `бросок ${n}`).toBe(1);
      expect(g.score).toBe(n);
      for (const die of g.dice) expect(die >= 1 && die <= 6).toBe(true);
      // На экране у каждой кости горит столько точек, сколько выпало (ровные клетки; мигающая клетка внизу — выбранное предсказание).
      expect(g.cells().filter((v) => v === 1).length, `бросок ${n}: точки на экране`).toBe(sum(g.dice));
      expect(g.cells().filter((v) => v === 2).length).toBe(1);
    }
    expect(g.score).toBe(6);
    expect(g.hiScore).toBe(6);
    expect(g.lives).toBeNull();
    expect(g.phase).toBe('playing');
  });

  it('малая и большая сумма: граница между 10 и 11, малая — 3–10, большая — 11–18', () => {
    const cases = [
      { name: 'сумма 10', pick: (d: number[]) => sum(d) === 10, small: true },
      { name: 'сумма 11', pick: (d: number[]) => sum(d) === 11, small: false },
      { name: 'сумма не больше 6', pick: (d: number[]) => sum(d) <= 6, small: true },
      { name: 'сумма не меньше 15', pick: (d: number[]) => sum(d) >= 15, small: false },
    ];
    for (const c of cases) {
      const seed = findSeed(c.pick);
      const small = game(seed, 0);
      const smallEvents = roll(small);
      expect(c.pick(small.dice), c.name).toBe(true);
      expect(count(smallEvents, 'bonus'), `${c.name}: малая`).toBe(c.small ? 1 : 0);
      expect(small.score).toBe(c.small ? 1 : 0);
      const large = game(seed, 1);
      const largeEvents = roll(large);
      expect(large.dice).toEqual(small.dice);
      expect(count(largeEvents, 'bonus'), `${c.name}: большая`).toBe(c.small ? 0 : 1);
      expect(large.score).toBe(c.small ? 0 : 1);
    }
  });

  it('три пятёрки: выигрывает только 5-5-5 (и тогда сумма 15 засчитывается как «большая»); близкие броски вроде 5-5-4 и 5-5-6 не считаются', () => {
    const triple = findSeed((d) => d.every((v) => v === 5));
    const win = game(triple, 2);
    expect(count(roll(win), 'bonus')).toBe(1);
    expect(win.dice).toEqual([5, 5, 5]);
    expect(win.score).toBe(1);
    const asLarge = game(triple, 1);
    roll(asLarge);
    expect(asLarge.score, '15 — большая сумма').toBe(1);
    const asSmall = game(triple, 0);
    roll(asSmall);
    expect(asSmall.score, '15 — не малая сумма').toBe(0);
    const near = findSeed((d) => d.filter((v) => v === 5).length === 2);
    const miss = game(near, 2);
    const events = roll(miss);
    expect(count(events, 'bonus')).toBe(0);
    expect(miss.score).toBe(0);
  });

  it('неудача: неверное предсказание — очков нет, сигнал «нельзя», жизней у игры нет, партия продолжается; уже набранный счёт промахи не уменьшают', () => {
    const g = game(11);
    const bet = (wantCorrect: boolean): { events: BrickEvent[] } => {
      // Пробный бросок по копии партии показывает, что выпадет; выбирается предсказание, которое сбудется (или нет).
      const probe = deepClone(g);
      roll(probe);
      const selection = [0, 1, 2].find((s) => correct(s, probe.dice) === wantCorrect);
      expect(selection, 'нужное предсказание нашлось').toBeDefined();
      choose(g, selection ?? 0);
      const events = roll(g);
      expect(g.dice).toEqual(probe.dice);
      return { events };
    };
    for (let n = 1; n <= 2; n++) expect(count(bet(true).events, 'bonus')).toBe(1);
    expect(g.score).toBe(2);
    for (let n = 1; n <= 6; n++) {
      const { events } = bet(false);
      expect(count(events, 'bonus'), `промах ${n}`).toBe(0);
      expect(count(events, 'blocked'), `промах ${n}`).toBe(1);
      expect(g.score, `после промаха ${n}`).toBe(2);
      expect(g.lives).toBeNull();
      expect(g.phase).toBe('playing');
    }
    expect(g.hiScore).toBe(2);
    // после промахов игра принимает следующий бросок и верное предсказание засчитывает
    bet(true);
    expect(g.score).toBe(3);
    expect(g.hiScore).toBe(3);
  });

  it('пока кости крутятся, ввод не принимается: предсказание не меняется, повторные нажатия не запускают второй бросок — исход один', () => {
    const g = game(21, 1);
    const events = [...g.step(makeBrickInput(['rotate']))];
    const frames = new Set<string>();
    for (let i = 0; i < 20; i++) {
      events.push(...g.step(makeBrickInput(i % 2 ? ['left'] : ['rotate'])));
      frames.add(g.dice.join(''));
    }
    expect(frames.size, 'кости на экране крутятся').toBeGreaterThan(1);
    events.push(...run(g, 100));
    expect(g.selection).toBe(1);
    expect(count(events, 'bonus') + count(events, 'blocked'), 'ровно один исход').toBe(1);
    const outcomeDice = [...g.dice];
    expect(g.score).toBe(correct(1, outcomeDice) ? 1 : 0);
    // ровно один бросок за нажатие: следующие тихие такты кости не трогают
    run(g, 60);
    expect(g.dice).toEqual(outcomeDice);
  });
});

// ── реестр сценариев ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('SCENARIO_GAMES: список сценарных игр', () => {
  it('каждая игра списка есть в библиотеке и без повторов', () => {
    expect(new Set(SCENARIO_GAMES).size).toBe(SCENARIO_GAMES.length);
    for (const id of SCENARIO_GAMES) expect(LIBRARY_GAMES[id].create({ seed: 1 }).id).toBe(id);
  });
});
