import { scenarioSuite } from '../scenarioCoverage';
import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  CLEAR_LOSE_TICKS,
  CLEAR_WIN_TICKS,
  KABOOM_WAVE_TICKS,
  NEUTRAL_BRICK_INPUT,
  genuineTicks,
  livesPreview,
  makeBrickInput,
  msToTicks,
  type BrickAction,
  type BrickEvent,
  type BrickGame,
  type BrickInput,
} from '../../../src/brick';
import {
  FROG_SCORES_TO_EXTRA_LIFE,
  FROG_START_X,
  FROGGER_MODES,
  FroggerGame,
  START_WAIT_TICKS,
  froggerDef,
  rulesOfDonorType,
  type FrogPosition,
} from '../../../src/brick/games/frogger';
import { conformance } from '../conformance';

const coveredScenario = scenarioSuite('frogger');

// ---------------------------------------------------------------- помощники

/** Независимая копия готовых полос донора (`tracts`), `#` — машина: сверка данных и сдвигов. */
const DONOR_LANES: readonly string[] = [
  '..##.....####...',
  '...##.....####..',
  '#....##.....####',
  '...#....##....##',
  '#....####....###',
  '###....####....#',
  '#....####....###',
  '##.....###.....#',
];
const EMPTY_LANE = '.'.repeat(16);
const EMPTY_ROAD: readonly string[] = Array.from({ length: 8 }, () => EMPTY_LANE);
/** Ряды матрицы (0 — верх) для полос 0..7 обычного поля: полоса i лежит на ряду донора 2 + 2i, то есть на строке 17 − 2i. */
const laneRow = (lane: number): number => 17 - 2 * lane;

/** Окно из десяти клеток узора по кругу, начиная с `offset`. */
const windowOf = (pattern: string, offset: number): string =>
  Array.from({ length: BRICK_COLS }, (_, x) => pattern[(offset + x) % 16]).join('');

/** Поле построчно: `.` пусто, `#` горит, `*` мигает. */
function screen(game: BrickGame): string[] {
  const cells = game.cells();
  const rows: string[] = [];
  for (let y = 0; y < BRICK_ROWS; y++) {
    let line = '';
    for (let x = 0; x < BRICK_COLS; x++) line += ['.', '#', '*'][cells[y * BRICK_COLS + x] ?? 0];
    rows.push(line);
  }
  return rows;
}

/** Мигающая клетка — лягушка. */
function frogAt(game: BrickGame): { x: number; row: number } | null {
  const index = game.cells().indexOf(2);
  return index < 0 ? null : { x: index % BRICK_COLS, row: Math.floor(index / BRICK_COLS) };
}

const idle = (game: BrickGame, ticks: number): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
  return events;
};
const tap = (game: BrickGame, ...actions: BrickAction[]): BrickEvent[] => game.step(makeBrickInput(actions));
const kinds = (events: readonly BrickEvent[]): string[] => events.map((event) => event.type);

/** Ряды матрицы с полосами (все восемь), без разделителей. */
const lanesOnScreen = (game: BrickGame): string[] => {
  const rows = screen(game);
  return Array.from({ length: 8 }, (_, lane) => rows[laneRow(lane)] ?? '');
};

/**
 * Лаборатория: игра с доступом к внутреннему состоянию, чтобы расставлять сцены для проверки правил.
 * Состояние меняется только здесь, в тестах; сама игра о нём не знает.
 */
class FrogLab extends FroggerGame {
  /** Мелодия старта кончилась, первый сдвиг дороги — через полный период. */
  quiet(): this {
    this.startWait = 0;
    this.roadClock = 0;
    return this;
  }
  roadOf(patterns: readonly string[], offsets?: readonly number[]): this {
    this.lanes = patterns.map((pattern) => Array.from(pattern, (ch) => ch === '#'));
    if (offsets) this.offsets = [...offsets];
    return this;
  }
  put(x: number, y: number): this {
    this.frog = { x, y };
    return this;
  }
  fillHome(columns: readonly number[]): this {
    for (const x of columns) this.home[x] = true;
    return this;
  }
  setOncoming(lanes: readonly number[]): this {
    this.oncoming = new Set(lanes);
    return this;
  }
  award(points: number): void {
    this.addScore(points);
  }
  giveLives(count: number): void {
    this.setLives(count);
  }
  get frogCell(): FrogPosition | null {
    return this.frog ? { ...this.frog } : null;
  }
  get homeColumns(): number[] {
    return this.home.flatMap((full, x) => (full ? [x] : []));
  }
  get laneOffsets(): number[] {
    return [...this.offsets];
  }
  get oncomingSet(): number[] {
    return [...this.oncoming].sort((a, b) => a - b);
  }
  get lanePatterns(): string[] {
    return this.lanes.map((lane) => lane.map((car) => (car ? '#' : '.')).join(''));
  }
  get roadPeriod(): number {
    return this.shiftPeriod();
  }
}

/** Игра по типу донора (как в консоли: типы 1–16; больше — только для проверки перевёрнутого поля). */
function lab(type: number, options: { seed?: number; speed?: number; level?: number } = {}): FrogLab {
  const game = new FrogLab({ seed: 1, ...options }, rulesOfDonorType(type));
  game.start();
  return game;
}

/** Тихая сцена на пустой дороге: лягушка в (x, y) донора, машин нет. */
function emptyScene(type: number, x = FROG_START_X, y = 0, options: { level?: number; speed?: number } = {}): FrogLab {
  return lab(type, options).quiet().roadOf(EMPTY_ROAD).put(x, y);
}

/** Дождаться сдвига дороги. */
const shiftOnce = (game: FrogLab): BrickEvent[] => idle(game, game.roadPeriod);

const KABOOM_TICKS = 4 * 7 * KABOOM_WAVE_TICKS;

// ---------------------------------------------------------------- общие проверки

conformance(froggerDef, { fuzzTicks: 1500 });

// ---------------------------------------------------------------- варианты

describe('лягушка: варианты', () => {
  it('шестнадцать вариантов консоли, число на устройстве не установлено', () => {
    expect(froggerDef.id).toBe('frog');
    expect(froggerDef.declaredModes).toBeNull();
    expect(froggerDef.modes).toBe(FROGGER_MODES);
    expect(froggerDef.modes).toHaveLength(16);
    expect(new Set(froggerDef.modes.map((mode) => mode.name.ru)).size).toBe(16);
    expect(new Set(froggerDef.modes.map((mode) => mode.name.en)).size).toBe(16);
    for (const mode of froggerDef.modes) expect(mode.note).toContain('допущение');
  });

  it('правила типа донора: направление, перенос, встречное движение, готовые полосы, переворот', () => {
    const rules = (type: number): string => {
      const r = rulesOfDonorType(type);
      return [
        r.leftToRight ? 'LR' : 'RL',
        r.carry ? 'carry' : 'stay',
        r.oncoming ? 'onc' : 'one',
        r.preloaded ? 'fixed' : 'rand',
        r.flip ? 'flip' : 'flat',
      ].join(' ');
    };
    expect(rules(1)).toBe('LR carry one fixed flat');
    expect(rules(2)).toBe('RL carry one fixed flat');
    expect(rules(3)).toBe('LR stay one fixed flat');
    expect(rules(4)).toBe('RL stay one fixed flat');
    expect(rules(5)).toBe('LR carry onc fixed flat');
    expect(rules(6)).toBe('RL carry onc fixed flat');
    expect(rules(7)).toBe('LR stay onc fixed flat');
    expect(rules(8)).toBe('RL stay onc fixed flat');
    expect(rules(9)).toBe('LR carry one rand flat');
    expect(rules(13)).toBe('LR carry onc rand flat');
    // тип 16 — случайная дорога по javadoc донора (в его коде по ошибке `>= 16` дало бы готовую, как у типа 8)
    expect(rules(16)).toBe('RL stay onc rand flat');
    expect(rules(17)).toBe('LR carry one fixed flip');
    expect(rules(24)).toBe('RL stay onc fixed flip');
    expect(rules(25)).toBe('LR carry one rand flip');
    expect(rules(32)).toBe('RL stay onc rand flip');
  });

  it('все 32 типа донора различаются правилами; в консоли — первые 16, без переворота', () => {
    const all = new Set(Array.from({ length: 32 }, (_, i) => JSON.stringify(rulesOfDonorType(i + 1))));
    expect(all.size).toBe(32);
    const shown = new Set(Array.from({ length: 16 }, (_, i) => JSON.stringify(rulesOfDonorType(i + 1))));
    expect(shown.size).toBe(16);
    for (let mode = 0; mode < 16; mode++) {
      const game = froggerDef.create({ seed: 1, mode });
      const ref = new FroggerGame({ seed: 1 }, rulesOfDonorType(mode + 1));
      expect(screen(game)).toEqual(screen(ref));
      expect(frogAt(game)).toEqual({ x: FROG_START_X, row: 19 });
    }
  });

  it('варианты ведут себя по-разному: направление, перенос, встречные полосы, готовая или случайная дорога', () => {
    // направление: после первого сдвига окна полос уходят в разные стороны
    const after = (type: number): string[] => {
      const game = lab(type);
      idle(game, START_WAIT_TICKS + 1);
      return lanesOnScreen(game);
    };
    expect(after(1)).not.toEqual(after(2));
    expect(after(1)).not.toEqual(after(5)); // встречные полосы
    expect(after(5)).not.toEqual(after(6));
    // готовая дорога от зерна не зависит, случайная — зависит
    const start = (type: number, seed: number): string[] => lanesOnScreen(lab(type, { seed }));
    expect(start(1, 1)).toEqual(start(1, 2));
    expect(start(9, 1)).not.toEqual(start(9, 2));
    expect(start(9, 1)).toEqual(start(9, 1));
    // перенос: лягушка в полосе сдвигается с ней или стоит
    const carried = (type: number): number => {
      const game = emptyScene(type, 4, 2);
      shiftOnce(game);
      return game.frogCell?.x ?? -99;
    };
    expect([carried(1), carried(2), carried(3), carried(4)]).toEqual([5, 3, 4, 4]);
  });
});

// ---------------------------------------------------------------- поле

describe('лягушка: поле и жизни', () => {
  it('до старта поле построено: восемь полос, разделители, обочина и дом пусты, лягушка внизу в центре', () => {
    const game = froggerDef.create({ seed: 1, mode: 0 });
    expect(screen(game)).toEqual([
      '..........', // 0: дом (ряд 19 донора)
      '..........', // 1: обочина
      '##########', // 2: разделитель
      '##.....###', // 3: полоса 7
      '##########',
      '#....####.', // 5: полоса 6
      '##########',
      '###....###', // 7: полоса 5
      '##########',
      '#....####.', // 9: полоса 4
      '##########',
      '...#....##', // 11: полоса 3
      '##########',
      '#....##...', // 13: полоса 2
      '##########',
      '...##.....', // 15: полоса 1
      '##########',
      '..##.....#', // 17: полоса 0
      '##########', // 18: разделитель
      '....*.....', // 19: старт, лягушка мигает
    ]);
    expect(game.phase).toBe('ready');
  });

  it('данные полос совпадают с донорскими на каждом уровне: окно начинается с клетки уровень − 1', () => {
    for (const level of [1, 2, 5, 10]) {
      const game = new FroggerGame({ seed: 1, level }, rulesOfDonorType(1));
      expect(lanesOnScreen(game)).toEqual(DONOR_LANES.map((pattern) => windowOf(pattern, level - 1)));
    }
  });

  it('жизней четыре, добавочная — каждые 500 очков; индикатор жизней в превью', () => {
    const game = froggerDef.create({ seed: 1 });
    expect(game.lives).toBe(4);
    expect(FROG_SCORES_TO_EXTRA_LIFE).toBe(500);
    expect([...(game.preview() ?? [])]).toEqual([...livesPreview(4)]);
    expect(game.speed).toBe(1);
    expect(game.level).toBe(1);
  });

  it('перевёрнутое поле — то же поле вверх ногами: старт сверху, дом снизу', () => {
    const normal = new FroggerGame({ seed: 1 }, rulesOfDonorType(1));
    const flipped = new FroggerGame({ seed: 1 }, rulesOfDonorType(17));
    expect(screen(flipped)).toEqual([...screen(normal)].reverse());
    expect(frogAt(flipped)).toEqual({ x: FROG_START_X, row: 0 });
  });
});

// ---------------------------------------------------------------- прыжки

describe('лягушка: прыжки', () => {
  it('мелодия старта: 90 тактов дорога стоит, «вверх» не работает, «влево» работает; на 91-м такте дорога сразу идёт', () => {
    expect(START_WAIT_TICKS).toBe(90);
    const game = lab(1);
    const start = lanesOnScreen(game);
    expect(kinds(tap(game, 'left'))).toEqual(['move']);
    expect(frogAt(game)).toEqual({ x: 3, row: 19 });
    tap(game, 'up');
    tap(game, 'rotate');
    expect(frogAt(game)).toEqual({ x: 3, row: 19 });
    idle(game, 87); // тактов прошло 90
    expect(game.tick).toBe(90);
    expect(lanesOnScreen(game)).toEqual(start);
    game.step(NEUTRAL_BRICK_INPUT); // 91-й
    expect(lanesOnScreen(game)).not.toEqual(start);
  });

  it('«вверх» прыгает на два ряда через разделитель, «вниз» — назад; со старта вниз — ничего, даже вместе с «влево»', () => {
    const game = emptyScene(1);
    expect(kinds(tap(game, 'up'))).toEqual(['move']);
    expect(frogAt(game)).toEqual({ x: 4, row: 17 });
    tap(game, 'up');
    expect(frogAt(game)).toEqual({ x: 4, row: 15 });
    tap(game, 'down');
    expect(frogAt(game)).toEqual({ x: 4, row: 17 });
    tap(game, 'down');
    expect(frogAt(game)).toEqual({ x: 4, row: 19 });
    expect(kinds(tap(game, 'down'))).toEqual(['move']); // у донора шаг засчитан, лягушка стоит
    expect(frogAt(game)).toEqual({ x: 4, row: 19 });
    tap(game, 'left', 'down');
    expect(frogAt(game)).toEqual({ x: 4, row: 19 });
    expect(game.lives).toBe(4);
  });

  it('«влево» и «вправо» сдвигают на клетку, вместе с «вверх» — по диагонали', () => {
    const game = emptyScene(1);
    tap(game, 'left');
    tap(game, 'left');
    tap(game, 'right');
    expect(frogAt(game)?.x).toBe(3);
    tap(game, 'right', 'up');
    expect(frogAt(game)).toEqual({ x: 4, row: 17 });
    tap(game, 'left', 'up');
    expect(frogAt(game)).toEqual({ x: 3, row: 15 });
  });

  it('большая кнопка и «огонь» — тот же прыжок вперёд; вместе с «вверх» — один прыжок', () => {
    for (const action of ['up', 'rotate', 'fire'] as const) {
      const game = emptyScene(1);
      tap(game, action);
      expect(frogAt(game)).toEqual({ x: 4, row: 17 });
    }
    const both = emptyScene(1);
    tap(both, 'up', 'rotate', 'fire');
    expect(frogAt(both)).toEqual({ x: 4, row: 17 });
  });

  it('с ряда 16 прыжок вперёд — на обочину (ряд 18), оттуда вперёд — в дом на один ряд', () => {
    const game = emptyScene(1, 4, 16);
    tap(game, 'up');
    expect(frogAt(game)).toEqual({ x: 4, row: 1 });
    expect(kinds(tap(game, 'up'))).toEqual(['lock', 'move']);
    expect(game.score).toBe(1);
    expect(screen(game)[0]).toBe('....#.....');
  });

  it('зажатая кнопка повторяется как у донора: сразу, через 500 мс, затем раз в 50 мс', () => {
    const game = emptyScene(1);
    const heights: number[] = [];
    game.step(makeBrickInput(['up']));
    heights.push(game.frogCell?.y ?? -1);
    for (let t = 1; t <= 36; t++) {
      game.step(makeBrickInput([], ['up']));
      if (t === 29 || t === 30 || t === 33 || t === 36) heights.push(game.frogCell?.y ?? -1);
    }
    // t=0: 2; до 30-го такта стоит; на 30-м +2; затем каждые три такта
    expect(heights).toEqual([2, 2, 4, 6, 8]);
  });

  it('стена убивает: шаг влево из первой колонки и вправо из последней — потеря жизни', () => {
    for (const [x, action] of [
      [0, 'left'],
      [9, 'right'],
    ] as const) {
      const game = emptyScene(1, x, 0);
      expect(kinds(tap(game, action))).toEqual(['explode']);
      const events = idle(game, KABOOM_TICKS);
      expect(kinds(events)).toEqual(['lifeLost']);
      expect(game.lives).toBe(3);
    }
  });

  it('прыжок в машину убивает, на пустую клетку полосы — нет', () => {
    const game = emptyScene(1);
    game.roadOf(['....#...........', ...EMPTY_ROAD.slice(1)]);
    expect(kinds(tap(game, 'up'))).toEqual(['explode']);
    const safe = emptyScene(1);
    safe.roadOf(['...#............', ...EMPTY_ROAD.slice(1)]);
    expect(kinds(tap(safe, 'up'))).toEqual(['move']);
    expect(frogAt(safe)).toEqual({ x: 4, row: 17 });
  });
});

// ---------------------------------------------------------------- полосы

/** Самая длинная серия символа в круговом узоре. */
function longestRun(pattern: string, ch: string): number {
  let best = 0;
  let run = 0;
  for (const c of pattern + pattern) {
    run = c === ch ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return Math.min(best, pattern.length);
}

describe('лягушка: полосы, их направление и скорость', () => {
  const roadChanges = (speed: number, ticks: number): number[] => {
    const game = froggerDef.create({ seed: 1, mode: 0, speed });
    game.start();
    const changes: number[] = [];
    let last = lanesOnScreen(game).join();
    for (let t = 1; t <= ticks; t++) {
      game.step(NEUTRAL_BRICK_INPUT);
      const now = lanesOnScreen(game).join();
      if (now !== last) changes.push(t);
      last = now;
    }
    return changes;
  };

  it('сдвиг раз в 3 × «настоящую» скорость донора (450 → 120 мс): скорость 1 — 81 такт, скорость 10 — 21', () => {
    const period = (speed: number): number => genuineTicks(speed, 450, 120) * 3;
    expect(period(1)).toBe(81);
    expect(period(10)).toBe(21);
    expect(period(1)).toBeGreaterThan(period(5));
    expect(period(5)).toBeGreaterThan(period(10));
    // первый сдвиг сразу после мелодии, дальше — через период
    expect(roadChanges(1, 91 + 81 * 2)).toEqual([91, 172, 253]);
    expect(roadChanges(10, 91 + 21 * 3)).toEqual([91, 112, 133, 154]);
    expect(lab(1, { speed: 5 }).roadPeriod).toBe(period(5));
  });

  it('тип 1: все полосы едут слева направо — окно уходит влево по узору', () => {
    const game = lab(1);
    idle(game, START_WAIT_TICKS + 1);
    expect(lanesOnScreen(game)).toEqual(DONOR_LANES.map((pattern) => windowOf(pattern, 15)));
    idle(game, game.roadPeriod);
    expect(lanesOnScreen(game)).toEqual(DONOR_LANES.map((pattern) => windowOf(pattern, 14)));
  });

  it('тип 2: все полосы едут справа налево', () => {
    const game = lab(2);
    idle(game, START_WAIT_TICKS + 1);
    expect(lanesOnScreen(game)).toEqual(DONOR_LANES.map((pattern) => windowOf(pattern, 1)));
  });

  it('встречное движение: полосы 3 и 7 едут против остальных (типы 5 и 6), без него — нет (тип 1)', () => {
    for (const [type, direct, against] of [
      [5, 15, 1],
      [6, 1, 15],
    ] as const) {
      const game = lab(type);
      expect(game.oncomingSet).toEqual([3, 7]);
      idle(game, START_WAIT_TICKS + 1);
      const expected = DONOR_LANES.map((pattern, lane) => windowOf(pattern, lane === 3 || lane === 7 ? against : direct));
      expect(lanesOnScreen(game)).toEqual(expected);
    }
    const plain = lab(1);
    idle(plain, START_WAIT_TICKS + 1);
    expect(lanesOnScreen(plain)).toEqual(DONOR_LANES.map((pattern) => windowOf(pattern, 15)));
  });

  it('уровень задаёт начальное смещение полос: уровень 4 — окно с клетки 3', () => {
    const game = lab(1, { level: 4 });
    expect(game.laneOffsets).toEqual(new Array<number>(8).fill(3));
  });

  it('случайные полосы: одно зерно — одна дорога; в каждой полосе есть машины, пустой участок не короче 3, машина не длиннее 4', () => {
    const a = lab(9, { seed: 5 });
    const b = lab(9, { seed: 5 });
    expect(a.lanePatterns).toEqual(b.lanePatterns);
    for (let seed = 1; seed <= 150; seed++) {
      for (const pattern of lab(9, { seed }).lanePatterns) {
        expect(pattern).toHaveLength(16);
        expect(pattern).toContain('#');
        expect(pattern).toContain('.');
        expect(longestRun(pattern, '#')).toBeLessThanOrEqual(4);
        expect(longestRun(pattern, '.')).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('встречных полос у случайной дороги от одной (уровень 1) до четырёх (уровень 10), у готовой — две', () => {
    const count = (level: number): number => lab(13, { seed: 3, level }).oncomingSet.length;
    expect([1, 2, 3, 6, 9, 10].map(count)).toEqual([1, 1, 2, 3, 4, 4]);
    for (let seed = 1; seed <= 20; seed++) {
      for (const lane of lab(13, { seed, level: 10 }).oncomingSet) expect(lane >= 0 && lane < 8).toBe(true);
    }
    expect(lab(5).oncomingSet).toEqual([3, 7]);
  });

  it('новая случайная дорога на каждую жизнь и каждый уровень, готовая — всегда та же', () => {
    const random = lab(9).quiet().put(0, 0);
    const before = random.lanePatterns;
    tap(random, 'left');
    idle(random, KABOOM_TICKS + CLEAR_LOSE_TICKS);
    expect(random.lanePatterns).not.toEqual(before);
    const fixed = lab(1).quiet().put(0, 0);
    tap(fixed, 'left');
    idle(fixed, KABOOM_TICKS + CLEAR_LOSE_TICKS);
    expect(fixed.lanePatterns).toEqual([...DONOR_LANES]);
  });
});

// ---------------------------------------------------------------- перенос и наезд

describe('лягушка: перенос лягушки дорогой и наезд машин', () => {
  it('с переносом лягушка едет со своей полосой; встречная полоса везёт в другую сторону', () => {
    // тип 5: слева направо с переносом, полосы 3 и 7 встречные
    const direct = emptyScene(5, 4, 2); // полоса 0
    shiftOnce(direct);
    expect(direct.frogCell).toEqual({ x: 5, y: 2 });
    const against = emptyScene(5, 4, 8); // полоса 3 (ряд 8 = 2 + 2 × 3)
    shiftOnce(against);
    expect(against.frogCell).toEqual({ x: 3, y: 8 });
    // тип 6: справа налево — наоборот
    const back = emptyScene(6, 4, 8);
    shiftOnce(back);
    expect(back.frogCell).toEqual({ x: 5, y: 8 });
    // без переноса лягушка стоит
    const still = emptyScene(7, 4, 2);
    shiftOnce(still);
    expect(still.frogCell).toEqual({ x: 4, y: 2 });
  });

  it('на старте лягушку дорога не несёт; на обочине (ряд 18) у донора несёт, как прямую полосу', () => {
    const start = emptyScene(1, 4, 0);
    shiftOnce(start);
    expect(start.frogCell).toEqual({ x: 4, y: 0 });
    const verge = emptyScene(1, 4, 18);
    shiftOnce(verge);
    expect(verge.frogCell).toEqual({ x: 5, y: 18 });
    const reverse = emptyScene(2, 4, 18);
    shiftOnce(reverse);
    expect(reverse.frogCell).toEqual({ x: 3, y: 18 });
  });

  it('унесённая за край поля лягушка погибает', () => {
    const game = emptyScene(1, 9, 2);
    expect(kinds(shiftOnce(game))).toEqual(['explode']);
    expect(frogAt(game)).toBeNull(); // за краем её не видно
    expect(kinds(idle(game, KABOOM_TICKS))).toEqual(['lifeLost']);
    expect(game.lives).toBe(3);
    const left = emptyScene(2, 0, 4);
    expect(kinds(shiftOnce(left))).toEqual(['explode']);
  });

  it('без переноса машина, наехавшая на лягушку, убивает её; в обратную сторону не наезжает', () => {
    // тип 3: слева направо; машина слева от лягушки приезжает на её клетку
    const hit = emptyScene(3, 4, 2).roadOf(['...#............', ...EMPTY_ROAD.slice(1)], [0, 0, 0, 0, 0, 0, 0, 0]);
    expect(kinds(shiftOnce(hit))).toEqual(['explode']);
    const miss = emptyScene(4, 4, 2).roadOf(['...#............', ...EMPTY_ROAD.slice(1)], [0, 0, 0, 0, 0, 0, 0, 0]);
    expect(shiftOnce(miss)).toEqual([]);
    expect(miss.frogCell).toEqual({ x: 4, y: 2 });
    expect(lanesOnScreen(miss)[0]).toBe('..#.*.....');
  });

  it('с переносом машины, идущие сзади, лягушку не задевают: она гибнет только у края поля', () => {
    const game = emptyScene(1, 4, 2).roadOf(['...#............', ...EMPTY_ROAD.slice(1)], new Array<number>(8).fill(0));
    for (let i = 0; i < 5; i++) expect(shiftOnce(game)).toEqual([]);
    expect(game.lives).toBe(4);
    expect(game.frogCell).toEqual({ x: 9, y: 2 });
    expect(kinds(shiftOnce(game))).toEqual(['explode']);
  });
});

// ---------------------------------------------------------------- жизни

describe('лягушка: потеря жизни', () => {
  it('гибель: взрыв, жизнь пропадает, очистка поля, тот же уровень заново с мелодией старта; дома и очки сохраняются', () => {
    const game = emptyScene(1, 4, 0).fillHome([0, 5]);
    game.award(7);
    game.roadOf(['....#...........', ...EMPTY_ROAD.slice(1)]);
    expect(kinds(tap(game, 'up'))).toEqual(['explode']);
    expect(game.lives).toBe(4); // жизнь снимается после взрыва, как у донора
    // пока идёт сценка, кнопки не работают
    for (let i = 0; i < KABOOM_TICKS - 1; i++) expect(kinds(game.step(makeBrickInput(['left'])))).toEqual([]);
    expect(kinds(game.step(NEUTRAL_BRICK_INPUT))).toEqual(['lifeLost']);
    expect(game.lives).toBe(3);
    expect([...(game.preview() ?? [])]).toEqual([...livesPreview(3)]);
    expect(kinds(idle(game, CLEAR_LOSE_TICKS - 1))).toEqual([]);
    expect(kinds(game.step(NEUTRAL_BRICK_INPUT))).toEqual(['started']);
    expect(game.level).toBe(1);
    expect(game.score).toBe(7);
    expect(game.homeColumns).toEqual([0, 5]);
    expect(game.frogCell).toEqual({ x: 4, y: 0 });
    expect(game.lanePatterns).toEqual([...DONOR_LANES]);
    expect(game.laneOffsets).toEqual(new Array<number>(8).fill(0));
    expect(screen(game)[0]).toBe('#....#....');
    // снова мелодия: «вверх» не работает 90 тактов
    tap(game, 'up');
    expect(frogAt(game)).toEqual({ x: 4, row: 19 });
  });

  coveredScenario('frog', 'неудача', 'четыре жизни — четыре гибели, затем конец игры: взрыв, снятие жизни, заливка поля, фаза `over`', () => {
    const game = froggerDef.create({ seed: 1, mode: 0 });
    game.start();
    const log: string[] = [];
    const lives: (number | null)[] = [];
    // шаг влево каждые 4 такта: шести нажатий (из колонки 4 влево) хватает на гибель о стену, сценки нажатия не замечают
    for (let t = 0; t < 6000 && game.phase !== 'over'; t++) {
      const events = t % 4 === 0 ? tap(game, 'left') : idle(game, 1);
      for (const event of events) {
        log.push(event.type);
        if (event.type === 'lifeLost' || event.type === 'gameOver') lives.push(game.lives);
      }
    }
    expect(game.phase).toBe('over');
    expect(log.filter((type) => type === 'explode')).toHaveLength(4);
    expect(log.filter((type) => type === 'lifeLost')).toHaveLength(4);
    expect(log.filter((type) => type === 'started')).toHaveLength(3); // мелодия перед каждой новой попыткой
    expect(log.at(-1)).toBe('gameOver');
    expect(lives).toEqual([3, 2, 1, 0, 0]);
    expect(game.lives).toBe(0);
    expect(game.overFill).toBe(BRICK_ROWS);
    expect(frogAt(game)).toBeNull();
    // повторный старт — новая партия
    game.start();
    expect(game.phase).toBe('playing');
    expect(game.lives).toBe(4);
    expect(frogAt(game)).toEqual({ x: FROG_START_X, row: 19 });
  });
});

// ---------------------------------------------------------------- очки, дом, уровни

describe('лягушка: очки за переход, дома, уровни', () => {
  it('лягушка дошла до дома: +1 очко, колонка дома горит, новая лягушка на старте', () => {
    const game = emptyScene(1, 6, 18);
    const events = tap(game, 'up');
    expect(kinds(events)).toEqual(['lock', 'move']);
    expect(game.score).toBe(1);
    expect(game.homeColumns).toEqual([6]);
    expect(screen(game)[0]).toBe('......#...');
    expect(frogAt(game)).toEqual({ x: FROG_START_X, row: 19 });
    expect(game.lives).toBe(4);
  });

  it('прыжок в уже занятый дом убивает', () => {
    const game = emptyScene(1, 6, 18).fillHome([6]);
    expect(kinds(tap(game, 'up'))).toEqual(['explode']);
    expect(game.score).toBe(0);
  });

  it('все десять домов: ряд стирается от колонки прыжка в обе стороны, +10, очистка, следующий уровень, мелодия старта', () => {
    const game = emptyScene(1, 4, 18).fillHome([0, 1, 2, 3, 5, 6, 7, 8, 9]);
    const step = msToTicks(60);
    const hold = msToTicks(210);
    const events = tap(game, 'up');
    expect(kinds(events)).toEqual(['lock', 'lines', 'move']);
    expect(game.score).toBe(1);
    const home = (): string => screen(game)[0] ?? '';
    // колонка 4: шесть шагов до дальнего края; первый шаг — сразу, затем каждые 60 мс, по клетке в обе стороны
    const frames = ['###..#####', '##....####', '#......###', '........##', '.........#', '..........'];
    frames.forEach((expected, index) => {
      expect(home()).toBe(expected);
      if (index < frames.length - 1) idle(game, step);
    });
    expect(game.score).toBe(1);
    idle(game, step - 1);
    expect(game.score).toBe(1);
    idle(game, 1); // 24-й такт после прыжка: ряд стёрт, бонус
    expect(game.score).toBe(11);
    expect(kinds(idle(game, hold - 1))).toEqual([]);
    expect(kinds(game.step(NEUTRAL_BRICK_INPUT))).toEqual(['win']);
    expect(kinds(idle(game, CLEAR_WIN_TICKS - 1))).toEqual([]);
    expect(kinds(game.step(NEUTRAL_BRICK_INPUT))).toEqual(['levelUp', 'started']);
    expect(game.level).toBe(2);
    expect(game.speed).toBe(1);
    expect(game.homeColumns).toEqual([]);
    expect(game.frogCell).toEqual({ x: 4, y: 0 });
    expect(game.laneOffsets).toEqual(new Array<number>(8).fill(1));
    expect(game.lives).toBe(4);
  });

  it('после десятого уровня — снова первый, скорость выше на единицу', () => {
    const game = emptyScene(1, 4, 18, { level: 10, speed: 3 }).fillHome([0, 1, 2, 3, 5, 6, 7, 8, 9]);
    tap(game, 'up');
    idle(game, 6 * msToTicks(60) + msToTicks(210) + CLEAR_WIN_TICKS);
    expect(game.level).toBe(1);
    expect(game.speed).toBe(4);
    expect(game.score).toBe(11);
  });

  it('ряд стирается от колонки, из которой прыгнула лягушка, а не куда она попала (диагональный прыжок)', () => {
    const game = emptyScene(1, 2, 18).fillHome([0, 1, 2, 4, 5, 6, 7, 8, 9]);
    tap(game, 'right', 'up'); // из колонки 2 в свободную колонку 3
    expect(game.homeColumns).toHaveLength(10);
    // центр — колонка 2: первым шагом гаснут колонки 1 и 2
    expect(screen(game)[0]).toBe('#..#######');
  });

  it('добавочная жизнь за каждые 500 очков; при полных жизнях — бонус к счёту (500 / 10)', () => {
    const game = emptyScene(1, 4, 18);
    game.giveLives(3);
    game.award(FROG_SCORES_TO_EXTRA_LIFE - 1);
    const events = tap(game, 'up'); // 499 -> 500 очков
    expect(game.score).toBe(500);
    expect(kinds(events)).toContain('bonus');
    expect(game.lives).toBe(4);
    const full = emptyScene(1, 4, 18);
    full.award(FROG_SCORES_TO_EXTRA_LIFE - 1);
    expect(kinds(tap(full, 'up'))).toContain('bonus');
    expect(full.lives).toBe(4);
    expect(full.score).toBe(FROG_SCORES_TO_EXTRA_LIFE + FROG_SCORES_TO_EXTRA_LIFE / 10);
  });
});

// ---------------------------------------------------------------- перевёрнутое поле

describe('лягушка: перевёрнутое поле', () => {
  it('старт сверху, дом снизу; «вниз» ведёт к дому, «вверх» — назад; большая кнопка тоже вперёд', () => {
    const game = emptyScene(17);
    expect(frogAt(game)).toEqual({ x: 4, row: 0 });
    tap(game, 'down');
    expect(frogAt(game)).toEqual({ x: 4, row: 2 });
    tap(game, 'rotate');
    expect(frogAt(game)).toEqual({ x: 4, row: 4 });
    tap(game, 'up');
    expect(frogAt(game)).toEqual({ x: 4, row: 2 });
    tap(game, 'left', 'down');
    expect(frogAt(game)).toEqual({ x: 3, row: 4 });
  });

  it('дом внизу: лягушка с обочины (строка 1 с конца) прыгает в нижнюю строку; взрыв считается от нижнего края', () => {
    const game = emptyScene(17, 4, 18);
    expect(frogAt(game)).toEqual({ x: 4, row: 18 });
    tap(game, 'down');
    expect(screen(game)[19]).toBe('....#.....');
    expect(game.score).toBe(1);
    expect(frogAt(game)).toEqual({ x: 4, row: 0 });
  });

  it('перевёрнутая дорога — та же дорога вверх ногами и после сдвигов', () => {
    const normal = lab(1);
    const flipped = lab(17);
    idle(normal, START_WAIT_TICKS + 1);
    idle(flipped, START_WAIT_TICKS + 1);
    expect(screen(flipped)).toEqual([...screen(normal)].reverse());
  });
});

// ---------------------------------------------------------------- бот

const FIELD_ROWS = [19, 17, 15, 13, 11, 9, 7, 5, 3, 1];

/** Строка дороги (ряды с полосами) — для обнаружения сдвига. */
function roadKey(cells: Uint8Array): string {
  let key = '';
  for (let row = 3; row <= 17; row += 2) for (let x = 0; x < BRICK_COLS; x++) key += cells[row * BRICK_COLS + x] === 1 ? '#' : '.';
  return key;
}

/** Кратчайший путь по замороженной дороге до свободного дома (поиск в ширину): первое действие и число прыжков. */
function pathHome(cells: Uint8Array, from: { x: number; row: number }): { action: BrickAction; hops: number } | null {
  const free = (x: number, row: number): boolean => cells[row * BRICK_COLS + x] !== 1;
  const key = (x: number, row: number): number => row * BRICK_COLS + x;
  interface Node {
    x: number;
    row: number;
    first: BrickAction | null;
    hops: number;
  }
  const seen = new Set<number>([key(from.x, from.row)]);
  const queue: Node[] = [{ ...from, first: null, hops: 0 }];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    if (!node) break;
    const index = FIELD_ROWS.indexOf(node.row);
    const moves: [BrickAction, number, number][] = [];
    if (node.row === 1) moves.push(['up', node.x, 0]);
    else if (index >= 0 && index + 1 < FIELD_ROWS.length) moves.push(['up', node.x, FIELD_ROWS[index + 1] ?? 0]);
    if (index > 0) moves.push(['down', node.x, FIELD_ROWS[index - 1] ?? 0]);
    if (node.x > 0) moves.push(['left', node.x - 1, node.row]);
    if (node.x < BRICK_COLS - 1) moves.push(['right', node.x + 1, node.row]);
    for (const [action, x, row] of moves) {
      if (!free(x, row) || seen.has(key(x, row))) continue;
      seen.add(key(x, row));
      const first = node.first ?? action;
      if (row === 0) return { action: first, hops: node.hops + 1 };
      queue.push({ x, row, first, hops: node.hops + 1 });
    }
  }
  return null;
}

/**
 * Бот видит только экран. Дорога стоит между сдвигами, поэтому после каждого сдвига он ищет путь до свободного дома
 * по замороженной дороге и идёт, пока хватает времени до следующего сдвига (два такта на прыжок). Для перевёрнутого поля
 * экран и кнопки «вверх/вниз» переворачиваются.
 */
function botFor(period: number, flipped = false): (game: BrickGame) => BrickInput {
  let rest = false;
  let lastRoad = '';
  let sinceShift = -1;
  const upright = (cells: Uint8Array): Uint8Array => {
    if (!flipped) return cells;
    const out = new Uint8Array(cells.length);
    for (let row = 0; row < BRICK_ROWS; row++) out.set(cells.subarray(row * BRICK_COLS, (row + 1) * BRICK_COLS), (BRICK_ROWS - 1 - row) * BRICK_COLS);
    return out;
  };
  const mirror = (action: BrickAction): BrickAction => (!flipped ? action : action === 'up' ? 'down' : action === 'down' ? 'up' : action);
  return (game) => {
    const cells = upright(game.cells());
    const index = cells.indexOf(2);
    const frog = index < 0 ? null : { x: index % BRICK_COLS, row: Math.floor(index / BRICK_COLS) };
    const road = roadKey(cells);
    if (lastRoad && road !== lastRoad && frog) sinceShift = 0;
    else if (sinceShift >= 0) sinceShift++;
    lastRoad = road;
    if (rest) {
      rest = false;
      return NEUTRAL_BRICK_INPUT;
    }
    if (!frog || sinceShift < 0) return NEUTRAL_BRICK_INPUT;
    const path = pathHome(cells, frog);
    if (!path || path.hops * 2 + 4 > period - sinceShift) return NEUTRAL_BRICK_INPUT;
    rest = true;
    return makeBrickInput([mirror(path.action)]);
  };
}

function play(game: BrickGame, ticks: number, bot: (game: BrickGame) => BrickInput): BrickEvent[] {
  const events: BrickEvent[] = [];
  game.start();
  for (let t = 0; t < ticks && game.phase === 'playing'; t++) events.push(...game.step(bot(game)));
  return events;
}

describe('лягушка: бот переходит дорогу', () => {
  const period = genuineTicks(1, 450, 120) * 3;

  coveredScenario('frog', 'прогресс', 'на каждом из шестнадцати вариантов бот набирает очки, не теряя жизней, и проходит уровень', () => {
    for (let mode = 0; mode < 16; mode++) {
      const game = froggerDef.create({ seed: 2, mode, speed: 1 });
      const events = play(game, 3000, botFor(period));
      expect(game.score, `вариант ${mode + 1}`).toBeGreaterThanOrEqual(20);
      expect(game.lives, `вариант ${mode + 1}`).toBe(4);
      expect(game.level, `вариант ${mode + 1}`).toBeGreaterThanOrEqual(2);
      expect(kinds(events), `вариант ${mode + 1}`).toContain('win');
      expect(kinds(events).filter((type) => type === 'lock').length).toBeGreaterThanOrEqual(10);
    }
  });

  it('бот проходит и на средней скорости, и на перевёрнутом поле (типы 17 и 32)', () => {
    // скорость 5: дорога стоит 54 такта; на скорости 10 (21 такт) путь из десяти прыжков по два такта уже не успеть
    const fast = froggerDef.create({ seed: 4, mode: 8, speed: 5 });
    play(fast, 2500, botFor(genuineTicks(5, 450, 120) * 3));
    expect(fast.score).toBeGreaterThanOrEqual(10);
    for (const type of [17, 32]) {
      const game = new FroggerGame({ seed: 3, speed: 1 }, rulesOfDonorType(type));
      play(game, 3000, botFor(period, true));
      expect(game.score, `тип ${type}`).toBeGreaterThanOrEqual(20);
      expect(game.lives, `тип ${type}`).toBe(4);
    }
  });

  it('очки бота складываются по правилам донора: 1 за каждую лягушку и 10 за заполненный ряд домов', () => {
    const game = froggerDef.create({ seed: 1, mode: 0, speed: 1 });
    const events = play(game, 2200, botFor(period));
    const types = kinds(events);
    const locks = types.filter((type) => type === 'lock').length;
    const wins = types.filter((type) => type === 'win').length;
    expect(wins).toBeGreaterThanOrEqual(2);
    expect(game.score).toBeLessThan(FROG_SCORES_TO_EXTRA_LIFE); // добавочная жизнь не вмешивается в счёт
    expect(game.score).toBe(locks + 10 * wins);
    // каждый уровень — десять лягушек, затем следующий
    expect(types.filter((type) => type === 'levelUp')).toHaveLength(wins);
    expect(game.level).toBe(1 + wins);
  });
});

// ---------------------------------------------------------------- повторяемость

describe('лягушка: повторяемость', () => {
  it('то же зерно и те же кнопки дают те же кадры, даже на случайной дороге', () => {
    for (const mode of [0, 8, 12]) {
      const a = froggerDef.create({ seed: 11, mode });
      const b = froggerDef.create({ seed: 11, mode });
      a.start();
      b.start();
      const botA = botFor(81);
      const botB = botFor(81);
      for (let t = 0; t < 1200; t++) {
        expect(kinds(a.step(botA(a)))).toEqual(kinds(b.step(botB(b))));
        expect(a.cells()).toEqual(b.cells());
      }
      expect(a.score).toBe(b.score);
    }
  });

  it('разные зёрна меняют только случайные дороги', () => {
    const picture = (mode: number, seed: number): string => screen(froggerDef.create({ seed, mode })).join('|');
    expect(picture(0, 1)).toBe(picture(0, 99));
    expect(picture(8, 1)).not.toBe(picture(8, 99));
  });
});
