import { scenarioSuite } from '../scenarioCoverage';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/brick/rng';
import { genuineTicks, msToTicks } from '../../../src/brick/timing';
import {
  BRICK_COLS,
  BRICK_ROWS,
  NEUTRAL_BRICK_INPUT,
  makeBrickInput,
  type BrickAction,
  type BrickEvent,
  type BrickGame,
  type BrickInput,
} from '../../../src/brick/types';
import { RacingGame, RacingShootGame, racingDef, racingShootDef } from '../../../src/brick/games/racing';
import {
  ACCEL_REPEAT_TICKS,
  INTRO_TICKS,
  LANE_REPEAT_TICKS,
  LEVELUP_POINT,
  SCORES_TO_EXTRA_LIFE,
} from '../../../src/brick/games/racing/base';
import { RACING_ID, RACING_SHOOT_ID } from '../../../src/brick/games/racing/modes';
import {
  CAR_Y,
  Road,
  borderLit,
  carCovers,
  carsOverlap,
  halfStepTicks,
  roadLayout,
  type Opponent,
} from '../../../src/brick/games/racing/road';
import {
  AMMO_PER_PEDESTRIAN,
  BULLET_TICKS,
  FIRE_COOLDOWN_TICKS,
  MAX_AMMO,
  PEDESTRIAN_ONE_IN,
} from '../../../src/brick/games/racing/shoot';
import { conformance, frameHash } from '../conformance';

const coveredScenario = scenarioSuite('racing');

conformance(racingDef);
conformance(racingShootDef);

// ------------------------------------------------------------------ помощники

const IDLE = NEUTRAL_BRICK_INPUT;
const press = (...actions: BrickAction[]): BrickInput => makeBrickInput(actions);
const hold = (...actions: BrickAction[]): BrickInput => makeBrickInput([], actions);

function run(game: BrickGame, ticks: number, input: BrickInput = IDLE): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(input));
  return events;
}

const kinds = (events: readonly BrickEvent[]): string[] => events.map((event) => event.type);

/** Запустить игру и отсидеть «стартовую мелодию». */
function begin<T extends BrickGame>(game: T): T {
  game.start();
  run(game, INTRO_TICKS);
  return game;
}

const racing = (mode: number, extra: { seed?: number; speed?: number; level?: number } = {}): RacingGame =>
  new RacingGame({ seed: 7, mode, ...extra });
const shooter = (mode: number, extra: { seed?: number; speed?: number; level?: number } = {}): RacingShootGame =>
  new RacingShootGame({ seed: 7, mode, ...extra });

/** Строки рисунка матрицы, где `#` — горит, `*` — мигает. */
function picture(game: BrickGame, x0 = 0, row0 = 0, width = BRICK_COLS, height = BRICK_ROWS): string[] {
  const cells = game.cells();
  const rows: string[] = [];
  for (let row = row0; row < row0 + height; row++) {
    let line = '';
    for (let x = x0; x < x0 + width; x++) line += ['.', '#', '*'][cells[row * BRICK_COLS + x] ?? 0] ?? '?';
    rows.push(line);
  }
  return rows;
}

const cellAt = (game: BrickGame, x: number, row: number): number => game.cells()[row * BRICK_COLS + x] ?? 0;

/** Схемы вариантов: полосы, рамка, перевёрнутость. */
const SCHEMES = [
  { mode: 0, lanes: [3, 6], wide: false, inverted: false },
  { mode: 1, lanes: [1, 4, 7], wide: true, inverted: false },
  { mode: 2, lanes: [3, 6], wide: false, inverted: true },
  { mode: 3, lanes: [1, 4, 7], wide: true, inverted: true },
] as const;

/**
 * «Бот» по рисунку поля: смотрит на полосы впереди машины, при опасности уходит в соседнюю полосу, где дальше свободно,
 * ловит мигающих пешеходов и (если просят) стреляет по машинам впереди. Ничего не знает об устройстве игры, кроме схемы полос
 * варианта и того, что после потери жизни машина стоит на стартовой полосе. Возвращает функцию «ввод на следующий такт».
 */
function makeBot(game: BrickGame, mode: number, options: { walkers?: boolean; shoot?: boolean } = {}): () => BrickInput {
  const scheme = SCHEMES[mode % SCHEMES.length];
  if (!scheme) throw new Error('нет схемы');
  const lanes = scheme.lanes as readonly number[];
  const carRows = scheme.inverted ? [0, 1, 2, 3] : [16, 17, 18, 19];
  const ahead = (k: number): number => (scheme.inverted ? 4 + k : 15 - k);
  const look = 16;
  let lane = 1;
  let lives = game.lives;
  return () => {
    if (game.lives !== lives || game.phase !== 'playing') {
      lives = game.lives;
      lane = 1;
    }
    const cells = game.cells();
    const value = (row: number, x: number): number => cells[row * BRICK_COLS + x] ?? 0;
    // горит ли (ярко) что-нибудь в колонках полосы в этих рядах — мигающие клетки (пешеходы, пули) не мешают
    const solid = (rows: readonly number[], x: number): boolean =>
      rows.some((row) => [x - 1, x, x + 1].some((col) => value(row, col) === 1));
    const free = (x: number): number => {
      let k = 0;
      while (k < look && !solid([ahead(k)], x)) k++;
      return k;
    };
    const walkerAt = (x: number): number => {
      for (let k = 0; k < look; k++) if (value(ahead(k), x) === 2) return k;
      return Infinity;
    };
    const keys: BrickAction[] = [];
    const here = free(lanes[lane] ?? 0);
    let target = lane;
    if (options.walkers) {
      let nearest = Infinity;
      lanes.forEach((x, index) => {
        if (index === lane) return;
        const k = walkerAt(x);
        if (k < free(x) - 3 && k < nearest && here >= 6) {
          nearest = k;
          target = index;
        }
      });
    }
    if (target === lane && here < 10) {
      let bestDistance = here;
      lanes.forEach((x, index) => {
        if (index === lane) return;
        const d = free(x);
        if (d > bestDistance && !solid(carRows, x)) {
          bestDistance = d;
          target = index;
        }
      });
    }
    if (target !== lane) {
      const next = lane + Math.sign(target - lane);
      if (!solid(carRows, lanes[next] ?? 0)) {
        keys.push(next < lane ? 'left' : 'right');
        lane = next;
      }
    }
    if (options.shoot && here < 14 && here >= 3) return makeBrickInput(keys, ['rotate']);
    return makeBrickInput(keys);
  };
}

// ------------------------------------------------------------------ гонки: данные и поле

describe('гонки: варианты и общий вид', () => {
  it('четыре варианта донора, число вариантов на устройстве не установлено', () => {
    expect(racingDef.id).toBe(RACING_ID);
    expect(racingDef.declaredModes).toBeNull();
    expect(racingDef.modes.length).toBe(4);
    expect(racingShootDef.id).toBe(RACING_SHOOT_ID);
    expect(new Set([racingDef.id, racingShootDef.id]).size).toBe(2);
    expect(racingShootDef.declaredModes).toBeNull();
    expect(racingShootDef.modes.length).toBe(4);
    for (const mode of racingShootDef.modes) expect(mode.note).toContain('допущение');
    const names = new Set(racingDef.modes.map((mode) => mode.name.ru));
    expect(names.size).toBe(4);
  });

  it('схема дороги: две или три полосы по три клетки, перевёрнутые варианты 3 и 4', () => {
    for (const scheme of SCHEMES) {
      const layout = roadLayout(scheme.mode);
      expect(layout.lanes).toEqual(scheme.lanes);
      expect(layout.wide).toBe(scheme.wide);
      expect(layout.inverted).toBe(scheme.inverted);
    }
  });

  it('машина — семь клеток CarShape: нос, «руки», тело и колёса', () => {
    expect(carCovers(5, 1, 5, 3)).toBe(true); // нос
    expect(carCovers(5, 1, 4, 3)).toBe(false);
    expect(carCovers(5, 1, 4, 2) && carCovers(5, 1, 5, 2) && carCovers(5, 1, 6, 2)).toBe(true);
    expect(carCovers(5, 1, 5, 1)).toBe(true);
    expect(carCovers(5, 1, 4, 1)).toBe(false);
    expect(carCovers(5, 1, 4, 0) && carCovers(5, 1, 6, 0)).toBe(true);
    expect(carCovers(5, 1, 5, 0)).toBe(false);
    let count = 0;
    for (let y = -2; y < 6; y++) for (let x = 3; x < 8; x++) if (carCovers(5, 1, x, y)) count++;
    expect(count).toBe(7);
    // соседние полосы не пересекаются, сдвиг на клетку — пересекается
    expect(carsOverlap(1, 1, 4, 1)).toBe(false);
    expect(carsOverlap(1, 1, 3, 1)).toBe(true);
    expect(carsOverlap(4, 1, 4, 5)).toBe(false); // впритык по вертикали
    expect(carsOverlap(4, 1, 4, 4)).toBe(false); // колёса чужой машины стоят по бокам носа, не задевая его
    expect(carsOverlap(4, 1, 4, 3)).toBe(true); // а «руки» уже задевают
  });

  it('до старта на поле машина на стартовой полосе, рамка дороги и первая встречная машина над полем', () => {
    for (const scheme of SCHEMES) {
      const game = racing(scheme.mode);
      expect(game.phase).toBe('ready');
      const x = scheme.lanes[1] ?? 0;
      const car = scheme.inverted ? picture(game, x - 1, 0, 3, 4) : picture(game, x - 1, 16, 3, 4);
      expect(car).toEqual(scheme.inverted ? ['#.#', '.#.', '###', '.#.'] : ['.#.', '###', '.#.', '#.#']);
      // рамка: справа всегда, слева только на двух полосах; три клетки горят, две нет
      for (let row = 4; row < 16; row++) {
        const y = scheme.inverted ? row : BRICK_ROWS - 1 - row;
        const expected = borderLit(y, 0) ? 1 : 0;
        expect(cellAt(game, 9, row)).toBe(expected);
        expect(cellAt(game, 0, row)).toBe(scheme.wide ? 0 : expected);
      }
      expect(game['road'].opponents.length).toBe(1);
      expect(game['road'].opponents[0]?.y).toBe(20);
      expect(game['lives']).toBe(4);
      expect(game.preview()?.filter((value) => value > 0).length).toBe(8);
    }
  });

  it('рамка едет к машине игрока: в обычных вариантах вниз по экрану, в перевёрнутых — вверх', () => {
    for (const scheme of SCHEMES) {
      const game = begin(racing(scheme.mode));
      const column = (): number[] => Array.from({ length: BRICK_ROWS }, (_, row) => cellAt(game, 9, row));
      const before = column();
      const step = halfStepTicks(game.speed, game.level, scheme.wide);
      run(game, step);
      const after = column();
      for (let row = 6; row < 14; row++) {
        if (scheme.inverted) expect(after[row]).toBe(before[row + 1]);
        else expect(after[row]).toBe(before[row - 1]);
      }
    }
  });

  it('стартовая сценка: 1500 мс (90 тактов) дорога стоит, потом едет', () => {
    expect(INTRO_TICKS).toBe(90);
    const game = racing(0);
    const initial = picture(game).join('/');
    game.start();
    for (let i = 0; i < INTRO_TICKS; i++) {
      game.step(press('left', 'rotate'));
      expect(picture(game).join('/')).toBe(initial);
    }
    expect(game['lane']).toBe(1);
    run(game, halfStepTicks(1, 1, false));
    expect(picture(game).join('/')).not.toBe(initial);
  });
});

// ------------------------------------------------------------------ гонки: скорость и ускорение

describe('гонки: скорость, ускорение, перестроение', () => {
  it('шаг дороги по формуле донора: от 195 мс (скорость 1, уровень 1) до 50 мс, на трёх полосах медленнее в 1,5 раза', () => {
    expect(halfStepTicks(1, 1, false)).toBe(msToTicks(98));
    expect(halfStepTicks(10, 1, false)).toBe(msToTicks(25));
    expect(halfStepTicks(1, 10, false)).toBe(msToTicks(75));
    expect(halfStepTicks(10, 10, false)).toBe(msToTicks(Math.round(41 / 2)));
    expect(halfStepTicks(1, 1, true)).toBe(msToTicks(Math.round(Math.round(195 * 1.5) / 2)));
    expect(halfStepTicks(1, 1, true)).toBeGreaterThan(halfStepTicks(1, 1, false));
    expect(halfStepTicks(5, 1, false)).toBe(genuineTicks(5, 97.5, 25));
    let previous = Infinity;
    for (let speed = 1; speed <= 10; speed++) {
      const ticks = halfStepTicks(speed, 4, false);
      expect(ticks).toBeLessThanOrEqual(previous);
      previous = ticks;
    }
  });

  it('встречные машины едут вниз на клетку за два шага дороги, рамка — за один', () => {
    for (const scheme of SCHEMES) {
      const game = begin(racing(scheme.mode));
      const half = halfStepTicks(1, 1, scheme.wide);
      const car = game['road'].opponents[0];
      expect(car).toBeDefined();
      const start = car?.y ?? 0;
      const changes: number[] = [];
      let last = start;
      for (let t = 1; t <= half * 8; t++) {
        game.step(IDLE);
        const y = game['road'].opponents[0]?.y ?? last;
        if (y !== last) {
          changes.push(t);
          last = y;
        }
      }
      expect(changes).toEqual([half, half * 3, half * 5, half * 7]);
      expect(last).toBe(start - 4);
    }
  });

  it('ускорение: «вверх», ROTATE и «огонь» подгоняют дорогу; в перевёрнутых вариантах ускоряет «вниз», «вверх» не делает ничего', () => {
    const progress = (mode: number, input: BrickInput): number => {
      const game = begin(racing(mode));
      run(game, 60, input);
      return game['road'].opponents[0]?.y ?? -99;
    };
    for (const mode of [0, 1]) {
      const slow = progress(mode, IDLE);
      for (const key of ['up', 'rotate', 'fire'] as const) expect(progress(mode, hold(key))).toBeLessThan(slow);
      expect(progress(mode, hold('down'))).toBe(slow);
    }
    for (const mode of [2, 3]) {
      const slow = progress(mode, IDLE);
      expect(progress(mode, hold('down'))).toBeLessThan(slow);
      expect(progress(mode, hold('rotate'))).toBeLessThan(slow);
      expect(progress(mode, hold('up'))).toBe(slow);
    }
    expect(ACCEL_REPEAT_TICKS).toBe(2);
  });

  it('перестроение: влево и вправо по полосам, у края — ничего, звук `move` только при настоящем движении', () => {
    const three = begin(racing(1));
    const carNose = (game: BrickGame, row: number): number => [1, 4, 7].find((x) => cellAt(game, x, row) > 0) ?? -1;
    expect(carNose(three, 16)).toBe(4);
    expect(kinds(three.step(press('left')))).toEqual(['move']);
    expect(carNose(three, 16)).toBe(1);
    expect(three.step(press('left'))).toEqual([]);
    expect(carNose(three, 16)).toBe(1);
    run(three, LANE_REPEAT_TICKS);
    three.step(press('right'));
    expect(carNose(three, 16)).toBe(4);
    three.step(press('right'));
    expect(carNose(three, 16)).toBe(7);
    expect(three.step(press('right'))).toEqual([]);
    expect(three.lives).toBe(4);

    const two = begin(racing(0));
    expect(two['carX']).toBe(6);
    expect(kinds(two.step(press('right')))).toEqual([]);
    expect(kinds(two.step(press('left')))).toEqual(['move']);
    expect(two['carX']).toBe(3);
  });

  it('зажатая кнопка перестраивает снова через 90 мс (5 тактов), как setKeyDelay донора', () => {
    expect(LANE_REPEAT_TICKS).toBe(5);
    const game = begin(racing(1));
    game.step(press('left'));
    expect(game['carX']).toBe(1);
    // держим вправо: сразу полоса 1, через 5 тактов — полоса 2
    game.step(press('right'));
    expect(game['carX']).toBe(4);
    for (let i = 0; i < LANE_REPEAT_TICKS - 1; i++) game.step(hold('right'));
    expect(game['carX']).toBe(4);
    game.step(hold('right'));
    expect(game['carX']).toBe(7);
  });

  it('в перевёрнутом варианте влево и вправо те же, что на экране', () => {
    const game = begin(racing(2));
    expect(game['carX']).toBe(6);
    game.step(press('left'));
    expect(game['carX']).toBe(3);
    expect(cellAt(game, 3, 3)).toBe(1); // нос машины смотрит вниз экрана
  });
});

// ------------------------------------------------------------------ гонки: поток машин

describe('гонки: поток встречных машин', () => {
  /** Прогнать дорогу без игрока (машина далеко за полем) и собрать появления групп: [y новой группы, y прежней, машины]. */
  function simulateSpawns(wide: boolean, level: number, steps: number, seed = 3) {
    const road = new Road(roadLayout(wide ? 1 : 0));
    const rng = new Rng(seed);
    road.reset();
    const spawns: { y: number; before: number | null; cars: Opponent[] }[] = [];
    let tail: number | null = null;
    for (let i = 0; i < steps; i++) {
      road.scroll(100, CAR_Y);
      if (tail !== null) tail--;
      const added = road.spawn(level, rng);
      if (added.length > 0) {
        spawns.push({ y: added[0]?.y ?? 0, before: tail, cars: added.map((car) => ({ ...car })) });
        tail = added[0]?.y ?? null;
      }
    }
    return spawns;
  }

  it('расстояние между группами: 10..12 клеток на уровне 1 и 5..7 на уровне 10 плюс размер машины', () => {
    for (const level of [1, 2, 5, 10]) {
      const spawns = simulateSpawns(false, level, 6000);
      const min = 10 - Math.floor(level / 2);
      expect(spawns.length).toBeGreaterThan(100);
      for (const spawn of spawns) {
        if (spawn.before === null) {
          expect(spawn.y).toBe(21);
          continue;
        }
        const gap = spawn.y - spawn.before;
        expect(gap).toBeGreaterThanOrEqual(min + 3);
        expect(gap).toBeLessThanOrEqual(min + 2 + 3);
        expect(spawn.y).toBeLessThanOrEqual(21);
        expect(spawn.y).toBeGreaterThanOrEqual(21 - 4); // не «вспыхивает» глубоко внутри поля
      }
    }
  });

  it('на двух полосах — по одной машине строго в полосах; на трёх с шансом 10 + уровень % двойные и сдвинутые', () => {
    const two = simulateSpawns(false, 10, 4000);
    for (const spawn of two) {
      expect(spawn.cars.length).toBe(1);
      expect([3, 6]).toContain(spawn.cars[0]?.x);
    }
    const share = (level: number): number => {
      const spawns = simulateSpawns(true, level, 12000, 11);
      let odd = 0;
      for (const spawn of spawns) {
        const [first, second] = spawn.cars;
        if (spawn.cars.length === 2) {
          odd++;
          expect(second?.y).toBe(first?.y);
          expect(second?.x).not.toBe(first?.x);
          expect([1, 4, 7]).toContain(first?.x);
          expect([1, 4, 7]).toContain(second?.x);
        } else if (![1, 4, 7].includes(first?.x ?? -1)) {
          odd++;
          expect([2, 3, 5, 6]).toContain(first?.x);
        }
      }
      return odd / spawns.length;
    };
    const low = share(1);
    const high = share(10);
    expect(low).toBeGreaterThan(0.06);
    expect(low).toBeLessThan(0.17);
    expect(high).toBeGreaterThan(0.14);
    expect(high).toBeLessThan(0.28);
  });

  it('обгон: машина, ушедшая за нижний край, даёт очко', () => {
    const game = begin(racing(0));
    game['road'].opponents = [{ x: 3, y: -1 }]; // соседняя полоса, машина игрока на x = 6
    const events = run(game, 60);
    expect(game.score).toBe(1);
    expect(kinds(events)).not.toContain('crash');
    expect(game.lives).toBe(4);
    expect(game['road'].opponents.some((car) => car.y < -1)).toBe(false);
  });

  it('проезд рядом с машиной в соседней полосе — не авария', () => {
    for (const mode of [0, 1]) {
      const game = begin(racing(mode));
      const other = mode === 0 ? 3 : 1;
      game['road'].opponents = [{ x: other, y: 8 }];
      const events = run(game, 400);
      expect(kinds(events)).not.toContain('crash');
      expect(game.score).toBeGreaterThanOrEqual(1);
    }
  });

  it('одинаковое зерно — одинаковый поток, разные зёрна — разный', () => {
    const traffic = (seed: number): string => {
      const game = begin(racing(1, { seed }));
      const frames: string[] = [];
      for (let i = 0; i < 12; i++) {
        run(game, 50);
        frames.push(String(frameHash(game)));
      }
      return frames.join('|');
    };
    expect(traffic(4)).toBe(traffic(4));
    const variety = new Set([1, 2, 3, 4, 5, 6].map(traffic));
    expect(variety.size).toBeGreaterThan(3);
  });
});

// ------------------------------------------------------------------ гонки: аварии, жизни, очки, уровни

describe('гонки: аварии, жизни, очки, уровни', () => {
  it('врезалась встречная машина: авария, взрыв без ввода, потом минус жизнь, очистка поля и новая попытка', () => {
    const game = begin(racing(0));
    game.step(press('left'));
    const carX = game['carX'];
    game['road'].opponents = [{ x: carX, y: 7 }];
    let crashTick = -1;
    for (let t = 0; t < 400 && crashTick < 0; t++) {
      if (kinds(game.step(IDLE)).includes('crash')) crashTick = t;
    }
    expect(crashTick).toBeGreaterThanOrEqual(0);
    expect(game.lives).toBe(4); // жизнь снимается после взрыва, как у донора
    // взрыв: 4 прохода по 7 волн по 4 такта; ввод игнорируется
    const frozen = game['carX'];
    const boom = run(game, 4 * 7 * 4 - 1, press('right'));
    expect(game['carX']).toBe(frozen);
    expect(boom.length).toBe(0);
    const lost = game.step(IDLE);
    expect(kinds(lost)).toEqual(['lifeLost']);
    expect(game.lives).toBe(3);
    expect(game.preview()?.filter((value) => value > 0).length).toBe(6);
    // очистка поля, потом перезагрузка уровня: машина на старте, дорога новая, снова сценка 90 тактов
    run(game, 72);
    expect(game['carX']).toBe(6);
    expect(game['road'].opponents.length).toBe(1);
    const reloaded = frameHash(game);
    run(game, INTRO_TICKS - 1);
    expect(frameHash(game)).toBe(reloaded);
    expect(game.phase).toBe('playing');
  });

  it('перестроение в занятую полосу — авария сразу, без звука перестроения', () => {
    for (const mode of [0, 1, 2, 3]) {
      const game = begin(racing(mode));
      const lanes = SCHEMES[mode]?.lanes ?? [];
      const target = lanes[0] ?? 0;
      game['road'].opponents = [{ x: target, y: 2 }]; // стоит рядом с машиной игрока
      const events = game.step(press('left'));
      expect(kinds(events)).toEqual(['crash']);
      expect(game['carX']).toBe(target); // машина успела перестроиться и врезалась
    }
  });

  it('пересечение с рамкой и краями невозможно: у крайних полос перестроение просто не срабатывает', () => {
    const game = begin(racing(0));
    game['road'].opponents = [];
    expect(game.step(press('right'))).toEqual([]);
    expect(game['carX']).toBe(6);
  });

  coveredScenario('racing', 'неудача', 'четыре аварии подряд — конец игры: жизни по одной, затем заливка поля и фаза `over`', () => {
    for (const scheme of SCHEMES) {
      const game = racing(scheme.mode, { speed: 10 });
      game.start();
      const all: BrickEvent[] = [];
      for (let t = 0; t < 60000 && game.phase !== 'over'; t++) all.push(...game.step(hold('up')));
      expect(game.phase).toBe('over');
      const names = kinds(all);
      expect(names.filter((name) => name === 'crash').length).toBe(4);
      expect(names.filter((name) => name === 'lifeLost').length).toBe(4);
      expect(names.filter((name) => name === 'gameOver').length).toBe(1);
      expect(game.lives).toBe(0);
      expect(game.overFill).toBe(BRICK_ROWS);
      // новая партия — снова четыре жизни, рекорд остаётся
      const hi = game.hiScore;
      game.start();
      expect(game.lives).toBe(4);
      expect(game.hiScore).toBe(hi);
    }
  });

  it('очки: по единице за обгон; каждые 50 очков скорость +1, после десятой — следующий уровень', () => {
    expect(LEVELUP_POINT).toBe(50);
    const game = begin(racing(0, { speed: 3, level: 2 }));
    game['addScore'](49);
    expect(game.speed).toBe(3);
    expect(kinds(game.step(IDLE))).not.toContain('levelUp');
    game['addScore'](1);
    expect(game.speed).toBe(4);
    expect(game.level).toBe(2);
    expect(game.score).toBe(50);
    // событие уровня ушло в очередь в момент добавления очков
    const queued = begin(racing(0, { speed: 3 }));
    queued['addScore'](50);
    expect(kinds(queued.step(IDLE))).toContain('levelUp');
    // скорость 10 -> 1, уровень растёт; после десятого уровня — снова первый
    const wrap = begin(racing(0, { speed: 10, level: 4 }));
    wrap['addScore'](50);
    expect(wrap.speed).toBe(1);
    expect(wrap.level).toBe(5);
    const top = begin(racing(0, { speed: 10, level: 10 }));
    top['addScore'](50);
    expect(top.speed).toBe(1);
    expect(top.level).toBe(1);
    // скачок на несколько порогов за раз даёт один шаг скорости (как у донора)
    const jump = begin(racing(0, { speed: 2 }));
    jump['addScore'](160);
    expect(jump.speed).toBe(3);
  });

  it('новый уровень делает машины чаще и дорогу быстрее', () => {
    const slow = halfStepTicks(1, 1, false);
    const fast = halfStepTicks(1, 10, false);
    expect(fast).toBeLessThan(slow);
    const spawns = (level: number): number => {
      const road = new Road(roadLayout(0));
      const rng = new Rng(9);
      road.reset();
      let count = 0;
      for (let i = 0; i < 5000; i++) {
        road.scroll(100, CAR_Y);
        count += road.spawn(level, rng).length;
      }
      return count;
    };
    expect(spawns(10)).toBeGreaterThan(spawns(1) * 1.4);
  });

  it('добавочная жизнь за каждые 2000 очков; при полных жизнях — 200 очков вместо неё', () => {
    expect(SCORES_TO_EXTRA_LIFE).toBe(2000);
    const game = begin(racing(0));
    game['setLives'](2);
    game['addScore'](1999);
    expect(game.lives).toBe(2);
    game['addScore'](1);
    expect(game.lives).toBe(3);
    expect(kinds(game.step(IDLE))).toContain('bonus');
    const full = begin(racing(0));
    full['addScore'](2000);
    expect(full.lives).toBe(4);
    expect(full.score).toBe(2200);
  });

  it('пауза замораживает дорогу, продолжение возвращает ход', () => {
    const game = begin(racing(0));
    run(game, 7);
    game.pause();
    const frozen = frameHash(game);
    run(game, 100, press('left', 'up'));
    expect(frameHash(game)).toBe(frozen);
    game.resume();
    run(game, 30);
    expect(frameHash(game)).not.toBe(frozen);
  });

  it('варианты различаются полосами, рамкой, ориентацией и скоростью', () => {
    const hashes = new Set<string>();
    for (const scheme of SCHEMES) {
      const game = begin(racing(scheme.mode));
      run(game, 200);
      hashes.add(frameHash(game));
    }
    expect(hashes.size).toBe(4);
    // три полосы медленнее при той же скорости
    expect(halfStepTicks(4, 3, true)).toBeGreaterThan(halfStepTicks(4, 3, false));
  });

  it('детерминизм: те же зерно и ввод — те же события и кадры', () => {
    const play = (): string => {
      const game = racing(1, { seed: 21 });
      game.start();
      const bot = makeBot(game, 1);
      const log: string[] = [];
      for (let t = 0; t < 3000; t++) {
        const events = game.step(bot());
        log.push(`${kinds(events).join(',')}:${frameHash(game)}`);
      }
      return log.join('\n');
    };
    expect(play()).toBe(play());
  });

  coveredScenario('racing', 'прогресс', '«бот» по рисунку поля набирает очки на каждом варианте и доживает до роста скорости', () => {
    for (const scheme of SCHEMES) {
      const game = racing(scheme.mode, { seed: 5, speed: 4 });
      game.start();
      const bot = makeBot(game, scheme.mode);
      for (let t = 0; t < 12000 && game.phase !== 'over'; t++) game.step(bot());
      expect(game.score).toBeGreaterThanOrEqual(50);
      expect(game.speed).toBeGreaterThanOrEqual(5); // 50 очков — шаг скорости
      expect(game.lives).toBe(4);
    }
  });
});

// ------------------------------------------------------------------ гонки со стрельбой

describe('гонки со стрельбой: оружие и пешеходы', () => {
  it('в начале оружия нет: ROTATE и «огонь» не стреляют и не ускоряют, «вверх» ускоряет', () => {
    for (const mode of [0, 1, 2, 3]) {
      const down = mode >= 2;
      const base = begin(shooter(mode));
      const baseline = run(base, 80);
      const pressed = begin(shooter(mode));
      const events = run(pressed, 80, hold('rotate', 'fire'));
      expect(kinds(events)).not.toContain('shot');
      expect(kinds(baseline)).toEqual(kinds(events));
      expect(frameHash(pressed)).toBe(frameHash(base));
      expect(pressed['shells'].length).toBe(0);
      const gas = begin(shooter(mode));
      run(gas, 80, hold(down ? 'down' : 'up'));
      expect(gas['road'].opponents[0]?.y ?? -99).toBeLessThan(base['road'].opponents[0]?.y ?? 99);
    }
  });

  it('сбитый пешеход заряжает оружие: патроны, нос мигает, патроны в превью справа, звук `bonus`', () => {
    const game = begin(shooter(0));
    expect(game['ammo']).toBe(0);
    expect(cellAt(game, 6, 16)).toBe(1);
    game['walkers'].push({ x: game['carX'], y: 6 });
    const events: BrickEvent[] = [];
    for (let t = 0; t < 200 && game['ammo'] === 0; t++) events.push(...game.step(IDLE));
    expect(game['ammo']).toBe(AMMO_PER_PEDESTRIAN);
    expect(kinds(events)).toContain('bonus');
    expect(game['walkers'].length).toBe(0);
    expect(cellAt(game, 6, 16)).toBe(2); // мигающий нос
    const preview = game.preview() ?? new Uint8Array(16);
    expect([0, 1, 2, 3].map((i) => preview[i * 4 + 3])).toEqual([1, 1, 1, 0]);
    expect([0, 1, 2, 3].map((i) => preview[i * 4 + 1])).toEqual([1, 1, 1, 1]); // жизни по-прежнему слева
    // магазин не больше MAX_AMMO
    game['walkers'].push({ x: game['carX'], y: 5 });
    for (let t = 0; t < 200 && game['walkers'].length > 0; t++) game.step(IDLE);
    expect(game['ammo']).toBe(MAX_AMMO);
  });

  it('перестроение на пешехода тоже сбивает его', () => {
    const game = begin(shooter(1));
    game['walkers'].push({ x: 1, y: 2 });
    const events = game.step(press('left'));
    expect(kinds(events)).toEqual(['move', 'bonus']);
    expect(game['ammo']).toBe(AMMO_PER_PEDESTRIAN);
    expect(game['lives']).toBe(4);
  });

  it('выстрел: пуля вылетает перед носом и летит вверх; темп ограничен, зажатая кнопка — автоогонь, патроны тают', () => {
    expect(FIRE_COOLDOWN_TICKS).toBe(14);
    expect(BULLET_TICKS).toBe(2);
    const game = begin(shooter(0));
    game['ammo'] = 3;
    const events = game.step(press('rotate'));
    expect(kinds(events)).toEqual(['shot']);
    expect(game['ammo']).toBe(2);
    expect(game['shells']).toEqual([{ x: 6, y: 4 }]);
    expect(cellAt(game, 6, 15)).toBe(2); // мигает прямо перед носом (нос — в строке 16)
    // второй выстрел раньше времени не получается
    for (let i = 0; i < FIRE_COOLDOWN_TICKS - 1; i++) expect(kinds(game.step(press('rotate')))).not.toContain('shot');
    expect(game['ammo']).toBe(2);
    expect(kinds(game.step(press('rotate')))).toContain('shot');
    expect(game['ammo']).toBe(1);
    // пуля летит на клетку за два такта и вылетает за верх поля
    const tracker = begin(shooter(0));
    tracker['road'].opponents = [];
    tracker['ammo'] = 1;
    tracker.step(press('fire'));
    const trail: number[] = [];
    let steady = 0;
    for (let i = 0; i < 60 && tracker['shells'].length > 0; i++) {
      const y = tracker['shells'][0]?.y ?? -1;
      if (trail[trail.length - 1] !== y) {
        if (trail.length > 1) expect(steady).toBe(BULLET_TICKS);
        trail.push(y);
        steady = 0;
      }
      steady++;
      tracker.step(IDLE);
    }
    expect(trail[0]).toBe(4);
    expect(trail.slice(0, 4)).toEqual([4, 5, 6, 7]);
    expect(trail[trail.length - 1]).toBe(BRICK_ROWS - 1);
    expect(tracker['shells'].length).toBe(0);
    // автоогонь зажатой кнопкой
    const auto = begin(shooter(0));
    auto['ammo'] = 4;
    const shots = kinds(run(auto, FIRE_COOLDOWN_TICKS * 2 + 1, hold('rotate'))).filter((name) => name === 'shot');
    expect(shots.length).toBe(3);
    expect(auto['ammo']).toBe(1);
    // без патронов не стреляет, нос больше не мигает
    run(auto, FIRE_COOLDOWN_TICKS + 1, hold('rotate'));
    expect(auto['ammo']).toBe(0);
    run(auto, FIRE_COOLDOWN_TICKS * 2, hold('rotate'));
    expect(cellAt(auto, auto['carX'], 16)).toBe(1);
  });

  it('попадание: машина исчезает, очко и звук `hit`; без выстрела та же машина разбила бы нас', () => {
    const scene = (armed: boolean): RacingShootGame => {
      const game = begin(shooter(0));
      game['road'].opponents = [{ x: game['carX'], y: 14 }];
      game['ammo'] = armed ? 2 : 0;
      return game;
    };
    const unarmed = scene(false);
    const crashEvents = run(unarmed, 400, hold('rotate'));
    expect(kinds(crashEvents)).toContain('crash');

    const game = scene(true);
    const target = game['road'].opponents[0];
    const events = [...game.step(press('rotate')), ...run(game, 400)];
    expect(kinds(events).filter((name) => name === 'hit').length).toBe(1);
    expect(kinds(events)).not.toContain('crash');
    expect(game.score).toBeGreaterThanOrEqual(1);
    expect(target && game['road'].opponents.includes(target)).toBe(false);
    expect(game['shells'].length).toBe(0);
    expect(game.lives).toBe(4);
  });

  it('выстрел в упор попадает сразу, пуля в чужую полосу летит мимо', () => {
    const near = begin(shooter(0));
    near['road'].opponents = [{ x: near['carX'], y: 4 }]; // нос игрока почти касается колёс этой машины
    near['ammo'] = 1;
    const events = near.step(press('rotate'));
    expect(kinds(events)).toEqual(['shot', 'hit']);
    expect(near.score).toBe(1);
    expect(near['shells'].length).toBe(0);

    const miss = begin(shooter(0));
    miss['road'].opponents = [{ x: 3, y: 12 }];
    miss['ammo'] = 1;
    const out = [...miss.step(press('rotate')), ...run(miss, 25)];
    expect(kinds(out)).not.toContain('hit');
    expect(miss.score).toBe(0);
    expect(miss['road'].opponents.length).toBeGreaterThanOrEqual(1);
  });

  it('пуля не трогает пешеходов и летит дальше', () => {
    const game = begin(shooter(0));
    game['road'].opponents = [];
    game['walkers'].push({ x: game['carX'], y: 12 });
    game['ammo'] = 1;
    game.step(press('rotate'));
    run(game, 40);
    expect(game['walkers'].length).toBe(1);
    expect(game['ammo']).toBe(0);
  });

  it('в перевёрнутых вариантах пуля летит вниз экрана', () => {
    const inverted = begin(shooter(2));
    inverted['ammo'] = 1;
    inverted.step(press('rotate'));
    expect(cellAt(inverted, 6, 4)).toBe(2);
    run(inverted, BULLET_TICKS * 3);
    expect(cellAt(inverted, 6, 7)).toBe(2);
    expect(cellAt(inverted, 6, 4)).toBe(0);
    const normal = begin(shooter(0));
    normal['ammo'] = 1;
    normal.step(press('rotate'));
    run(normal, BULLET_TICKS * 3);
    expect(cellAt(normal, 6, 12)).toBe(2);
  });

  it('авария: пули убраны, оружие потеряно, жизнь снята, уровень начат заново', () => {
    const game = begin(shooter(0));
    game['road'].opponents = [];
    game['ammo'] = 4;
    game.step(press('rotate'));
    run(game, 6); // пуля уже далеко от носа
    expect(game['shells'].length).toBe(1);
    game['road'].opponents = [{ x: game['carX'], y: 5 }];
    game['walkers'].push({ x: 3, y: 15 });
    let crashed = false;
    for (let t = 0; t < 400 && !crashed; t++) crashed = kinds(game.step(IDLE)).includes('crash');
    expect(crashed).toBe(true);
    expect(game['shells'].length).toBe(0);
    expect(game.lives).toBe(4);
    run(game, 4 * 7 * 4 + 72);
    expect(game.lives).toBe(3);
    expect(game['ammo']).toBe(0);
    expect(game['walkers'].length).toBe(0);
    expect(cellAt(game, game['carX'], 16)).toBe(1); // нос больше не мигает
  });

  coveredScenario('racing-shooting', 'неудача', 'четыре аварии — конец игры и у стрельбы', () => {
    for (const mode of [0, 1, 2, 3]) {
      const game = shooter(mode, { speed: 10 });
      game.start();
      const all: BrickEvent[] = [];
      for (let t = 0; t < 60000 && game.phase !== 'over'; t++) all.push(...game.step(hold('up', 'down')));
      expect(game.phase).toBe('over');
      expect(kinds(all).filter((name) => name === 'crash').length).toBe(4);
      expect(game.lives).toBe(0);
    }
  });

  it('пешеходы появляются только в полосе, свободной от машин новой группы, и над полем', () => {
    expect(PEDESTRIAN_ONE_IN).toBe(3);
    let spawned = 0;
    for (const mode of [0, 1, 3]) {
      const game = shooter(mode, { seed: 13, speed: 3 });
      game.start();
      const bot = makeBot(game, mode, { walkers: true });
      let known = new Set<object>();
      for (let t = 0; t < 6000 && game.phase !== 'over'; t++) {
        game.step(bot());
        const walkers = game['walkers'];
        const fresh = walkers.filter((walker) => !known.has(walker));
        for (const walker of fresh) {
          spawned++;
          expect(game['road'].layout.lanes).toContain(walker.x);
          expect(walker.y).toBeGreaterThanOrEqual(BRICK_ROWS - 1);
          const free = game['road'].freeLanes(game['road'].lastSpawn.length > 0 ? game['road'].lastSpawn : game['road'].opponents);
          expect(free.length).toBeGreaterThan(0);
        }
        known = new Set<object>(walkers);
        // пешеход никогда не стоит внутри встречной машины
        for (const walker of walkers) {
          for (const car of game['road'].opponents) expect(carCovers(car.x, car.y, walker.x, walker.y)).toBe(false);
        }
      }
    }
    expect(spawned).toBeGreaterThan(5);
  });

  coveredScenario('racing-shooting', 'прогресс', '«бот» собирает пешеходов, стреляет по машинам и набирает очки', () => {
    for (const mode of [0, 1, 2, 3]) {
      const game = shooter(mode, { seed: 3, speed: 4 });
      game.start();
      const bot = makeBot(game, mode, { walkers: true, shoot: true });
      const names: string[] = [];
      for (let t = 0; t < 9000 && game.phase !== 'over'; t++) names.push(...kinds(game.step(bot())));
      expect(game.score).toBeGreaterThanOrEqual(40);
      for (const name of ['shot', 'hit', 'bonus']) expect(names).toContain(name);
    }
  });

  it('очки и скорость как у обычных гонок: попадание тоже считается к порогу 50', () => {
    const game = begin(shooter(0, { speed: 2 }));
    game['addScore'](49);
    game['road'].opponents = [{ x: game['carX'], y: 4 }];
    game['ammo'] = 1;
    game.step(press('rotate'));
    expect(game.score).toBe(50);
    expect(game.speed).toBe(3);
  });
});
