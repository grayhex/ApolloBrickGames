/**
 * Содержание головоломок (R09) и решатели, исполняющие найденное решение на настоящем движке (R12): у каждой задачи есть решение, оно проходится кнопками
 * игры (стрелки и ROTATE), а наборы задач различаются и усложняются. Ожидаемые правила выписаны независимо от реализации.
 */
import { describe, expect, it } from 'vitest';
import { QUARTH_LEVELS, QuarthGame } from '../../../src/brick/games/library/falling';
import { FillGame, LightsGame, MazeGame, PEG_HOLES, SokobanGame, SolitaireGame } from '../../../src/brick/games/library/puzzles';
import { SOKOBAN_LEVELS } from '../../../src/brick/games/library/sokobanLevels';
import { NEUTRAL_BRICK_INPUT, makeBrickInput, type BrickAction, type BrickEvent, type BrickGame } from '../../../src/brick';

const tap = (g: BrickGame, action: BrickAction): BrickEvent[] => [...g.step(makeBrickInput([action])), ...g.step(NEUTRAL_BRICK_INPUT)];
const run = (g: BrickGame, n: number): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
  return events;
};
const DIR = { u: 'up', r: 'right', d: 'down', l: 'left' } as const;

// ── Sokoban: десять собственных задач ──────────────────────────────────────────────────────────────────────────────────────────

describe('Sokoban: десять задач с проверенными решениями', () => {
  /** Кратчайшее решение поиском в ширину по состояниям «игрок + ящики» — независимо от сохранённого решения. */
  function shortest(map: readonly string[]): number | null {
    const walls = new Set<string>(), goals = new Set<string>();
    let player = '', crates: string[] = [];
    map.forEach((row, y) => [...row].forEach((ch, x) => {
      const k = `${x},${y}`;
      if (ch === '#') walls.add(k);
      if (ch === '.' || ch === '*' || ch === '+') goals.add(k);
      if (ch === '$' || ch === '*') crates.push(k);
      if (ch === '@' || ch === '+') player = k;
    }));
    crates = crates.sort();
    const key = (p: string, cs: string[]): string => `${p}|${cs.join(';')}`;
    const target = [...goals].sort().join(';');
    const seen = new Set([key(player, crates)]);
    let frontier: { p: string; cs: string[] }[] = [{ p: player, cs: crates }];
    for (let depth = 0; frontier.length > 0 && depth < 200; depth++) {
      const next: typeof frontier = [];
      for (const { p, cs } of frontier) {
        if (cs.join(';') === target) return depth;
        const [px, py] = p.split(',').map(Number) as [number, number];
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const n = `${px + dx},${py + dy}`;
          if (walls.has(n)) continue;
          let nc = cs;
          if (cs.includes(n)) {
            const beyond = `${px + 2 * dx},${py + 2 * dy}`;
            if (walls.has(beyond) || cs.includes(beyond)) continue;
            nc = cs.map((c) => (c === n ? beyond : c)).sort();
          }
          const k = key(n, nc);
          if (!seen.has(k)) { seen.add(k); next.push({ p: n, cs: nc }); }
        }
      }
      frontier = next;
    }
    return null;
  }

  it('задач десять; ящиков поровну целям и ни один не стоит на цели с самого начала; решение по каждой не короче предыдущей', () => {
    expect(SOKOBAN_LEVELS).toHaveLength(10);
    let previous = 0, crateTotal = 0;
    for (const [i, level] of SOKOBAN_LEVELS.entries()) {
      const text = level.map.join('');
      const crates = [...text].filter((c) => c === '$' || c === '*').length, goals = [...text].filter((c) => c === '.' || c === '*' || c === '+').length;
      expect(crates, `задача ${i + 1}`).toBe(goals);
      expect([...text].includes('*'), `задача ${i + 1}: ящик на цели с начала`).toBe(false);
      expect(level.solution.length, `задача ${i + 1}`).toBeGreaterThan(previous);
      expect(crates, `задача ${i + 1}`).toBeGreaterThanOrEqual(crateTotal);
      previous = level.solution.length;
      crateTotal = crates;
      expect(Math.max(...level.map.map((r) => r.length))).toBeLessThanOrEqual(8);
      expect(level.map.length).toBeLessThanOrEqual(9);
    }
    expect(new Set(SOKOBAN_LEVELS.map((l) => l.map.join('\n'))).size).toBe(10);
  });

  it('каждое сохранённое решение — кратчайшее, независимый поиск находит ту же длину', () => {
    for (const [i, level] of SOKOBAN_LEVELS.entries()) expect(shortest(level.map), `задача ${i + 1}`).toBe(level.solution.length);
  });

  it('решение каждой задачи проходится на движке: победа на последнем ходе, ни одного «заблокировано», уровень растёт', () => {
    for (const [i, level] of SOKOBAN_LEVELS.entries()) {
      const g = new SokobanGame({ level: i + 1 });
      g.start();
      const events: BrickEvent[] = [];
      for (const ch of level.solution) events.push(...tap(g, DIR[ch.toLowerCase() as 'u' | 'r' | 'd' | 'l']));
      expect(events.filter((e) => e.type === 'win'), `задача ${i + 1}`).toHaveLength(1);
      expect(events.some((e) => e.type === 'blocked'), `задача ${i + 1}`).toBe(false);
      run(g, 80);
      expect(g.level, `задача ${i + 1}`).toBe(i === 9 ? 1 : i + 2); // после десятой уровень возвращается к 1, а скорость растёт (правило движка)
    }
  });

  it('после победы загружается следующая задача, а не прежняя; отмена возвращает ход, «огонь» — задачу с начала', () => {
    const g = new SokobanGame();
    g.start();
    const first = [...g.crates].sort().join();
    for (const ch of SOKOBAN_LEVELS[0]!.solution) tap(g, DIR[ch.toLowerCase() as 'u' | 'r' | 'd' | 'l']);
    run(g, 80);
    expect(g.level).toBe(2);
    expect([...g.crates].sort().join()).not.toBe(first);
    const second = [...g.crates].sort().join();
    const startPlayer = g.player;
    const step = SOKOBAN_LEVELS[1]!.solution[0]!;
    tap(g, DIR[step.toLowerCase() as 'u' | 'r' | 'd' | 'l']);
    expect(g.player).not.toBe(startPlayer);
    tap(g, 'rotate'); // отмена
    expect(g.player).toBe(startPlayer);
    tap(g, DIR[step.toLowerCase() as 'u' | 'r' | 'd' | 'l']);
    g.step(makeBrickInput(['fire'])); // клавиша «огонь» (клавиатура): задача заново
    expect(g.player).toBe(startPlayer);
    expect([...g.crates].sort().join()).toBe(second);
  });
});

// ── Quarth: десять силуэтов ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('Quarth: десять силуэтов, каждый решается выстрелами', () => {
  /** Выстрелы, нужные силуэту: для каждой колонки — сколько клеток не хватает до прямоугольника (высота самой высокой колонки). */
  const plan = (level: number): { x: number; shots: number }[] =>
    // Сначала нижние силуэты: выстрел летит вверх до ближайшей клетки в колонке, поэтому верхний силуэт достраивается, когда нижний уже убран.
    [...QUARTH_LEVELS[level - 1]!].sort((a, b) => b.top + Math.max(...b.heights) - (a.top + Math.max(...a.heights))).flatMap((piece) => {
      const tall = Math.max(...piece.heights);
      return piece.heights.map((h, i) => ({ x: piece.x + i, shots: tall - h })).filter((s) => s.shots > 0);
    });

  it('уровней десять; на каждом нужен хотя бы один выстрел, прямоугольников в готовом виде нет; силуэты разные', () => {
    expect(QUARTH_LEVELS).toHaveLength(10);
    for (let level = 1; level <= 10; level++) expect(plan(level).length, `уровень ${level}`).toBeGreaterThan(0);
    const boards = new Set<string>();
    for (let level = 1; level <= 10; level++) boards.add(Array.from(new QuarthGame({ level }).cells()).join(''));
    expect(boards.size).toBe(10);
  });

  it('силуэты не касаются друг друга ни по бокам, ни после достройки (достроенный прямоугольник не сливается с соседним)', () => {
    for (let level = 1; level <= 10; level++) {
      const pieces = QUARTH_LEVELS[level - 1]!;
      const boxes = pieces.map((p) => ({ x0: p.x, x1: p.x + p.heights.length - 1, y0: p.top, y1: p.top + Math.max(...p.heights) - 1 }));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        const apart = a.x1 + 1 < b.x0 || b.x1 + 1 < a.x0 || a.y1 + 1 < b.y0 || b.y1 + 1 < a.y0;
        expect(apart, `уровень ${level}: рамки ${i + 1} и ${j + 1} соприкасаются`).toBe(true);
      }
    }
  });

  /** Исполнение плана на настоящем движке: перейти к колонке, выстрелить, дождаться перезарядки. */
  function play(level: number, speed: number): { events: BrickEvent[]; game: QuarthGame } {
    const g = new QuarthGame({ level, speed });
    g.start();
    const events: BrickEvent[] = [];
    for (const { x, shots } of plan(level)) {
      for (let s = 0; s < shots; s++) {
        while (g.x !== x) events.push(...tap(g, g.x < x ? 'right' : 'left'));
        events.push(...g.step(makeBrickInput(['rotate'])));
        for (let t = 0; t < 12; t++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
      }
    }
    return { events, game: g };
  }

  it('план каждого уровня на средней скорости проходится без потери жизни: силуэт убран, победа', () => {
    for (let level = 1; level <= 10; level++) {
      const { events, game } = play(level, 5);
      expect(events.filter((e) => e.type === 'win'), `уровень ${level}`).toHaveLength(1);
      expect(game.lives, `уровень ${level}`).toBe(4);
    }
  });

  it('на самой быстрой скорости первые четыре уровня тоже успевают пройтись', () => {
    for (let level = 1; level <= 4; level++) expect(play(level, 10).events.filter((e) => e.type === 'win'), `уровень ${level}`).toHaveLength(1);
  });

  it('выстрел в столбец вне силуэта не очищает поле: клетка остаётся, силуэт не исчезает', () => {
    const g = new QuarthGame({ level: 1 });
    g.start();
    g.x = 9;
    g.step(makeBrickInput(['rotate']));
    expect(g.board.some(Boolean)).toBe(true);
    expect(g.lives).toBe(4);
  });
});

// ── Решатели: найденное решение исполняется на настоящем движке ───────────────────────────────────────────────────────────────────

describe('решатели исполняют решение стрелками и ROTATE на настоящем движке', () => {
  /** Перейти курсором из клетки в клетку поля шириной `width` (по стрелкам, по одному шагу). */
  const walk = (g: BrickGame, from: [number, number], to: [number, number]): void => {
    let [x, y] = from;
    while (x !== to[0]) { tap(g, x < to[0] ? 'right' : 'left'); x += x < to[0] ? 1 : -1; }
    while (y !== to[1]) { tap(g, y < to[1] ? 'down' : 'up'); y += y < to[1] ? 1 : -1; }
  };

  it('Lights Out: решение методом Гаусса по GF(2) гасит все огни; задачи разных уровней и зёрен', () => {
    for (const [seed, level] of [[1, 1], [2, 3], [3, 6], [4, 10]] as const) {
      const g = new LightsGame({ seed, level });
      g.start();
      // Решение: вектор нажатий x, при котором A·x = доска (A — матрица переключения креста 10 × 10), по модулю 2.
      const n = 100, rows: number[][] = [];
      for (let p = 0; p < n; p++) {
        const row = new Array<number>(n + 1).fill(0);
        for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const x = p % 10 + dx, y = Math.floor(p / 10) + dy;
          if (x >= 0 && x < 10 && y >= 0 && y < 10) row[y * 10 + x] = 1; // нажатие в клетке (x, y) влияет на клетку p
        }
        row[n] = g.board[p]!;
        rows.push(row);
      }
      const pivots: number[] = [];
      let r = 0;
      for (let c = 0; c < n && r < n; c++) {
        const pivot = rows.findIndex((row, i) => i >= r && row[c] === 1);
        if (pivot < 0) continue;
        [rows[r], rows[pivot]] = [rows[pivot]!, rows[r]!];
        for (let i = 0; i < n; i++) if (i !== r && rows[i]![c] === 1) rows[i] = rows[i]!.map((v, j) => v ^ rows[r]![j]!);
        pivots[r] = c;
        r++;
      }
      const presses = new Set<number>();
      pivots.forEach((col, i) => { if (rows[i]![n] === 1) presses.add(col); });
      expect(presses.size, `seed ${seed}`).toBeGreaterThan(0);
      let at: [number, number] = [0, 0];
      const events: BrickEvent[] = [];
      for (const p of [...presses].sort((a, b) => a - b)) {
        const target: [number, number] = [p % 10, Math.floor(p / 10)];
        walk(g, at, target);
        at = target;
        events.push(...tap(g, 'rotate'));
      }
      expect(events, `seed ${seed}, level ${level}`).toContainEqual({ type: 'win' });
    }
  });

  it('лабиринт: кратчайший путь поиском в ширину проходится стрелками до выхода (зёрна 0–9)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = new MazeGame({ seed });
      g.start();
      const prev = new Map<number, [number, string]>(), queue = [g.player];
      prev.set(g.player, [-1, '']);
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i]!;
        for (const [delta, action] of [[-10, 'up'], [10, 'down'], [-1, 'left'], [1, 'right']] as const) {
          const q = p + delta;
          if (g.walls[q] === 0 && !prev.has(q)) { prev.set(q, [p, action]); queue.push(q); }
        }
      }
      const path: string[] = [];
      for (let p = g.goal; p !== g.player; p = prev.get(p)![0]) path.push(prev.get(p)![1]);
      const events: BrickEvent[] = [];
      for (const action of path.reverse()) events.push(...tap(g, action as BrickAction));
      expect(events, `зерно ${seed}`).toContainEqual({ type: 'win' });
      expect(events.some((e) => e.type === 'blocked'), `зерно ${seed}: упёрлись в стену`).toBe(false);
    }
  });

  it('Fill Connect: змейкой по строкам 8 × 8 за шестьдесят три шага — победа до конца таймера', () => {
    const g = new FillGame({ level: 1 });
    g.start();
    const events: BrickEvent[] = [];
    for (let row = 0; row < 8; row++) {
      for (let i = 0; i < 7; i++) events.push(...tap(g, row % 2 === 0 ? 'right' : 'left'));
      if (row < 7) events.push(...tap(g, 'down'));
    }
    expect(events).toContainEqual({ type: 'win' });
    expect(g.score).toBeGreaterThan(0);
  });

  it('Peg Solitaire: перебор находит решение крестового поля, оно проходится курсором и ROTATE — остаётся одна фишка, победа', () => {
    type Jump = [number, number];
    const holes = new Set(PEG_HOLES);
    const jumps = (pegs: Set<number>): Jump[] => {
      const out: Jump[] = [];
      for (const p of pegs) for (const d of [1, -1, 7, -7]) {
        const to = p + 2 * d, over = p + d;
        const sameLine = Math.abs((to % 7) - (p % 7)) + Math.abs(Math.floor(to / 7) - Math.floor(p / 7)) === 2;
        if (holes.has(to) && sameLine && pegs.has(over) && !pegs.has(to)) out.push([p, to]);
      }
      return out;
    };
    const dead = new Set<string>();
    const solve = (pegs: Set<number>, path: Jump[]): Jump[] | null => {
      if (pegs.size === 1) return path;
      const key = [...pegs].sort((a, b) => a - b).join(',');
      if (dead.has(key)) return null;
      for (const [from, to] of jumps(pegs)) {
        const over = (from + to) / 2, next = new Set(pegs);
        next.delete(from); next.delete(over); next.add(to);
        const rest = solve(next, [...path, [from, to]]);
        if (rest) return rest;
      }
      dead.add(key);
      return null;
    };
    const solution = solve(new Set(PEG_HOLES.filter((p) => p !== 24)), []);
    expect(solution).not.toBeNull();
    expect(solution).toHaveLength(31);
    const g = new SolitaireGame();
    g.start();
    const events: BrickEvent[] = [];
    let at: [number, number] = [24 % 7, Math.floor(24 / 7)];
    for (const [from, to] of solution!) {
      for (const cell of [from, to]) {
        const target: [number, number] = [cell % 7, Math.floor(cell / 7)];
        walk(g, at, target);
        at = target;
        events.push(...tap(g, 'rotate'));
      }
    }
    expect(events).toContainEqual({ type: 'win' });
    expect(g.pegs.size).toBe(1);
  });
});
