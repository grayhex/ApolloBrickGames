/**
 * Регрессии по ревью Brick Game (R01–R14): каждый дефект сначала воспроизводится красным тестом на исходном SHA, затем исправляется.
 * Ожидаемые правила здесь записаны независимо от реализации (размеры, клетки, очки), а не выведены из её констант.
 */
import { describe, expect, it } from 'vitest';
import { RoadGame, ShooterGame } from '../../../src/brick/games/library/action';
import { CapsuleGame } from '../../../src/brick/games/library/falling';
import { PadsGame } from '../../../src/brick/games/library/arcade';
import { cueFor } from '../../../src/app/cabinet';
import { JigsawGame, MAX_TILE_EXPONENT, MergeGame, SolitaireGame, slideTiles, tileGlyph } from '../../../src/brick/games/library/puzzles';
import { NEUTRAL_BRICK_INPUT, makeBrickInput, type BrickAction, type BrickEvent, type BrickGame } from '../../../src/brick';
import { findSafePath } from '../safePath';
import defaults from '../../../src/config/default.json';
import { validateConfig } from '../../../src/config/schema';
import { APOLLO_IDS, TOYS } from '../../../src/app/toys';
import { bodyActions, canAssign, missingButtons } from '../../../src/app/bodyButtons';
import { LIBRARY_GAMES } from '../../../src/brick/games/library';
import { solveJigsaw, type JigsawShape } from '../jigsawSolver';

const run = (g: BrickGame, n: number): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
  return events;
};
/** Нажатие и отпускание одной кнопки: два такта (фронт и тишина), чтобы автоповтор не сработал. */
const tap = (g: BrickGame, action: BrickAction): BrickEvent[] => [...g.step(makeBrickInput([action])), ...g.step(NEUTRAL_BRICK_INPUT)];
// ── R01: Jigsaw проходится кнопками корпуса (без отдельной клавиши «огонь») ───────────────────────────────────────────────────────

describe('R01 Jigsaw: нужна кнопка «огонь», которой на корпусе нет, — игра не назначается игрушкам', () => {
  it('правила не изменены: фигуры укладываются «огнём», игра решаема и ведёт на следующий уровень (проверка ядра, не корпуса)', () => {
    const g = new JigsawGame({ seed: 3 });
    g.start();
    const plan = solveJigsaw(g['pieces'] as JigsawShape[]);
    expect(plan).not.toBeNull();
    const events: BrickEvent[] = [];
    for (const step of plan!) {
      for (let i = 0; i < step.turns; i++) events.push(...tap(g, 'rotate'));
      for (let x = 0; x < step.x; x++) events.push(...tap(g, 'right'));
      for (let y = 0; y < step.y; y++) events.push(...tap(g, 'down'));
      events.push(...tap(g, 'fire'));
    }
    expect(events).toContainEqual({ type: 'win' });
    run(g, 80);
    expect(g.level).toBe(2);
  });

  it('без «огня» (только стрелки и ROTATE, как на корпусе) фигуру уложить нельзя — поэтому игра объявляет, что ей нужна эта кнопка', () => {
    const g = new JigsawGame({ seed: 3 });
    g.start();
    for (let i = 0; i < 400; i++) g.step(makeBrickInput([(['left', 'right', 'up', 'down', 'rotate'] as const)[i % 5]!]));
    expect(g.board.some(Boolean)).toBe(false);
    expect(LIBRARY_GAMES.jigsaw.needs).toEqual(['fire']);
  });

  it('игра не назначается ни одной игрушке: схема конфигурации отклоняет её, а в списке «Добавить игру» админки её нет', () => {
    for (const toy of APOLLO_IDS.filter((id) => id !== 'mario')) {
      expect(canAssign(LIBRARY_GAMES.jigsaw, TOYS[toy]), toy).toBe(false);
      expect(missingButtons(LIBRARY_GAMES.jigsaw, TOYS[toy]), toy).toEqual(['fire']);
      const config = validateConfig(defaults);
      config.toys[toy].games = [{ id: 'jigsaw' }];
      config.toys[toy].defaultGame = 'jigsaw';
      expect(() => validateConfig(config), toy).toThrow(/нужна кнопка «fire»/);
    }
  });

  it('кнопки корпуса игрушек 1–4 — стрелки и ROTATE; RESET корпуса отдельным «огнём» не считается', () => {
    for (const toy of APOLLO_IDS.filter((id) => id !== 'mario')) expect([...bodyActions(TOYS[toy])].sort(), toy).toEqual(['down', 'left', 'right', 'rotate', 'up']);
  });

  it('все остальные игры библиотеки назначаются любой консоли: единственный запрет — у Jigsaw', () => {
    const blocked = Object.values(LIBRARY_GAMES).filter((def) => !canAssign(def, TOYS.tank168)).map((def) => def.id);
    expect(blocked).toEqual(['jigsaw']);
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

// ── R05: Dr. Mario — полный поворот капсулы и связи половинок при падении ─────────────────────────────────────────────────────────

describe('R05 Dr. Mario: капсула из двух связанных половинок', () => {
  const capsule = (): CapsuleGame => {
    const g = new CapsuleGame('dr-mario', { seed: 3 });
    g.start();
    g.board.fill(0);
    g.link.fill(-1);
    g.viruses = new Set([35]); // дальний вирус: партия не заканчивается победой, пока проверяется падение
    g.board[35] = 3;
    g.piece = [1, 2];
    g.x = 1;
    g.y = 3;
    g.orientation = 0;
    return g;
  };
  const at = (g: CapsuleGame): string => g.capsuleCells().map((c) => `${c.cell}:${c.color}`).sort().join(' ');

  it('четыре поворота дают четыре разных положения с правильным порядком половинок и возвращают капсулу в исходное', () => {
    const g = capsule();
    const seen: string[] = [at(g)];
    for (let i = 0; i < 4; i++) { tap(g, 'rotate'); seen.push(at(g)); }
    // клетки 13 и 14 — горизонтально (y=3, x=1,2); вертикально — 13 и 17.
    expect(seen).toEqual(['13:1 14:2', '13:1 17:2', '13:2 14:1', '13:2 17:1', '13:1 14:2']);
    expect(new Set(seen.slice(0, 4)).size).toBe(4);
  });

  it('у стенки поворот, которому нет места, не сдвигает капсулу: положение не меняется и подаётся сигнал «нельзя»', () => {
    const g = capsule();
    g.orientation = 1; // вертикально у правого края: после поворота нужно две клетки вправо
    g.x = 3;
    const before = at(g);
    const events = tap(g, 'rotate');
    expect(at(g)).toBe(before);
    expect(events).toContainEqual({ type: 'blocked' });
  });

  it('капсула, одной половинкой лежащая на опоре, остаётся горизонтальной (половинки связаны): вторая не падает отдельно', () => {
    const g = capsule();
    g.board[32] = 2; // опора под левой половинкой в нижнем ряду
    g.viruses.add(32);
    g.y = 7;
    g.x = 0;
    for (let i = 0; i < 300 && g.board[28] === 0; i++) g.step(NEUTRAL_BRICK_INPUT);
    expect(g.board[28]).toBe(1);
    expect(g.board[29]).toBe(2);
    expect(g.board[33]).toBe(0); // под правой половинкой пусто, но она висит вместе с левой
    run(g, 5);
    expect(g.board[29]).toBe(2);
  });

  it('очистка одной половинки отпускает вторую: оставшаяся падает, остальные клетки и вирусы стоят', () => {
    const g = capsule();
    g.board[28] = 1; g.board[29] = 2; g.link[28] = 29; g.link[29] = 28; // связанная пара в седьмой строке
    for (const p of [20, 24, 32]) g.board[p] = 1; // вертикаль из четырёх единиц в колонке 0 (с клеткой 28)
    g.resolve();
    expect([20, 24, 28, 32].every((p) => g.board[p] === 0)).toBe(true);
    expect(g.board[29]).toBe(0);
    expect(g.board[33]).toBe(2); // оставшаяся половинка упала на одну строку
    expect(g.board[35]).toBe(3);
    expect(g.viruses.has(35)).toBe(true);
  });

  it('падение запускается после посадки, а не только после совпадения: порядок «посадка → падение → совпадения → каскад»', () => {
    const g = capsule();
    // Висящая одиночная клетка без связи должна осесть при любом разборе поля, даже если совпадений нет.
    g.board[9] = 2;
    g.resolve();
    expect(g.board[9]).toBe(0);
    expect(g.board[33]).toBe(2);
  });

  it('вирусы закреплены, каскад завершается, а когда исчез последний вирус — победа', () => {
    const g = capsule();
    g.board[35] = 0;
    g.viruses = new Set([32]); // единственный вирус — единица в левом столбце внизу
    g.board[32] = 1; g.board[28] = 1;
    g.piece = [1, 1]; g.orientation = 1; g.x = 0; g.y = 0; // вертикальная пара единиц падает на 28 и вместе с 32 даёт четвёрку
    const events: BrickEvent[] = [];
    for (let i = 0; i < 600 && !events.some((e) => e.type === 'win'); i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
    expect(events).toContainEqual({ type: 'win' });
    expect(g.viruses.size).toBe(0);
  });

  it('вирус не падает: под ним пусто, но он остаётся на месте', () => {
    const g = capsule();
    g.viruses = new Set([20]);
    g.board[20] = 3; // вирус в воздухе (под ним пусто)
    g.resolve();
    expect(g.board[20]).toBe(3);
  });

  it('переполнение горлышка завершает партию', () => {
    const g = capsule();
    const left = [1, 2, 3, 1, 2, 3, 1, 2], right = [2, 3, 1, 2, 3, 1, 2, 3]; // столбцы 1 и 2 набиты доверху (без совпадений) — строки 1–8
    for (let row = 1; row <= 8; row++) { g.board[row * 4 + 1] = left[row - 1]!; g.board[row * 4 + 2] = right[row - 1]!; }
    g.y = 0;
    const events: BrickEvent[] = [];
    for (let i = 0; i < 300 && g.phase === 'playing'; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
    expect(events).toContainEqual({ type: 'gameOver' });
  });
});

// ── R07: 2048 — однозначное изображение плиток ──────────────────────────────────────────────────────────────────────────────────

describe('R07 2048: плитки различимы на экране для всего поддерживаемого диапазона', () => {
  const picture = (exponent: number): string => {
    const g = new MergeGame({ seed: 3 });
    g.start();
    g.board.fill(0);
    g.board[0] = exponent;
    const rows: string[] = [];
    const cells = g.cells();
    for (let y = 0; y < 4; y++) rows.push(`${cells[y * 10 + 1] ? '#' : '.'}${cells[y * 10 + 2] ? '#' : '.'}`);
    return rows.join(' ');
  };

  it('рисунки для 2, 4, 16, 128, 1024, 2048 — заданные (по клеткам рамки 2 × 4)', () => {
    expect(picture(1)).toBe('## #. #. #.'); // 2
    expect(picture(2)).toBe('#. ## #. #.'); // 4
    expect(picture(4)).toBe('#. #. ## #.'); // 16
    expect(picture(7)).toBe('## ## ## #.'); // 128
    expect(picture(10)).toBe('#. ## #. ##'); // 1024
    expect(picture(11)).toBe('## ## #. ##'); // 2048
  });

  it('все показатели 1…17 рисуются по-разному и непусто (нет коллизий вроде 16 = пусто и 17 = 2)', () => {
    const pictures = Array.from({ length: MAX_TILE_EXPONENT }, (_, i) => picture(i + 1));
    expect(new Set(pictures).size).toBe(MAX_TILE_EXPONENT);
    for (const one of pictures) expect(one).not.toBe('.. .. .. ..');
    expect(tileGlyph(16).length).toBeGreaterThan(0);
  });

  it('плитка горит постоянно: в обеих фазах мигания экрана (такты 0 и 6 по 12) рисунок один и тот же', () => {
    const g = new MergeGame({ seed: 3 });
    g.start();
    g.board.fill(0);
    for (const [i, e] of [1, 2, 4, 7, 10, 11, 16, 17].entries()) g.board[i] = e;
    const phaseA = Array.from(g.cells()).join('');
    run(g, 6);
    g.board.fill(0);
    for (const [i, e] of [1, 2, 4, 7, 10, 11, 16, 17].entries()) g.board[i] = e;
    expect(Array.from(g.cells()).join('')).toBe(phaseA);
    expect(Array.from(g.cells()).every((v) => v <= 1)).toBe(true);
  });

  it('на пределе плитки не сливаются и не переполняют показатель; обычное слияние и один раз за ход сохранены', () => {
    expect(slideTiles([17, 17, 0, 0])).toEqual({ cells: [17, 17, 0, 0], score: 0 });
    expect(slideTiles([1, 1, 1, 1])).toEqual({ cells: [2, 2, 0, 0], score: 8 });
    expect(slideTiles([1, 1, 2, 0])).toEqual({ cells: [2, 2, 0, 0], score: 4 });
  });
});

// ── R08: Simon и танцы — события тонов площадок ───────────────────────────────────────────────────────────────────────────────

describe('R08 Simon и танцы: звуковая обратная связь', () => {
  const tones = (events: BrickEvent[]): { pad: number; ticks: number }[] => events.flatMap((e) => (e.type === 'tone' ? [{ pad: e.pad, ticks: e.ticks }] : []));
  const key = (pad: number): BrickAction => (['up', 'right', 'down', 'left'] as const)[pad]!;

  it('Simon: при показе каждая площадка последовательности даёт ровно один тон, в порядке показа', () => {
    const g = new PadsGame('simon', { seed: 4 });
    g.start();
    const shown = tones(run(g, 80));
    expect(shown).toEqual([{ pad: g.sequence[0]!, ticks: 25 }]);
  });

  it('Simon: во втором раунде показываются два сигнала подряд — два тона в порядке последовательности', () => {
    const g = new PadsGame('simon', { seed: 4 });
    g.start();
    run(g, 80);
    const answer = tones(g.step(makeBrickInput([key(g.sequence[0]!)]))); // верный ответ первого раунда: тон ответа
    expect(answer).toHaveLength(1);
    const events = run(g, 140); // показ второго раунда
    expect(g.sequence).toHaveLength(2);
    expect(tones(events).map((t) => t.pad)).toEqual(g.sequence);
  });

  it('Simon: тон на ответ игрока — той площадки, которую он нажал; верный и ошибочный ответ различаются потерей жизни', () => {
    const g = new PadsGame('simon', { seed: 4 });
    g.start();
    run(g, 80);
    const first = g.sequence[0]!;
    const events = g.step(makeBrickInput([key(first)]));
    expect(tones(events)).toEqual([{ pad: first, ticks: 12 }]);
    expect(g.lives).toBe(4);
  });

  it('пауза не проигрывает пропущенные сигналы пачкой: тоны за показ не повторяются и не пропадают', () => {
    const g = new PadsGame('simon', { seed: 4 });
    g.start();
    const events: BrickEvent[] = [...run(g, 10)];
    g.pause();
    for (let i = 0; i < 100; i++) expect(g.step(makeBrickInput(['rotate']))).toEqual([]); // на паузе событий нет
    g.resume();
    events.push(...run(g, 100));
    expect(tones(events)).toHaveLength(1);
  });

  it('тон не меняет игровую шкалу: два одинаковых прохождения совпадают по состоянию (звук — только событие)', () => {
    const a = new PadsGame('simon', { seed: 4 }), b = new PadsGame('simon', { seed: 4 });
    a.start(); b.start();
    for (let t = 0; t < 300; t++) {
      const input = t % 90 === 40 ? makeBrickInput(['up']) : NEUTRAL_BRICK_INPUT;
      expect(a.step(input)).toEqual(b.step(input));
    }
    expect(a.sequence).toEqual(b.sequence);
  });

  it('танцы: попадание по дорожке даёт тон этой дорожки, промах — потерю жизни без тона', () => {
    const g = new PadsGame('dance', { seed: 4 });
    g.start();
    g.notes = [{ direction: 1, y: 17 }];
    const events = tap(g, 'right');
    expect(tones(events)).toEqual([{ pad: 1, ticks: 12 }]);
    const miss = new PadsGame('dance', { seed: 4 });
    miss.start();
    miss.notes = [{ direction: 1, y: 17 }];
    const bad = tap(miss, 'left');
    expect(tones(bad)).toEqual([]);
    expect(miss.lives).toBe(3);
  });

  it('оболочка: тоны четырёх площадок звучат четырьмя разными сигналами пищалки', () => {
    const cues = [0, 1, 2, 3].map((pad) => cueFor({ type: 'tone', pad, ticks: 12 }, false));
    expect(cues.every((c) => c !== null)).toBe(true);
    expect(new Set(cues).size).toBe(4);
    expect(cueFor({ type: 'tone', pad: 7, ticks: 12 }, false)).toBeNull();
  });
});
