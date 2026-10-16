/**
 * Описание «Танков» для левой панели (`src/brick/guides/tanks.ts`): форма и пределы, отсутствие заглушки, и главное — каждое число и каждая схема
 * подтверждены поведением игры: создаём игру, играем и сверяем. Числа в тестах записаны литералами, а не взяты из констант игры, чтобы правка
 * константы без правки описания (и наоборот) ломала тест.
 */
import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  BRICK_TICK_HZ,
  CLEAR_WIN_TICKS,
  NEUTRAL_BRICK_INPUT,
  Rng,
  genuineTicks,
  guideProblems,
  makeBrickInput,
  type BrickAction,
  type BrickEvent,
  type BrickGameOptions,
  type BrickInput,
  type GameGuideData,
  type GuideText,
} from '../../../src/brick';
import { START_TICKS, TanksGame, tanksDef, tanksRules } from '../../../src/brick/games/tanks';
import { shootDirection, shotChance } from '../../../src/brick/games/tanks/ai';
import {
  DOWN,
  ENEMY_KIND,
  LEFT,
  PLAYER_KIND,
  RIGHT,
  UP,
  boardIndex,
  coversCell,
  newBoard,
  tankMask,
  type Bullet,
  type Tank,
} from '../../../src/brick/games/tanks/geometry';
import { presetObstacles, randomObstacles } from '../../../src/brick/games/tanks/levels';
import { TANKS_GUIDE } from '../../../src/brick/guides/tanks';

// ------------------------------------------------------------------ помощники

const hold = (...keys: BrickAction[]): BrickInput => makeBrickInput([], keys);
const START: Tank = { x: 4, y: 7, dir: UP };

/** Новая партия, прошедшая стартовую паузу: следующий такт — первый игровой. */
function newGame(options: BrickGameOptions = {}): TanksGame {
  const game = new TanksGame({ seed: 7, ...options });
  game.start();
  for (let i = 0; i < 90; i++) game.step(NEUTRAL_BRICK_INPUT);
  return game;
}

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
  aiIn?: number;
}

/** Расставить сцену через закрытые поля игры (без вмешательства ИИ, пока не задан `aiIn`). */
function arrange(game: TanksGame, setup: Setup): void {
  game['player'] = setup.player ?? START;
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

/** Строки экрана игры: `#` — горит, `.` — погашена. */
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

const litCount = (rows: readonly string[]): number => rows.join('').split('#').length - 1;

/** Выстрел в упор по врагу над танком игрока: следующий такт с огнём убивает врага. */
function killOne(game: TanksGame): BrickEvent[] {
  arrange(game, { enemies: [{ x: 4, y: 10, dir: DOWN }], killed: game['killed'] });
  game['keyDelay'].fire = 0; // после прошлого выстрела огонь ждал бы 14 тактов
  return game.step(hold('fire'));
}

const liveEnemies = (game: TanksGame): Tank[] => game['enemies'].filter((tank): tank is Tank => tank !== null);

/** Числа из текста; десятичная запятая и точка равны (`1,5` = `1.5`). */
const numbersIn = (text: string): number[] =>
  (text.match(/(?<![\p{L}\d])\d+(?:[.,]\d+)?/gu) ?? []).map((n) => Number(n.replace(',', '.')));

/** Секунды из тактов, как в описании: с точностью до сотых. */
const secondsOf = (ticks: number): number => Math.round((ticks / BRICK_TICK_HZ) * 100) / 100;

/** Все тексты описания с путями: для проверок «во всех полях». */
function allTexts(guide: GameGuideData): { path: string; text: GuideText }[] {
  const out: { path: string; text: GuideText }[] = [
    { path: 'summary', text: guide.summary },
    { path: 'goal', text: guide.goal },
    { path: 'progression', text: guide.progression },
  ];
  if (guide.lives) out.push({ path: 'lives', text: guide.lives });
  guide.rules.forEach((text, i) => out.push({ path: `rules[${i}]`, text }));
  guide.controls.forEach((control, i) => out.push({ path: `controls[${i}]`, text: control.text }));
  guide.scoring.forEach((score, i) => out.push({ path: `scoring[${i}]`, text: score.what }));
  guide.facts.forEach((fact, i) => out.push({ path: `facts[${i}]`, text: fact.label }));
  guide.schemes.forEach((scheme, i) => out.push({ path: `schemes[${i}]`, text: scheme.caption }));
  guide.assumptions.forEach((text, i) => out.push({ path: `assumptions[${i}]`, text }));
  return out;
}

const fact = (label: string): string => {
  const found = TANKS_GUIDE.facts.find((item) => item.label.ru.includes(label));
  if (!found) throw new Error(`Нет факта «${label}»`);
  return found.value;
};

// ------------------------------------------------------------------ форма

describe('описание «Танков»: форма', () => {
  it('проходит общую проверку (схемы, пределы длины, число пунктов)', () => {
    expect(guideProblems(TANKS_GUIDE)).toEqual([]);
  });

  it('заглушки нет ни в русских, ни в английских текстах', () => {
    for (const { path, text } of allTexts(TANKS_GUIDE)) {
      expect(text.ru, path).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(text.en, path).not.toMatch(/ЗАГЛУШКА|STUB/i);
    }
  });

  it('русский и английский тексты говорят об одних и тех же числах', () => {
    for (const { path, text } of allTexts(TANKS_GUIDE)) {
      expect(numbersIn(text.en), path).toEqual(numbersIn(text.ru));
    }
  });

  it('каждая кнопка в управлении названа один раз и это кнопки игры', () => {
    const buttons = TANKS_GUIDE.controls.map((control) => control.button);
    expect(buttons).toEqual(['left', 'right', 'up', 'down', 'rotate']);
  });

  it('допущений не больше пяти', () => {
    expect(TANKS_GUIDE.assumptions.length).toBeLessThanOrEqual(5);
  });
});

// ------------------------------------------------------------------ числа

describe('описание «Танков»: числа записаны ровно так, как их подтверждает игра', () => {
  it('точные списки чисел в целях, фактах, очках, жизнях и росте', () => {
    expect(numbersIn(TANKS_GUIDE.goal.ru)).toEqual([25, 4]);
    expect(TANKS_GUIDE.facts.map((item) => item.value)).toEqual(['4', '25', '3–6', '500']);
    expect(TANKS_GUIDE.scoring.map((score) => score.points)).toEqual(['+1', '0']);
    expect(numbersIn(TANKS_GUIDE.lives?.ru ?? '')).toEqual([4, 500, 4, 50]);
    expect(numbersIn(TANKS_GUIDE.progression.ru)).toEqual([25, 10, 1, 1, 1.5, 1, 0.35, 10]);
  });

  it('любое число в любом тексте описания входит в список подтверждённых этим файлом', () => {
    const confirmed = new Set([
      0.08, // шаг вперёд раз в 5 тактов
      0.12, // снаряд проходит клетку за 7 тактов
      0.23, // выстрел раз в 14 тактов
      0.35, // ход врагов на скорости 10: 21 такт
      0.37, // повтор после поворота: 22 такта
      1, // скорость, уровень, очко за врага, 1 из N, N−1
      1.5, // стартовая пауза 90 тактов; ход врагов на скорости 1: 90 тактов
      2, // препятствия с уровня 2
      3, // квадрат 3 × 3 и три врага
      4, // жизни и снаряды игрока
      6, // клеток вражеского танка и врагов в крупных вариантах
      7, // клеток танка игрока
      10, // десятый уровень, десятая скорость
      11, // 1 из 11 на 10-м уровне
      20, // 1 из 20 на 1-м уровне
      25, // врагов на уровень
      50, // бонус при полных жизнях
      500, // очков до добавочной жизни
    ]);
    for (const { path, text } of allTexts(TANKS_GUIDE)) {
      for (const n of numbersIn(text.ru)) expect(confirmed.has(n), `${path}: число ${n}`).toBe(true);
    }
    for (const n of numbersIn(TANKS_GUIDE.assumptions.map((a) => a.ru).join(' '))) expect(confirmed.has(n), `допущение: ${n}`).toBe(true);
  });

  it('жизни: четыре в начале партии, заново четыре после конца игры; добавочная — не пятая, а +50 очков', () => {
    expect(fact('Жизней')).toBe('4');
    const game = new TanksGame({ seed: 3 });
    expect(game.lives).toBe(4);
    game.start();
    expect(game.lives).toBe(4);
    // при полных жизнях 500-е очко даёт бонус 50 очков, а не пятую жизнь
    const full = newGame();
    arrange(full, { enemies: [{ x: 4, y: 10, dir: DOWN }, { x: 4, y: 16, dir: DOWN }] });
    full['setScore'](499);
    const events = full.step(hold('fire'));
    expect(types(events)).toContain('bonus');
    expect(full.lives).toBe(4);
    expect(full.score).toBe(550);
  });

  it('добавочная жизнь за каждые 500 очков: на 500-м и на 1000-м', () => {
    expect(fact('добавочной')).toBe('500');
    const game = newGame();
    game['setLives'](1);
    game['setScore'](498);
    killOne(game); // 499
    expect(game.lives).toBe(1);
    killOne(game); // 500
    expect(game.lives).toBe(2);
    game['setScore'](998);
    killOne(game); // 999
    expect(game.lives).toBe(2);
    killOne(game); // 1000
    expect(game.lives).toBe(3);
  });

  it('очки: +1 за уничтоженного врага; стёртая клетка препятствия и победа в уровне очков не дают', () => {
    const game = newGame();
    const events = killOne(game);
    expect(types(events)).toContain('explode');
    expect(game.score).toBe(1);

    const walls = newGame();
    arrange(walls, { obstacles: [[4, 12]] });
    walls.step(hold('fire'));
    run(walls, 40);
    expect(walls['obstacles'][boardIndex(4, 12)]).toBe(0);
    expect(walls.score).toBe(0);

    // победа в уровне добавляет только очко за последнего врага
    const winning = newGame();
    arrange(winning, { enemies: [{ x: 4, y: 10, dir: DOWN }], killed: 24 });
    expect(types(winning.step(hold('fire')))).toContain('win');
    run(winning, CLEAR_WIN_TICKS);
    expect(winning.score).toBe(1);
  });

  it('25 врагов — победа в уровне: на 24-м ещё бой, на 25-м победа; счёт убитых после неё с нуля', () => {
    expect(fact('до победы')).toBe('25');
    const almost = newGame();
    arrange(almost, { enemies: [{ x: 4, y: 10, dir: DOWN }], killed: 23 });
    expect(types(almost.step(hold('fire')))).not.toContain('win'); // 24-й убит
    expect(almost['killed']).toBe(24);

    const last = newGame();
    arrange(last, { enemies: [{ x: 4, y: 10, dir: DOWN }], killed: 24 });
    expect(types(last.step(hold('fire')))).toContain('win'); // 25-й убит
    run(last, CLEAR_WIN_TICKS);
    expect(last.level).toBe(2);
    expect(last['killed']).toBe(0);
    // на втором уровне победа снова только на 25-м
    run(last, START_TICKS); // стартовая пауза нового уровня
    arrange(last, { enemies: [{ x: 4, y: 10, dir: DOWN }], killed: 23 });
    expect(types(last.step(hold('fire')))).not.toContain('win');
    expect(last['killed']).toBe(24);
  });

  it('рост: уровень +1 после победы, после десятого — снова первый и скорость +1', () => {
    const win = (options: BrickGameOptions): TanksGame => {
      const game = newGame(options);
      arrange(game, { enemies: [{ x: 4, y: 10, dir: DOWN }], killed: 24 });
      game.step(hold('fire'));
      run(game, CLEAR_WIN_TICKS);
      return game;
    };
    const first = win({ level: 1, speed: 4 });
    expect([first.level, first.speed]).toEqual([2, 4]);
    const tenth = win({ level: 10, speed: 4 });
    expect([tenth.level, tenth.speed]).toEqual([1, 5]);
    const wrap = win({ level: 10, speed: 10 });
    expect([wrap.level, wrap.speed]).toEqual([1, 1]);
  });

  it('темп врагов: ход раз в 1,5 с (90 тактов) на скорости 1 и раз в 0,35 с (21 такт) на скорости 10', () => {
    const period = (speed: number): number => {
      const game = newGame({ speed });
      arrange(game, { aiIn: 1 });
      game.step(NEUTRAL_BRICK_INPUT);
      return game['aiLeft'];
    };
    expect(period(1)).toBe(90);
    expect(period(10)).toBe(21);
    expect(genuineTicks(1, 1500, 350) / BRICK_TICK_HZ).toBe(1.5);
    expect(genuineTicks(10, 1500, 350) / BRICK_TICK_HZ).toBe(0.35);
  });

  it('враги: от трёх до шести на поле; число ячеек и предел совпадают с вариантом, весь набор помещается на поле', () => {
    expect(fact('на поле')).toBe('3–6');
    const enemies = [0, 1, 2, 3, 4].map((mode) => new TanksGame({ mode }).rules.enemies);
    expect(enemies).toEqual([3, 4, 6, 3, 6]);
    expect(Math.min(...enemies)).toBe(3);
    expect(Math.max(...enemies)).toBe(6);
    // все ячейки варианта заполняются, больше врагов на поле не бывает
    for (const mode of [0, 2]) {
      const game = newGame({ seed: 5, mode });
      arrange(game, {});
      const cells = game['enemies'].length;
      for (let index = 0; index < cells; index++) {
        for (let tries = 0; tries < 400 && game['enemies'][index] === null; tries++) game['aiTurn'](index);
        expect(game['enemies'][index], `вариант ${mode + 1}, враг ${index + 1}`).not.toBeNull();
      }
      expect(liveEnemies(game).length).toBe(enemies[mode]);
    }
  });

  it('новые враги идут, пока убитые вместе со стоящими на поле меньше 25', () => {
    const game = newGame({ seed: 7, mode: 0 });
    arrange(game, { enemies: [{ x: 8, y: 18, dir: DOWN }], killed: 24 });
    for (let i = 0; i < 80; i++) game['aiTurn'](1);
    expect(game['enemies'][1]).toBeNull(); // 24 убито + 1 стоит = 25
    arrange(game, { enemies: [{ x: 8, y: 18, dir: DOWN }], killed: 23 });
    for (let i = 0; i < 80 && game['enemies'][1] === null; i++) game['aiTurn'](1);
    expect(game['enemies'][1]).not.toBeNull();
  });

  it('выстрел с порога у нового врага: 1 из 20 на 1-м уровне и 1 из 11 на 10-м', () => {
    const rolled = (level: number): number[] => {
      const game = newGame({ seed: 7, mode: 0, level });
      arrange(game, {});
      const calls: number[] = [];
      const rng = game['rng'];
      const original = rng.int.bind(rng);
      rng.int = (max: number): number => {
        calls.push(max);
        return original(max);
      };
      for (let tries = 0; tries < 400 && game['enemies'][0] === null; tries++) game['aiTurn'](0);
      expect(game['enemies'][0]).not.toBeNull();
      return calls;
    };
    expect(rolled(1)).toContain(20);
    expect(rolled(1)).not.toContain(11);
    expect(rolled(10)).toContain(11);
    expect(rolled(10)).not.toContain(20);
  });

  it('время: 0,08 с шаг, 0,37 с после поворота, 0,23 с между выстрелами, 0,12 с на клетку снаряда, 1,5 с стартовая пауза', () => {
    expect([5, 22, 14, 7, 90].map(secondsOf)).toEqual([0.08, 0.37, 0.23, 0.12, 1.5]);

    // шаг и поворот: поворот на месте, первый шаг через 22 такта, дальше шаг каждые 5 тактов
    const walker = newGame();
    arrange(walker, {});
    const steps: number[] = [];
    let previousX = walker['player'].x;
    for (let t = 1; t <= 40; t++) {
      walker.step(hold('left'));
      if (walker['player'].x !== previousX) {
        steps.push(t);
        previousX = walker['player'].x;
      }
    }
    expect(walker['player'].dir).toBe(LEFT);
    expect(steps.slice(0, 3)).toEqual([23, 28, 33]);

    // огонь: выстрелы через 14 тактов, снаряд — клетка за 7 тактов, в полёте не больше четырёх
    const gunner = newGame();
    arrange(gunner, {});
    const shots: number[] = [];
    let peak = 0;
    for (let t = 1; t <= 120; t++) {
      if (types(gunner.step(hold('fire'))).includes('shot')) shots.push(t);
      peak = Math.max(peak, gunner['playerBullets'].filter((b) => b !== null).length);
    }
    expect(shots.slice(0, 3)).toEqual([1, 15, 29]);
    expect(peak).toBe(4);
    const flyer = newGame();
    arrange(flyer, {});
    flyer.step(hold('fire'));
    expect(flyer['playerBullets'][0]).toEqual({ x: 4, y: 9, dir: UP });
    run(flyer, 5); // такт 6: общий таймер снарядов ещё не сработал
    expect(flyer['playerBullets'][0]).toEqual({ x: 4, y: 9, dir: UP });
    run(flyer, 1); // такт 7: клетка вперёд
    expect(flyer['playerBullets'][0]).toEqual({ x: 4, y: 10, dir: UP });
    run(flyer, 7); // и ещё через 7 тактов
    expect(flyer['playerBullets'][0]).toEqual({ x: 4, y: 11, dir: UP });
  });

  it('шаг вперёд откладывает следующий выстрел на 0,23 с (14 тактов)', () => {
    const game = newGame();
    arrange(game, {});
    game.step(hold('up')); // шаг вперёд на такте 1
    expect(game['player'].y).toBe(8);
    const shots: number[] = [];
    for (let t = 2; t <= 40; t++) if (types(game.step(hold('fire'))).includes('shot')) shots.push(t);
    expect(shots[0]).toBe(15);
  });

  it('стартовая пауза 1,5 с (90 тактов): ввод не принимается, врагов нет; после неё танк слушается', () => {
    const game = new TanksGame({ seed: 3 });
    game.start();
    for (let i = 0; i < 89; i++) {
      game.step(hold('left', 'fire'));
      expect(game['player']).toEqual(START);
      expect(liveEnemies(game).length).toBe(0);
      expect(game['playerBullets'].every((bullet) => bullet === null)).toBe(true);
    }
    expect(START_TICKS).toBe(90);
    game.step(NEUTRAL_BRICK_INPUT);
    game.step(hold('left'));
    expect(game['player'].dir).toBe(LEFT);
  });

  it('пауза 1,5 с повторяется и после потери жизни', () => {
    const game = newGame();
    arrange(game, { enemyBullets: [{ x: 4, y: 13, dir: DOWN }] });
    run(game, 5 * 7); // снаряд долетает до танка
    run(game, 4 * 7 * 4); // взрыв
    run(game, 72); // очистка поля
    for (let i = 0; i < 89; i++) {
      game.step(hold('left'));
      expect(game['player']).toEqual(START);
      expect(liveEnemies(game).length).toBe(0);
    }
  });

  it('гибель: попадание вражеского снаряда в любую клетку танка — минус жизнь, убитые на уровне сохраняются, уровень прежний', () => {
    const game = newGame();
    arrange(game, { enemyBullets: [{ x: 8, y: 6, dir: LEFT }], killed: 7 }); // летит вдоль нижней строки танка, в угол
    const events = run(game, 4 * 7);
    expect(types(events)).toContain('crash');
    run(game, 4 * 7 * 4 + 72);
    expect(game.lives).toBe(3);
    expect(game['killed']).toBe(7);
    expect(game.level).toBe(1);
  });
});

// ------------------------------------------------------------------ правила

describe('описание «Танков»: правила подтверждены игрой', () => {
  it('рисунок танков: 7 клеток у игрока, 6 у врага, оба помещаются в квадрат 3 × 3; попадание — по рисунку, а не по квадрату', () => {
    expect(tankMask(PLAYER_KIND, UP).cells.length).toBe(7);
    expect(tankMask(ENEMY_KIND, UP).cells.length).toBe(6);
    for (const kind of [PLAYER_KIND, ENEMY_KIND] as const) {
      const mask = tankMask(kind, UP);
      expect(mask.maxX - mask.minX + 1).toBe(3);
      expect(mask.maxY - mask.minY + 1).toBe(3);
    }
    // клетка позади центра вражеского танка в квадрате есть, в рисунке нет: снаряд её пролетает
    expect(coversCell(ENEMY_KIND, { x: 4, y: 12, dir: UP }, 4, 11)).toBe(false);
    const game = newGame();
    arrange(game, { enemies: [{ x: 4, y: 12, dir: UP }] });
    game['playerBullets'][0] = { x: 4, y: 10, dir: UP };
    run(game, 7);
    expect(game['playerBullets'][0]).toEqual({ x: 4, y: 11, dir: UP });
    expect(game.score).toBe(0);
  });

  it('танки и препятствия непроходимы: шаг в препятствие, во врага и за край поля не выходит', () => {
    const wall = newGame();
    arrange(wall, { player: { x: 4, y: 7, dir: LEFT }, obstacles: [[2, 7]] });
    run(wall, 60, hold('left'));
    expect(wall['player']).toEqual({ x: 4, y: 7, dir: LEFT });
    const foe = newGame();
    arrange(foe, { enemies: [{ x: 4, y: 11, dir: DOWN }] });
    run(foe, 60, hold('up'));
    expect(foe['player'].y).toBe(8);
    const edge = newGame();
    arrange(edge, {});
    run(edge, 400, hold('right'));
    expect(edge['player'].x).toBe(8);
  });

  it('стрелки: другое направление — поворот на месте, то же — шаг вперёд (все четыре)', () => {
    const keys: [BrickAction, number][] = [
      ['left', 3],
      ['right', 1],
      ['up', 0],
      ['down', 2],
    ];
    for (const [key, dir] of keys) {
      const game = newGame();
      arrange(game, { player: { x: 4, y: 7, dir: dir === 0 ? 1 : 0 } });
      game.step(hold(key));
      expect(game['player'], key).toEqual({ x: 4, y: 7, dir });
      run(game, 22, hold(key)); // пауза после поворота — 22 такта, затем шаг
      const dx = [0, 1, 0, -1][dir] ?? 0;
      const dy = [1, 0, -1, 0][dir] ?? 0;
      expect(game['player'], key).toEqual({ x: 4 + dx, y: 7 + dy, dir });
    }
  });

  it('ROTATE и «огонь» стреляют одинаково', () => {
    for (const key of ['rotate', 'fire'] as const) {
      const game = newGame();
      arrange(game, {});
      expect(types(game.step(hold(key)))).toContain('shot');
    }
  });

  it('снаряд стирает одну клетку препятствия и пропадает', () => {
    const game = newGame();
    arrange(game, {
      obstacles: [
        [3, 12],
        [4, 12],
        [5, 12],
      ],
    });
    game.step(hold('fire'));
    run(game, 40);
    expect(game['obstacles'][boardIndex(4, 12)]).toBe(0);
    expect(game['obstacles'][boardIndex(3, 12)]).toBe(1);
    expect(game['obstacles'][boardIndex(5, 12)]).toBe(1);
    expect(game['playerBullets'].every((bullet) => bullet === null)).toBe(true);
  });

  it('снаряды врага и игрока гасят друг друга; вражеский снаряд во вражеском танке просто пропадает', () => {
    const duel = newGame();
    arrange(duel, { enemyBullets: [{ x: 4, y: 12, dir: DOWN }] });
    duel.step(hold('fire'));
    run(duel, 14);
    expect(duel['playerBullets'].every((bullet) => bullet === null)).toBe(true);
    expect(duel['enemyBullets'].every((bullet) => bullet === null)).toBe(true);
    expect(duel['dead']).toBe(false);

    const friendly = newGame();
    arrange(friendly, { enemies: [{ x: 1, y: 10, dir: RIGHT }], enemyBullets: [{ x: 8, y: 10, dir: LEFT }] });
    run(friendly, 8 * 7);
    expect(liveEnemies(friendly).length).toBe(1);
    expect(friendly['enemyBullets'].every((bullet) => bullet === null)).toBe(true);
    expect(friendly.lives).toBe(4);
    expect(friendly.score).toBe(0);
  });

  it('враг стреляет вдоль большей разницы координат, и тем чаще, чем ближе игрок', () => {
    const player: Tank = { x: 4, y: 7, dir: UP };
    expect(shootDirection(4, 15, player)).toBe(DOWN);
    expect(shootDirection(1, 9, player)).toBe(RIGHT);
    const board = newBoard();
    const near = shotChance(board, { x: 4, y: 12, dir: DOWN }, player, []);
    const far = shotChance(board, { x: 8, y: 18, dir: DOWN }, player, []);
    expect(near).toBeGreaterThan(far);
  });

  it('за раз действует один враг', () => {
    const game = newGame({ seed: 11, mode: 2 });
    arrange(game, {
      enemies: [
        { x: 1, y: 18, dir: DOWN },
        { x: 8, y: 18, dir: DOWN },
        { x: 1, y: 10, dir: RIGHT },
      ],
      aiIn: 1,
    });
    const before = JSON.stringify(game['enemies']);
    game.step(NEUTRAL_BRICK_INPUT);
    const after = game['enemies'];
    const changed = (JSON.parse(before) as (Tank | null)[]).filter((tank, i) => JSON.stringify(tank) !== JSON.stringify(after[i]));
    expect(changed.length).toBeLessThanOrEqual(1);
  });

  it('препятствия с уровня 2: на первом уровне поля пусты; готовые — из таблицы, случайные — до N−1 штук', () => {
    // уровень 1: пусто во всех пяти вариантах
    for (let mode = 0; mode < 5; mode++) {
      const board = new TanksGame({ seed: 4, mode })['obstacles'];
      expect(board.every((cell) => cell === 0)).toBe(true);
    }
    // уровень 2: у первых трёх вариантов — одно и то же готовое поле при любом зерне
    const preset = [...presetObstacles(2)].join('');
    expect(preset).toContain('1');
    for (const mode of [0, 1, 2]) {
      expect(tanksRules([1, 2, 4, 5, 8][mode] ?? 1).preloaded).toBe(true);
      for (const seed of [1, 2, 3]) expect([...new TanksGame({ seed, mode, level: 2 })['obstacles']].join('')).toBe(preset);
    }
    // у двух последних — случайные, от зерна зависят и состоят не более чем из N−1 не касающихся друг друга фигур
    for (const mode of [3, 4]) {
      expect(tanksRules([1, 2, 4, 5, 8][mode] ?? 1).preloaded).toBe(false);
      const boards = new Set<string>();
      for (let seed = 1; seed <= 6; seed++) {
        for (let level = 2; level <= 10; level++) {
          const board = new TanksGame({ seed, mode, level })['obstacles'];
          boards.add([...board].join(''));
          expect(figures(board), `вариант ${mode + 1}, уровень ${level}`).toBeLessThanOrEqual(level - 1);
          expect(figures(board)).toBeGreaterThanOrEqual(1);
        }
      }
      expect(boards.size).toBeGreaterThan(5);
    }
    expect(figures(randomObstacles(new Rng(3), 0))).toBe(0);
  });
});

/** Число отдельных фигур на поле препятствий (связные куски с учётом диагоналей; случайные фигуры не касаются даже углом). */
function figures(board: Uint8Array): number {
  const cells = new Set<number>();
  board.forEach((value, i) => {
    if (value) cells.add(i);
  });
  const seen = new Set<number>();
  let groups = 0;
  for (const start of cells) {
    if (seen.has(start)) continue;
    groups++;
    const stack = [start];
    while (stack.length > 0) {
      const index = stack.pop() as number;
      if (seen.has(index)) continue;
      seen.add(index);
      const x = index % BRICK_COLS;
      const y = Math.floor(index / BRICK_COLS);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < BRICK_COLS && ny >= 0 && ny < BRICK_ROWS && cells.has(ny * BRICK_COLS + nx)) stack.push(ny * BRICK_COLS + nx);
        }
      }
    }
  }
  return groups;
}

// ------------------------------------------------------------------ допущения о вариантах

describe('описание «Танков»: допущение о пяти вариантах', () => {
  it('пять вариантов на устройстве и в игре: 3, 4, 6 врагов с готовыми полями и 3, 6 — со случайными', () => {
    expect(tanksDef.declaredModes).toBe(5);
    expect(tanksDef.modes.length).toBe(5);
    const rules = [0, 1, 2, 3, 4].map((mode) => new TanksGame({ mode }).rules);
    expect(rules.map((r) => r.enemies)).toEqual([3, 4, 6, 3, 6]);
    expect(rules.map((r) => r.preloaded)).toEqual([true, true, true, false, false]);
    const assumption = TANKS_GUIDE.assumptions[0]?.ru ?? '';
    expect(assumption).toContain('Пять вариантов из восьми');
    expect(numbersIn(assumption)).toEqual([3, 4, 6, 3, 6]);
  });
});

// ------------------------------------------------------------------ схемы

describe('описание «Танков»: схемы — рисунки, которые действительно получаются на экране игры', () => {
  const fragment = (rows: readonly string[], top: number, left: number, height: number, width: number): string[] =>
    rows.slice(top, top + height).map((row) => row.slice(left, left + width));
  const scheme = (index: number): string[] => [...(TANKS_GUIDE.schemes[index]?.cells ?? [])];

  it('схема 1: танк игрока (7 клеток) стволом вверх и вражеский (6) стволом вниз', () => {
    const game = newGame();
    arrange(game, { player: { x: 4, y: 7, dir: UP }, enemies: [{ x: 8, y: 7, dir: DOWN }] });
    const rows = screen(game);
    expect(litCount(rows)).toBe(13); // на экране только эти два танка
    expect(fragment(rows, 11, 3, 3, 7)).toEqual(scheme(0));
    expect(litCount(scheme(0))).toBe(13);
  });

  it('схема 2: готовое поле уровня 2 и танк на старте — во всех трёх вариантах с готовыми полями', () => {
    for (const mode of [0, 1, 2]) {
      const rows = screen(new TanksGame({ seed: 2, mode, level: 2 }));
      expect(fragment(rows, 9, 0, 8, 10), `вариант ${mode + 1}`).toEqual(scheme(1));
      expect(litCount(rows), `вариант ${mode + 1}`).toBe(litCount(scheme(1))); // остальное поле пусто
    }
  });

  it('схема 3: четыре снаряда игрока в полёте, через клетку один за другим', () => {
    const game = newGame();
    arrange(game, {});
    run(game, 43, hold('fire')); // выстрелы на тактах 1, 15, 29 и 43
    expect(game['playerBullets'].map((bullet) => bullet?.y)).toEqual([15, 13, 11, 9]);
    const rows = screen(game);
    expect(fragment(rows, 4, 3, 10, 3)).toEqual(scheme(2));
    expect(litCount(rows)).toBe(litCount(scheme(2)));
  });
});
