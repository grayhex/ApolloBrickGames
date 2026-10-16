/**
 * Описание «Арканоида» для левой панели (`ARKANOID_GUIDE`): оно годится, не содержит заглушек, а каждое число и каждая схема
 * подтверждены поведением самой игры — создаём игру, прогоняем и сравниваем с тем, что написано в тексте.
 */
import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  BRICK_TICK_HZ,
  MAX_LEVEL,
  NEUTRAL_BRICK_INPUT,
  guideProblems,
  makeBrickInput,
  msToTicks,
  type BrickAction,
  type BrickEvent,
  type BrickGameOptions,
  type BrickInput,
  type GameGuideData,
  type GuideText,
} from '../../../src/brick';
import { ARKANOID_MODES, ArkanoidGame, arkanoidDef } from '../../../src/brick/games/arkanoid';
import { PRELOADED_WALLS, WALL_WIDTH } from '../../../src/brick/games/arkanoid/wall';
import { ARKANOID_GUIDE } from '../../../src/brick/guides/arkanoid';

// ---------------------------------------------------------------- помощники

const NEVER = 1_000_000;
const INTRO_SECONDS = 1.5;

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
  idle(game, msToTicks(INTRO_SECONDS * 1000));
  return game;
}

/** Свежая партия без вступления и без сдвига стены: тест сам расставляет мяч и вызывает `ballStep`. */
function still(mode = 0, options: BrickGameOptions = {}): ArkanoidGame {
  const game = make(mode, options);
  game.start();
  game['shiftLeft'] = NEVER;
  game['introLeft'] = 0;
  game['ballClock'] = 0;
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

/** Положение и направление мяча в системе донора: `y` = 0 — нижний ряд, +1 — вправо / вверх. */
const ball = (game: ArkanoidGame): { x: number; y: number; dx: number; dy: number } => ({
  x: game['ballX'],
  y: game['ballY'],
  dx: game['dirX'],
  dy: game['dirY'],
});

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
const tap = (...actions: BrickAction[]): BrickInput => makeBrickInput(actions);

/** Оставить в стене только кирпичи `keep` (пары «колонка, ряд стены», ряд 0 — нижний) и перерисовать стену. */
function keepBricks(game: ArkanoidGame, keep: readonly (readonly [number, number])[]): void {
  const wall = game['wall'];
  for (let wy = 0; wy < wall.height; wy++) {
    for (let x = 0; x < WALL_WIDTH; x++) {
      if (!keep.some(([kx, ky]) => kx === x && ky === wy)) wall.breakBrick(x, wy);
    }
  }
  game['insertWall']();
}

/** Пройти сценки (взрыв, очистку, конец игры) до их конца, но не больше `max` тактов; вернуть все события. */
function finishScenes(game: ArkanoidGame, max = 1000): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < max && game.phase === 'playing' && game['busy']; i++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
  return events;
}

/** Потеря мяча: мяч проходит мимо платформы, сценки доигрываются. */
function loseBall(game: ArkanoidGame): void {
  place(game, 8, 0, 1, -1);
  ballStep(game);
  finishScenes(game);
}

/** Через сколько тактов после старта мяч трогается с места. */
function measureIntroTicks(): number {
  const game = make(0);
  game.start();
  const startY = game['ballY'];
  for (let t = 1; t <= 300; t++) {
    game.step(NEUTRAL_BRICK_INPUT);
    if (game['ballY'] !== startY) return t - 1;
  }
  throw new Error('мяч так и не тронулся');
}

/** Период шага мяча по таймеру, такты: разница между первым и вторым шагом после вступления. */
function measureBallPeriod(mode: number, speed: number, level = 1): number {
  const game = ready(mode, { speed, level });
  const moves: number[] = [];
  let last = ball(game);
  for (let t = 1; t <= 200 && moves.length < 2; t++) {
    game.step(NEUTRAL_BRICK_INPUT);
    const now = ball(game);
    if (now.x !== last.x || now.y !== last.y) moves.push(t);
    last = now;
  }
  return (moves[1] ?? 0) - (moves[0] ?? 0);
}

/** Период сдвига стены, такты: сдвиг в первом такте игры и далее через равные промежутки. */
function measureShiftPeriod(): number {
  const game = make(4);
  game.start();
  const at: number[] = [];
  let last = rows(game)[0];
  for (let t = 1; t <= 60 && at.length < 2; t++) {
    game.step(NEUTRAL_BRICK_INPUT);
    const now = rows(game)[0];
    if (now !== last) at.push(t);
    last = now;
  }
  expect(at[0]).toBe(1);
  return (at[1] ?? 0) - (at[0] ?? 0);
}

/** Через сколько тактов зажатая платформа делает следующий шаг (вариант `mode`). */
function measurePlatformRepeat(mode: number): number {
  const game = make(mode);
  game.start();
  const at: number[] = [];
  let last = game['curX'];
  for (let t = 0; t < 10 && at.length < 2; t++) {
    game.step(makeBrickInput(t === 0 ? ['right'] : [], ['right']));
    if (game['curX'] !== last) at.push(t);
    last = game['curX'];
  }
  return (at[1] ?? 0) - (at[0] ?? 0);
}

/** Через сколько тактов зажатая кнопка «удара» делает следующий лишний шаг мяча. */
function measureKickPeriod(): number {
  const game = ready(0, { speed: 1 });
  game.step(NEUTRAL_BRICK_INPUT); // автоматический шаг -> (5,2)
  game.step(makeBrickInput(['rotate'], ['rotate'])); // первый удар сразу: (6,3)
  const at: number[] = [];
  let last = game['ballY'];
  for (let t = 1; t <= 9; t++) {
    game.step(makeBrickInput([], ['rotate']));
    if (game['ballY'] !== last) at.push(t);
    last = game['ballY'];
  }
  expect(at.slice(0, 2).length).toBe(2);
  return (at[1] ?? 0) - (at[0] ?? 0);
}

/** Все тексты описания с путями — для общих проверок. */
function allTexts(guide: GameGuideData): { path: string; text: GuideText }[] {
  const out: { path: string; text: GuideText }[] = [];
  const add = (path: string, text: GuideText | null): void => {
    if (text) out.push({ path, text });
  };
  add('summary', guide.summary);
  add('goal', guide.goal);
  add('progression', guide.progression);
  add('lives', guide.lives);
  guide.rules.forEach((text, i) => add(`rules[${i}]`, text));
  guide.controls.forEach((control, i) => add(`controls[${i}]`, control.text));
  guide.scoring.forEach((score, i) => add(`scoring[${i}]`, score.what));
  guide.facts.forEach((fact, i) => add(`facts[${i}]`, fact.label));
  guide.schemes.forEach((scheme, i) => add(`schemes[${i}]`, scheme.caption));
  guide.assumptions.forEach((text, i) => add(`assumptions[${i}]`, text));
  return out;
}

/** Правило по ключевой фразе (русский текст). */
function ruleWith(phrase: string): GuideText {
  const found = ARKANOID_GUIDE.rules.find((rule) => rule.ru.includes(phrase));
  if (!found) throw new Error(`в описании нет правила «${phrase}»`);
  return found;
}

/** Число (или запись) есть в обоих языках: русской и английской записью (запятая / точка). */
function expectNumber(text: GuideText, ru: string, en = ru.replace(',', '.')): void {
  expect(text.ru, `ru: ${text.ru}`).toContain(ru);
  expect(text.en, `en: ${text.en}`).toContain(en);
}

const formatSeconds = (ticks: number): string => String(ticks / BRICK_TICK_HZ);

// ---------------------------------------------------------------- описание в целом

describe('арканоид: описание годится', () => {
  it('guideProblems пуст', () => {
    expect(guideProblems(ARKANOID_GUIDE)).toEqual([]);
  });

  it('нет заглушек; русский текст — по-русски, английский — без русских букв', () => {
    for (const { path, text } of allTexts(ARKANOID_GUIDE)) {
      expect(text.ru, path).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(text.en, path).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(text.ru, path).toMatch(/[А-Яа-яЁё]/);
      expect(text.en, path).not.toMatch(/[А-Яа-яЁё]/);
      expect(text.en, path).not.toBe(text.ru);
    }
  });

  it('описаны только кнопки, которые игра слушает: влево, вправо и «удар» (вверх и вниз ничего не делают)', () => {
    expect(ARKANOID_GUIDE.controls.map((control) => control.button)).toEqual(['left', 'right', 'rotate']);
    const a = ready(0);
    const b = ready(0);
    for (let i = 0; i < 40; i++) {
      a.step(makeBrickInput(['up', 'down'], ['up', 'down']));
      b.step(NEUTRAL_BRICK_INPUT);
    }
    expect(rows(a)).toEqual(rows(b));
  });
});

// ---------------------------------------------------------------- facts

describe('арканоид: числа из facts подтверждены игрой', () => {
  it('жизни в начале партии', () => {
    const game = make();
    expect(game.lives).toBe(4);
    expect(ARKANOID_GUIDE.facts[0]?.value).toBe(String(game.lives));
    expect(ARKANOID_GUIDE.lives?.ru).toContain(`${game.lives} жизни`);
    expect(ARKANOID_GUIDE.lives?.en).toContain(`${game.lives} lives`);
  });

  it('очков до добавочной жизни: жизнь появляется ровно на 1000-м очке, а не раньше', () => {
    const game = still(0);
    game['setLives'](3);
    let threshold = 0;
    for (let score = 1; score <= 5000 && threshold === 0; score++) {
      game['addScore'](1);
      if (game.lives === 4) threshold = game.score;
    }
    expect(threshold).toBe(1000);
    expect(ARKANOID_GUIDE.facts[1]?.value).toBe(String(threshold));

    // то же настоящим кирпичом: 999 очков — жизни нет, кирпич — 1000-е очко, жизнь и звук `bonus`
    const real = still(0);
    real['setLives'](3);
    real['addScore'](threshold - 1);
    expect(real.lives).toBe(3);
    place(real, 5, 11, 1, 1);
    const events = ballStep(real);
    expect(real.score).toBe(threshold);
    expect(real.lives).toBe(4);
    expect(types(events)).toEqual(expect.arrayContaining(['hit', 'bonus']));
  });

  it('вариантов 32: все различимы, номер сверх 32 возвращает к первому', () => {
    expect(arkanoidDef.modes).toHaveLength(32);
    expect(arkanoidDef.declaredModes).toBe(32);
    expect(ARKANOID_MODES).toHaveLength(32);
    const look = (mode: number): string => {
      const game = make(mode);
      game.start();
      idle(game, 30);
      return rows(game).join('/');
    };
    expect(new Set(Array.from({ length: 32 }, (_, mode) => look(mode))).size).toBe(32);
    expect(look(32)).toBe(look(0));
    expect(ARKANOID_GUIDE.facts[2]?.value).toBe(String(arkanoidDef.modes.length));
    expectNumber(ARKANOID_GUIDE.summary, String(arkanoidDef.modes.length));
  });

  it('платформа: 4, 3, 2 и 1 клетка', () => {
    const lit = (mode: number): number => (rows(make(mode))[BRICK_ROWS - 1] ?? '').split('#').length - 1;
    expect([0, 1, 2, 3].map(lit)).toEqual([4, 3, 2, 1]);
    // в 32 вариантах встречаются все четыре размера и больше никаких
    expect(new Set(Array.from({ length: 32 }, (_, mode) => lit(mode)))).toEqual(new Set([1, 2, 3, 4]));
    expect(ARKANOID_GUIDE.summary.ru).toContain('1–4 клетки');
    expect(ARKANOID_GUIDE.summary.en).toContain('1–4 cells');
  });

  it('кирпичей в готовых стенах — от 45 до 68; стен десять, по одной на уровень', () => {
    const counts: number[] = [];
    const seen = new Set<string>();
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const game = make(0, { level });
      counts.push(game['wall'].remaining);
      seen.add(rows(game).slice(0, game['wall'].height).join('/'));
      expect(rows(game).slice(0, game['wall'].height), `уровень ${level}`).toEqual(PRELOADED_WALLS[level - 1]);
    }
    expect(seen.size).toBe(10);
    const range = `${Math.min(...counts)}–${Math.max(...counts)}`;
    expect(range).toBe('45–68');
    expect(ARKANOID_GUIDE.facts[3]?.value).toBe(range);
    const walls = ruleWith('Стена:');
    expectNumber(walls, '10 стен', '10 walls');
    expectNumber(walls, '45–68');
  });
});

// ---------------------------------------------------------------- очки

describe('арканоид: очки', () => {
  it('выбитый кирпич — одно очко, и других очков нет', () => {
    const game = still(0);
    place(game, 5, 11, 1, 1);
    const events = ballStep(game);
    expect(types(events)).toEqual(['hit']);
    expect(game.score).toBe(1);
    expect(ARKANOID_GUIDE.scoring[0]?.points).toBe(`+${game.score}`);
    // отскок от боковой стены поля и от платформы очков не даёт
    const flying = ready(0);
    expect(types(idle(flying, 120))).toContain('rotate'); // мяч долетел до боковой стены и отскочил
    expect(flying.score).toBe(0);
    const bounce = still(0);
    place(bounce, 5, 1, 1, -1);
    expect(types(ballStep(bounce))).toEqual(['rotate']); // отскок от платформы 3..6
    expect(bounce.score).toBe(0);
  });

  it('добавочная жизнь за каждые 1000 очков; при полных четырёх жизнях вместо неё +100 очков', () => {
    const points = ARKANOID_GUIDE.scoring.map((score) => score.points);
    expect(points).toEqual(['+1', '+1 жизнь', '+100']);

    const game = still(0);
    game['setLives'](2);
    game['addScore'](1000);
    expect(game.lives).toBe(3);
    expect(game.score).toBe(1000);
    game['addScore'](1000); // 2000: ещё одна
    expect(game.lives).toBe(4);
    expect(game.score).toBe(2000);
    game['addScore'](1000); // 3000: жизни полны — бонус к счёту
    expect(game.lives).toBe(4);
    expect(game.score).toBe(3000 + 100);
    expect(ARKANOID_GUIDE.lives?.ru).toContain('+100 очков');
    expect(ARKANOID_GUIDE.lives?.en).toContain('+100 points');
  });
});

// ---------------------------------------------------------------- progression

describe('арканоид: скорость, уровни, победа', () => {
  it('шаг мяча: 400 мс на скорости 1 и 80 мс на скорости 10 (платформа 2 клетки); у 4 клеток ×0,6, у 1 клетки ×1,2', () => {
    // платформа из 2 клеток — множитель 1,0 (режим 3 в нумерации с нуля — индекс 2)
    expect(measureBallPeriod(2, 1)).toBe(msToTicks(400));
    expect(measureBallPeriod(2, 10)).toBe(msToTicks(80));
    // 4 клетки — быстрее (×0,6), 1 клетка — медленнее (×1,2), при любой скорости
    for (const speed of [1, 10]) {
      const base = measureBallPeriod(2, speed);
      expect(measureBallPeriod(0, speed), `4 клетки, скорость ${speed}`).toBe(Math.round(base * 0.6));
      expect(measureBallPeriod(3, speed), `1 клетка, скорость ${speed}`).toBe(Math.round(base * 1.2));
    }
    const text = ARKANOID_GUIDE.progression;
    expectNumber(text, '400 мс', '400 ms');
    expectNumber(text, '80 мс', '80 ms');
    expectNumber(text, '×0,6', '×0.6');
    expectNumber(text, '×1,2', '×1.2');
  });

  it('скорость растёт только после десятого уровня; уровень выбирает стену, но не темп мяча', () => {
    expect(measureBallPeriod(0, 4, 1)).toBe(measureBallPeriod(0, 4, 7));
    // победа на 1-м уровне: уровень 2, скорость прежняя, стена второго уровня
    const game = still(0, { speed: 3 });
    keepBricks(game, [[3, 0]]);
    place(game, 2, 11, 1, 1);
    expect(types(ballStep(game))).toEqual(['hit', 'win']);
    finishScenes(game);
    expect(game.level).toBe(2);
    expect(game.speed).toBe(3);
    expect(rows(game).slice(0, 7)).toEqual(PRELOADED_WALLS[1]);
    // победа на десятом: снова первый уровень, скорость + 1
    const last = still(0, { speed: 4, level: MAX_LEVEL });
    keepBricks(last, [[4, 0]]);
    place(last, 3, 11, 1, 1);
    ballStep(last);
    finishScenes(last);
    expect(last.level).toBe(1);
    expect(last.speed).toBe(5);
    expect(rows(last).slice(0, 8)).toEqual(PRELOADED_WALLS[0]);
    expectNumber(ARKANOID_GUIDE.progression, `после ${MAX_LEVEL}-го`, `after level ${MAX_LEVEL}`);
  });

  it('победа наступает, когда выбит последний кирпич, и не раньше', () => {
    const game = still(0);
    keepBricks(game, [[3, 0], [6, 0]]); // нижний ряд стены: колонки 3 и 6
    expect(game['wall'].remaining).toBe(2);
    place(game, 2, 11, 1, 1); // вершиной в (3,12)
    expect(types(ballStep(game))).toEqual(['hit']); // победы нет: остался один кирпич
    expect(game['wall'].remaining).toBe(1);
    expect(game['busy']).toBe(false);
    place(game, 7, 11, -1, 1); // вершиной в (6,12)
    expect(types(ballStep(game))).toEqual(['hit', 'win']);
    expect(game['wall'].remaining).toBe(0);
    expect(game['busy']).toBe(true);
    expect(types(finishScenes(game))).toEqual(['levelUp']);
    expect(game.level).toBe(2);
  });
});

// ---------------------------------------------------------------- жизни

describe('арканоид: жизни', () => {
  it('потеря мяча: минус жизнь, выбитые кирпичи не возвращаются, счёт остаётся, уровень тот же', () => {
    const game = still(0);
    place(game, 5, 11, 1, 1);
    ballStep(game); // кирпич выбит: 1 очко
    const remaining = game['wall'].remaining;
    expect(remaining).toBe(47);
    loseBall(game);
    expect(game.lives).toBe(3);
    expect(game.score).toBe(1);
    expect(game.level).toBe(1);
    expect(game['wall'].remaining).toBe(remaining);
    expect(rows(game)[7]).toBe('...##.#...'); // дыра на месте выбитого кирпича
    expect(game.phase).toBe('playing');
  });

  it('жизни кончились — конец игры', () => {
    const game = still(0);
    game['setLives'](1);
    loseBall(game);
    expect(game.lives).toBe(0);
    expect(game.phase).toBe('over');
  });

  it('вступление: мяч стоит на платформе 1,5 с и едет с ней, потом летит вверх-вправо', () => {
    const ticks = measureIntroTicks();
    expect(formatSeconds(ticks)).toBe(String(INTRO_SECONDS));
    expectNumber(ruleWith('Перед каждым стартом'), formatSeconds(ticks).replace('.', ','), formatSeconds(ticks));
    const game = make(0);
    game.start();
    for (let t = 0; t < 8; t++) game.step(makeBrickInput(t === 0 ? ['left'] : [], ['left']));
    expect(game['ballX']).toBe(game['curX']); // едет с платформой
    expect(game['ballY']).toBe(1);
    // после потери мяча вступление повторяется
    const lost = still(0);
    loseBall(lost);
    expect(lost['introLeft']).toBe(ticks);
    // первый шаг — вверх и вправо
    const start = ready(0);
    start.step(NEUTRAL_BRICK_INPUT);
    expect(ball(start)).toEqual({ x: 5, y: 2, dx: 1, dy: 1 });
  });
});

// ---------------------------------------------------------------- правила и кнопки

describe('арканоид: правила и кнопки, как в описании', () => {
  it('мяч всегда летит под 45°, платформа разворачивает его вверх независимо от места удара, у края — по той же диагонали', () => {
    for (const x of [3, 4, 5, 6]) {
      for (const dx of [-1, 1]) {
        const game = still(0); // платформа 3..6
        place(game, x, 1, dx, -1);
        ballStep(game);
        expect(ball(game), `x = ${x}, dx = ${dx}`).toEqual({ x, y: 1, dx, dy: 1 });
      }
    }
    const edge = still(0);
    place(edge, 7, 1, -1, -1); // вершиной в последнюю клетку платформы (6,0)
    ballStep(edge);
    expect(ball(edge)).toEqual({ x: 7, y: 1, dx: 1, dy: 1 });
  });

  it('мяч, лежащий на платформе, едет вместе с ней (так им управляют); выше первого ряда или за краем платформы — не едет', () => {
    expect(ruleWith('лежащий на платформе').ru).toContain('едет вместе с ней');
    const game = still(0); // платформа 3..6
    place(game, 5, 2, 1, -1);
    ballStep(game); // (6,1): над платформой
    ballStep(game); // отскок: мяч стоит на месте
    expect(ball(game)).toEqual({ x: 6, y: 1, dx: 1, dy: 1 });
    game.step(tap('left'));
    expect(game['curX']).toBe(3);
    expect(ball(game).x).toBe(5); // поехал вместе с платформой
    place(game, 5, 2, 1, 1); // на второй строке мяч платформе не принадлежит
    game.step(tap('left'));
    expect(game['curX']).toBe(2);
    expect(ball(game).x).toBe(5);
  });

  it('боковые стены и верх отражают мяч; в двухсторонних вариантах верх не отражает', () => {
    const side = still(0);
    place(side, 9, 5, 1, 1);
    ballStep(side);
    expect(ball(side)).toEqual({ x: 8, y: 6, dx: -1, dy: 1 });
    const top = still(0);
    keepBricks(top, [[1, 7]]); // один кирпич в левом верхнем углу, далеко от мяча
    place(top, 3, 19, 1, 1);
    ballStep(top);
    expect(ball(top)).toEqual({ x: 4, y: 18, dx: 1, dy: -1 });
    const double = still(8);
    place(double, 9, 19, 1, 1); // верхний ряд вне платформы
    ballStep(double);
    expect(double['busy']).toBe(true);
    finishScenes(double);
    expect(double.lives).toBe(3);
  });

  it('кирпич разбивается гранью, углом, а в проёме между кирпичами — сразу два', () => {
    const edge = still(0);
    place(edge, 5, 11, 1, 1); // снизу
    expect(types(ballStep(edge))).toEqual(['hit']);
    const corner = still(0);
    place(corner, 2, 11, 1, 1); // углом
    expect(types(ballStep(corner))).toEqual(['hit']);
    expect(ball(corner)).toEqual({ x: 2, y: 11, dx: -1, dy: -1 });
    const gap = still(0);
    place(gap, 3, 15, 1, 1); // экранный ряд 4: '###.##.###' — в проёме
    expect(types(ballStep(gap))).toEqual(['hit', 'hit']);
    expect(gap.score).toBe(2);
  });

  it('«удар» (ROTATE и «огонь»): лишний шаг мяча сразу, зажатая кнопка повторяет через 4 такта = 15 раз в секунду; до конца вступления не работает', () => {
    const period = measureKickPeriod();
    expect(period).toBe(4);
    expect(BRICK_TICK_HZ / period).toBe(15);
    const text = ARKANOID_GUIDE.controls.find((control) => control.button === 'rotate')?.text;
    expect(text).toBeDefined();
    if (text) expectNumber(text, '15 раз', '15 times');
    for (const action of ['rotate', 'fire'] as const) {
      const game = ready(0, { speed: 1 });
      game.step(NEUTRAL_BRICK_INPUT);
      game.step(makeBrickInput([action], [action]));
      expect(ball(game), action).toEqual({ x: 6, y: 3, dx: 1, dy: 1 });
    }
    const early = make(0);
    early.start();
    for (let t = 0; t < 40; t++) early.step(makeBrickInput(t === 0 ? ['rotate'] : [], ['rotate']));
    expect(ball(early)).toEqual({ x: 4, y: 1, dx: 1, dy: 1 });
  });

  it('платформа: на клетку по нажатию, зажатая едет; чем меньше платформа, тем медленнее', () => {
    const repeat = [0, 1, 2, 3].map(measurePlatformRepeat);
    expect(repeat).toEqual([2, 2, 3, 3]);
    expect(repeat[0]).toBeLessThan(repeat[3] ?? 0);
    const game = make(0);
    game.start();
    game.step(tap('left'));
    expect(game['curX']).toBe(3);
    game.step(tap('right'));
    expect(game['curX']).toBe(4);
  });

  it('случайные стены: зеркальны слева направо, высота от 5 до 10 рядов', () => {
    const heights = new Set<number>();
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (const seed of [1, 2, 3]) {
        const game = make(16, { level, seed });
        const height: number = game['wall'].height;
        heights.add(height);
        for (const line of rows(game).slice(0, height)) expect(line).toBe([...line].reverse().join(''));
      }
    }
    const range = `${Math.min(...heights)}–${Math.max(...heights)}`;
    expect(range).toBe('5–10');
    expectNumber(ruleWith('Стена:'), `${range} рядов`, `${range} rows`);
  });

  it('«стена едет»: раз в 0,4 с на клетку вправо по кругу; в остальных вариантах стоит', () => {
    const period = measureShiftPeriod();
    expect(period).toBe(24);
    expectNumber(ruleWith('«Стена едет»'), `${formatSeconds(period).replace('.', ',')} с`, `${formatSeconds(period)} s`);
    const game = make(4, { level: 7 }); // верхний ряд '#..#..#..#'
    game.start();
    game.step(NEUTRAL_BRICK_INPUT);
    expect(rows(game)[0]).toBe('##..#..#..'); // сдвиг на клетку вправо, ушедший за край кирпич вернулся слева
    expect(game['wall'].remaining).toBe(60);
    const fixed = make(0);
    fixed.start();
    idle(fixed, 120);
    expect(rows(fixed).slice(0, 3)).toEqual(['.#.#..#.#.', '..#....#..', '.###..###.']);
  });

  it('«две платформы»: внизу и вверху, едут вместе; шаг мяча дольше на 30 мс (2 такта); стена по центру', () => {
    const game = make(8);
    game.start();
    game.step(tap('left'));
    const field = rows(game);
    expect(field[0]).toBe('..####....');
    expect(field[BRICK_ROWS - 1]).toBe('..####....');
    expect(field.slice(6, 14)).toEqual(PRELOADED_WALLS[0]);
    for (const mode of [0, 1, 2, 3]) {
      for (const speed of [1, 10]) {
        expect(measureBallPeriod(8 + mode, speed) - measureBallPeriod(mode, speed)).toBe(msToTicks(30));
      }
    }
    expectNumber(ruleWith('«Две платформы»'), '30 мс', '30 ms');
  });
});

// ---------------------------------------------------------------- схемы

describe('арканоид: схемы — это то, что игра рисует', () => {
  it('схема 1 — целое поле варианта 01 в начале уровня 1', () => {
    expect(ARKANOID_GUIDE.schemes[0]?.cells).toEqual(rows(make(0)));
  });

  it('схема 2 — нижние ряды стены и мяч сразу после удара снизу (строки 5–8 экрана)', () => {
    const game = still(0);
    place(game, 5, 11, 1, 1);
    ballStep(game);
    expect(ARKANOID_GUIDE.schemes[1]?.cells).toEqual(rows(game).slice(5, 9));
  });

  it('схема 3 — целое поле двухстороннего варианта 09 в начале уровня 1', () => {
    expect(ARKANOID_GUIDE.schemes[2]?.cells).toEqual(rows(make(8)));
  });

  it('мигающих клеток в игре нет, поэтому в схемах только `#` и `.`', () => {
    for (const mode of [0, 5, 8, 13, 17, 31]) {
      const game = make(mode, { speed: 10 });
      game.start();
      let brightest = 0;
      for (let t = 0; t < 600; t++) {
        game.step(makeBrickInput(t % 50 === 0 ? ['left'] : [], t % 50 < 25 ? ['left'] : ['right']));
        brightest = Math.max(brightest, ...game.cells());
      }
      expect(brightest, `вариант ${mode + 1}`).toBe(1);
    }
    for (const scheme of ARKANOID_GUIDE.schemes) {
      for (const line of scheme.cells) expect(line).toMatch(/^[#.]+$/);
    }
  });
});
