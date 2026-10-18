import { describe, expect, it } from 'vitest';
import { GUIDE_LIMITS, NEUTRAL_BRICK_INPUT, gt, guideProblems, guidedActions, makeBrickInput, secondsText, type BrickAction, type BrickGame, type BrickInput, type GameGuideData } from '../../src/brick';
import { LIBRARY_IDS } from '../../src/games/library';
import { deepClone } from './safePath';
import { BRICK_GAMES } from '../../src/brick/games';
import { FroggerGame } from '../../src/brick/games/frogger';
import { INVADERS_GUIDE, FROGGER_GUIDE, RACING_GUIDE, RACING_SHOOT_GUIDE, BRICK_GUIDES } from '../../src/brick/guides';
import { FROGGER_LIVES } from '../../src/brick/guides/frogger';
import { InvadersGame } from '../../src/brick/games/invaders';
import { racingDef, racingShootDef } from '../../src/brick/games/racing';
import { LEVELUP_POINT, SCORES_TO_EXTRA_LIFE } from '../../src/brick/games/racing/base';
import { AMMO_PER_PEDESTRIAN, MAX_AMMO } from '../../src/brick/games/racing/shoot';

/**
 * Описания игр для левой панели: форма данных, пределы длины, двуязычность и соответствие чисел коду. Числа в описаниях строятся из констант игр;
 * проверки здесь связывают их с поведением (жизни, добавочная жизнь, число вариантов), а правила игр проверяют их собственные тесты.
 */
const CYRILLIC = /[А-Яа-яЁё]/;

const texts = (guide: GameGuideData): { ru: string; en: string }[] => [
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

describe('описания игр: проверка формы', () => {
  const valid = (): GameGuideData => ({
    summary: gt('Игра', 'Game'),
    goal: gt('Цель', 'Goal'),
    rules: [gt('а', 'a'), gt('б', 'b'), gt('в', 'c')],
    controls: [{ button: 'left', text: gt('влево', 'left') }],
    scoring: [],
    facts: [
      { value: '1', label: gt('раз', 'one') },
      { value: '2', label: gt('два', 'two') },
    ],
    progression: gt('растёт', 'grows'),
    lives: null,
    schemes: [{ cells: ['#.', '.#'], caption: gt('схема', 'scheme') }],
    assumptions: [],
  });

  it('верное описание проходит; пустые и длинные тексты, кривые схемы и лишние пункты ловятся', () => {
    expect(guideProblems(valid())).toEqual([]);
    expect(guideProblems({ ...valid(), summary: gt('', 'x') })).toHaveLength(1);
    expect(guideProblems({ ...valid(), goal: gt('я'.repeat(GUIDE_LIMITS.goal + 1), 'g') })).toHaveLength(1);
    expect(guideProblems({ ...valid(), schemes: [{ cells: ['#.', '#'], caption: gt('а', 'a') }] })[0]).toContain('другой длины');
    expect(guideProblems({ ...valid(), schemes: [{ cells: ['x.'], caption: gt('а', 'a') }] })[0]).toContain('недопустимым');
    expect(guideProblems({ ...valid(), schemes: [{ cells: Array(21).fill('#'), caption: gt('а', 'a') }] })[0]).toContain('больше поля');
    expect(guideProblems({ ...valid(), rules: [gt('а', 'a')] })).toContain('rules: меньше трёх пунктов');
    expect(guideProblems({ ...valid(), controls: [] })).toContain('controls: нет ни одной кнопки');
    expect(guideProblems({ ...valid(), facts: [{ value: '1', label: gt('а', 'a') }] })).toContain('facts: должно быть от двух до четырёх');
  });

  it('время в тактах как секунды: запятая в русском тексте, точка в английском', () => {
    expect(secondsText(81)).toEqual({ ru: '1,35 с', en: '1.35 s' });
    expect(secondsText(30, 1)).toEqual({ ru: '0,5 с', en: '0.5 s' });
  });
});

describe('описания игр: реестр', () => {
  it('у каждой «кирпичной» игры реестра есть описание, и описаний лишних нет', () => {
    expect(Object.keys(BRICK_GUIDES).sort()).toEqual(Object.keys(BRICK_GAMES).sort());
  });

  it('«Тетрис с большими фигурами» (D) и «Тетрис Pentix» (9) — одна игра, описание одно', () => {
    expect(BRICK_GUIDES['tetris-big']).toBe(BRICK_GUIDES['tetris-pentix']);
  });

  for (const [id, guide] of Object.entries(BRICK_GUIDES)) {
    describe(id, () => {
      it('форма и пределы длины: guideProblems пуст', () => {
        expect(guideProblems(guide)).toEqual([]);
      });

      it('не заглушка; русский текст по-русски, английский — без кириллицы', () => {
        for (const text of texts(guide)) {
          expect(text.ru).not.toContain('ЗАГЛУШКА');
          expect(text.en).not.toContain('STUB');
          expect(CYRILLIC.test(text.ru), text.ru).toBe(true);
          expect(CYRILLIC.test(text.en), text.en).toBe(false);
        }
      });

      it('жизни: описание есть ровно у игр с жизнями, и число жизней в нём — то, с которым игра начинается', () => {
        const game = BRICK_GAMES[id]?.create({ seed: 1 });
        if (!game) throw new Error(`нет игры ${id}`);
        expect(guide.lives === null, 'lives').toBe(game.lives === null);
        if (guide.lives && game.lives !== null) {
          expect(guide.lives.ru).toMatch(new RegExp(`${game.lives}|${['', 'Одна', 'Две', 'Три', 'Четыре'][game.lives] ?? ''}`));
        }
      });

      it('кнопки управления не повторяются, схемы не пустые, очки — со знаком, число или нулём', () => {
        // Строка управления — кнопка вместе с сочетанием, способом (нажатие/удержание) и пометкой «клавиатура»: одинаковых строк быть не должно.
        const rows = guide.controls.map((control) => [control.button, ...(control.with ?? []), control.hold ? 'hold' : 'tap', control.keyboardOnly ? 'kbd' : 'body'].join('+'));
        expect(new Set(rows).size).toBe(rows.length);
        for (const score of guide.scoring) expect(score.points).toMatch(/^[+×]?\d|^0/);
        for (const scheme of guide.schemes) expect(scheme.cells.join('')).toMatch(/[#*]/);
      });
    });
  }
});

describe('описания игр: числа совпадают с игрой', () => {
  const fact = (guide: GameGuideData, index: number): string => guide.facts[index]?.value ?? '';

  it('«Лягушка»: жизни, добавочная жизнь, число полос и домов, очки за дом и ряд', () => {
    const game = new FroggerGame({ seed: 1 });
    expect(game.lives).toBe(FROGGER_LIVES);
    expect(fact(FROGGER_GUIDE, 2)).toBe(String(game.lives));
    expect(fact(FROGGER_GUIDE, 3)).toBe(String(game['scoresToExtraLife']));
    expect(FROGGER_GUIDE.scoring.map((score) => score.points)).toEqual(['+1', '+10']);
    expect(fact(FROGGER_GUIDE, 0)).toBe('8');
    expect(fact(FROGGER_GUIDE, 1)).toBe('10');
    expect(FROGGER_GUIDE.assumptions[0]?.ru).toContain(String(BRICK_GAMES['frog']?.modes.length));
  });

  it('«Стрельба по массиву»: число вариантов, жизни, добавочная жизнь, пуль в колонке', () => {
    const game = new InvadersGame({ seed: 1 });
    expect(fact(INVADERS_GUIDE, 0)).toBe(String(BRICK_GAMES['shooting-array']?.modes.length));
    expect(fact(INVADERS_GUIDE, 1)).toBe(String(game.lives));
    expect(fact(INVADERS_GUIDE, 2)).toBe(String(game['scoresToExtraLife']));
    expect(INVADERS_GUIDE.scoring[0]?.points).toBe('+1');
  });

  it('«Гонки» и «Гонки со стрельбой»: жизни, шаг скорости, добавочная жизнь, число вариантов, патроны', () => {
    for (const [def, guide] of [
      [racingDef, RACING_GUIDE],
      [racingShootDef, RACING_SHOOT_GUIDE],
    ] as const) {
      const game = def.create({ seed: 1 });
      expect(game.lives).toBe(4);
      expect(guide.lives?.ru).toContain(String(SCORES_TO_EXTRA_LIFE));
      expect(guide.progression.ru).toContain(String(LEVELUP_POINT));
    }
    expect(fact(RACING_GUIDE, 0)).toBe(String(racingDef.modes.length));
    expect(fact(RACING_GUIDE, 2)).toBe(String(LEVELUP_POINT));
    expect(fact(RACING_GUIDE, 3)).toBe(String(SCORES_TO_EXTRA_LIFE));
    expect(fact(RACING_SHOOT_GUIDE, 0)).toBe(String(AMMO_PER_PEDESTRIAN));
    expect(fact(RACING_SHOOT_GUIDE, 1)).toBe(String(MAX_AMMO));
    expect(fact(RACING_SHOOT_GUIDE, 3)).toBe(String(racingShootDef.modes.length));
  });
});

describe('описания игр: кнопки в справке совпадают с тем, на что игра реагирует', () => {
  const ACTIONS: BrickAction[] = ['left', 'right', 'up', 'down', 'rotate', 'fire'];
  /** Исход эксперимента: видимое состояние через `ticks` тактов (поле, счёт, жизни, уровень, события) — без скрытых счётчиков. */
  const outcome = (game: BrickGame, inputs: BrickInput[], ticks: number): string => {
    const events: string[] = [];
    for (let t = 0; t < ticks; t++) for (const e of game.step(inputs[t] ?? NEUTRAL_BRICK_INPUT)) events.push(e.type + (e.type === 'tone' ? e.pad : ''));
    return `${Array.from(game.cells()).join('')}|${game.score}|${game.lives}|${game.level}|${events.join(',')}`;
  };
  /**
   * Игра, прожившая `warm` тактов без ввода и дошедшая до состояния без сценки: сценки держат замыкания на исходный объект, и клон ушёл бы в него.
   */
  function warmed(id: string, warm: number): BrickGame {
    const game = BRICK_GAMES[id]!.create({ seed: 7 });
    game.start();
    const busy = (): boolean => (game as unknown as { busy: boolean }).busy;
    for (let t = 0; t < warm || (busy() && t < warm + 800); t++) game.step(NEUTRAL_BRICK_INPUT);
    expect(busy(), `${id}: сценка не закончилась`).toBe(false);
    return game;
  }
  /** Реагирует ли игра на действие (нажатие или удержание) хотя бы в одном из нескольких состояний партии. */
  function reacts(id: string, action: BrickAction): boolean {
    for (const warm of [0, 40, 400]) {
      const base = warmed(id, warm);
      const idle = outcome(deepClone(base), [], 60);
      const press = [makeBrickInput([action])];
      const holdIt = Array.from({ length: 60 }, (_, t) => (t === 0 ? makeBrickInput([action]) : makeBrickInput([], [action])));
      if (outcome(deepClone(base), press, 60) !== idle || outcome(deepClone(base), holdIt, 60) !== idle) return true;
    }
    return false;
  }
  /** `fire` — отдельная строка, только если делает не то же, что ROTATE (иначе это синоним, на корпусе его нет). */
  function fireDiffers(id: string): boolean {
    for (const warm of [0, 40, 400]) {
      const base = warmed(id, warm);
      const asFire = Array.from({ length: 60 }, (_, t) => (t === 0 ? makeBrickInput(['fire']) : makeBrickInput([], ['fire'])));
      const asRotate = Array.from({ length: 60 }, (_, t) => (t === 0 ? makeBrickInput(['rotate']) : makeBrickInput([], ['rotate'])));
      if (outcome(deepClone(base), asFire, 60) !== outcome(deepClone(base), asRotate, 60)) return true;
    }
    return false;
  }

  for (const id of Object.keys(BRICK_GAMES)) {
    it(`${id}: каждое действие, на которое игра реагирует, описано в кнопках; клавиша «огонь» — отдельной строкой, если она не синоним ROTATE`, () => {
      const covered = guidedActions(BRICK_GUIDES[id]!.controls);
      for (const action of ACTIONS) {
        if (action === 'fire') {
          if (fireDiffers(id)) expect(covered.has('fire'), `${id}: «огонь» ведёт себя иначе, чем ROTATE, но в справке не описан`).toBe(true);
          continue;
        }
        if (reacts(id, action)) expect(covered.has(action), `${id}: игра реагирует на «${action}», в справке этого нет`).toBe(true);
      }
    });
  }

  it('кнопки только клавиатуры (fire) не единственный способ выполнить действие: у каждой такой строки есть кнопка корпуса для основного хода игры', () => {
    for (const id of LIBRARY_IDS) {
      const bodyRows = BRICK_GUIDES[id]!.controls.filter((control) => !control.keyboardOnly && control.button !== 'start');
      expect(bodyRows.length, id).toBeGreaterThan(0);
    }
  });
});
