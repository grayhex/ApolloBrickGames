import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  CLEAR_LOSE_TICKS,
  CLEAR_WIN_TICKS,
  GAME_OVER_HOLD_TICKS,
  GAME_OVER_TICKS_PER_ROW,
  NEUTRAL_BRICK_INPUT,
  genuineTicks,
  livesPreview,
  makeBrickInput,
  msToTicks,
  type BrickAction,
  type BrickEvent,
  type BrickGameOptions,
  type BrickInput,
} from '../../../src/brick';
import { ARKANOID_MODES, ArkanoidGame, arkanoidDef, arkanoidVariant } from '../../../src/brick/games/arkanoid';
import { PRELOADED_WALLS, WALL_WIDTH, generatedWallHeight } from '../../../src/brick/games/arkanoid/wall';
import { conformance } from '../conformance';

// ---------------------------------------------------------------- помощники

/** «Мелодия» перед уровнем: 1500 мс. */
const INTRO = msToTicks(1500);
/** Взрыв: четыре прохода по семи волнам по 4 такта. */
const KABOOM = 4 * 7 * 4;
const GAME_OVER_TICKS = BRICK_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS;
/** Любое большое число тактов: «таймер никогда не сработает». */
const NEVER = 1_000_000;
/** Кирпичей в готовых стенах по уровням 1..10 (считано по таблице донора). */
const BRICKS_PER_LEVEL = [48, 54, 68, 56, 54, 56, 60, 56, 56, 45];

const make = (mode = 0, options: BrickGameOptions = {}): ArkanoidGame => new ArkanoidGame({ seed: 7, mode, ...options });

function idle(game: ArkanoidGame, ticks: number): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
  return events;
}

/** Игра запущена, «мелодия» отыграла: следующий такт — первый шаг мяча. */
function ready(mode = 0, options: BrickGameOptions = {}): ArkanoidGame {
  const game = make(mode, options);
  game.start();
  idle(game, INTRO);
  return game;
}

/** Игра с остановленными мячом и сдвигом стены: тест сам расставляет мяч и вызывает `ballStep`. */
function still(mode = 0, options: BrickGameOptions = {}): ArkanoidGame {
  const game = ready(mode, options);
  game['ballClock'] = 0;
  game['shiftLeft'] = NEVER;
  return game;
}

/** Рисунок поля строками, как на экране: верх — первая строка. */
function rows(game: ArkanoidGame): string[] {
  const cells = game.cells();
  const out: string[] = [];
  for (let y = 0; y < BRICK_ROWS; y++) {
    let line = '';
    for (let x = 0; x < BRICK_COLS; x++) line += cells[y * BRICK_COLS + x] ? '#' : '.';
    out.push(line);
  }
  return out;
}

const litCount = (line: string | undefined): number => (line ?? '').split('#').length - 1;

/** Положение и направление мяча в системе донора: `y` = 0 — нижний ряд, +1 — вправо / вверх. */
const ball = (game: ArkanoidGame): { x: number; y: number; dx: number; dy: number } => ({
  x: game['ballX'],
  y: game['ballY'],
  dx: game['dirX'],
  dy: game['dirY'],
});

/** Поставить мяч в клетку донора `(x, y)` с направлением `(dx, dy)`. */
function place(game: ArkanoidGame, x: number, y: number, dx: number, dy: number): void {
  game['drawBall'](x, y);
  game['dirX'] = dx;
  game['dirY'] = dy;
}

/** Ровно один шаг мяча по таймеру (за один такт) и события такта. */
function ballStep(game: ArkanoidGame, input: BrickInput = NEUTRAL_BRICK_INPUT): BrickEvent[] {
  game['introLeft'] = 0;
  game['ballClock'] = 1 << 20;
  return game.step(input);
}

const types = (events: readonly BrickEvent[]): string[] => events.map((event) => event.type);

/** Нажать кнопки в одном такте и сразу отпустить. */
const tap = (...actions: BrickAction[]): BrickInput => makeBrickInput(actions);

/** Разобрать всю стену, кроме одного кирпича `(x, wy)` в координатах стены (`wy` = 0 — нижний ряд стены). */
function clearWallExcept(game: ArkanoidGame, keepX: number, keepWy: number): void {
  const wall = game['wall'];
  for (let wy = 0; wy < wall.height; wy++) {
    for (let x = 0; x < WALL_WIDTH; x++) if (x !== keepX || wy !== keepWy) wall.breakBrick(x, wy);
  }
  game['insertWall']();
}

/** Пройти сценки (взрыв, очистку) до их конца, но не больше `max` тактов; вернуть все события. */
function finishScenes(game: ArkanoidGame, max = 1000): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < max && game.phase === 'playing' && game['busy']; i++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
  return events;
}

// ---------------------------------------------------------------- общие проверки

conformance(arkanoidDef, { fuzzTicks: 2000 });

// ---------------------------------------------------------------- варианты

describe('арканоид: варианты', () => {
  it('32 варианта, на устройстве заявлено 32; названия и пометки разные', () => {
    expect(arkanoidDef.id).toBe('arkanoid');
    expect(arkanoidDef.declaredModes).toBe(32);
    expect(arkanoidDef.modes).toHaveLength(32);
    expect(arkanoidDef.modes).toBe(ARKANOID_MODES);
    expect(new Set(ARKANOID_MODES.map((mode) => mode.name.ru)).size).toBe(32);
    expect(new Set(ARKANOID_MODES.map((mode) => mode.name.en)).size).toBe(32);
    for (const mode of ARKANOID_MODES) expect(mode.note).toContain('Допущение');
  });

  it('признаки вариантов: платформа 4/3/2/1, готовые/случайные стены, сдвиг, две платформы — по таблице донора', () => {
    // порядок донора (типы 1..32): платформа меняется чаще всего, затем сдвиг, затем две стороны, затем вид стен
    for (let index = 0; index < 32; index++) {
      const variant = arkanoidVariant(index);
      expect(variant.cells, `вариант ${index + 1}`).toBe([4, 3, 2, 1][index % 4]);
      expect(variant.platformType).toBe(variant.cells - 1);
      expect(variant.shifting, `вариант ${index + 1}`).toBe(Math.floor(index / 4) % 2 === 1);
      expect(variant.doubleSided, `вариант ${index + 1}`).toBe(Math.floor(index / 8) % 2 === 1);
      expect(variant.preloaded, `вариант ${index + 1}`).toBe(index < 16);
    }
  });

  it('в начале партии каждый из 32 вариантов выглядит по-своему', () => {
    const seen = new Set<string>();
    for (let mode = 0; mode < 32; mode++) {
      const game = make(mode);
      game.start();
      idle(game, 30); // стена сдвинулась в первом такте
      seen.add(rows(game).join('/'));
    }
    expect(seen.size).toBe(32);
  });

  it('размер платформы: 4, 3, 2 и 1 клетка на нижней строке по центру', () => {
    const expected = ['...####...', '...###....', '....##....', '....#.....'];
    expected.forEach((line, mode) => {
      expect(rows(make(mode))[BRICK_ROWS - 1], `вариант ${mode + 1}`).toBe(line);
    });
  });

  it('двухсторонние варианты: платформа и сверху, а стена стоит посередине поля', () => {
    const single = rows(make(0));
    expect(single[0]).toBe(PRELOADED_WALLS[0]?.[0]); // стена прижата к верху
    const double = rows(make(8)); // платформа 4, готовые стены, две стороны
    expect(double[0]).toBe('...####...');
    expect(double[BRICK_ROWS - 1]).toBe('...####...');
    // стена уровня 1 (8 рядов): нижний ряд донора (20 - 8) / 2 = 6, то есть на экране ряды 6..13
    expect(double.slice(6, 14)).toEqual(PRELOADED_WALLS[0]);
    expect(double.slice(1, 6).every((line) => litCount(line) === 0)).toBe(true);
    // 4 клетки платформы и мяч над нижней платформой
    expect(double[BRICK_ROWS - 2]).toBe('....#.....');
  });

  it('жизни: четыре, в превью — пары клеток', () => {
    const game = make();
    expect(game.lives).toBe(4);
    expect([...(game.preview() ?? [])]).toEqual([...livesPreview(4)]);
  });
});

// ---------------------------------------------------------------- стены

describe('арканоид: стены кирпичей', () => {
  it('готовые стены уровней 1..10 лежат вверху поля и совпадают с таблицей донора', () => {
    expect(PRELOADED_WALLS).toHaveLength(10);
    PRELOADED_WALLS.forEach((wall, index) => {
      const game = make(0, { level: index + 1 });
      expect(rows(game).slice(0, wall.length), `уровень ${index + 1}`).toEqual(wall);
      const total = wall.join('').split('#').length - 1;
      expect(total, `кирпичей на уровне ${index + 1}`).toBe(BRICKS_PER_LEVEL[index]);
      expect(game['wall'].remaining).toBe(total);
      expect(wall.every((line) => line.length === WALL_WIDTH)).toBe(true);
    });
  });

  it('готовая стена уровня 1: ряд донора `preloadedBricks[1]` читается сверху вниз', () => {
    const game = make();
    expect(rows(game).slice(0, 3)).toEqual(['.#.#..#.#.', '..#....#..', '.###..###.']);
    expect(rows(game)[7]).toBe('...####...');
  });

  it('случайные стены: высота `уровень / 2 + 5`, зеркальны слева направо, кирпичей примерно две трети', () => {
    for (let level = 1; level <= 10; level++) {
      const height = Math.floor(level / 2) + 5;
      expect(generatedWallHeight(level)).toBe(height);
      const game = make(16, { level, seed: 11 });
      const wall = rows(game).slice(0, height);
      for (const line of wall) expect(line).toBe([...line].reverse().join(''));
      expect(game['wall'].height).toBe(height);
      expect(rows(game)[height]).toBe('..........'); // под стеной пусто
    }
    let bricks = 0;
    let cells = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const game = make(16, { level: 5, seed });
      bricks += game['wall'].remaining;
      cells += 10 * game['wall'].height;
    }
    expect(bricks / cells).toBeGreaterThan(0.55);
    expect(bricks / cells).toBeLessThan(0.78);
  });

  it('случайная стена: счётчик кирпичей совпадает с рисунком; повторяется по зерну; у разных зёрен разная; бывает симметрия сверху вниз', () => {
    const picture = (seed: number): string => rows(make(16, { seed, level: 2 })).slice(0, 6).join('/');
    expect(picture(5)).toBe(picture(5));
    expect(new Set([1, 2, 3, 4, 5, 6].map(picture)).size).toBeGreaterThan(3);
    let mirrored = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const game = make(16, { seed, level: 4 }); // высота 7: ряды 0..2 и 4..6 зеркальны, 3 — середина
      expect(game['wall'].remaining).toBe(rows(game).slice(0, 7).join('').split('#').length - 1);
      const wall = rows(game).slice(0, 7);
      if (wall[0] === wall[6] && wall[1] === wall[5] && wall[2] === wall[4]) mirrored++;
    }
    // шанс 1/3 на симметрию плюс случайные совпадения
    expect(mirrored).toBeGreaterThan(8);
    expect(mirrored).toBeLessThan(40);
  });

  it('новая стена на каждом уровне у вариантов со случайными стенами (зерно ГСЧ идёт дальше)', () => {
    const game = still(16, { seed: 3 });
    const first = rows(game).slice(0, 6).join('/');
    clearWallExcept(game, 4, 3);
    place(game, 3, game['bricksY'] - 1, 1, 1);
    expect(types(ballStep(game))).toContain('win');
    finishScenes(game);
    expect(game.level).toBe(2);
    expect(game['wall'].height).toBe(generatedWallHeight(2));
    expect(rows(game).slice(0, 6).join('/')).not.toBe(first);
  });
});

// ---------------------------------------------------------------- платформа

describe('арканоид: платформа', () => {
  it('влево и вправо на клетку; у края останавливается; события `move`', () => {
    const game = make(0);
    game.start();
    expect(game['curX']).toBe(4);
    const left = game.step(tap('left'));
    expect(game['curX']).toBe(3);
    expect(types(left)).toEqual(['started', 'move'].slice(1));
    expect(rows(game)[BRICK_ROWS - 1]).toBe('..####....');
    game.step(tap('right'));
    game.step(NEUTRAL_BRICK_INPUT);
    game.step(tap('right'));
    expect(game['curX']).toBe(5);
    expect(rows(game)[BRICK_ROWS - 1]).toBe('....####..');
    // правый упор: платформа из 4 клеток от 3 до 6 ... до 6..9, то есть центр не дальше 7
    for (let i = 0; i < 20; i++) game.step(tap('right'));
    expect(game['curX']).toBe(7);
    expect(rows(game)[BRICK_ROWS - 1]).toBe('......####');
    expect(types(game.step(tap('right')))).toEqual([]); // упёрлась: ни сдвига, ни звука
    // левый упор: центр не левее 1
    for (let i = 0; i < 30; i++) game.step(tap('left'));
    expect(game['curX']).toBe(1);
    expect(rows(game)[BRICK_ROWS - 1]).toBe('####......');
  });

  it('у платформы из одной клетки края поля — 0 и 9', () => {
    const game = make(3);
    game.start();
    for (let i = 0; i < 30; i++) game.step(tap('left'));
    expect(game['curX']).toBe(0);
    expect(rows(game)[BRICK_ROWS - 1]).toBe('#.........');
    for (let i = 0; i < 40; i++) game.step(tap('right'));
    expect(game['curX']).toBe(9);
    expect(rows(game)[BRICK_ROWS - 1]).toBe('.........#');
  });

  it('зажатая кнопка двигает платформу с периодом донора: 30, 38, 45 и 53 мс = 2, 2, 3 и 3 такта', () => {
    const period = [2, 2, 3, 3];
    period.forEach((expected, mode) => {
      expect(msToTicks(Math.round(30 * (1.75 - (3 - mode) * 0.25)))).toBe(expected);
      const game = make(mode);
      game.start();
      const at: number[] = [];
      let last = game['curX'];
      for (let t = 0; t < 8; t++) {
        game.step(makeBrickInput(t === 0 ? ['right'] : [], ['right']));
        if (game['curX'] !== last) at.push(t);
        last = game['curX'];
      }
      expect(at.slice(0, 3), `вариант ${mode + 1}`).toEqual([0, expected, expected * 2]);
    });
  });

  it('кнопки вверх и вниз в арканоиде ничего не делают', () => {
    const a = ready(0);
    const b = ready(0);
    for (let i = 0; i < 40; i++) {
      a.step(makeBrickInput(['up', 'down'], ['up', 'down']));
      b.step(NEUTRAL_BRICK_INPUT);
    }
    expect(rows(a)).toEqual(rows(b));
    expect(a.score).toBe(b.score);
  });

  it('пока играет «мелодия» (90 тактов), мяч стоит на платформе и едет вместе с ней', () => {
    const game = make(0);
    game.start();
    expect(INTRO).toBe(90);
    expect(ball(game)).toEqual({ x: 4, y: 1, dx: 1, dy: 1 });
    for (let t = 0; t < 8; t++) game.step(makeBrickInput(t === 0 ? ['left'] : [], ['left']));
    expect(game['curX']).toBe(1);
    expect(game['ballX']).toBe(1);
    expect(game['ballY']).toBe(1);
    expect(rows(game)[BRICK_ROWS - 2]).toBe('.#........');
    // остаток вступления: мяч не двигается, пока таймер не отсчитал 90 тактов
    idle(game, INTRO - 8 - 1);
    expect(game['ballY']).toBe(1);
    game.step(NEUTRAL_BRICK_INPUT); // 90-й такт: мелодия доиграла
    expect(game['ballY']).toBe(1);
    game.step(NEUTRAL_BRICK_INPUT); // первый шаг сразу после мелодии
    expect(ball(game)).toEqual({ x: 2, y: 2, dx: 1, dy: 1 });
    // после старта мяч уже не едет за платформой
    game.step(tap('right'));
    expect(game['curX']).toBe(2);
    expect(game['ballX']).toBe(2);
  });

  it('мяч, вернувшийся на платформу, можно сдвинуть вместе с ней в такт отскока', () => {
    const game = still(0);
    place(game, 5, 2, 1, -1);
    ballStep(game); // (6,1) — над платформой 3..6
    expect(ball(game)).toEqual({ x: 6, y: 1, dx: 1, dy: -1 });
    ballStep(game); // отскок: мяч остаётся, летит вверх
    expect(ball(game)).toEqual({ x: 6, y: 1, dx: -1, dy: 1 });
    game.step(tap('left')); // платформа 3..6 -> 2..5; мяч (6,1) уже не над ней? Он над клеткой 6, платформа теперь 2..5
    expect(game['curX']).toBe(3);
    expect(game['ballX']).toBe(6); // не на платформе: остался на месте
    game.step(tap('right'));
    expect(game['curX']).toBe(4);
    expect(game['ballX']).toBe(7); // платформа 3..6 -> 4..7... мяч (6,1) над ней, поэтому едет: 6 + 1
  });
});

// ---------------------------------------------------------------- мяч

describe('арканоид: ход мяча', () => {
  it('мяч стартует с платформы вверх и вправо и шагает по диагонали', () => {
    const game = ready(0);
    expect(ball(game)).toEqual({ x: 4, y: 1, dx: 1, dy: 1 });
    game.step(NEUTRAL_BRICK_INPUT);
    expect(ball(game)).toEqual({ x: 5, y: 2, dx: 1, dy: 1 });
    idle(game, 14);
    expect(ball(game)).toEqual({ x: 6, y: 3, dx: 1, dy: 1 });
    // рисунок: мяч на экране на 19 - y
    expect(rows(game)[BRICK_ROWS - 1 - 3][6]).toBe('#');
    expect(rows(game)[BRICK_ROWS - 1 - 2][5]).toBe('.');
  });

  it('период шага мяча: «настоящая» скорость донора, умноженная на 1,2 - 0,2 * тип платформы; у двухсторонних + 30 мс', () => {
    const measure = (mode: number, speed: number): number => {
      const game = ready(mode, { speed });
      const moves: number[] = [];
      let last = ball(game);
      for (let t = 1; t <= 120 && moves.length < 2; t++) {
        game.step(NEUTRAL_BRICK_INPUT);
        const now = ball(game);
        if (now.x !== last.x || now.y !== last.y) moves.push(t);
        last = now;
      }
      expect(moves[0]).toBe(1);
      return (moves[1] ?? 0) - (moves[0] ?? 0);
    };
    const factor = [0.6, 0.8, 1.0, 1.2];
    for (const speed of [1, 4, 10]) {
      for (let mode = 0; mode < 4; mode++) {
        const expected = Math.max(1, Math.round(genuineTicks(speed, 400, 80) * (factor[mode] ?? 1)));
        expect(measure(mode, speed), `вариант ${mode + 1}, скорость ${speed}`).toBe(expected);
        // двухсторонний вариант (типы 9..12): ещё 30 мс = 2 такта
        expect(measure(8 + mode, speed), `вариант ${9 + mode}, скорость ${speed}`).toBe(expected + 2);
      }
    }
    expect(genuineTicks(1, 400, 80)).toBe(24);
    expect(genuineTicks(10, 400, 80)).toBe(5);
  });

  it('отскок от боковых стен поля', () => {
    const game = still(0);
    place(game, 9, 5, 1, 1);
    const events = ballStep(game);
    expect(ball(game)).toEqual({ x: 8, y: 6, dx: -1, dy: 1 });
    expect(types(events)).toEqual(['rotate']);
    place(game, 0, 8, -1, -1);
    ballStep(game);
    expect(ball(game)).toEqual({ x: 1, y: 7, dx: 1, dy: -1 });
  });

  it('отскок от верхней границы поля (без верхней платформы) и угловой отскок', () => {
    const game = still(0);
    game['wall'].breakBrick(0, 0); // не нужен: мяч идёт вдоль самого верха пустого поля
    clearWallExcept(game, 5, 7);
    place(game, 3, 19, 1, 1);
    const events = ballStep(game);
    expect(ball(game)).toEqual({ x: 4, y: 18, dx: 1, dy: -1 });
    expect(types(events)).toContain('rotate');
    // угол: и вправо, и вверх сразу
    place(game, 9, 19, 1, 1);
    ballStep(game);
    expect(ball(game)).toEqual({ x: 8, y: 18, dx: -1, dy: -1 });
  });

  it('в двухсторонних вариантах верх поля не отражает мяч, если там нет платформы, и мяч за верхним краем — потеря жизни', () => {
    const game = still(8);
    place(game, 9, 19, 1, 1); // мяч в клетке верхнего ряда вне платформы (3..6)
    ballStep(game);
    expect(game.lives).toBe(4); // жизнь отнимется в конце взрыва
    expect(game['busy']).toBe(true);
    expect(finishScenes(game).map((event) => event.type)).toContain('lifeLost');
    expect(game.lives).toBe(3);
  });

  it('верхняя платформа двухстороннего варианта отражает мяч, как нижняя', () => {
    const game = still(8);
    clearWallExcept(game, 0, 0);
    place(game, 4, 17, 1, 1);
    ballStep(game); // (5,18) под верхней платформой 3..6 не доходит до её клетки
    expect(ball(game)).toEqual({ x: 5, y: 18, dx: 1, dy: 1 });
    const events = ballStep(game); // (6,19) занято платформой: отскок на месте
    expect(ball(game)).toEqual({ x: 5, y: 18, dx: 1, dy: -1 });
    expect(types(events)).toContain('rotate');
  });

  it('платформа отражает мяч вертикально, угол 45° всегда сохраняется (донор угол не меняет)', () => {
    for (const x of [3, 4, 5, 6]) {
      for (const dx of [-1, 1]) {
        const game = still(0); // платформа 3..6
        place(game, x, 1, dx, -1);
        const events = ballStep(game);
        // мяч стоит на месте, а вертикаль развернулась; горизонталь не изменилась
        expect(ball(game), `x = ${x}, dx = ${dx}`).toEqual({ x, y: 1, dx, dy: 1 });
        expect(types(events)).toEqual(['rotate']);
      }
    }
  });

  it('край платформы (мяч касается её вершиной): мяч возвращается по той же диагонали', () => {
    const game = still(0); // платформа 3..6
    place(game, 7, 1, -1, -1);
    ballStep(game); // вершина (6,0) — платформа
    expect(ball(game)).toEqual({ x: 7, y: 1, dx: 1, dy: 1 });
    place(game, 2, 1, 1, -1);
    ballStep(game); // вершина (3,0)
    expect(ball(game)).toEqual({ x: 2, y: 1, dx: -1, dy: 1 });
    ballStep(game);
    expect(ball(game)).toEqual({ x: 1, y: 2, dx: -1, dy: 1 });
  });

  it('мимо платформы мяч падает: шаг на нижний ряд, затем потеря жизни', () => {
    const game = still(0);
    place(game, 8, 1, 1, -1);
    ballStep(game);
    expect(ball(game)).toEqual({ x: 9, y: 0, dx: 1, dy: -1 }); // мимо платформы 3..6 — уже на нижнем ряду
    expect(game['busy']).toBe(false);
    ballStep(game);
    expect(game['busy']).toBe(true);
    expect(game.lives).toBe(4);
  });

  it('мяч бьёт платформу сбоку: горизонталь меняется, а вертикаль нет', () => {
    const game = still(0); // платформа 3..6
    place(game, 7, 0, -1, 1); // мяч на нижнем ряду справа от платформы летит влево-вверх
    const events = ballStep(game);
    expect(ball(game)).toEqual({ x: 7, y: 0, dx: 1, dy: 1 });
    expect(types(events)).toEqual(['rotate']);
  });
});

// ---------------------------------------------------------------- кирпичи

describe('арканоид: кирпичи и очки', () => {
  it('удар снизу: кирпич разбит, очко, звук `hit`, мяч отскочил и остался на месте', () => {
    const game = still(0);
    // нижний ряд стены уровня 1 '...####...' лежит в клетках y = 12, x = 3..6
    place(game, 5, 11, 1, 1);
    const before = game['wall'].remaining;
    const events = ballStep(game);
    expect(types(events)).toEqual(['hit']);
    expect(game.score).toBe(1);
    expect(game['wall'].remaining).toBe(before - 1);
    expect(ball(game)).toEqual({ x: 5, y: 11, dx: 1, dy: -1 });
    // кирпич (5, 12) погас на экране: ряд 7 = 19 - 12
    expect(rows(game)[7]).toBe('...##.#...');
  });

  it('удар вершиной: кирпич по диагонали разбит, мяч возвращается', () => {
    const game = still(0);
    place(game, 2, 11, 1, 1); // по бокам (3,11) и (2,12) пусто, по диагонали (3,12) — кирпич
    ballStep(game);
    expect(game.score).toBe(1);
    expect(ball(game)).toEqual({ x: 2, y: 11, dx: -1, dy: -1 });
    expect(rows(game)[7]).toBe('....###...');
  });

  it('удар боком: кирпич разбит, горизонталь развернулась, вертикаль нет', () => {
    const game = still(0);
    // ряд y = 12 -> '...####...'; мяч слева от кирпича (3,12) идёт вправо-вниз, снизу пусто
    place(game, 2, 12, 1, -1);
    ballStep(game);
    expect(game.score).toBe(1);
    expect(ball(game)).toEqual({ x: 2, y: 12, dx: -1, dy: -1 });
    expect(rows(game)[7]).toBe('....###...');
  });

  it('мяч в проёме между двумя кирпичами бьёт сразу два: по горизонтали и по вертикали', () => {
    const game = still(0);
    // экранный ряд 4 = y 15: '###.##.###' — в клетке (3,15) пусто; справа (4,15) и сверху (3,16) — кирпичи
    place(game, 3, 15, 1, 1);
    const events = ballStep(game);
    expect(types(events)).toEqual(['hit', 'hit']);
    expect(game.score).toBe(2);
    expect(ball(game)).toEqual({ x: 3, y: 15, dx: -1, dy: -1 });
  });

  it('очки идут по кирпичу, пока их не станет 1000: тогда добавочная жизнь (при четырёх — +100 очков)', () => {
    const game = still(0);
    game['setLives'](3);
    game['addScore'](999);
    place(game, 5, 11, 1, 1);
    const events = ballStep(game); // кирпич: 1000-е очко
    expect(game.score).toBe(1000);
    expect(types(events)).toEqual(expect.arrayContaining(['hit', 'bonus']));
    expect(game.lives).toBe(4);
    game['addScore'](1000); // 2000: жизни уже полны — вместо жизни бонус к счёту, как у донора
    expect(game.lives).toBe(4);
    expect(game.score).toBe(2100);
  });

  it('кирпич, который стена сдвинула в клетку мяча, разбивается на следующем шаге', () => {
    const game = still(4); // стена едет; платформа 4, готовые стены
    // уровень 1: экранный ряд 7 (y = 12) '...####...' после сдвига вправо станет '....####..'
    place(game, 7, 12, 1, 1); // (7,12) пока пусто
    game['shiftBricks']();
    expect(rows(game)[7]).toBe('....####..'.replace('....####..', '....####..'));
    // кирпичи 4..7; мяч в (7,12) стоит внутри кирпича
    expect(game['wall'].has(7, 0)).toBe(true);
    const before = game['wall'].remaining;
    const events = ballStep(game);
    expect(types(events)).toContain('hit');
    expect(game['wall'].remaining).toBeLessThan(before);
    expect(game['wall'].has(7, 0)).toBe(false);
    expect(game.score).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- сдвигающаяся стена

describe('арканоид: сдвиг стены', () => {
  it('в вариантах со сдвигом стена едет вправо по кругу: в первом такте и далее каждые 400 мс = 24 такта', () => {
    const game = make(4);
    game.start();
    const top = (): string | undefined => rows(game)[0];
    expect(top()).toBe('.#.#..#.#.');
    game.step(NEUTRAL_BRICK_INPUT);
    expect(top()).toBe('..#.#..#.#.'.slice(0, 10));
    idle(game, 23); // такт 24
    expect(top()).toBe('..#.#..#.#');
    game.step(NEUTRAL_BRICK_INPUT); // такт 25
    expect(top()).toBe('...#.#..#.');
    idle(game, 24);
    expect(top()).toBe('....#.#..#');
  });

  it('кирпичи, ушедшие за правый край, возвращаются слева', () => {
    const game = make(4, { level: 7 }); // верхний ряд '#..#..#..#'
    expect(rows(game)[0]).toBe('#..#..#..#');
    game.start();
    game.step(NEUTRAL_BRICK_INPUT);
    expect(rows(game)[0]).toBe('##..#..#..');
    expect(game['wall'].remaining).toBe(60);
  });

  it('вариантах без сдвига стена неподвижна', () => {
    const game = make(0);
    game.start();
    idle(game, 120);
    expect(rows(game).slice(0, 3)).toEqual(['.#.#..#.#.', '..#....#..', '.###..###.']);
  });

  it('сдвиг идёт и во время «мелодии», но замирает на время взрыва и очистки', () => {
    const game = make(4);
    game.start();
    idle(game, 5);
    expect(rows(game)[0]).toBe('..#.#..#.#');
    place(game, 0, 0, -1, -1);
    game['introLeft'] = 0;
    ballStep(game); // потеря мяча
    expect(game['busy']).toBe(true);
    const shiftLeft = game['shiftLeft'];
    idle(game, 50);
    expect(game['shiftLeft']).toBe(shiftLeft);
  });
});

// ---------------------------------------------------------------- удар кнопкой

describe('арканоид: удар по мячу кнопкой', () => {
  it('rotate делает лишний шаг мяча сразу; зажатая кнопка повторяется через 60 мс = 4 такта; `fire` — то же, что `rotate`', () => {
    expect(msToTicks(60)).toBe(4);
    for (const action of ['rotate', 'fire'] as const) {
      const game = ready(0, { speed: 1 });
      game.step(NEUTRAL_BRICK_INPUT); // автоматический шаг -> (5,2)
      const events = game.step(makeBrickInput([action], [action])); // удар -> (6,3)
      expect(ball(game), action).toEqual({ x: 6, y: 3, dx: 1, dy: 1 });
      expect(types(events)).toEqual(['rotate']);
      const at: number[] = [];
      let last = game['ballY'];
      for (let t = 1; t <= 9; t++) {
        game.step(makeBrickInput([], [action]));
        if (game['ballY'] !== last) at.push(t);
        last = game['ballY'];
      }
      expect(at, action).toEqual([4, 8]);
    }
  });

  it('до конца «мелодии» удар не работает', () => {
    const game = make(0);
    game.start();
    for (let t = 0; t < 40; t++) game.step(makeBrickInput(t === 0 ? ['rotate'] : [], ['rotate']));
    expect(ball(game)).toEqual({ x: 4, y: 1, dx: 1, dy: 1 });
  });

  it('удар может принести потерю жизни и победу, как обычный шаг', () => {
    const game = ready(0);
    place(game, 9, 0, 1, -1);
    game.step(tap('rotate'));
    expect(game['busy']).toBe(true);
  });
});

// ---------------------------------------------------------------- жизни и потеря мяча

describe('арканоид: потеря мяча, жизни, конец игры', () => {
  it('потеря: взрыв без управления, минус жизнь, очистка поля, тот же уровень со сломанной стеной и мелодия', () => {
    const game = still(0);
    place(game, 5, 11, 1, 1);
    ballStep(game); // кирпич (5,12) разбит
    const remaining = game['wall'].remaining;
    place(game, 8, 0, 1, -1);
    const first = ballStep(game);
    expect(types(first)).toEqual(['explode']);
    expect(game.lives).toBe(4);
    // во время взрыва платформа не слушается, мяч стоит
    const curX = game['curX'];
    for (let i = 0; i < KABOOM - 1; i++) {
      game.step(makeBrickInput(['left'], ['left']));
      expect(game['curX']).toBe(curX);
    }
    const events = game.step(NEUTRAL_BRICK_INPUT); // последний такт взрыва
    expect(types(events)).toEqual(['lifeLost']);
    expect(game.lives).toBe(3);
    // очистка поля: через половину поле залито полностью
    for (let i = 0; i < CLEAR_LOSE_TICKS / 2 - 1; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(rows(game).every((line) => line === '##########')).toBe(true);
    finishScenes(game);
    // перезагрузка уровня: платформа и мяч в центре, стена без сбитого кирпича, счёт сохранён
    expect(game.phase).toBe('playing');
    expect(game['busy']).toBe(false);
    expect(game['curX']).toBe(4);
    expect(ball(game)).toEqual({ x: 4, y: 1, dx: 1, dy: 1 });
    expect(game['wall'].remaining).toBe(remaining);
    expect(game.score).toBe(1);
    expect(game.level).toBe(1);
    expect(rows(game)[7]).toBe('...##.#...');
    expect(game['introLeft']).toBe(INTRO);
    idle(game, INTRO - 1);
    expect(game['ballY']).toBe(1);
    idle(game, 2);
    expect(game['ballY']).toBe(2);
  });

  it('жизни кончились: конец игры с заливкой поля, затем `over`; новый старт — свежая партия с рекордом', () => {
    const game = still(0);
    game['setLives'](1);
    place(game, 8, 0, 1, -1);
    ballStep(game);
    expect(game.lives).toBe(1);
    const events = finishScenes(game);
    expect(types(events)).toEqual(expect.arrayContaining(['lifeLost', 'gameOver']));
    expect(game.lives).toBe(0);
    for (let i = 0; i < GAME_OVER_TICKS + 2 && game.phase !== 'over'; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(game.phase).toBe('over');
    expect(game.overFill).toBe(BRICK_ROWS);
    game.start();
    expect(game.phase).toBe('playing');
    expect(game.lives).toBe(4);
    expect(game.score).toBe(0);
    expect(game['wall'].remaining).toBe(48);
  });

  it('четыре потери подряд при брошенной платформе заканчивают игру', () => {
    const game = make(2, { speed: 10 });
    game.start();
    // «саботёр»: уводит платформу в угол, противоположный мячу
    let lostLives = 0;
    let lastLives = game.lives;
    let events: BrickEvent[] = [];
    for (let t = 0; t < 60 * 60 * 5 && game.phase === 'playing'; t++) {
      const away: BrickAction = game['ballX'] < 5 ? 'right' : 'left';
      events = events.concat(game.step(makeBrickInput(t % 40 === 0 ? [away] : [], [away])));
      if (game.lives !== lastLives) {
        lostLives++;
        lastLives = game.lives;
      }
    }
    expect(lostLives).toBe(4);
    expect(types(events).filter((type) => type === 'lifeLost')).toHaveLength(4);
    expect(types(events)).toContain('gameOver');
    for (let i = 0; i < GAME_OVER_TICKS + 2 && game.phase !== 'over'; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(game.phase).toBe('over');
  });
});

// ---------------------------------------------------------------- победа в уровне

describe('арканоид: победа в уровне', () => {
  it('последний кирпич: `win`, очистка поля, затем следующий уровень с новой стеной и мелодией', () => {
    const game = still(0, { speed: 3 });
    clearWallExcept(game, 3, 0); // остался кирпич (3, 12)
    expect(game['wall'].remaining).toBe(1);
    place(game, 2, 11, 1, 1);
    const events = ballStep(game);
    expect(types(events)).toEqual(['hit', 'win']);
    expect(game.score).toBe(1);
    expect(game.level).toBe(1);
    expect(game['busy']).toBe(true);
    // очистка: через полпути поле залито
    for (let i = 0; i < CLEAR_WIN_TICKS / 2 - 1; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(rows(game).every((line) => line === '##########')).toBe(true);
    const rest = finishScenes(game);
    expect(types(rest)).toEqual(['levelUp']);
    expect(game.level).toBe(2);
    expect(game.speed).toBe(3);
    expect(game.lives).toBe(4);
    expect(rows(game).slice(0, 7)).toEqual(PRELOADED_WALLS[1]);
    expect(game['wall'].remaining).toBe(54);
    expect(ball(game)).toEqual({ x: 4, y: 1, dx: 1, dy: 1 });
    expect(game['introLeft']).toBe(INTRO);
  });

  it('после десятого уровня снова первый, а скорость растёт на единицу', () => {
    const game = still(0, { speed: 4, level: 10 });
    expect(rows(game).slice(0, 8)).toEqual(PRELOADED_WALLS[9]);
    clearWallExcept(game, 4, 0);
    place(game, 3, 11, 1, 1);
    ballStep(game);
    finishScenes(game);
    expect(game.level).toBe(1);
    expect(game.speed).toBe(5);
    expect(rows(game).slice(0, 8)).toEqual(PRELOADED_WALLS[0]);
  });

  it('победа на последней скорости переводит скорость 10 на 1 (по кругу)', () => {
    const game = still(0, { speed: 10, level: 10 });
    clearWallExcept(game, 4, 0);
    place(game, 3, 11, 1, 1);
    ballStep(game);
    finishScenes(game);
    expect(game.level).toBe(1);
    expect(game.speed).toBe(1);
  });
});

// ---------------------------------------------------------------- пауза и детерминизм

describe('арканоид: пауза, повторяемость', () => {
  it('на паузе мяч, платформа и сдвиг стены стоят', () => {
    const game = make(4);
    game.start();
    idle(game, 100);
    const frame = rows(game).join('/');
    game.pause();
    for (let i = 0; i < 100; i++) game.step(makeBrickInput(['left', 'rotate']));
    expect(rows(game).join('/')).toBe(frame);
    game.resume();
    idle(game, 40);
    expect(rows(game).join('/')).not.toBe(frame);
  });

  it('одинаковое зерно и ввод дают одну партию, а разные зёрна — разные случайные стены', () => {
    const run = (seed: number): string => {
      const game = make(20, { seed, speed: 10 });
      game.start();
      let hash = '';
      for (let t = 0; t < 1500; t++) {
        const away: BrickAction = t % 90 < 45 ? 'left' : 'right';
        game.step(makeBrickInput([], [away]));
        if (t % 100 === 0) hash += `${game.score},${rows(game).join('')};`;
      }
      return hash;
    };
    expect(run(4)).toBe(run(4));
    expect(run(4)).not.toBe(run(5));
  });
});

// ---------------------------------------------------------------- бот

/**
 * «Бот»: ведёт платформу под мячом, а в такт отскока сдвигает её на случайное (но детерминированное) число клеток, унося мяч с собой —
 * иначе мяч с углом 45° уходит в замкнутую орбиту и перестаёт задевать кирпичи.
 */
function makeBot(): (game: ArkanoidGame) => BrickInput {
  let previous: BrickAction | null = null;
  let state = 12345;
  const random = (n: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * n);
  };
  let wasOnPlatform = false;
  let target = 4;
  return (game) => {
    const bx = game['ballX'];
    const by = game['ballY'];
    const double = game['variant'].doubleSided;
    const low = game['platformMin'];
    const high = game['platformMax'];
    const onPlatform = (by === 1 && game['dirY'] > 0) || (double && by === BRICK_ROWS - 2 && game['dirY'] < 0);
    if (onPlatform && !wasOnPlatform) {
      const min = Math.max(-low, bx - high);
      const max = Math.min(BRICK_COLS - 1 - high, bx - low);
      target = min + random(max - min + 1);
    }
    wasOnPlatform = onPlatform;
    if (!onPlatform) target = Math.min(BRICK_COLS - 1 - high, Math.max(-low, bx));
    const center = game['curX'];
    const direction: BrickAction | null = target > center ? 'right' : target < center ? 'left' : null;
    const pressed = direction && direction !== previous ? [direction] : [];
    previous = direction;
    return makeBrickInput(pressed, direction ? [direction] : []);
  };
}

describe('арканоид: бот', () => {
  it('бот ведёт платформу за мячом: жизни целы, кирпичи сбиваются, очки растут', () => {
    const game = make(0, { speed: 10 });
    game.start();
    const bot = makeBot();
    let hits = 0;
    let bounces = 0;
    for (let t = 0; t < 4000; t++) {
      const events = game.step(bot(game));
      hits += events.filter((event) => event.type === 'hit').length;
      bounces += events.filter((event) => event.type === 'rotate').length;
    }
    expect(game.phase).toBe('playing');
    expect(game.lives).toBe(4);
    expect(hits).toBe(game.score);
    expect(game.score).toBeGreaterThan(30);
    expect(bounces).toBeGreaterThan(100);
    expect(game['wall'].remaining).toBe(48 - game.score);
  });

  it('бот проходит уровень в варианте со сдвигающейся стеной и доходит до следующего', () => {
    const game = make(4, { speed: 10 });
    game.start();
    const bot = makeBot();
    const events: BrickEvent[] = [];
    for (let t = 0; t < 12000 && game.level === 1; t++) events.push(...game.step(bot(game)));
    expect(game.level).toBeGreaterThanOrEqual(2);
    expect(types(events)).toContain('win');
    expect(types(events)).toContain('levelUp');
    expect(game.lives).toBe(4);
    expect(game.score).toBeGreaterThanOrEqual(BRICKS_PER_LEVEL[0] ?? 0);
  });

  it('бот справляется и в двухстороннем варианте с одной клеткой платформы', () => {
    const game = make(11, { speed: 10 });
    game.start();
    const bot = makeBot();
    for (let t = 0; t < 4000; t++) game.step(bot(game));
    expect(game.score).toBeGreaterThan(10);
    expect(game.phase).toBe('playing');
  });
});
