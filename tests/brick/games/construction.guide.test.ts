/**
 * Описание игры «Строитель» (`CONSTRUCTION_GUIDE`): схема описания корректна, заглушек нет, а каждое число в фактах, очках, жизнях и росте скорости
 * подтверждено поведением игры — числа здесь не берутся из констант, а измеряются игрой (жизни при старте, очки за клетку и ряд, порог скорости,
 * порог добавочной жизни, шаг стены в мс, число стартовых рядов, число вариантов).
 */
import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_TICK_HZ,
  NEUTRAL_BRICK_INPUT,
  guideProblems,
  makeBrickInput,
  type BrickGameOptions,
  type GameGuideData,
  type GuideText,
} from '../../../src/brick';
import { CONSTRUCTION_MODES, ConstructionGame, constructionDef } from '../../../src/brick/games/construction';
import type { GunSpace } from '../../../src/brick/games/gun/space';
import { BRICK_GUIDES, CONSTRUCTION_GUIDE } from '../../../src/brick/guides';
import { frameHash } from '../conformance';
import { hold, idle, litRows, rowCells, run, show, skipIntro, tap, types } from './gunKit';

/** Игра с доступом к внутренностям: поле пушки (донорские координаты: ряд 0 у пушки), пули, начисление очков. */
class TestConstruction extends ConstructionGame {
  field(): GunSpace {
    return this.space;
  }
  gunX(): number {
    return this.gun.x;
  }
  put(x: number, y: number): void {
    this.space.set(x, y, 1);
  }
  fillRow(y: number, except: readonly number[] = []): void {
    for (let x = 0; x < BRICK_COLS; x++) this.space.set(x, y, except.includes(x) ? 0 : 1);
  }
  bulletRows(x: number): (number | null)[] {
    return this.bullets.visibleRows(x);
  }
  bulletCount(): number {
    return this.bullets.count;
  }
  give(points: number): void {
    this.award(points);
  }
  setLivesTo(count: number): void {
    this.setLives(count);
  }
}

const make = (mode = 0, extra: BrickGameOptions = {}): TestConstruction => new TestConstruction({ seed: 5, mode, ...extra });
/** Игра, запущенная и прошедшая «мелодию»: первое действие игрока — в следующем такте. */
const started = (mode = 0, extra: BrickGameOptions = {}): TestConstruction => {
  const game = make(mode, extra);
  game.start();
  skipIntro(game);
  return game;
};
/** Игра с очищенным полем: на нём только то, что положит тест. */
const bare = (mode = 0, extra: BrickGameOptions = {}): TestConstruction => {
  const game = started(mode, extra);
  game.field().clear();
  return game;
};

const GUIDE: GameGuideData = CONSTRUCTION_GUIDE;

// ---------------------------------------------------------------- числа из текстов и числа, которые измеряет игра

/** Все тексты описания (без схем-рисунков) по группам, чтобы проверять числа по группам. */
const textsOf = (guide: GameGuideData): GuideText[] => [
  guide.summary,
  guide.goal,
  guide.progression,
  ...(guide.lives ? [guide.lives] : []),
  ...guide.rules,
  ...guide.controls.map((control) => control.text),
  ...guide.scoring.map((score) => score.what),
  ...guide.facts.map((fact) => fact.label),
  ...guide.schemes.map((scheme) => scheme.caption),
  ...guide.assumptions,
];

/** Числа в строке (целые и десятичные, запятая или точка), нормализованные к точке. Тысячи пишутся без разделителей. */
const numbersIn = (text: string): string[] => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) => value.replace(',', '.'));

/** Жизни в начале партии. */
const startLives = (): number => make().lives ?? 0;

/** Очки за клетку: выстрел в клетку стены. */
function pointsPerCell(): number {
  const game = bare();
  game.put(4, 10);
  tap(game, 'fire');
  idle(game, 12);
  expect(game.field().get(4, 9)).toBe(1);
  return game.score;
}

/** Очки за собранный ряд сверх очка за последнюю клетку: счёт на момент замыкания ряда и после его уборки. */
function pointsPerRow(): number {
  const game = bare();
  game.fillRow(10, [4]);
  game.put(4, 11);
  tap(game, 'fire');
  let closed = false;
  for (let i = 0; i < 20 && !closed; i++) closed = types(idle(game)).includes('lines');
  expect(closed).toBe(true);
  const before = game.score;
  idle(game, 30);
  expect(game.field().rowCount(10)).toBe(0);
  return game.score - before;
}

/** Сколько очков нужно до следующей скорости: набираем по одному, пока скорость не сменится. */
function pointsPerSpeedStep(): number {
  const game = started();
  let points = 0;
  while (game.speed === 1 && points < 100_000) {
    game.give(1);
    points++;
  }
  return points;
}

/** Сколько очков нужно до добавочной жизни (жизней сначала три). */
function pointsPerExtraLife(): number {
  const game = started();
  game.setLivesTo(3);
  let points = 0;
  while (game.lives === 3 && points < 1_000_000) {
    game.give(1);
    points++;
  }
  return points;
}

/** Бонус вместо добавочной жизни при полных жизнях: насколько счёт перескакивает через порог. */
function fullLivesBonus(): number {
  const threshold = pointsPerExtraLife();
  const game = started();
  game.give(threshold - 1);
  game.give(1);
  expect(game.lives).toBe(4);
  return game.score - threshold;
}

/** За сколько миллисекунд стена опускается на ряд (по тактам до первого изменения картинки); `mode` без сдвига поля. */
function wallStepMs(mode: number, speed: number): number {
  const game = started(mode, { speed });
  const before = game.cells().slice();
  let ticks = 0;
  while (ticks < 5000) {
    idle(game);
    ticks++;
    if (game.cells().some((value, i) => value !== before[i])) break;
  }
  return (ticks * 1000) / BRICK_TICK_HZ;
}

/** Рядов в стене сразу после «мелодии» на заданном уровне. */
const startRows = (level: number): number => litRows(started(0, { level }).cells()).filter((row) => row < 17).length;

/** Сколько тактов после старта игра не принимает ввод: первый такт, в котором выстрел состоялся. */
function introTicks(): number {
  const game = make();
  game.start();
  for (let step = 1; step < 500; step++) {
    if (types(game.step(makeBrickInput(['fire']))).includes('shot')) return step - 1;
  }
  throw new Error('выстрел так и не состоялся');
}

/** Скорость и уровень после того, как очки переходят порог на скорости `speed`, уровне `level`. */
function afterTenth(speed: number, level: number): [number, number] {
  const game = started(0, { speed, level });
  game.give(pointsPerSpeedStep());
  return [game.speed, game.level];
}

/** Наибольшая скорость: после неё скорость возвращается к первой, а уровень растёт. */
function topSpeed(): number {
  for (let speed = 1; speed <= 20; speed++) if (afterTenth(speed, 1)[1] !== 1) return speed;
  throw new Error('скорость не обернулась');
}

/** Наибольший уровень: после него уровень возвращается к первому. */
function topLevel(): number {
  for (let level = 1; level <= 20; level++) if (afterTenth(10, level)[1] < level) return level;
  throw new Error('уровень не обернулся');
}

// ---------------------------------------------------------------- проверки

describe('construction: описание — форма', () => {
  it('guideProblems пуст, описание зарегистрировано под id каталога', () => {
    expect(guideProblems(GUIDE)).toEqual([]);
    expect(BRICK_GUIDES.construction).toBe(CONSTRUCTION_GUIDE);
  });

  it('заглушек нет ни в русском, ни в английском тексте', () => {
    for (const text of textsOf(GUIDE)) {
      expect(text.ru).not.toMatch(/ЗАГЛУШКА|STUB/i);
      expect(text.en).not.toMatch(/ЗАГЛУШКА|STUB/i);
    }
    for (const fact of GUIDE.facts) expect(fact.value).not.toMatch(/ЗАГЛУШКА|STUB/i);
  });

  it('числа в русском и английском тексте одни и те же (в том же порядке)', () => {
    for (const text of textsOf(GUIDE)) expect(numbersIn(text.ru), text.ru).toEqual(numbersIn(text.en));
  });
});

describe('construction: числа описания подтверждены игрой', () => {
  it('жизни: четыре в начале партии', () => {
    expect(startLives()).toBe(4);
    expect(GUIDE.facts[0]?.value).toBe(String(startLives()));
    expect(GUIDE.lives?.ru).toContain(`${startLives()} жизни`);
    expect(GUIDE.lives?.en).toContain(`${startLives()} lives`);
  });

  it('очки: +1 за клетку, добавленную пулей, +10 за убранный ряд сверху', () => {
    expect(pointsPerCell()).toBe(1);
    expect(pointsPerRow()).toBe(10);
    expect(GUIDE.scoring.map((score) => score.points)).toEqual([`+${pointsPerCell()}`, `+${pointsPerRow()}`]);
  });

  it('скорость растёт каждые 500 очков; после десятой — первая, уровень +1, после десятого уровня — первый', () => {
    expect(pointsPerSpeedStep()).toBe(500);
    expect(GUIDE.facts[1]?.value).toBe(String(pointsPerSpeedStep()));
    expect(GUIDE.progression.ru).toContain(`Каждые ${pointsPerSpeedStep()} очков`);
    expect(GUIDE.progression.en).toContain(`Every ${pointsPerSpeedStep()} points`);
    expect(afterTenth(10, 3)).toEqual([1, 4]);
    expect(afterTenth(10, 10)).toEqual([1, 1]);
    expect(afterTenth(4, 3)).toEqual([5, 3]);
    expect(GUIDE.progression.ru).toContain('После скорости 10 — снова скорость 1');
    expect(GUIDE.progression.ru).toContain('после уровня 10 — уровень 1');
  });

  it('добавочная жизнь за каждые 10000 очков; при полных жизнях вместо неё +1000 очков', () => {
    expect(pointsPerExtraLife()).toBe(10000);
    expect(fullLivesBonus()).toBe(1000);
    expect(GUIDE.facts[2]?.value).toBe(String(pointsPerExtraLife()));
    for (const text of [GUIDE.lives?.ru ?? '', GUIDE.lives?.en ?? '']) {
      expect(numbersIn(text)).toEqual([String(startLives()), String(pointsPerExtraLife()), String(startLives()), String(fullLivesBonus())]);
    }
  });

  it('шаг стены: 4500 мс на скорости 1 и 2500 мс на скорости 10, у двух пушек вдвое дольше', () => {
    expect([wallStepMs(0, 1), wallStepMs(0, 10)]).toEqual([4500, 2500]);
    expect(GUIDE.facts[3]?.value).toBe(`${wallStepMs(0, 1)}→${wallStepMs(0, 10)}`);
    expect([wallStepMs(2, 1), wallStepMs(2, 10)]).toEqual([9000, 5000]);
    const rule = GUIDE.rules.find((text) => text.ru.startsWith('Стена опускается'));
    expect(rule?.ru).toContain(`${wallStepMs(0, 1) / 1000}`.replace('.', ','));
    expect(rule?.en).toContain(`${wallStepMs(0, 10) / 1000} s`);
    expect(rule?.ru).toContain('вдвое дольше');
  });

  it('скорость и уровень идут от 1 до 10, как сказано в описании', () => {
    expect([topSpeed(), topLevel()]).toEqual([10, 10]);
    expect(afterTenth(10, 10)).toEqual([1, 1]);
    const speedRule = GUIDE.rules.find((text) => text.ru.startsWith('Стена опускается'));
    expect(speedRule?.ru).toContain('(скорость 1…10)');
    expect(speedRule?.en).toContain('(speed 1…10)');
  });

  it('в числах четырёх групп (факты, очки, жизни, рост скорости) нет ничего, кроме измеренного', () => {
    const measured = new Set<string>([
      String(startLives()),
      String(pointsPerCell()),
      String(pointsPerRow()),
      String(pointsPerSpeedStep()),
      String(pointsPerExtraLife()),
      String(fullLivesBonus()),
      String(wallStepMs(0, 1)),
      String(wallStepMs(0, 10)),
      String(topSpeed()),
      String(topLevel()),
      ...afterTenth(10, 10).map(String), // нижние границы: скорость 1 и уровень 1
    ]);
    const scanned: string[] = [
      ...GUIDE.facts.flatMap((fact) => [fact.value, fact.label.ru, fact.label.en]),
      ...GUIDE.scoring.flatMap((score) => [score.points, score.what.ru, score.what.en]),
      GUIDE.lives?.ru ?? '',
      GUIDE.lives?.en ?? '',
      GUIDE.progression.ru,
      GUIDE.progression.en,
    ];
    for (const text of scanned) {
      for (const value of numbersIn(text)) expect(measured.has(value), `«${text}»: число ${value} не подтверждено`).toBe(true);
    }
  });
});

describe('construction: правила описания совпадают с игрой', () => {
  it('число вариантов в тексте — число реальных вариантов; следующий номер по кругу возвращает первый вариант', () => {
    expect(constructionDef.modes.length).toBe(8);
    expect(CONSTRUCTION_MODES.length).toBe(8);
    expect(GUIDE.rules.some((text) => text.ru.startsWith('8 вариантов') && text.en.startsWith('8 variants'))).toBe(true);
    /** Одинаковые действия на всех вариантах: стреляем и двигаем пушку. */
    const played = (mode: number): string => {
      const game = started(mode);
      run(game, 600, (t) =>
        t % 9 === 0 ? makeBrickInput(['fire']) : t % 31 === 0 ? makeBrickInput(['left']) : t % 47 === 0 ? makeBrickInput(['right']) : NEUTRAL_BRICK_INPUT,
      );
      return frameHash(game);
    };
    expect(new Set(Array.from({ length: 8 }, (_, mode) => played(mode))).size).toBe(8);
    expect(played(8)).toBe(played(0));
  });

  it('на уровне N стена стартует с N рядов, в каждом есть и клетки, и пропуски', () => {
    for (const level of [1, 2, 5, 10]) expect(startRows(level)).toBe(level);
    const game = started(0, { level: 6 });
    for (const row of litRows(game.cells()).filter((y) => y < 17)) {
      expect(rowCells(game.cells(), row)).toBeGreaterThanOrEqual(1);
      expect(rowCells(game.cells(), row)).toBeLessThanOrEqual(BRICK_COLS - 1);
    }
  });

  it('«мелодия» перед уровнем — 1,5 с без управления', () => {
    expect(introTicks() / BRICK_TICK_HZ).toBe(1.5);
    const ru = GUIDE.rules.find((text) => text.ru.includes('«мелодия»'));
    expect(ru?.ru).toContain('1,5 с');
    expect(ru?.en).toContain('1.5 s');
  });

  it('пуля встаёт перед первой клеткой, в пустой колонке — у верхнего края, вплотную к дулу клетка не создаётся', () => {
    const wall = bare();
    wall.put(4, 10);
    tap(wall, 'fire');
    idle(wall, 12);
    expect(wall.field().get(4, 9)).toBe(1);
    const empty = bare();
    tap(empty, 'fire');
    idle(empty, 20);
    expect(empty.field().get(4, 19)).toBe(1);
    const close = bare();
    close.put(4, 2);
    tap(close, 'fire');
    expect(close.field().total()).toBe(1);
    expect(close.score).toBe(0);
  });

  it('кнопки: влево, вправо и выстрел не повторяются при удержании; «вниз» роняет стену и повторяет; в перевёрнутых вариантах — «вверх»', () => {
    const game = started();
    tap(game, 'left');
    run(game, 30, () => makeBrickInput([], ['left']));
    expect(game.gunX()).toBe(3);
    const shots = types(run(game, 30, (t) => (t === 0 ? makeBrickInput(['fire']) : makeBrickInput([], ['fire'])))).filter((name) => name === 'shot');
    expect(shots.length).toBe(1);
    const lit = (g: TestConstruction): number => litRows(g.cells()).length;
    const down = started();
    const before = lit(down);
    hold(down, 'down', 7);
    expect(lit(down)).toBe(before + 3);
    const upside = started(4);
    const frozen = upside.cells().slice();
    expect(types(hold(upside, 'down', 7))).toEqual([]);
    expect(upside.cells()).toEqual(frozen);
    const rows = lit(upside);
    hold(upside, 'up', 7);
    expect(lit(upside)).toBe(rows + 3);
    expect(GUIDE.controls.map((control) => control.button)).toEqual(['left', 'right', 'rotate', 'down', 'up']);
  });

  it('две пушки: пули из колонок по бокам от центра, вдвое медленнее; сдвиг поля — после спуска, с оборачиванием', () => {
    const single = bare();
    tap(single, 'fire');
    idle(single, 2);
    expect(single.bulletRows(4)).toEqual([4]);
    const double = bare(2);
    tap(double, 'fire');
    expect(double.bulletRows(3)).toEqual([null]);
    expect(double.bulletRows(4)).toEqual([]);
    idle(double, 1);
    expect(double.bulletRows(3)).toEqual([2]);
    expect(double.bulletRows(5)).toEqual([2]);
    idle(double, 2);
    expect(double.bulletRows(3)).toEqual([3]);

    const shifted = started(1, { seed: 4 });
    idle(shifted, 269);
    shifted.put(9, 12);
    idle(shifted, 1);
    expect(shifted.field().get(9, 11)).toBe(1);
    idle(shifted, 2);
    expect(shifted.field().get(9, 11) + shifted.field().get(8, 11) + shifted.field().get(0, 11)).toBe(1);
    expect(shifted.field().get(9, 11)).toBe(0);
  });

  it('стена в ряду дула — потеря жизни: взрыв, очистка, тот же уровень заново; а ряды между убранным и пушкой поднимаются', () => {
    const game = started(0, { speed: 3, level: 2 });
    game.field().clear();
    game.put(7, 2);
    expect(types(tap(game, 'down'))).toEqual(['crash']);
    idle(game, 4 * 7 * 4);
    expect(game.lives).toBe(3);
    idle(game, 72 + 90 + 1);
    expect([game.speed, game.level]).toEqual([3, 2]);
    expect(litRows(game.cells()).filter((y) => y < 17).length).toBe(2);

    const rise = bare();
    rise.fillRow(10, [4]);
    rise.put(4, 11);
    rise.put(2, 12);
    rise.put(7, 8);
    tap(rise, 'fire');
    idle(rise, 60);
    expect(rise.field().get(2, 12)).toBe(1);
    expect(rise.field().get(7, 9)).toBe(1);
    expect(rise.field().get(7, 8)).toBe(0);
  });
});

describe('construction: схемы описания — кадры игры', () => {
  const bottom = (game: TestConstruction, count: number): string[] => show(game.cells()).split('\n').slice(-count);

  it('верх поля: стена из случайных рядов — ряды подряд от верхней строки, в каждом и клетки, и пропуски', () => {
    const scheme = GUIDE.schemes[0]?.cells ?? [];
    const lit = scheme.map((row) => [...row].filter((cell) => cell === '#').length);
    expect(lit.slice(0, -1).every((count) => count >= 1 && count <= BRICK_COLS - 1)).toBe(true);
    expect(lit[lit.length - 1]).toBe(0);
    const game = started(0, { level: scheme.length - 1 });
    expect(litRows(game.cells()).filter((row) => row < 17)).toEqual(scheme.slice(0, -1).map((_, row) => row));
    expect(show(game.cells()).split('\n')[scheme.length - 1]).toBe(scheme[scheme.length - 1]);
  });

  it('выстрел, который замкнёт ряд: кадр совпадает с игрой, затем ряд собирается и исчезает', () => {
    const scheme = GUIDE.schemes[1]?.cells ?? [];
    const game = bare();
    const top = 20 - scheme.length;
    scheme.slice(0, -2).forEach((row, r) => {
      for (let x = 0; x < BRICK_COLS; x++) if (row[x] === '#') game.put(x, 19 - (top + r));
    });
    tap(game, 'fire');
    idle(game, 1);
    expect(bottom(game, scheme.length)).toEqual(scheme);
    const events = idle(game, 30);
    expect(types(events)).toEqual(['lock', 'lines']);
    expect(game.field().rowCount(19 - (top + 2))).toBe(0);
    expect(game.score).toBe(1 + 10);
  });

  it('две пушки: кадр после выстрела совпадает со схемой (пули в колонках 3 и 5, дуло и основание в колонке 4)', () => {
    const scheme = GUIDE.schemes[2]?.cells ?? [];
    const game = bare(2);
    tap(game, 'fire');
    idle(game, 1);
    expect(bottom(game, scheme.length)).toEqual(scheme);
  });
});
