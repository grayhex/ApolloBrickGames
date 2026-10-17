import { SCENARIO_GROUPS, scenarioSuite } from '../scenarioCoverage';
/**
 * Сценарные тесты правил аркадных игр библиотеки Brick Game: змейка, птица, корзина, копатель, вертолёт-бомбардировщик и боулинг.
 * Общие проверки (conformance) и случайный ввод играбельности не доказывают: здесь игра проходится настоящими тактами `step(makeBrickInput(...))`
 * до конкретного исхода — «прогресс» (очки, победа, следующий уровень) и «неудача» (потеря жизни, конец партии).
 * Ожидаемые числа выписаны по правилам игры (справка `guides/library.ts`, геометрия поля), а не взяты из констант реализации;
 * состояние готовится прямым присваиванием полям игры (как в `review.test.ts`), но сам исход всегда наступает от тактов.
 */
import { describe, expect, it } from 'vitest';
import { BowlingGame } from '../../../src/brick/games/library/action';
import { BasketGame, BomberGame, DiggerGame, FlappyGame, SnakeGame } from '../../../src/brick/games/library/arcade';
import { LIBRARY_GAMES } from '../../../src/brick/games/library';
import { GAME_OVER_TICKS, NEUTRAL_BRICK_INPUT, makeBrickInput, type BrickAction, type BrickEvent, type BrickGame, type BrickInput } from '../../../src/brick';

const coveredScenario = scenarioSuite('scenarios.arcade');

/** Игры, для которых в этом файле есть и сценарий «прогресс», и сценарий «неудача или завершение». */
const SCENARIO_GAMES = SCENARIO_GROUPS['scenarios.arcade'];

// ── помощники ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const has = (events: readonly BrickEvent[], type: BrickEvent['type']): boolean => events.some((e) => e.type === type);
const count = (events: readonly BrickEvent[], type: BrickEvent['type']): number => events.filter((e) => e.type === type).length;
const run = (g: BrickGame, n: number): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
  return events;
};
/** Нажатие и отпускание одной кнопки: два такта (фронт и тишина), чтобы автоповтор не сработал. */
const tap = (g: BrickGame, action: BrickAction): BrickEvent[] => [...g.step(makeBrickInput([action])), ...g.step(NEUTRAL_BRICK_INPUT)];

interface Played {
  events: BrickEvent[];
  ticks: number;
  reached: boolean;
}
/** Играть, пока не выполнится `stop` (ему передаются события последнего такта), но не дольше `limit` тактов. `input` задаёт ввод каждого такта. */
function playUntil(g: BrickGame, stop: (last: BrickEvent[]) => boolean, limit: number, input: (tick: number) => BrickInput = () => NEUTRAL_BRICK_INPUT): Played {
  const events: BrickEvent[] = [];
  let last: BrickEvent[] = [];
  let ticks = 0;
  while (!stop(last) && ticks < limit) {
    last = g.step(input(ticks));
    events.push(...last);
    ticks++;
  }
  return { events, ticks, reached: stop(last) };
}

/** Конец партии: событие gameOver уже было, дальше идёт анимация заливки поля тактами, затем фаза `over`; рекорд сохраняется, новый старт начинает партию с нуля. */
function expectOverThenRestart(g: BrickGame, bestScore: number): void {
  expect(g.phase).toBe('playing');
  const finished = playUntil(g, () => g.phase === 'over', GAME_OVER_TICKS + 10);
  expect(finished.reached).toBe(true);
  expect(g.overFill).toBe(20); // залиты все двадцать рядов
  expect(g.step(makeBrickInput(['rotate', 'left']))).toEqual([]); // после конца партии ввод ничего не делает
  expect(g.hiScore).toBe(bestScore);
  expect(g.start()).toContainEqual({ type: 'started' });
  expect(g.phase).toBe('playing');
  expect(g.score).toBe(0);
  expect(g.hiScore).toBe(bestScore);
}

describe('сценарии: аркадные игры присутствуют в каталоге', () => {
  it('идентификаторы сценариев совпадают с идентификаторами игр каталога', () => {
    expect(new Set(SCENARIO_GAMES).size).toBe(SCENARIO_GAMES.length);
    for (const id of SCENARIO_GAMES) {
      expect(LIBRARY_GAMES[id].id).toBe(id);
      expect(LIBRARY_GAMES[id].create({ seed: 1 }).id).toBe(id);
    }
  });
});

// ── snake ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('snake: сценарии правил', () => {
  /** Ход змейки: нажатие в первом такте (если задано), далее тишина — до сдвига головы или потери жизни (не дольше 60 тактов). */
  const move = (g: SnakeGame, press: BrickAction[] = [], held: BrickAction[] = []): { events: BrickEvent[]; ticks: number } => {
    const head = g.body[0];
    const lives = g.lives;
    const events = [...g.step(makeBrickInput(press, held))];
    let ticks = 1;
    while (g.body[0] === head && g.lives === lives && ticks < 60) {
      events.push(...g.step(makeBrickInput([], held)));
      ticks++;
    }
    return { events, ticks };
  };
  /** Новая партия; плод убран в левый верхний угол, чтобы он не мешал сценарию. Змейка: голова в клетке 104 (колонка 4, строка 10), хвост 102, курс — вправо. */
  const fresh = (options: { level?: number } = {}): SnakeGame => {
    const g = new SnakeGame({ seed: 1, ...options });
    g.start();
    g.food = 0;
    return g;
  };

  it('начало: змейка из трёх клеток движется вправо, голова мигает, тело горит', () => {
    const g = fresh();
    expect(g.body).toEqual([104, 103, 102]);
    expect(g.lives).toBe(4);
    const plain = move(g);
    expect(g.body).toEqual([105, 104, 103]); // сдвиг на клетку: длина прежняя
    expect(g.score).toBe(0);
    expect(has(plain.events, 'bonus')).toBe(false);
    const cells = g.cells();
    expect([cells[105], cells[104], cells[103], cells[102]]).toEqual([2, 1, 1, 0]);
  });

  it('плод: змейка вырастает на одну клетку, +10 очков и сигнал bonus; новый плод появляется на свободной клетке', () => {
    const g = fresh();
    g.food = 105;
    const ate = move(g);
    expect(g.body).toEqual([105, 104, 103, 102]);
    expect(g.score).toBe(10);
    expect(has(ate.events, 'bonus')).toBe(true);
    expect(g.food).not.toBe(105);
    expect(g.body).not.toContain(g.food);
    expect(g.cells()[g.food]).toBe(2); // плод мигает
    expect(g.lives).toBe(4);
    g.food = 106;
    move(g);
    expect(g.body).toEqual([106, 105, 104, 103, 102]);
    expect(g.score).toBe(20);
  });

  it('обратный разворот запрещён: «назад» игнорируется, в том числе после быстрой пары нажатий «вверх» и «влево»', () => {
    const g = fresh();
    g.step(makeBrickInput(['left'])); // курс — вправо, «влево» — разворот
    move(g);
    expect(g.body[0]).toBe(105);
    expect(g.lives).toBe(4);
    g.step(makeBrickInput(['up']));
    g.step(makeBrickInput(['left'])); // до хода: «влево» относительно движения вправо — всё ещё разворот, поэтому курс остаётся «вверх»
    move(g);
    expect(g.body[0]).toBe(95); // колонка 5, строка 9
    move(g, ['down']); // разворот относительно движения вверх
    expect(g.body[0]).toBe(85);
    move(g, ['left']); // поворот вбок разрешён
    expect(g.body[0]).toBe(84);
    expect(g.lives).toBe(4);
  });

  it('удержание ROTATE ускоряет змейку: ход наступает заметно раньше', () => {
    const slow = move(fresh());
    const fast = move(fresh(), [], ['rotate']);
    expect(fast.ticks).toBeLessThan(slow.ticks);
    expect(fast.ticks).toBeLessThanOrEqual(slow.ticks / 2);
  });

  coveredScenario('snake', 'прогресс', 'тринадцать плодов подряд: +10 за каждый, рост на клетку, после последнего +100 за уровень и новая карта с короткой змейкой', () => {
    const g = fresh();
    // Маршрут без самопересечений: три плода вправо по строке 10, четыре вверх по колонке 7, шесть влево по строке 6.
    const route: { turn?: BrickAction; cell: number }[] = [
      { cell: 105 }, { cell: 106 }, { cell: 107 },
      { turn: 'up', cell: 97 }, { cell: 87 }, { cell: 77 }, { cell: 67 },
      { turn: 'left', cell: 66 }, { cell: 65 }, { cell: 64 }, { cell: 63 }, { cell: 62 }, { cell: 61 },
    ];
    let events: BrickEvent[] = [];
    route.forEach((step, i) => {
      g.food = step.cell;
      events = move(g, step.turn ? [step.turn] : []).events;
      expect(g.body[0], `плод ${i + 1}`).toBe(step.cell);
      expect(g.body, `плод ${i + 1}`).toHaveLength(4 + i);
      expect(has(events, 'bonus'), `плод ${i + 1}`).toBe(true);
      expect(g.lives).toBe(4);
      if (i < 12) {
        expect(g.score, `плод ${i + 1}`).toBe(10 * (i + 1));
        expect(has(events, 'win'), `плод ${i + 1}`).toBe(false);
        expect(g.level).toBe(1);
      }
    });
    expect(has(events, 'win')).toBe(true);
    expect(g.score).toBe(13 * 10 + 100);
    expect(g.level).toBe(1); // переход — после сценки очистки поля
    // сценка без ввода: змейка стоит, нажатия ничего не меняют
    const head = g.body[0];
    for (let i = 0; i < 10; i++) g.step(makeBrickInput(['down']));
    expect(g.body[0]).toBe(head);
    const next = playUntil(g, () => g.level === 2, 120);
    expect(next.reached).toBe(true);
    expect(has(next.events, 'levelUp')).toBe(true);
    expect(g.body).toEqual([104, 103, 102]); // короткая змейка, курс вправо
    expect(g.score).toBe(230);
    expect(g.lives).toBe(4);
    expect(g.walls.size).toBeGreaterThan(0); // «новая карта»: со второго уровня на поле стенки
    expect(g.walls.has(g.food)).toBe(false);
    expect(g.body).not.toContain(g.food);
  });

  it('стенка поля: потеря жизни, партия повторяется с короткой змейкой, счёт и уровень остаются', () => {
    const g = fresh();
    g.food = 105;
    move(g); // один плод: счёт 10, длина 4, голова в колонке 5
    g.food = 0;
    for (const column of [6, 7, 8, 9]) {
      move(g);
      expect(g.body[0]).toBe(100 + column);
      expect(g.lives).toBe(4);
    }
    const crash = move(g); // следующая клетка — за правым краем
    expect(has(crash.events, 'lifeLost')).toBe(true);
    expect(has(crash.events, 'gameOver')).toBe(false);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
    expect(g.body[0]).toBe(109); // голова за край не вышла
    for (let i = 0; i < 20; i++) g.step(makeBrickInput(['up'])); // пока идёт сценка потери жизни, ввод не действует
    expect(g.body[0]).toBe(109);
    const again = playUntil(g, () => g.body.length === 3, 120);
    expect(again.reached).toBe(true);
    expect(g.body).toEqual([104, 103, 102]);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
    expect(g.level).toBe(1);
    expect(g.phase).toBe('playing');
  });

  it('верхний и нижний края поля — тоже стенки: вверх от строки 10 безопасны десять клеток, одиннадцатая — потеря жизни; вниз безопасны девять, десятая — потеря', () => {
    const fast = ['rotate' as const];
    const up = fresh();
    move(up, ['up'], fast); // (4;9)
    for (let row = 8; row >= 0; row--) {
      move(up, [], fast);
      expect(up.body[0], `строка ${row}`).toBe(row * 10 + 4);
    }
    expect(up.lives).toBe(4);
    expect(has(move(up, [], fast).events, 'lifeLost')).toBe(true); // за верхним краем
    expect(up.lives).toBe(3);
    const down = fresh();
    move(down, ['down'], fast); // (4;11)
    for (let row = 12; row <= 19; row++) {
      move(down, [], fast);
      expect(down.body[0], `строка ${row}`).toBe(row * 10 + 4);
    }
    expect(down.lives).toBe(4);
    expect(has(move(down, [], fast).events, 'lifeLost')).toBe(true); // за нижним краем
    expect(down.lives).toBe(3);
  });

  it('левый край поля — тоже стенка: змейка, свернув влево, доходит до колонки 0, а дальше теряет жизнь', () => {
    const g = fresh();
    move(g, ['up'], ['rotate']); // (4;9)
    move(g, ['left'], ['rotate']); // (3;9)
    for (const column of [2, 1, 0]) {
      move(g, [], ['rotate']);
      expect(g.body[0]).toBe(90 + column);
    }
    expect(g.lives).toBe(4);
    expect(has(move(g, [], ['rotate']).events, 'lifeLost')).toBe(true);
    expect(g.lives).toBe(3);
  });

  it('собственное тело: врезание в хвост стоит жизни', () => {
    const g = fresh();
    for (const cell of [105, 106, 107]) {
      g.food = cell;
      move(g);
    }
    g.food = 0;
    expect(g.body).toEqual([107, 106, 105, 104, 103, 102]);
    move(g, ['up']); // 97
    move(g, ['left']); // 96
    expect(g.lives).toBe(4);
    const crash = move(g, ['down']); // клетка 106 — тело змейки
    expect(has(crash.events, 'lifeLost')).toBe(true);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(30);
  });

  it('кончик хвоста в момент хода освобождает клетку: змейка может «гнаться за хвостом» по кольцу из четырёх клеток', () => {
    const g = fresh();
    g.body = [54, 64, 63, 53]; // квадрат 2 × 2, голова (4;5) идёт вверх, хвост (3;5) — рядом с головой слева
    g.directionNow = 0;
    g['queued'] = 0;
    move(g, ['left']);
    expect(g.lives).toBe(4);
    expect(g.body).toEqual([53, 54, 64, 63]);
  });

  it('стенка внутри карты (со второго уровня) убивает так же, как край поля', () => {
    const g = fresh({ level: 2 });
    expect([g.cells()[112], g.cells()[113], g.cells()[114]]).toEqual([1, 1, 0]); // стенка в колонках 2–3 строки 11, колонка 4 свободна
    move(g, ['down']); // (4;11)
    expect(g.body[0]).toBe(114);
    expect(g.lives).toBe(4);
    const crash = move(g, ['left']); // (3;11) — стенка
    expect(has(crash.events, 'lifeLost')).toBe(true);
    expect(g.lives).toBe(3);
  });

  coveredScenario('snake', 'неудача', 'четыре столкновения подряд: жизни 3, 2, 1, 0; на последнем — конец партии, рекорд сохраняется', () => {
    const g = fresh();
    g.food = 105;
    move(g); // счёт 10
    const fast = (): BrickInput => {
      g.food = 0; // плод держим в углу: он не на пути змейки
      return makeBrickInput([], ['rotate']);
    };
    for (let crash = 1; crash <= 4; crash++) {
      const before = g.lives;
      const played = playUntil(g, () => g.lives !== before, 400, fast);
      expect(played.reached, `столкновение ${crash}`).toBe(true);
      expect(g.lives, `столкновение ${crash}`).toBe(4 - crash);
      expect(has(played.events, 'lifeLost'), `столкновение ${crash}`).toBe(true);
      expect(has(played.events, 'gameOver'), `столкновение ${crash}`).toBe(crash === 4);
    }
    expect(g.score).toBe(10);
    expectOverThenRestart(g, 10);
    expect(g.lives).toBe(4);
  });
});

// ── flappy-bird ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('flappy-bird: сценарии правил', () => {
  /** «Автопилот»: взмах, когда птица ниже середины просвета ближайшей трубы (после взмаха она поднимается примерно на две с половиной клетки). */
  const pilot = (g: FlappyGame): BrickInput => {
    const next = g.pipes.find((p) => p.x >= 2);
    return g.bird > (next ? next.gap : 6) + 4.5 ? makeBrickInput(['rotate']) : NEUTRAL_BRICK_INPUT;
  };
  /** Ровный полёт на высоте около десятой строки, не глядя на трубы. */
  const cruise = (g: FlappyGame): BrickInput => (g.bird > 10.5 ? makeBrickInput(['rotate']) : NEUTRAL_BRICK_INPUT);

  it('управление: ROTATE, «вверх» и «огонь» подбрасывают птицу, без нажатия или с другими кнопками она падает; жизней у игры нет', () => {
    for (const key of ['rotate', 'up', 'fire'] as const) {
      const g = new FlappyGame({ seed: 1 });
      g.start();
      const before = g.bird;
      g.step(makeBrickInput([key]));
      expect(g.bird, key).toBeLessThan(before);
      expect(g.lives).toBeNull();
    }
    for (const key of [null, 'left', 'right', 'down'] as const) {
      const g = new FlappyGame({ seed: 1 });
      g.start();
      const before = g.bird;
      g.step(key ? makeBrickInput([key]) : NEUTRAL_BRICK_INPUT);
      expect(g.bird, String(key)).toBeGreaterThan(before);
    }
  });

  coveredScenario('flappy-bird', 'прогресс', 'проход трубы: +1 за каждую, начисляется, когда труба осталась позади птицы; три трубы подряд — счёт 3, партия идёт', () => {
    for (const seed of [1, 2, 3]) {
      const g = new FlappyGame({ seed });
      g.start();
      let passes = 0;
      for (let t = 0; t < 600 && passes < 3 && g.phase === 'playing'; t++) {
        const before = g.score;
        g.step(pilot(g));
        if (g.score !== before) {
          passes++;
          expect(g.score - before, `зерно ${seed}`).toBe(1);
          expect(g.pipes.some((p) => p.x === 1), `зерно ${seed}: труба должна быть уже позади птицы (колонка 2)`).toBe(true);
          expect(g.pipes.some((p) => p.x === 2), `зерно ${seed}: в колонке птицы трубы нет`).toBe(false);
        } else {
          // пока труба в колонке птицы или впереди, очков не прибавляется
          expect(g.score).toBe(passes);
        }
      }
      expect(g.phase, `зерно ${seed}`).toBe('playing');
      expect(g.score, `зерно ${seed}`).toBe(3);
      expect(g.tick, `зерно ${seed}: три трубы — сотни тактов, не тысячи`).toBeLessThan(500);
    }
  });

  it('просвет — шесть клеток: птица в любой из них проходит, на клетку выше или ниже — столкновение с трубой', () => {
    const drawn = new FlappyGame({ seed: 1 });
    drawn.start();
    drawn.pipes = [{ x: 2, gap: 8, passed: false }]; // просвет — строки 8–13, птица посередине просвета
    drawn.bird = 10.5;
    for (let y = 0; y < 20; y++) expect(drawn.cells()[y * 10 + 2] === 1, `рисунок трубы, строка ${y}`).toBe(y < 8 || y > 13);
    for (let y = 0; y < 20; y++) {
      const g = new FlappyGame({ seed: 1 });
      g.start();
      g.pipes = [{ x: 2, gap: 8, passed: false }];
      g.bird = y + 0.5;
      const events = g.step(NEUTRAL_BRICK_INPUT);
      expect(has(events, 'gameOver'), `строка ${y}`).toBe(y < 8 || y > 13);
    }
  });

  coveredScenario('flappy-bird', 'неудача', 'пол: без взмахов птица падает и разбивается — конец партии, счёт нуль', () => {
    const g = new FlappyGame({ seed: 1 });
    g.start();
    const fall = playUntil(g, (last) => has(last, 'gameOver'), 200);
    expect(fall.reached).toBe(true);
    expect(g.bird).toBeGreaterThanOrEqual(20); // вышла за нижний край, до первой трубы дело не дошло
    expect(g.pipes.every((p) => p.x > 2)).toBe(true);
    expect(g.score).toBe(0);
    expectOverThenRestart(g, 0);
    expect(g.bird).toBe(10);
  });

  it('потолок: непрерывные взмахи выносят птицу за верхний край — конец партии', () => {
    const g = new FlappyGame({ seed: 1 });
    g.start();
    const climb = playUntil(g, (last) => has(last, 'gameOver'), 200, () => makeBrickInput(['rotate']));
    expect(climb.reached).toBe(true);
    expect(g.bird).toBeLessThan(0);
    expect(g.pipes.every((p) => p.x > 2)).toBe(true);
    expectOverThenRestart(g, 0);
  });

  it('труба: ровный полёт на десятой строке упирается в трубу с просветом выше — конец партии (не пол и не потолок)', () => {
    const g = new FlappyGame({ seed: 1 });
    g.start();
    g.pipes = [{ x: 5, gap: 1, passed: false }]; // просвет — строки 1–6, птица летит на уровне 8–10
    const crash = playUntil(g, (last) => has(last, 'gameOver'), 300, () => cruise(g));
    expect(crash.reached).toBe(true);
    expect(g.pipes.some((p) => p.x === 2)).toBe(true); // столкновение именно в колонке птицы
    expect(Math.floor(g.bird)).toBeGreaterThanOrEqual(7);
    expect(Math.floor(g.bird)).toBeLessThan(20); // поле не покидала: ни пол, ни потолок ни при чём
    expect(g.score).toBe(0);
    expectOverThenRestart(g, 0);
  });

  it('пройденные трубы засчитаны, а столкновение после них заканчивает партию с рекордом, равным счёту', () => {
    const g = new FlappyGame({ seed: 1 });
    g.start();
    const flown = playUntil(g, () => g.score === 2, 500, () => pilot(g));
    expect(flown.reached).toBe(true);
    expect(g.phase).toBe('playing');
    // дальше пилот засыпает: птица падает
    const crash = playUntil(g, (last) => has(last, 'gameOver'), 300);
    expect(crash.reached).toBe(true);
    expect(g.score).toBe(2); // до третьей трубы дело не дошло
    expect(g.hiScore).toBe(2);
    expectOverThenRestart(g, 2);
  });
});

// ── basket ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('basket: сценарии правил', () => {
  const fresh = (options: { speed?: number } = {}): BasketGame => {
    const g = new BasketGame({ seed: 1, ...options });
    g.start();
    g.drops = []; // убрать случайно выбранные первые предметы: сценарий задаёт их сам
    return g;
  };
  /** Одиночный предмет в колонке `column` на предпоследней строке: следующий ход решает, поймала ли его корзина (корзина стоит в колонках 4–6). */
  const dropOne = (column: number, bad: boolean): BasketGame => {
    const g = fresh();
    g.drops = [{ x: column, y: 17, bad }];
    const resolved = playUntil(g, () => g.drops.every((d) => d.y !== 17), 100);
    expect(resolved.reached).toBe(true);
    return g;
  };

  it('корзина шириной три клетки: две стенки в строке 18 и дно в строке 19, на старте — колонки 4–6', () => {
    const g = fresh();
    const cells = g.cells();
    const row = (y: number): string => Array.from(cells.slice(y * 10, y * 10 + 10), (v) => (v ? '#' : '.')).join('');
    expect(row(19)).toBe('....###...');
    expect(row(18)).toBe('....#.#...');
  });

  it('плод в корзине: +10 очков, жизни целы; в колонках 4–6 поймано, рядом — пропущено', () => {
    for (let column = 0; column < 10; column++) {
      const g = dropOne(column, false);
      if (column >= 4 && column <= 6) {
        expect(g.score, `колонка ${column}`).toBe(10);
        expect(g.lives, `колонка ${column}`).toBe(4);
      } else {
        expect(g.score, `колонка ${column}`).toBe(0);
        expect(g.lives, `колонка ${column}`).toBe(3);
      }
    }
  });

  it('двойной блок: пойманный стоит жизни, пропущенный безвреден и очков не даёт', () => {
    for (let column = 0; column < 10; column++) {
      const g = dropOne(column, true);
      expect(g.score, `колонка ${column}`).toBe(0);
      expect(g.lives, `колонка ${column}`).toBe(column >= 4 && column <= 6 ? 3 : 4);
    }
  });

  it('управление корзиной: край поля останавливает её, а сдвинутой корзиной ловится дальний плод', () => {
    const g = fresh();
    for (let i = 0; i < 10; i++) tap(g, 'right');
    expect(Array.from(g.cells().slice(190, 200))).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1, 1]); // колонки 7–9
    for (let i = 0; i < 12; i++) tap(g, 'left');
    expect(Array.from(g.cells().slice(190, 200))).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0]); // колонки 0–2
    const far = fresh();
    far.drops = [{ x: 8, y: 17, bad: false }];
    for (let i = 0; i < 3; i++) tap(far, 'right'); // колонки 7–9
    run(far, 100);
    expect(far.score).toBe(10);
    expect(far.lives).toBe(4);
  });

  it('обход двойного блока: корзину уводят из-под него, и ни очков, ни потери жизни', () => {
    const g = fresh();
    g.drops = [{ x: 5, y: 17, bad: true }];
    for (let i = 0; i < 5; i++) tap(g, 'left'); // колонки 0–2
    run(g, 100);
    expect(g.lives).toBe(4);
    expect(g.score).toBe(0);
  });

  it('игрок по очереди ловит плод, обходит двойной блок и ловит второй плод: +20, жизни целы', () => {
    const g = fresh({ speed: 10 });
    g.drops = [{ x: 8, y: 13, bad: false }, { x: 1, y: 7, bad: true }, { x: 2, y: 1, bad: false }];
    // Простой игрок: следит за самым нижним предметом — плод ловит, от блока уходит на противоположный край.
    const player = (): BrickInput => {
      const lowest = [...g.drops].sort((a, b) => b.y - a.y)[0];
      if (!lowest) return NEUTRAL_BRICK_INPUT;
      const want = lowest.bad ? (lowest.x >= 5 ? 0 : 7) : Math.max(0, Math.min(7, lowest.x - 1));
      return want < g.x ? makeBrickInput(['left']) : want > g.x ? makeBrickInput(['right']) : NEUTRAL_BRICK_INPUT;
    };
    const played = playUntil(g, () => g.score >= 20, 400, player);
    expect(played.reached).toBe(true);
    expect(g.score).toBe(20);
    expect(g.lives).toBe(4);
    expect(has(played.events, 'lifeLost')).toBe(false);
  });

  coveredScenario('basket', 'прогресс', 'двадцать плодов подряд: +10 за каждый, после двадцатого +100 за уровень и переход на следующий уровень', () => {
    const g = fresh();
    // Двадцать плодов один за другим над корзиной (колонка 5): по одному приземляется на каждом ходу.
    g.drops = Array.from({ length: 20 }, (_, i) => ({ x: 5, y: 17 - i, bad: false }));
    let last: BrickEvent[] = [];
    for (let caught = 1; caught <= 20; caught++) {
      const played = playUntil(g, () => g.score >= 10 * caught, 100);
      expect(played.reached, `плод ${caught}`).toBe(true);
      last = played.events;
      expect(has(last, 'lifeLost'), `плод ${caught}`).toBe(false);
      if (caught < 20) {
        expect(g.score, `плод ${caught}`).toBe(10 * caught);
        expect(has(last, 'win'), `плод ${caught}`).toBe(false);
      }
    }
    expect(has(last, 'win')).toBe(true);
    expect(g.score).toBe(20 * 10 + 100);
    expect(g.lives).toBe(4);
    expect(g.level).toBe(1);
    const next = playUntil(g, () => g.level === 2, 120);
    expect(next.reached).toBe(true);
    expect(has(next.events, 'levelUp')).toBe(true);
    expect(g.drops).toEqual([]); // поле начато заново
    expect(g.x).toBe(4);
    expect(g.score).toBe(300);
    expect(g.phase).toBe('playing');
  });

  coveredScenario('basket', 'неудача', 'пропущенный плод: потеря жизни, сигнал lifeLost, поле начинается заново (корзина по центру, предметов нет), счёт и уровень остаются', () => {
    const g = fresh();
    g.drops = [{ x: 5, y: 17, bad: false }];
    tap(g, 'rotate'); // лишняя кнопка корзину не двигает
    const caught = playUntil(g, () => g.drops.every((d) => d.y !== 17), 100);
    expect(g.score).toBe(10);
    expect(has(caught.events, 'lifeLost')).toBe(false);
    g.drops = [{ x: 0, y: 17, bad: false }];
    const missed = playUntil(g, () => g.lives === 3, 100);
    expect(missed.reached).toBe(true);
    expect(has(missed.events, 'lifeLost')).toBe(true);
    expect(g.score).toBe(10);
    for (let i = 0; i < 12; i++) g.step(makeBrickInput(['left'])); // во время сценки ввод не действует
    expect(g.x).toBe(4);
    const again = playUntil(g, () => g.drops.length === 0, 120); // пропущенный плод лежал в списке, пока шла сценка
    expect(again.reached).toBe(true);
    expect(g.x).toBe(4);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
    expect(g.level).toBe(1);
  });

  it('поймать двойной блок: так же потеря жизни; на последней жизни — конец партии с рекордом', () => {
    const g = fresh();
    g.lives = 1;
    g.drops = [{ x: 4, y: 17, bad: true }]; // корзина стоит в колонках 4–6: блок попадает в неё
    const crash = playUntil(g, (last) => has(last, 'lifeLost'), 100);
    expect(crash.reached).toBe(true);
    expect(has(crash.events, 'gameOver')).toBe(true);
    expect(g.lives).toBe(0);
    expectOverThenRestart(g, 0);
    expect(g.lives).toBe(4);
  });
});

// ── digger ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('digger: сценарии правил', () => {
  /** Новая партия; игрок стоит внизу в колонке 4 (клетка 194, колонка 4, строка 19), смотрит вверх, у него четыре ракеты, монстров нет. */
  const fresh = (gems: number[] = [60]): DiggerGame => {
    const g = new DiggerGame({ seed: 1 });
    g.start();
    g.gems = new Set(gems);
    g.monsters = [];
    return g;
  };

  coveredScenario('digger', 'прогресс', 'копание: игрок прокладывает туннель, сокровище +10, последнее сокровище — победа с +100 и новое поле', () => {
    const g = fresh([184, 164]);
    expect(g.cells()[184]).toBe(2); // сокровище мигает
    expect(g.cells()[174]).toBe(1); // нетронутая земля горит
    tap(g, 'up'); // клетка 184 — сокровище
    expect(g.score).toBe(10);
    expect(g.gems.has(184)).toBe(false);
    const middle = tap(g, 'up'); // клетка 174 — пустая земля
    expect(g.score).toBe(10);
    expect(has(middle, 'win')).toBe(false);
    expect(g.cells()[184]).toBe(0); // за игроком остался туннель
    expect(g.cells()[154]).toBe(1); // впереди земля
    const last = tap(g, 'up'); // клетка 164 — последнее сокровище
    expect(has(last, 'win')).toBe(true);
    expect(g.score).toBe(10 + 10 + 100);
    expect(g.level).toBe(1);
    expect(g.lives).toBe(4);
    const next = playUntil(g, () => g.level === 2, 120);
    expect(next.reached).toBe(true);
    expect(has(next.events, 'levelUp')).toBe(true);
    expect(g.cells()[184]).toBe(1); // земля снова целая
    expect(g.gems.size).toBeGreaterThan(0);
    expect(g.score).toBe(120);
  });

  it('копание в стороны: земля убирается там, где прошёл игрок, очков за пустую землю нет; у края поля игрок стоит на месте', () => {
    const g = fresh([184]);
    tap(g, 'left');
    tap(g, 'left'); // клетка 192
    expect(g.cells()[193]).toBe(0); // позади туннель
    expect(g.cells()[191]).toBe(1); // впереди земля
    expect(g.score).toBe(0);
    expect(g.gems.size).toBe(1);
    tap(g, 'down'); // нижний край поля
    expect(g.player).toBe(192);
    for (let i = 0; i < 4; i++) tap(g, 'left');
    expect(g.player).toBe(190); // левый край поля
    expect(g.lives).toBe(4);
  });

  it('ракета: убивает монстра в направлении взгляда (+25, сигнал shot), а в другую сторону улетает впустую', () => {
    const g = fresh();
    g.monsters = [134]; // в колонке игрока выше
    const sidestep = tap(g, 'right'); // игрок смотрит вправо и стоит в клетке 195
    expect(has(sidestep, 'shot')).toBe(false);
    const wasted = tap(g, 'rotate'); // вправо монстра нет
    expect(has(wasted, 'shot')).toBe(true);
    expect(g.monsters).toEqual([134]);
    expect(g.score).toBe(0);
    expect(g.missiles).toBe(3);
    tap(g, 'left'); // обратно в колонку 4, взгляд влево
    tap(g, 'up'); // клетка 184, взгляд вверх
    const hit = tap(g, 'rotate');
    expect(has(hit, 'shot')).toBe(true);
    expect(g.monsters).toEqual([]);
    expect(g.score).toBe(25);
    expect(g.missiles).toBe(2);
  });

  it('ракета летит туда, куда смотрит игрок: вверх, вправо, вниз, влево — и бьёт только монстра на этой линии', () => {
    // Игрок из середины поля (5;5) делает шаг в сторону; на трёх клетках от новой позиции по всем четырём лучам стоят монстры.
    const cases = [
      { key: 'up' as const, at: 45, victim: 15 },
      { key: 'right' as const, at: 56, victim: 59 },
      { key: 'down' as const, at: 65, victim: 95 },
      { key: 'left' as const, at: 54, victim: 51 },
    ];
    for (const c of cases) {
      const g = fresh();
      g.player = 55;
      const crowd = [c.at - 30, c.at + 3, c.at + 30, c.at - 3]; // сверху, справа, снизу, слева
      g.monsters = [...crowd];
      tap(g, c.key);
      expect(g.player, c.key).toBe(c.at);
      expect(has(tap(g, 'rotate'), 'shot'), c.key).toBe(true);
      expect(g.score, c.key).toBe(25);
      expect(g.monsters, c.key).toEqual(crowd.filter((m) => m !== c.victim));
    }
  });

  it('ракета бьёт ближнего из двух монстров в колонке и пролетает сквозь землю; кнопка «огонь» делает то же, что ROTATE', () => {
    const g = fresh();
    g.monsters = [134, 104]; // в колонке игрока: ближний и дальний
    tap(g, 'fire');
    expect(g.monsters).toEqual([104]);
    expect(g.score).toBe(25);
    tap(g, 'fire');
    expect(g.monsters).toEqual([]);
    expect(g.score).toBe(50);
  });

  it('ракет всего четыре на партию: пятое нажатие выстрела не делает', () => {
    const g = fresh();
    let shots = 0;
    for (let i = 0; i < 6; i++) shots += count(tap(g, 'rotate'), 'shot');
    expect(shots).toBe(4);
    expect(g.missiles).toBe(0);
  });

  it('монстр приходит сам: через десять секунд (600 тактов) один монстр появляется в верхней строке', () => {
    const g = fresh();
    run(g, 599);
    expect(g.monsters).toEqual([]);
    run(g, 1);
    expect(g.monsters).toHaveLength(1);
    expect(g.monsters[0]).toBeLessThan(10); // верхняя строка
    expect(g.lives).toBe(4);
  });

  coveredScenario('digger', 'неудача', 'монстр догоняет неподвижного игрока: потеря жизни, поле начинается заново (земля целая, монстров нет), счёт остаётся', () => {
    const g = fresh([184, 60]);
    tap(g, 'up'); // сокровище 184: счёт 10, второе сокровище (60) ещё лежит — победы нет
    expect(g.score).toBe(10);
    expect(g.gems.size).toBe(1);
    g.monsters = [114]; // в колонке игрока, в семи строках выше
    const caught = playUntil(g, (last) => has(last, 'lifeLost'), 1500);
    expect(caught.reached).toBe(true);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(10);
    expect(g.monsters).toContain(g.player); // потеря жизни — именно от монстра на клетке игрока
    const again = playUntil(g, () => g.monsters.length === 0 && g.player === 194, 120);
    expect(again.reached).toBe(true);
    expect(g.cells()[184]).toBe(1); // туннель засыпан
    expect(g.score).toBe(10);
    expect(g.level).toBe(1);
  });

  it('ракета спасает от монстра: выстрел вдоль колонки — и монстр до игрока не доходит', () => {
    const g = fresh();
    g.monsters = [174]; // двумя клетками выше игрока, взгляд вверх
    g.step(makeBrickInput(['rotate']));
    expect(g.monsters).toEqual([]);
    expect(g.score).toBe(25);
    run(g, 300);
    expect(g.lives).toBe(4);
  });

  it('игрок сам наступает на монстра: потеря жизни; на последней жизни — конец партии с рекордом', () => {
    const g = fresh();
    g.lives = 1;
    g.score = 40;
    g.monsters = [184]; // клетка прямо над игроком
    const crash = tap(g, 'up');
    expect(has(crash, 'lifeLost')).toBe(true);
    expect(has(crash, 'gameOver')).toBe(true);
    expect(g.lives).toBe(0);
    expectOverThenRestart(g, 40);
  });
});

// ── helicopter-bomber ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('helicopter-bomber: сценарии правил', () => {
  /** Новая партия; город задаётся высотами десяти зданий, вертолёт — в левом верхнем углу (колонка 0, строка 1). */
  const fresh = (heights: number[]): BomberGame => {
    const g = new BomberGame({ seed: 1 });
    g.start();
    g.buildings = Uint8Array.from(heights);
    return g;
  };
  const bombLands = (last: BrickEvent[]): boolean => has(last, 'explode');

  it('бомба: снимает один блок у здания под ней, +10 очков и сигнал explode; другие здания не тронуты', () => {
    const g = fresh([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    g.x = 4;
    g.step(makeBrickInput(['rotate']));
    expect(g.bomb).not.toBeNull();
    const landed = playUntil(g, bombLands, 200);
    expect(landed.reached).toBe(true);
    expect(Array.from(g.buildings)).toEqual([2, 2, 2, 2, 1, 2, 2, 2, 2, 2]);
    expect(g.score).toBe(10);
    expect(g.bomb).toBeNull();
    expect(g.lives).toBe(4);
  });

  it('одна бомба за раз: нажатия, пока бомба в полёте, ничего не добавляют', () => {
    const g = fresh([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    g.x = 4;
    g.step(makeBrickInput(['rotate']));
    const first = g.bomb;
    tap(g, 'rotate');
    tap(g, 'fire');
    expect(g.bomb).toBe(first); // та же бомба
    const landed = playUntil(g, bombLands, 200);
    expect(count(landed.events, 'explode')).toBe(1);
    expect(g.score).toBe(10);
    expect(g.buildings[4]).toBe(1);
  });

  it('бомба над пустой колонкой падает впустую: очков нет, зданий не прибавилось', () => {
    const g = fresh([0, 0, 0, 2, 0, 0, 0, 0, 0, 0]);
    g.x = 7;
    g.step(makeBrickInput(['rotate']));
    run(g, 120);
    expect(g.bomb).toBeNull();
    expect(g.score).toBe(0);
    expect(Array.from(g.buildings)).toEqual([0, 0, 0, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('здание из трёх блоков: три бомбы по +10, последний блок города — победа и +100', () => {
    const g = fresh([0, 0, 0, 0, 3, 0, 0, 0, 0, 0]);
    for (let blocks = 1; blocks <= 3; blocks++) {
      g.x = 4; // вертолёт над зданием
      g.step(makeBrickInput(['rotate']));
      const { events } = playUntil(g, bombLands, 200);
      expect(g.buildings[4], `бомба ${blocks}`).toBe(3 - blocks);
      expect(has(events, 'win'), `бомба ${blocks}`).toBe(blocks === 3);
    }
    expect(g.score).toBe(30 + 100);
    expect(g.level).toBe(1);
    expect(g.lives).toBe(4);
    const next = playUntil(g, () => g.level === 2, 120);
    expect(next.reached).toBe(true);
    expect(has(next.events, 'levelUp')).toBe(true);
    expect(g.buildings.some(Boolean)).toBe(true); // новый город
    expect(g.x).toBe(0);
    expect(g.y).toBe(1);
    expect(g.score).toBe(130);
  });

  coveredScenario('helicopter-bomber', 'прогресс', 'все здания: лётчик бомбит каждое, над которым пролетает, — победа, +10 за блок и +100 за уровень', () => {
    const g = fresh([0, 0, 1, 0, 0, 0, 1, 0, 0, 1]);
    // Лётчик сбрасывает бомбу, когда под ним есть здание и предыдущая бомба уже разорвалась.
    const pilot = (): BrickInput => (!g.bomb && g.buildings[g.x]! > 0 ? makeBrickInput(['rotate']) : NEUTRAL_BRICK_INPUT);
    const won = playUntil(g, (last) => has(last, 'win'), 1200, pilot);
    expect(won.reached).toBe(true);
    expect(count(won.events, 'explode')).toBe(3);
    expect(g.score).toBe(3 * 10 + 100);
    expect(g.lives).toBe(4);
    expect(has(won.events, 'lifeLost')).toBe(false);
    expect(g.buildings.some(Boolean)).toBe(false);
    const next = playUntil(g, () => g.level === 2, 120);
    expect(next.reached).toBe(true);
    expect(g.buildings.some(Boolean)).toBe(true);
    expect(g.score).toBe(130);
  });

  it('удержание «вправо» ускоряет полёт: вертолёт переходит в соседнюю колонку заметно раньше', () => {
    const ticksPerColumn = (held: BrickAction[]): number => {
      const g = fresh([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
      return playUntil(g, () => g.x === 1, 200, () => makeBrickInput([], held)).ticks;
    };
    expect(ticksPerColumn(['right'])).toBeLessThan(ticksPerColumn([]));
  });

  it('столкновение со зданием на пути: потеря жизни, вертолёт стоит у здания, счёт не меняется', () => {
    const g = fresh([0, 0, 0, 0, 8, 0, 0, 0, 0, 0]);
    g.y = 12; // верх здания высотой 8 — строка 12
    const crash = playUntil(g, (last) => has(last, 'lifeLost'), 200, () => makeBrickInput([], ['right']));
    expect(crash.reached).toBe(true);
    expect(g.x).toBe(4);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    expect(has(crash.events, 'gameOver')).toBe(false);
    const again = playUntil(g, () => g.x === 0 && g.y === 1 && g.buildings.some(Boolean), 120);
    expect(again.reached).toBe(true);
    expect(g.lives).toBe(3);
  });

  it('без бомб вертолёт, опускаясь на ряд за проход, рано или поздно врезается: первый проход безопасен, на втором потеря жизни', () => {
    const g = fresh([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    g.y = 14; // здания высотой 5 начинаются со строки 15: по строке 14 пролететь можно
    const crash = playUntil(g, (last) => has(last, 'lifeLost'), 400, () => makeBrickInput([], ['right']));
    expect(crash.reached).toBe(true);
    expect(g.y).toBe(15); // потеря жизни — после спуска на следующий ряд
    expect(g.x).toBe(0);
    expect(g.lives).toBe(3);
  });

  it('бомба расчищает путь: пробитое здание пропускает вертолёт, и он врезается только в следующее', () => {
    const crashColumn = (bombFirst: boolean): { x: number; score: number } => {
      const g = fresh([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
      g.y = 14;
      const held = makeBrickInput([], ['right']);
      const crash = playUntil(g, (last) => has(last, 'lifeLost'), 400, (t) => (bombFirst && t === 0 ? makeBrickInput(['rotate'], ['right']) : held));
      expect(crash.reached).toBe(true);
      expect(g.y).toBe(15);
      return { x: g.x, score: g.score };
    };
    expect(crashColumn(false)).toEqual({ x: 0, score: 0 }); // без бомбы — сразу в первое здание следующего ряда
    expect(crashColumn(true)).toEqual({ x: 1, score: 10 }); // с бомбой первое здание ниже, вертолёт его проходит
  });

  coveredScenario('helicopter-bomber', 'неудача', 'четыре потери жизни: после последней — конец партии с рекордом', () => {
    const g = fresh([0, 0, 0, 0, 8, 0, 0, 0, 0, 0]);
    g.score = 70;
    for (let crash = 1; crash <= 4; crash++) {
      g.buildings = Uint8Array.from([0, 0, 0, 0, 8, 0, 0, 0, 0, 0]);
      g.x = 0;
      g.y = 12;
      const before = g.lives;
      const played = playUntil(g, () => g.lives !== before, 200, () => makeBrickInput([], ['right']));
      expect(played.reached, `потеря ${crash}`).toBe(true);
      expect(g.lives, `потеря ${crash}`).toBe(4 - crash);
      expect(has(played.events, 'gameOver'), `потеря ${crash}`).toBe(crash === 4);
      if (crash < 4) run(g, 70); // сценка потери жизни
    }
    expectOverThenRestart(g, 70);
    expect(g.lives).toBe(4);
  });
});

// ── bowling ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('bowling: сценарии правил', () => {
  /** Бросок: нажать ROTATE и дождаться, пока шар докатится до конца дорожки. */
  const roll = (g: BowlingGame): BrickEvent[] => {
    const events = [...g.step(makeBrickInput(['rotate']))];
    for (let t = 0; g.ball && t < 200; t++) events.push(...g.step(NEUTRAL_BRICK_INPUT));
    return events;
  };
  /** Позиция броска (колонка шара) кнопками «влево» и «вправо». */
  const stand = (g: BowlingGame, column: number): void => {
    for (let i = 0; i < 12 && g.x < column; i++) tap(g, 'right');
    for (let i = 0; i < 12 && g.x > column; i++) tap(g, 'left');
    expect(g.x).toBe(column);
  };
  /** Уклон кнопками «вверх» (вправо) и «вниз» (влево): −1, 0 или +1. */
  const curve = (g: BowlingGame, aim: -1 | 0 | 1): void => {
    for (let i = 0; i < 3 && g.aim < aim; i++) tap(g, 'up');
    for (let i = 0; i < 3 && g.aim > aim; i++) tap(g, 'down');
    expect(g.aim).toBe(aim);
  };
  const fresh = (): BowlingGame => {
    const g = new BowlingGame({ seed: 1 });
    g.start();
    return g;
  };
  /** Горящие клетки пинов: «строка:колонка» в строках 0–16 (выше шара и указателя). */
  const standing = (g: BowlingGame): string[] => {
    const cells = g.cells();
    const out: string[] = [];
    for (let y = 0; y < 17; y++) for (let x = 0; x < 10; x++) if (cells[y * 10 + x]) out.push(`${y}:${x}`);
    return out;
  };

  it('кегли стоят треугольником из десяти (1, 2, 3, 4 в ряд), вершиной к игроку; жизней у игры нет', () => {
    const g = fresh();
    expect(standing(g)).toEqual(['2:1', '2:3', '2:5', '2:7', '3:2', '3:4', '3:6', '4:3', '4:5', '5:4']);
    expect(g.lives).toBeNull();
    expect(g.preview()).toBeNull();
  });

  it('позиция и уклон меняют число сбитых кегли: по центру — страйк, по краю — часть, мимо — ничего, кривой бросок возвращает шар к центру', () => {
    // Вручную по геометрии: шар добирается до кегель со смещением 3 × уклон (три поворота дорожки); центральная кегля — колонка 4.
    const cases: { column: number; aim: -1 | 0 | 1; down: number }[] = [
      { column: 4, aim: 0, down: 10 }, // ровно в голову
      { column: 3, aim: 0, down: 10 }, // голову задевает и соседняя колонка
      { column: 2, aim: 0, down: 6 }, // левее: сбиты левый край треугольника
      { column: 6, aim: 0, down: 6 }, // зеркально
      { column: 0, aim: 0, down: 1 }, // у самого борта — одна кегля
      { column: 9, aim: 0, down: 0 }, // правый жёлоб: мимо
      { column: 1, aim: 1, down: 10 }, // уклон вправо возвращает шар из левой части к центру
      { column: 7, aim: -1, down: 10 }, // и зеркально
      { column: 4, aim: 1, down: 3 }, // из центра уклон уводит шар к краю
    ];
    for (const c of cases) {
      const g = fresh();
      stand(g, c.column);
      curve(g, c.aim);
      const events = roll(g);
      expect(g.rolls, `колонка ${c.column}, уклон ${c.aim}`).toEqual([c.down]);
      expect(g.score).toBe(c.down);
      expect(g.pins.size).toBe(c.down === 10 ? 10 : 10 - c.down); // после страйка кегли расставлены заново
      expect(has(events, 'bonus'), `колонка ${c.column}, уклон ${c.aim}`).toBe(c.down === 10);
    }
  });

  it('указатель уклона виден на поле: «вверх» сдвигает его вправо от шара, «вниз» — влево, больше одной клетки в сторону нельзя', () => {
    const g = fresh();
    const mark = (): number[] => Array.from(g.cells().slice(170, 180)).flatMap((v, x) => (v ? [x] : []));
    expect(mark()).toEqual([4]);
    tap(g, 'up');
    expect(mark()).toEqual([5]);
    tap(g, 'up'); // дальше плюс единицы уклон не уходит
    expect(mark()).toEqual([5]);
    tap(g, 'down');
    tap(g, 'down');
    expect(mark()).toEqual([3]);
    tap(g, 'down'); // дальше минус единицы уклон не уходит
    expect(mark()).toEqual([3]);
  });

  coveredScenario('bowling', 'прогресс', 'страйк: десять очков, сигнал bonus, фрейм закрыт и кегли расставлены заново', () => {
    const g = fresh();
    const events = roll(g);
    expect(g.rolls).toEqual([10]);
    expect(g.score).toBe(10);
    expect(has(events, 'bonus')).toBe(true);
    expect(g.frame).toBe(1);
    expect(g.pins.size).toBe(10);
    expect(g.phase).toBe('playing');
  });

  it('два броска во фрейме: после первого оставшиеся кегли стоят, после второго фрейм закрыт; спэр тоже подаёт bonus, но лишних очков не даёт', () => {
    const g = fresh();
    roll(g); // страйк: фрейм 1, счёт 10
    stand(g, 2);
    const first = roll(g); // шесть кегель слева
    expect(g.rolls).toEqual([10, 6]);
    expect(g.score).toBe(16);
    expect(has(first, 'bonus')).toBe(false);
    expect(g.frame).toBe(1); // фрейм 2 ещё не закрыт
    expect(g.pins.size).toBe(4); // четыре кегли остались на месте
    stand(g, 4);
    const second = roll(g); // голова и хвост треугольника
    expect(g.rolls).toEqual([10, 6, 4]);
    expect(has(second, 'bonus')).toBe(true);
    expect(g.frame).toBe(2);
    expect(g.pins.size).toBe(10);
    expect(g.score).toBe(10 + 6 + 4); // чистое число сбитых кеглей: бонусы страйка и спэра не прибавляются
  });

  it('открытый фрейм: шесть и ноль кегель — сигнала bonus нет, фрейм закрыт, кегли расставлены заново', () => {
    const g = fresh();
    stand(g, 2);
    const first = roll(g);
    const second = roll(g); // тот же бросок: оставшиеся кегли вне досягаемости
    expect(g.rolls).toEqual([6, 0]);
    expect(has(first, 'bonus') || has(second, 'bonus')).toBe(false);
    expect(g.frame).toBe(1);
    expect(g.pins.size).toBe(10);
    expect(g.score).toBe(6);
  });

  it('пока шар катится, ни позиция, ни уклон, ни второе нажатие ничего не меняют', () => {
    const g = fresh();
    g.step(makeBrickInput(['rotate']));
    const ball = g.ball;
    expect(ball).not.toBeNull();
    tap(g, 'left');
    tap(g, 'up');
    tap(g, 'rotate');
    expect(g.x).toBe(4);
    expect(g.aim).toBe(0);
    expect(g.ball).toBe(ball);
    run(g, 200);
    expect(g.rolls).toEqual([10]);
  });

  it('десять фреймов: десять страйков — десять сигналов bonus, счёт 100, партия заканчивается именно после десятого фрейма', () => {
    const g = fresh();
    let bonuses = 0;
    for (let frame = 1; frame <= 10; frame++) {
      const events = roll(g);
      bonuses += count(events, 'bonus');
      expect(g.rolls, `фрейм ${frame}`).toHaveLength(frame);
      expect(g.score, `фрейм ${frame}`).toBe(10 * frame);
      expect(has(events, 'gameOver'), `фрейм ${frame}`).toBe(frame === 10);
      expect(g.frame, `фрейм ${frame}`).toBe(frame);
      expect(g.lives).toBeNull();
    }
    expect(bonuses).toBe(10);
    expect(g.score).toBe(100);
    expectOverThenRestart(g, 100);
    expect(g.rolls).toEqual([]);
    expect(g.frame).toBe(0);
    expect(g.pins.size).toBe(10);
  });

  coveredScenario('bowling', 'неудача', 'последний фрейм тоже из двух бросков: после первого неполного партия идёт, после второго заканчивается; итог — число сбитых кеглей', () => {
    const g = fresh();
    g.frame = 9; // девять фреймов уже сыграны
    stand(g, 2);
    const first = roll(g);
    expect(g.rolls).toEqual([6]);
    expect(has(first, 'gameOver')).toBe(false);
    expect(g.phase).toBe('playing');
    const second = roll(g); // тот же бросок: снова мимо оставшихся
    expect(g.rolls).toEqual([6, 0]);
    expect(has(second, 'gameOver')).toBe(true);
    expect(g.score).toBe(6);
    expectOverThenRestart(g, 6);
  });
});
