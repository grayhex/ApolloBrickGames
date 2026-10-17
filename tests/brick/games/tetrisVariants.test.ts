import { describe, expect, it } from 'vitest';
import { BRICK_COLS, BRICK_ROWS, Rng } from '../../../src/brick';
import { TETRIS_VARIANTS } from '../../../src/brick/games/tetris';
import {
  SHAPE_LINE,
  SHAPE_SQUARE,
  SUPER_BOMB,
  SUPER_GUN,
  SUPER_MUD_GUN,
  SUPER_POINT,
  TETRIS_POOL,
  figureName,
  randomPieceOrSuper,
} from '../../../src/brick/games/tetris/shapes';
import { LINE_TIMER_SECONDS, SPECIAL_CHANCE } from '../../../src/brick/games/tetris/core';
import { describeVariant, speedPenaltyMs, variantOf } from '../../../src/brick/games/tetris/variants';
import { Lab, hold, idle, labFor, plainLab, tap, types, until, type Pool } from './tetrisLab';

/**
 * Варианты тетриса и общие переключатели ядра, которыми пользуется и Pentix: классы донора J…P, особые (мигающие) фигуры, спецфигуры, перевёрнутое поле.
 * Соответствие номеров вариантов устройства флагам донора — допущение игры; здесь проверяется, что флаги работают так, как описаны.
 */

describe('варианты: таблица донора', () => {
  it('классы I…P: J — таймер новых рядов, K — смена фигуры, M — сдвиг поля, остальные — сочетания', () => {
    const flags = (letter: string): string => {
      const v = variantOf(letter, 1);
      return [v.lineTimer ? 'таймер' : '', v.morph ? 'смена' : '', v.shift ? 'сдвиг' : ''].filter(Boolean).join('+') || 'обычный';
    };
    expect([...'IJKLMNOP'].map(flags)).toEqual(['обычный', 'таймер', 'смена', 'таймер+смена', 'сдвиг', 'таймер+сдвиг', 'смена+сдвиг', 'таймер+смена+сдвиг']);
  });

  it('классы Q…X (Pentix) повторяют I…P по порядку, фигуры берутся из набора Pentix', () => {
    for (let i = 0; i < 8; i++) {
      const tetris = variantOf('IJKLMNOP'[i] ?? 'I', 1);
      const pentix = variantOf('QRSTUVWX'[i] ?? 'Q', 1);
      expect([pentix.lineTimer, pentix.morph, pentix.shift]).toEqual([tetris.lineTimer, tetris.morph, tetris.shift]);
      expect(pentix.pool).toBe('pentix');
      expect(tetris.pool).toBe('tetris');
    }
  });

  it('тип 1…90: набор спецфигур по остатку от деления на 9, семейство особых фигур по десяткам, перевёрнутое поле с 46-го', () => {
    const supers = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((type) => variantOf('I', type).supers);
    expect(supers).toEqual([[], [0], [1], [0, 1], [2], [1, 2], [0, 1, 2], [3], [0, 1, 2, 3]]);
    const family = (type: number): string => variantOf('I', type).family;
    expect([1, 9, 10, 18, 19, 27, 28, 36, 37, 45].map(family)).toEqual(['plain', 'plain', 'liquid', 'liquid', 'acid', 'acid', 'through', 'through', 'random', 'random']);
    expect([45, 46, 54, 90].map((type) => variantOf('I', type).inverted)).toEqual([false, true, true, true]);
    expect(variantOf('I', 46).family).toBe('plain');
    expect(variantOf('I', 55).family).toBe('liquid');
  });

  it('вариантов 51: 45 типов класса I, затем J, K, L, M и два перевёрнутых; названия различаются', () => {
    expect(TETRIS_VARIANTS.length).toBe(51);
    expect(TETRIS_VARIANTS.slice(0, 45).map((v) => [v.letter, v.type])).toEqual(Array.from({ length: 45 }, (_, i) => ['I', i + 1]));
    expect(TETRIS_VARIANTS.slice(45, 49).map((v) => v.letter)).toEqual(['J', 'K', 'L', 'M']);
    expect(TETRIS_VARIANTS.slice(49).map((v) => [v.letter, v.type, v.inverted])).toEqual([
      ['I', 46, true],
      ['I', 54, true],
    ]);
    const names = TETRIS_VARIANTS.map((v) => describeVariant(v).name.ru);
    expect(new Set(names).size).toBe(51);
    expect(new Set(TETRIS_VARIANTS.map((v) => describeVariant(v).name.en)).size).toBe(51);
  });

  it('описание варианта называет класс и тип донора и честно помечает соответствие устройству допущением', () => {
    for (const variant of TETRIS_VARIANTS) {
      const mode = describeVariant(variant);
      expect(mode.note, `${variant.letter}${variant.type}`).toContain(`TetrisGame${variant.letter}`);
      expect(mode.note).toContain(`тип ${variant.type}`);
      expect(mode.note).toContain('допущение');
    }
  });

  it('надбавка ко времени падения: +50 мс за смену фигуры, +50 мс у любого Pentix', () => {
    expect([variantOf('I', 1), variantOf('K', 1), variantOf('Q', 1), variantOf('S', 1)].map(speedPenaltyMs)).toEqual([0, 50, 50, 100]);
  });
});

/** Лаборатория под первый вариант с заданным свойством. */
const lab = (test: Parameters<typeof labFor>[1], pool: Pool = 'tetris'): Lab => labFor(pool, test);

describe('варианты: класс J — новые ряды по таймеру', () => {
  it('таймер идёт посекундно от 29; когда он выйдет, снизу добавляется случайный ряд, фигура поднимается вместе с полем, таймер — снова 30', () => {
    expect(LINE_TIMER_SECONDS).toBe(30);
    const game = lab((v) => v.lineTimer && !v.morph && !v.shift && v.type === 1);
    expect(game.timerSeconds).toBe(LINE_TIMER_SECONDS - 1);
    idle(game, 120);
    expect(game.timerSeconds).toBe(LINE_TIMER_SECONDS - 3);
    game.wipe();
    game.put(SHAPE_SQUARE, 0, 4, 10);
    game.setTimer(0);
    idle(game, 60);
    const bottom = game.settled().subarray(0, BRICK_COLS).reduce((sum, v) => sum + v, 0);
    expect(bottom).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(BRICK_COLS);
    expect(game.count()).toBe(bottom);
    expect(game.timerSeconds).toBe(LINE_TIMER_SECONDS);
    expect(game.current?.shape).toBe(SHAPE_SQUARE);
  });

  it('обычный тетрис рядов по таймеру не добавляет', () => {
    const game = plainLab();
    game.wipe();
    game.put(SHAPE_SQUARE, 0, 4, 10);
    game.setTimer(0);
    idle(game, 120);
    expect(game.count()).toBe(0);
  });

  it('ряд не добавляется, пока в предпоследней строке поля есть клетки', () => {
    const game = lab((v) => v.lineTimer && !v.morph && !v.shift && v.type === 1);
    game.wipe();
    game.fill(BRICK_ROWS - 2, '#.........');
    game.put(SHAPE_SQUARE, 0, 4, 10);
    game.setTimer(0);
    idle(game, 60);
    expect(game.timerDue).toBe(true);
    expect(game.count()).toBe(1);
  });
});

describe('варианты: класс K — смена фигуры вместо поворота', () => {
  it('ROTATE меняет фигуру на следующую по кругу Z, S, линия, T, квадрат, L, зеркальная L', () => {
    const game = lab((v) => v.morph && !v.lineTimer && !v.shift && v.type === 1);
    game.wipe();
    game.put(3, 0, 4, 10);
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      expect(types(tap(game, 'rotate'))).toContain('rotate');
      seen.push(figureName(game.current?.shape ?? 0));
    }
    expect(seen).toEqual(['S', 'Line', 'T', 'Square', 'L', 'MirroredL', 'Z']);
    expect(game.current?.angle).toBe(1);
  });

  it('падение медленнее на 50 мс относительно таблицы B0202', () => {
    expect(lab((v) => v.morph && !v.lineTimer && !v.shift && v.type === 1).fallPeriod).toBeCloseTo(plainLab().fallPeriod + 3);
    expect(plainLab().fallPeriod).toBeCloseTo(150 * 2048 / 690000 * 60);
  });
});

describe('варианты: класс M — сдвиг поля после каждой фигуры', () => {
  it('после посадки все осевшие клетки сдвигаются на столбец вправо по кругу', () => {
    const game = lab((v) => v.shift && !v.lineTimer && !v.morph && v.type === 1);
    game.wipe();
    game.put(SHAPE_SQUARE, 0, 4, 10);
    tap(game, 'fire');
    expect([4, 5, 6, 7].map((x) => game.cell(x, 0))).toEqual([0, 1, 1, 0]);
    game.put(SHAPE_SQUARE, 0, 8, 10);
    tap(game, 'fire');
    // квадрат в столбцах 8–9 встал, и всё сдвинулось: старый — на столбцы 6–7, новый — на 9 и 0
    expect([0, 1, 5, 6, 7, 9].map((x) => game.cell(x, 0))).toEqual([1, 0, 0, 1, 1, 1]);
  });

  it('в обычном тетрисе поле стоит на месте', () => {
    const game = plainLab();
    game.wipe();
    game.put(SHAPE_SQUARE, 0, 4, 10);
    tap(game, 'fire');
    expect([4, 5].map((x) => game.cell(x, 0))).toEqual([1, 1]);
  });
});

describe('варианты: спецфигуры', () => {
  const withSupers = (supers: readonly number[]): Lab => lab((v) => v.family === 'plain' && !v.inverted && !v.lineTimer && !v.morph && !v.shift && v.supers.join() === supers.join());

  it('набор спецфигур выбирается наравне с семью тетрамино: все записи пула равновероятны, спецфигуры мигают', () => {
    const rng = new Rng(9);
    let supers = 0;
    const counts = new Map<number, number>();
    for (let i = 0; i < 4400; i++) {
      const piece = randomPieceOrSuper(rng, 'tetris', [0, 1, 2, 3]);
      counts.set(piece.shape, (counts.get(piece.shape) ?? 0) + 1);
      if (piece.shape >= SUPER_POINT) {
        supers++;
        expect(piece.blink).toBe(true);
      } else {
        expect(piece.blink).toBe(false);
      }
    }
    expect(supers / 4400).toBeGreaterThan(4 / 11 - 0.04);
    expect(supers / 4400).toBeLessThan(4 / 11 + 0.04);
    for (const shape of [...TETRIS_POOL, SUPER_POINT, SUPER_GUN, SUPER_MUD_GUN, SUPER_BOMB]) expect(counts.get(shape) ?? 0, figureName(shape)).toBeGreaterThan(250);
  });

  it('суперточка падает сквозь клетки в самую нижнюю пустую клетку своего столбца; кнопка поворота не действует', () => {
    const game = withSupers([0]);
    game.wipe();
    game.fill(0, '...#......');
    game.fill(2, '...#......');
    game.fill(3, '...#......');
    game.put(SUPER_POINT, 0, 3, 10, true);
    expect(tap(game, 'rotate')).toEqual([]);
    tap(game, 'fire');
    expect(game.cell(3, 1)).toBe(1);
    expect(game.count()).toBe(4);
  });

  it('суперпушка: ROTATE стреляет и убирает ближайшую клетку под ней; стреляет сколько угодно раз', () => {
    const game = withSupers([1]);
    game.wipe();
    game.fill(0, '...#......');
    game.fill(1, '...#......');
    game.fill(4, '....#.....');
    game.put(SUPER_GUN, 0, 3, 10, true);
    const events = types(tap(game, 'rotate'));
    expect(events).toEqual(expect.arrayContaining(['shot', 'hit']));
    expect(game.cell(3, 1)).toBe(0);
    expect(game.cell(3, 0)).toBe(1);
    tap(game, 'rotate');
    expect(game.cell(3, 0)).toBe(0);
    expect(game.cell(4, 4)).toBe(1);
    expect(types(tap(game, 'rotate'))).toEqual(['shot']);
  });

  it('грязевая пушка: ROTATE достраивает клетку над ближайшим препятствием, а если препятствий нет — на дне', () => {
    const game = withSupers([2]);
    game.wipe();
    game.fill(0, '...#......');
    game.put(SUPER_MUD_GUN, 0, 3, 10, true);
    expect(types(tap(game, 'rotate'))).toContain('shot');
    expect(game.cell(3, 1)).toBe(1);
    const empty = withSupers([2]);
    empty.wipe();
    empty.put(SUPER_MUD_GUN, 0, 6, 10, true);
    tap(empty, 'rotate');
    expect(empty.cell(6, 0)).toBe(1);
    expect(empty.count()).toBe(1);
  });

  it('грязевая пушка собирает ряды: клетка на дне замыкает ряд — он исчезает, очки растут', () => {
    const game = withSupers([2]);
    game.wipe();
    game.fill(0, '#####.####');
    game.fill(1, '#####.####');
    game.put(SUPER_MUD_GUN, 0, 5, 10, true);
    tap(game, 'rotate');
    until(game, () => game.settled().subarray(0, BRICK_COLS).join('') === '1111101111', 600);
    expect(game.settled().subarray(0, BRICK_COLS).join('')).toBe('1111101111');
    expect(game.score).toBe(1);
  });

  it('супербомба: после посадки взрыв стирает квадрат 5 × 5 вокруг (x + 1, y) вместе с самой бомбой, остальное остаётся', () => {
    const game = withSupers([3]);
    game.wipe();
    for (let y = 0; y < 8; y++) game.fill(y, '#.#.#.#.#.');
    game.put(SUPER_BOMB, 0, 2, 12, true);
    const events = types(tap(game, 'fire'));
    expect(events).toEqual(expect.arrayContaining(['lock', 'explode']));
    // бомба села на столбцы 2 и 4 (ряды до 7) и встала с низом на ряду 8; взрыв — столбцы 1–5, ряды 6–10
    until(game, () => game.count() === 36, 600);
    expect(game.count()).toBe(36);
    for (let y = 6; y <= 10; y++) for (let x = 1; x <= 5; x++) expect(game.cell(x, y), `${x},${y}`).toBe(0);
    expect([game.cell(0, 7), game.cell(2, 5), game.cell(4, 5), game.cell(6, 7), game.cell(8, 7)]).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('варианты: особые (мигающие) фигуры', () => {
  const special = (family: 'liquid' | 'acid' | 'through' | 'random'): Lab =>
    lab((v) => v.family === family && !v.inverted && !v.lineTimer && !v.morph && !v.shift && v.supers.length === 0);

  it('примерно каждая седьмая фигура — мигающая; в обычном тетрисе мигающих нет', () => {
    expect(SPECIAL_CHANCE).toBe(7);
    const game = special('liquid');
    let blinking = 0;
    const total = 700;
    for (let i = 0; i < total; i++) {
      game.wipe();
      game.respawn(SHAPE_SQUARE);
      if (game.upcoming.blink) blinking++;
    }
    expect(blinking / total).toBeGreaterThan(1 / 7 - 0.05);
    expect(blinking / total).toBeLessThan(1 / 7 + 0.05);
    const plain = plainLab();
    for (let i = 0; i < 200; i++) {
      plain.wipe();
      plain.respawn(SHAPE_SQUARE);
      expect(plain.upcoming.blink).toBe(false);
    }
  });

  it('рассыпающаяся фигура: её клетки по одной стекают вниз по своим столбцам', () => {
    const game = special('liquid');
    game.wipe();
    for (let y = 0; y < 3; y++) game.fill(y, '....#.....');
    game.put(6, 0, 4, 10, true);
    expect(game.flags.liquid).toBe(true);
    tap(game, 'fire');
    until(game, () => game.count() === 7 && game.cells().every((v) => v !== 2), 600);
    expect([3, 5].map((x) => game.cell(x, 0))).toEqual([1, 1]);
    expect(game.cell(4, 3)).toBe(1);
    expect(game.cell(4, 4)).toBe(1);
    expect(game.count()).toBe(7);
  });

  it('кислотная фигура: каждая клетка прожигает клетку под собой и исчезает вместе с ней', () => {
    const game = special('acid');
    game.wipe();
    for (let y = 0; y < 3; y++) game.fill(y, '....#.....');
    game.put(6, 0, 4, 10, true);
    expect(game.flags.acid).toBe(true);
    tap(game, 'fire');
    until(game, () => game.cells().every((v) => v !== 2) && game.count() < 7, 600);
    // столб из трёх клеток съеден, на дне остались клетки боковых частей фигуры и нижняя клетка столба
    expect(game.count()).toBeLessThan(7);
    expect([3, 5].map((x) => game.cell(x, 0))).toEqual([1, 1]);
    expect(game.cell(4, 4)).toBe(0);
  });

  it('сквозная фигура проходит через заполненные клетки, пока под ней есть пустота, и ложится на дно', () => {
    const game = special('through');
    game.wipe();
    game.fill(5, '....##....');
    game.put(SHAPE_SQUARE, 0, 4, 10, true);
    expect(game.flags.through).toBe(true);
    tap(game, 'fire');
    until(game, () => game.landed && game.cells().every((v) => v !== 2), 200);
    expect([4, 5].map((x) => game.cell(x, 0))).toEqual([1, 1]);
    expect([4, 5].map((x) => game.cell(x, 5))).toEqual([1, 1]);
    // обычный квадрат лёг бы на выступ
    const plain = plainLab();
    plain.wipe();
    plain.fill(5, '....##....');
    plain.put(SHAPE_SQUARE, 0, 4, 10);
    tap(plain, 'fire');
    expect(plain.cell(4, 6)).toBe(1);
    expect(plain.cell(4, 0)).toBe(0);
  });

  it('случайное семейство: у каждой мигающей фигуры ровно одно из свойств, у обычной — ни одного', () => {
    const game = special('random');
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      game.wipe();
      game.setNext(SHAPE_SQUARE, 0, i % 2 === 0);
      game.respawn(SHAPE_SQUARE, 0, i % 2 === 0);
      const flags = game.flags;
      const count = [flags.liquid, flags.acid, flags.through].filter(Boolean).length;
      if (i % 2 === 0) {
        expect(count).toBe(1);
        seen.add(flags.liquid ? 'liquid' : flags.acid ? 'acid' : 'through');
      } else {
        expect(count).toBe(0);
      }
    }
    expect([...seen].sort()).toEqual(['acid', 'liquid', 'through']);
  });
});

describe('варианты: перевёрнутое поле', () => {
  const upsideDown = (): Lab => lab((v) => v.inverted && v.supers.length === 0 && !v.lineTimer && !v.morph && !v.shift && v.family === 'plain');

  it('фигура появляется внизу экрана и «падает» вверх; осевшие клетки копятся у верхнего края', () => {
    const game = upsideDown();
    game.wipe();
    game.respawn(SHAPE_SQUARE);
    const rows = game.rows();
    expect(rows[BRICK_ROWS - 1]?.includes('#')).toBe(true);
    expect(rows[0]?.includes('#')).toBe(false);
    tap(game, 'fire');
    expect(game.rows()[0]).toBe('....##....');
    expect(game.rows()[1]).toBe('....##....');
  });

  it('кнопки «вверх» и «вниз» поменяны местами: «вверх» — мягкое падение, «вниз» — поворот', () => {
    const game = upsideDown();
    game.wipe();
    game.put(6, 0, 4, 12);
    const y = game.py;
    hold(game, 'up', 3);
    expect(game.py).toBeLessThan(y);
    game.put(6, 0, 4, 12);
    idle(game, 20);
    expect(types(tap(game, 'down'))).toContain('rotate');
    expect(game.current?.angle).toBe(1);
  });

  it('ряды собираются так же, как на обычном поле: очки и сброс ряда', () => {
    const game = upsideDown();
    game.wipe();
    game.fill(0, '####..####');
    game.put(SHAPE_SQUARE, 0, 4, 10);
    tap(game, 'fire');
    until(game, () => game.count() === 2, 600);
    expect(game.score).toBe(1);
  });

  it('превью обычной фигуры тоже перевёрнуто', () => {
    const normal = plainLab();
    normal.setNext(6);
    const flipped = upsideDown();
    flipped.setNext(6);
    expect(flipped.previewRows()).toEqual([...normal.previewRows()].reverse());
  });
});

describe('варианты: каждый вариант запускается и играет без ошибок', () => {
  it('все 51 вариант тетриса: партия с «ботом» не падает, поле остаётся в пределах 10 × 20', () => {
    for (let mode = 0; mode < TETRIS_VARIANTS.length; mode++) {
      const game = new Lab('tetris', { seed: 2, mode });
      game.start();
      for (let tick = 0; tick < 1500 && game.phase === 'playing'; tick++) {
        game.step(tick % 4 === 0 ? { pressed: new Set(['rotate']), held: new Set(['rotate']) } : tick % 9 === 0 ? { pressed: new Set(['fire']), held: new Set(['fire']) } : { pressed: new Set(), held: new Set() });
        expect(game.cells().length).toBe(BRICK_COLS * BRICK_ROWS);
      }
    }
    void SHAPE_LINE;
  });
});
