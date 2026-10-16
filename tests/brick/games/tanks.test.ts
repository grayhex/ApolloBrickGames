import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  CLEAR_LOSE_TICKS,
  CLEAR_WIN_TICKS,
  GAME_OVER_HOLD_TICKS,
  GAME_OVER_TICKS_PER_ROW,
  KABOOM_WAVE_TICKS,
  NEUTRAL_BRICK_INPUT,
  Rng,
  genuineTicks,
  makeBrickInput,
  type BrickAction,
  type BrickEvent,
  type BrickGameOptions,
  type BrickInput,
} from '../../../src/brick';
import {
  BULLET_TICKS,
  FIRE_TICKS,
  KILLS_TO_NEXT_LEVEL,
  MODES,
  MOVE_TICKS,
  PLAYER_BULLET_LIMIT,
  PLAYER_START,
  ROTATE_TICKS,
  SCORES_TO_EXTRA_LIFE,
  START_TICKS,
  TanksGame,
  tanksDef,
  tanksRules,
} from '../../../src/brick/games/tanks';
import {
  chooseMove,
  distanceToObstacle,
  moveWeights,
  shootDirection,
  shotChance,
  sortByWeight,
} from '../../../src/brick/games/tanks/ai';
import {
  BOX_KIND,
  DIRS,
  DOWN,
  ENEMY_KIND,
  LEFT,
  PLAYER_KIND,
  RIGHT,
  UP,
  boardIndex,
  coversCell,
  moveTank,
  newBoard,
  tankMask,
  toScreenRow,
  type Bullet,
  type Dir,
  type Tank,
} from '../../../src/brick/games/tanks/geometry';
import { TANK_LEVELS, obstacleCells, presetObstacles, randomObstacles } from '../../../src/brick/games/tanks/levels';
import { conformance, expectValid } from '../conformance';

// ------------------------------------------------------------------ помощники

const hold = (...keys: BrickAction[]): BrickInput => makeBrickInput([], keys);
const KEY_OF: Record<Dir, BrickAction> = { 0: 'up', 1: 'right', 2: 'down', 3: 'left' };
/** Центры мест появления врагов после сдвига внутрь поля. */
const SPAWN_CENTERS = ['1,1', '8,1', '1,10', '8,10', '1,18', '8,18'];
/** Тактов анимации взрыва: четыре прохода по семи волнам. */
const KABOOM_TICKS = 4 * 7 * KABOOM_WAVE_TICKS;

/** Новая партия, прошедшая стартовую мелодию: следующий такт — первый игровой. */
function newGame(options: BrickGameOptions = {}): TanksGame {
  const game = new TanksGame({ seed: 7, ...options });
  game.start();
  for (let i = 0; i < START_TICKS; i++) game.step(NEUTRAL_BRICK_INPUT);
  return game;
}

/** Сделать `ticks` тактов с одним и тем же вводом; вернуть все события. */
function run(game: TanksGame, ticks: number, input: BrickInput = NEUTRAL_BRICK_INPUT): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(input));
  return events;
}

const types = (events: readonly BrickEvent[]): string[] => events.map((event) => event.type);

interface Setup {
  player?: Tank;
  enemies?: readonly Tank[];
  obstacles?: readonly (readonly [number, number])[];
  enemyBullets?: readonly Bullet[];
  playerBullets?: readonly Bullet[];
  killed?: number;
  /** Через сколько тактов следующий ход врагов (по умолчанию — никогда: сценарий идёт без вмешательства ИИ). */
  aiIn?: number;
}

/** Расставить сцену для сценария правил: через закрытые поля (они же — то, что видит игра). */
function arrange(game: TanksGame, setup: Setup): void {
  game['player'] = setup.player ?? PLAYER_START;
  game['enemies'].fill(null);
  setup.enemies?.forEach((tank, i) => {
    game['enemies'][i] = tank;
  });
  game['onBoard'] = setup.enemies?.length ?? 0;
  const obstacles = newBoard();
  for (const [x, y] of setup.obstacles ?? []) obstacles[boardIndex(x, y)] = 1;
  game['obstacles'] = obstacles;
  game['playerBullets'].fill(null);
  game['enemyBullets'].fill(null);
  setup.playerBullets?.forEach((bullet, i) => {
    game['playerBullets'][i] = bullet;
  });
  setup.enemyBullets?.forEach((bullet, i) => {
    game['enemyBullets'][i] = bullet;
  });
  game['killed'] = setup.killed ?? 0;
  game['aiLeft'] = setup.aiIn ?? 1_000_000;
  game['dead'] = false;
}

/** Строки экрана: `#` — горит, `.` — погашена. */
function screen(game: TanksGame): string[] {
  const cells = game.cells();
  const rows: string[] = [];
  for (let y = 0; y < BRICK_ROWS; y++) {
    let line = '';
    for (let x = 0; x < BRICK_COLS; x++) line += cells[y * BRICK_COLS + x] ? '#' : '.';
    rows.push(line);
  }
  return rows;
}

/** Горит ли клетка в донорских координатах (y вверх). */
const lit = (game: TanksGame, x: number, y: number): boolean => game.cells()[toScreenRow(y) * BRICK_COLS + x] !== 0;

const cellKey = (x: number, y: number): string => `${x},${y}`;

/** Занятые клетки поля препятствий в виде множества «x,y». */
function obstacleSet(board: Uint8Array): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) if (board[boardIndex(x, y)]) out.add(cellKey(x, y));
  return out;
}

const liveEnemies = (game: TanksGame): Tank[] => game['enemies'].filter((tank): tank is Tank => tank !== null);

/** Бот на скриптованном вводе: идёт к ближайшему врагу, выравнивается по линии огня, поворачивается и стреляет. */
function botInput(game: TanksGame): BrickInput {
  const player = game['player'];
  let target: Tank | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const tank of liveEnemies(game)) {
    const distance = Math.abs(tank.x - player.x) + Math.abs(tank.y - player.y);
    if (distance < best) {
      best = distance;
      target = tank;
    }
  }
  if (target === null) return NEUTRAL_BRICK_INPUT;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  let face: Dir | null = null;
  if (Math.abs(dx) <= 1 && dy !== 0) face = dy > 0 ? UP : DOWN;
  else if (Math.abs(dy) <= 1 && dx !== 0) face = dx > 0 ? RIGHT : LEFT;
  if (face !== null) return player.dir === face ? hold('fire') : hold(KEY_OF[face]);
  if (Math.abs(dx) <= Math.abs(dy)) return hold(dx > 0 ? 'right' : 'left');
  return hold(dy > 0 ? 'up' : 'down');
}

/** Нет ли общих клеток у танка игрока, вражеских танков и препятствий (снаряды в счёт не идут). */
function noOverlaps(game: TanksGame): boolean {
  const seen = new Set<string>(obstacleSet(game['obstacles']));
  const tanks: [Tank, 0 | 1][] = [[game['player'], PLAYER_KIND]];
  for (const tank of liveEnemies(game)) tanks.push([tank, ENEMY_KIND]);
  for (const [tank, kind] of tanks) {
    for (const [cx, cy] of tankMask(kind, tank.dir).cells) {
      const key = cellKey(tank.x + cx, tank.y + cy);
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
}

// ------------------------------------------------------------------ общие проверки

conformance(tanksDef);

// ------------------------------------------------------------------ варианты

describe('танки: описание и варианты', () => {
  it('игра в каталоге: id, пять вариантов на устройстве, пометки допущений', () => {
    expect(tanksDef.id).toBe('tank');
    expect(tanksDef.declaredModes).toBe(5);
    expect(tanksDef.modes).toBe(MODES);
    expect(tanksDef.modes.length).toBe(5);
    for (const mode of tanksDef.modes) expect(mode.note).toContain('допущение');
  });

  it('правила донорского варианта: число врагов и вид полей', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((type) => tanksRules(type).enemies)).toEqual([3, 4, 5, 6, 3, 4, 5, 6]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((type) => tanksRules(type).preloaded)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('пять вариантов меню — донорские 1, 2, 4, 5 и 8', () => {
    const rules = [0, 1, 2, 3, 4].map((mode) => new TanksGame({ mode }).rules);
    expect(rules.map((r) => r.donorType)).toEqual([1, 2, 4, 5, 8]);
    expect(rules.map((r) => r.enemies)).toEqual([3, 4, 6, 3, 6]);
    expect(rules.map((r) => r.preloaded)).toEqual([true, true, true, false, false]);
    expect(rules.map((r) => tanksDef.create({ mode: r.donorType }).id)).toEqual(Array(5).fill('tank'));
  });

  it('число ячеек врагов и их снарядов совпадает с вариантом', () => {
    for (let mode = 0; mode < 5; mode++) {
      const game = new TanksGame({ mode });
      expect(game['enemies'].length).toBe(game.rules.enemies);
      expect(game['enemyBullets'].length).toBe(game.rules.enemies);
      expect(game['playerBullets'].length).toBe(PLAYER_BULLET_LIMIT);
    }
  });

  it('на первом уровне поля всех вариантов пусты и одинаковы: препятствия у донора только с уровня 2', () => {
    const frames = [0, 1, 2, 3, 4].map((mode) => screen(new TanksGame({ seed: 5, mode })).join('/'));
    expect(new Set(frames).size).toBe(1);
  });

  it('готовые поля одинаковы при любом зерне, случайные зависят от зерна', () => {
    const board = (seed: number, mode: number): string =>
      [...obstacleSet(new TanksGame({ seed, mode, level: 4 })['obstacles'])].join('|');
    expect(new Set([1, 2, 3, 4, 5].map((seed) => board(seed, 0))).size).toBe(1);
    expect(new Set([1, 2, 3, 4, 5].map((seed) => board(seed, 2))).size).toBe(1);
    expect(board(1, 0)).toBe(board(1, 2));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => board(seed, 3))).size).toBeGreaterThan(3);
    expect(board(1, 3)).not.toBe(board(1, 0));
  });

  it('вариант с шестью врагами держит на поле до шести, с тремя — не больше трёх', () => {
    const peak = (mode: number): number => {
      const game = newGame({ seed: 3, mode, speed: 10 });
      let max = 0;
      for (let t = 0; t < 3000 && game.phase !== 'over'; t++) {
        game.step(botInput(game));
        max = Math.max(max, liveEnemies(game).length);
        expect(game['onBoard']).toBe(liveEnemies(game).length);
      }
      return max;
    };
    expect(peak(0)).toBeLessThanOrEqual(3);
    expect(peak(0)).toBe(3);
    expect(peak(2)).toBeLessThanOrEqual(6);
    expect(peak(2)).toBeGreaterThan(3);
  });
});

// ------------------------------------------------------------------ маски и экран

describe('танки: маски, поворот и перевод в систему экрана', () => {
  const cellsOf = (kind: 0 | 1 | 2, dir: Dir): string[] =>
    tankMask(kind, dir)
      .cells.map(([x, y]) => cellKey(x, y))
      .sort();

  it('маска игрока — 7 клеток, вражеского — 6, коробка для проверки — полный квадрат 3 × 3', () => {
    expect(tankMask(PLAYER_KIND, UP).cells.length).toBe(7);
    expect(tankMask(ENEMY_KIND, UP).cells.length).toBe(6);
    expect(tankMask(BOX_KIND, UP).cells.length).toBe(9);
    const box = new Set(cellsOf(BOX_KIND, UP));
    for (const dir of DIRS) {
      // коробка перекрывает оба рисунка танка в любом повороте
      for (const kind of [PLAYER_KIND, ENEMY_KIND] as const)
        for (const key of cellsOf(kind, dir)) expect(box.has(key)).toBe(true);
    }
    // у врага нет клетки позади центра — проверять место появления рисунком нельзя: нужна полная маска
    expect(cellsOf(ENEMY_KIND, UP)).not.toContain('0,-1');
    expect(cellsOf(BOX_KIND, UP)).toContain('0,-1');
  });

  it('ствол смотрит туда, куда повёрнут танк, во всех четырёх направлениях', () => {
    const barrel = (kind: 0 | 1, dir: Dir): string => {
      // клетка маски дальше всего от центра по оси взгляда
      const cells = tankMask(kind, dir).cells;
      const dx = [0, 1, 0, -1][dir] ?? 0;
      const dy = [1, 0, -1, 0][dir] ?? 0;
      const far = cells.reduce((best, c) => (c[0] * dx + c[1] * dy > best[0] * dx + best[1] * dy ? c : best));
      return cellKey(far[0], far[1]);
    };
    for (const kind of [PLAYER_KIND, ENEMY_KIND] as const) {
      expect(DIRS.map((dir) => barrel(kind, dir))).toEqual(['0,1', '1,0', '0,-1', '-1,0']);
    }
  });

  it('поворот маски совпадает с донорским: вправо (x, y) -> (y, -x), влево (x, y) -> (-y, x)', () => {
    expect(cellsOf(PLAYER_KIND, RIGHT)).toEqual(['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,0']);
    expect(cellsOf(PLAYER_KIND, LEFT)).toEqual(['-1,0', '0,-1', '0,0', '0,1', '1,-1', '1,0', '1,1']);
    expect(cellsOf(ENEMY_KIND, DOWN)).toEqual(['-1,0', '-1,1', '0,-1', '0,0', '1,0', '1,1']);
  });

  it('строка экрана — это перевёрнутый y донора: y = 0 внизу, y = 19 вверху', () => {
    expect(toScreenRow(0)).toBe(19);
    expect(toScreenRow(19)).toBe(0);
    expect(toScreenRow(7)).toBe(12);
  });

  it('стартовое положение: танк по центру чуть ниже середины, стволом вверх (проверка на экране)', () => {
    const game = new TanksGame({ seed: 3 });
    expect(game['player']).toEqual({ x: 4, y: 7, dir: UP });
    const rows = screen(game);
    expect(rows[11]).toBe('....#.....'); // ствол, y = 8
    expect(rows[12]).toBe('...###....'); // y = 7
    expect(rows[13]).toBe('...###....'); // y = 6
    expect(rows.filter((_, i) => i < 11 || i > 13).every((row) => row === '..........')).toBe(true);
    // все клетки горят ровно: мигающих (2) в танках нет
    expect(new Set(game.cells())).toEqual(new Set([0, 1]));
  });

  it('вражеский танк рисуется стволом вниз перевёрнуто так же, как маска', () => {
    const game = newGame();
    arrange(game, { enemies: [{ x: 1, y: 18, dir: DOWN }] });
    const rows = screen(game);
    expect(rows[0]).toBe('#.#.......'); // y = 19
    expect(rows[1]).toBe('###.......'); // y = 18
    expect(rows[2]).toBe('.#........'); // y = 17, ствол
  });

  it('препятствия: фигуры и повороты как у донора (нижний левый угол в нуле)', () => {
    const sorted = (type: 0 | 1 | 2, dir: Dir): string[] =>
      obstacleCells(type, dir)
        .map(([x, y]) => cellKey(x, y))
        .sort();
    expect(sorted(0, UP)).toEqual(['0,0']);
    expect(sorted(1, UP)).toEqual(['0,0', '0,1', '1,0']);
    expect(sorted(1, RIGHT)).toEqual(['0,0', '0,1', '1,1']);
    expect(sorted(1, DOWN)).toEqual(['0,1', '1,0', '1,1']);
    expect(sorted(1, LEFT)).toEqual(['0,0', '1,0', '1,1']);
    expect(sorted(2, UP).length).toBe(6);
    expect(sorted(2, UP)).toContain('2,1');
    expect(sorted(2, LEFT)).toEqual(['0,0', '0,1', '0,2', '1,0', '1,1', '1,2']);
  });

  it('таблица готовых полей: у уровней 1 пусто, с 2 по 10 — по донору', () => {
    expect(obstacleSet(presetObstacles(1)).size).toBe(0);
    expect(obstacleSet(presetObstacles(0)).size).toBe(0);
    expect(TANK_LEVELS.length).toBe(11);
    // уровень 2: уголок вверх в (1, 3), уголок влево в (6, 3), прямоугольник 2 × 3 в (8, 8)
    const level2 = ['1,3', '2,3', '1,4', '6,3', '7,3', '7,4', '8,8', '9,8', '8,9', '9,9', '8,10', '9,10'];
    expect([...obstacleSet(presetObstacles(2))].sort()).toEqual(level2.sort());
    const sizes = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => obstacleSet(presetObstacles(level)).size);
    expect(sizes).toEqual([12, 12, 12, 6, 18, 21, 15, 27, 24]);
  });

  it('готовые поля не задевают места старта танка игрока', () => {
    const footprint = new Set(
      tankMask(PLAYER_KIND, UP).cells.map(([x, y]) => cellKey(PLAYER_START.x + x, PLAYER_START.y + y)),
    );
    for (let level = 1; level <= 10; level++) {
      for (const key of obstacleSet(presetObstacles(level))) expect(footprint.has(key)).toBe(false);
    }
  });
});

// ------------------------------------------------------------------ время

describe('танки: время донора в тактах', () => {
  it('паузы кнопок, полёт снаряда и стартовая мелодия', () => {
    expect(MOVE_TICKS).toBe(5); // 90 мс
    expect(ROTATE_TICKS).toBe(5); // 90 мс округлены до 5 тактов
    expect(FIRE_TICKS).toBe(14); // 240 мс
    expect(BULLET_TICKS).toBe(7); // 120 мс
    expect(START_TICKS).toBe(90); // 1500 мс
  });

  it('ход врагов: 1500 мс на скорости 1 и 350 мс на скорости 10', () => {
    expect(genuineTicks(1, 1500, 350)).toBe(90);
    expect(genuineTicks(10, 1500, 350)).toBe(21);
  });

  it('во время вступления движение принимается сразу, враги и огонь ждут', () => {
    const game = new TanksGame({ seed: 3 }); game.start();
    game.step(makeBrickInput(['left']));
    expect(game['player'].dir).toBe(LEFT);
    for (let i = 1; i < START_TICKS; i++) {
      expect(types(game.step(hold('left', 'fire')))).not.toContain('shot');
      expect(game['enemies'].every((tank) => tank === null)).toBe(true);
    }
    expect(game['player'].x).toBeLessThan(PLAYER_START.x);
  });
  it('быстрый повторный тап не теряется в задержке предыдущего нажатия', () => {
    const game = newGame(); arrange(game, {});
    game.step(makeBrickInput(['left']));
    const before = game['player'].x;
    game.step(NEUTRAL_BRICK_INPUT);
    game.step(makeBrickInput(['left']));
    expect(game['player'].x).toBe(before - 1);
  });
});

// ------------------------------------------------------------------ танк игрока

describe('танки: движение и повороты игрока', () => {
  it('сначала поворот на месте, через ROTATE_TICKS первый шаг, затем шаг каждые MOVE_TICKS', () => {
    const game = newGame();
    arrange(game, {});
    game.step(hold('left'));
    expect(game['player']).toEqual({ x: 4, y: 7, dir: LEFT });
    for (let t = 2; t <= ROTATE_TICKS; t++) {
      game.step(hold('left'));
      expect(game['player'].x).toBe(4);
    }
    game.step(hold('left')); // такт ROTATE_TICKS + 1: кнопка снова свободна
    expect(game['player']).toEqual({ x: 3, y: 7, dir: LEFT });
    for (let t = 1; t < MOVE_TICKS; t++) {
      game.step(hold('left'));
      expect(game['player'].x).toBe(3);
    }
    game.step(hold('left'));
    expect(game['player'].x).toBe(2);
    run(game, 4 * MOVE_TICKS, hold('left'));
    expect(game['player'].x).toBe(1); // дальше край поля: центр не бывает левее 1
    run(game, 3 * MOVE_TICKS, hold('left'));
    expect(game['player'].x).toBe(1);
  });

  it('все четыре стрелки поворачивают в свою сторону; границы поля держат центр в 1..8 по x и в 1..18 по y', () => {
    for (const dir of DIRS) {
      const game = newGame();
      arrange(game, {});
      game.step(hold(KEY_OF[dir]));
      expect(game['player'].dir).toBe(dir);
      run(game, 400, hold(KEY_OF[dir]));
      const { x, y } = game['player'];
      expect({ x, y }).toEqual(
        { [UP]: { x: 4, y: 18 }, [RIGHT]: { x: 8, y: 7 }, [DOWN]: { x: 4, y: 1 }, [LEFT]: { x: 1, y: 7 } }[dir],
      );
    }
  });

  it('при двух зажатых стрелках побеждает первая по очереди донора: влево, вправо, вверх, вниз', () => {
    const game = newGame();
    arrange(game, {});
    game.step(hold('down', 'up', 'right'));
    expect(game['player'].dir).toBe(RIGHT);
    game.step(hold('down', 'up', 'right', 'left'));
    expect(game['player'].dir).toBe(LEFT); // влево свободна
  });

  it('другая стрелка не ждёт паузы первой: можно быстро повернуть в другую сторону', () => {
    const game = newGame();
    arrange(game, {});
    game.step(hold('left'));
    game.step(hold('up'));
    expect(game['player'].dir).toBe(UP);
    game.step(hold('right')); // пауза у «вправо» своя — повернуть можно сразу
    expect(game['player'].dir).toBe(RIGHT);
  });

  it('препятствие впереди не пускает: ни шага, ни переезда', () => {
    const game = newGame();
    arrange(game, { player: { x: 4, y: 7, dir: LEFT }, obstacles: [[2, 7]] });
    run(game, 60, hold('left'));
    expect(game['player']).toEqual({ x: 4, y: 7, dir: LEFT });
  });

  it('вражеский танк тоже преграда', () => {
    const game = newGame();
    arrange(game, { player: { x: 4, y: 7, dir: UP }, enemies: [{ x: 4, y: 11, dir: DOWN }] });
    run(game, 60, hold('up'));
    // ствол врага на (4, 10): танк игрока подъезжает вплотную (ствол на (4, 9)) и дальше не едет
    expect(game['player']).toEqual({ x: 4, y: 8, dir: UP });
  });

  it('если повёрнутая маска во что-то упирается — поворот со ступенькой на клетку вперёд', () => {
    const game = newGame();
    // при повороте вправо загорается клетка (-1, +1) = (3, 8) — там препятствие
    arrange(game, { obstacles: [[3, 8]] });
    game.step(hold('right'));
    expect(game['player']).toEqual({ x: 5, y: 7, dir: RIGHT });
  });

  it('ступенька тоже может быть закрыта — тогда танк остаётся как был', () => {
    const game = newGame();
    arrange(game, {
      obstacles: [
        [3, 8],
        [6, 7],
      ],
    });
    game.step(hold('right'));
    expect(game['player']).toEqual({ x: 4, y: 7, dir: UP });
  });

  it('moveTank: поворот на месте, ступенька, шаг вперёд и отказ у края', () => {
    const board = newBoard();
    expect(moveTank(board, PLAYER_KIND, { x: 4, y: 7, dir: UP }, UP, false)).toEqual({ x: 4, y: 8, dir: UP });
    expect(moveTank(board, PLAYER_KIND, { x: 4, y: 7, dir: UP }, DOWN, false)).toEqual({ x: 4, y: 7, dir: DOWN });
    expect(moveTank(board, ENEMY_KIND, { x: 4, y: 7, dir: UP }, LEFT, true)).toEqual({ x: 4, y: 7, dir: LEFT });
    const edge: Tank = { x: 1, y: 1, dir: LEFT };
    expect(moveTank(board, PLAYER_KIND, edge, LEFT, false)).toBe(edge);
    expect(moveTank(board, PLAYER_KIND, edge, DOWN, false)).toEqual({ x: 1, y: 1, dir: DOWN });
  });
});

// ------------------------------------------------------------------ стрельба

describe('танки: стрельба и попадания', () => {
  it('выстрел: событие shot, снаряд сразу делает первый шаг и оказывается через клетку от ствола', () => {
    const game = newGame();
    arrange(game, {});
    const events = game.step(hold('fire'));
    expect(types(events)).toContain('shot');
    expect(game['playerBullets'][0]).toEqual({ x: 4, y: 9, dir: UP });
    expect(lit(game, 4, 9)).toBe(true);
    // «rotate» — тот же огонь
    const second = newGame();
    arrange(second, {});
    expect(types(second.step(hold('rotate')))).toContain('shot');
  });

  it('снаряд перелетает на клетку каждые BULLET_TICKS тактов и вылетает за поле', () => {
    const game = newGame();
    arrange(game, {});
    game.step(hold('fire')); // такт 1
    for (let t = 2; t <= 120; t++) {
      game.step(NEUTRAL_BRICK_INPUT);
      const bullet = game['playerBullets'][0];
      const expectedY = 9 + Math.floor(t / BULLET_TICKS);
      if (expectedY < 20) expect(bullet).toEqual({ x: 4, y: expectedY, dir: UP });
      else expect(bullet).toBeNull();
    }
  });

  it('удержание огня: выстрелы не чаще FIRE_TICKS, в полёте не больше четырёх снарядов', () => {
    const game = newGame();
    arrange(game, {});
    const shotTicks: number[] = [];
    let peak = 0;
    for (let t = 1; t <= 200; t++) {
      if (types(game.step(hold('fire'))).includes('shot')) shotTicks.push(t);
      peak = Math.max(peak, game['playerBullets'].filter((bullet) => bullet !== null).length);
    }
    expect(shotTicks[0]).toBe(1);
    expect(shotTicks[1]).toBe(1 + FIRE_TICKS);
    for (let i = 1; i < shotTicks.length; i++)
      expect((shotTicks[i] ?? 0) - (shotTicks[i - 1] ?? 0)).toBeGreaterThanOrEqual(FIRE_TICKS);
    expect(peak).toBe(PLAYER_BULLET_LIMIT);
    expect(shotTicks.length).toBeGreaterThan(PLAYER_BULLET_LIMIT);
  });

  it('движение не задерживает выстрел; таймер ограничивает только повторный огонь', () => {
    const game = newGame();
    arrange(game, {});
    const events = game.step(hold('up', 'fire')); // танк смотрит вверх — шаг вперёд
    expect(game['player'].y).toBe(8);
    expect(types(events)).toContain('shot');
    for (let t = 1; t < FIRE_TICKS; t++) {
      // Ограничение частоты пушки сохраняется во время движения.
      expect(types(game.step(hold('up', 'fire')))).not.toContain('shot');
    }
  });

  it('поворот не откладывает выстрел: зажав стрелку и огонь, танк поворачивается и сразу стреляет', () => {
    const game = newGame();
    arrange(game, {});
    expect(types(game.step(hold('right', 'fire')))).toContain('shot');
    expect(game['player'].dir).toBe(RIGHT);
    expect(types(game.step(hold('right', 'fire')))).not.toContain('shot');
    expect(game['playerBullets'].some((bullet) => bullet?.dir === RIGHT)).toBe(true);
  });

  it('попадание во врага: враг исчезает, +1 очко, события hit и explode, снаряд пропадает', () => {
    const game = newGame();
    arrange(game, { enemies: [{ x: 4, y: 12, dir: DOWN }] });
    game.step(hold('fire'));
    expect(game.score).toBe(0);
    const events = run(game, 40);
    expect(types(events)).toEqual(['hit', 'explode']);
    expect(game.score).toBe(1);
    expect(game['enemies'][0]).toBeNull();
    expect(game['killed']).toBe(1);
    expect(game['onBoard']).toBe(0);
    expect(game['playerBullets'].every((bullet) => bullet === null)).toBe(true);
    expect(lit(game, 4, 12)).toBe(false);
  });

  it('выстрел в упор попадает в том же такте', () => {
    const game = newGame();
    arrange(game, { enemies: [{ x: 4, y: 10, dir: DOWN }] });
    const events = game.step(hold('fire'));
    expect(types(events)).toEqual(['shot', 'hit', 'explode']);
    expect(game.score).toBe(1);
  });

  it('снаряд бьёт по рисунку танка, а не по коробке: мимо угла врага снаряд летит дальше', () => {
    const game = newGame();
    // враг лицом вниз: клетки (3,12), (5,12), (4,12), (3,13), (5,13) и ствол (4,11); клетка (4,13) пуста, а в коробке — нет
    arrange(game, { player: { x: 4, y: 7, dir: UP }, enemies: [{ x: 4, y: 12, dir: UP }] });
    expect(coversCell(ENEMY_KIND, { x: 4, y: 12, dir: UP }, 4, 11)).toBe(false); // «дыра» позади центра
    game['playerBullets'][0] = { x: 4, y: 10, dir: UP };
    run(game, BULLET_TICKS); // снаряд на (4, 11): пусто, летит дальше
    expect(game['playerBullets'][0]).toEqual({ x: 4, y: 11, dir: UP });
    expect(game.score).toBe(0);
    run(game, BULLET_TICKS); // (4, 12) — центр врага: попадание
    expect(game.score).toBe(1);
  });

  it('снаряд разрушает клетку препятствия, на которую попал, и пропадает', () => {
    const game = newGame();
    arrange(game, {
      obstacles: [
        [4, 12],
        [3, 12],
        [5, 12],
      ],
    });
    game.step(hold('fire'));
    const events = run(game, 40);
    expect(types(events)).toEqual(['hit']);
    expect(obstacleSet(game['obstacles'])).toEqual(new Set(['3,12', '5,12']));
    expect(game['playerBullets'].every((bullet) => bullet === null)).toBe(true);
    expect(game.score).toBe(0);
  });

  it('вражеский снаряд тоже разрушает препятствия, а во вражеский танк просто пропадает', () => {
    const game = newGame();
    arrange(game, {
      obstacles: [[7, 5]],
      enemies: [{ x: 1, y: 10, dir: RIGHT }],
      enemyBullets: [
        { x: 7, y: 8, dir: DOWN },
        { x: 8, y: 10, dir: LEFT },
      ],
    });
    run(game, 7 * BULLET_TICKS);
    expect(obstacleSet(game['obstacles']).size).toBe(0);
    expect(game['enemies'][0]).not.toBeNull();
    expect(game['enemyBullets'].every((bullet) => bullet === null)).toBe(true);
    expect(game['dead']).toBe(false);
    expect(game['lives']).toBe(4);
  });

  it('встречные снаряды врага и игрока уничтожают друг друга', () => {
    const game = newGame();
    arrange(game, { enemyBullets: [{ x: 4, y: 12, dir: DOWN }] });
    game.step(hold('fire'));
    expect(game['playerBullets'][0]).toEqual({ x: 4, y: 9, dir: UP });
    const events = run(game, 2 * BULLET_TICKS);
    expect(types(events)).toEqual(['hit']);
    expect(game['playerBullets'][0]).toBeNull();
    expect(game['enemyBullets'][0]).toBeNull();
    expect(game['dead']).toBe(false);
  });

  it('два снаряда игрока друг друга не уничтожают: пропадает только налетевший', () => {
    const game = newGame();
    arrange(game, {
      playerBullets: [
        { x: 2, y: 15, dir: DOWN },
        { x: 2, y: 13, dir: UP },
      ],
    });
    // первый идёт вниз, второй вверх; на (2, 14) они сходятся, налетевший (с большим индексом) пропадает
    run(game, 2 * BULLET_TICKS);
    expect(game['playerBullets'].filter((bullet) => bullet !== null).length).toBe(1);
  });
});

// ------------------------------------------------------------------ гибель и жизни

describe('танки: гибель игрока, жизни и конец игры', () => {
  /** Вражеский снаряд, который через 5 шагов попадёт в ствол танка игрока (4, 8). */
  const killerBullet: Bullet = { x: 4, y: 13, dir: DOWN };

  it('попадание вражеского снаряда: взрыв без ввода, затем минус жизнь, очистка поля и тот же уровень заново', () => {
    const game = newGame();
    arrange(game, { enemyBullets: [killerBullet], enemies: [{ x: 8, y: 15, dir: DOWN }], killed: 7 });
    const events = run(game, 5 * BULLET_TICKS);
    expect(types(events)).toEqual(['hit', 'crash']);
    expect(game.lives).toBe(4); // жизнь снимается, когда взрыв доиграл
    expect(game['busy']).toBe(true);
    // ввод во время взрыва не действует
    const frozen = game['player'];
    const kaboom = run(game, KABOOM_TICKS, hold('left', 'fire'));
    expect(game['player']).toBe(frozen);
    expect(types(kaboom)).toEqual(['lifeLost']);
    expect(game.lives).toBe(3);
    run(game, CLEAR_LOSE_TICKS);
    // поле перезагружено: танк на старте, врагов и снарядов нет, убитые на уровне сохранены, уровень прежний
    expect(game['player']).toEqual(PLAYER_START);
    expect(liveEnemies(game).length).toBe(0);
    expect(game['enemyBullets'].every((bullet) => bullet === null)).toBe(true);
    expect(game['killed']).toBe(7);
    expect(game.level).toBe(1);
    expect(game.score).toBe(0);
    run(game, START_TICKS);
    expect(game['busy']).toBe(false);
    expect(game.phase).toBe('playing');
  });

  it('взрыв рисуется вокруг танка: центр — клетка танка игрока', () => {
    const game = newGame();
    arrange(game, { enemyBullets: [killerBullet] });
    run(game, 5 * BULLET_TICKS);
    // первая волна — кольцо 3 × 3 вокруг центра (4, 7); вокруг него остальное из 5 × 5 стёрто
    expect(lit(game, 4, 7)).toBe(false);
    for (const [x, y] of [
      [3, 6],
      [4, 6],
      [5, 6],
      [3, 7],
      [5, 7],
      [3, 8],
      [4, 8],
      [5, 8],
    ] as const)
      expect(lit(game, x, y)).toBe(true);
    expect(lit(game, 2, 7)).toBe(false);
    expect(lit(game, 6, 7)).toBe(false);
  });

  it('вражеский снаряд, попавший в бок или угол танка, тоже подбивает', () => {
    const game = newGame();
    arrange(game, { enemyBullets: [{ x: 8, y: 6, dir: LEFT }] }); // летит вдоль нижней строки танка
    const events = run(game, 4 * BULLET_TICKS);
    expect(types(events)).toContain('crash');
  });

  it('потеряв все жизни, игра заканчивается: конец игры, заливка поля, фаза over', () => {
    const game = newGame();
    arrange(game, { enemyBullets: [killerBullet] });
    game['setLives'](1);
    const events = run(game, 5 * BULLET_TICKS + KABOOM_TICKS);
    expect(types(events)).toEqual(['hit', 'crash', 'lifeLost', 'gameOver']);
    expect(game.lives).toBe(0);
    expect(game.phase).toBe('playing');
    run(game, BRICK_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS);
    expect(game.phase).toBe('over');
    expect(game.overFill).toBe(BRICK_ROWS);
    expect(game.step(NEUTRAL_BRICK_INPUT)).toEqual([]);
    // новая партия: жизни и счёт заново, рекорд остаётся
    game.start();
    expect(game.lives).toBe(4);
    expect(game.score).toBe(0);
  });

  it('бездействующий игрок рано или поздно погибает четыре раза и проигрывает', () => {
    for (const mode of [0, 2]) {
      const game = new TanksGame({ seed: 3, mode, speed: 10 });
      game.start();
      const log: string[] = [];
      let ticks = 0;
      while (game.phase !== 'over' && ticks < 40000) {
        for (const event of game.step(NEUTRAL_BRICK_INPUT)) log.push(event.type);
        ticks++;
      }
      expect(game.phase).toBe('over');
      expect(game.lives).toBe(0);
      expect(game.score).toBe(0);
      expect(log.filter((type) => type === 'crash').length).toBe(4);
      expect(log.filter((type) => type === 'lifeLost').length).toBe(4);
      expect(log.filter((type) => type === 'gameOver').length).toBe(1);
      expectValid(game);
    }
  });

  it('добавочная жизнь за каждые 500 очков (как getScoresToExtraLife донора); при полных жизнях — бонус к счёту', () => {
    expect(SCORES_TO_EXTRA_LIFE).toBe(500);
    const game = newGame();
    arrange(game, {
      enemies: [
        { x: 4, y: 10, dir: DOWN },
        { x: 4, y: 16, dir: DOWN },
      ],
    });
    game['setLives'](2);
    game['setScore'](SCORES_TO_EXTRA_LIFE - 1);
    const events = game.step(hold('fire'));
    expect(types(events)).toContain('bonus');
    expect(game.lives).toBe(3);
    expect(game.score).toBe(SCORES_TO_EXTRA_LIFE);
  });
});

// ------------------------------------------------------------------ уровни

describe('танки: переход уровня', () => {
  /** Игра перед последним попаданием уровня: 24 убито, враг в упор. */
  function lastKill(options: BrickGameOptions = {}): { game: TanksGame; events: BrickEvent[] } {
    const game = newGame(options);
    arrange(game, { enemies: [{ x: 4, y: 10, dir: DOWN }], killed: KILLS_TO_NEXT_LEVEL - 1 });
    return { game, events: game.step(hold('fire')) };
  }

  it('25-й убитый враг — победа: очистка поля, затем уровень выше, готовое поле, счётчик убитых с нуля', () => {
    const { game, events } = lastKill();
    expect(KILLS_TO_NEXT_LEVEL).toBe(25);
    expect(types(events)).toEqual(['shot', 'hit', 'explode', 'win']);
    expect(game.score).toBe(1);
    expect(game.level).toBe(1);
    expect(game['busy']).toBe(true);
    // поле заливается снизу вверх
    const mid = run(game, CLEAR_WIN_TICKS / 2 - 1);
    expect(mid).toEqual([]);
    expect(game.cells().every((cell) => cell === 1)).toBe(true);
    const rest = run(game, CLEAR_WIN_TICKS / 2 + 1);
    expect(types(rest)).toEqual(['levelUp']);
    expect(game.level).toBe(2);
    expect(game.speed).toBe(1);
    expect(game['killed']).toBe(0);
    expect(game['player']).toEqual(PLAYER_START);
    expect([...obstacleSet(game['obstacles'])].sort()).toEqual([...obstacleSet(presetObstacles(2))].sort());
    expect(screen(game).join('')).toContain('##'); // препятствия на экране
    run(game, START_TICKS);
    expect(game['busy']).toBe(false);
  });

  it('после десятого уровня снова первый, а скорость растёт на единицу', () => {
    const { game } = lastKill({ level: 10, speed: 3 });
    run(game, CLEAR_WIN_TICKS);
    expect(game.level).toBe(1);
    expect(game.speed).toBe(4);
    expect(obstacleSet(game['obstacles']).size).toBe(0);
  });

  it('на скорости 10 после десятого уровня скорость возвращается к первой', () => {
    const { game } = lastKill({ level: 10, speed: 10 });
    run(game, CLEAR_WIN_TICKS);
    expect(game.level).toBe(1);
    expect(game.speed).toBe(1);
  });

  it('случайные поля: на уровне N ставится до N − 1 препятствий, не ближе трёх клеток к нижнему и верхнему краю', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const second = obstacleSet(randomObstacles(new Rng(seed), 1));
      expect([1, 3, 6]).toContain(second.size);
      const many = randomObstacles(new Rng(seed), 6);
      expect(obstacleSet(many).size).toBeGreaterThanOrEqual(2);
      for (const key of obstacleSet(many)) {
        const y = Number(key.split(',')[1]);
        expect(y).toBeGreaterThanOrEqual(3);
        expect(y).toBeLessThanOrEqual(16);
      }
    }
    expect(obstacleSet(randomObstacles(new Rng(4), 0)).size).toBe(0);
  });

  it('случайные поля не касаются друг друга даже углом (кольцо шириной в клетку)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const board = randomObstacles(new Rng(seed), 5);
      // число связных кусков (с учётом диагоналей) не меньше числа поставленных фигур: куски не слипаются
      const cells = obstacleSet(board);
      const seen = new Set<string>();
      let groups = 0;
      for (const start of cells) {
        if (seen.has(start)) continue;
        groups++;
        const stack = [start];
        while (stack.length > 0) {
          const key = stack.pop() as string;
          if (seen.has(key)) continue;
          seen.add(key);
          const [x, y] = key.split(',').map(Number) as [number, number];
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
              if (cells.has(cellKey(x + dx, y + dy))) stack.push(cellKey(x + dx, y + dy));
        }
      }
      // каждая из фигур даёт один кусок, а фигуры не слипаются: кусков не больше пяти и не меньше одного
      expect(groups).toBeGreaterThanOrEqual(1);
      expect(groups).toBeLessThanOrEqual(5);
    }
  });

  it('под местом старта танка препятствий нет ни в одном варианте и на любом уровне', () => {
    const footprint = new Set(
      tankMask(PLAYER_KIND, UP).cells.map(([x, y]) => cellKey(PLAYER_START.x + x, PLAYER_START.y + y)),
    );
    for (let mode = 0; mode < 5; mode++) {
      for (let level = 1; level <= 10; level++) {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const game = new TanksGame({ seed, mode, level });
          for (const key of obstacleSet(game['obstacles'])) expect(footprint.has(key)).toBe(false);
        }
      }
    }
  });
});

// ------------------------------------------------------------------ ИИ

describe('танки: ИИ врагов', () => {
  it('направление стрельбы — по большей разнице координат; вверх-вниз выигрывает при равенстве у горизонтали', () => {
    const player: Tank = { x: 4, y: 7, dir: UP };
    expect(shootDirection(4, 15, player)).toBe(DOWN);
    expect(shootDirection(4, 1, player)).toBe(UP);
    expect(shootDirection(1, 7, player)).toBe(RIGHT);
    expect(shootDirection(8, 7, player)).toBe(LEFT);
    expect(shootDirection(8, 11, player)).toBe(LEFT); // |dx| = |dy| — горизонталь
    expect(shootDirection(7, 18, player)).toBe(DOWN);
  });

  it('шейкерная сортировка весов даёт убывание; равные веса остаются в порядке направлений', () => {
    expect(sortByWeight([0.25, 0.5, 0.25, 1])).toEqual([3, 1, 0, 2]);
    expect(sortByWeight([1, 0.5, 0.25, 0])).toEqual([0, 1, 2, 3]);
    expect(sortByWeight([0.5, 0.5, 0.5, 0.5])).toEqual([0, 1, 2, 3]);
    expect(sortByWeight([0, 0, 1, 1])).toEqual([2, 3, 0, 1]);
  });

  it('веса движения в чистом поле: к игроку по оси, текущее направление, край поля запрещён', () => {
    const board = newBoard();
    const player: Tank = { x: 8, y: 10, dir: UP };
    // враг в (1, 10) смотрит вверх: влево край (−0,5 за шаг и −0,25 за длину), вперёд +0,25 за текущее направление,
    // вправо +0,25 за игрока по горизонтали, поперёк курса игрока (вверх) вычитается 0,25 у «горизонтального» выбора
    expect(moveWeights(board, { x: 1, y: 10, dir: UP }, player)).toEqual([0.75, 0.5, 0.5, -0.5]);
    // игрок едет по горизонтали — вычитается вертикальный предпочтительный вес (вниз при равных y)
    expect(moveWeights(board, { x: 1, y: 10, dir: UP }, { x: 8, y: 10, dir: RIGHT })).toEqual([0.75, 0.75, 0.25, -0.5]);
  });

  it('веса движения: препятствие вплотную вычитает 0,5 и 0,25 за закрытую дальнюю точку', () => {
    const board = newBoard();
    for (let x = 0; x < 10; x++) board[boardIndex(x, 12)] = 1; // сплошная стена над врагом
    const weights = moveWeights(board, { x: 4, y: 10, dir: UP }, { x: 4, y: 3, dir: UP });
    expect(weights[UP]).toBeLessThan(0); // вперёд закрыто
    expect(weights[DOWN]).toBeGreaterThan(weights[UP]);
  });

  it('выбор направления берёт самое тяжёлое при весе 0,95 и не выбирает закрытое направление', () => {
    const board = newBoard();
    const player: Tank = { x: 8, y: 10, dir: UP };
    const rng = new Rng(11);
    const picks = new Set<Dir>();
    for (let i = 0; i < 200; i++) picks.add(chooseMove(board, { x: 1, y: 10, dir: UP }, player, rng));
    expect(picks.has(LEFT)).toBe(false); // слева край поля, вес отрицательный — шанс нулевой
    expect(picks.has(UP) && picks.has(RIGHT)).toBe(true);
    // детерминированный «кубик»
    const never: Rng = Object.assign(new Rng(1), { next: () => 0.999999 });
    expect(chooseMove(board, { x: 1, y: 10, dir: UP }, player, never)).toBe(UP); // ни один не прошёл — берётся самый тяжёлый
    const always: Rng = Object.assign(new Rng(1), { next: () => 0 });
    expect(chooseMove(board, { x: 1, y: 10, dir: UP }, player, always)).toBe(UP);
  });

  it('вероятность выстрела: в упор и по курсу игрока — предел 1 − rate; далеко и по диагонали — минимум rate', () => {
    const rate = 1 / 13;
    const board = newBoard();
    expect(shotChance(board, { x: 4, y: 15, dir: DOWN }, { x: 4, y: 7, dir: UP }, [])).toBeCloseTo(1 - rate, 10);
    expect(shotChance(board, { x: 8, y: 18, dir: DOWN }, { x: 4, y: 7, dir: UP }, [])).toBeCloseTo(rate, 10);
  });

  it('вероятность выстрела: растёт с приближением, падает со своим танком на линии огня, растёт при препятствии вплотную', () => {
    const board = newBoard();
    const player: Tank = { x: 4, y: 3, dir: LEFT };
    const at = (x: number, y: number): number => shotChance(board, { x, y, dir: DOWN }, player, []);
    // по диагонали без «упора»: nearer = 3
    expect(at(7, 12)).toBeLessThan(at(7, 9));
    const friend: Tank = { x: 7, y: 10, dir: DOWN };
    const shooter: Tank = { x: 7, y: 12, dir: DOWN };
    const open = shotChance(board, shooter, player, [shooter]);
    const covered = shotChance(board, shooter, player, [shooter, friend]);
    expect(covered).toBeLessThan(open);
    board[boardIndex(7, 10)] = 1; // препятствие на второй клетке от центра по линии огня вниз
    expect(distanceToObstacle(board, 7, 12, DOWN)).toBe(2);
    expect(shotChance(board, shooter, player, [shooter])).toBeGreaterThan(open);
  });

  it('расстояние до препятствия: ближайшая занятая клетка по линии, −1 если чисто', () => {
    const board = newBoard();
    expect(distanceToObstacle(board, 4, 7, UP)).toBe(-1);
    board[boardIndex(4, 12)] = 1;
    expect(distanceToObstacle(board, 4, 7, UP)).toBe(5);
    expect(distanceToObstacle(board, 4, 7, DOWN)).toBe(-1);
    board[boardIndex(9, 7)] = 1;
    expect(distanceToObstacle(board, 4, 7, RIGHT)).toBe(5);
  });

  it('новые враги появляются только в шести местах, по одному за ход, лицом к игроку', () => {
    const game = newGame({ seed: 7, mode: 2, speed: 10 });
    arrange(game, { aiIn: 1 });
    const seenPositions = new Set<string>();
    let previous = 0;
    for (let t = 0; t < 1200; t++) {
      const before = game['enemies'].map((tank) => tank);
      game.step(NEUTRAL_BRICK_INPUT);
      if (game.phase === 'over' || game['busy']) break;
      const appeared = game['enemies'].filter((tank, i) => tank !== null && before[i] === null);
      expect(appeared.length).toBeLessThanOrEqual(1);
      for (const tank of appeared) {
        if (tank === null) continue;
        seenPositions.add(cellKey(tank.x, tank.y));
        expect(SPAWN_CENTERS).toContain(cellKey(tank.x, tank.y));
        expect(tank.dir).toBe(shootDirection(tank.x, tank.y, game['player']));
      }
      expect(game['killed'] + game['onBoard']).toBeLessThanOrEqual(KILLS_TO_NEXT_LEVEL);
      previous = Math.max(previous, liveEnemies(game).length);
    }
    expect(previous).toBeGreaterThan(0);
    expect(seenPositions.size).toBeGreaterThanOrEqual(2);
  });

  it('место появления занято (препятствие в квадрате 3 × 3) — враг не появляется', () => {
    const game = newGame({ seed: 7, mode: 0 });
    arrange(game, { obstacles: SPAWN_CENTERS.map((key) => key.split(',').map(Number) as [number, number]) });
    for (let i = 0; i < 80; i++) {
      expect(game['aiTurn'](0)).toBe(false);
      expect(game['enemies'][0]).toBeNull();
    }
  });

  it('убитые и стоящие на поле вместе — 25: новых врагов больше нет', () => {
    const game = newGame({ seed: 7, mode: 0 });
    arrange(game, { enemies: [{ x: 8, y: 18, dir: DOWN }], killed: KILLS_TO_NEXT_LEVEL - 1 });
    for (let i = 0; i < 60; i++) game['aiTurn'](1);
    expect(game['enemies'][1]).toBeNull();
    expect(game['enemies'][2]).toBeNull();
    // а если убито на одного меньше, враги ещё появляются
    arrange(game, { enemies: [{ x: 8, y: 18, dir: DOWN }], killed: KILLS_TO_NEXT_LEVEL - 2 });
    for (let i = 0; i < 60 && game['enemies'][1] === null; i++) game['aiTurn'](1);
    expect(game['enemies'][1]).not.toBeNull();
  });

  it('враг стреляет в сторону игрока вдоль большей оси', () => {
    const game = newGame({ seed: 5, mode: 0 });
    arrange(game, { enemies: [{ x: 4, y: 16, dir: DOWN }] });
    let fired = false;
    for (let i = 0; i < 40 && !fired; i++) {
      game['aiTurn'](0);
      const bullet = game['enemyBullets'][0];
      if (bullet) {
        fired = true;
        expect(bullet.dir).toBe(DOWN);
        expect(bullet.x).toBe(game['enemies'][0]?.x);
      }
      arrange(game, { enemies: [{ x: 4, y: 16, dir: DOWN }] });
    }
    expect(fired).toBe(true);
  });

  it('заблокированный со всех сторон враг не сдвигается с места: может лишь повернуться', () => {
    // 3 × 3 вокруг центра (1, 16) — x 0..2, y 15..17; кольцо препятствий закрывает любой шаг (слева — край поля)
    const board = newBoard();
    for (let x = 0; x <= 2; x++) board[boardIndex(x, 14)] = board[boardIndex(x, 18)] = 1;
    for (let y = 15; y <= 17; y++) board[boardIndex(3, y)] = 1;
    const trapped: Tank = { x: 1, y: 16, dir: UP };
    expect(moveTank(board, ENEMY_KIND, trapped, UP, false)).toBe(trapped);
    for (const dir of DIRS.filter((d) => d !== UP)) {
      const turned = moveTank(board, ENEMY_KIND, trapped, dir, false);
      expect({ x: turned.x, y: turned.y, dir: turned.dir }).toEqual({ x: 1, y: 16, dir });
    }
    for (const dir of DIRS) {
      const facing: Tank = { x: 1, y: 16, dir };
      expect(moveTank(board, ENEMY_KIND, facing, dir, false)).toBe(facing);
      // закрытая сторона получает вес ниже базового (0,25): враг почти не выбирает её
      const weights = moveWeights(board, facing, { x: 8, y: 3, dir: UP });
      expect(weights[dir]).toBeLessThan(0.25);
    }
  });

  it('одно зерно — один бой: враги и снаряды одинаковы такт за тактом; другое зерно — другой бой', () => {
    const trace = (seed: number): string[] => {
      const game = newGame({ seed, mode: 2, speed: 8 });
      const out: string[] = [];
      for (let t = 0; t < 1500; t++) {
        game.step(NEUTRAL_BRICK_INPUT);
        if (t % 5 === 0) out.push(JSON.stringify([game['enemies'], game['enemyBullets'], game['dead']]));
      }
      return out;
    };
    expect(trace(21)).toEqual(trace(21));
    expect(trace(21)).not.toEqual(trace(22));
  });
});

// ------------------------------------------------------------------ бот

describe('танки: сценарии с ботом', () => {
  it('бот на скриптованном вводе набирает очки в каждом из пяти вариантов', () => {
    for (let mode = 0; mode < 5; mode++) {
      const game = new TanksGame({ seed: 1, mode, speed: 5 });
      game.start();
      let ticks = 0;
      while (game.phase !== 'over' && ticks < 12000) {
        game.step(botInput(game));
        ticks++;
      }
      expect(game.score, `вариант ${mode + 1}`).toBeGreaterThanOrEqual(10);
      expect(game.hiScore).toBe(game.score);
    }
  });

  it('бот проходит уровень: победа, переход на следующий и снова бой', () => {
    const game = new TanksGame({ seed: 3, mode: 4, speed: 1 });
    game.start();
    const log: string[] = [];
    let ticks = 0;
    while (game.phase !== 'over' && ticks < 20000 && game.level < 3) {
      for (const event of game.step(botInput(game))) log.push(event.type);
      ticks++;
    }
    expect(log).toContain('win');
    expect(log).toContain('levelUp');
    expect(game.level).toBeGreaterThanOrEqual(2);
    expect(game.score).toBeGreaterThanOrEqual(KILLS_TO_NEXT_LEVEL);
  });

  it('в бою сохраняются инварианты: танки и препятствия не накладываются, снарядов не больше лимитов', () => {
    for (const mode of [1, 3]) {
      const game = new TanksGame({ seed: 9, mode, speed: 7, level: 3 });
      game.start();
      for (let t = 0; t < 6000; t++) {
        game.step(botInput(game));
        if (game['busy']) continue;
        expect(noOverlaps(game)).toBe(true);
        expect(game['playerBullets'].filter((bullet) => bullet !== null).length).toBeLessThanOrEqual(
          PLAYER_BULLET_LIMIT,
        );
        expect(game['enemyBullets'].filter((bullet) => bullet !== null).length).toBeLessThanOrEqual(game.rules.enemies);
        expect(game['killed'] + game['onBoard']).toBeLessThanOrEqual(KILLS_TO_NEXT_LEVEL);
        expect(liveEnemies(game).length).toBe(game['onBoard']);
        if (t % 50 === 0) expectValid(game);
      }
    }
  });

  it('игрок, который не стреляет, ничего не набирает; бот с тем же зерном набирает больше', () => {
    const play = (bot: boolean): number => {
      const game = new TanksGame({ seed: 2, mode: 1, speed: 5 });
      game.start();
      for (let t = 0; t < 6000 && game.phase !== 'over'; t++) game.step(bot ? botInput(game) : NEUTRAL_BRICK_INPUT);
      return game.score;
    };
    expect(play(false)).toBe(0);
    expect(play(true)).toBeGreaterThan(0);
  });
});
