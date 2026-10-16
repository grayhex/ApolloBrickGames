/**
 * Регрессии по ревью Brick Game (R01–R14): каждый дефект сначала воспроизводится красным тестом на исходном SHA, затем исправляется.
 * Ожидаемые правила здесь записаны независимо от реализации (размеры, клетки, очки), а не выведены из её констант.
 */
import { describe, expect, it } from 'vitest';
import { RoadGame, ShooterGame } from '../../../src/brick/games/library/action';
import { JigsawGame, SolitaireGame } from '../../../src/brick/games/library/puzzles';
import { NEUTRAL_BRICK_INPUT, makeBrickInput, type BrickAction, type BrickEvent, type BrickGame } from '../../../src/brick';
import { findSafePath } from '../safePath';

const run = (g: BrickGame, n: number): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
  return events;
};
/** Нажатие и отпускание одной кнопки: два такта (фронт и тишина), чтобы автоповтор не сработал. */
const tap = (g: BrickGame, action: BrickAction): BrickEvent[] => [...g.step(makeBrickInput([action])), ...g.step(NEUTRAL_BRICK_INPUT)];
/** Удержание кнопки `ticks` тактов (первый — фронт нажатия), затем отпускание. */
const hold = (g: BrickGame, action: BrickAction, ticks: number, also: BrickAction[] = []): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...g.step(i === 0 ? makeBrickInput([action, ...also]) : makeBrickInput([], [action, ...also])));
  events.push(...g.step(NEUTRAL_BRICK_INPUT));
  return events;
};

// ── R01: Jigsaw проходится кнопками корпуса (без отдельной клавиши «огонь») ───────────────────────────────────────────────────────

interface Placement {
  turns: number;
  x: number;
  y: number;
}
type Shape = number[][];
const normalise = (shape: Shape): Shape => {
  const minX = Math.min(...shape.map((p) => p[0]!));
  const minY = Math.min(...shape.map((p) => p[1]!));
  return shape.map(([x, y]) => [x! - minX, y! - minY]);
};
const turnShape = (shape: Shape): Shape => normalise(shape.map(([x, y]) => [-y!, x!]));

/** Решение пазла перебором (независимо от игры): для каждой фигуры — число поворотов и положение угла рамки. */
function solveJigsaw(pieces: Shape[]): Placement[] | null {
  const search = (index: number, mask: number, placed: Placement[]): Placement[] | null => {
    if (index === pieces.length) return mask === 0xffff ? placed : null;
    let shape = normalise(pieces[index]!.map((p) => [...p]));
    for (let turns = 0; turns < 4; turns++) {
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          if (shape.some(([dx, dy]) => x + dx! >= 4 || y + dy! >= 4)) continue;
          const bits = shape.reduce((m, [dx, dy]) => m | (1 << ((y + dy!) * 4 + x + dx!)), 0);
          if (bits & mask) continue;
          const rest = search(index + 1, mask | bits, [...placed, { turns, x, y }]);
          if (rest) return rest;
        }
      }
      shape = turnShape(shape);
    }
    return null;
  };
  return search(0, 0, []);
}

describe('R01 Jigsaw: полное прохождение только кнопками корпуса (вверх, вниз, влево, вправо, ROTATE)', () => {
  /** Что умеет корпус: четыре стрелки и ROTATE (`rotate`); RESET уходит в меню оболочки и в игру не попадает. */
  const BODY: readonly BrickAction[] = ['left', 'right', 'up', 'down', 'rotate'];
  const bodyOnly = (g: BrickGame, action: BrickAction, ticks = 1, also: BrickAction[] = []): BrickEvent[] => {
    expect(BODY).toContain(action);
    for (const extra of also) expect(BODY).toContain(extra);
    return ticks <= 1 ? tap(g, action) : hold(g, action, ticks, also);
  };

  it('четыре L-фигуры укладываются в квадрат без клавиши «огонь», игра переходит на следующий уровень', () => {
    const g = new JigsawGame({ seed: 3 });
    g.start();
    const plan = solveJigsaw(g['pieces'] as Shape[]);
    expect(plan).not.toBeNull();
    const events: BrickEvent[] = [];
    for (const step of plan!) {
      for (let i = 0; i < step.turns; i++) events.push(...bodyOnly(g, 'rotate'));
      for (let x = 0; x < step.x; x++) events.push(...bodyOnly(g, 'right'));
      for (let y = 0; y < step.y; y++) events.push(...bodyOnly(g, 'down'));
      events.push(...bodyOnly(g, 'rotate', 40)); // удержание ROTATE укладывает фигуру
    }
    expect(events).toContainEqual({ type: 'win' });
    run(g, 80); // сценка победы
    expect(g.level).toBe(2);
    expect(g.score).toBeGreaterThanOrEqual(100);
  });

  it('короткое нажатие ROTATE только поворачивает и ничего не укладывает', () => {
    const g = new JigsawGame({ seed: 3 });
    g.start();
    const before = JSON.stringify(g.shape);
    bodyOnly(g, 'rotate');
    expect(g.pieceIndex).toBe(0);
    expect(JSON.stringify(g.shape)).not.toBe(before);
    expect(g.board.some(Boolean)).toBe(false);
  });

  it('ошибочная укладка не тупик: удержание ROTATE вместе с DOWN начинает задачу заново, а не выходит из игры', () => {
    const g = new JigsawGame({ seed: 3 });
    g.start();
    bodyOnly(g, 'rotate', 40);
    expect(g.board.some(Boolean)).toBe(true);
    bodyOnly(g, 'rotate', 40, ['down']);
    expect(g.board.some(Boolean)).toBe(false);
    expect(g.pieceIndex).toBe(0);
    expect(g.phase).toBe('playing');
  });

  it('клавиатура по-прежнему укладывает фигуру сразу клавишей «огонь», а сброс — «огонь» вместе с DOWN', () => {
    const g = new JigsawGame({ seed: 3 });
    g.start();
    tap(g, 'fire');
    expect(g.board.some(Boolean)).toBe(true);
    g.step(makeBrickInput(['fire'], ['down']));
    expect(g.board.some(Boolean)).toBe(false);
  });
});

// ── R02: Racing Pickup — без обязательной потери жизни из-за стены, которую нечем разрушить ───────────────────────────────────

describe('R02 Racing Pickup: стена не появляется, пока нечем её разрушить', () => {
  const noWallWithoutGun = (game: BrickGame): string | null => {
    const g = game as RoadGame;
    return g.obstacles.some((o) => o.kind < 0) && !g.hasGun ? `такт ${g.tick}: стена при отсутствии дальнего оружия` : null;
  };
  const search = (seed: number, speed: number, horizon: number) => {
    const g = new RoadGame('racing-pickup', { seed, speed, level: 1 });
    g.start();
    return findSafePath(g, { horizon, stride: 2, alwaysHeld: ['fire'], moves: [['left'], ['right']], invariant: noWallWithoutGun, budget: 60_000 });
  };

  it('seed 5 больше не начинается со стены: до зоны столкновения стены нет и безопасный путь существует', () => {
    const g = new RoadGame('racing-pickup', { seed: 5, speed: 1, level: 1 });
    g.start();
    for (let t = 0; t < 600; t++) {
      g.step(NEUTRAL_BRICK_INPUT);
      expect(g.obstacles.every((o) => o.kind >= 0) || g.hasGun, `такт ${t}: стена без оружия`).toBe(true);
    }
    const result = search(5, 1, 900);
    expect(result.violation).toBeNull();
    expect(result.found, 'безопасная последовательность вводов').toBe(true);
  });

  it('набор зёрен и скоростей: инвариант «стена только при дальнем оружии» не нарушается и безопасный путь есть', () => {
    for (const speed of [1, 4, 7, 10]) {
      for (let seed = 1; seed <= 10; seed++) {
        const result = search(seed, speed, 1200);
        expect(result.violation, `speed ${speed} seed ${seed}`).toBeNull();
        expect(result.found, `speed ${speed} seed ${seed}: путь без потери жизни (посещено ${result.visited})`).toBe(true);
      }
    }
  });

  it('стена после выдачи оружия разрушаема выстрелом: игрок с оружием, удерживая огонь, проходит стену без потери жизни', () => {
    const g = new RoadGame('racing-pickup', { seed: 5, speed: 1, level: 1 });
    g.start();
    g.hasGun = true;
    g.weapon = 1;
    g.obstacles = [{ x: 4, y: 0, kind: -1 }];
    for (let t = 0; t < 400; t++) g.step(makeBrickInput([], ['fire']));
    expect(g.lives).toBe(4);
    expect(g.obstacles.every((o) => o.kind >= 0)).toBe(true);
  });

  it('удар о стену по-прежнему стоит жизни (правило не ослаблено), если оружие есть, но игрок не стреляет', () => {
    const g = new RoadGame('racing-pickup', { seed: 5 });
    g.start();
    g.hasGun = true;
    g.obstacles = [{ x: 4, y: 15, kind: -1 }];
    run(g, 30);
    expect(g.lives).toBe(3);
  });
});

// ── R03: RoadGame — столкновение определяется видимыми клетками ───────────────────────────────────────────────────────────────

describe('R03 RoadGame: столкновение совпадает с видимыми клетками', () => {
  /** Клетки, как они нарисованы: у игрока (x,17), (x,18), (x−1,19), (x+1,19); у машины-препятствия (x,y), (x−1,y+1), (x,y+1), (x+1,y+1). */
  const lost = (id: 'obstacle-race' | 'racing-pickup', x: number, obstacle: { x: number; y: number; kind: number }): boolean => {
    const g = new RoadGame(id);
    g.start();
    g.x = x;
    g.obstacles = [obstacle];
    g.step(NEUTRAL_BRICK_INPUT);
    return g.lives === 3;
  };

  it('видимо пересекающиеся спрайты — столкновение: игрок x=4, машина x=6, y=18 (общая клетка (5,19))', () => {
    expect(lost('racing-pickup', 4, { x: 6, y: 18, kind: 0 })).toBe(true);
  });

  it('спрайты, не имеющие общих клеток, — не столкновение: игрок x=4, машина x=4, y=19 (в центре нижнего ряда у игрока пусто)', () => {
    expect(lost('racing-pickup', 4, { x: 4, y: 19, kind: 0 })).toBe(false);
  });

  it('соседняя полоса не задевает: игрок x=4, машина x=7 на любой высоте', () => {
    for (let y = 0; y <= 20; y++) expect(lost('racing-pickup', 4, { x: 7, y, kind: 0 }), `y=${y}`).toBe(false);
  });

  it('все взаимные положения: столкновение ровно тогда, когда у спрайтов есть общая клетка', () => {
    const player = (x: number): Set<string> => new Set([`${x},17`, `${x},18`, `${x - 1},19`, `${x + 1},19`]);
    const car = (x: number, y: number): Set<string> => new Set([`${x},${y}`, `${x - 1},${y + 1}`, `${x},${y + 1}`, `${x + 1},${y + 1}`]);
    for (let px = 1; px <= 8; px++) {
      for (let cx = 1; cx <= 8; cx++) {
        for (let cy = 0; cy <= 20; cy++) {
          const overlap = [...car(cx, cy)].some((cell) => player(px).has(cell));
          expect(lost('racing-pickup', px, { x: cx, y: cy, kind: 0 }), `игрок ${px}, машина (${cx},${cy})`).toBe(overlap);
        }
      }
    }
  });

  it('извилистая трасса: стенка, задевающая клетку игрока на любой из строк 17–19, — столкновение; в стороне — нет', () => {
    // Клетки игрока при x = 4: (4,17), (4,18), (3,19), (5,19). Левая стенка — колонка road[y], правая — road[y] + 5.
    const hitColumn: Record<number, number> = { 17: 4, 18: 4, 19: 3 };
    for (const row of [17, 18, 19]) {
      const g = new RoadGame('obstacle-race');
      g.start();
      g.road.fill(1); // коридор колонок 2–5 вокруг игрока свободен: левая стенка в колонке 1, правая в 6
      g.road[row] = hitColumn[row]!;
      g.x = 4;
      g.step(NEUTRAL_BRICK_INPUT);
      expect(g.lives, `строка ${row}`).toBe(3);
    }
    const clear = new RoadGame('obstacle-race');
    clear.start();
    clear.road.fill(1);
    clear.x = 4;
    clear.step(NEUTRAL_BRICK_INPUT);
    expect(clear.lives).toBe(4);
  });
});

// ── R04: Talking Shooting — цели не склеиваются в одну клетку ────────────────────────────────────────────────────────────────

describe('R04 Talking Shooting: строй у нижней границы сохраняет форму и уникальные клетки', () => {
  it('столбец из двух клеток у границы не сжимается в одну точку', () => {
    const g = new ShooterGame('talking-shooting');
    g.start();
    g.targets = [{ x: 9, y: 16 }, { x: 9, y: 17 }];
    run(g, 120); // хотя бы один шаг строя вниз (период у скорости 1 — 45 тактов)
    const keys = new Set(g.targets.map((p) => `${p.x},${p.y}`));
    expect(g.targets).toHaveLength(2);
    expect(keys.size).toBe(2);
    expect(Math.abs(g.targets[0]!.y - g.targets[1]!.y)).toBe(1);
  });

  it('при спуске у нижней границы формация идёт целиком: общий нижний край не выходит за строку 17, форма сохраняется', () => {
    const g = new ShooterGame('talking-shooting');
    g.start();
    g.targets = [{ x: 9, y: 15 }, { x: 8, y: 16 }, { x: 9, y: 16 }, { x: 9, y: 17 }];
    const shape = (): string => {
      const minY = Math.min(...g.targets.map((p) => p.y));
      const minX = Math.min(...g.targets.map((p) => p.x));
      return g.targets.map((p) => `${p.x - minX},${p.y - minY}`).sort().join(' ');
    };
    const before = shape();
    for (let i = 0; i < 400; i++) {
      g.step(NEUTRAL_BRICK_INPUT);
      if (g.phase !== 'playing' || g.lives !== 4) break;
      expect(new Set(g.targets.map((p) => `${p.x},${p.y}`)).size, `такт ${i}`).toBe(4);
      expect(Math.max(...g.targets.map((p) => p.y))).toBeLessThanOrEqual(17);
      expect(shape()).toBe(before);
    }
  });
});

// ── R06: Peg Solitaire — повтор задачи не копит очки ───────────────────────────────────────────────────────────────────────────

describe('R06 Peg Solitaire: повтор задачи не позволяет набирать счёт', () => {
  const jump = (g: SolitaireGame): void => {
    g.cursor = 10;
    tap(g, 'rotate'); // взять фишку 10
    g.cursor = 24;
    tap(g, 'rotate'); // перепрыгнуть через 17 в пустой центр
  };

  it('прыжок даёт десять очков, двадцать повторов первого прыжка не дают больше', () => {
    const g = new SolitaireGame();
    g.start();
    jump(g);
    expect(g.score).toBe(10);
    for (let i = 0; i < 20; i++) {
      tap(g, 'fire'); // повтор задачи
      jump(g);
    }
    expect(g.score).toBe(10);
    expect(g.hiScore).toBe(10);
  });

  it('повтор возвращает поле и очки к началу задачи', () => {
    const g = new SolitaireGame();
    g.start();
    jump(g);
    tap(g, 'fire');
    expect(g.pegs.size).toBe(32);
    expect(g.score).toBe(0);
  });

  it('очки уже решённых задач повтор следующей не отбирает', () => {
    const g = new SolitaireGame();
    g.start();
    g.pegs = new Set([10, 17]); // фишка 10 перепрыгивает 17 в центр 24: остаётся одна — победа
    g.cursor = 10;
    tap(g, 'rotate');
    g.cursor = 24;
    tap(g, 'rotate'); // остаётся одна фишка — победа, +10 за прыжок и +100
    run(g, 80);
    const solved = g.score;
    expect(solved).toBe(110);
    expect(g.level).toBe(2);
    jump(g);
    tap(g, 'fire');
    expect(g.score).toBe(solved);
  });
});
