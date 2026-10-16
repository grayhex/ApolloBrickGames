import { describe, expect, it } from 'vitest';
import { BRICK_COLS, BRICK_ROWS, genuineTicks, msToTicks } from '../../../src/brick';
import { tetrisDef } from '../../../src/brick/games/tetris';
import {
  FIRST_TETROMINO,
  FIRST_SUPER,
  FIGURES,
  SHAPE_LINE,
  SHAPE_SQUARE,
  TETRIS_POOL,
  figureName,
  isSuperShape,
  makePiece,
  nextTetromino,
  prevTetromino,
  rotatePiece,
} from '../../../src/brick/games/tetris/shapes';
import {
  FIRST_LEVEL_MS,
  GARBAGE_PAUSE_TICKS,
  LINE_POINTS,
  POINTS_PER_SPEED,
  SOFT_DROP_TICKS,
  TENTH_LEVEL_MS,
} from '../../../src/brick/games/tetris/core';
import { conformance } from '../conformance';
import { Bot, Lab, hold, idle, plainLab, press, tap, types, until } from './tetrisLab';

/**
 * Правила тетриса (вариант 01 — обычный): появление, падение, повороты, ряды, очки, скорость, уровни, конец игры, превью.
 * Правила — по донору `TetrisGameI` (n0Live/BrickGame, MIT); времена перевода в такты — допущение игры (60 тактов в секунду).
 * Спецфигуры, особые режимы и классы J…P — в `tetrisVariants.test.ts`, Pentix — в `pentix.test.ts`.
 */
conformance(tetrisDef, { fuzzTicks: 800, seeds: [7] });

const FALL_1 = genuineTicks(1, FIRST_LEVEL_MS, TENTH_LEVEL_MS);
const FALL_10 = genuineTicks(10, FIRST_LEVEL_MS, TENTH_LEVEL_MS);

describe('тетрис: состав', () => {
  it('число вариантов устройства — 51, реализовано столько же; вариант 01 — обычный тетрис без спецфигур', () => {
    expect(tetrisDef.id).toBe('tetris');
    expect(tetrisDef.declaredModes).toBe(51);
    expect(tetrisDef.modes.length).toBe(51);
    expect(tetrisDef.modes[0]?.name.ru).toBe('Обычный');
    expect(new Lab('tetris').rule).toMatchObject({ letter: 'I', type: 1, lineTimer: false, morph: false, shift: false, family: 'plain', inverted: false });
    expect(new Lab('tetris').rule.supers).toEqual([]);
  });

  it('на устройстве поле 10 × 20, превью 4 × 4, жизней у тетриса нет', () => {
    const lab = plainLab();
    expect(lab.cells().length).toBe(BRICK_COLS * BRICK_ROWS);
    expect(lab.preview()?.length).toBe(16);
    expect(lab.lives).toBeNull();
    expect(lab.speed).toBe(1);
    expect(lab.level).toBe(1);
  });
});

/** Нижний ряд линии относительно точки привязки по углам 0°, 90°, 180°, 270° (после выравнивания донора). */
const LINE_LOWEST = [0, 1, -1, 1];

describe('тетрис: фигуры', () => {
  it('семь тетрамино из четырёх клеток; порядок каталога — Z, S, линия, T, квадрат, L, зеркальная L', () => {
    expect(TETRIS_POOL.map(figureName)).toEqual(['Z', 'S', 'Line', 'T', 'Square', 'L', 'MirroredL']);
    for (const shape of TETRIS_POOL) expect(makePiece(shape).cells.length, figureName(shape)).toBe(4);
  });

  it('поворот на 90° по часовой, четыре поворота возвращают фигуру; квадрат не вращается', () => {
    for (const shape of TETRIS_POOL) {
      const start = makePiece(shape);
      let piece = start;
      for (let i = 0; i < 4; i++) piece = rotatePiece(piece);
      expect(piece.cells, figureName(shape)).toEqual(start.cells);
      expect(piece.angle).toBe(0);
    }
    expect(rotatePiece(makePiece(SHAPE_SQUARE))).toEqual(makePiece(SHAPE_SQUARE));
    const line = makePiece(SHAPE_LINE);
    expect(line.maxY - line.minY).toBe(3);
    expect(rotatePiece(line).maxX - rotatePiece(line).minX).toBe(3);
  });

  it('после поворота фигура выравнивается, как у донора: нижний ряд на точке привязки (у линии — на 0, +1, −1 и +1 клетку по углам)', () => {
    for (const shape of TETRIS_POOL) {
      for (let angle = 0; angle < 4; angle++) {
        const piece = makePiece(shape, angle);
        const lowest = shape === SHAPE_LINE ? (LINE_LOWEST[angle] ?? 0) : 0;
        expect(piece.minY, `${figureName(shape)} ${angle}`).toBe(lowest);
        expect(piece.minX).toBeGreaterThanOrEqual(-2);
        expect(piece.maxX).toBeLessThanOrEqual(2);
      }
    }
  });

  it('смена фигуры вместо поворота идёт по кругу семи тетрамино; после последней — первая и угол на 90° дальше', () => {
    let piece = makePiece(FIRST_TETROMINO);
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      piece = nextTetromino(piece);
      seen.push(figureName(piece.shape));
    }
    expect(seen).toEqual(['S', 'Line', 'T', 'Square', 'L', 'MirroredL', 'Z']);
    expect(piece.angle).toBe(1);
    expect(prevTetromino(nextTetromino(makePiece(6, 2)))).toEqual(makePiece(6, 2));
  });

  it('четыре спецфигуры — в конце каталога: точка, пушка, грязевая пушка, бомба', () => {
    expect(FIGURES.slice(FIRST_SUPER).map((figure) => figure.name)).toEqual(['SuperPoint', 'SuperGun', 'SuperMudGun', 'SuperBomb']);
    expect(isSuperShape(FIRST_SUPER)).toBe(true);
    expect(isSuperShape(FIRST_SUPER - 1)).toBe(false);
  });
});

describe('тетрис: появление и превью', () => {
  it('фигура появляется по центру, нижним рядом в верхней строке поля, остальное — над экраном', () => {
    for (const shape of TETRIS_POOL) {
      const lab = plainLab();
      lab.wipe();
      lab.respawn(shape);
      const piece = lab.current;
      if (!piece) throw new Error('фигуры нет');
      expect(lab.py + piece.minY, figureName(shape)).toBe(BRICK_ROWS - 1);
      const rows = lab.rows();
      expect(rows[0]?.includes('#'), figureName(shape)).toBe(true);
      const columns = [...(rows[0] ?? '')].map((c, x) => (c === '#' ? x : -1)).filter((x) => x >= 0);
      expect(Math.min(...columns)).toBeGreaterThanOrEqual(3);
      expect(Math.max(...columns)).toBeLessThanOrEqual(6);
    }
  });

  it('превью показывает следующую фигуру по центру 4 × 4, после появления она становится падающей', () => {
    const lab = plainLab();
    lab.wipe();
    lab.setNext(6);
    expect(lab.previewRows()).toEqual(['....', '..#.', '.###', '....']);
    lab.respawn(6);
    expect(lab.current?.shape).toBe(6);
    expect(lab.previewRows().length).toBe(4);
  });

  it('превью — ровно клетки следующей фигуры', () => {
    for (const shape of TETRIS_POOL) {
      const lab = plainLab();
      lab.setNext(shape);
      const lit = lab.previewRows().join('').split('#').length - 1;
      expect(lit, figureName(shape)).toBe(4);
    }
  });
});

describe('тетрис: падение', () => {
  it('фигура опускается на клетку раз в 29 тактов на скорости 1 и раз в 11 на скорости 10', () => {
    expect([FALL_1, FALL_10]).toEqual([29, 11]);
    for (const [speed, period] of [
      [1, FALL_1],
      [10, FALL_10],
    ] as const) {
      const lab = plainLab({ speed });
      lab.wipe();
      lab.put(SHAPE_SQUARE, 0, 4, 12);
      idle(lab, period - 1);
      expect(lab.py, `скорость ${speed}`).toBe(12);
      idle(lab, 1);
      expect(lab.py).toBe(11);
      idle(lab, period);
      expect(lab.py).toBe(10);
    }
  });

  it('скорость растёт линейно от 480 мс на первой до 180 мс на десятой', () => {
    const periods: number[] = [];
    for (let speed = 1; speed <= 10; speed++) periods.push(plainLab({ speed }).fallPeriod);
    expect(periods[0]).toBe(msToTicks(480));
    expect(periods[9]).toBe(msToTicks(180));
    for (let i = 1; i < periods.length; i++) expect(periods[i] ?? 0).toBeLessThanOrEqual(periods[i - 1] ?? 0);
  });

  it('фигура ложится на дно и на другие клетки; после посадки новая появляется на ближайшем шаге падения', () => {
    const lab = plainLab();
    lab.wipe();
    lab.put(SHAPE_SQUARE, 0, 4, 3);
    until(lab, () => lab.landed, 200);
    expect(lab.cell(4, 0) + lab.cell(5, 0) + lab.cell(4, 1) + lab.cell(5, 1)).toBe(4);
    expect(lab.current).toBeNull();
    const before = lab.upcoming;
    idle(lab, FALL_1);
    expect(lab.current?.shape).toBe(before.shape);
    expect(lab.landed).toBe(false);
  });

  it('фигура останавливается на выступе, а не проходит сквозь него', () => {
    const lab = plainLab();
    lab.wipe();
    lab.fill(0, '....#.....');
    lab.put(SHAPE_SQUARE, 0, 4, 8);
    until(lab, () => lab.landed, 400);
    expect(lab.cell(4, 1)).toBe(1);
    expect(lab.cell(5, 1)).toBe(1);
    expect(lab.cell(4, 2)).toBe(1);
    expect(lab.cell(5, 2)).toBe(1);
    expect(lab.count()).toBe(5);
  });
});

describe('тетрис: кнопки', () => {
  it('влево и вправо — по клетке за нажатие, у стенки фигура стоит и звука нет', () => {
    const lab = plainLab();
    lab.wipe();
    lab.put(SHAPE_SQUARE, 0, 4, 12);
    expect(types(tap(lab, 'left'))).toContain('move');
    expect(lab.px).toBe(3);
    expect(types(tap(lab, 'right'))).toContain('move');
    expect(lab.px).toBe(4);
    lab.put(SHAPE_SQUARE, 0, 0, 12);
    expect(types(tap(lab, 'left'))).not.toContain('move');
    expect(lab.px).toBe(0);
    lab.put(SHAPE_SQUARE, 0, BRICK_COLS - 2, 12);
    expect(types(tap(lab, 'right'))).not.toContain('move');
    expect(lab.px).toBe(BRICK_COLS - 2);
  });

  it('зажатая кнопка повторяется раз в 5 тактов (90 мс): ходы на 1-м, 6-м и 11-м тактах', () => {
    for (const [ticks, x] of [
      [1, 3],
      [5, 3],
      [6, 2],
      [10, 2],
      [11, 1],
    ] as const) {
      const lab = plainLab();
      lab.wipe();
      lab.put(SHAPE_SQUARE, 0, 4, 12);
      hold(lab, 'left', ticks);
      expect(lab.px, `${ticks} тактов`).toBe(x);
    }
  });

  it('фигуру нельзя сдвинуть в клетки, занятые стеной', () => {
    const lab = plainLab();
    lab.wipe();
    lab.fill(5, '###.......');
    lab.put(SHAPE_SQUARE, 0, 3, 5);
    expect(tap(lab, 'left')).toEqual([]);
    expect(lab.px).toBe(3);
  });

  it('поворот по кнопкам ROTATE и «вверх», звук `rotate`; квадрат не вращается и звука нет', () => {
    const lab = plainLab();
    lab.wipe();
    lab.put(6, 0, 4, 10);
    expect(types(tap(lab, 'rotate'))).toContain('rotate');
    expect(lab.current?.angle).toBe(1);
    idle(lab, 20);
    expect(types(tap(lab, 'up'))).toContain('rotate');
    expect(lab.current?.angle).toBe(2);
    lab.put(SHAPE_SQUARE, 0, 4, 10);
    expect(types(tap(lab, 'rotate'))).not.toContain('rotate');
  });

  it('у стенки поворот сдвигает фигуру внутрь поля; если места нет — фигура не поворачивается', () => {
    const lab = plainLab();
    lab.wipe();
    lab.put(SHAPE_LINE, 0, 0, 10);
    tap(lab, 'rotate');
    expect(lab.current?.angle).toBe(1);
    const piece = lab.current;
    if (!piece) throw new Error('фигуры нет');
    expect(lab.px + piece.minX).toBeGreaterThanOrEqual(0);
    expect(lab.px + piece.maxX).toBeLessThan(BRICK_COLS);

    // горизонтальная линия лежит в ряду над привязкой и занимает колонки x − 1…x + 2: клетка справа мешает повороту
    const blocked = plainLab();
    blocked.wipe();
    blocked.put(SHAPE_LINE, 0, 3, 10);
    blocked.fill(11, '.....#....');
    expect(types(tap(blocked, 'rotate'))).not.toContain('rotate');
    expect(blocked.current?.angle).toBe(0);
  });

  it('мягкое падение: зажатая «вниз» опускает фигуру раз в 2 такта (30 мс), быстрее обычного', () => {
    expect(SOFT_DROP_TICKS).toBe(2);
    const lab = plainLab();
    lab.wipe();
    lab.put(SHAPE_SQUARE, 0, 4, 14);
    hold(lab, 'down', 7);
    expect(lab.py).toBe(14 - 4);
  });

  it('бросок (`fire`): фигура падает до упора, звуки `drop` и `lock`, посадка в том же такте', () => {
    const lab = plainLab();
    lab.wipe();
    lab.put(SHAPE_SQUARE, 0, 4, 12);
    const events = types(tap(lab, 'fire'));
    expect(events).toContain('drop');
    expect(events).toContain('lock');
    expect(lab.landed).toBe(true);
    expect(lab.count()).toBe(4);
    expect(lab.cell(4, 0)).toBe(1);
  });

  it('после посадки кнопки не двигают ничего, пока не появится новая фигура', () => {
    const lab = plainLab();
    lab.wipe();
    lab.put(SHAPE_SQUARE, 0, 4, 12);
    tap(lab, 'fire');
    const before = lab.settled();
    tap(lab, 'left');
    tap(lab, 'rotate');
    tap(lab, 'fire');
    expect(lab.settled()).toEqual(before);
  });

  it('пауза замораживает падение, кнопки и таймеры', () => {
    const lab = plainLab();
    lab.wipe();
    lab.put(SHAPE_SQUARE, 0, 4, 12);
    lab.pause();
    const rows = lab.rows();
    idle(lab, 200);
    press(lab, 'left');
    expect(lab.rows()).toEqual(rows);
    lab.resume();
    idle(lab, FALL_1);
    expect(lab.py).toBe(11);
  });
});

describe('тетрис: ряды и очки', () => {
  /** Колодец из `rows` рядов, в который вертикальная линия встаёт в колонку 0; ряды без дыр в колонке 0 — полные. */
  function well(rows: number): Lab {
    const lab = plainLab();
    lab.wipe();
    for (let y = 0; y < rows; y++) lab.fill(y, '.#########');
    lab.put(SHAPE_LINE, 0, 0, 10);
    return lab;
  }

  it('очки за ряды одной посадки: 1, 3, 7, 15 за 1–4 ряда (1, 2, 4, 8 за каждый следующий)', () => {
    expect(LINE_POINTS).toEqual([0, 1, 2, 4, 8]);
    for (const [rows, points] of [
      [1, 1],
      [2, 3],
      [3, 7],
      [4, 15],
    ] as const) {
      const lab = well(rows);
      const events = tap(lab, 'fire');
      expect(types(events), `${rows} рядов`).toContain('lines');
      const lines = events.find((event) => event.type === 'lines');
      expect(lines && 'count' in lines ? lines.count : -1).toBe(rows);
      until(lab, () => lab.count() === 4 - rows, 600);
      expect(lab.score, `${rows} рядов`).toBe(points);
    }
  });

  it('собранный ряд исчезает, всё выше опускается на клетку, сверху — пустой ряд', () => {
    const lab = plainLab();
    lab.wipe();
    lab.fill(0, '####..####');
    lab.fill(1, '#.#.....#.');
    lab.put(SHAPE_SQUARE, 0, 4, 10);
    tap(lab, 'fire');
    until(lab, () => lab.settled().subarray(0, BRICK_COLS).join('') === '1010110010', 600);
    expect(lab.settled().subarray(0, BRICK_COLS).join('')).toBe('1010110010');
    expect(lab.score).toBe(1);
    expect(lab.settled().subarray(BRICK_COLS).every((v) => v === 0)).toBe(true);
  });

  it('очки не начисляются, пока ряд не собран', () => {
    const lab = plainLab();
    lab.wipe();
    lab.fill(0, '##.......#');
    lab.put(SHAPE_SQUARE, 0, 4, 10);
    tap(lab, 'fire');
    expect(lab.score).toBe(0);
    expect(lab.count()).toBe(7);
  });

  it('полный ряд в верхней строке поля не считается (проверка идёт до предпоследней строки, как у донора)', () => {
    const lab = plainLab();
    lab.wipe();
    lab.fill(BRICK_ROWS - 1, '##########');
    lab.put(SHAPE_SQUARE, 0, 4, 3);
    tap(lab, 'fire');
    expect(lab.score).toBe(0);
  });

  it('каждые 100 очков скорость растёт на единицу, звук `levelUp`', () => {
    const lab = well(1);
    lab.poke(POINTS_PER_SPEED - 1);
    const events = tap(lab, 'fire');
    expect(types(events)).toContain('levelUp');
    expect(lab.speed).toBe(2);
    expect(lab.score).toBe(POINTS_PER_SPEED);
  });

  it('после десятой скорости — снова первая, уровень +1 и один новый ряд снизу', () => {
    const lab = plainLab({ speed: 10 });
    lab.wipe();
    lab.fill(0, '.#########');
    lab.put(SHAPE_LINE, 0, 0, 10);
    lab.poke(999);
    tap(lab, 'fire');
    expect(lab.speed).toBe(1);
    expect(lab.level).toBe(2);
    expect(lab.garbageLeft).toBe(1);
    until(lab, () => lab.garbageLeft === 0 && lab.count() > 3, 600);
    expect(lab.garbageLeft).toBe(0);
    const bottom = lab.settled().subarray(0, BRICK_COLS);
    const filled = bottom.reduce((sum, v) => sum + v, 0);
    expect(filled).toBeGreaterThan(0);
    expect(filled).toBeLessThan(BRICK_COLS);
    expect(GARBAGE_PAUSE_TICKS).toBe(msToTicks(120));
  });
});

describe('тетрис: уровень и случайные ряды', () => {
  it('на первом уровне поле пустое, на уровне N снизу лежат N − 1 случайных рядов: в каждом и клетки, и дыры', () => {
    const first = plainLab({ level: 1 });
    expect(first.count()).toBe(0);
    for (const level of [2, 5, 10]) {
      const lab = plainLab({ level, seed: 11 });
      const rows = lab.settled();
      for (let y = 0; y < level - 1; y++) {
        const filled = rows.subarray(y * BRICK_COLS, (y + 1) * BRICK_COLS).reduce((sum, v) => sum + v, 0);
        expect(filled, `уровень ${level}, ряд ${y}`).toBeGreaterThan(0);
        expect(filled).toBeLessThan(BRICK_COLS);
      }
      for (let y = level - 1; y < BRICK_ROWS; y++) {
        expect(rows.subarray(y * BRICK_COLS, (y + 1) * BRICK_COLS).every((v) => v === 0)).toBe(true);
      }
    }
  });
});

describe('тетрис: конец игры', () => {
  it('новая фигура не поместилась — конец игры: заливка поля, фаза `over`, рекорд сохраняется', () => {
    const lab = plainLab({ hiScore: 5 });
    lab.wipe();
    lab.fill(BRICK_ROWS - 1, '#.#.#.#.#.');
    lab.poke(42);
    lab.respawn(SHAPE_SQUARE);
    expect(types(idle(lab, 1))).toContain('gameOver');
    expect(lab.gameEnded).toBe(true);
    until(lab, () => lab.phase === 'over', 200);
    expect(lab.phase).toBe('over');
    expect(lab.overFill).toBe(BRICK_ROWS);
    expect(lab.hiScore).toBe(42);
    // новая партия чистая, рекорд на месте
    lab.start();
    expect(lab.phase).toBe('playing');
    expect(lab.score).toBe(0);
    expect(lab.hiScore).toBe(42);
    expect(lab.count()).toBe(0);
  });

  it('фигура села выше экрана — тоже конец игры', () => {
    const lab = plainLab();
    lab.wipe();
    for (let y = 0; y < BRICK_ROWS - 2; y++) lab.fill(y, '#.#.#.#.#.');
    lab.put(SHAPE_LINE, 0, 0, BRICK_ROWS - 1);
    const events = types(tap(lab, 'fire'));
    expect(events).toContain('gameOver');
  });
});

describe('тетрис: «бот»', () => {
  it('простой игрок держится десятки фигур и собирает ряды: очки растут, скорость повышается, игра не заканчивается', () => {
    const lab = plainLab({ seed: 3 });
    const bot = new Bot(lab);
    let lines = 0;
    for (let tick = 0; tick < 12_000 && lab.phase === 'playing'; tick++) {
      for (const event of lab.step(bot.next())) if (event.type === 'lines') lines += event.count;
    }
    expect(lab.phase).toBe('playing');
    expect(lines).toBeGreaterThan(40);
    expect(lab.score).toBeGreaterThan(100);
    expect(lab.speed).toBeGreaterThan(1);
  });

  it('ничего не делающий игрок проигрывает: фигуры доходят до верха', () => {
    const lab = plainLab({ seed: 3 });
    until(lab, () => lab.phase === 'over', 20_000);
    expect(lab.phase).toBe('over');
    expect(lab.gameEnded).toBe(true);
  });
});

