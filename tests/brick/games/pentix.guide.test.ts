/**
 * Описание «Тетриса Pentix» / «Тетриса с большими фигурами» для левой панели (`src/brick/guides/pentix.ts`): форма и пределы, отсутствие заглушки и,
 * главное, каждое число и каждая схема подтверждены поведением игры: создаём игру, играем и сверяем. Числа в тестах записаны литералами, а не взяты
 * из констант игры, чтобы правка константы без правки описания (и наоборот) ломала тест. Правила игры проверяют `pentix.test.ts`, `tetris.test.ts`
 * и `tetrisVariants.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { BrickConsole, NEUTRAL_BRICK_INPUT, guideProblems, type GuideText } from '../../../src/brick';
import { TOYS } from '../../../src/app/toys';
import { BRICK_GAMES } from '../../../src/brick/games';
import { PENTIX_VARIANTS, pentixDef } from '../../../src/brick/games/pentix';
import { makePiece } from '../../../src/brick/games/tetris/shapes';
import { BRICK_GUIDES } from '../../../src/brick/guides';
import { PENTIX_GUIDE } from '../../../src/brick/guides/pentix';
import { Lab, idle, labFor, tap, types, until } from './tetrisLab';

const CYRILLIC = /[А-Яа-яЁё]/;

const guideTexts = (): GuideText[] => [
  PENTIX_GUIDE.summary,
  PENTIX_GUIDE.goal,
  PENTIX_GUIDE.progression,
  ...PENTIX_GUIDE.rules,
  ...PENTIX_GUIDE.controls.map((control) => control.text),
  ...PENTIX_GUIDE.scoring.map((score) => score.what),
  ...PENTIX_GUIDE.facts.map((fact) => fact.label),
  ...PENTIX_GUIDE.schemes.map((scheme) => scheme.caption),
  ...PENTIX_GUIDE.assumptions,
];

// ------------------------------------------------------------------ помощники

/** Обычный вариант 01 Pentix (класс Q), запущенный. */
function pentix(options: ConstructorParameters<typeof Lab>[1] = {}): Lab {
  const lab = new Lab('pentix', { seed: 5, ...options, mode: 0 });
  lab.start();
  return lab;
}

/** Фигура в положении 0° построчно сверху вниз; `fill` — знак клетки (`#` горит, `*` мигает). */
function picture(shape: number, fill = '#'): string[] {
  const piece = makePiece(shape);
  const rows: string[] = [];
  for (let y = piece.maxY; y >= piece.minY; y--) {
    let row = '';
    for (let x = piece.minX; x <= piece.maxX; x++) row += piece.cells.some(([cx, cy]) => cx === x && cy === y) ? fill : '.';
    rows.push(row);
  }
  return rows;
}

/** Фигуры в один ряд картинки: выровнены по низу, между ними пустой столбец, справа дополнено до `width`. */
function lineUp(pictures: readonly string[][], width: number): string[] {
  const height = Math.max(...pictures.map((p) => p.length));
  const rows: string[] = [];
  for (let r = 0; r < height; r++) {
    const parts = pictures.map((p) => p[r - (height - p.length)] ?? '.'.repeat(p[0]?.length ?? 0));
    rows.push(parts.join('.').padEnd(width, '.'));
  }
  return rows;
}

/** Что игра рисует на экране для фигуры, поставленной в поле (обрезано по границам горящих клеток). */
function shown(lab: Lab, shape: number, blink = false): string[] {
  lab.wipe();
  lab.put(shape, 0, 4, 10, blink);
  const rows = lab.rows().filter((row) => /[#*]/.test(row));
  const first = Math.min(...rows.map((row) => row.search(/[#*]/)));
  const last = Math.max(...rows.map((row) => Math.max(row.lastIndexOf('#'), row.lastIndexOf('*'))));
  return rows.map((row) => row.slice(first, last + 1));
}

/** Период падения в тактах между двумя соседними шагами (на скорости лаборатории). */
function fallInterval(lab: Lab): number {
  lab.wipe();
  lab.put(7, 0, 4, 17);
  const stamps: number[] = [];
  let y = lab.py;
  for (let t = 1; t <= 200 && stamps.length < 3; t++) {
    lab.step(NEUTRAL_BRICK_INPUT);
    if (lab.py !== y) {
      y = lab.py;
      stamps.push(t);
    }
  }
  return (stamps[2] ?? 0) - (stamps[1] ?? 0);
}

const ms = (ticks: number): number => (ticks * 1000) / 60;
const ONE_TICK_MS = 1000 / 60 + 1e-6;

/** Колодец из `rows` рядов, в который вертикальная палка (тетрамино I из набора Pentix) встаёт в колонку 0: ряды без дыр — полные. */
function well(rows: number): Lab {
  const lab = pentix();
  lab.wipe();
  for (let y = 0; y < rows; y++) lab.fill(y, '.#########');
  lab.put(5, 0, 0, 10);
  return lab;
}

/** Один полный ряд одной посадкой (+1 очко); анимацию стирания дожидаемся. */
function clearOneRow(lab: Lab): void {
  lab.wipe();
  lab.fill(0, '.#########');
  lab.put(5, 0, 0, 10);
  tap(lab, 'fire');
  until(lab, () => lab.count() === 3, 600);
}

/** Все несущие фигуры набора Pentix (каталог донора: 1…26). */
const POOL = Array.from({ length: 26 }, (_, i) => i + 1);

// ------------------------------------------------------------------ форма

describe('описание «Pentix»: форма', () => {
  it('guideProblems пуст; описание не заглушка; русский текст по-русски, английский — без кириллицы', () => {
    expect(guideProblems(PENTIX_GUIDE)).toEqual([]);
    for (const text of guideTexts()) {
      expect(text.ru).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(text.en).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(CYRILLIC.test(text.ru), text.ru).toBe(true);
      expect(CYRILLIC.test(text.en), text.en).toBe(false);
    }
  });

  it('описание подключено в реестр под обоими идентификаторами: «168 в 1 танк» (tetris-pentix) и «Морской бой» (tetris-big) — один модуль', () => {
    expect(pentixDef.id).toBe('pentix');
    expect(BRICK_GAMES['tetris-pentix']).toBe(pentixDef);
    expect(BRICK_GAMES['tetris-big']).toBe(pentixDef);
    expect(BRICK_GUIDES['tetris-pentix']).toBe(PENTIX_GUIDE);
    expect(BRICK_GUIDES['tetris-big']).toBe(PENTIX_GUIDE);
  });

  it('жизней нет: в описании `lives: null`, и у игры жизней нет', () => {
    expect(PENTIX_GUIDE.lives).toBeNull();
    expect(pentix().lives).toBeNull();
    expect(pentixDef.create({ seed: 1 }).lives).toBeNull();
  });

  it('в описании те числа, что подтверждены ниже: 20 вариантов, 26 фигур, 495→124 мс, 1000 очков; очки 1, 3, 7, 15', () => {
    expect(PENTIX_GUIDE.facts.map((fact) => fact.value)).toEqual(['20', '26', '495→124', '1000']);
    expect(PENTIX_GUIDE.scoring.map((score) => score.points)).toEqual(['+1', '+3', '+7', '+15', '0']);
    const ru = [PENTIX_GUIDE.summary, PENTIX_GUIDE.progression, ...PENTIX_GUIDE.rules].map((text) => text.ru).join(' ');
    const en = [PENTIX_GUIDE.summary, PENTIX_GUIDE.progression, ...PENTIX_GUIDE.rules].map((text) => text.en).join(' ');
    for (const text of [ru, en]) {
      expect(text).toContain('20');
      expect(text).toContain('26');
      expect(text).toContain('495→124');
      expect(text).toContain('1000');
      expect(text).toContain('10×20');
      expect(text).toContain('4×4');
      expect(text).toContain('5×5');
      expect(text).toContain('30');
      expect(text).toContain('50');
    }
    expect(PENTIX_GUIDE.rules[1]?.ru).toContain('2 из трёх клеток');
    expect(PENTIX_GUIDE.rules[1]?.ru).toContain('7 из четырёх');
    expect(PENTIX_GUIDE.rules[1]?.ru).toContain('17 из пяти');
  });
});

// ------------------------------------------------------------------ числа в facts

describe('описание «Pentix»: числа подтверждены игрой', () => {
  it('20 вариантов: номера 01–20 — разные правила, 21-й номер замыкается на первый; устройство «168 в 1 танк» своего числа не заявляет', () => {
    expect(pentixDef.declaredModes).toBeNull();
    expect(pentixDef.modes.length).toBe(20);
    expect(PENTIX_VARIANTS.length).toBe(20);
    const rules = Array.from({ length: 21 }, (_, mode) => new Lab('pentix', { seed: 1, mode }).rule);
    expect(new Set(rules.slice(0, 20).map((rule) => JSON.stringify(rule))).size).toBe(20);
    expect(rules[20]).toEqual(rules[0]);
    expect(TOYS.tank168.games.find((game) => game.id === 'tetris-pentix')?.variants).toBeUndefined();
    expect(TOYS.seabattle.games.find((game) => game.id === 'tetris-big')?.variants).toBe(20);
  });

  it('26 фигур: 2 из трёх клеток, 7 из четырёх, 17 из пяти — за две тысячи появлений в обычном варианте выпадают все 26', () => {
    const lab = pentix({ seed: 21 });
    const sizes = new Map<number, number>();
    for (let i = 0; i < 2000; i++) {
      lab.wipe();
      lab.respawn(7);
      sizes.set(lab.upcoming.shape, lab.upcoming.cells.length);
      expect(lab.upcoming.blink).toBe(false);
    }
    expect(sizes.size).toBe(26);
    expect([...sizes.keys()].sort((a, b) => a - b)).toEqual(POOL);
    const bySize = (cells: number): number => [...sizes.values()].filter((n) => n === cells).length;
    expect([bySize(3), bySize(4), bySize(5)]).toEqual([2, 7, 17]);
  });

  it('падение на клетку: около 495 мс на скорости 1 и около 124 мс на скорости 10, то есть на 50 мс медленнее тетриса', () => {
    const slow = fallInterval(pentix({ speed: 1 }));
    const fast = fallInterval(pentix({ speed: 10 }));
    expect(Math.abs(ms(slow) - 495)).toBeLessThanOrEqual(ONE_TICK_MS);
    expect(Math.abs(ms(fast) - 124)).toBeLessThanOrEqual(ONE_TICK_MS);
    const tetris = new Lab('tetris', { seed: 5, mode: 0 });
    tetris.start();
    expect(Math.abs(ms(slow) - ms(fallInterval(tetris)) - 50)).toBeLessThanOrEqual(ONE_TICK_MS * 2);
    const middle = fallInterval(pentix({ speed: 5 }));
    expect(middle).toBeLessThan(slow);
    expect(middle).toBeGreaterThan(fast);
  });

  it('1000 очков на ступень скорости: на 999 очках скорость прежняя, на 1000-м — выше на единицу, и так каждую тысячу', () => {
    const below = pentix();
    below.poke(998);
    clearOneRow(below);
    expect(below.score).toBe(999);
    expect(below.speed).toBe(1);

    const at = pentix();
    at.poke(999);
    clearOneRow(at);
    expect(at.score).toBe(1000);
    expect(at.speed).toBe(2);

    const second = pentix({ speed: 2 });
    second.poke(1999);
    clearOneRow(second);
    expect(second.score).toBe(2000);
    expect(second.speed).toBe(3);
  });
});

// ------------------------------------------------------------------ очки

describe('описание «Pentix»: очки', () => {
  it('+1, +3, +7, +15 за один, два, три и четыре ряда одной фигурой', () => {
    const expected = [1, 3, 7, 15];
    for (let rows = 1; rows <= 4; rows++) {
      const lab = well(rows);
      tap(lab, 'fire');
      until(lab, () => lab.count() === 4 - rows, 600);
      expect(lab.score, `${rows} рядов`).toBe(expected[rows - 1]);
      expect(PENTIX_GUIDE.scoring[rows - 1]?.points).toBe(`+${expected[rows - 1]}`);
    }
  });

  it('крест из пяти клеток (схема 2) закрывает два ряда сразу — те же +3, что и две линии подряд у тетриса', () => {
    const lab = pentix();
    lab.wipe();
    lab.fill(0, '####.#####');
    lab.fill(1, '###...####');
    lab.put(22, 0, 4, 10);
    tap(lab, 'fire');
    until(lab, () => lab.count() === 1, 800);
    expect(lab.score).toBe(3);
  });

  it('за падение, бросок и спецфигуры очков нет', () => {
    const drop = pentix();
    drop.wipe();
    drop.put(7, 0, 4, 12);
    tap(drop, 'fire');
    expect(drop.score).toBe(0);

    const soft = pentix();
    soft.wipe();
    soft.put(7, 0, 4, 6);
    for (let i = 0; i < 60; i++) soft.step({ pressed: new Set(i === 0 ? ['down'] : []), held: new Set(['down']) });
    expect(soft.count()).toBeGreaterThanOrEqual(4);
    expect(soft.score).toBe(0);

    for (const shape of [27, 28, 29, 30]) {
      const lab = labFor('pentix', (v) => v.letter === 'Q' && v.type === 9);
      lab.wipe();
      lab.fill(0, '...#......');
      lab.put(shape, 0, 3, 10, true);
      tap(lab, 'rotate');
      tap(lab, 'fire');
      idle(lab, 300);
      expect(lab.score, `спецфигура ${shape}`).toBe(0);
    }
    expect(PENTIX_GUIDE.scoring[4]?.points).toBe('0');
  });
});

// ------------------------------------------------------------------ ход игры

describe('описание «Pentix»: скорость, уровень, ряды', () => {
  it('число на LEVEL — число случайных рядов снизу в начале партии; в каждом есть и клетки, и дыры', () => {
    for (const level of [0, 1, 4, 9]) {
      const menu = new BrickConsole({ catalog: [{ symbol: '9', id: 'tetris-pentix', def: pentixDef }], seed: 1, level });
      menu.start();
      expect(menu.displayLevel).toBe(level);
      const cells = menu.cells();
      const lit = (row: number): number => cells.slice(row * 10, row * 10 + 10).reduce((sum, value) => sum + (value === 0 ? 0 : 1), 0);
      for (let row = 20 - level; row < 20; row++) {
        expect(lit(row), `уровень ${level}, строка ${row}`).toBeGreaterThan(0);
        expect(lit(row)).toBeLessThan(10);
      }
      expect(lit(20 - level - 1)).toBe(0);
    }
  });

  it('B0202: скорость ограничена десятой, выбранный уровень сохраняется', () => {
    const lab = pentix({ speed: 10, level: 3 });
    lab.wipe();
    lab.fill(0, '####..####');
    lab.put(7, 0, 4, 10);
    lab.poke(999);
    tap(lab, 'fire');
    expect(lab.speed).toBe(10);
    expect(lab.level).toBe(3);
    until(lab, () => lab.count() === 2, 600);
    expect(lab.settled().subarray(10).every((value) => value === 0)).toBe(true);
  });

  it('фигура появляется по центру, поворот — на 90° по часовой; квадрат и крест из пяти клеток при повороте не меняются, остальные 24 меняются', () => {
    const lab = pentix();
    lab.wipe();
    lab.respawn(7);
    expect(lab.px).toBe(4);
    lab.wipe();
    lab.put(6, 0, 4, 10);
    tap(lab, 'rotate');
    expect(lab.current?.angle).toBe(1);
    const unchanged: number[] = [];
    for (const shape of POOL) {
      lab.wipe();
      lab.put(shape, 0, 4, 10);
      if (!types(tap(lab, 'rotate')).includes('rotate')) unchanged.push(shape);
    }
    expect(unchanged).toEqual([7, 22]);
  });

  it('есть диагональная линия из трёх клеток: клетки соединены только углами', () => {
    expect(picture(1)).toEqual(['..#', '.#.', '#..']);
    const lab = pentix();
    expect(shown(lab, 1)).toEqual(['..#', '.#.', '#..']);
  });

  it('у стенки длинная фигура при повороте сдвигается внутрь поля', () => {
    for (const shape of POOL) {
      const lab = pentix();
      lab.wipe();
      lab.put(shape, 0, 0, 10);
      tap(lab, 'rotate');
      const piece = lab.current;
      expect(piece, `фигура ${shape}`).not.toBeNull();
      expect(lab.px + (piece?.minX ?? 0)).toBeGreaterThanOrEqual(0);
      expect(lab.px + (piece?.maxX ?? 0)).toBeLessThan(10);
    }
  });
});

describe('описание «Pentix»: варианты и числа в правилах', () => {
  it('каждая 7-я фигура мигает в вариантах с особыми фигурами; в обычном варианте мигающих нет', () => {
    const special = labFor('pentix', (v) => v.family === 'liquid' && !v.inverted && !v.lineTimer && !v.morph && !v.shift && v.supers.length === 0);
    let blinking = 0;
    for (let i = 0; i < 700; i++) {
      special.wipe();
      special.respawn(7);
      if (special.upcoming.blink) blinking++;
    }
    expect(blinking / 700).toBeGreaterThan(1 / 7 - 0.05);
    expect(blinking / 700).toBeLessThan(1 / 7 + 0.05);
    const plain = pentix();
    for (let i = 0; i < 300; i++) {
      plain.wipe();
      plain.respawn(7);
      expect(plain.upcoming.blink).toBe(false);
    }
  });

  it('супербомба стирает квадрат 5 × 5 вокруг своего центра, остальное остаётся', () => {
    const lab = labFor('pentix', (v) => v.letter === 'Q' && v.type === 9);
    lab.wipe();
    for (let y = 0; y < 12; y++) lab.fill(y, '#########.');
    expect(lab.count()).toBe(108);
    lab.put(30, 0, 2, 12, true);
    tap(lab, 'fire');
    until(lab, () => lab.count() === 98, 600);
    expect(lab.count()).toBe(98);
    for (let y = 10; y <= 11; y++) {
      for (let x = 1; x <= 5; x++) expect(lab.cell(x, y), `${x},${y}`).toBe(0);
      expect([0, 6, 7, 8].map((x) => lab.cell(x, y))).toEqual([1, 1, 1, 1]);
    }
    expect([1, 5].map((x) => lab.cell(x, 9))).toEqual([1, 1]);
  });

  it('смена фигуры: ROTATE листает все 26 фигур по кругу, падение ещё на 50 мс медленнее', () => {
    const swap = labFor('pentix', (v) => v.letter === 'S' && v.type === 1);
    swap.wipe();
    swap.put(1, 0, 4, 10);
    const seen: number[] = [];
    for (let i = 0; i < 26; i++) {
      tap(swap, 'rotate');
      seen.push(swap.current?.shape ?? 0);
    }
    expect(seen).toEqual([...POOL.slice(1), 1]);
    expect(swap.current?.angle).toBe(1);
    const base = fallInterval(pentix());
    const swapped = fallInterval(labFor('pentix', (v) => v.letter === 'S' && v.type === 1));
    expect(Math.abs(ms(swapped) - ms(base) - 50)).toBeLessThanOrEqual(ONE_TICK_MS * 2);
  });

  it('новый ряд по таймеру: первый — через 30 секунд, дальше примерно каждые 30 (31) секунд, пока фигура не мешает', () => {
    const lab = labFor('pentix', (v) => v.lineTimer && !v.morph && !v.shift && v.type === 1);
    const stamps: number[] = [];
    let rows = 0;
    for (let t = 1; t <= 60 * 95 && stamps.length < 3; t++) {
      lab.put(7, 0, 4, 15); // фигура всё время вверху: она не упадёт и не помешает новому ряду
      lab.step(NEUTRAL_BRICK_INPUT);
      if (lab.count() !== rows) {
        rows = lab.count();
        stamps.push(t);
      }
    }
    expect(stamps[0]).toBe(30 * 60);
    expect(((stamps[1] ?? 0) - (stamps[0] ?? 0)) / 60).toBeGreaterThanOrEqual(30);
    expect(((stamps[1] ?? 0) - (stamps[0] ?? 0)) / 60).toBeLessThanOrEqual(31);
  });

  it('сдвиг поля: после каждой фигуры всё поле смещается на столбец вправо по кругу', () => {
    const lab = labFor('pentix', (v) => v.shift && !v.lineTimer && !v.morph && v.type === 1);
    lab.wipe();
    lab.put(7, 0, 4, 10);
    tap(lab, 'fire');
    expect([4, 5, 6, 7].map((x) => lab.cell(x, 0))).toEqual([0, 1, 1, 0]);
  });

  it('перевёрнутое поле: фигура появляется внизу экрана и падает вверх; «вверх» и «вниз» меняются ролями', () => {
    const lab = labFor('pentix', (v) => v.inverted && v.supers.length === 0 && !v.lineTimer && !v.morph && !v.shift && v.family === 'plain');
    lab.wipe();
    lab.respawn(7);
    expect(lab.rows()[19]?.includes('#')).toBe(true);
    expect(lab.rows()[0]?.includes('#')).toBe(false);
    tap(lab, 'fire');
    expect(lab.rows()[0]).toBe('....##....');
    lab.wipe();
    lab.put(6, 0, 4, 12);
    idle(lab, 20);
    tap(lab, 'down');
    expect(lab.current?.angle).toBe(1);
  });
});

// ------------------------------------------------------------------ схемы

describe('описание «Pentix»: схемы совпадают с игрой', () => {
  it('схема 1: фигуры из трёх и пяти клеток в положении 0° — ровно то, что рисует игра', () => {
    const lab = pentix();
    for (const shape of [1, 2, 10, 12, 21, 22]) {
      expect(shown(lab, shape), `фигура ${shape}`).toEqual(picture(shape));
    }
    expect(PENTIX_GUIDE.schemes[0]?.cells).toEqual([
      ...lineUp([1, 2, 10].map((shape) => picture(shape)), 10),
      '..........',
      ...lineUp([22, 21, 12].map((shape) => picture(shape)), 10),
    ]);
    // фигуры схемы — из трёх и из пяти клеток
    expect([1, 2, 10, 12, 21, 22].map((shape) => makePiece(shape).cells.length)).toEqual([3, 3, 5, 5, 5, 5]);
  });

  it('схема 2: крест ложится в углубление и закрывает два ряда (+3), схема сыграна в игре, остаётся одна клетка', () => {
    const cells = PENTIX_GUIDE.schemes[1]?.cells ?? [];
    expect(cells[3]).toBe('..........');
    expect(cells[4]).toBe('..........');
    const piece = cells.slice(0, 3);
    const stack = cells.slice(5);
    const column = Math.min(...piece.map((row) => row.indexOf('#')));
    expect(piece).toEqual(picture(22).map((row) => ('.'.repeat(column) + row).padEnd(10, '.')));
    const lab = pentix();
    lab.wipe();
    stack.forEach((row, i) => lab.fill(stack.length - 1 - i, row));
    lab.put(22, 0, column - makePiece(22).minX, 10);
    tap(lab, 'fire');
    until(lab, () => lab.count() === 1, 800);
    expect(lab.score).toBe(3);
    expect(lab.count()).toBe(1);
    expect(lab.cell(4, 0)).toBe(1);
    expect(PENTIX_GUIDE.schemes[1]?.caption.ru).toContain('+3');
  });
});

// ------------------------------------------------------------------ допущения

describe('описание «Pentix»: допущения', () => {
  it('набор из 26 фигур донора, все равновероятны (допущение: у Apollo набор и частоты не установлены)', () => {
    const lab = pentix({ seed: 8 });
    const counts = new Map<number, number>();
    for (let i = 0; i < 5200; i++) {
      lab.wipe();
      lab.respawn(7);
      counts.set(lab.upcoming.shape, (counts.get(lab.upcoming.shape) ?? 0) + 1);
    }
    for (const shape of POOL) {
      expect(counts.get(shape) ?? 0, `фигура ${shape}`).toBeGreaterThan(110);
      expect(counts.get(shape) ?? 0).toBeLessThan(300);
    }
    expect(PENTIX_GUIDE.assumptions[0]?.ru).toContain('26');
  });

  it('20 вариантов: первые 8 — классы Q–X донора с типом 1, остальные 12 — наш подбор сочетаний; все числа названы в допущении', () => {
    expect(PENTIX_VARIANTS.slice(0, 8).map((v) => `${v.letter}${v.type}`)).toEqual(['Q1', 'R1', 'S1', 'T1', 'U1', 'V1', 'W1', 'X1']);
    expect(PENTIX_VARIANTS.slice(8).every((v) => v.type !== 1)).toBe(true);
    expect(PENTIX_VARIANTS.slice(8).length).toBe(12);
    const text = PENTIX_GUIDE.assumptions[1]?.ru ?? '';
    for (const part of ['20', '8', '12', 'Q–X']) expect(text).toContain(part);
    expect(PENTIX_GUIDE.assumptions[1]?.en).toContain('Q–X');
  });

  it('«вверх» поворачивает фигуру, а бросок — только «огонь»', () => {
    const lab = pentix();
    lab.wipe();
    lab.put(6, 0, 4, 10);
    tap(lab, 'up');
    expect(lab.current?.angle).toBe(1);
    expect(lab.landed).toBe(false);
    lab.put(7, 0, 4, 10);
    tap(lab, 'fire');
    expect(lab.landed).toBe(true);
  });
});
