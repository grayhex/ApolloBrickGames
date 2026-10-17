/**
 * Описание «Тетриса» для левой панели (`src/brick/guides/tetris.ts`): форма и пределы, отсутствие заглушки и, главное, каждое число и каждая схема
 * подтверждены поведением игры: создаём игру, играем и сверяем. Числа в тестах записаны литералами, а не взяты из констант игры, чтобы правка
 * константы без правки описания (и наоборот) ломала тест. Правила игры проверяют `tetris.test.ts` и `tetrisVariants.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { BrickConsole, NEUTRAL_BRICK_INPUT, guideProblems, type GuideText } from '../../../src/brick';
import { TOYS } from '../../../src/app/toys';
import { tetrisDef } from '../../../src/brick/games/tetris';
import { makePiece } from '../../../src/brick/games/tetris/shapes';
import { BRICK_GUIDES } from '../../../src/brick/guides';
import { TETRIS_GUIDE } from '../../../src/brick/guides/tetris';
import { Lab, idle, labFor, plainLab, tap, until } from './tetrisLab';

const CYRILLIC = /[А-Яа-яЁё]/;

const guideTexts = (): GuideText[] => [
  TETRIS_GUIDE.summary,
  TETRIS_GUIDE.goal,
  TETRIS_GUIDE.progression,
  ...TETRIS_GUIDE.rules,
  ...TETRIS_GUIDE.controls.map((control) => control.text),
  ...TETRIS_GUIDE.scoring.map((score) => score.what),
  ...TETRIS_GUIDE.facts.map((fact) => fact.label),
  ...TETRIS_GUIDE.schemes.map((scheme) => scheme.caption),
  ...TETRIS_GUIDE.assumptions,
];

// ------------------------------------------------------------------ помощники

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
function shown(lab: Lab, shape: number, blink: boolean): string[] {
  lab.wipe();
  lab.put(shape, 0, 4, 10, blink);
  const rows = lab.rows().filter((row) => /[#*]/.test(row));
  const first = Math.min(...rows.map((row) => row.search(/[#*]/)));
  const last = Math.max(...rows.map((row) => Math.max(row.lastIndexOf('#'), row.lastIndexOf('*'))));
  return rows.map((row) => row.slice(first, last + 1));
}

/** Фигура «ложится» в точку: период падения в тактах на данной скорости (между двумя соседними шагами). */
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

/** Колодец из `rows` рядов, в который вертикальная палка встаёт в колонку 0: ряды без дыр — полные. */
function well(rows: number, options: ConstructorParameters<typeof Lab>[1] = {}): Lab {
  const lab = plainLab(options);
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

// ------------------------------------------------------------------ форма

describe('описание «Тетриса»: форма', () => {
  it('guideProblems пуст; описание не заглушка; русский текст по-русски, английский — без кириллицы', () => {
    expect(guideProblems(TETRIS_GUIDE)).toEqual([]);
    for (const text of guideTexts()) {
      expect(text.ru).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(text.en).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(CYRILLIC.test(text.ru), text.ru).toBe(true);
      expect(CYRILLIC.test(text.en), text.en).toBe(false);
    }
  });

  it('описание подключено в реестр под идентификатором игры', () => {
    expect(tetrisDef.id).toBe('tetris');
    expect(BRICK_GUIDES['tetris']).toBe(TETRIS_GUIDE);
  });

  it('жизней у тетриса нет: в описании `lives: null`, и у игры жизней нет', () => {
    expect(TETRIS_GUIDE.lives).toBeNull();
    expect(plainLab().lives).toBeNull();
    expect(tetrisDef.create({ seed: 1 }).lives).toBeNull();
  });

  it('в описании те числа, что подтверждены ниже: 51 вариант, 7 фигур, 445→74 мс, 1000 очков; очки 1, 3, 7, 15', () => {
    expect(TETRIS_GUIDE.facts.map((fact) => fact.value)).toEqual(['51', '7', '445→74', '1000']);
    expect(TETRIS_GUIDE.scoring.map((score) => score.points)).toEqual(['+1', '+3', '+7', '+15', '0']);
    const ru = [TETRIS_GUIDE.summary, TETRIS_GUIDE.progression, ...TETRIS_GUIDE.rules].map((text) => text.ru).join(' ');
    const en = [TETRIS_GUIDE.summary, TETRIS_GUIDE.progression, ...TETRIS_GUIDE.rules].map((text) => text.en).join(' ');
    for (const text of [ru, en]) {
      expect(text).toContain('51');
      expect(text).toContain('445→74');
      expect(text).toContain('1000');
      expect(text).toContain('10×20');
      expect(text).toContain('4×4');
      expect(text).toContain('5×5');
      expect(text).toContain('30');
      expect(text).toContain('50');
    }
  });
});

// ------------------------------------------------------------------ числа в facts

describe('описание «Тетриса»: числа подтверждены игрой', () => {
  it('51 вариант: номера 01–51 — разные правила, 52-й номер замыкается на первый', () => {
    expect(tetrisDef.declaredModes).toBe(51);
    expect(tetrisDef.modes.length).toBe(51);
    const rules = Array.from({ length: 52 }, (_, mode) => new Lab('tetris', { seed: 1, mode }).rule);
    expect(new Set(rules.slice(0, 51).map((rule) => JSON.stringify(rule))).size).toBe(51);
    expect(rules[51]).toEqual(rules[0]);
  });

  it('7 фигур из четырёх клеток: за тысячу появлений в обычном варианте выпадают ровно семь разных, все из четырёх клеток', () => {
    const lab = plainLab({ seed: 3 });
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      lab.wipe();
      lab.respawn(7);
      seen.add(lab.upcoming.shape);
      expect(lab.upcoming.cells.length).toBe(4);
      expect(lab.upcoming.blink).toBe(false);
    }
    expect(seen.size).toBe(7);
  });

  it('падение на клетку: около 445 мс на скорости 1 и около 74 мс на скорости 10 (в пределах такта 60 Гц)', () => {
    const slow = fallInterval(plainLab({ speed: 1 }));
    const fast = fallInterval(plainLab({ speed: 10 }));
    expect(Math.abs(ms(slow) - 445)).toBeLessThanOrEqual(ONE_TICK_MS);
    expect(Math.abs(ms(fast) - 74)).toBeLessThanOrEqual(ONE_TICK_MS);
    expect(fallInterval(plainLab({ speed: 5 }))).toBeLessThan(slow);
    expect(fallInterval(plainLab({ speed: 5 }))).toBeGreaterThan(fast);
  });

  it('1000 очков на ступень скорости: на 999 очках скорость прежняя, на 1000-м — выше на единицу, и так каждую тысячу', () => {
    const below = plainLab();
    below.poke(998);
    clearOneRow(below);
    expect(below.score).toBe(999);
    expect(below.speed).toBe(1);

    const at = plainLab();
    at.poke(999);
    clearOneRow(at);
    expect(at.score).toBe(1000);
    expect(at.speed).toBe(2);

    const second = plainLab({ speed: 2 });
    second.poke(1999);
    clearOneRow(second);
    expect(second.score).toBe(2000);
    expect(second.speed).toBe(3);
  });
});

// ------------------------------------------------------------------ очки

describe('описание «Тетриса»: очки', () => {
  it('+1, +3, +7, +15 за один, два, три и четыре ряда одной фигурой', () => {
    const expected = [1, 3, 7, 15];
    for (let rows = 1; rows <= 4; rows++) {
      const lab = well(rows);
      tap(lab, 'fire');
      until(lab, () => lab.count() === 4 - rows, 600);
      expect(lab.score, `${rows} рядов`).toBe(expected[rows - 1]);
      expect(TETRIS_GUIDE.scoring[rows - 1]?.points).toBe(`+${expected[rows - 1]}`);
    }
  });

  it('за падение, бросок и спецфигуры очков нет', () => {
    const drop = plainLab();
    drop.wipe();
    drop.put(7, 0, 4, 12);
    tap(drop, 'fire');
    expect(drop.score).toBe(0);

    // мягкое падение: зажатая «вниз» сажает квадрат за считаные такты, а затем следующие фигуры, но рядов нет — очков нет
    const soft = plainLab();
    soft.wipe();
    soft.put(7, 0, 4, 6);
    for (let i = 0; i < 60; i++) soft.step({ pressed: new Set(i === 0 ? ['down'] : []), held: new Set(['down']) });
    expect(soft.count()).toBeGreaterThanOrEqual(4);
    expect(soft.score).toBe(0);

    // спецфигуры: точка, пушка, грязевая пушка (стреляет до посадки) и бомба
    for (const [index, shape] of [27, 28, 29, 30].entries()) {
      const lab = labFor('tetris', (v) => v.family === 'plain' && !v.inverted && !v.lineTimer && !v.morph && !v.shift && v.supers.join() === [index].join());
      lab.wipe();
      lab.fill(0, '...#......');
      lab.put(shape, 0, 3, 10, true);
      tap(lab, 'rotate');
      tap(lab, 'fire');
      idle(lab, 300);
      expect(lab.score, `спецфигура ${shape}`).toBe(0);
    }
    expect(TETRIS_GUIDE.scoring[4]?.points).toBe('0');
  });
});

// ------------------------------------------------------------------ ход игры

describe('описание «Тетриса»: скорость, уровень, ряды', () => {
  it('число на LEVEL — число случайных рядов снизу в начале партии; в каждом есть и клетки, и дыры', () => {
    for (const level of [0, 1, 4, 9]) {
      const menu = new BrickConsole({ catalog: [{ symbol: '8', id: 'tetris', def: tetrisDef }], seed: 1, level });
      menu.start();
      expect(menu.displayLevel).toBe(level);
      const cells = menu.cells();
      const lit = (row: number): number => cells.slice(row * 10, row * 10 + 10).reduce((sum, value) => sum + (value === 0 ? 0 : 1), 0);
      for (let row = 20 - level; row < 20; row++) {
        expect(lit(row), `уровень ${level}, строка ${row}`).toBeGreaterThan(0);
        expect(lit(row)).toBeLessThan(10);
      }
      // над случайными рядами пусто (падающая фигура ещё только входит в поле)
      expect(lit(20 - level - 1)).toBe(0);
    }
  });

  it('B0202: скорость ограничена десятой, выбранный уровень сохраняется', () => {
    const lab = plainLab({ speed: 10, level: 3 });
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

  it('полный ряд — десять клеток: ряд из девяти не исчезает; поле 10 × 20, NEXT 4 × 4', () => {
    const lab = plainLab();
    expect(lab.cells().length).toBe(200);
    expect(lab.preview()?.length).toBe(16);
    lab.wipe();
    lab.fill(0, '.########.');
    lab.put(5, 0, 0, 10);
    tap(lab, 'fire');
    expect(lab.score).toBe(0);
    const full = plainLab();
    full.wipe();
    full.fill(0, '.#########');
    full.put(5, 0, 0, 10);
    tap(full, 'fire');
    expect(full.score).toBe(1);
  });

  it('фигура появляется по центру, поворот — на 90° по часовой, у стенки сдвигается внутрь поля, без места не поворачивается', () => {
    const lab = plainLab();
    lab.wipe();
    lab.respawn(7);
    expect(lab.px).toBe(4);
    lab.wipe();
    lab.put(6, 0, 4, 10);
    tap(lab, 'rotate');
    expect(lab.current?.angle).toBe(1);

    const wall = plainLab();
    wall.wipe();
    wall.put(5, 0, 0, 10);
    tap(wall, 'rotate');
    expect(wall.current?.angle).toBe(1);
    expect(wall.px + (wall.current?.minX ?? 0)).toBeGreaterThanOrEqual(0);

    const blocked = plainLab();
    blocked.wipe();
    blocked.put(5, 0, 3, 10);
    blocked.fill(11, '.....#....');
    tap(blocked, 'rotate');
    expect(blocked.current?.angle).toBe(0);
  });
});

describe('описание «Тетриса»: числа в правилах вариантов', () => {
  it('каждая 7-я фигура мигает в вариантах с особыми фигурами; в обычном варианте мигающих нет', () => {
    const special = labFor('tetris', (v) => v.family === 'liquid' && !v.inverted && !v.lineTimer && !v.morph && !v.shift && v.supers.length === 0);
    let blinking = 0;
    for (let i = 0; i < 700; i++) {
      special.wipe();
      special.respawn(7);
      if (special.upcoming.blink) blinking++;
    }
    expect(blinking / 700).toBeGreaterThan(1 / 7 - 0.05);
    expect(blinking / 700).toBeLessThan(1 / 7 + 0.05);
    const plain = plainLab();
    for (let i = 0; i < 300; i++) {
      plain.wipe();
      plain.respawn(7);
      expect(plain.upcoming.blink).toBe(false);
    }
  });

  it('супербомба стирает квадрат 5 × 5 вокруг своего центра, остальное остаётся', () => {
    const lab = labFor('tetris', (v) => v.family === 'plain' && !v.inverted && !v.lineTimer && !v.morph && !v.shift && v.supers.join() === '3');
    lab.wipe();
    for (let y = 0; y < 12; y++) lab.fill(y, '#########.');
    expect(lab.count()).toBe(108);
    lab.put(30, 0, 2, 12, true);
    tap(lab, 'fire');
    until(lab, () => lab.count() === 98, 600);
    // бомба села на верх кучи (ряд 12); взрыв — колонки 1–5 и ряды от 10: в кучу попали два ряда по пять клеток
    expect(lab.count()).toBe(98);
    for (let y = 10; y <= 11; y++) {
      for (let x = 1; x <= 5; x++) expect(lab.cell(x, y), `${x},${y}`).toBe(0);
      expect([0, 6, 7, 8].map((x) => lab.cell(x, y))).toEqual([1, 1, 1, 1]);
    }
    expect([1, 5].map((x) => lab.cell(x, 9))).toEqual([1, 1]);
  });

  it('новый ряд по таймеру: первый — через 30 секунд, дальше примерно каждые 30 (31) секунд, пока фигура не мешает', () => {
    const lab = labFor('tetris', (v) => v.lineTimer && !v.morph && !v.shift && v.type === 1);
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

  it('смена фигуры вместо поворота: падение медленнее ровно на 50 мс (на один-два такта в пределах округления)', () => {
    const swap = fallInterval(labFor('tetris', (v) => v.morph && !v.lineTimer && !v.shift && v.type === 1));
    const plain = fallInterval(plainLab());
    expect(Math.abs(ms(swap) - ms(plain) - 50)).toBeLessThanOrEqual(ONE_TICK_MS * 2);
  });
});

// ------------------------------------------------------------------ схемы

describe('описание «Тетриса»: схемы совпадают с игрой', () => {
  it('схема 1: семь фигур каталога в положении 0° — ровно то, что рисует игра', () => {
    const lab = plainLab();
    for (const shape of [3, 4, 5, 6, 7, 8, 9]) {
      expect(shown(lab, shape, false), `фигура ${shape}`).toEqual(picture(shape));
    }
    expect(TETRIS_GUIDE.schemes[0]?.cells).toEqual([
      ...lineUp([3, 4, 5, 7].map((shape) => picture(shape)), 10),
      '..........',
      ...lineUp([6, 8, 9].map((shape) => picture(shape)), 10),
    ]);
  });

  it('схема 2: палка в колодец закрывает четыре ряда сразу (+15), схема сыграна в игре', () => {
    const cells = TETRIS_GUIDE.schemes[1]?.cells ?? [];
    const gap = cells.indexOf('..........');
    const piece = cells.slice(0, gap);
    const stack = cells.slice(gap + 1);
    const column = (piece[0] ?? '').indexOf('#');
    expect(piece).toEqual(picture(5).map((row) => row.replace('#', '.'.repeat(column) + '#').padEnd(10, '.')));
    const lab = plainLab();
    lab.wipe();
    stack.forEach((row, i) => lab.fill(stack.length - 1 - i, row));
    lab.put(5, 0, column, 10);
    tap(lab, 'fire');
    until(lab, () => lab.count() === 0, 800);
    expect(lab.count()).toBe(0);
    expect(lab.score).toBe(15);
    expect(TETRIS_GUIDE.schemes[1]?.caption.ru).toContain('+15');
  });

  it('схема 3: четыре спецфигуры мигают, а под ними лежит куча клеток без полных рядов и без «висящих» клеток', () => {
    const cells = TETRIS_GUIDE.schemes[2]?.cells ?? [];
    const lab = labFor('tetris', (v) => v.family === 'plain' && !v.inverted && !v.lineTimer && !v.morph && !v.shift && v.supers.length === 4);
    const specials = [27, 28, 29, 30];
    for (const shape of specials) expect(shown(lab, shape, true), `спецфигура ${shape}`).toEqual(picture(shape, '*'));
    expect(cells.slice(0, 3)).toEqual(lineUp(specials.map((shape) => picture(shape, '*')), 10));
    const heap = cells.slice(4);
    expect(cells[3]).toBe('..........');
    expect(heap.every((row) => /^[#.]+$/.test(row) && row.includes('.'))).toBe(true);
    heap.forEach((row, i) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '#' && i + 1 < heap.length) expect(heap[i + 1]?.[x], `клетка ${x},${i}`).toBe('#');
      }
    });
  });
});

// ------------------------------------------------------------------ допущения

describe('описание «Тетриса»: допущения о консолях', () => {
  it('у «Морского боя» (E) показаны первые 20 из 51 вариантов; у «168 в 1 танк» (8) заявлено 51', () => {
    const sea = TOYS.seabattle.games.find((game) => game.id === 'tetris');
    expect(sea?.variants).toBe(20);
    expect(sea?.modes).toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect(TOYS.tank168.games.find((game) => game.id === 'tetris')?.variants).toBe(51);
    expect(TETRIS_GUIDE.assumptions.map((text) => text.ru).join(' ')).toContain('20 из 51');
    expect(TETRIS_GUIDE.assumptions.map((text) => text.ru).join(' ')).toContain('51 вариант');
  });

  it('«вверх» поворачивает фигуру, а бросок — только «огонь»; на перевёрнутом поле «вверх» и «вниз» меняются ролями', () => {
    const lab = plainLab();
    lab.wipe();
    lab.put(6, 0, 4, 10);
    tap(lab, 'up');
    expect(lab.current?.angle).toBe(1);
    expect(lab.landed).toBe(false);
    lab.put(7, 0, 4, 10);
    tap(lab, 'fire');
    expect(lab.landed).toBe(true);

    const upside = labFor('tetris', (v) => v.inverted && v.supers.length === 0 && !v.lineTimer && !v.morph && !v.shift && v.family === 'plain');
    upside.wipe();
    upside.put(6, 0, 4, 12);
    idle(upside, 20);
    tap(upside, 'down');
    expect(upside.current?.angle).toBe(1);
  });
});
