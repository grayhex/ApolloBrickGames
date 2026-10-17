/**
 * Описание игры «Стрельба по фигурам / достройка» (`SHAPES_GUIDE`): схема описания корректна, заглушек нет, а каждое число в тексте подтверждено
 * поведением игры — числа здесь не берутся из констант, а измеряются игрой (жизни при старте, очки за клетку и прямоугольник, порог скорости,
 * порог добавочной жизни, шаг спуска в мс, частота появления фигур, число стартовых фигур, размеры фигур достройки, время мигания, роли вариантов).
 */
import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  BRICK_TICK_HZ,
  NEUTRAL_BRICK_INPUT,
  guideProblems,
  makeBrickInput,
  type BrickGameOptions,
  type GameGuideData,
  type GuideText,
} from '../../../src/brick';
import { TETROMINOES, findRectangle, placeFigure } from '../../../src/brick/games/gun/figures';
import type { GunSpace } from '../../../src/brick/games/gun/space';
import { MT1997_VARIANTS, ShapesGame, shapesDef } from '../../../src/brick/games/shapes';
import { BRICK_GUIDES, SHAPES_GUIDE } from '../../../src/brick/guides';
import { frameHash } from '../conformance';
import { hold, idle, litRows, run, show, skipIntro, tap, types } from './gunKit';

/** Игра с доступом к внутренностям: поле пушки (донорские координаты: ряд 0 у пушки), пули, очки. */
class TestShapes extends ShapesGame {
  field(): GunSpace {
    return this.space;
  }
  gunX(): number {
    return this.gun.x;
  }
  put(x: number, y: number): void {
    this.space.set(x, y, 1);
  }
  /** Поставить фигуру, заданную строками спрайта (верх — первая строка), левым верхним углом в (x, topY). */
  figure(rows: readonly string[], x: number, topY: number): void {
    placeFigure(this.space, rows, x, topY);
  }
  bulletRows(x: number): (number | null)[] {
    return this.bullets.visibleRows(x);
  }
  bulletCount(): number {
    return this.bullets.count;
  }
  give(points: number): void {
    this.award(points);
  }
  setLivesTo(count: number): void {
    this.setLives(count);
  }
  /** Остановить спуск (для проверок стрельбы, чтобы фигуры не уходили вниз). */
  freezeDescent(): void {
    this.descentClock.reset(1_000_000);
  }
}

const make = (mode = 0, extra: BrickGameOptions = {}): TestShapes => new TestShapes({ seed: 5, mode, ...extra });
/** Игра, запущенная и прошедшая «мелодию»: первое действие игрока — в следующем такте. */
const started = (mode = 0, extra: BrickGameOptions = {}): TestShapes => {
  const game = make(mode, extra);
  game.start();
  skipIntro(game);
  return game;
};
/** Чистое поле без спуска: на нём только то, что положит тест. */
const bare = (mode = 0, extra: BrickGameOptions = {}): TestShapes => {
  const game = started(mode, extra);
  game.field().clear();
  game.freezeDescent();
  return game;
};

/** Двинуть пушку в колонку, выстрелить и дождаться, пока пуля долетит. */
function shootAt(game: TestShapes, column: number, wait = 14): void {
  while (game.gunX() < column) tap(game, 'right');
  while (game.gunX() > column) tap(game, 'left');
  tap(game, 'fire', wait);
}

const GUIDE: GameGuideData = SHAPES_GUIDE;

// ---------------------------------------------------------------- числа из текстов и числа, которые измеряет игра

/** Все тексты описания (без схем-рисунков). */
const textsOf = (guide: GameGuideData): GuideText[] => [
  guide.summary,
  guide.goal,
  guide.progression,
  ...(guide.lives ? [guide.lives] : []),
  ...guide.rules,
  ...guide.controls.map((control) => control.text),
  ...guide.scoring.map((score) => score.what),
  ...guide.facts.map((fact) => fact.label),
  ...guide.schemes.map((scheme) => scheme.caption),
  ...guide.assumptions,
];

/** Числа в строке (целые и десятичные, запятая или точка), нормализованные к точке. Тысячи пишутся без разделителей; «MT1997» — название источника, не число. */
const numbersIn = (text: string): string[] =>
  (text.replace(/MT1997/g, 'MT').match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) => value.replace(',', '.'));

/** Связные по сторонам группы горящих клеток на экране (без двух нижних строк — там пушка): размеры и границы. */
function groups(cells: Uint8Array): { size: number; minX: number; maxX: number; minY: number; maxY: number }[] {
  const seen = new Uint8Array(cells.length);
  const out: { size: number; minX: number; maxX: number; minY: number; maxY: number }[] = [];
  const rows = BRICK_ROWS - 2;
  for (let start = 0; start < rows * BRICK_COLS; start++) {
    if (cells[start] !== 1 || seen[start]) continue;
    const group = { size: 0, minX: BRICK_COLS, maxX: -1, minY: BRICK_ROWS, maxY: -1 };
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop() ?? 0;
      const x = index % BRICK_COLS;
      const y = Math.floor(index / BRICK_COLS);
      group.size++;
      group.minX = Math.min(group.minX, x);
      group.maxX = Math.max(group.maxX, x);
      group.minY = Math.min(group.minY, y);
      group.maxY = Math.max(group.maxY, y);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= BRICK_COLS || ny < 0 || ny >= rows) continue;
        const next = ny * BRICK_COLS + nx;
        if (cells[next] === 1 && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    out.push(group);
  }
  return out;
}

/** Жизни в начале партии. */
const startLives = (): number => make().lives ?? 0;

/** Очки за клетку, сбитую пулей (отстрел): выстрел в столбик. */
function pointsPerDestroyedCell(): number {
  const game = bare(0);
  game.figure(['#', '#'], 4, 12);
  const events = [...tap(game, 'fire'), ...idle(game, 12)];
  expect(types(events)).toEqual(['shot', 'hit']);
  return game.score;
}

/** Очки за клетку, добавленную пулей (достройка): выстрел под висячую фигуру, прямоугольником она не становится. */
function pointsPerAddedCell(): number {
  const game = bare(2);
  game.figure(['###', '#.#', '..#'], 3, 15);
  const events = [...tap(game, ['left', 'fire']), ...idle(game, 14)];
  expect(types(events)).toEqual(['move', 'shot', 'lock']);
  return game.score;
}

/** Сколько клеток у прямоугольника, который только что замкнулся (мигающие клетки на экране). */
const blinking = (game: TestShapes): number => game.cells().filter((value) => value === 2).length;

/**
 * Очки за клетку исчезнувшего прямоугольника: достраиваем фигуру, на моменте замыкания считаем мигающие клетки (площадь) и счёт,
 * после исчезновения — разность счёта, делённая на площадь.
 */
function pointsPerRectangleCell(setup: (game: TestShapes) => void, shots: readonly number[]): { area: number; perCell: number } {
  const game = bare(2);
  setup(game);
  for (const column of shots) shootAt(game, column);
  const area = blinking(game);
  const before = game.score;
  expect(area).toBeGreaterThan(0);
  idle(game, 60);
  expect(game.field().total()).toBe(0);
  return { area, perCell: (game.score - before) / area };
}

/** Сколько очков нужно до следующей скорости: набираем по одному, пока скорость не сменится. */
function pointsPerSpeedStep(): number {
  const game = started();
  let points = 0;
  while (game.speed === 1 && points < 100_000) {
    game.give(1);
    points++;
  }
  return points;
}

/** Сколько очков нужно до добавочной жизни (жизней сначала три). */
function pointsPerExtraLife(): number {
  const game = started();
  game.setLivesTo(3);
  let points = 0;
  while (game.lives === 3 && points < 1_000_000) {
    game.give(1);
    points++;
  }
  return points;
}

/** Бонус вместо добавочной жизни при полных жизнях: насколько счёт перескакивает через порог. */
function fullLivesBonus(): number {
  const threshold = pointsPerExtraLife();
  const game = started();
  game.give(threshold - 1);
  game.give(1);
  expect(game.lives).toBe(4);
  return game.score - threshold;
}

/** Такты до первого шага спуска на заданной скорости (по первому изменению картинки). */
function descentTicks(speed: number): number {
  const game = started(0, { speed });
  const before = game.cells().slice();
  let ticks = 0;
  while (ticks < 5000) {
    idle(game);
    ticks++;
    if (game.cells().some((value, i) => value !== before[i])) break;
  }
  return ticks;
}

const descentMs = (speed: number): number => (descentTicks(speed) * 1000) / BRICK_TICK_HZ;

/** Через сколько шагов спуска появляется новая фигура, если поле не расчищено. */
function spawnEvery(): number {
  const game = started(0);
  const period = descentTicks(1);
  let ticks = 0;
  while (groups(game.cells()).length < 2 && ticks < 10 * period) {
    idle(game);
    ticks++;
  }
  return ticks / period;
}

/** Через сколько шагов спуска появляется новая фигура, если поле расчищено. */
function spawnWhenCleared(): number {
  const game = started(0);
  game.field().clear();
  const period = descentTicks(1);
  let ticks = 0;
  while (game.field().total() === 0 && ticks < 10 * period) {
    idle(game);
    ticks++;
  }
  return ticks / period;
}

/** Сколько фигур стоит на поле при старте уровня `level`. */
const startFigures = (level: number, mode = 0): number => groups(started(mode, { level }).cells()).length;

/** Размеры фигур достройки на старте (разные зёрна): ширина и высота столбиков. */
function hangingDimensions(): { width: number[]; height: number[] } {
  const width: number[] = [];
  const height: number[] = [];
  for (let seed = 1; seed <= 80; seed++) {
    const game = started(2, { seed });
    const cells = game.cells();
    const figure = groups(cells)[0];
    if (!figure) throw new Error('нет фигуры');
    width.push(figure.maxX - figure.minX + 1);
    for (let x = figure.minX; x <= figure.maxX; x++) {
      let h = 0;
      while (cells[h * BRICK_COLS + x] === 1) h++;
      height.push(h);
    }
  }
  return { width, height };
}

/** Сколько тактов мигает достроенный прямоугольник: от события `lines` до исчезновения клеток. */
function blinkTicks(): number {
  const game = bare(2);
  game.figure(['##', '#.'], 4, 15);
  tap(game, 'right');
  let closed = false;
  tap(game, 'fire');
  for (let i = 0; i < 20 && !closed; i++) closed = types(idle(game)).includes('lines');
  expect(closed).toBe(true);
  let ticks = 0;
  while (game.field().total() > 0 && ticks < 200) {
    idle(game);
    ticks++;
  }
  return ticks;
}

/** Роль варианта: какое событие даёт попадание (`hit` — отстрел, `lock` — достройка) и сдвигается ли поле после шага спуска. */
function variantRole(mode: number): { shooting: boolean; sideways: boolean } {
  const probe = bare(mode);
  probe.put(4, 10);
  const events = types([...tap(probe, 'fire'), ...idle(probe, 12)]);
  const shooting = events.includes('hit');
  expect(shooting || events.includes('lock')).toBe(true);
  const ticks = descentTicks(10);
  const game = started(mode, { seed: 7, speed: 10 });
  game.field().clear();
  game.figure(['#', '#'], 4, 14);
  idle(game, ticks);
  const sideways = game.field().get(4, 12) === 0 && game.field().get(4, 13) === 0;
  return { shooting, sideways };
}

/** Скорость и уровень после того, как очки переходят порог скорости на скорости `speed`, уровне `level`. */
function afterTenth(speed: number, level: number): [number, number] {
  const game = started(0, { speed, level });
  game.give(pointsPerSpeedStep());
  return [game.speed, game.level];
}

/** Наибольшая скорость: после неё скорость возвращается к первой, а уровень растёт. */
function topSpeed(): number {
  for (let speed = 1; speed <= 20; speed++) if (afterTenth(speed, 1)[1] !== 1) return speed;
  throw new Error('скорость не обернулась');
}

/** Наибольший уровень: после него уровень возвращается к первому. */
function topLevel(): number {
  for (let level = 1; level <= 20; level++) if (afterTenth(10, level)[1] < level) return level;
  throw new Error('уровень не обернулся');
}

/** Все числа, подтверждённые игрой (в виде строк, как их находит `numbersIn`). */
function measuredNumbers(): Set<string> {
  const roles = Array.from({ length: shapesDef.modes.length }, (_, mode) => variantRole(mode));
  const figures = Array.from({ length: topLevel() }, (_, i) => startFigures(i + 1));
  const hanging = hangingDimensions();
  const rectangle = pointsPerRectangleCell((game) => game.figure(['##', '#.'], 4, 15), [5]);
  const out = new Set<string>([
    String(startLives()),
    String(pointsPerDestroyedCell()),
    String(pointsPerAddedCell()),
    String(rectangle.perCell),
    String(pointsPerSpeedStep()),
    String(pointsPerExtraLife()),
    String(fullLivesBonus()),
    String(descentMs(1)),
    String(descentMs(10)),
    String(topSpeed()),
    String(topLevel()),
    ...afterTenth(10, 10).map(String), // нижние границы: скорость 1 и уровень 1
    String(spawnEvery()),
    String(Math.min(...hanging.width)),
    String(Math.max(...hanging.width)),
    String(Math.min(...hanging.height)),
    String(Math.max(...hanging.height)),
    String(blinkTicks() / BRICK_TICK_HZ),
    // варианты: их число, номера (с единицы), сколько отстрелов и сколько достроек
    String(shapesDef.modes.length),
    ...roles.map((_, mode) => String(mode + 1)),
    String(roles.filter((role) => role.shooting).length),
    String(roles.filter((role) => !role.shooting).length),
  ]);
  // уровни, на которых стартует одна, две и три фигуры: первый и последний уровень каждой группы и само число
  for (const count of new Set(figures)) {
    out.add(String(count));
    out.add(String(figures.indexOf(count) + 1));
    out.add(String(figures.lastIndexOf(count) + 1));
  }
  return out;
}

// ---------------------------------------------------------------- проверки

describe('shapes: описание — форма', () => {
  it('guideProblems пуст, описание зарегистрировано под id каталога', () => {
    expect(guideProblems(GUIDE)).toEqual([]);
    expect(BRICK_GUIDES['shooting-figures']).toBe(SHAPES_GUIDE);
  });

  it('заглушек нет ни в русском, ни в английском тексте', () => {
    for (const text of textsOf(GUIDE)) {
      expect(text.ru).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(text.en).not.toMatch(/ЗАГЛУШКА|STUB/i);
    }
    for (const fact of GUIDE.facts) expect(fact.value).not.toMatch(/ЗАГЛУШКА|STUB/i);
  });

  it('числа в русском и английском тексте одни и те же (в том же порядке)', () => {
    for (const text of textsOf(GUIDE)) expect(numbersIn(text.ru), text.ru).toEqual(numbersIn(text.en));
  });
});

describe('shapes: числа описания подтверждены игрой', () => {
  it('жизни: четыре в начале партии', () => {
    expect(startLives()).toBe(4);
    expect(GUIDE.facts[0]?.value).toBe(String(startLives()));
    expect(GUIDE.lives?.ru).toContain(`${startLives()} жизни`);
    expect(GUIDE.lives?.en).toContain(`${startLives()} lives`);
  });

  it('очки: +1 за сбитую клетку, +1 за добавленную, +2 за каждую клетку исчезнувшего прямоугольника (любой площади)', () => {
    expect(pointsPerDestroyedCell()).toBe(1);
    expect(pointsPerAddedCell()).toBe(1);
    const small = pointsPerRectangleCell((game) => game.figure(['##', '#.'], 4, 15), [5]);
    const large = pointsPerRectangleCell((game) => game.figure(['####', '#..#', '#..#'], 3, 16), [4, 4, 5, 5]);
    expect([small.area, large.area]).toEqual([4, 12]);
    expect([small.perCell, large.perCell]).toEqual([2, 2]);
    expect(GUIDE.scoring.map((score) => score.points)).toEqual([
      `+${pointsPerDestroyedCell()}`,
      `+${pointsPerAddedCell()}`,
      `+${small.perCell} за клетку`,
    ]);
  });

  it('скорость растёт каждые 100 очков; после десятой — первая, уровень +1, после десятого уровня — первый', () => {
    expect(pointsPerSpeedStep()).toBe(100);
    expect(GUIDE.facts[1]?.value).toBe(String(pointsPerSpeedStep()));
    expect(GUIDE.progression.ru).toContain(`Каждые ${pointsPerSpeedStep()} очков`);
    expect(GUIDE.progression.en).toContain(`Every ${pointsPerSpeedStep()} points`);
    expect(afterTenth(10, 3)).toEqual([1, 4]);
    expect(afterTenth(10, 10)).toEqual([1, 1]);
    expect(afterTenth(4, 3)).toEqual([5, 3]);
    expect([topSpeed(), topLevel()]).toEqual([10, 10]);
    expect(GUIDE.progression.ru).toContain('После скорости 10 — снова скорость 1');
    expect(GUIDE.progression.ru).toContain('после уровня 10 — уровень 1');
  });

  it('добавочная жизнь за каждые 2000 очков; при полных жизнях вместо неё +200 очков', () => {
    expect(pointsPerExtraLife()).toBe(2000);
    expect(fullLivesBonus()).toBe(200);
    expect(GUIDE.facts[2]?.value).toBe(String(pointsPerExtraLife()));
    for (const text of [GUIDE.lives?.ru ?? '', GUIDE.lives?.en ?? '']) {
      expect(numbersIn(text)).toEqual([String(startLives()), String(pointsPerExtraLife()), String(startLives()), String(fullLivesBonus())]);
    }
  });

  it('шаг спуска: 800 мс на скорости 1 и 300 мс на скорости 10', () => {
    expect([descentMs(1), descentMs(10)]).toEqual([800, 300]);
    expect(GUIDE.facts[3]?.value).toBe(`${descentMs(1)}→${descentMs(10)}`);
  });

  it('число вариантов и их роли: восемь; отстрел — 1, 2, 5, 6, достройка — 3, 4, 7, 8, «в бок» — чётные (5–8 — те же, но вверх дном)', () => {
    expect(shapesDef.modes.length).toBe(8);
    expect(MT1997_VARIANTS).toBe(4);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(variantRole)).toEqual([
      { shooting: true, sideways: false },
      { shooting: true, sideways: true },
      { shooting: false, sideways: false },
      { shooting: false, sideways: true },
      { shooting: true, sideways: false },
      { shooting: true, sideways: true },
      { shooting: false, sideways: false },
      { shooting: false, sideways: true },
    ]);
    expect(GUIDE.summary.ru).toContain('(варианты 1–2 и 5–6)');
    expect(GUIDE.summary.ru).toContain('(3–4 и 7–8)');
    expect(GUIDE.summary.en).toContain('(variants 1–2 and 5–6)');
    expect(GUIDE.summary.en).toContain('(3–4 and 7–8)');
    expect(GUIDE.rules.some((text) => text.ru.includes('(2, 4, 6 и 8)') && text.en.includes('(2, 4, 6 and 8)'))).toBe(true);
    expect(GUIDE.assumptions[0]?.ru).toContain(`${MT1997_VARIANTS} варианта: 2 отстрела и 2 достройки`);
    expect(GUIDE.assumptions[0]?.en).toContain(`${MT1997_VARIANTS} variants: 2 shooting, 2 completing`);
    expect(GUIDE.assumptions.some((text) => text.ru.includes('Варианты 5–8') && text.ru.includes('вверх дном') && text.en.includes('Variants 5–8'))).toBe(true);
  });

  it('в числах всех текстов нет ничего, кроме измеренного игрой (допущение о донорских 16 вариантах и т. п. здесь не встречается)', () => {
    const measured = measuredNumbers();
    for (const text of textsOf(GUIDE)) {
      for (const language of [text.ru, text.en]) {
        for (const value of numbersIn(language)) expect(measured.has(value), `«${language}»: число ${value} не подтверждено`).toBe(true);
      }
    }
    for (const value of GUIDE.facts.flatMap((fact) => numbersIn(fact.value))) expect(measured.has(value), `факт: число ${value}`).toBe(true);
    for (const value of GUIDE.scoring.flatMap((score) => numbersIn(score.points))) expect(measured.has(value), `очки: число ${value}`).toBe(true);
  });
});

describe('shapes: правила описания совпадают с игрой', () => {
  it('фигуры: новая — через пять шагов спуска, а если поле расчищено — на ближайшем шаге; на уровне стартует 1, 2 или 3 фигуры', () => {
    expect(spawnEvery()).toBe(5);
    expect(spawnWhenCleared()).toBe(1);
    expect(GUIDE.rules[0]?.ru).toContain('каждые 5 шагов');
    expect(GUIDE.rules[0]?.en).toContain('every 5 steps');
    expect(Array.from({ length: 10 }, (_, i) => startFigures(i + 1))).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
    expect(Array.from({ length: 10 }, (_, i) => startFigures(i + 1, 2))).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
    const rule = GUIDE.rules.find((text) => text.ru.includes('На уровнях'));
    expect(rule?.ru).toContain('1–4 стартует одна фигура, 5–8 две, дальше 3');
    expect(rule?.en).toContain('Levels 1–4 start with one shape, 5–8 two, then 3');
  });

  it('отстрел: фигуры — тетрамино; достройка: столбики 2–4 колонки высотой 1–3, верх на одной строке, не прямоугольник', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const found = groups(started(0, { seed }).cells());
      expect(found.length).toBe(1);
      expect(found[0]?.size).toBe(4);
    }
    const { width, height } = hangingDimensions();
    expect([Math.min(...width), Math.max(...width)]).toEqual([2, 4]);
    expect([Math.min(...height), Math.max(...height)]).toEqual([1, 3]);
    const rule = GUIDE.rules.find((text) => text.ru.startsWith('Достройка:'));
    expect(rule?.ru).toContain('2–4 колонки высотой 1–3');
    expect(rule?.en).toContain('2–4 columns, 1–3 high');
    for (let seed = 1; seed <= 30; seed++) {
      const game = started(2, { seed });
      const figure = groups(game.cells())[0];
      expect(figure && findRectangle(game.field(), figure.minX, 19)).toBeNull();
    }
  });

  it('пуля: в отстреле уничтожает первую клетку и без цели исчезает, обломки падают вместе с полем; в достройке встаёт под первую клетку, без цели улетает', () => {
    const shoot = bare(0);
    shoot.figure(['#', '#', '#'], 4, 12);
    tap(shoot, 'fire', 12);
    expect([shoot.field().get(4, 10), shoot.field().get(4, 11), shoot.score]).toEqual([0, 1, 1]);
    const miss = bare(0);
    tap(miss, 'fire', 20);
    expect([miss.bulletCount(), miss.field().total(), miss.score]).toEqual([0, 0, 0]);

    const fall = started(0, { speed: 10 });
    fall.field().clear();
    fall.figure(['####'], 2, 15);
    tap(fall, ['left', 'fire'], 14);
    expect(fall.field().get(3, 15)).toBe(0);
    const period = descentTicks(10);
    idle(fall, period);
    const left = [2, 4, 5].map((x) => fall.field().get(x, 14));
    expect(left).toEqual([1, 1, 1]);

    const build = bare(2);
    build.figure(['###', '#.#', '..#'], 3, 15);
    tap(build, ['left', 'fire'], 14);
    expect(build.field().get(3, 13)).toBe(1);
    const away = bare(2);
    tap(away, 'fire', 20);
    expect([away.bulletCount(), away.field().total(), away.score]).toEqual([0, 0, 0]);
  });

  it('прямоугольник мигает 0,4 с и исчезает; лишняя клетка не страшна; соприкоснувшиеся фигуры — одна группа', () => {
    expect(blinkTicks() / BRICK_TICK_HZ).toBe(0.4);
    expect(GUIDE.rules.filter((text) => text.ru.includes('мигает 0,4 с') && text.en.includes('blinks for 0.4 s')).length).toBe(1);
    expect(GUIDE.scoring.length).toBe(3);

    const extra = bare(2);
    extra.figure(['##', '#.'], 4, 15);
    shootAt(extra, 4);
    shootAt(extra, 5);
    expect(blinking(extra)).toBe(0);
    shootAt(extra, 5);
    expect(blinking(extra)).toBe(6); // 2 × 3: прямоугольник вышел больше
    idle(extra, 60);
    expect(extra.score).toBe(3 + 6 * 2);

    const merged = bare(2);
    merged.figure(['##', '#.'], 2, 15);
    merged.figure(['#', '#'], 4, 15);
    shootAt(merged, 3);
    idle(merged, 60);
    expect(merged.field().total()).toBe(0);
    expect(merged.score).toBe(1 + 6 * 2);
  });

  it('любая висячая фигура достраивается до прямоугольника — ровно за столько выстрелов, сколько клеток не хватает до рамки', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const game = started(2, { seed });
      game.freezeDescent();
      const figure = groups(game.cells())[0];
      if (!figure) throw new Error('нет фигуры');
      /** Высоты колонок фигуры, считая от верхней строки экрана. */
      const heights = (): number[] =>
        Array.from({ length: figure.maxX - figure.minX + 1 }, (_, i) => {
          let h = 0;
          while (game.cells()[h * BRICK_COLS + figure.minX + i] === 1) h++;
          return h;
        });
      const start = heights();
      const tall = Math.max(...start);
      const missing = start.reduce((sum, h) => sum + tall - h, 0);
      let shots = 0;
      while (blinking(game) === 0 && shots < 20) {
        const now = heights();
        shootAt(game, figure.minX + now.indexOf(Math.min(...now)), 22); // фигура у верхнего края: пуле лететь около 17 тактов
        shots++;
      }
      expect(shots, `зерно ${seed}`).toBe(missing);
      expect(blinking(game), `зерно ${seed}`).toBe(start.length * tall);
    }
  });

  it('пока мигает прямоугольник, кнопки не работают, пули пропадают', () => {
    const game = bare(2);
    game.figure(['##', '#.'], 4, 15);
    tap(game, 'right');
    tap(game, 'fire');
    let closed = false;
    for (let i = 0; i < 20 && !closed; i++) closed = types(idle(game)).includes('lines');
    expect(closed).toBe(true);
    const x = game.gunX();
    run(game, 10, () => makeBrickInput(['left', 'fire']));
    expect([game.gunX(), game.bulletCount()]).toEqual([x, 0]);
  });

  it('кнопки: влево и вправо повторяются при удержании, зажатый огонь стреляет очередью, rotate и fire — одна кнопка', () => {
    const game = bare(0);
    hold(game, 'right', 7);
    expect(game.gunX()).toBe(7);
    const shots = types(hold(game, 'fire', 10)).filter((name) => name === 'shot');
    expect(shots.length).toBe(4);
    expect(types(tap(bare(0), 'rotate'))).toEqual(['shot']);
    expect(GUIDE.controls.map((control) => control.button)).toEqual(['left', 'right', 'rotate']);
  });

  it('«в бок»: после шага спуска поле сдвигается на клетку, без оборачивания; касание ряда ствола — потеря жизни и тот же уровень заново', () => {
    const step = descentTicks(10);
    for (const mode of [1, 3]) {
      const edge = started(mode, { seed: 3, speed: 10 });
      edge.field().clear();
      edge.figure(['#', '#'], 9, 14);
      idle(edge, step);
      expect([edge.field().get(8, 12), edge.field().get(8, 13), edge.field().get(0, 12)]).toEqual([1, 1, 0]);
    }
    const game = started(0, { speed: 10, level: 5 });
    game.give(3);
    game.field().clear();
    game.put(8, 2);
    expect(types(idle(game, step))).toEqual(['crash']);
    idle(game, 4 * 7 * 4);
    expect(game.lives).toBe(3);
    idle(game, 72 + 90 + 1);
    expect([game.speed, game.level, game.score]).toEqual([10, 5, 3]);
    expect(groups(game.cells()).length).toBe(2);
  });

  it('восемь вариантов различаются; следующий номер по кругу возвращает первый', () => {
    const played = (mode: number): string => {
      const game = started(mode);
      run(game, 400, (t) => (t % 7 === 0 ? makeBrickInput(['fire']) : t % 29 === 0 ? makeBrickInput(['left']) : NEUTRAL_BRICK_INPUT));
      return frameHash(game);
    };
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(played)).size).toBe(8);
    expect(played(8)).toBe(played(0));
  });
});

describe('shapes: схемы описания — кадры игры', () => {
  const bottom = (game: TestShapes, count: number): string[] => show(game.cells()).split('\n').slice(-count);
  const crop = (rows: readonly string[]): string[] => {
    const lit = rows.map((row) => [...row].flatMap((cell, x) => (cell === '.' ? [] : [x])));
    const all = lit.flat();
    const minX = Math.min(...all);
    const maxX = Math.max(...all);
    return rows.map((row) => row.slice(minX, maxX + 1).replace(/\*/g, '#'));
  };

  it('отстрел: тетрамино Z и пуля в её колонке — кадр совпадает с игрой, пуля срезает нижнюю клетку колонки', () => {
    const scheme = GUIDE.schemes[0]?.cells ?? [];
    expect(TETROMINOES.map((sprite) => sprite.join('/'))).toContain(crop(scheme.slice(0, 2)).join('/'));
    const game = bare(0);
    game.figure(['##.', '.##'], 3, 7);
    tap(game, 'fire');
    idle(game, 1);
    expect(bottom(game, scheme.length)).toEqual(scheme);
    const events = idle(game, 10);
    expect(types(events)).toEqual(['hit']);
    expect([game.field().get(4, 6), game.field().get(4, 7), game.score]).toEqual([0, 1, 1]);
  });

  it('достройка: висячая фигура (верх на одной строке, не прямоугольник) и пуля — кадр совпадает, пуля встаёт под клетку и заполняет провал', () => {
    const scheme = GUIDE.schemes[1]?.cells ?? [];
    const figureRows = scheme.slice(0, 3);
    const game = bare(2);
    game.figure(figureRows.map((row) => row.slice(3, 6)), 3, 7);
    expect(findRectangle(game.field(), 3, 7)).toBeNull();
    expect(figureRows.every((row) => row.slice(0, 3) === '...' && row.slice(6) === '....')).toBe(true);
    expect(figureRows[0]?.slice(3, 6)).toBe('###');
    tap(game, 'fire');
    idle(game, 1);
    expect(bottom(game, scheme.length)).toEqual(scheme);
    const events = idle(game, 10);
    expect(types(events)).toEqual(['lock']);
    expect([game.field().get(4, 6), game.field().get(4, 5)]).toEqual([1, 0]);
  });

  it('прямоугольник: после последнего выстрела фигура 3 × 3 мигает целиком — кадр совпадает со схемой', () => {
    const scheme = GUIDE.schemes[2]?.cells ?? [];
    const game = bare(2);
    game.figure(['###', '#.#', '#.#'], 3, 5);
    tap(game, 'fire', 8);
    expect(blinking(game)).toBe(0);
    let events = tap(game, 'fire');
    for (let i = 0; i < 20 && !types(events).includes('lines'); i++) events = idle(game);
    expect(types(events)).toContain('lines');
    expect(bottom(game, scheme.length)).toEqual(scheme);
    expect(litRows(game.cells())).toEqual([18, 19]);
  });
});
