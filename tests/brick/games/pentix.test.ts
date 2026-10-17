import { scenarioSuite } from '../scenarioCoverage';
import { describe, expect, it } from 'vitest';
import { BRICK_COLS, BRICK_ROWS, PREVIEW_COLS, PREVIEW_ROWS } from '../../../src/brick';
import { BRICK_GAMES } from '../../../src/brick/games';
import { PENTIX_VARIANTS, pentixDef } from '../../../src/brick/games/pentix';
import {
  FIGURES,
  FIRST_SUPER,
  FIRST_TROMINO,
  PENTIX_POOL,
  SHAPE_PENTO_X,
  figureName,
  makePiece,
  nextShape,
  prevShape,
  rotatePiece,
} from '../../../src/brick/games/tetris/shapes';
import { describeVariant } from '../../../src/brick/games/tetris/variants';
import { conformance } from '../conformance';
import { Bot, Lab, idle, labFor, tap, types, until } from './tetrisLab';

const coveredScenario = scenarioSuite('pentix');

/**
 * Pentix («Тетрис Pentix» у «168 в 1 танк», «Тетрис с большими фигурами» у «Морского боя»): тот же тетрис, но фигуры из трёх, четырёх и пяти клеток.
 * Донор — `PentixGameQ…X`; набор и частоты фигур Apollo неизвестны (допущение). Общие правила (ряды, очки, скорость) проверены в `tetris.test.ts`,
 * переключатели вариантов — в `tetrisVariants.test.ts`; здесь — то, что отличает Pentix.
 */
conformance(pentixDef, { fuzzTicks: 800, seeds: [7] });

const FALL_1 = 30;
const FALL_10 = 8;

const pentix = (options: ConstructorParameters<typeof Lab>[1] = {}): Lab => {
  const lab = new Lab('pentix', { seed: 5, ...options, mode: 0 });
  lab.start();
  return lab;
};

describe('Pentix: состав', () => {
  it('20 вариантов: классы Q…X донора, затем сочетания с особыми фигурами и спецфигурами; названия различаются', () => {
    expect(pentixDef.id).toBe('pentix');
    expect(pentixDef.declaredModes).toBeNull();
    expect(PENTIX_VARIANTS.length).toBe(20);
    expect(pentixDef.modes.length).toBe(20);
    expect(PENTIX_VARIANTS.slice(0, 8).map((v) => v.letter).join('')).toBe('QRSTUVWX');
    expect(PENTIX_VARIANTS.every((v) => v.pool === 'pentix')).toBe(true);
    expect(new Set(pentixDef.modes.map((m) => m.name.ru)).size).toBe(20);
    expect(new Set(pentixDef.modes.map((m) => m.name.en)).size).toBe(20);
    expect(pentixDef.modes[0]?.name.ru).toBe('Обычный');
  });

  it('описание варианта называет `PentixGame…` донора, фигуры из 3–5 клеток и допущение', () => {
    for (const variant of PENTIX_VARIANTS) {
      const mode = describeVariant(variant);
      expect(mode.note).toContain(`PentixGame${variant.letter}`);
      expect(mode.note).toContain('3, 4 и 5 клеток');
      expect(mode.note).toContain('допущение');
    }
  });

  it('одна игра на две консоли: «Тетрис Pentix» (168 в 1) и «Тетрис с большими фигурами» (Морской бой, D) — один и тот же модуль', () => {
    expect(BRICK_GAMES['tetris-pentix']).toBe(pentixDef);
    expect(BRICK_GAMES['tetris-big']).toBe(pentixDef);
  });
});

describe('Pentix: фигуры', () => {
  it('26 несущих фигур: 2 из трёх клеток, 7 из четырёх (тетрамино), 17 из пяти; названия каталога не повторяются', () => {
    expect(PENTIX_POOL.length).toBe(26);
    expect(PENTIX_POOL[0]).toBe(FIRST_TROMINO);
    expect(PENTIX_POOL[25]).toBe(FIRST_SUPER - 1);
    const sizes = PENTIX_POOL.map((shape) => makePiece(shape).cells.length);
    expect(sizes.filter((n) => n === 3).length).toBe(2);
    expect(sizes.filter((n) => n === 4).length).toBe(7);
    expect(sizes.filter((n) => n === 5).length).toBe(17);
    expect(new Set(PENTIX_POOL.map(figureName)).size).toBe(26);
    expect(FIGURES.length).toBe(31);
  });

  it('в каждой фигуре клетки соединены сторонами (нет «разрозненных» кусочков)', () => {
    for (const shape of PENTIX_POOL) {
      const cells = makePiece(shape).cells;
      const key = (x: number, y: number): string => `${x},${y}`;
      const all = new Set(cells.map(([x, y]) => key(x, y)));
      expect(all.size, figureName(shape)).toBe(cells.length);
      const seen = new Set<string>();
      const stack = [cells[0] ?? [0, 0]];
      while (stack.length) {
        const [x, y] = stack.pop() ?? [0, 0];
        if (seen.has(key(x, y))) continue;
        seen.add(key(x, y));
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (all.has(key(x + dx, y + dy))) stack.push([x + dx, y + dy] as const);
        }
      }
      // у донора трёхклеточная «диагональная линия» (TroLine) соединена только углами; остальные фигуры связны по сторонам
      if (figureName(shape) !== 'TroLine') expect(seen.size, figureName(shape)).toBe(cells.length);
    }
  });

  it('любая фигура в любом из четырёх положений помещается в превью 4 × 4 и в стакан, а четыре поворота возвращают её', () => {
    for (const shape of PENTIX_POOL) {
      let piece = makePiece(shape);
      const start = piece.cells;
      for (let turn = 0; turn < 4; turn++) {
        expect(piece.maxX - piece.minX + 1, `${figureName(shape)} ${turn}`).toBeLessThanOrEqual(PREVIEW_COLS);
        expect(piece.maxY - piece.minY + 1).toBeLessThanOrEqual(PREVIEW_ROWS);
        expect(piece.maxX - piece.minX + 1).toBeLessThanOrEqual(BRICK_COLS);
        piece = rotatePiece(piece);
      }
      expect(piece.cells, figureName(shape)).toEqual(start);
    }
  });

  it('пентамино X при повороте не меняется (как квадрат у тетриса)', () => {
    expect(rotatePiece(makePiece(SHAPE_PENTO_X))).toEqual(makePiece(SHAPE_PENTO_X));
  });

  it('смена фигуры по каталогу вперёд и назад: 26 шагов проходят все фигуры, после последней — первая и угол на 90° дальше', () => {
    let piece = makePiece(FIRST_TROMINO);
    const shapes: number[] = [piece.shape];
    for (let i = 0; i < 25; i++) {
      piece = nextShape(piece);
      shapes.push(piece.shape);
    }
    expect(shapes).toEqual([...PENTIX_POOL]);
    piece = nextShape(piece);
    expect([piece.shape, piece.angle]).toEqual([FIRST_TROMINO, 1]);
    for (const shape of PENTIX_POOL) expect(prevShape(nextShape(makePiece(shape, 2))).shape).toBe(shape);
  });
});

describe('Pentix: появление и превью', () => {
  it('каждая из 26 фигур появляется по центру нижним рядом в верхней строке, помещается в поле, превью показывает все её клетки', () => {
    for (const shape of PENTIX_POOL) {
      for (const angle of [0, 1, 2, 3]) {
        const lab = pentix();
        lab.wipe();
        lab.setNext(shape, angle);
        const lit = lab.previewRows().join('').split('#').length - 1;
        expect(lit, `${figureName(shape)} ${angle}: превью`).toBe(makePiece(shape).cells.length);
        lab.respawn(shape, angle);
        const piece = lab.current;
        if (!piece) throw new Error('фигуры нет');
        expect(lab.gameEnded, figureName(shape)).toBe(false);
        expect(lab.py + piece.minY).toBe(BRICK_ROWS - 1);
        expect(lab.px + piece.minX).toBeGreaterThanOrEqual(0);
        expect(lab.px + piece.maxX).toBeLessThan(BRICK_COLS);
        expect(lab.rows()[0]?.includes('#')).toBe(true);
      }
    }
  });

  it('фигуры выбираются из всех 26 с любым поворотом', () => {
    const lab = pentix({ seed: 21 });
    const shapes = new Set<number>();
    const angles = new Set<number>();
    for (let i = 0; i < 1200; i++) {
      lab.wipe();
      lab.respawn(4);
      shapes.add(lab.upcoming.shape);
      angles.add(lab.upcoming.angle);
      expect(PENTIX_POOL).toContain(lab.upcoming.shape);
    }
    expect(shapes.size).toBe(26);
    expect(angles.size).toBe(4);
  });
});

describe('Pentix: падение и ряды', () => {
  it('падает медленнее тетриса на 50 мс: 30 тактов на скорости 1 и 8 на скорости 10', () => {
    expect([FALL_1, FALL_10]).toEqual([30, 8]);
    for (const [speed, period] of [
      [1, FALL_1],
      [10, FALL_10],
    ] as const) {
      const lab = pentix({ speed });
      lab.wipe();
      lab.put(8, 0, 4, 12);
      expect(Math.ceil(lab.fallPeriod)).toBe(period);
      idle(lab, period - 1);
      expect(lab.py, `скорость ${speed}`).toBe(12);
      idle(lab, 1);
      expect(lab.py).toBe(11);
    }
  });

  it('ряд собирается и стирается так же, как в тетрисе: +1 очко, остальное опускается', () => {
    const lab = pentix();
    lab.wipe();
    lab.fill(0, '####..####');
    lab.put(FIRST_TROMINO + 1, 0, 4, 10); // уголок из трёх клеток: две внизу и одна над левой
    tap(lab, 'fire');
    until(lab, () => lab.settled().subarray(0, BRICK_COLS).join('') === '0000100000', 600);
    expect(lab.score).toBe(1);
    expect(lab.count()).toBe(1);
  });

  it('вертикальная палка из тетрамино собирает четыре ряда за раз: 15 очков', () => {
    const lab = pentix();
    lab.wipe();
    for (let y = 0; y < 4; y++) lab.fill(y, '.#########');
    lab.put(5, 0, 0, 10);
    const events = tap(lab, 'fire');
    expect(types(events)).toContain('lines');
    until(lab, () => lab.count() === 0, 800);
    expect(lab.score).toBe(15);
  });

  it('поворот у стенки и в тесноте: фигура либо поворачивается в свободное место, либо остаётся', () => {
    for (const shape of PENTIX_POOL) {
      const lab = pentix();
      lab.wipe();
      lab.put(shape, 0, 0, 10);
      tap(lab, 'rotate');
      const piece = lab.current;
      if (!piece) throw new Error('фигуры нет');
      expect(lab.px + piece.minX, figureName(shape)).toBeGreaterThanOrEqual(0);
      expect(lab.px + piece.maxX).toBeLessThan(BRICK_COLS);
    }
  });
});

describe('Pentix: класс S — смена фигуры вместо поворота', () => {
  it('ROTATE листает каталог из 26 фигур; падает ещё на 50 мс медленнее (100 мс надбавки)', () => {
    const lab = labFor('pentix', (v) => v.letter === 'S' && v.type === 1);
    lab.wipe();
    lab.put(FIRST_TROMINO, 0, 4, 10);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      tap(lab, 'rotate');
      seen.push(lab.current?.shape ?? 0);
    }
    expect(seen).toEqual([FIRST_TROMINO + 1, FIRST_TROMINO + 2, FIRST_TROMINO + 3, FIRST_TROMINO + 4, FIRST_TROMINO + 5]);
    expect(lab.fallPeriod).toBeCloseTo((150 * 2048 / 690000 + 0.1) * 60);
  });
});

describe('Pentix: «бот»', () => {
  coveredScenario(['tetris-big', 'tetris-pentix'], 'прогресс', 'простой игрок складывает фигуры 3–5 клеток и собирает ряды, пока не заполнится стакан', () => {
    for (const seed of [3, 4]) {
      const lab = pentix({ seed });
      const bot = new Bot(lab);
      let lines = 0;
      for (let tick = 0; tick < 20_000 && lab.phase === 'playing'; tick++) {
        for (const event of lab.step(bot.next())) if (event.type === 'lines') lines += event.count;
      }
      expect(lines, `зерно ${seed}`).toBeGreaterThanOrEqual(5);
      expect(lab.score).toBeGreaterThanOrEqual(lines);
    }
  });
});

coveredScenario(['tetris-big', 'tetris-pentix'], 'неудача', 'новая пентамино не помещается: проигрыш и сохранение рекорда', () => {
  const lab = pentix(); lab.wipe(); lab.fill(BRICK_ROWS - 1, '#.#.#.#.#.'); lab.poke(42);
  lab.respawn(SHAPE_PENTO_X);
  expect(types(idle(lab, 1))).toContain('gameOver');
  until(lab, () => lab.phase === 'over', 200);
  expect(lab.phase).toBe('over'); expect(lab.hiScore).toBe(42);
  lab.start(); expect(lab.score).toBe(0); expect(lab.hiScore).toBe(42);
});
