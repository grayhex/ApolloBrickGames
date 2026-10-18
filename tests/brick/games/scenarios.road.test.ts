import { SCENARIO_GROUPS, scenarioSuite } from '../scenarioCoverage';
/**
 * Сценарные тесты правил дорожных игр Brick Game — класс `RoadGame` (src/brick/games/library/action.ts):
 * obstacle-race, boat-racing, racing-four, super-tank, racing-pickup, punch-racing.
 *
 * Общие контрактные проверки (conformance) и fuzz не доказывают, что игру можно пройти. Здесь игра проводится через публичный API
 * (`start()`, `step(makeBrickInput([...]))`, `cells()`, `score`, `lives`, `level`, `phase`, события) к конкретному исходу:
 * «прогресс» (очки по правилу, переход на следующий уровень) и «неудача» (потеря жизни, конец партии).
 * Состояние готовится присваиванием полям игры, но сам исход всегда получается настоящими тактами `step`.
 *
 * Ожидаемые числа записаны по правилам из справки (src/brick/guides/library.ts) и по рисунку спрайтов, а не выведены из констант реализации:
 *  – машина игрока: (x,17), (x,18), (x−1,19), (x+1,19); узкая (racing-four): (x,17), (x,18), (x,19);
 *  – машина-препятствие: (x,y), (x−1,y+1), (x,y+1), (x+1,y+1); узкая: (x,y), (x,y+1), (x,y+2); стена — две сплошные строки y и y+1;
 *  – пропущенное препятствие +1, разрушенное +10, победа в уровне +100 (общая награда библиотеки), тридцатое препятствие/шаг дороги открывает уровень;
 *  – держа ↑, дорога идёт быстрее; сколько тактов длится шаг, тесты измеряют, а не берут из кода.
 */
import { describe, expect, it } from 'vitest';
import { RoadGame, type RoadObstacle } from '../../../src/brick/games/library/action';
import { CELL_BLINK, CELL_OFF, CELL_ON, NEUTRAL_BRICK_INPUT, makeBrickInput, type BrickAction, type BrickEvent, type BrickInput } from '../../../src/brick';
import { findSafePath } from '../safePath';

const coveredScenario = scenarioSuite('scenarios.road');

/** Игры, для которых в этом файле есть и сценарий «прогресс», и сценарий «неудача». */
const SCENARIO_GAMES = SCENARIO_GROUPS['scenarios.road'];
type RoadId = (typeof SCENARIO_GAMES)[number];

// ── помощники: ввод, прогон тактов, учёт судьбы препятствий ───────────────────────────────────────────────────────────────────────

/** Кнопки зажаты без фронта нажатия (газ ↑, огонь ROTATE и т. п.). */
const hold = (...actions: BrickAction[]): BrickInput => makeBrickInput([], actions);
/** Нажатие и отпускание: два такта (фронт, затем тишина), чтобы автоповтор не сработал. */
const tap = (g: RoadGame, action: BrickAction): BrickEvent[] => [...g.step(makeBrickInput([action])), ...g.step(NEUTRAL_BRICK_INPUT)];
const run = (g: RoadGame, ticks: number, input: BrickInput = NEUTRAL_BRICK_INPUT): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push(...g.step(input));
  return events;
};
const count = (events: readonly BrickEvent[], type: BrickEvent['type']): number => events.filter((e) => e.type === type).length;
const has = (type: BrickEvent['type']) => (events: readonly BrickEvent[]): boolean => count(events, type) > 0;
/** Такты до тех пор, пока `done` не станет истиной; не дождались за `limit` тактов — сценарий не состоялся. */
function runUntil(g: RoadGame, done: (events: BrickEvent[]) => boolean, input: BrickInput = NEUTRAL_BRICK_INPUT, limit = 600): { ticks: number; events: BrickEvent[] } {
  const events: BrickEvent[] = [];
  for (let t = 1; t <= limit; t++) {
    const now = g.step(input);
    events.push(...now);
    if (done(now)) return { ticks: t, events };
  }
  throw new Error(`условие не наступило за ${limit} тактов (счёт ${g.score}, жизни ${String(g.lives)})`);
}
const begin = (id: RoadId, options: { seed?: number; hiScore?: number } = {}): RoadGame => {
  const g = new RoadGame(id, options);
  g.start();
  return g;
};

/** Что произошло с препятствиями за прогон: уехали за нижний край (+1), разрушены (+10), подобраны (бонус), сколько появилось. */
interface Flow {
  passed: number;
  destroyed: number;
  collected: number;
  spawned: number;
  events: BrickEvent[];
}
/**
 * Прогоняет такты и записывает судьбу каждого препятствия (по ссылке на объект): ушедшее с `y > 20` — пропущено, остальные исчезнувшие — разрушены или подобраны.
 * Останавливается, если потеряна жизнь (поле тогда замирает и сбрасывается сценкой, учёт перестаёт быть осмысленным); `each` может остановить прогон, вернув `true`.
 */
function drive(g: RoadGame, ticks: number, input: BrickInput | ((tick: number) => BrickInput), each?: (g: RoadGame, events: BrickEvent[], tick: number) => boolean | void): Flow {
  const flow: Flow = { passed: 0, destroyed: 0, collected: 0, spawned: 0, events: [] };
  for (let t = 0; t < ticks; t++) {
    const before = [...g.obstacles];
    const events = g.step(typeof input === 'function' ? input(t) : input);
    flow.events.push(...events);
    if (has('lifeLost')(events)) break;
    for (const o of before) {
      if (g.obstacles.includes(o)) continue;
      if (o.y > 20) flow.passed++;
      else if (o.kind > 0) flow.collected++;
      else flow.destroyed++;
    }
    flow.spawned += g.obstacles.filter((o) => !before.includes(o)).length;
    if (each?.(g, events, t) === true) break;
  }
  return flow;
}

// ── помощники: геометрия по рисунку спрайтов (независимая от реализации) ──────────────────────────────────────────────────────────

type Cell = readonly [x: number, y: number];
const playerCells = (x: number, slim = false): Cell[] => (slim ? [[x, 17], [x, 18], [x, 19]] : [[x, 17], [x, 18], [x - 1, 19], [x + 1, 19]]);
const carCells = (x: number, y: number, slim = false): Cell[] => (slim ? [[x, y], [x, y + 1], [x, y + 2]] : [[x, y], [x - 1, y + 1], [x, y + 1], [x + 1, y + 1]]);
const wallCells = (y: number): Cell[] => Array.from({ length: 20 }, (_, i): Cell => [i % 10, y + Math.floor(i / 10)]);
const touch = (a: readonly Cell[], b: readonly Cell[]): boolean => a.some(([ax, ay]) => b.some(([bx, by]) => ax === bx && ay === by));
/** Строка `y`, на которой препятствие, едущее сверху вниз, впервые задевает машину игрока; `null` — никогда не задевает. */
const contactRow = (obstacle: (y: number) => readonly Cell[], player: readonly Cell[]): number | null => {
  for (let y = 0; y <= 20; y++) if (touch(obstacle(y), player)) return y;
  return null;
};
const lit = (g: RoadGame, x: number, y: number): number => g.cells()[y * 10 + x]!;

// ── помощники: безопасный маршрут (поиск по копиям игры, затем проигрыш настоящими тактами) ───────────────────────────────────────────

const MOVES = ['left', 'right'] as const;
/**
 * Ищет последовательность решений без потери жизни (tests/brick/safePath.ts) и возвращает её как список «нажать кнопку / ничего»:
 * одно решение — два такта (нажатие и тишина), `held` зажато всегда. Сам поиск игру не проходит — проходит игрок, повторяющий маршрут на свежей игре.
 */
function route(make: () => RoadGame, held: readonly BrickAction[], horizon: number): { steps: (BrickAction | null)[]; won: boolean } {
  const found = findSafePath(make(), { horizon, stride: 2, alwaysHeld: held, moves: MOVES.map((m) => [m]) });
  expect(found.found, 'существует маршрут без потери жизни').toBe(true);
  return { steps: found.steps.map((i) => MOVES[i - 1] ?? null), won: found.won };
}
/** Ввод по маршруту: на чётных тактах нажатие решения, на нечётных — тишина. */
const follow = (steps: readonly (BrickAction | null)[], held: readonly BrickAction[]) => (t: number): BrickInput => {
  const move = t % 2 === 0 ? steps[t / 2] : null;
  return makeBrickInput(move ? [move] : [], held);
};

// ── obstacle-race ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('obstacle-race: извилистая трасса (сценарии)', () => {
  /** Стартовая прямая трасса: стенки в колонках 2 и 8, между ними пять свободных клеток (3…7). */
  const WALLS = [2, 8];
  const touchesWall = (x: number): boolean => playerCells(x).some(([cx]) => cx < 0 || cx > 9 || WALLS.includes(cx));
  /** Один шаг дороги: ждём, пока счёт вырастет на единицу (за шаг дороги — ровно +1). */
  const stepRoad = (g: RoadGame): BrickEvent[] => {
    const score = g.score;
    return runUntil(g, () => g.score > score, hold('up'), 60).events;
  };

  coveredScenario('obstacle-race', 'прогресс', 'прогресс: безопасная езда — +1 за каждый шаг дороги, шестидесятый шаг даёт победу (+100) и второй уровень', () => {
    const make = (): RoadGame => begin('obstacle-race', { seed: 1 });
    const { steps, won } = route(make, ['up'], 400);
    expect(won, 'маршрут доходит до победы в уровне').toBe(true);

    const g = make();
    const start = [...g.road];
    const trace: { score: number; road: number[]; events: BrickEvent[] }[] = [];
    drive(g, steps.length * 2, follow(steps, ['up']), (game, events) => {
      trace.push({ score: game.score, road: [...game.road], events });
      return has('win')(events);
    });
    expect(g.lives).toBe(4);

    // шаг дороги измеряем: первый такт, на котором счёт стал 1; дальше шаги идут строго с тем же периодом
    const period = trace.findIndex((row) => row.score >= 1) + 1;
    expect(period).toBeGreaterThan(1);
    expect(trace).toHaveLength(60 * period); // шестидесятый шаг — последний такт сценария
    trace.forEach((row, i) => {
      const t = i + 1;
      const previous = i === 0 ? start : trace[i - 1]!.road;
      if (t < 60 * period) expect(row.score, `счёт на такте ${t}`).toBe(Math.floor(t / period));
      // шаг дороги — это сдвиг трассы на строку вниз; между шагами трасса стоит
      if (t % period === 0) expect(row.road.slice(1), `сдвиг на такте ${t}`).toEqual(previous.slice(0, 19));
      else expect(row.road, `покой на такте ${t}`).toEqual(previous);
    });
    const last = trace.at(-1)!;
    expect(count(last.events, 'win')).toBe(1);
    expect(last.score).toBe(60 + 100);
    expect(g.level).toBe(1); // уровень сменится после сценки победы

    const { events } = runUntil(g, has('levelUp'), NEUTRAL_BRICK_INPUT, 200);
    expect(count(events, 'levelUp')).toBe(1);
    expect(g.level).toBe(2);
    expect(g.score).toBe(160);
    expect(g.lives).toBe(4);
    expect(g.x).toBe(4);
    expect(g.road.every((v) => v === 2)).toBe(true); // новый уровень начинается с прямой трассы
    run(g, period, hold('up'));
    expect(g.score).toBe(161); // счёт шагов нового уровня идёт заново
  });

  coveredScenario('obstacle-race', 'прогресс', 'прогресс: удержание ↑ ускоряет дорогу — шаг с газом короче шага без газа', () => {
    const idle = begin('obstacle-race');
    const slow = runUntil(idle, () => idle.score >= 1, NEUTRAL_BRICK_INPUT, 100).ticks;
    const gas = begin('obstacle-race');
    const fast = runUntil(gas, () => gas.score >= 1, hold('up'), 100).ticks;
    expect(fast).toBeLessThan(slow);
  });

  coveredScenario('obstacle-race', 'прогресс', 'прогресс: поворот трассы, идущий на машину, объезжается рулём — стенка проходит строки 17–19, жизни целы, каждый шаг +1', () => {
    const g = begin('obstacle-race');
    tap(g, 'right');
    tap(g, 'right');
    expect(g.x).toBe(6);
    g.road[15] = 0; // впереди поворот: стенки в колонках 0 и 6, правая встанет на пути машины (клетки (6,17), (6,18))
    tap(g, 'left');
    tap(g, 'left');
    expect(g.x).toBe(4); // из колонок 3…5 нижней строки правая стенка (6) далеко
    for (let step = 1; step <= 6; step++) stepRoad(g);
    expect(g.lives).toBe(4);
    expect(g.score).toBe(6);
    expect(g.road.slice(15)).toEqual([2, 2, 2, 2, 2]); // стенка уже прошла нижние строки и ушла
  });

  coveredScenario('obstacle-race', 'неудача', 'неудача: из пяти свободных клеток машине безопасны три положения (4, 5, 6); зацепить стенку — потерять жизнь', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].filter((x) => !touchesWall(x))).toEqual([4, 5, 6]);
    for (const target of [0, 1, 2, 3, 5, 6, 7, 8]) {
      const g = begin('obstacle-race');
      const dir: BrickAction = target < 4 ? 'left' : 'right';
      const sign = target < 4 ? -1 : 1;
      let crashed = false;
      for (let x = 4 + sign; x !== target + sign && !crashed; x += sign) {
        const events = tap(g, dir);
        crashed = touchesWall(x);
        expect(g.lives, `к колонке ${target}: шаг в колонку ${x}`).toBe(crashed ? 3 : 4);
        expect(count(events, 'lifeLost'), `к колонке ${target}: шаг в колонку ${x}`).toBe(crashed ? 1 : 0);
      }
    }
  });

  coveredScenario('obstacle-race', 'неудача', 'неудача: стенка опасна ровно на строках 17–19 — на строке 16 безвредна, с очередным шагом на строке 17 стоит жизни', () => {
    const g = begin('obstacle-race');
    tap(g, 'right');
    tap(g, 'right'); // x = 6: клетки (6,17), (6,18), (5,19), (7,19)
    g.road[15] = 0; // правая стенка поворота в колонке 6, на строке 15
    stepRoad(g);
    expect(g.road[16]).toBe(0);
    expect(g.lives, 'стенка на строке 16 машину не задевает').toBe(4);
    const events = stepRoad(g);
    expect(g.road[17]).toBe(0);
    expect(count(events, 'lifeLost')).toBe(1);
    expect(g.lives).toBe(3);
    expect(touch(playerCells(6), [[6, 17]])).toBe(true); // общая клетка (6,17) — причина столкновения
  });
});

// ── boat-racing ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('boat-racing: три полосы (сценарии)', () => {
  const LANES = [1, 4, 7];

  coveredScenario('boat-racing', 'прогресс', 'прогресс: лодка ходит по полосам 1, 4 и 7 и упирается в крайние', () => {
    const g = begin('boat-racing');
    expect(g.x).toBe(4);
    const path = [...'rrrlllll'].map((c) => {
      tap(g, c === 'r' ? 'right' : 'left');
      return g.x;
    });
    expect(path).toEqual([7, 7, 7, 4, 1, 1, 1, 1]);
  });

  coveredScenario('boat-racing', 'прогресс', 'прогресс: уход с полосы спасает — препятствие проплывает мимо, пропущенное препятствие +1', () => {
    const g = begin('boat-racing');
    const car = { x: 4, y: 8, kind: 0 };
    g.obstacles = [car];
    tap(g, 'right'); // с полосы 4 на полосу 7
    expect(g.x).toBe(7);
    const { events } = runUntil(g, () => !g.obstacles.includes(car), hold('up'), 400);
    expect(car.y).toBe(21); // ушло за нижний край
    expect(g.score).toBe(1);
    expect(g.lives).toBe(4);
    expect(count(events, 'lifeLost')).toBe(0);
  });

  coveredScenario('boat-racing', 'прогресс', 'прогресс: препятствия соседних полос лодку не задевают — две машины рядом проплывают, +1 за каждую', () => {
    const g = begin('boat-racing'); // лодка на полосе 4, препятствия на полосах 1 и 7 на одной высоте
    expect(contactRow((y) => carCells(1, y), playerCells(4))).toBeNull();
    expect(contactRow((y) => carCells(7, y), playerCells(4))).toBeNull();
    g.obstacles = [{ x: 1, y: 14, kind: 0 }, { x: 7, y: 14, kind: 0 }];
    const flow = drive(g, 400, hold('up'), () => g.score >= 2);
    expect(flow.passed).toBe(2);
    expect(g.score).toBe(2);
    expect(g.lives).toBe(4);
  });

  coveredScenario('boat-racing', 'прогресс', 'прогресс: безопасный заплыв — лодка всегда на полосе, счёт равен числу пропущенных препятствий, жизни целы', () => {
    const make = (): RoadGame => begin('boat-racing', { seed: 3 });
    const { steps } = route(make, ['up'], 400);
    expect(steps.some(Boolean), 'маршрут требует уворачиваться').toBe(true);
    const g = make();
    const flow = drive(g, steps.length * 2, follow(steps, ['up']), (game) => {
      expect(LANES).toContain(game.x);
    });
    expect(g.lives).toBe(4);
    expect(flow.passed).toBeGreaterThanOrEqual(5);
    expect(g.score).toBe(flow.passed); // каждое пропущенное препятствие ровно +1, никаких других очков
    expect(flow.destroyed).toBe(0);
  });

  coveredScenario('boat-racing', 'неудача', 'неудача: препятствие на своей полосе стоит жизни ровно в строке, где клетки спрайтов впервые совпадают', () => {
    const row = contactRow((y) => carCells(4, y), playerCells(4));
    expect(row).toBe(16);
    const g = begin('boat-racing');
    const car = { x: 4, y: row! - 4, kind: 0 };
    g.obstacles = [car];
    const { events } = runUntil(g, has('lifeLost'), hold('up'));
    expect(car.y).toBe(row);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0); // столкновение очков не приносит
    expect(count(events, 'lifeLost')).toBe(1);
  });
});

// ── racing-four ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('racing-four: четыре полосы и узкие машины (сценарии)', () => {
  const LANES = [1, 3, 5, 7];
  /** Сценарии ставят машину на полосу явно. */
  const onLane = (lane: number, seed?: number): RoadGame => {
    const g = begin('racing-four', seed === undefined ? {} : { seed });
    g.x = lane;
    return g;
  };

  coveredScenario('racing-four', 'прогресс', 'прогресс: рисунок узкий — машины в одну колонку, поэтому соседняя полоса через клетку не задевается', () => {
    const g = onLane(3);
    g.obstacles = [{ x: 5, y: 5, kind: 0 }];
    expect([5, 6, 7].map((y) => lit(g, 5, y))).toEqual([CELL_ON, CELL_ON, CELL_ON]);
    expect([4, 6].map((x) => lit(g, x, 6))).toEqual([CELL_OFF, CELL_OFF]); // у машины нет «крыльев» по сторонам
    expect([17, 18, 19].map((y) => lit(g, 3, y)).every((v) => v !== CELL_OFF)).toBe(true);
    expect([2, 4].map((x) => lit(g, x, 19))).toEqual([CELL_OFF, CELL_OFF]);
    // широкие спрайты на полосах через клетку перекрылись бы — поэтому они узкие
    expect(contactRow((y) => carCells(5, y, false), playerCells(3, false))).not.toBeNull();
    expect(contactRow((y) => carCells(5, y, true), playerCells(3, true))).toBeNull();
  });

  coveredScenario('racing-four', 'прогресс', 'прогресс: полосы 1, 3, 5, 7 — машина шагает по одной и упирается в крайние', () => {
    const g = onLane(1);
    const path = [...'rrrrrllllll'].map((c) => {
      tap(g, c === 'r' ? 'right' : 'left');
      return g.x;
    });
    expect(path).toEqual([3, 5, 7, 7, 7, 5, 3, 1, 1, 1, 1]);
  });

  coveredScenario('racing-four', 'прогресс', 'прогресс: две машины на соседних полосах проезжают мимо, не задев игрока, — +1 за каждую', () => {
    const g = onLane(3);
    g.obstacles = [{ x: 1, y: 13, kind: 0 }, { x: 5, y: 13, kind: 0 }];
    const flow = drive(g, 400, hold('up'), () => g.score >= 2);
    expect(flow.passed).toBe(2);
    expect(g.score).toBe(2);
    expect(g.lives).toBe(4);
  });

  coveredScenario('racing-four', 'прогресс', 'прогресс: безопасный заезд — машина всегда на полосе, счёт равен числу пропущенных машин, жизни целы', () => {
    const make = (): RoadGame => onLane(3, 3);
    const { steps } = route(make, ['up'], 400);
    expect(steps.some(Boolean), 'маршрут требует менять полосу').toBe(true);
    const g = make();
    const flow = drive(g, steps.length * 2, follow(steps, ['up']), (game) => {
      expect(LANES).toContain(game.x);
    });
    expect(g.lives).toBe(4);
    expect(flow.passed).toBeGreaterThanOrEqual(5);
    expect(g.score).toBe(flow.passed);
  });

  coveredScenario('racing-four', 'неудача', 'неудача: машина на своей полосе стоит жизни, когда общая клетка появляется впервые (узкая машина — строкой раньше широкой)', () => {
    const row = contactRow((y) => carCells(3, y, true), playerCells(3, true));
    expect(row).toBe(15);
    expect(contactRow((y) => carCells(3, y, false), playerCells(3, false))).toBe(16);
    const g = onLane(3);
    const car = { x: 3, y: row! - 4, kind: 0 };
    g.obstacles = [car];
    const { events } = runUntil(g, has('lifeLost'), hold('up'));
    expect(car.y).toBe(row);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    expect(count(events, 'lifeLost')).toBe(1);
  });
});

// ── super-tank ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('super-tank: стрельба по препятствиям (сценарии)', () => {
  coveredScenario('super-tank', 'прогресс', 'прогресс: выстрел разрушает машину в колонке танка — +10, событие попадания, машина пропадает и очков за проезд не даёт', () => {
    const g = begin('super-tank');
    const car = { x: 4, y: 3, kind: 0 };
    g.obstacles = [car];
    const { events } = runUntil(g, () => !g.obstacles.includes(car), hold('up', 'rotate'), 200);
    expect(count(events, 'shot')).toBeGreaterThanOrEqual(1);
    expect(count(events, 'hit')).toBe(1);
    expect(car.y).toBeLessThanOrEqual(20); // разрушена в поле, а не проехала
    expect(g.score).toBe(10);
    expect(g.lives).toBe(4);
  });

  coveredScenario('super-tank', 'прогресс', 'прогресс: выстрел попадает по видимым клеткам — машины, у которых есть клетка в колонке танка, разрушаются, остальные едут дальше', () => {
    for (let cx = 0; cx <= 8; cx++) {
      const g = begin('super-tank'); // танк в колонке 4
      const car = { x: cx, y: 10, kind: 0 }; // за 24 такта новая машина сверху до выстрела не доедет, а эта — до танка
      g.obstacles = [car];
      run(g, 24, hold('up', 'rotate'));
      const inColumn = carCells(cx, 10).some(([x]) => x === 4); // широкая часть машины — три клетки, верхняя — одна
      expect(g.obstacles.includes(car), `машина в колонке ${cx}`).toBe(!inColumn);
      expect(g.score, `машина в колонке ${cx}`).toBe(inColumn ? 10 : 0);
      expect(g.lives).toBe(4);
    }
  });

  coveredScenario('super-tank', 'прогресс', 'прогресс: выстрел в упор успевает — машина вплотную к носу (ещё без общих клеток) разрушается, а не стоит жизни', () => {
    expect(touch(carCells(4, 15), playerCells(4))).toBe(false); // y = 15: вплотную, но не задевает
    expect(touch(carCells(4, 16), playerCells(4))).toBe(true); // следующий шаг дороги — уже столкновение
    const g = begin('super-tank');
    const car = { x: 4, y: 15, kind: 0 };
    g.obstacles = [car];
    const { events } = runUntil(g, () => !g.obstacles.includes(car), hold('up', 'rotate'), 60);
    expect(count(events, 'hit')).toBe(1);
    expect(count(events, 'lifeLost')).toBe(0);
    expect(car.y).toBe(15);
    expect(g.score).toBe(10);
    expect(g.lives).toBe(4);
  });

  coveredScenario('super-tank', 'прогресс', 'прогресс: удержание — очередь выстрелов через равные промежутки, одиночное нажатие — один выстрел; FIRE стреляет так же, как ROTATE', () => {
    const burst = begin('super-tank');
    const shotTicks: number[] = [];
    for (let t = 1; t <= 60; t++) if (has('shot')(burst.step(hold('rotate')))) shotTicks.push(t);
    expect(shotTicks[0]).toBe(1); // огонь с места, без раскачки
    expect(shotTicks.length).toBeGreaterThanOrEqual(3);
    const gaps = shotTicks.slice(1).map((t, i) => t - shotTicks[i]!);
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBeGreaterThan(1);

    const single = begin('super-tank');
    expect(count(tap(single, 'rotate'), 'shot')).toBe(1);
    const viaFire = begin('super-tank');
    expect(count(tap(viaFire, 'fire'), 'shot')).toBe(1);
    const a = begin('super-tank', { seed: 4 });
    const b = begin('super-tank', { seed: 4 });
    expect(run(a, 200, hold('up', 'rotate'))).toEqual(run(b, 200, hold('up', 'fire')));
    expect(Array.from(a.cells())).toEqual(Array.from(b.cells()));
  });

  coveredScenario('super-tank', 'прогресс', 'прогресс: танк в центре с зажатым огнём — каждая разрушенная машина +10, каждая пропущенная +1, жизни целы', () => {
    const g = begin('super-tank', { seed: 1 });
    const flow = drive(g, 400, hold('up', 'rotate'));
    expect(g.lives).toBe(4);
    expect(flow.destroyed).toBeGreaterThanOrEqual(3);
    expect(flow.passed).toBeGreaterThanOrEqual(3);
    expect(g.score).toBe(10 * flow.destroyed + flow.passed);
  });

  coveredScenario('super-tank', 'неудача', 'неудача: удар в препятствие на своей полосе без стрельбы стоит жизни ровно в строке общей клетки', () => {
    const row = contactRow((y) => carCells(4, y), playerCells(4));
    expect(row).toBe(16);
    const g = begin('super-tank');
    const car = { x: 4, y: row! - 4, kind: 0 };
    g.obstacles = [car];
    const { events } = runUntil(g, has('lifeLost'), hold('up'));
    expect(car.y).toBe(row);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    expect(count(events, 'hit')).toBe(0);
  });
});

// ── racing-pickup ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('racing-pickup: подбор оружия и стены (сценарии)', () => {
  coveredScenario('racing-pickup', 'прогресс', 'прогресс: две мигающие клетки — выстрел, три — ближний удар (рисунок бонусов)', () => {
    const g = begin('racing-pickup');
    g.obstacles = [{ x: 1, y: 5, kind: 1 }, { x: 7, y: 5, kind: 2 }];
    expect([5, 6, 7].map((y) => lit(g, 1, y))).toEqual([CELL_BLINK, CELL_BLINK, CELL_OFF]);
    expect([5, 6, 7, 8].map((y) => lit(g, 7, y))).toEqual([CELL_BLINK, CELL_BLINK, CELL_BLINK, CELL_OFF]);
  });

  coveredScenario('racing-pickup', 'прогресс', 'прогресс: бонус «выстрел» выдаёт стрельбу: до подбора огонь не стреляет, после подбора стреляет и разрушает машину (+10)', () => {
    const g = begin('racing-pickup');
    const bonus = { x: 4, y: 6, kind: 1 };
    g.obstacles = [bonus];
    const fire = hold('up', 'rotate');
    const pickup = runUntil(g, has('bonus'), fire, 200);
    expect(count(pickup.events, 'shot'), 'без оружия огонь не стреляет').toBe(0);
    expect(bonus.y).toBe(contactRow((y) => [[4, y], [4, y + 1]], playerCells(4))); // подобран в первой строке общей клетки
    expect(g.obstacles.includes(bonus)).toBe(false);
    expect(g.hasGun).toBe(true);
    expect(g.weapon).toBe(1);
    expect(g.score).toBe(0); // подбор очков не даёт
    expect(g.lives).toBe(4);

    // зажатый огонь и без оружия отсчитывает паузу между «выстрелами», поэтому первый выстрел уходит не позже чем через эту паузу
    expect(count(runUntil(g, has('shot'), fire, 30).events, 'shot'), 'после подбора огонь стреляет').toBe(1);
    const car = { x: 4, y: 3, kind: 0 };
    g.obstacles = [car];
    const kill = runUntil(g, () => !g.obstacles.includes(car), fire, 200);
    expect(count(kill.events, 'hit')).toBe(1);
    expect(g.score).toBe(10);
  });

  coveredScenario('racing-pickup', 'прогресс', 'прогресс: бонус «удар» выдаёт ближний удар без выстрела: машина в трёх клетках перед носом разрушается (+10), дальняя — нет', () => {
    const g = begin('racing-pickup');
    const bonus = { x: 4, y: 6, kind: 2 };
    g.obstacles = [bonus];
    const fire = hold('up', 'rotate');
    const events = runUntil(g, has('bonus'), fire, 200).events;
    expect(g.weapon).toBe(2);
    expect(g.hasGun).toBe(false);
    const car = { x: 4, y: 5, kind: 0 };
    g.obstacles = [car];
    let destroyedAt = -1;
    for (let t = 0; t < 120 && destroyedAt < 0; t++) {
      const now = g.step(fire);
      events.push(...now);
      if (!g.obstacles.includes(car)) destroyedAt = car.y;
    }
    // удар достаёт машину, у которой есть клетка в строках 14–16: нижняя клетка машины — в строке y+1, значит y ∈ 13…16
    expect(destroyedAt).toBeGreaterThanOrEqual(13);
    expect(destroyedAt).toBeLessThanOrEqual(16);
    expect(g.obstacles.includes(car)).toBe(false);
    expect(g.score).toBe(10);
    expect(g.lives).toBe(4);
    expect(count(events, 'shot'), 'ближний удар — не выстрел').toBe(0);
    expect(g.shots).toHaveLength(0);
  });

  coveredScenario('racing-pickup', 'прогресс', 'прогресс: выстрел бонус не задевает — бонус остаётся на дороге и подбирается, оружие меняется на выданное им', () => {
    const g = begin('racing-pickup');
    g.hasGun = true;
    g.weapon = 1;
    const bonus = { x: 4, y: 12, kind: 2 }; // «удар» прямо перед носом, огонь зажат
    g.obstacles = [bonus];
    const { events } = runUntil(g, has('bonus'), hold('up', 'rotate'), 100);
    expect(count(events, 'shot')).toBeGreaterThanOrEqual(1);
    expect(count(events, 'hit')).toBe(0);
    expect(g.obstacles.includes(bonus)).toBe(false);
    expect(g.weapon).toBe(2);
    expect(g.score).toBe(0);
    expect(g.lives).toBe(4);
  });

  coveredScenario('racing-pickup', 'прогресс', 'прогресс: ближний удар бонус не задевает — бонус проходит зону удара целым и подбирается', () => {
    const g = begin('racing-pickup');
    g.weapon = 2;
    const bonus = { x: 4, y: 8, kind: 1 }; // «выстрел» едет в зону удара (строки 14–16), огонь зажат
    g.obstacles = [bonus];
    const { events } = runUntil(g, has('bonus'), hold('up', 'rotate'), 100);
    expect(count(events, 'hit')).toBe(0);
    expect(g.hasGun).toBe(true);
    expect(g.weapon).toBe(1);
    expect(g.score).toBe(0);
    expect(g.lives).toBe(4);
  });

  coveredScenario('racing-pickup', 'прогресс', 'прогресс: пока выстрел не выдан, стена не появляется ни в одной из партий; обычные машины и бонусы идут как обычно', () => {
    let observedTicks = 0;
    let spawned = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = begin('racing-pickup', { seed });
      while (g.tick < 1500 && g.phase === 'playing' && !g.hasGun) {
        const before = [...g.obstacles];
        g.step(hold('up'));
        observedTicks++;
        spawned += g.obstacles.filter((o) => !before.includes(o)).length;
        expect(g.obstacles.some((o) => o.kind < 0) && !g.hasGun, `зерно ${seed}, такт ${g.tick}: стена без выданного выстрела`).toBe(false);
      }
    }
    expect(observedTicks).toBeGreaterThan(2000);
    expect(spawned).toBeGreaterThan(60);
  });

  coveredScenario('racing-pickup', 'прогресс', 'прогресс: после выданного выстрела стены появляются и рушатся выстрелом — игрок с зажатым огнём не теряет жизни', () => {
    let wallsSeen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = begin('racing-pickup', { seed });
      const bonus = { x: 4, y: 12, kind: 1 };
      g.obstacles = [bonus]; // выстрел выдаёт настоящий подбор
      runUntil(g, has('bonus'), hold('up', 'rotate'), 100);
      expect(g.hasGun).toBe(true);
      const walls = new Set<RoadObstacle>();
      drive(g, 1200, hold('up', 'rotate'), () => {
        for (const o of g.obstacles) if (o.kind < 0) walls.add(o);
      });
      expect(g.lives, `зерно ${seed}`).toBe(4);
      for (const wall of walls) if (!g.obstacles.includes(wall)) expect(wall.y, `зерно ${seed}: стена рухнула, а не проехала`).toBeLessThan(16);
      wallsSeen += walls.size;
    }
    expect(wallsSeen).toBeGreaterThan(30);
  });

  coveredScenario('racing-pickup', 'прогресс', 'прогресс: если после выстрела подобран ещё и ближний удар, выстрел остаётся — стена по-прежнему разрушаема', () => {
    const g = begin('racing-pickup');
    g.obstacles = [{ x: 4, y: 8, kind: 1 }, { x: 4, y: 2, kind: 2 }];
    const bonuses = runUntil(g, () => g.weapon === 2 && g.hasGun, hold('up'), 300).events;
    expect(count(bonuses, 'bonus')).toBe(2); // сперва выстрел, потом удар
    expect(g.lives).toBe(4);
    const wall = { x: 7, y: 10, kind: -1 };
    g.obstacles = [wall];
    const { events } = runUntil(g, () => !g.obstacles.includes(wall), hold('up', 'rotate'), 200);
    expect(count(events, 'hit')).toBe(1);
    expect(count(events, 'lifeLost')).toBe(0);
    expect(wall.y).toBeLessThan(16); // рухнула до строки столкновения
    expect(g.score).toBe(10);
    expect(g.lives).toBe(4);
  });

  coveredScenario('racing-pickup', 'неудача', 'неудача: пока оружие не подобрано, огонь бесполезен — машина в зоне удара не разрушается и стоит жизни', () => {
    const g = begin('racing-pickup');
    expect(g.weapon).toBe(0);
    expect(g.hasGun).toBe(false);
    const car = { x: 4, y: 8, kind: 0 };
    g.obstacles = [car];
    const { events } = runUntil(g, has('lifeLost'), hold('up', 'rotate'));
    expect(car.y).toBe(contactRow((y) => carCells(4, y), playerCells(4))); // проехала всю зону удара (строки 14–16) целой
    expect(count(events, 'hit')).toBe(0);
    expect(count(events, 'shot')).toBe(0);
    expect(g.score).toBe(0);
    expect(g.lives).toBe(3);
  });

  coveredScenario('racing-pickup', 'неудача', 'неудача: ближний удар стену не разрушает — стена доезжает до строки общей клетки и стоит жизни', () => {
    const row = contactRow(wallCells, playerCells(4));
    expect(row).toBe(16);
    const g = begin('racing-pickup');
    g.weapon = 2; // только ближний удар (выстрела нет — в игре стена в таком состоянии не возникает, поэтому оно подготовлено)
    g.hasGun = false;
    const wall = { x: 4, y: 9, kind: -1 };
    g.obstacles = [wall];
    const { events } = runUntil(g, has('lifeLost'), hold('up', 'rotate'));
    expect(wall.y).toBe(row);
    expect(count(events, 'hit')).toBe(0);
    expect(count(events, 'shot')).toBe(0);
    expect(g.score).toBe(0);
    expect(g.lives).toBe(3);
  });

  coveredScenario('racing-pickup', 'неудача', 'неудача: оружие есть, но игрок не стреляет — стена и обычная машина всё равно стоят жизни', () => {
    for (const kind of [-1, 0]) {
      const g = begin('racing-pickup');
      g.hasGun = true;
      g.weapon = 1;
      g.obstacles = [{ x: 4, y: 9, kind }];
      const { events } = runUntil(g, has('lifeLost'), hold('up'));
      expect(count(events, 'shot'), `kind ${kind}`).toBe(0);
      expect(g.lives, `kind ${kind}`).toBe(3);
    }
  });
});

// ── punch-racing ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('punch-racing: ближний удар (сценарии)', () => {
  /** Три клетки перед носом: строки 14–16 в колонках носа и по соседству (x−1…x+1). */
  const zone = (x: number): Cell[] => [14, 15, 16].flatMap((y) => [x - 1, x, x + 1].map((cx): Cell => [cx, y]));

  coveredScenario('punch-racing', 'прогресс', 'прогресс: удар достаёт машину, у которой есть клетка в трёх клетках перед носом, и только её: +10 и событие попадания', () => {
    for (const cx of [1, 2, 4, 6, 7]) {
      for (let y = 6; y <= 16; y++) {
        const g = begin('punch-racing'); // машина игрока в колонке 4
        g.obstacles = [{ x: cx, y, kind: 0 }];
        const events = g.step(makeBrickInput(['rotate']));
        const expected = touch(carCells(cx, y), zone(4));
        expect(g.obstacles.length === 0, `машина (${cx},${y})`).toBe(expected);
        expect(count(events, 'hit'), `машина (${cx},${y})`).toBe(expected ? 1 : 0);
        expect(g.score, `машина (${cx},${y})`).toBe(expected ? 10 : 0);
        expect(g.lives).toBe(4);
      }
    }
  });

  coveredScenario('punch-racing', 'прогресс', 'прогресс: удар работает без выстрела — «дальнего выстрела нет»: ни событий, ни снарядов', () => {
    const g = begin('punch-racing');
    const events = run(g, 200, hold('up', 'rotate'));
    expect(count(events, 'shot')).toBe(0);
    expect(g.shots).toHaveLength(0);
    const viaFire = begin('punch-racing');
    expect(run(viaFire, 200, hold('up', 'fire'))).toEqual(events); // FIRE ведёт себя как ROTATE
  });

  coveredScenario('punch-racing', 'прогресс', 'прогресс: машина с зажатым ударом бьёт приближающиеся машины: +10 за разрушенную, +1 за проехавшую, жизни целы', () => {
    const g = begin('punch-racing', { seed: 1 });
    const flow = drive(g, 400, hold('up', 'rotate'));
    expect(g.lives).toBe(4);
    expect(flow.destroyed).toBeGreaterThanOrEqual(3);
    expect(flow.passed).toBeGreaterThanOrEqual(3);
    expect(g.score).toBe(10 * flow.destroyed + flow.passed);
  });

  coveredScenario('punch-racing', 'неудача', 'неудача: без удара столкновение стоит жизни ровно в строке общей клетки; машина с другой стороны от зоны удара не мешает', () => {
    const row = contactRow((y) => carCells(4, y), playerCells(4));
    expect(row).toBe(16);
    const g = begin('punch-racing');
    const car = { x: 4, y: row! - 4, kind: 0 };
    g.obstacles = [car];
    const { events } = runUntil(g, has('lifeLost'), hold('up'));
    expect(car.y).toBe(row);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    expect(count(events, 'hit')).toBe(0);
  });
});

// ── общие правила: переход на уровень, потеря жизни, конец партии ────────────────────────────────────────────────────────────────

describe('дорожные игры: тридцатое препятствие открывает следующий уровень', () => {
  /** Машина игрока `x` и полоса `away`, на которой препятствие проезжает мимо, не задевая игрока. */
  const cases = [
    { id: 'boat-racing', x: 4, away: 1 },
    { id: 'racing-four', x: 3, away: 7 },
    { id: 'super-tank', x: 4, away: 7 },
    { id: 'racing-pickup', x: 4, away: 1 },
    { id: 'punch-racing', x: 4, away: 7 },
  ] as const;

  for (const { id, x, away } of cases) {
    it(`${id}: двадцать девятое препятствие — просто +1, тридцатое — победа (+100), уровень 2 и свежее поле`, () => {
      const g = begin(id);
      g.x = x;
      g['passed'] = 28; // двадцать восемь уже позади
      g.obstacles = [{ x: away, y: 20, kind: 0 }, { x: away, y: 14, kind: 0 }]; // выезжают за нижний край друг за другом
      const first = runUntil(g, () => g.score >= 1, hold('up'), 100);
      expect(first.events.some((e) => e.type === 'win'), 'двадцать девятое победы не даёт').toBe(false);
      expect(g.score).toBe(1);
      expect(g.level).toBe(1);
      const second = runUntil(g, has('win'), hold('up'), 200);
      expect(count(second.events, 'win')).toBe(1);
      expect(g.score).toBe(1 + 1 + 100);
      expect(g.lives).toBe(4);

      const { events } = runUntil(g, has('levelUp'), NEUTRAL_BRICK_INPUT, 200);
      expect(count(events, 'levelUp')).toBe(1);
      expect(g.level).toBe(2);
      expect(g.score).toBe(102);
      expect(g.obstacles).toHaveLength(0);
      expect(g.shots).toHaveLength(0);
      expect(g['passed']).toBe(0); // счёт препятствий нового уровня идёт заново
    });
  }
});

describe('дорожные игры: потеря жизни и конец партии', () => {
  /** Неминуемое столкновение: препятствие на своей полосе (у извилистой трассы — шаг в стенку); доигрывает до потери жизни. */
  const collide = (g: RoadGame): BrickEvent[] => {
    if (g.id === 'obstacle-race') return tap(g, 'left'); // из колонки 4 в колонку 3: левая нижняя клетка машины на стенке (2,19)
    const lane = g.id === 'racing-four' ? 3 : 4;
    g.x = lane;
    g.obstacles = [{ x: lane, y: 10, kind: 0 }];
    return runUntil(g, has('lifeLost'), hold('up')).events;
  };
  const snapshot = (g: RoadGame): string => JSON.stringify([g.x, g.road, g.obstacles, g.shots]);

  for (const id of SCENARIO_GAMES) {
    it(`${id}: после столкновения поле замирает на сценку, затем начинается заново, жизнь одна потеряна, игра продолжается`, () => {
      const g = begin(id);
      g.score = 7; // заработанное до аварии
      const events = collide(g);
      expect(count(events, 'lifeLost')).toBe(1);
      expect(g.lives).toBe(3);
      expect(g.phase).toBe('playing');
      expect(g.preview()!.filter(Boolean)).toHaveLength(2 * 3); // каждая жизнь — пара клеток в превью

      const frozen = snapshot(g);
      let pause = 0;
      while (snapshot(g) === frozen && pause < 300) {
        g.step(hold('up')); // во время сценки ввод не действует
        pause++;
      }
      expect(pause).toBeGreaterThan(1);
      expect(pause).toBeLessThan(300);
      expect(g.x).toBe(id==='racing-four'?3:4);
      expect(g.road.every((v) => v === 2)).toBe(true);
      expect(g.obstacles).toHaveLength(0);
      expect(g.shots).toHaveLength(0);
      expect(g.score).toBe(7);
      expect(g.lives).toBe(3);

      run(g, 12, hold('up')); // игра идёт дальше: дорога движется
      expect(g.score > 7 || g.obstacles.length > 0).toBe(true);
      expect(g.phase).toBe('playing');
    });

    it(`${id}: столкновение на последней жизни заканчивает партию — gameOver, заливка поля, фаза over, рекорд сохранён, старт даёт новую партию`, () => {
      const g = begin(id, { hiScore: 3 });
      g.lives = 1;
      g.score = 7;
      const events = collide(g);
      expect(count(events, 'lifeLost')).toBe(1);
      expect(count(events, 'gameOver')).toBe(1);
      expect(g.lives).toBe(0);
      expect(g.phase).toBe('playing'); // заливка поля ещё идёт

      const after = runUntil(g, () => g.phase === 'over', NEUTRAL_BRICK_INPUT, 300).events;
      expect(count(after, 'gameOver')).toBe(0);
      expect(g.overFill).toBe(20);
      expect(g.score).toBe(7);
      expect(g.hiScore).toBe(7);
      expect(g.step(makeBrickInput(['left', 'rotate']))).toEqual([]); // после конца партии ввод ничего не делает

      expect(count(g.start(), 'started')).toBe(1);
      expect(g.phase).toBe('playing');
      expect(g.lives).toBe(4);
      expect(g.score).toBe(0);
      expect(g.level).toBe(1);
      expect(g.hiScore).toBe(7);
      expect(g.obstacles).toHaveLength(0);
    });
  }
});
