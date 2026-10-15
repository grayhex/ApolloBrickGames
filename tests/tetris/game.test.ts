import { describe, expect, it } from 'vitest';
import {
  FIELD_COLUMNS,
  FIELD_ROWS,
  GRAVITY_TICKS,
  MAX_SCORE,
  NEUTRAL_TETRIS_INPUT,
  PIECE_KINDS,
  SPAWN_COLUMN,
  TETRIS_TICK_HZ,
  TetrisGame,
  cellsOf,
  gravityTicks,
  makeTetrisInput,
  pieceCellValue,
  spawnRowOf,
  type PieceKind,
} from '../../src/tetris';
import { bottomRows, filledCount, hardDrop, hold, paint, place, press, rowsOf, run, startedGame, typesOf } from './helpers';

/** Крайние занятые колонки и строки снимка (поле целиком, фигура впечатана). */
function bounds(cells: Uint8Array): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  cells.forEach((value, index) => {
    if (value === 0) return;
    const x = index % FIELD_COLUMNS;
    const y = Math.floor(index / FIELD_COLUMNS);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return { minX, maxX, minY, maxY };
}

/** Виды фигур по очереди появления; между сбросами поле очищается, чтобы партия не кончилась. */
function spawnKinds(game: TetrisGame, count: number): PieceKind[] {
  const kinds: PieceKind[] = [];
  for (let i = 0; i < count; i++) {
    const piece = game.piece;
    if (!piece) throw new Error('фигуры нет — партия кончилась раньше времени');
    kinds.push(piece.kind);
    game.field.fill(0);
    hardDrop(game);
  }
  return kinds;
}

const isPermutation = (kinds: readonly PieceKind[]): boolean =>
  kinds.length === PIECE_KINDS.length && PIECE_KINDS.every((kind) => kinds.includes(kind));

describe('новая партия: исходное состояние и параметры', () => {
  it('до старта: фаза ready, пустое поле, нулевой счёт, следующая фигура уже известна', () => {
    const game = new TetrisGame({ seed: 3 });
    expect(game.phase).toBe('ready');
    expect(game.piece).toBeNull();
    expect(game.field).toHaveLength(FIELD_COLUMNS * FIELD_ROWS);
    expect(filledCount(game.field)).toBe(0);
    expect(game.score).toBe(0);
    expect(game.hiScore).toBe(0);
    expect(game.lines).toBe(0);
    expect(game.speed).toBe(1);
    expect(game.level).toBe(1);
    expect(game.clearRows).toEqual([]);
    expect(game.clearTimer).toBe(0);
    expect(game.overFill).toBe(0);
    expect(game.tick).toBe(0);
    expect(PIECE_KINDS).toContain(game.next);
    expect(TETRIS_TICK_HZ).toBe(60);
  });

  it('параметры: хай-скор и стартовая скорость; значения вне диапазона обрезаются', () => {
    const game = new TetrisGame({ hiScore: 1234, startSpeed: 4 });
    expect(game.hiScore).toBe(1234);
    expect(game.speed).toBe(4);
    expect(new TetrisGame({ startSpeed: 0 }).speed).toBe(1);
    expect(new TetrisGame({ startSpeed: 99 }).speed).toBe(10);
    expect(new TetrisGame({ startSpeed: 3.7 }).speed).toBe(3);
    expect(new TetrisGame({ hiScore: -5 }).hiScore).toBe(0);
    expect(new TetrisGame({ hiScore: MAX_SCORE * 2 }).hiScore).toBe(MAX_SCORE);
  });

  it('step до старта ничего не делает: такты не считаются, событий нет', () => {
    const game = new TetrisGame({ seed: 5 });
    const before = rowsOf(game.snapshot());
    expect(run(game, 100, press('left', 'rotate', 'drop'))).toEqual([]);
    expect(game.phase).toBe('ready');
    expect(game.tick).toBe(0);
    expect(game.piece).toBeNull();
    expect(rowsOf(game.snapshot())).toEqual(before);
  });

  it('start: событие started, фаза playing, первая фигура — та, что показывалась как next', () => {
    const game = new TetrisGame({ seed: 11 });
    const preview = game.next;
    expect(game.start()).toEqual([{ type: 'started' }]);
    expect(game.phase).toBe('playing');
    expect(game.piece).toEqual({ kind: preview, rotation: 0, x: SPAWN_COLUMN, y: spawnRowOf(preview) });
    expect(PIECE_KINDS).toContain(game.next);
  });

  it('повторный start во время игры и на паузе ничего не меняет', () => {
    const game = startedGame();
    run(game, 5);
    const piece = { ...game.piece };
    expect(game.start()).toEqual([]);
    game.pause();
    expect(game.start()).toEqual([]);
    expect(game.phase).toBe('paused');
    game.resume();
    expect(game.piece).toEqual(piece);
  });

  it.each(PIECE_KINDS)('фигура %s появляется по центру сверху: верхняя клетка на строке 0, колонки 3..6', (kind) => {
    const game = new TetrisGame({ seed: 1 });
    game.next = kind;
    game.start();
    const { minX, maxX, minY } = bounds(game.snapshot());
    expect(minY).toBe(0);
    expect(minX).toBeGreaterThanOrEqual(3);
    expect(maxX).toBeLessThanOrEqual(6);
    expect(game.snapshot().filter((value) => value === pieceCellValue(kind))).toHaveLength(4);
  });
});

describe('мешок «7 из 7» и зерно', () => {
  it('каждые семь подряд идущих появлений от начала партии — перестановка всех семи фигур', () => {
    const game = startedGame({ seed: 42 });
    const kinds = spawnKinds(game, 7 * 12);
    for (let bag = 0; bag < 12; bag++) {
      const slice = kinds.slice(bag * 7, bag * 7 + 7);
      expect(isPermutation(slice), `мешок ${bag}: ${slice.join('')}`).toBe(true);
    }
  });

  it('мешок не зависит от зерна: для разных зёрен каждые семь — перестановка', () => {
    for (const seed of [0, 1, 2, 12345, 0xffffffff]) {
      const kinds = spawnKinds(startedGame({ seed }), 21);
      for (let bag = 0; bag < 3; bag++) {
        expect(isPermutation(kinds.slice(bag * 7, bag * 7 + 7)), `зерно ${seed}, мешок ${bag}`).toBe(true);
      }
    }
  });

  it('одно зерно — одна последовательность, разные зёрна — разные', () => {
    const a = spawnKinds(startedGame({ seed: 99 }), 28);
    const b = spawnKinds(startedGame({ seed: 99 }), 28);
    const c = spawnKinds(startedGame({ seed: 100 }), 28);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('next всегда корректен и совпадает с фигурой, которая появится следующей', () => {
    const game = startedGame({ seed: 8 });
    for (let i = 0; i < 40; i++) {
      expect(PIECE_KINDS).toContain(game.next);
      const expected = game.next;
      game.field.fill(0);
      hardDrop(game);
      expect(game.piece?.kind).toBe(expected);
    }
  });

  it('next корректен и в ready; после restart мешок снова собирается целиком', () => {
    const game = startedGame({ seed: 21 });
    spawnKinds(game, 10);
    game.restart();
    expect(game.phase).toBe('ready');
    expect(PIECE_KINDS).toContain(game.next);
    game.start();
    const kinds = spawnKinds(game, 14);
    expect(isPermutation(kinds.slice(0, 7))).toBe(true);
    expect(isPermutation(kinds.slice(7, 14))).toBe(true);
  });
});

describe('движение вбок и стены', () => {
  it('влево и вправо на одну клетку за нажатие, событие move на каждый сдвиг, высота не меняется', () => {
    const game = startedGame();
    place(game, 'T', 0, 4, 5);
    expect(typesOf(game.step(press('left')))).toEqual(['move']);
    expect(game.piece?.x).toBe(3);
    expect(typesOf(game.step(press('right')))).toEqual(['move']);
    expect(typesOf(game.step(press('right')))).toEqual(['move']);
    expect(game.piece).toEqual({ kind: 'T', rotation: 0, x: 5, y: 5 });
  });

  it.each(PIECE_KINDS)('фигура %s упирается в обе стены и дальше не уходит', (kind) => {
    const game = startedGame();
    place(game, kind, 0, 3, 8);
    let moves = 0;
    for (let i = 0; i < 15; i++) {
      moves += game.step(press('left')).filter((event) => event.type === 'move').length;
      game.step(NEUTRAL_TETRIS_INPUT);
    }
    expect(bounds(game.snapshot()).minX).toBe(0);
    expect(moves).toBe(3 + Math.min(...cellsOf(kind, 0).map(([dx]) => dx))); // из x = 3 до стены
    for (let i = 0; i < 15; i++) {
      game.step(press('right'));
      game.step(NEUTRAL_TETRIS_INPUT);
    }
    expect(bounds(game.snapshot()).maxX).toBe(FIELD_COLUMNS - 1);
  });

  it('у стены сдвига нет, события move тоже', () => {
    const game = startedGame();
    place(game, 'O', 0, -1, 5); // клетки O в колонках 0 и 1
    expect(game.step(press('left'))).toEqual([]);
    expect(game.piece?.x).toBe(-1);
  });

  it('зафиксированные клетки тоже стена', () => {
    const game = startedGame();
    place(game, 'O', 0, 4, 5); // клетки в колонках 5, 6 на строках 5, 6
    game.field[5 * FIELD_COLUMNS + 4] = 3;
    expect(game.step(press('left'))).toEqual([]);
    expect(game.piece?.x).toBe(4);
    expect(typesOf(game.step(press('right')))).toEqual(['move']);
  });

  it('одновременный фронт «влево» и «вправо» фигуру не двигает', () => {
    const game = startedGame();
    place(game, 'T', 0, 4, 5);
    expect(game.step(press('left', 'right'))).toEqual([]);
    expect(game.piece?.x).toBe(4);
  });
});

describe('автоповтор (DAS): через 12 тактов, затем каждые 3', () => {
  it('влево: сразу шаг, потом пауза 12 тактов, затем шаг каждые 3 такта', () => {
    const game = startedGame();
    place(game, 'T', 0, 7, 2);
    game.step(press('left'));
    expect(game.piece?.x).toBe(6);
    for (let k = 2; k <= 24; k++) {
      game.step(hold('left'));
      const moved = k < 13 ? 1 : 2 + Math.floor((k - 13) / 3);
      expect(game.piece?.x, `такт ${k}`).toBe(7 - moved);
    }
  });

  it('вправо: то же самое зеркально', () => {
    const game = startedGame();
    place(game, 'I', 0, 0, 2);
    game.step(press('right'));
    expect(game.piece?.x).toBe(1);
    for (let k = 2; k <= 22; k++) {
      game.step(hold('right'));
      const moved = k < 13 ? 1 : 2 + Math.floor((k - 13) / 3);
      expect(game.piece?.x, `такт ${k}`).toBe(moved);
    }
  });

  it('повтор приходит событием move ровно в такты 13, 16, 19', () => {
    const game = startedGame();
    place(game, 'T', 0, 7, 2);
    game.step(press('left'));
    const moveTicks: number[] = [];
    for (let k = 2; k <= 20; k++) {
      if (game.step(hold('left')).some((event) => event.type === 'move')) moveTicks.push(k);
    }
    expect(moveTicks).toEqual([13, 16, 19]);
  });

  it('отпускание сбрасывает повтор: после нового нажатия снова ждать 12 тактов', () => {
    const game = startedGame();
    place(game, 'T', 0, 7, 2);
    game.step(press('left')); // 6
    run(game, 8, hold('left'));
    game.step(NEUTRAL_TETRIS_INPUT);
    game.step(press('left')); // 5, задержка с нуля
    expect(game.piece?.x).toBe(5);
    run(game, 11, hold('left'));
    expect(game.piece?.x).toBe(5);
    game.step(hold('left'));
    expect(game.piece?.x).toBe(4);
  });

  it('смена направления сбрасывает повтор: новое направление ждёт полные 12 тактов', () => {
    const game = startedGame();
    place(game, 'T', 0, 4, 2);
    game.step(press('left')); // 3
    run(game, 5, hold('left'));
    game.step(makeTetrisInput(['right'], ['left', 'right'])); // 4: свежий фронт «вправо» побеждает
    expect(game.piece?.x).toBe(4);
    run(game, 11, hold('left', 'right'));
    expect(game.piece?.x).toBe(4);
    game.step(hold('left', 'right'));
    expect(game.piece?.x).toBe(5); // повторяется «вправо», а не «влево»
  });

  it('отпустили новую кнопку, старая ещё зажата: без рывка, повтор копится заново', () => {
    const game = startedGame();
    place(game, 'T', 0, 4, 2);
    game.step(press('left')); // 3
    game.step(makeTetrisInput(['right'], ['left', 'right'])); // 4
    expect(game.step(hold('left'))).toEqual([]); // «вправо» отпущена — сразу не сдвигаем
    expect(game.piece?.x).toBe(4);
    run(game, 11, hold('left'));
    expect(game.piece?.x).toBe(4);
    game.step(hold('left'));
    expect(game.piece?.x).toBe(3);
  });

  it('кнопка зажата без фронта (его «проглотила» анимация) — сдвиг на первом же такте', () => {
    const game = startedGame();
    place(game, 'T', 0, 4, 2);
    expect(typesOf(game.step(hold('left')))).toEqual(['move']);
    expect(game.piece?.x).toBe(3);
  });

  it('обе кнопки зажаты без фронта — движения нет', () => {
    const game = startedGame();
    place(game, 'T', 0, 4, 2);
    run(game, 30, hold('left', 'right'));
    expect(game.piece?.x).toBe(4);
  });
});

describe('падение: скорость, мягкое и жёсткое', () => {
  it('таблица тактов на строку: 48 43 38 33 28 23 18 13 8 6', () => {
    expect([...GRAVITY_TICKS]).toEqual([48, 43, 38, 33, 28, 23, 18, 13, 8, 6]);
    expect(gravityTicks(1, false)).toBe(48);
    expect(gravityTicks(10, false)).toBe(6);
    expect(gravityTicks(1, true)).toBe(2);
    expect(gravityTicks(10, true)).toBe(2);
  });

  it.each(GRAVITY_TICKS.map((ticks, index) => [index + 1, ticks] as const))(
    'скорость %i: фигура опускается на строку каждые %i тактов, очков за это нет',
    (speed, ticks) => {
      const game = startedGame({ startSpeed: speed });
      const y0 = game.piece?.y ?? NaN;
      run(game, ticks - 1);
      expect(game.piece?.y).toBe(y0);
      run(game, 1);
      expect(game.piece?.y).toBe(y0 + 1);
      run(game, ticks - 1);
      expect(game.piece?.y).toBe(y0 + 1);
      run(game, 1);
      expect(game.piece?.y).toBe(y0 + 2);
      expect(game.score).toBe(0);
    },
  );

  it('мягкое падение: пока зажато «вниз» — строка каждые 2 такта и +1 очко за строку', () => {
    const game = startedGame();
    place(game, 'O', 0, 3, 0);
    const events = run(game, 10, hold('down'));
    expect(game.piece?.y).toBe(5);
    expect(game.score).toBe(5);
    expect(events).toEqual([]);
    run(game, 3);
    expect(game.piece?.y).toBe(5);
    expect(game.score).toBe(5);
  });

  it('мягкое падение одинаково быстрое на любой скорости: строка за 2 такта', () => {
    for (const speed of [1, 5, 10]) {
      const game = startedGame({ startSpeed: speed });
      place(game, 'O', 0, 3, 0);
      run(game, 8, hold('down'));
      expect(game.piece?.y, `скорость ${speed}`).toBe(4);
    }
  });

  it('мягкое падение до пола: очки только за реально пройденные строки, затем фиксация без очков', () => {
    const game = startedGame();
    place(game, 'O', 0, 3, 17); // низ O на строке 18, до пола одна строка
    const events = run(game, 4, hold('down')); // такт 2: строка вниз (+1), такт 4: пол — фиксация
    expect(game.score).toBe(1);
    expect(typesOf(events)).toEqual(['lock']);
    expect(bottomRows(game.field, 2)).toEqual(['....22....', '....22....']);
  });

  it('жёсткий сброс: падает до упора, +2 очка за строку, фиксируется сразу, события drop и lock', () => {
    const game = startedGame();
    place(game, 'O', 0, 3, 0);
    const next = game.next;
    expect(typesOf(hardDrop(game))).toEqual(['drop', 'lock']);
    expect(game.score).toBe(2 * 18);
    expect(bottomRows(game.field, 2)).toEqual(['....22....', '....22....']);
    expect(game.piece?.kind).toBe(next);
    expect(game.piece?.y).toBe(spawnRowOf(next));
  });

  it('жёсткий сброс на стопку: фигура ложится сверху, а не проваливается', () => {
    const game = startedGame();
    paint(game, ['..######..', '..######..']);
    place(game, 'I', 0, 3, 0); // горизонтальная палка, клетки в колонках 3..6
    hardDrop(game);
    expect(bottomRows(game.field, 3)).toEqual(['...1111...', '..111111..', '..111111..']);
    expect(game.score).toBe(2 * 16);
  });

  it('новая фигура после жёсткого сброса сама не падает мгновенно: счётчик падения обнулён', () => {
    const game = startedGame();
    run(game, 40);
    hardDrop(game);
    const y0 = game.piece?.y ?? NaN;
    run(game, 47);
    expect(game.piece?.y).toBe(y0);
    run(game, 1);
    expect(game.piece?.y).toBe(y0 + 1);
  });

  it('жёсткий сброс побеждает мягкое падение в том же такте', () => {
    const game = startedGame();
    place(game, 'O', 0, 3, 0);
    game.step(makeTetrisInput(['drop'], ['down']));
    expect(game.score).toBe(2 * 18);
  });

  it('фиксация без задержки: на тактовом падении, которое не может сдвинуть фигуру, она встаёт в этом же такте', () => {
    const game = startedGame();
    place(game, 'O', 0, 3, 18);
    expect(run(game, 47)).toEqual([]);
    expect(game.piece?.y).toBe(18);
    expect(typesOf(game.step(NEUTRAL_TETRIS_INPUT))).toEqual(['lock']);
    expect(bottomRows(game.field, 2)).toEqual(['....22....', '....22....']);
    expect(game.piece).not.toBeNull();
  });

  it('с зажатым «вниз» фигура на полу фиксируется в течение двух тактов', () => {
    const game = startedGame();
    place(game, 'O', 0, 3, 18);
    expect(game.step(hold('down'))).toEqual([]);
    expect(typesOf(game.step(hold('down')))).toEqual(['lock']);
  });

  it('фигура на стопке фиксируется так же, как на полу', () => {
    const game = startedGame();
    paint(game, ['....#.....']);
    place(game, 'O', 0, 3, 17); // клетки в колонках 4, 5 на строках 17, 18; под колонкой 4 стоит блок
    run(game, 47);
    expect(typesOf(game.step(NEUTRAL_TETRIS_INPUT))).toEqual(['lock']);
    expect(game.field[18 * FIELD_COLUMNS + 4]).toBe(2);
  });
});

describe('поворот по часовой и кики у стен', () => {
  it('четыре поворота подряд возвращают исходное положение; каждый даёт событие rotate', () => {
    const game = startedGame();
    place(game, 'T', 0, 3, 5);
    for (const rotation of [1, 2, 3, 0]) {
      expect(typesOf(game.step(press('rotate')))).toEqual(['rotate']);
      expect(game.piece).toEqual({ kind: 'T', rotation, x: 3, y: 5 });
    }
  });

  it('удержание кнопки поворот не повторяет: нужен новый фронт', () => {
    const game = startedGame();
    place(game, 'T', 0, 3, 5);
    game.step(press('rotate'));
    run(game, 30, hold('rotate'));
    expect(game.piece?.rotation).toBe(1);
  });

  it('O при повороте остаётся на месте и выглядит так же', () => {
    const game = startedGame();
    place(game, 'O', 0, 3, 5);
    const before = rowsOf(game.snapshot());
    game.step(press('rotate'));
    expect(rowsOf(game.snapshot())).toEqual(before);
  });

  it('кик от левой стены: I в колонке 0 (x = -2) уходит на +2', () => {
    const game = startedGame();
    place(game, 'I', 1, -2, 5);
    game.step(press('rotate'));
    expect(game.piece).toEqual({ kind: 'I', rotation: 2, x: 0, y: 5 });
  });

  it('кик от правой стены: вертикальная I в колонке 9 уходит на -2', () => {
    const game = startedGame();
    place(game, 'I', 3, 8, 5); // вертикаль в колонке 9
    game.step(press('rotate'));
    expect(game.piece).toEqual({ kind: 'I', rotation: 0, x: 6, y: 5 });
  });

  it('T у левой стены: -1 не помогает, берётся +1', () => {
    const game = startedGame();
    place(game, 'T', 1, -1, 5);
    game.step(press('rotate'));
    expect(game.piece).toEqual({ kind: 'T', rotation: 2, x: 0, y: 5 });
  });

  it('T у правой стены: берётся -1', () => {
    const game = startedGame();
    place(game, 'T', 3, 8, 5);
    game.step(press('rotate'));
    expect(game.piece).toEqual({ kind: 'T', rotation: 0, x: 7, y: 5 });
  });

  it('порядок попыток по x: 0, потом -1, потом +1', () => {
    const game = startedGame();
    place(game, 'T', 0, 3, 5);
    game.field[7 * FIELD_COLUMNS + 4] = 5; // мешает повороту на месте (клетка нижнего «хвоста» T)
    game.step(press('rotate'));
    expect(game.piece).toEqual({ kind: 'T', rotation: 1, x: 2, y: 5 }); // -1 свободен — берётся он

    const other = startedGame();
    place(other, 'T', 1, 3, 5);
    other.field[6 * FIELD_COLUMNS + 3] = 5; // мешает повороту на месте и на -1
    other.step(press('rotate'));
    expect(other.piece).toEqual({ kind: 'T', rotation: 2, x: 4, y: 5 }); // остаётся +1
  });

  it('пол-кик: плоская I у пола после поворота встаёт вертикально на две строки выше', () => {
    const game = startedGame();
    place(game, 'I', 0, 3, 18); // клетки на строке 19
    game.step(press('rotate'));
    expect(game.piece).toEqual({ kind: 'I', rotation: 1, x: 3, y: 16 });
  });

  it('пол-кик: T у пола поднимается на строку', () => {
    const game = startedGame();
    place(game, 'T', 0, 3, 18);
    game.step(press('rotate'));
    expect(game.piece).toEqual({ kind: 'T', rotation: 1, x: 3, y: 17 });
  });

  it('вертикальная I сразу после появления поворачивается (опускается на строку: поле сверху закрыто)', () => {
    const game = new TetrisGame({ seed: 1 });
    game.next = 'I';
    game.start();
    expect(game.piece?.y).toBe(-1);
    game.step(press('rotate'));
    expect(game.piece).toEqual({ kind: 'I', rotation: 1, x: SPAWN_COLUMN, y: 0 });
  });

  it('если некуда встать — поворота нет, события нет, фигура не двигается', () => {
    const game = startedGame();
    // Колодец шириной в клетку на строках 5..8 в колонке 4: вертикальная I стоит в нём.
    for (let y = 5; y <= 8; y++) {
      for (let x = 0; x < FIELD_COLUMNS; x++) if (x !== 4) game.field[y * FIELD_COLUMNS + x] = 3;
    }
    place(game, 'I', 1, 2, 5); // вертикаль в колонке 4
    expect(game.step(press('rotate'))).toEqual([]);
    expect(game.piece).toEqual({ kind: 'I', rotation: 1, x: 2, y: 5 });
  });
});

describe('снимок и тень приземления', () => {
  it('snapshot — копия: правка снимка не меняет поле', () => {
    const game = startedGame();
    const snap = game.snapshot();
    snap.fill(7);
    expect(filledCount(game.field)).toBe(0);
    expect(game.snapshot()).not.toBe(snap);
  });

  it('snapshot: поле плюс активная фигура значением её вида; без фигуры — просто поле', () => {
    const game = startedGame();
    paint(game, ['6........6']);
    place(game, 'T', 0, 3, 5);
    const snap = game.snapshot();
    expect(snap.filter((value) => value === pieceCellValue('T'))).toHaveLength(4);
    expect(filledCount(snap)).toBe(filledCount(game.field) + 4);
    expect(snap[5 * FIELD_COLUMNS + 4]).toBe(pieceCellValue('T'));
    expect(snap[6 * FIELD_COLUMNS + 3]).toBe(pieceCellValue('T'));
    game.piece = null;
    expect([...game.snapshot()]).toEqual([...game.field]);
  });

  it('до старта snapshot — пустое поле', () => {
    expect(filledCount(new TetrisGame().snapshot())).toBe(0);
  });

  it('ghostRow: строка, куда упадёт фигура; совпадает с положением после жёсткого сброса', () => {
    const game = startedGame();
    paint(game, ['....#.....']);
    place(game, 'O', 0, 3, 0);
    expect(game.ghostRow()).toBe(17); // низ O на строке 18, над блоком в колонке 4
    place(game, 'O', 0, 6, 0);
    expect(game.ghostRow()).toBe(18);
    hardDrop(game);
    expect(bottomRows(game.field, 2)).toEqual(['.......22.', '....1..22.']);
  });

  it('ghostRow не двигает фигуру', () => {
    const game = startedGame();
    place(game, 'T', 0, 3, 4);
    game.ghostRow();
    expect(game.piece).toEqual({ kind: 'T', rotation: 0, x: 3, y: 4 });
  });

  it('ghostRow равен null, когда фигуры нет: до старта и во время анимации очистки', () => {
    expect(new TetrisGame().ghostRow()).toBeNull();
    const game = startedGame();
    paint(game, ['#########.']);
    place(game, 'I', 1, 7, 0);
    hardDrop(game);
    expect(game.piece).toBeNull();
    expect(game.ghostRow()).toBeNull();
  });
});
