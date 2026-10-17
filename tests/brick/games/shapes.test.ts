import { scenarioSuite } from '../scenarioCoverage';
import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  NEUTRAL_BRICK_INPUT,
  genuineTicks,
  makeBrickInput,
  msToTicks,
  type BrickGameOptions,
  type BrickInput,
} from '../../../src/brick';
import { findRectangle, placeFigure } from '../../../src/brick/games/gun/figures';
import type { GunSpace } from '../../../src/brick/games/gun/space';
import { SHAPES_MODES, ShapesGame, shapesDef } from '../../../src/brick/games/shapes';
import { conformance, frameHash } from '../conformance';
import { CLEAR_LOSE, CLEAR_WIN, INTRO, KABOOM, at, hold, idle, litRows, rowCells, run, skipIntro, tap, types } from './gunKit';

const coveredScenario = scenarioSuite('shapes');

/** Скорость спуска в тактах (допущение игры: 800 мс на скорости 1 и 300 мс на скорости 10). */
const STEP_1 = genuineTicks(1, 800, 300);
const STEP_10 = genuineTicks(10, 800, 300);
/** Сколько тактов мигает достроенный прямоугольник (допущение: 0,4 с). */
const VANISH = msToTicks(400);

/** Игра с доступом к внутренностям: поле пушки (донорские координаты: ряд 0 у пушки), пушка, пули, очки. */
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

const DESTROY = [0, 1];
const BUILD = [2, 3];

interface Group {
  size: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Связные по сторонам группы горящих клеток на экране (без пушки в двух нижних строках). */
function groups(cells: Uint8Array): Group[] {
  const seen = new Uint8Array(cells.length);
  const out: Group[] = [];
  for (let start = 0; start < (BRICK_ROWS - 2) * BRICK_COLS; start++) {
    if (cells[start] !== 1 || seen[start]) continue;
    const group: Group = { size: 0, minX: BRICK_COLS, maxX: -1, minY: BRICK_ROWS, maxY: -1 };
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
        if (nx < 0 || nx >= BRICK_COLS || ny < 0 || ny >= BRICK_ROWS - 2) continue;
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

/** Все клетки поля пушки как множество `x,y`. */
function cellSet(space: GunSpace): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < BRICK_ROWS; y++) for (let x = 0; x < BRICK_COLS; x++) if (space.get(x, y)) out.add(`${x},${y}`);
  return out;
}

conformance(shapesDef);

describe('shapes: варианты', () => {
  it('четыре варианта: два отстрела и две достройки (без сдвига и со сдвигом); всё, чего нет у донора, помечено допущением', () => {
    expect(shapesDef.id).toBe('shapes');
    expect(shapesDef.declaredModes).toBeNull();
    expect(SHAPES_MODES.length).toBe(4);
    expect(SHAPES_MODES.map((mode) => mode.name.ru)).toEqual([
      'Отстрел фигур',
      'Отстрел фигур, движение в бок',
      'Достройка до прямоугольников',
      'Достройка, движение в бок',
    ]);
    for (const mode of SHAPES_MODES) expect(mode.note).toContain('допущение');
    expect(SHAPES_MODES[0]?.note).toContain('MT1997');
    expect(SHAPES_MODES[2]?.note).toContain('GunGame');
  });

  it('варианты различаются: после одних и тех же действий картинка разная', () => {
    const signatures = new Set<string>();
    for (let mode = 0; mode < 4; mode++) {
      const game = started(mode);
      run(game, 400, (t) => (t % 7 === 0 ? makeBrickInput(['fire']) : t % 29 === 0 ? makeBrickInput(['left']) : NEUTRAL_BRICK_INPUT));
      signatures.add(frameHash(game));
    }
    expect(signatures.size).toBe(4);
  });

  it('одно зерно и одни вводы — одна партия; другое зерно — другие фигуры', () => {
    const play = (seed: number): string => {
      const game = started(2, { seed });
      run(game, 500, (t) => (t % 11 === 0 ? makeBrickInput(['fire']) : NEUTRAL_BRICK_INPUT));
      return frameHash(game);
    };
    expect(play(21)).toBe(play(21));
    expect(play(22)).not.toBe(play(21));
  });
});

describe('shapes: фигуры и спуск', () => {
  it('до старта на поле только пушка, жизни четыре', () => {
    const game = make();
    expect(litRows(game.cells())).toEqual([18, 19]);
    expect(game.lives).toBe(4);
  });

  it('разрушение: на первом уровне сверху одна фигура из четырёх связных клеток (тетрамино)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const game = started(0, { seed });
      const found = groups(game.cells());
      expect(found.length, `зерно ${seed}`).toBe(1);
      expect(found[0]?.size).toBe(4);
      expect(found[0]?.minY).toBe(0);
      expect(found[0]?.maxY).toBeLessThanOrEqual(3);
      expect(found[0]?.maxX).toBeLessThan(BRICK_COLS);
    }
  });

  it('достройка: фигура висячая — верхний ряд сплошной, колонки сплошь от верха, высота 1..3, прямоугольником не является', () => {
    const widths = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const game = started(2, { seed });
      const found = groups(game.cells());
      expect(found.length).toBe(1);
      const figure = found[0];
      if (!figure) throw new Error('нет фигуры');
      const cells = game.cells();
      const width = figure.maxX - figure.minX + 1;
      widths.add(width);
      expect(width).toBeGreaterThanOrEqual(2);
      expect(width).toBeLessThanOrEqual(4);
      expect(figure.minY).toBe(0);
      const heights: number[] = [];
      for (let x = figure.minX; x <= figure.maxX; x++) {
        expect(at(cells, x, 0), `зерно ${seed}`).toBe(1);
        let height = 0;
        while (at(cells, x, height) === 1) height++;
        for (let y = height; y < BRICK_ROWS - 2; y++) expect(at(cells, x, y)).toBe(0);
        heights.push(height);
      }
      expect(Math.max(...heights)).toBeLessThanOrEqual(3);
      expect(new Set(heights).size, `зерно ${seed}`).toBeGreaterThan(1);
      expect(findRectangle(game.field(), figure.minX, 19)).toBeNull();
    }
    expect(widths.size).toBeGreaterThan(1);
  });

  it('на уровне 5..8 стартуют две фигуры, на 9..10 три, через пять рядов друг от друга', () => {
    for (const [level, count] of [
      [1, 1],
      [4, 1],
      [5, 2],
      [8, 2],
      [9, 3],
      [10, 3],
    ] as const) {
      for (const mode of [0, 2]) {
        const game = started(mode, { level });
        const found = groups(game.cells());
        expect(found.length, `уровень ${level}, вариант ${mode + 1}`).toBe(count);
        expect(found.map((group) => group.minY).sort((a, b) => a - b)).toEqual([0, 5, 10].slice(0, count));
      }
    }
  });

  it('все фигуры опускаются вместе на ряд раз в 48 тактов на скорости 1 и раз в 18 на скорости 10', () => {
    expect([STEP_1, STEP_10]).toEqual([48, 18]);
    for (const [speed, period] of [
      [1, STEP_1],
      [10, STEP_10],
    ] as const) {
      const game = started(0, { speed, level: 5 });
      const before = game.cells().slice();
      idle(game, period - 1);
      expect(game.cells()).toEqual(before);
      idle(game);
      expect(game.cells().subarray(10, 17 * 10)).toEqual(before.subarray(0, 16 * 10));
      expect(rowCells(game.cells(), 0)).toBe(0);
    }
  });

  it('если поле расчищено, следующая фигура приходит на ближайшем шаге спуска, а не через пять', () => {
    for (const mode of [0, 2]) {
      const game = started(mode);
      game.field().clear();
      idle(game, STEP_1 - 1);
      expect(game.field().total(), `вариант ${mode + 1}`).toBe(0);
      idle(game);
      expect(groups(game.cells()).length).toBe(1);
      expect(rowCells(game.cells(), 0)).toBeGreaterThan(0);
    }
  });

  it('новая фигура сверху — каждые 5 шагов спуска; фигуры друг на друга не налезают', () => {
    const game = started(0);
    idle(game, 5 * STEP_1 - 1);
    expect(rowCells(game.cells(), 0)).toBe(0);
    expect(groups(game.cells()).length).toBe(1);
    idle(game);
    expect(rowCells(game.cells(), 0)).toBeGreaterThan(0);
    const found = groups(game.cells());
    expect(found.length).toBe(2);
    expect(found.map((group) => group.minY).sort((a, b) => a - b)).toEqual([0, 5]);
    expect(found.map((group) => group.size)).toEqual([4, 4]);
  });

  it('скорость растёт на единицу каждые 100 очков', () => {
    const game = started(0);
    game.give(99);
    expect(game.speed).toBe(1);
    game.give(1);
    expect(game.speed).toBe(2);
    expect(types(idle(game))).toEqual(['levelUp']);
  });
});

describe('shapes: пушка', () => {
  it('зажатая кнопка двигает пушку раз в 3 такта, одно нажатие — на одну клетку; края поля как у донора', () => {
    const game = bare();
    tap(game, 'left');
    expect(game.gunX()).toBe(3);
    hold(game, 'left', 7);
    expect(game.gunX()).toBe(0);
    hold(game, 'left', 7);
    expect(game.gunX()).toBe(0);
    hold(game, 'right', 4);
    expect(game.gunX()).toBe(2);
    expect(at(game.cells(), 2, 18)).toBe(1);
    for (let i = 0; i < 8; i++) hold(game, 'right', 1);
    expect(game.gunX()).toBe(9);
    expect([7, 8, 9].map((x) => at(game.cells(), x, 19))).toEqual([0, 1, 1]);
  });

  it('зажатый огонь стреляет раз в 3 такта; rotate и fire — одна кнопка', () => {
    const game = bare();
    expect(types(tap(game, 'rotate'))).toEqual(['shot']);
    idle(game, 2);
    expect(game.bulletCount()).toBe(1);
    hold(game, 'fire', 10); // такты 0, 3, 6, 9 -> ещё четыре пули (первая успела подняться)
    expect(game.bulletCount()).toBe(5);
  });
});

describe('shapes: отстрел фигур', () => {
  it('пуля уничтожает первую клетку на пути, +1 очко, события `shot` и `hit`', () => {
    const game = bare(0);
    game.figure(['#', '#', '#'], 4, 12); // столбик в колонке 4: ряды 12, 11, 10
    const events = [...tap(game, 'fire'), ...idle(game, 10)];
    expect(types(events)).toEqual(['shot', 'hit']);
    expect(game.field().get(4, 10)).toBe(0);
    expect(game.field().get(4, 11)).toBe(1);
    expect(game.field().get(4, 12)).toBe(1);
    expect(game.score).toBe(1);
    expect(game.bulletCount()).toBe(0);
  });

  it('пули разбирают колонку от ближней к пушке клетки к дальней, по клетке на пулю; соседние колонки не затрагиваются', () => {
    const game = bare(0);
    game.figure(['###', '#.#'], 3, 12); // колонки 3 и 5: клетки на рядах 12 и 11, колонка 4: одна клетка на ряду 12
    tap(game, ['left', 'fire'], 12); // пушка встаёт в колонку 3
    expect(game.field().get(3, 11)).toBe(0);
    expect(game.field().get(3, 12)).toBe(1);
    expect(game.score).toBe(1);
    tap(game, 'fire', 12);
    expect(game.field().get(3, 12)).toBe(0);
    expect(game.score).toBe(2);
    expect([...cellSet(game.field())].sort()).toEqual(['4,12', '5,11', '5,12']);
  });

  it('пробитая посередине фигура распадается на части; обломки продолжают падать вместе со всем полем', () => {
    const game = started(0, { speed: 10 });
    game.field().clear();
    game.figure(['####'], 2, 15);
    tap(game, ['left', 'fire'], 14); // колонка 3 — вторая клетка линии
    expect(game.field().get(3, 15)).toBe(0);
    expect(game.field().total()).toBe(3);
    const steps = (): number => STEP_10 - ((game.tick - INTRO) % STEP_10);
    idle(game, steps());
    expect([...cellSet(game.field())].sort()).toEqual(['2,14', '4,14', '5,14']);
  });

  it('пуля в клетке верхнего ряда разрушает её; без цели пуля показывается в верхнем ряду один такт и пропадает, ничего не создавая', () => {
    const game = bare(0);
    game.put(4, 19);
    tap(game, 'fire');
    idle(game, 16);
    expect(game.bulletRows(4)).toEqual([18]);
    expect(game.field().get(4, 19)).toBe(1);
    idle(game);
    expect(game.field().get(4, 19)).toBe(0);
    expect(game.score).toBe(1);
    expect(game.bulletRows(4)).toEqual([19]);
    expect(at(game.cells(), 4, 0)).toBe(2);
    idle(game);
    expect(game.bulletCount()).toBe(0);

    const empty = bare(0);
    tap(empty, 'fire', 17);
    expect(empty.bulletRows(4)).toEqual([19]);
    idle(empty);
    expect(empty.bulletCount()).toBe(0);
    expect(empty.field().total()).toBe(0);
    expect(empty.score).toBe(0);
  });
});

describe('shapes: достройка до прямоугольников', () => {
  /** Фигура 3 × 3 без трёх клеток: столбики высотой 2, 1 и 3 в колонках 3..5, верх на ряду 15; пушка в колонке 4. */
  function hangingGame(): TestShapes {
    const game = bare(2);
    game.figure(['###', '#.#', '..#'], 3, 15);
    return game;
  }
  const shootAt = (game: TestShapes, column: number, wait = 14): void => {
    while (game.gunX() < column) tap(game, 'right');
    while (game.gunX() > column) tap(game, 'left');
    tap(game, 'fire', wait);
  };

  it('пуля останавливается под первой клеткой колонки и добавляет клетку (+1 очко, событие `lock`)', () => {
    const game = hangingGame();
    const events = [...tap(game, ['left', 'fire']), ...idle(game, 14)];
    expect(types(events)).toEqual(['move', 'shot', 'lock']);
    expect(game.field().get(3, 13)).toBe(1);
    expect(game.field().total()).toBe(7);
    expect(game.score).toBe(1);
    expect(groups(game.cells()).length).toBe(1);
  });

  it('последняя клетка превращает фигуру в прямоугольник: он мигает и исчезает, очки — по числу клеток (+2 за клетку)', () => {
    const game = hangingGame();
    shootAt(game, 3);
    shootAt(game, 4);
    expect(game.field().get(4, 14)).toBe(1);
    expect(game.field().total()).toBe(8);
    const events = [...tap(game, 'fire')];
    let landed = events;
    for (let i = 0; i < 20 && !types(landed).includes('lines'); i++) landed = idle(game);
    expect(types(landed)).toEqual(['lock', 'lines']);
    expect(game.score).toBe(3);
    const cells = game.cells();
    expect(cells.filter((value) => value === 2).length).toBe(9);
    expect(game.bulletCount()).toBe(0);
    idle(game, VANISH - 1);
    expect(game.cells().filter((value) => value === 2).length).toBe(9);
    expect(game.field().total()).toBe(9);
    idle(game);
    expect(game.field().total()).toBe(0);
    expect(game.score).toBe(3 + 9 * 2);
  });

  it('пока прямоугольник мигает, пушка не двигается и не стреляет', () => {
    const game = hangingGame();
    shootAt(game, 3);
    shootAt(game, 4);
    tap(game, 'fire');
    let events = [] as ReturnType<typeof tap>;
    for (let i = 0; i < 20 && !types(events).includes('lines'); i++) events = idle(game);
    const x = game.gunX();
    run(game, 10, () => makeBrickInput(['left', 'fire']));
    expect(game.gunX()).toBe(x);
    expect(game.bulletCount()).toBe(0);
  });

  it('чем больше прямоугольник, тем больше очков: площадь 6 и площадь 12', () => {
    const small = bare(2);
    small.figure(['##', '#.'], 4, 15); // нужна одна клетка, прямоугольник 2 × 2 = 4
    shootAt(small, 5);
    expect(small.score).toBe(1);
    idle(small, VANISH);
    expect(small.score).toBe(1 + 4 * 2);

    const large = bare(2);
    large.figure(['####', '#..#', '#..#'], 3, 16); // не связанные внутри колонки 4 и 5 пока пусты
    expect(findRectangle(large.field(), 3, 16)).toBeNull();
    shootAt(large, 4);
    shootAt(large, 4);
    shootAt(large, 5);
    shootAt(large, 5);
    expect(large.score).toBe(4);
    idle(large, VANISH);
    expect(large.score).toBe(4 + 12 * 2);
  });

  it('объединение разрешено: клетка между двумя соприкасающимися фигурами собирает общий прямоугольник', () => {
    const game = bare(2);
    game.figure(['##', '#.'], 2, 15); // фигура A: (2,15), (3,15), (2,14)
    game.figure(['#', '#'], 4, 15); // фигура B рядом: (4,15), (4,14)
    expect(groups(game.cells()).length).toBe(1);
    shootAt(game, 3);
    expect(game.field().get(3, 14)).toBe(1);
    idle(game, VANISH);
    expect(game.field().total()).toBe(0);
    expect(game.score).toBe(1 + 6 * 2);
  });

  it('лишняя клетка прямоугольник не ломает: он просто получается больше (и очков за него больше)', () => {
    const game = bare(2);
    game.figure(['##', '#.'], 4, 15); // колонка 4 высотой 2, колонка 5 высотой 1: не хватает одной клетки до квадрата 2 × 2
    shootAt(game, 4); // клетка ушла в колонку 4: группа выше, прямоугольником по-прежнему не является
    expect(game.field().total()).toBe(4);
    expect(game.cells().filter((value) => value === 2).length).toBe(0);
    shootAt(game, 5);
    expect(game.field().total()).toBe(5);
    expect(game.cells().filter((value) => value === 2).length).toBe(0);
    shootAt(game, 5); // колонки сравнялись: 2 × 3
    expect(game.score).toBe(3);
    expect(game.cells().filter((value) => value === 2).length).toBe(6);
    idle(game, VANISH);
    expect(game.field().total()).toBe(0);
    expect(game.score).toBe(3 + 6 * 2);
  });

  it('фигура, не ставшая прямоугольником, остаётся и падает дальше вместе с полем', () => {
    const game = started(2, { speed: 10 });
    game.field().clear();
    game.figure(['###', '.#.'], 3, 15); // T: сверху три клетки, снизу одна
    tap(game, ['left', 'fire'], 14); // одна клетка в колонке 3 прямоугольника не даёт: 5 клеток в рамке 3 × 2
    expect(game.field().total()).toBe(5);
    expect(game.bulletCount()).toBe(0);
    expect(game.cells().filter((value) => value === 2).length).toBe(0);
    idle(game, STEP_10 - ((game.tick - INTRO) % STEP_10));
    expect([...cellSet(game.field())].sort()).toEqual(['3,13', '3,14', '4,13', '4,14', '5,14']);
  });

  it('пуля, не встретившая фигур, улетает и клетку не создаёт; дуло не даёт поставить клетку', () => {
    const game = bare(2);
    tap(game, 'fire', 20);
    expect(game.bulletCount()).toBe(0);
    expect(game.field().total()).toBe(0);
    expect(game.score).toBe(0);
    game.put(4, 2);
    tap(game, 'fire', 3);
    expect(game.field().total()).toBe(1);
    expect(game.score).toBe(0);
  });
});

describe('shapes: движение в бок', () => {
  /** Спуск ровно на одном шаге: поле очищено, внутри уложена фигура, ждём шаг. */
  function afterStep(mode: number, seed: number, place: (game: TestShapes) => void): TestShapes {
    const game = started(mode, { seed, speed: 10 });
    game.field().clear();
    place(game);
    idle(game, STEP_10);
    return game;
  }

  it('в вариантах «в бок» после шага спуска поле сдвигается на клетку влево или вправо; без оборачивания', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 16; seed++) {
      const game = afterStep(1, seed, (g) => g.figure(['##', '##'], 4, 14));
      const cells = [...cellSet(game.field())].sort();
      const left = ['3,12', '3,13', '4,12', '4,13'];
      const right = ['5,12', '5,13', '6,12', '6,13'];
      const direction = JSON.stringify(cells) === JSON.stringify(left) ? -1 : JSON.stringify(cells) === JSON.stringify(right) ? 1 : 0;
      // квадрат занимает колонки 4 и 5: после спуска и сдвига он в колонках 3-4 или 5-6
      expect(direction, `зерно ${seed}: ${cells.join(' ')}`).not.toBe(0);
      seen.add(direction);
    }
    expect([...seen].sort()).toEqual([-1, 1]);
  });

  it('у левого края фигура сдвигается только вправо, у правого только влево, во всю ширину — стоит', () => {
    for (const mode of [1, 3]) {
      for (let seed = 1; seed <= 6; seed++) {
        const leftEdge = afterStep(mode, seed, (g) => g.figure(['#', '#'], 0, 14));
        expect([...cellSet(leftEdge.field())].sort()).toEqual(['1,12', '1,13']);
        const rightEdge = afterStep(mode, seed, (g) => g.figure(['#', '#'], 9, 14));
        expect([...cellSet(rightEdge.field())].sort()).toEqual(['8,12', '8,13']);
        const wide = afterStep(mode, seed, (g) => g.figure(['##########'], 0, 14));
        expect(wide.field().rowCount(13)).toBe(10);
      }
    }
  });

  it('сдвиг не зависит от исчезновения прямоугольника: после него поле продолжает сдвигаться на каждом шаге', () => {
    const game = started(3, { seed: 3, speed: 10 });
    game.field().clear();
    game.figure(['##', '#.'], 4, 15);
    game.freezeDescent();
    tap(game, 'right');
    tap(game, 'fire', 14);
    idle(game, VANISH);
    expect(game.field().total()).toBe(0);
    game.figure(['#', '#'], 2, 14);
    game.descentClock.reset(1);
    idle(game, 1);
    const cells = [...cellSet(game.field())].sort();
    expect(cells.length).toBe(2);
    expect(cells.every((cell) => /^[13],1[23]$/.test(cell))).toBe(true);
  });

  it('в вариантах без сдвига колонки фигур не меняются никогда', () => {
    for (const mode of [0, 2]) {
      const game = started(mode, { speed: 10, level: 5 });
      const columns = (): string => {
        const cells = game.cells();
        const set: number[] = [];
        for (let x = 0; x < BRICK_COLS; x++) if (litRows(cells.slice(0, 0)).length === 0 && rowsIn(cells, x) > 0) set.push(x);
        return set.join(',');
      };
      const rowsIn = (cells: Uint8Array, x: number): number => {
        let count = 0;
        for (let y = 0; y < BRICK_ROWS - 2; y++) count += at(cells, x, y);
        return count;
      };
      const first = columns();
      idle(game, STEP_10 * 3);
      expect(columns()).toBe(first);
    }
  });
});

describe('shapes: потеря жизни и конец игры', () => {
  it('клетка дошла до ряда ствола (в любой колонке) — потеря жизни: взрыв, очистка, тот же уровень сначала', () => {
    const game = started(0, { speed: 10, level: 5 });
    game.give(3);
    game.field().clear();
    game.put(8, 2);
    const events = idle(game, STEP_10);
    expect(types(events)).toEqual(['crash']);
    expect(game.lives).toBe(4);
    const frozen = run(game, KABOOM - 2, () => makeBrickInput(['left', 'fire']));
    expect(types(frozen)).toEqual([]);
    expect(game.gunX()).toBe(4);
    expect(types(idle(game, 2))).toEqual(['lifeLost']);
    expect(game.lives).toBe(3);
    idle(game, CLEAR_LOSE + INTRO + 1);
    expect(groups(game.cells()).length).toBe(2);
    expect(game.score).toBe(3);
    expect([game.speed, game.level]).toEqual([10, 5]);
    expect(game.phase).toBe('playing');
  });

  coveredScenario('shooting-figures', 'неудача', 'если не стрелять, фигуры доходят до пушки; четыре жизни кончаются, игра заканчивается, новая партия чистая', () => {
    for (const mode of [0, 3]) {
      const game = started(mode, { speed: 10 });
      const events = [] as ReturnType<typeof idle>;
      for (let t = 0; t < 6000 && game.phase !== 'over'; t++) events.push(...idle(game));
      expect(game.phase, `вариант ${mode + 1}`).toBe('over');
      const names = types(events);
      expect(names.filter((name) => name === 'crash').length).toBe(4);
      expect(names.filter((name) => name === 'lifeLost').length).toBe(4);
      expect(names.filter((name) => name === 'gameOver').length).toBe(1);
      expect(game.lives).toBe(0);
      expect(game.overFill).toBe(BRICK_ROWS);
      game.start();
      expect([game.score, game.lives]).toEqual([0, 4]);
    }
  });

  it('последняя жизнь: после взрыва сразу заливка поля и конец игры, рекорд сохраняется', () => {
    const game = started(0, { speed: 10 });
    game.give(30);
    game.setLivesTo(1);
    game.field().clear();
    game.put(2, 2);
    idle(game, STEP_10);
    const events = idle(game, KABOOM);
    expect(types(events)).toEqual(['lifeLost', 'gameOver']);
    for (let i = 0; i < 80 && game.phase !== 'over'; i++) idle(game);
    expect(game.phase).toBe('over');
    expect(game.hiScore).toBe(30);
  });
});

describe('shapes: уровни и жизни', () => {
  it('после десятой скорости — скорость 1, уровень +1 и победа: очистка поля, затем новый уровень с большим числом фигур', () => {
    const game = started(0, { speed: 10, level: 4 });
    game.give(100);
    expect([game.speed, game.level]).toEqual([1, 5]);
    expect(types(idle(game))).toEqual(['levelUp', 'win']);
    game.put(3, 3);
    idle(game, CLEAR_WIN + INTRO + 2);
    expect(groups(game.cells()).length).toBe(2);
    expect(game.field().get(3, 3)).toBe(0);
  });

  it('после десятого уровня — первый, скорость остаётся первой', () => {
    const game = started(0, { speed: 10, level: 10 });
    game.give(100);
    expect([game.speed, game.level]).toEqual([1, 1]);
  });

  it('добавочная жизнь за каждые 2000 очков', () => {
    const game = started();
    game.setLivesTo(2);
    game.give(1999);
    expect(game.lives).toBe(2);
    game.give(1);
    expect(game.lives).toBe(3);
    expect(types(idle(game))).toContain('bonus');
  });
});

/** Бот отстрела: идёт к колонке с самой нижней клеткой и держит огонь. */
function destroyBot(game: TestShapes): BrickInput {
  const space = game.field();
  let lowest = BRICK_ROWS;
  let column = game.gunX();
  for (let x = 0; x < BRICK_COLS; x++) {
    for (let y = 2; y < BRICK_ROWS; y++) {
      if (space.get(x, y) === 0) continue;
      if (y < lowest || (y === lowest && Math.abs(x - game.gunX()) < Math.abs(column - game.gunX()))) {
        lowest = y;
        column = x;
      }
      break;
    }
  }
  if (column < game.gunX()) return makeBrickInput([], ['left', 'fire']);
  if (column > game.gunX()) return makeBrickInput([], ['right', 'fire']);
  return makeBrickInput([], ['fire']);
}

/** Бот достройки: берёт самую низкую группу клеток, достраивает самый короткий её столбец и ждёт, пока пуля ляжет. */
function buildBot(game: TestShapes): BrickInput {
  if (game.bulletCount() > 0) return NEUTRAL_BRICK_INPUT;
  const space = game.field();
  let start: [number, number] | null = null;
  for (let y = 2; y < BRICK_ROWS && !start; y++) {
    for (let x = 0; x < BRICK_COLS; x++) {
      if (space.get(x, y)) {
        start = [x, y];
        break;
      }
    }
  }
  if (!start) return NEUTRAL_BRICK_INPUT;
  const group = new Set<string>([`${start[0]},${start[1]}`]);
  const stack: [number, number][] = [start];
  while (stack.length) {
    const [x, y] = stack.pop() ?? start;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const key = `${x + dx},${y + dy}`;
      if (space.get(x + dx, y + dy) && !group.has(key)) {
        group.add(key);
        stack.push([x + dx, y + dy]);
      }
    }
  }
  const bottoms = new Map<number, number>();
  for (const key of group) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    bottoms.set(x, Math.min(bottoms.get(x) ?? BRICK_ROWS, y));
  }
  const targetBottom = Math.min(...bottoms.values());
  let column = -1;
  let deficit = 0;
  for (const [x, bottom] of bottoms) {
    if (bottom - targetBottom > deficit || (bottom - targetBottom === deficit && deficit > 0 && Math.abs(x - game.gunX()) < Math.abs(column - game.gunX()))) {
      deficit = bottom - targetBottom;
      column = x;
    }
  }
  if (column < 0) return NEUTRAL_BRICK_INPUT;
  if (column < game.gunX()) return makeBrickInput(['left']);
  if (column > game.gunX()) return makeBrickInput(['right']);
  return makeBrickInput(['fire']);
}

describe('shapes: бот', () => {
  coveredScenario('shooting-figures', 'прогресс', 'бот отстрела уничтожает фигуры: очки растут, скорость повышается, жизни целы', () => {
    for (const mode of DESTROY) {
      const game = started(mode, { seed: 3, speed: 2 });
      const names = types(run(game, 3500, () => destroyBot(game)));
      expect(game.score, `вариант ${mode + 1}`).toBeGreaterThan(100);
      expect(names.filter((name) => name === 'hit').length).toBe(game.score);
      expect(game.speed).toBeGreaterThan(2);
      expect(game.lives).toBe(4);
    }
  });

  it('бот достройки собирает прямоугольники: они исчезают, очки растут, жизни целы', () => {
    for (const mode of BUILD) {
      const game = started(mode, { seed: 3, speed: 2 });
      const names = types(run(game, 5000, () => buildBot(game)));
      expect(names.filter((name) => name === 'lines').length, `вариант ${mode + 1}`).toBeGreaterThanOrEqual(8);
      expect(game.score).toBeGreaterThan(100);
      expect(game.lives).toBe(4);
    }
  });
});
