import { SCENARIO_GROUPS, scenarioSuite } from '../scenarioCoverage';
/**
 * Сценарные тесты правил: мяч и ракетка (pong, pong-double, pneumatic-ball, arkanoid-dots), тетрис с мигающими клетками
 * и игры на поле 4 × 9 (columns, columns-flicker, dr-mario).
 *
 * Общие контрактные тесты и fuzz проверяют только форму данных и устойчивость, а здесь игра проводится через настоящий публичный
 * интерфейс (`start`, `step`, `cells`, `score`, `lives`, `level`, `phase`, события) к конкретному исходу: гол, победа, потеря жизни,
 * конец партии. Начальное положение готовится присваиванием полям игры, но результат всегда получается тактами `step`.
 * Ожидаемые числа выписаны по правилам (справка `src/brick/guides/library.ts`, `docs/brick/library.md`, `docs/brick/tetris.md`), а не взяты из констант игры.
 */
import { describe, expect, it } from 'vitest';
import { GAME_OVER_TICKS,
  BRICK_ROWS,
  NEUTRAL_BRICK_INPUT,
  makeBrickInput,
  type BrickAction,
  type BrickEvent,
  type BrickGame,
  type BrickGameOptions,
  type BrickInput,
} from '../../../src/brick';
import { BallGame } from '../../../src/brick/games/library/action';
import { CapsuleGame, FlickerTetrisGame } from '../../../src/brick/games/library/falling';
import { LIBRARY_GAMES } from '../../../src/brick/games/library';
import { SHAPE_LINE, SHAPE_SQUARE, makePiece } from '../../../src/brick/games/tetris/shapes';

const coveredScenario = scenarioSuite('scenarios.balls');

/** Игры, у которых ниже есть и сценарий «прогресс» (очки, победа, следующий уровень), и сценарий «неудача» (жизнь, переполнение, завершение). */
const SCENARIO_GAMES = SCENARIO_GROUPS['scenarios.balls'];

type Kind = 'прогресс' | 'неудача';
const registry = new Map<string, Set<Kind>>();
/** Тест сценария: заодно запоминает, какие сценарии у какой игры есть (проверяется в конце файла). */
const scenario = (id: (typeof SCENARIO_GAMES)[number], kind: Kind, name: string, body: () => void): void => {
  const kinds = registry.get(id) ?? new Set<Kind>();
  kinds.add(kind);
  registry.set(id, kinds);
  coveredScenario(id, kind, name, body);
};

// ── общие помощники ──────────────────────────────────────────────────────────────────────────────────────────────────────

const holding = (...actions: BrickAction[]): BrickInput => makeBrickInput([], actions);
const count = (events: readonly BrickEvent[], type: BrickEvent['type']): number => events.filter((e) => e.type === type).length;

/** Нажатие и отпускание кнопки: два такта, поэтому автоповтор не срабатывает. */
const tap = (g: BrickGame, action: BrickAction): BrickEvent[] => [...g.step(makeBrickInput([action])), ...g.step(NEUTRAL_BRICK_INPUT)];

/** Шаги, пока не выполнится условие (не больше `max` тактов); если условие не наступило — сценарий не дошёл до исхода. */
const until = (g: BrickGame, done: () => boolean, max: number, input: BrickInput = NEUTRAL_BRICK_INPUT): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < max && !done(); i++) events.push(...g.step(input));
  expect(done(), `исход не наступил за ${max} тактов`).toBe(true);
  return events;
};
/** Шаги до такта, в котором игра выдала событие `type` (включительно); возвращает все события за это время. */
const untilEvent = (g: BrickGame, type: BrickEvent['type'], max: number, input: BrickInput = NEUTRAL_BRICK_INPUT): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < max; i++) {
    const tick = g.step(input);
    events.push(...tick);
    if (tick.some((e) => e.type === type)) return events;
  }
  throw new Error(`событие «${type}» не наступило за ${max} тактов`);
};
const run = (g: BrickGame, n: number): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
  return events;
};
/** Бросок с удержанием ↓ до посадки; возвращает события вплоть до такта посадки включительно (разбор поля и появление следующей фигуры — в нём же). */
const dropToLock = (g: BrickGame): BrickEvent[] => untilEvent(g, 'lock', 300, holding('down'));

/** Конец партии: заливка поля и удержание кадра, затем фаза `over`; после неё игра больше не отвечает на такты. */
const expectFinished = (g: BrickGame): void => {
  until(g, () => g.phase === 'over', GAME_OVER_TICKS + 10);
  expect(g.step(makeBrickInput(['left', 'rotate']))).toEqual([]);
  expect(g.overFill).toBe(BRICK_ROWS);
};

// ── мяч и ракетка ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Ball = { x: number; y: number; dx: number; dy: number };
const ball = (x: number, y: number, dx: number, dy: number): Ball => ({ x, y, dx, dy });
const newBalls = (id: BallGame['id'], options: BrickGameOptions = {}): BallGame => {
  const g = new BallGame(id, { seed: 3, ...options });
  g.start();
  return g;
};
/**
 * Дождаться очередного шага мяча и вернуть события. Признак шага — изменение мячей, счёта, жизней или вратаря. В двухмячном режиме
 * вратарь может стоять на месте, поэтому его движение не служит единственными часами. Ввод действует в такте шага, поэтому удержание кнопки нужно давать на всём протяжении ожидания.
 */
const ballStep = (g: BallGame, input: BrickInput = NEUTRAL_BRICK_INPUT): BrickEvent[] => {
  const snapshot=()=>JSON.stringify({balls:g.balls,guard:g.guard,score:g.score,lives:g.lives});
  const before=snapshot();const events:BrickEvent[]=[];
  for(let i=0;i<100&&snapshot()===before;i++)events.push(...g.step(input));
  expect(snapshot(),'мяч не сделал шаг за 100 тактов').not.toBe(before);
  return events;
};
/** Мяч у верхней границы: следующим шагом он войдёт в верхнюю зону в колонке 9, а вратарь (после сдвига) стоит левее колонки 7 — гол. */
const stageGoal = (g: BallGame, dx = 1): void => {
  g.guard = 3;
  g.balls = [ball(dx === 0 ? 9 : 8, 2, dx, -1)];
};
const START_BALL = ball(4, 17, 1, -1);

describe('pong: ракетка, кирпичи и голы', () => {
  scenario('pong', 'прогресс', 'удар по центральному кирпичу: +5, кирпич исчезает, мяч отскакивает вниз', () => {
    const g = newBalls('pong');
    expect(g.bricks.size).toBe(12); // стенка 6 × 2 в центре поля
    expect([...g.bricks].every((cell) => [8, 9].includes(Math.floor(cell / 10)) && cell % 10 >= 2 && cell % 10 <= 7)).toBe(true);
    g.balls = [ball(4, 10, 1, -1)]; // следующий шаг — в клетку (5, 9) стенки
    const events = ballStep(g);
    expect(events).toContainEqual({ type: 'hit' });
    expect(g.score).toBe(5);
    expect(g.bricks.size).toBe(11);
    expect(g.bricks.has(95)).toBe(false);
    expect(g.balls).toHaveLength(1);
    expect(g.balls[0]!.dy).toBe(1); // отскок от кирпича — вниз
    expect(g.balls[0]!.y).toBeGreaterThanOrEqual(10); // мяч не прошёл сквозь кирпич
    expect(g.level).toBe(1);
  });

  scenario('pong', 'прогресс', 'разбитая стенка сама уровень не открывает: следующий уровень — только пять голов', () => {
    const g = newBalls('pong');
    g.bricks = new Set([95]);
    g.balls = [ball(4, 10, 1, -1)];
    const events = [...ballStep(g), ...run(g, 40)];
    expect(g.bricks.size).toBe(0);
    expect(g.score).toBe(5);
    expect(count(events, 'win')).toBe(0);
    expect(g.level).toBe(1);
    expect(g.phase).toBe('playing');
  });

  scenario('pong', 'прогресс', 'край ракетки меняет направление, центр сохраняет, удержание ROTATE при ударе центром меняет сторону', () => {
    const rebound = (paddle: number, b: Ball, input = NEUTRAL_BRICK_INPUT): Ball => {
      const g = newBalls('pong');
      g.x = paddle; // ракетка занимает клетки paddle … paddle + 2 нижней строки
      g.balls = [b];
      ballStep(g, input);
      expect(g.lives).toBe(4);
      expect(g.balls).toHaveLength(1);
      return g.balls[0]!;
    };
    // мяч летит вправо вниз и попадает в левый край — уходит влево вверх
    expect(rebound(3, ball(2, 17, 1, 1))).toMatchObject({ dx: -1, dy: -1 });
    // летит влево вниз и попадает в правый край — уходит вправо вверх
    expect(rebound(3, ball(6, 17, -1, 1))).toMatchObject({ dx: 1, dy: -1 });
    // центр не меняет горизонтальную сторону…
    expect(rebound(3, ball(3, 17, 1, 1))).toMatchObject({ dx: 1, dy: -1 });
    expect(rebound(3, ball(5, 17, -1, 1))).toMatchObject({ dx: -1, dy: -1 });
    // …а удержание ROTATE при ударе центром меняет её на противоположную
    expect(rebound(3, ball(3, 17, 1, 1), holding('rotate'))).toMatchObject({ dx: -1, dy: -1 });
    expect(rebound(3, ball(5, 17, -1, 1), holding('rotate'))).toMatchObject({ dx: 1, dy: -1 });
    // ракетка, сдвинутая вправо, отбивает по тому же правилу
    expect(rebound(6, ball(5, 17, 1, 1))).toMatchObject({ dx: -1, dy: -1 });
  });

  scenario('pong', 'прогресс', 'вратарь отбивает мяч, который пришёл в клетки над ним: гола нет', () => {
    const g = newBalls('pong');
    g.guard = 3; // за шаг вратарь уйдёт на 2 или 4 и накроет колонки 2–4 или 4–6: колонка 4 закрыта в обоих случаях
    g.balls = [ball(5, 2, -1, -1)];
    const events = ballStep(g);
    expect(g.score).toBe(0);
    expect(count(events, 'win')).toBe(0);
    expect(g.balls).toHaveLength(1);
    expect(g.balls[0]!.dy).toBe(1); // отскочил обратно вниз
  });

  scenario('pong', 'прогресс', 'гол в верхнюю зону: +10 и новая подача; пять голов — +100 и следующий уровень, счётчик голов начинается заново', () => {
    const g = newBalls('pong');
    for (let goal = 1; goal <= 4; goal++) {
      stageGoal(g);
      const events = ballStep(g);
      expect(g.score, `гол ${goal}`).toBe(10 * goal);
      expect(g.lives).toBe(4);
      expect(count(events, 'win')).toBe(0);
      expect(g.balls, 'после гола мяч подаётся заново').toHaveLength(1);
      expect(g.balls[0]!.y).toBe(17);
    }
    stageGoal(g);
    const events = ballStep(g);
    expect(events).toContainEqual({ type: 'win' });
    expect(g.score).toBe(150); // пять голов по 10 и награда за уровень 100
    expect(g.level).toBe(1); // уровень сменится после анимации
    const later = until(g, () => g.level === 2, 100);
    expect(count(later, 'levelUp')).toBe(1);
    expect(g.bricks.size).toBe(12); // стенка восстановлена
    expect(g.balls).toEqual([START_BALL]);
    expect(g.lives).toBe(4);
    // на втором уровне снова нужно пять голов: четыре гола — ещё не победа
    for (let goal = 1; goal <= 4; goal++) {
      stageGoal(g);
      expect(count(ballStep(g), 'win'), `уровень 2, гол ${goal}`).toBe(0);
    }
    expect(g.score).toBe(190);
    expect(g.level).toBe(2);
    stageGoal(g);
    expect(ballStep(g)).toContainEqual({ type: 'win' });
    expect(g.score).toBe(300);
    until(g, () => g.level === 3, 100);
  });

  scenario('pong', 'неудача', 'мяч мимо ракетки (с любой стороны) отнимает жизнь, поле начинается заново, очки сохраняются', () => {
    // ракетка занимает колонки 3–5: колонка 2 левее неё, колонка 6 правее
    for (const miss of [ball(3, 17, -1, 1), ball(7, 17, -1, 1)]) {
      const g = newBalls('pong');
      g.balls = [ball(4, 10, 1, -1)];
      ballStep(g); // кирпич: +5, стенка неполная
      expect(g.bricks.size).toBe(11);
      g.balls = [miss];
      const events = ballStep(g);
      expect(events).toContainEqual({ type: 'lifeLost' });
      expect(count(events, 'gameOver')).toBe(0);
      expect(g.lives).toBe(3);
      expect(g.score).toBe(5);
      until(g, () => g.bricks.size === 12, 100); // после анимации стенка снова целая, мяч на подаче
      expect(g.balls).toEqual([START_BALL]);
      expect(g.lives).toBe(3);
      expect(g.score).toBe(5);
      expect(g.phase).toBe('playing');
    }
  });

  scenario('pong', 'неудача', 'мяч, пропущенный на последней жизни, заканчивает партию; рекорд сохраняется, новая партия начинается с четырёх жизней', () => {
    const g = newBalls('pong');
    g.balls = [ball(4, 10, 1, -1)];
    ballStep(g);
    g.lives = 1;
    g.balls = [ball(7, 17, -1, 1)];
    const events = ballStep(g);
    expect(events).toContainEqual({ type: 'lifeLost' });
    expect(events).toContainEqual({ type: 'gameOver' });
    expect(g.lives).toBe(0);
    expectFinished(g);
    expect(g.score).toBe(5);
    expect(g.hiScore).toBe(5);
    g.start();
    expect(g.phase).toBe('playing');
    expect(g.lives).toBe(4);
    expect(g.score).toBe(0);
    expect(g.hiScore).toBe(5);
  });
});

describe('pong-double: два мяча', () => {
  scenario('pong-double', 'прогресс', 'два мяча в начале; пять голов (два сразу, затем по одному) — +100 и следующий уровень с двумя мячами', () => {
    const g = newBalls('pong-double');
    expect(g.balls).toHaveLength(2);
    expect(g.bricks.size).toBe(0); // кирпичей нет: всё внимание двум мячам
    const picture = g.cells();
    for (const b of g.balls) expect(picture[b.y * 10 + b.x], `мяч (${b.x}, ${b.y}) мигает на экране`).toBe(2);
    const start = g.balls.map(({x,y,dy})=>({x,y,dy}));

    // оба мяча одновременно уходят в верхнюю зону справа и слева от вратаря
    g.guard = 3;
    g.balls = [ball(8, 2, 1, -1), ball(1, 2, -1, -1)];
    ballStep(g);
    expect(g.score).toBe(20);
    expect(g.lives).toBe(4);
    for (let goal = 3; goal <= 4; goal++) {
      stageGoal(g);
      expect(count(ballStep(g), 'win'), `гол ${goal}`).toBe(0);
    }
    expect(g.score).toBe(40);
    stageGoal(g);
    expect(ballStep(g)).toContainEqual({ type: 'win' });
    expect(g.score).toBe(150);
    until(g, () => g.level === 2, 100);
    expect(g.balls.map(({x,y,dy})=>({x,y,dy}))).toEqual(start); // новый уровень снова начинается с двух мячей
    expect(g.lives).toBe(4);
  });

  scenario('pong-double', 'неудача', 'пропущенный мяч отнимает жизнь сразу, даже если второй ещё в игре; поле начинается заново с двумя мячами', () => {
    const g = newBalls('pong-double');
    const start = g.balls.map(({x,y,dy})=>({x,y,dy}));
    g.balls = [ball(7, 17, -1, 1), ball(5, 6, 1, -1)]; // первый уходит мимо ракетки (3–5), второй далеко от краёв
    const events = ballStep(g);
    expect(events).toContainEqual({ type: 'lifeLost' });
    expect(g.lives).toBe(3);
    expect(g.phase).toBe('playing');
    until(g, () => g.balls.length === 2 && g.balls[0]!.y === 17, 100);
    expect(g.balls.map(({x,y,dy})=>({x,y,dy}))).toEqual(start); // второй мяч не сохраняется: поле собрано заново
    expect(g.lives).toBe(3);
  });

  scenario('pong-double', 'неудача', 'на последней жизни пропущенный мяч заканчивает партию, второй мяч этого не отменяет', () => {
    const g = newBalls('pong-double');
    g.lives = 1;
    g.balls = [ball(7, 17, -1, 1), ball(5, 6, 1, -1)];
    const events = ballStep(g);
    expect(events).toContainEqual({ type: 'gameOver' });
    expect(g.lives).toBe(0);
    expectFinished(g);
  });
});

describe('pneumatic-ball: промах не стоит жизни, подача удержанием ROTATE', () => {
  scenario('pneumatic-ball', 'прогресс', 'подача удержанием ROTATE → полёт вверх → гол мимо вратаря: +10 (полный полёт, скорость 10)', () => {
    const g = newBalls('pneumatic-ball', { speed: 10 });
    g.balls = []; // предыдущий мяч уже потерян
    g.x = 0; // подача идёт из колонки ракетка + 1 = 1
    g.step(holding('rotate'));
    expect(g.balls).toEqual([ball(1, 17, 0, -1)]); // подача — в тот же такт, мяч летит строго вверх
    // вратарь стартует над колонками 3–5 и ходит по полю туда-сюда; за 16 шагов мяча (строка 17 → 1) он уходит и оказывается над колонками 5–7
    const events = until(g, () => g.balls.length === 0, 200);
    expect(g.score).toBe(10);
    expect(g.lives).toBe(4);
    expect(count(events, 'lifeLost')).toBe(0);
    expect(g.level).toBe(1);
  });

  scenario('pneumatic-ball', 'прогресс', 'вратарь, закрывший колонку мяча, возвращает его: гола нет', () => {
    const g = newBalls('pneumatic-ball');
    g.guard = 3; // за шаг вратарь уйдёт на 2 или 4: колонка 4 закрыта в обоих случаях
    g.balls = [ball(4, 2, 0, -1)];
    ballStep(g);
    expect(g.score).toBe(0);
    expect(g.balls).toHaveLength(1);
    expect(g.balls[0]!.dy).toBe(1);
  });

  scenario('pneumatic-ball', 'прогресс', 'пять голов (по 10) — +100 и следующий уровень; каждый новый мяч подаётся удержанием ROTATE', () => {
    const g = newBalls('pneumatic-ball');
    g.balls = [];
    for (let goal = 1; goal <= 4; goal++) {
      g.step(holding('rotate')); // подача
      expect(g.balls, `подача перед голом ${goal}`).toEqual([ball(g.x + 1, 17, 0, -1)]);
      stageGoal(g, 0); // мяч подлетел к верхней границе (положение подготовлено)
      expect(count(ballStep(g), 'win'), `гол ${goal}`).toBe(0);
      expect(g.balls, 'мяч ушёл в гол, нового нет, пока не удержана кнопка').toHaveLength(0);
      expect(g.score).toBe(10 * goal);
      expect(g.lives).toBe(4);
    }
    g.step(holding('fire')); // клавиатурный «огонь» подаёт так же, как ROTATE
    expect(g.balls).toHaveLength(1);
    stageGoal(g, 0);
    expect(ballStep(g)).toContainEqual({ type: 'win' });
    expect(g.score).toBe(150);
    until(g, () => g.level === 2, 100);
    expect(g.lives).toBe(4);
    expect(g.balls).toEqual([START_BALL]); // на новом уровне мяч уже подан
  });

  scenario('pneumatic-ball', 'неудача', 'промах не стоит жизни и не заканчивает партию; нового мяча нет, пока не удержана кнопка', () => {
    const g = newBalls('pneumatic-ball');
    g.balls = [];
    for (let miss = 1; miss <= 3; miss++) {
      g.step(holding('rotate'));
      expect(g.balls).toHaveLength(1);
      g.balls = [ball(7, 17, -1, 1)]; // мяч вернулся вниз правее ракетки (колонки 3–5)
      const events = ballStep(g);
      expect(g.balls, `промах ${miss}: мяч потерян`).toHaveLength(0);
      expect(g.lives, `промах ${miss}`).toBe(4);
      expect(count(events, 'lifeLost')).toBe(0);
      expect(count(events, 'gameOver')).toBe(0);
    }
    // без удержания кнопки мяч не появляется сам
    expect(run(g, 150)).toEqual([]);
    expect(g.balls).toHaveLength(0);
    expect(g.phase).toBe('playing');
    expect(g.score).toBe(0);
    expect(g.lives).toBe(4);
    // удержание подаёт мяч из колонки под ракеткой; пока мяч в игре, удержание нового не добавляет
    tap(g, 'right');
    expect(g.x).toBe(4);
    const hold = holding('rotate');
    g.step(hold);
    expect(g.balls).toEqual([ball(5, 17, 0, -1)]);
    for (let i = 0; i < 30; i++) g.step(hold);
    expect(g.balls).toHaveLength(1);
  });

  scenario('pneumatic-ball', 'неудача', 'мяч, пропущенный у ракетки правее и левее, одинаково не стоит жизни', () => {
    for (const miss of [ball(3, 17, -1, 1), ball(7, 17, -1, 1)]) {
      const g = newBalls('pneumatic-ball');
      g.balls = [miss];
      ballStep(g);
      expect(g.balls).toHaveLength(0);
      expect(g.lives).toBe(4);
      expect(g.phase).toBe('playing');
    }
  });
});

describe('arkanoid-dots: стена, затем две мигающие цели', () => {
  scenario('arkanoid-dots', 'прогресс', 'кирпич: +5, цели за стеной недоступны, пока стена цела (мяч отскакивает от верха)', () => {
    const g = newBalls('arkanoid-dots');
    expect(g.bricks.size).toBe(32); // 8 × 4
    expect(g.dots.size).toBe(2);
    expect([...g.dots].every((cell) => Math.floor(cell / 10) === 1)).toBe(true); // цели в строке 1, над стеной
    const picture = g.cells();
    for (const cell of g.dots) expect(picture[cell], 'цель мигает').toBe(2);
    for (let x = 0; x < 10; x++) expect(picture[x], 'верхней ракетки нет').not.toBe(1);

    g.balls = [ball(4, 7, 1, -1)]; // следующий шаг — в клетку (5, 6) стены
    expect(ballStep(g)).toContainEqual({ type: 'hit' });
    expect(g.score).toBe(5);
    expect(g.bricks.size).toBe(31);
    expect(g.balls[0]!.dy).toBe(1);

    // мяч подлетает к первой цели (клетка (2, 1)), пока стена ещё стоит: цель неприкосновенна, мяч отскакивает от верхней границы
    g.balls = [ball(3, 2, -1, -1)];
    ballStep(g);
    expect(g.dots.size).toBe(2);
    expect(g.score).toBe(5);
    expect(g.balls[0]!.dy).toBe(1);
  });

  scenario('arkanoid-dots', 'прогресс', 'последний кирпич, затем цели по +25: уровень открывается после обеих целей (+100)', () => {
    const g = newBalls('arkanoid-dots');
    g.bricks = new Set([65]); // остался один кирпич
    g.balls = [ball(4, 7, 1, -1)];
    ballStep(g);
    expect(g.bricks.size).toBe(0);
    expect(g.score).toBe(5);
    expect(g.dots.size).toBe(2); // цели ещё на месте

    g.balls = [ball(3, 2, -1, -1)]; // в клетку (2, 1)
    expect(count(ballStep(g), 'win')).toBe(0);
    expect(g.dots.size).toBe(1);
    expect(g.score).toBe(30);
    expect(g.balls[0]!.dy).toBe(1); // цель отбрасывает мяч вниз
    expect(g.level).toBe(1);

    g.balls = [ball(6, 2, 1, -1)]; // в клетку (7, 1) — вторая цель
    expect(ballStep(g)).toContainEqual({ type: 'win' });
    expect(g.dots.size).toBe(0);
    expect(g.score).toBe(155); // 5 + 25 + 25 + награда 100
    until(g, () => g.level === 2, 100);
    expect(g.bricks.size).toBe(32); // новый уровень: стена и цели снова на месте
    expect(g.dots.size).toBe(2);
    expect(g.lives).toBe(4);
    expect(g.balls).toEqual([START_BALL]);
  });

  scenario('arkanoid-dots', 'прогресс', 'у верхней границы нет вратаря: мяч там только отскакивает и не засчитывается голом', () => {
    const g = newBalls('arkanoid-dots');
    g.balls = [ball(8, 2, 1, -1)]; // в теннисе это гол в колонке 9
    ballStep(g);
    expect(g.score).toBe(0);
    expect(g.lives).toBe(4);
    expect(g.balls).toHaveLength(1);
    expect(g.balls[0]!.dy).toBe(1);
  });

  scenario('arkanoid-dots', 'неудача', 'мяч мимо ракетки отнимает жизнь; поле собирается заново (стена и цели), очки остаются', () => {
    const g = newBalls('arkanoid-dots');
    g.balls = [ball(4, 7, 1, -1)];
    ballStep(g); // кирпич разбит: 31 из 32
    expect(g.score).toBe(5);
    g.bricks.delete(66);
    g.dots.delete(12); // ещё один кирпич и одну цель убрали заранее
    g.balls = [ball(7, 17, -1, 1)];
    const events = ballStep(g);
    expect(events).toContainEqual({ type: 'lifeLost' });
    expect(g.lives).toBe(3);
    until(g, () => g.bricks.size === 32, 100);
    expect(g.dots.size).toBe(2);
    expect(g.balls).toEqual([START_BALL]);
    expect(g.score).toBe(5);
    expect(g.level).toBe(1);
  });

  scenario('arkanoid-dots', 'неудача', 'мяч, пропущенный на последней жизни, заканчивает партию', () => {
    const g = newBalls('arkanoid-dots');
    g.lives = 1;
    g.balls = [ball(3, 17, -1, 1)]; // колонка 2 — левее ракетки (3–5)
    const events = ballStep(g);
    expect(events).toContainEqual({ type: 'gameOver' });
    expect(g.lives).toBe(0);
    expectFinished(g);
    expect(g.level).toBe(1);
  });
});

// ── тетрис с мигающими клетками ──────────────────────────────────────────────────────────────────────────────────────────────

describe('tetris-flicker: мигающие клетки уходят только вместе с рядами', () => {
  const newTetris = (options: BrickGameOptions = {}): FlickerTetrisGame => {
    const g = new FlickerTetrisGame({ seed: 3, ...options });
    g.start();
    return g;
  };
  /** Клетка поля: x — колонка, y — высота над дном (0 — нижний ряд). */
  const setCell = (g: FlickerTetrisGame, x: number, y: number, value: number): void => {
    g['board'][y * 10 + x] = value;
  };
  const blinking = (g: FlickerTetrisGame): number => g['board'].filter((v) => v === 2).length;
  /** Падающей и следующей фигурой назначается вертикальная палка (4 × 1): она появляется там, где и положено, — по центру, выше экрана. */
  const stick = (g: FlickerTetrisGame): void => {
    const piece = makePiece(SHAPE_LINE);
    g['piece'] = piece;
    g['pieceX'] = 4;
    g['pieceY'] = BRICK_ROWS - 1 - piece.minY;
    g['nextPiece'] = makePiece(SHAPE_LINE);
  };
  /** Дождаться появления фигуры, увести её в колонку `column` нажатиями ← → и бросить с удержанием ↓; возвращает события до посадки. */
  const dropInto = (g: FlickerTetrisGame, column: number): BrickEvent[] => {
    until(g, () => g['piece'] !== null && !g['fallingFinished'], 300);
    for (let guard = 0; g['pieceX'] !== column && guard < 12; guard++) tap(g, g['pieceX'] < column ? 'right' : 'left');
    expect(g['pieceX']).toBe(column);
    return dropToLock(g);
  };

  scenario('tetris-flicker', 'прогресс', 'на первом уровне подготовлены два ряда: девять клеток, дыра и одна мигающая клетка в каждом', () => {
    const g = newTetris();
    const board = g['board'];
    for (let y = 0; y < 20; y++) {
      const row = Array.from(board.slice(y * 10, y * 10 + 10));
      if (y < 2) {
        expect(row.filter((v) => v !== 0), `ряд ${y}`).toHaveLength(9);
        expect(row.filter((v) => v === 2), `ряд ${y}: мигающая клетка`).toHaveLength(1);
      } else {
        expect(row.every((v) => v === 0), `ряд ${y} пуст`).toBe(true);
      }
    }
    const picture = g.cells();
    expect(Array.from(picture.slice(190)).filter((v) => v === 2)).toHaveLength(1); // нижняя строка экрана
    expect(Array.from(picture.slice(180, 190)).filter((v) => v === 2)).toHaveLength(1);
    // следующие уровни начинаются с большим числом целей
    expect(blinking(newTetris({ level: 3 }))).toBeGreaterThan(blinking(g));
  });

  scenario('tetris-flicker', 'прогресс', 'обычный ряд убирается без победы, мигающая клетка выше опускается и продолжает мигать; ряд с последней мигающей клеткой — победа и +100', () => {
    const g = newTetris();
    g['board'].fill(0);
    for (let x = 0; x <= 8; x++) setCell(g, x, 0, 1); // ряд 0: обычный, дыра в колонке 9
    for (let x = 2; x <= 8; x++) setCell(g, x, 1, 1); // ряд 1: дыры в колонках 0 и 9…
    setCell(g, 1, 1, 2); // …и одна мигающая клетка в колонке 1
    expect(blinking(g)).toBe(1);
    stick(g);

    // палка в колонку 9 достраивает ряд 0 (и подпирает ряд 1 справа): убирается обычный ряд, 1 очко
    const first = dropInto(g, 9);
    const firstEvents = [...first, ...run(g, 100)];
    expect(firstEvents).toContainEqual(expect.objectContaining({ type: 'lines', count: 1 }));
    expect(count(firstEvents, 'win')).toBe(0);
    expect(g.score).toBe(1);
    expect(blinking(g)).toBe(1);
    expect(g['board'][1], 'мигающая клетка опустилась на ряд 0 и осталась мигающей').toBe(2);
    expect(g.level).toBe(1);

    // следующая палка в колонку 0 закрывает дыру, которая осталась в бывшем ряду 1 (теперь он нижний): ряд с мигающей клеткой убирается
    const second = dropInto(g, 0);
    expect(count(second, 'lines')).toBe(1);
    const events = [...second, ...untilEvent(g, 'win', 200)];
    expect(blinking(g)).toBe(0);
    expect(g.score).toBe(102); // два ряда по 1 очку и награда 100
    expect(g.level).toBe(1);
    until(g, () => g.level === 2, 100);
    expect(count(events, 'levelUp')).toBe(0); // levelUp приходит вместе со сменой уровня
    expect(g.score).toBe(102);
    expect(blinking(g)).toBeGreaterThan(2); // новое поле: больше целей, чем на первом уровне
    expect(g.phase).toBe('playing');
  });

  scenario('tetris-flicker', 'прогресс', 'два ряда одной посадкой: 1 + 2 = 3 очка, обе мигающие клетки уходят и открывают следующий уровень', () => {
    const g = newTetris();
    g['board'].fill(0);
    for (let y = 0; y <= 1; y++) for (let x = 0; x <= 8; x++) setCell(g, x, y, 1);
    setCell(g, 0, 0, 2);
    setCell(g, 5, 1, 2);
    stick(g);
    const landing = dropInto(g, 9); // палка заполняет дыры обоих рядов
    expect(landing).not.toContainEqual({ type: 'win' });
    const events = [...landing, ...untilEvent(g, 'win', 200)];
    expect(events).toContainEqual(expect.objectContaining({ type: 'lines', count: 2 }));
    expect(g.score).toBe(103); // 1 за первый ряд, 2 за второй и 100 за победу
    until(g, () => g.level === 2, 100);
  });

  scenario('tetris-flicker', 'неудача', 'фигура, севшая выше поля, заканчивает партию; башня ниже горлышка партию не кончает', () => {
    const g = newTetris();
    g['board'].fill(0);
    for (let y = 0; y <= 16; y++) for (let x = 2; x <= 7; x++) setCell(g, x, y, 1); // башня без полных рядов
    setCell(g, 2, 0, 2); // мигающая клетка внутри башни: победа невозможна
    g['piece'] = makePiece(SHAPE_SQUARE);
    g['pieceX'] = 4;
    g['pieceY'] = BRICK_ROWS - 1;
    g['nextPiece'] = makePiece(SHAPE_SQUARE);
    expect(g.lives).toBeNull();
    // первый квадрат ложится на башню в строки 17–18 (поле ещё живо), второй появляется и не может опуститься: он торчит выше экрана
    const first = dropToLock(g);
    expect(count(first, 'gameOver')).toBe(0);
    expect(g.phase).toBe('playing');
    const events = untilEvent(g, 'gameOver', 300, holding('down'));
    expect(count(events, 'gameOver')).toBe(1);
    expectFinished(g);
    expect(g.score).toBe(0);
  });
});

// ── поле 4 × 9: колонны, колонны с мигающими клетками, капсулы ─────────────────────────────────────────────────────────────────

/** Картинка поля 4 × 9 строками сверху вниз: `.` — пусто, `1`–`3` — обычная клетка этого типа, `a`–`c` — мигающая (вирус) типа 1–3. */
const TYPES = '.123';
const BLINKS = '.abc';
const load = (g: CapsuleGame, rows: readonly string[]): void => {
  expect(rows).toHaveLength(9);
  g.board.fill(0);
  g.link.fill(-1);
  g.viruses.clear();
  rows.forEach((row, y) => {
    expect(row, `строка ${y}`).toHaveLength(4);
    [...row].forEach((glyph, x) => {
      if (glyph === '.') return;
      const cell = y * 4 + x;
      if (TYPES.includes(glyph)) g.board[cell] = TYPES.indexOf(glyph);
      else if (BLINKS.includes(glyph)) {
        g.board[cell] = BLINKS.indexOf(glyph);
        g.viruses.add(cell);
      } else throw new Error(`неизвестный символ «${glyph}»`);
    });
  });
};
const look = (g: CapsuleGame): string[] =>
  Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 4 }, (_, x) => {
      const cell = y * 4 + x;
      return (g.viruses.has(cell) ? BLINKS : TYPES)[g.board[cell]!]!;
    }).join(''),
  );
const mirror = (rows: readonly string[]): string[] => rows.map((row) => [...row].reverse().join(''));
const EMPTY = '....';
const fresh = (id: CapsuleGame['id'], options: BrickGameOptions = {}): CapsuleGame => {
  const g = new CapsuleGame(id, { seed: 3, ...options });
  g.start();
  return g;
};
/** Падающая фигура: цвета сверху вниз (или слева направо), положение вверху поля. */
const spawnPiece = (g: CapsuleGame, piece: number[], orientation: number): void => {
  g.piece = piece;
  g.orientation = orientation;
  g.x = 1;
  g.y = 0;
};
/** Фигура уходит в колонку `column` нажатиями ← → (с учётом стенок). */
const moveTo = (g: CapsuleGame, column: number): void => {
  for (let guard = 0; g.x !== column && guard < 8; guard++) tap(g, g.x < column ? 'right' : 'left');
  expect(g.x).toBe(column);
};
/** Башня в колонке 1 до горлышка (строки 3–8), где появляется фигура (строки 0–2): камни чередуются, поэтому линий нет. */
const TOWER = [EMPTY, EMPTY, EMPTY, '.1..', '.2..', '.3..', '.1..', '.2..', '.3..'];
const LOW_TOWER = [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '.1..', '.2..', '.3..'];

describe('columns: линии от четырёх, диагонали, каскады, поклеточное оседание', () => {
  scenario('columns', 'прогресс', 'поворот меняет порядок тройки; линия из четырёх, оседание и каскад: две четвёрки подряд — 80 очков', () => {
    const g = fresh('columns');
    load(g, [EMPTY, EMPTY, EMPTY, EMPTY, '3...', '3...', '3...', '111.', '3232']);
    spawnPiece(g, [1, 2, 3], 1);
    tap(g, 'rotate');
    expect(g.capsuleCells().map((c) => c.color)).toEqual([3, 1, 2]); // нижний камень уходит наверх
    tap(g, 'up'); // ↑ — то же, что ROTATE
    expect(g.capsuleCells().map((c) => c.color)).toEqual([2, 3, 1]);
    moveTo(g, 3);
    const events = dropToLock(g);
    // 1) на опору в колонке 3 легла тройка сверху вниз 2, 3, 1: ряд 7 «1 1 1 1» — четыре клетки, 40 очков;
    // 2) три тройки левого столбца осели на одну строку и вместе с тройкой в нижней строке дали вертикаль из четырёх — ещё 40
    expect(g.score).toBe(80);
    expect(count(events, 'lines')).toBe(2);
    expect(look(g)).toEqual([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '...2', '...3', '.232']);
  });

  for (const mirrored of [false, true]) {
    scenario('columns', 'прогресс', `диагональ ${mirrored ? '«/»' : '«\\»'} из четырёх исчезает: 40 очков, остальные камни оседают поклеточно`, () => {
      const before = [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '1...', '21..', '331.', '223.'];
      const after = [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '2...', '33.3', '2232'];
      const g = fresh('columns');
      load(g, mirrored ? mirror(before) : before);
      spawnPiece(g, [3, 2, 1], 1); // сверху вниз 3, 2, 1: нижний камень ложится на пол и замыкает диагональ из единиц
      moveTo(g, mirrored ? 0 : 3);
      const events = dropToLock(g);
      expect(g.score).toBe(40);
      expect(count(events, 'lines')).toBe(1);
      expect(look(g)).toEqual(mirrored ? mirror(after) : after);
    });
  }

  scenario('columns', 'прогресс', 'поклеточное оседание: после вертикальной линии падают только камни её колонки, соседние стоят', () => {
    const g = fresh('columns');
    load(g, [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '..1.', '.31.', '.211']);
    spawnPiece(g, [2, 3, 1], 1);
    moveTo(g, 2);
    dropToLock(g);
    // колонка 2 была 1, 1, 1 (строки 6–8), нижний камень фигуры лёг пятым: четыре единицы подряд, 40 очков; двойка и тройка сверху осели на пол колонки
    expect(g.score).toBe(40);
    expect(look(g)).toEqual([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '.32.', '.231']);
  });

  scenario('columns', 'прогресс', 'три одинаковых в ряд не исчезают — нужны четыре', () => {
    const g = fresh('columns');
    load(g, [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '11.2']);
    spawnPiece(g, [2, 3, 1], 1);
    moveTo(g, 2);
    const events = dropToLock(g);
    expect(g.score).toBe(0);
    expect(count(events, 'lines')).toBe(0);
    expect(look(g).slice(6)).toEqual(['..2.', '..3.', '1112']);
  });

  scenario('columns', 'неудача', 'башня до горлышка: новая тройка не помещается — конец партии; пока горлышко свободно, партия идёт', () => {
    const low = fresh('columns');
    load(low, LOW_TOWER);
    spawnPiece(low, [3, 2, 1], 1);
    expect(count(dropToLock(low), 'gameOver')).toBe(0); // фигура легла в строки 3–5, следующая помещается
    expect(low.phase).toBe('playing');

    const g = fresh('columns');
    load(g, TOWER);
    spawnPiece(g, [3, 2, 1], 1);
    const events = dropToLock(g); // фигура села в строки 0–2 — для новой места нет
    expect(count(events, 'gameOver')).toBe(1);
    expect(g.score).toBe(0);
    expect(g.lives).toBeNull();
    expectFinished(g);
  });
});

describe('columns-flicker: линии от трёх, неподвижные мигающие клетки', () => {
  scenario('columns-flicker', 'прогресс', 'порог — три: тройка в ряд исчезает (30 очков), мигающая клетка рядом остаётся, партия продолжается', () => {
    const g = fresh('columns-flicker');
    load(g, [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '11.b']);
    spawnPiece(g, [2, 3, 1], 1);
    moveTo(g, 2);
    const events = dropToLock(g);
    expect(g.score).toBe(30);
    expect(count(events, 'lines')).toBe(1);
    expect(count(events, 'win')).toBe(0);
    expect(look(g).slice(6)).toEqual([EMPTY, '..2.', '..3b']);
    expect(g.viruses.size).toBe(1);
    expect(g.phase).toBe('playing');
  });

  scenario('columns-flicker', 'прогресс', 'мигающая клетка не падает, когда убрана клетка под ней, а обычные сверху оседают', () => {
    const g = fresh('columns-flicker');
    load(g, [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '.3..', '3b..', '11..']);
    spawnPiece(g, [3, 2, 1], 1);
    moveTo(g, 2);
    dropToLock(g);
    // убраны три единицы нижнего ряда (30 очков); обычная тройка слева встала на пол, мигающая осталась на месте и держит тройку над собой
    expect(g.score).toBe(30);
    expect(look(g).slice(6)).toEqual(['.3..', '.b3.', '3.2.']);
    expect(g.viruses.has(7 * 4 + 1)).toBe(true);
    expect(g.viruses.size).toBe(1);
  });

  scenario('columns-flicker', 'прогресс', 'все мигающие клетки убраны совпадениями → победа (+100) и следующий уровень с новыми мигающими клетками', () => {
    const g = fresh('columns-flicker');
    const levelOneTargets = g.viruses.size;
    load(g, [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, 'a1.b']);
    expect(g.viruses.size).toBe(2);

    // первая фигура: внизу получается «1 1 1» с мигающей единицей слева — она исчезает, мигающая двойка справа ещё стоит
    spawnPiece(g, [3, 2, 1], 1);
    moveTo(g, 2);
    const first = dropToLock(g);
    expect(g.score).toBe(30);
    expect(count(first, 'win')).toBe(0);
    expect(look(g).slice(7)).toEqual(['..3.', '..2b']);
    expect(g.viruses.size).toBe(1);

    // вторая фигура: внизу «2 2 b» — последняя мигающая клетка уходит в линии
    spawnPiece(g, [1, 3, 2], 1);
    moveTo(g, 1);
    const second = dropToLock(g);
    expect(g.viruses.size).toBe(0);
    expect(second).toContainEqual({ type: 'win' });
    expect(g.score).toBe(160); // 30 + 30 за линии и 100 за победу
    expect(g.level).toBe(1);
    until(g, () => g.level === 2, 100);
    expect(g.viruses.size).toBeGreaterThan(levelOneTargets); // на втором уровне целей больше
    expect([...g.viruses].every((cell) => cell >= 24)).toBe(true); // нижние три строки
    expect(g.cells().includes(2)).toBe(true); // мигающие клетки видны на экране
  });

  scenario('columns-flicker', 'неудача', 'переполнение горлышка при живых мигающих клетках — конец партии', () => {
    const g = fresh('columns-flicker');
    load(g, [...TOWER.slice(0, 8), '.3.a']);
    spawnPiece(g, [3, 2, 1], 1);
    const events = dropToLock(g);
    expect(count(events, 'gameOver')).toBe(1);
    expect(count(events, 'win')).toBe(0);
    expectFinished(g);
    expect(g.viruses.size).toBe(1);
  });
});

describe('dr-mario: капсулы и вирусы', () => {
  scenario('dr-mario', 'прогресс', 'две капсулы убирают два вируса: после первой партия идёт, после второй — победа (+100) и новый уровень с большим числом вирусов', () => {
    const g = fresh('dr-mario');
    const levelOneViruses = g.viruses.size;
    load(g, [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '...2', '1..2', 'a..b']);

    // капсула из двух единиц: поворот в вертикальное положение, шаг влево, падение на единицу и вирус «1» — четыре в столбце
    spawnPiece(g, [1, 1], 0);
    tap(g, 'rotate');
    expect(g.orientation).toBe(1);
    moveTo(g, 0);
    const first = dropToLock(g);
    expect(g.score).toBe(40);
    expect(count(first, 'win')).toBe(0);
    expect(g.viruses.size).toBe(1);
    expect(look(g)).toEqual([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '...2', '...2', '...b']);
    expect(g.y).toBe(0); // следующая капсула появилась
    expect(g.phase).toBe('playing');

    // капсула «3 сверху, 2 снизу»: двойка ложится на три двойки (две обычные и вирус), тройка остаётся сверху, лишившись пары, и оседает на пол
    spawnPiece(g, [3, 2], 0);
    tap(g, 'rotate');
    moveTo(g, 3);
    const second = dropToLock(g);
    expect(g.viruses.size).toBe(0);
    expect(second).toContainEqual({ type: 'win' });
    expect(g.score).toBe(180); // 40 + 40 за две линии по четыре клетки и 100 за победу
    expect(look(g)).toEqual([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '...3']);
    expect(g.link.every((partner) => partner === -1)).toBe(true); // у осевшей половинки нет «призрачной» пары
    expect(g.level).toBe(1);
    until(g, () => g.level === 2, 100);
    expect(g.viruses.size).toBeGreaterThan(levelOneViruses);
    expect([...g.viruses].every((cell) => cell >= 24)).toBe(true);
    expect(g.cells().includes(2)).toBe(true);
  });

  scenario('dr-mario', 'прогресс', 'три в ряд не исчезают, четыре по горизонтали — исчезают вместе с вирусом и дают победу', () => {
    const board = [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '1a..'];
    const three = fresh('dr-mario');
    load(three, board);
    spawnPiece(three, [1, 2], 0);
    moveTo(three, 2);
    const threeEvents = dropToLock(three); // внизу «1 a 1 2»: три единицы подряд
    expect(three.score).toBe(0);
    expect(count(threeEvents, 'lines')).toBe(0);
    expect(look(three).slice(8)).toEqual(['1a12']);
    expect(three.viruses.size).toBe(1);

    const four = fresh('dr-mario');
    load(four, board);
    spawnPiece(four, [1, 1], 0);
    moveTo(four, 2);
    const fourEvents = dropToLock(four); // внизу «1 a 1 1»: четыре единицы подряд, среди них вирус
    expect(four.score).toBe(140); // 40 за линию и 100 за победу
    expect(fourEvents).toContainEqual({ type: 'win' });
    expect(four.viruses.size).toBe(0);
    expect(look(four).slice(8)).toEqual([EMPTY]);
  });

  it('диагональ из четырёх у капсул не считается линией (в отличие от колонн)', () => {
    const g = fresh('dr-mario');
    const board = [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '1...', '21..', '331.', '22c.'];
    load(g, board);
    spawnPiece(g, [2, 1], 0);
    tap(g, 'rotate'); // вертикально: сверху 2, снизу 1
    moveTo(g, 3);
    const events = dropToLock(g);
    expect(g.score).toBe(0);
    expect(count(events, 'lines')).toBe(0);
    expect(look(g)).toEqual([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '1...', '21..', '3312', '22c1']);
  });

  scenario('dr-mario', 'неудача', 'капсулы растут башней в горлышке: вторая садится у самого верха, следующая не помещается — конец партии, вирусы остаются', () => {
    const g = fresh('dr-mario');
    load(g, [EMPTY, EMPTY, '.12.', '.21.', '.12.', '.21.', '.12.', '.21.', 'c12c']); // столбцы 1 и 2 набиты до строки 2 без линий
    const first = dropToLock(g); // любая капсула ляжет в строку 1 и ни с чем не сложится
    expect(count(first, 'gameOver')).toBe(0);
    expect(g.phase).toBe('playing');
    expect(g.y).toBe(0); // следующая капсула появилась в строке 0 (она последняя, кто помещается)
    const second = dropToLock(g); // она не может опуститься ни на строку — садится сразу
    expect(count(second, 'gameOver')).toBe(1);
    expect(g.viruses.size).toBe(2);
    expect(g.score).toBe(0);
    expect(g.lives).toBeNull();
    expectFinished(g);
  });
});

describe('покрытие сценариями', () => {
  it('SCENARIO_GAMES — игры библиотеки, у каждой из которых есть и «прогресс», и «неудача»', () => {
    const both = [...registry].filter(([, kinds]) => kinds.has('прогресс') && kinds.has('неудача')).map(([id]) => id);
    expect([...both].sort()).toEqual([...SCENARIO_GAMES].sort());
    for (const id of SCENARIO_GAMES) expect(LIBRARY_GAMES[id]?.id).toBe(id);
  });
});
