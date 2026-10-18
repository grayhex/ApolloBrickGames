/**
 * Варианты библиотечных игр по вики retroconsoles (раздел Modes): Dancing Game (2), Obstacles Race (2), Quarth (2), Snake (2), Pneumatic Ball (8), Pong (16),
 * Little Honeybee (8). Вики описывает другую прошивку, а не Apollo, поэтому правила признаков здесь — допущения проекта (см. `docs/brick/modes-reference.md`);
 * проверяется, что они реализованы так, как записано в `modes[].note`, а вариант 01 остался прежним.
 *
 * Устройство файла: каталог вариантов → вариант 01 не изменился (отпечатки прогонов, снятые до добавления вариантов) → «вверх дном» как зеркало обычного варианта
 * и обмен ↑ ↓ → размер платформы и «Brick move» → сценарии «прогресс» и «неудача» новых вариантов каждой игры (как в scenarios.*.test.ts: игра проводится
 * настоящими тактами `step` к исходу; состояние готовится присваиванием полям). Общие проверки каждого варианта (`conformance`) — в library.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  GAME_OVER_HOLD_TICKS,
  GAME_OVER_TICKS_PER_ROW,
  NEUTRAL_BRICK_INPUT,
  flipRows,
  guideProblems,
  makeBrickInput,
  type BrickAction,
  type BrickEvent,
  type BrickGame,
  type BrickInput,
} from '../../../src/brick';
import { LIBRARY_GAMES } from '../../../src/brick/games/library';
import { BRICK_GUIDES } from '../../../src/brick/guides';
import { BallGame, RoadGame, ShooterGame } from '../../../src/brick/games/library/action';
import { PadsGame, SnakeGame } from '../../../src/brick/games/library/arcade';
import { QUARTH_LEVELS, QuarthGame } from '../../../src/brick/games/library/falling';
import { LIBRARY_IDS } from '../../../src/games/library';
import { fuzzPlayer } from '../conformance';
import { fingerprint } from '../modeFingerprint';
import { findSafePath } from '../safePath';

// ── помощники ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const IDLE = NEUTRAL_BRICK_INPUT;
const holding = (...actions: BrickAction[]): BrickInput => makeBrickInput([], actions);
const count = (events: readonly BrickEvent[], type: BrickEvent['type']): number => events.filter((e) => e.type === type).length;
const has = (events: readonly BrickEvent[], type: BrickEvent['type']): boolean => events.some((e) => e.type === type);
/** Идёт сценка без ввода (очистка поля после потери жизни, победа, конец игры). */
const busy = (g: BrickGame): boolean => (g as unknown as { busy: boolean }).busy;
const run = (g: BrickGame, n: number, input: BrickInput = IDLE): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(input));
  return events;
};
/** Нажатие и отпускание: два такта (фронт, затем тишина), чтобы автоповтор не сработал. */
const tap = (g: BrickGame, action: BrickAction): BrickEvent[] => [...g.step(makeBrickInput([action])), ...g.step(IDLE)];
/** Шаги, пока не выполнится условие (не больше `max`); если оно не наступило — сценарий не дошёл до исхода. */
const until = (g: BrickGame, done: () => boolean, max: number, input: BrickInput = IDLE): BrickEvent[] => {
  const events: BrickEvent[] = [];
  for (let i = 0; i < max && !done(); i++) events.push(...g.step(input));
  expect(done(), `исход не наступил за ${max} тактов`).toBe(true);
  return events;
};
/** Показывает ли игра сейчас полноэкранную сценку (накладку) вместо поля. */
const overlay = (g: BrickGame): boolean => (g as unknown as { overlay: Uint8Array | null }).overlay !== null;
/** Дождаться конца сценки: игра снова принимает ввод. */
const settle = (g: BrickGame): void => void until(g, () => !busy(g), 300);
/** Предел тактов анимации конца игры (заливка рядов и пауза) — из констант основы, без зашитых чисел; запас два такта. */
const GAME_OVER_BOUND = Math.ceil(BRICK_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS) + 2;
const expectFinished = (g: BrickGame): void => {
  until(g, () => g.phase === 'over', GAME_OVER_BOUND);
  expect(g.step(makeBrickInput(['left', 'rotate']))).toEqual([]);
  expect(g.overFill).toBe(BRICK_ROWS);
};
const lit = (g: BrickGame, x: number, y: number): number => g.cells()[y * BRICK_COLS + x] ?? -1;
/** Сколько клеток горит (в том числе мигает) в строке экрана `y`. */
const litCount = (g: BrickGame, y: number): number => Array.from({ length: BRICK_COLS }, (_, x) => lit(g, x, y)).filter(Boolean).length;
/** Обмен ↑ и ↓ во вводе — независимая от реализации запись правила «Invert upside-down». */
const swapped = (input: BrickInput): BrickInput => {
  const swap = (set: ReadonlySet<BrickAction>): BrickAction[] => [...set].map((a): BrickAction => (a === 'up' ? 'down' : a === 'down' ? 'up' : a));
  return makeBrickInput(swap(input.pressed), swap(input.held));
};
const KEYS = ['up', 'right', 'down', 'left'] as const;
/** Кнопка корпуса, которая в варианте `inverted` действует как `key` обычного варианта. */
const physical = (key: BrickAction, inverted: boolean): BrickAction => (inverted ? (key === 'up' ? 'down' : key === 'down' ? 'up' : key) : key);

/** Число вариантов у вики для каждой игры; у остальных игр библиотеки вариант по-прежнему один. */
const WIKI_COUNT = { dance: 2, 'obstacle-race': 2, quarth: 2, snake: 2, 'pneumatic-ball': 8, pong: 16, honeybee: 8 } as const;
type WikiId = keyof typeof WIKI_COUNT;
const WIKI_IDS = Object.keys(WIKI_COUNT) as WikiId[];

// ── каталог вариантов ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('варианты по вики retroconsoles: каталог', () => {
  for (const id of WIKI_IDS) {
    it(`${id}: ${WIKI_COUNT[id]} вариантов, число совпадает с declaredModes; названия на двух языках, различны; источник и допущения названы`, () => {
      const def = LIBRARY_GAMES[id];
      expect(def.modes).toHaveLength(WIKI_COUNT[id]);
      expect(def.declaredModes).toBe(WIKI_COUNT[id]);
      expect(new Set(def.modes.map((m) => m.name.ru)).size, 'русские названия различны').toBe(def.modes.length);
      expect(new Set(def.modes.map((m) => m.name.en)).size, 'английские названия различны').toBe(def.modes.length);
      def.modes.forEach((mode, index) => {
        expect(mode.name.ru).toMatch(/[А-Яа-яЁё]/);
        expect(mode.name.en).not.toMatch(/[А-Яа-яЁё]/);
        if (index === 0 && id !== 'snake' && id !== 'honeybee') {
          expect(mode.note, 'вариант 01 — прежняя игра').toContain('без изменений');
        } else if (id === 'quarth') {
          expect(mode.note, 'источник Quarth — слова владельца, не вики').toContain('со слов владельца');
          expect(mode.note).toContain('не проверено');
        } else {
          expect(mode.note, `вариант ${index + 1}: пометка источника`).toContain('вики retroconsoles');
          expect(mode.note, `вариант ${index + 1}: это не Apollo`).toContain('не Apollo');
          expect(mode.note, `вариант ${index + 1}: допущение названо`).toMatch(/[Дд]опущение/);
        }
      });
    });
  }

  it('номера вариантов Pong, Pneumatic Ball и «Пчёлки» — порядок вики: в note дословно строка вики с тем же номером', () => {
    for (const id of ['pong', 'pneumatic-ball', 'honeybee'] as const) {
      LIBRARY_GAMES[id].modes.forEach((mode, index) => expect(mode.note, `${id}: вариант ${index + 1}`).toContain(`Mode ${index + 1}:`));
    }
    for (const id of ['dance', 'obstacle-race', 'snake'] as const) {
      LIBRARY_GAMES[id].modes.forEach((mode, index) => expect(mode.note, `${id}: вариант ${index + 1}`).toContain(`Mode ${index + 1}:`));
    }
  });

  it('справка каждой из семи игр называет варианты: число вариантов в фактах совпадает с игрой, в допущениях — источник (вики или слова владельца)', () => {
    for (const id of WIKI_IDS) {
      const guide = BRICK_GUIDES[id]!;
      const variants = guide.facts.find((fact) => fact.label.ru === 'вариантов');
      expect(variants?.value, id).toBe(String(WIKI_COUNT[id]));
      expect(guide.assumptions.some((a) => a.ru.includes(`Вариантов ${WIKI_COUNT[id]}`)), `${id}: пункт о вариантах`).toBe(true);
      expect(guide.assumptions.some((a) => /вики|владельца/.test(a.ru) && /допущение/.test(a.ru)), `${id}: источник и допущение названы`).toBe(true);
      expect(guideProblems(guide), id).toEqual([]);
    }
    for (const id of LIBRARY_IDS.filter((x) => !(x in WIKI_COUNT))) expect(BRICK_GUIDES[id]!.facts.some((fact) => fact.label.ru === 'вариантов'), id).toBe(false);
  });

  it('остальные игры библиотеки по-прежнему с одним вариантом и без declaredModes', () => {
    for (const id of LIBRARY_IDS.filter((x) => !(x in WIKI_COUNT))) {
      expect(LIBRARY_GAMES[id].modes, id).toHaveLength(1);
      expect(LIBRARY_GAMES[id].declaredModes, id).toBeNull();
    }
  });
});

// ── вариант 01 не изменился ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Отпечатки прогонов варианта 01 каждой игры библиотеки (зёрна 1 и 7, случайный ввод до первого конца партии, но не дольше 3000 тактов), снятые с кода
 * до добавления вариантов (`modeFingerprint.ts`). От индекса варианта зависят категории рейтингов и сохранённые рекорды, поэтому 01 должен оставаться прежним
 * по кадрам и событиям. Snake/Dice/Beetle сознательно обновлены по ROM в ruleset 2; их новые отпечатки дополнены независимыми ROM-трассами. Остальные отпечатки не менялись.
 */
const GOLDEN: Readonly<Record<string, readonly [string, string]>> = {
  '2048': ['d4581bad', 'e7732f33'],
  'meteor-fighter': ['dc8a98d8', '50ba3444'],
  'tetris-shooting': ['bd940115', 'd966622e'],
  snake: ['64f92442', '324afeb1'],
  maze: ['2cbb1290', '0b6a04a7'],
  jigsaw: ['b5948e13', '21e04c8b'],
  pong: ['df728dae', '319d8a01'],
  'pong-double': ['4abf94c0', 'a6760919'],
  'pneumatic-ball': ['ef2fc58c', '2a0853b0'],
  honeybee: ['c04080b4', 'd3ad67dc'],
  'obstacle-race': ['c30c06a1', '4e3ed4c9'],
  'matching-blocks': ['e54e7f75', '58487de9'],
  'whack-a-mole': ['a45bec5b', '7eb5f3ad'],
  simon: ['ce1e7174', '3ceca6d5'],
  dice: ['30c9b37d', '9e3db428'],
  dance: ['44474ae6', '693e6140'],
  quarth: ['f4514e6c', '7a6dc637'],
  'lights-out': ['2739acc9', '65a346a8'],
  'boat-racing': ['7e13d11d', '1ceb272b'],
  'talking-shooting': ['a2971408', '58b1777c'],
  'ufo-raiders': ['cb3a9a2d', 'c5aa37d4'],
  'tetris-flicker': ['58b11f2c', '8d87786c'],
  'super-tank': ['3e08cd1c', 'faa27da9'],
  'racing-pickup': ['64952ef9', '8b068716'],
  'punch-racing': ['242723b8', 'cfc5c7c5'],
  sokoban: ['262f97d9', '702d6b10'],
  columns: ['1dd154ec', '342a3517'],
  'columns-flicker': ['85c8b3b2', '379d4475'],
  'space-invaders': ['7f5ae953', '58b1777c'],
  'peg-solitaire': ['6e7eacf9', '5e95750f'],
  basket: ['52672966', 'c3cf0544'],
  'dr-mario': ['95fe3a33', '44e94e9a'],
  bowling: ['67e01335', 'a1d7269a'],
  'dual-shooting': ['e45d723a', '3d6d7724'],
  'racing-four': ['4083083c', '910757f6'],
  'arkanoid-dots': ['da208826', 'c357897a'],
  'flappy-bird': ['297cc268', 'a1005f90'],
  reversi: ['209e9978', 'ec34e3a8'],
  'fill-connect': ['83b3cd01', 'c4d85b6f'],
  digger: ['78a0d657', '58d2f872'],
  'helicopter-bomber': ['5279937c', 'd8c97136'],
};

describe('baseline варианта 01: неизменённые игры и осознанные ROM-ревизии', () => {
  it('таблица отпечатков охватывает все игры библиотеки', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...LIBRARY_IDS].sort());
  });
  for (const id of LIBRARY_IDS) {
    it(`${id}: отпечаток прогона варианта 01 совпадает с утверждённой ревизией`, () => {
      const expected = GOLDEN[id];
      expect(expected, id).toBeDefined();
      [1, 7].forEach((seed, i) => expect(fingerprint(LIBRARY_GAMES[id].create({ seed, mode: 0 }), seed), `${id}, зерно ${seed}`).toBe(expected?.[i]));
    });
  }
});

// ── «Invert upside-down»: зеркало обычного варианта и обмен ↑ ↓ ──────────────────────────────────────────────────────────────────

/** Пары «обычный вариант — тот же, но вверх дном» по номерам вики. */
const MIRRORS: readonly (readonly [WikiId, number, number])[] = [
  ['dance', 0, 1],
  ['obstacle-race', 0, 1],
  ['quarth', 0, 1],
  ...[0, 1, 2, 3].map((m): readonly [WikiId, number, number] => ['pneumatic-ball', m, m + 4]),
  ...[0, 1, 2, 3, 8, 9, 10, 11].map((m): readonly [WikiId, number, number] => ['pong', m, m + 4]),
  ...[0, 1, 4, 5].map((m): readonly [WikiId, number, number] => ['honeybee', m, m + 2]),
];

describe('«Invert upside-down»: поле отражено по вертикали, ↑ и ↓ меняются местами', () => {
  for (const [id, plain, inverted] of MIRRORS) {
    it(`${id}: вариант ${inverted + 1} — зеркало варианта ${plain + 1} (кадры, события, счёт и жизни совпадают), ввод ↑ ↓ обменен`, () => {
      const def = LIBRARY_GAMES[id];
      // Wiki variant 03 mirrors the former default figure, not the new ROM Beetle profile.
      const a = id==='honeybee' && plain===0 ? new ShooterGame('honeybee',{seed:3,mode:0,speed:5}) : def.create({ seed: 3, mode: plain, speed: 5 });
      const b = def.create({ seed: 3, mode: inverted, speed: 5 });
      expect(b.cells(), 'до старта кадр уже перевёрнут').toEqual(flipRows(a.cells()));
      expect(b.cells(), 'и это не тот же кадр').not.toEqual(a.cells());
      a.start();
      b.start();
      const player = fuzzPlayer(11 + inverted);
      for (let t = 0; t < 1500; t++) {
        if (a.phase === 'over') {
          a.start();
          b.start();
        }
        const input = player();
        const eventsA = a.step(input);
        const eventsB = b.step(swapped(input)); // игроку «вверх дном» нужно нажать противоположную вертикаль, чтобы игра увидела то же самое
        expect(eventsB, `такт ${t}`).toEqual(eventsA);
        // отражается кадр игры; полноэкранная сценка очистки поля идёт одинаково (заливка снизу вверх), как у остальных перевёрнутых игр набора
        expect(b.cells(), `такт ${t}`).toEqual(overlay(a) ? a.cells() : flipRows(a.cells()));
        expect([b.score, b.lives, b.level, b.phase]).toEqual([a.score, a.lives, a.level, a.phase]);
      }
    });
  }

  it('сценка очистки поля после потери жизни не отражается: заливка идёт снизу вверх и в перевёрнутом варианте, как у остальных перевёрнутых игр набора', () => {
    for (const mode of [0, 4]) {
      const g = pong(mode);
      g.balls = [ball(9, 17, 1, 1)];
      ballStep(g);
      expect(g.lives).toBe(3);
      expect(overlay(g), `вариант ${mode + 1}: идёт сценка`).toBe(true);
      expect([litCount(g, BRICK_ROWS - 1), litCount(g, 0)], `вариант ${mode + 1}: первым заливается нижний ряд`).toEqual([BRICK_COLS, 0]);
    }
  });

  it('Obstacle Race: ускоряет ↑ в варианте 01 и ↓ в варианте 02; противоположная кнопка дороги не ускоряет', () => {
    const ticksToFirstStep = (mode: number, key: BrickAction | null): number => {
      const g = new RoadGame('obstacle-race', { seed: 1, mode });
      g.start();
      let ticks = 0;
      while (g.score < 1 && ticks < 100) {
        g.step(key ? holding(key) : IDLE);
        ticks++;
      }
      expect(g.lives).toBe(4);
      return ticks;
    };
    const idle = ticksToFirstStep(0, null);
    expect(ticksToFirstStep(1, null), 'без нажатий варианты идут в одном темпе').toBe(idle);
    expect(ticksToFirstStep(0, 'up')).toBeLessThan(idle);
    expect(ticksToFirstStep(0, 'down'), 'в варианте 01 ↓ дорогу не ускоряет').toBe(idle);
    expect(ticksToFirstStep(1, 'down')).toBeLessThan(idle);
    expect(ticksToFirstStep(1, 'up'), 'в варианте 02 ↑ дорогу не ускоряет').toBe(idle);
  });

  it('Dancing Game: в варианте 02 ноту направления «вверх» принимает кнопка ↓ корпуса, и наоборот; ← и → остаются на месте', () => {
    for (const [direction, key] of [[0, 'down'], [2, 'up'], [1, 'right'], [3, 'left']] as const) {
      const g = new PadsGame('dance', { seed: 2, speed: 1, mode: 1 });
      g.start();
      g.notes = [{ direction, y: 17 }];
      const events = tap(g, key);
      expect(events, `нота ${direction}, кнопка ${key}`).toContainEqual({ type: 'tone', pad: direction, ticks: 12 });
      expect(g.score).toBe(10);
      expect(g.lives).toBe(4);
    }
    const wrong = new PadsGame('dance', { seed: 2, speed: 1, mode: 1 });
    wrong.start();
    wrong.notes = [{ direction: 0, y: 17 }];
    expect(count(tap(wrong, 'up'), 'lifeLost'), '↑ в варианте 02 — это площадка «вниз»: для ноты «вверх» ошибка').toBe(1);
    expect(wrong.lives).toBe(3);
  });
});

// ── размер платформы и «Brick move» ──────────────────────────────────────────────────────────────────────────────────────────────

type Ball = { x: number; y: number; dx: number; dy: number };
const ball = (x: number, y: number, dx: number, dy: number): Ball => ({ x, y, dx, dy });
const PADDLE: readonly number[] = [3, 3, 2, 1]; // индекс размера вики: Default, Three, Two, One
const paddleOf = (size: number): number => PADDLE[size] ?? 3;
const pong = (mode: number, options: { seed?: number; speed?: number } = {}): BallGame => {
  const g = new BallGame('pong', { seed: 3, ...options, mode });
  g.start();
  return g;
};
const pneumatic = (mode: number, options: { seed?: number; speed?: number } = {}): BallGame => {
  const g = new BallGame('pneumatic-ball', { seed: 3, ...options, mode });
  g.start();
  return g;
};
/** Дождаться очередного шага мяча: признак — сдвиг вратаря (верхней ракетки), он идёт ровно в такты шага мячей. */
const ballStep = (g: BallGame, input: BrickInput = IDLE): BrickEvent[] => {
  const guard = g.guard;
  const events: BrickEvent[] = [];
  for (let i = 0; i < 100 && g.guard === guard; i++) events.push(...g.step(input));
  expect(g.guard, 'мяч не сделал шаг за 100 тактов').not.toBe(guard);
  return events;
};
/** Мяч у верхней границы: следующим шагом он войдёт в верхнюю зону в колонке 9, а вратарь стоит значительно левее — гол. */
const stageGoal = (g: BallGame): void => {
  g.guard = 3;
  g.balls = [ball(8, 2, 1, -1)];
};

describe('размер платформы: Pneumatic Ball и Pong', () => {
  const MODES = [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((mode): readonly ['pong' | 'pneumatic-ball', number] => ['pneumatic-ball', mode]),
    ...Array.from({ length: 16 }, (_, mode): readonly ['pong' | 'pneumatic-ball', number] => ['pong', mode]),
  ];
  for (const [id, mode] of MODES) {
    const size = mode & 3;
    const inverted = (mode & 4) !== 0;
    const make = (): BallGame => (id === 'pong' ? pong(mode) : pneumatic(mode));
    // строка игрока и строка верхней ракетки (вратаря) на экране
    const playerRow = inverted ? 0 : BRICK_ROWS - 1;
    const guardRow = inverted ? BRICK_ROWS - 1 : 0;
    const guardCells = id === 'pong' && size > 0 ? paddleOf(size) : 3; // у Pong размер действует на обе ракетки («both»), у Pneumatic Ball — только на платформу игрока

    it(`${id}, вариант ${mode + 1}: платформа игрока ${paddleOf(size)} кл., верхняя ракетка ${guardCells} кл.${inverted ? ', поле вверх дном' : ''}`, () => {
      const g = make();
      expect(litCount(g, playerRow)).toBe(paddleOf(size));
      expect(litCount(g, guardRow)).toBe(guardCells);
      expect(g.paddle).toBe(paddleOf(size));
      expect(g.guardWidth).toBe(guardCells);
      // платформа ходит от края до края: крайняя клетка достигает колонок 0 и 9
      run(g, 90, holding('right'));
      expect(g.x + paddleOf(size) - 1, 'правая клетка платформы у правого края').toBe(9);
      expect(lit(g, 9, playerRow)).toBeGreaterThan(0);
      run(g, 130, holding('left'));
      expect(g.x).toBe(0);
      expect(lit(g, 0, playerRow)).toBeGreaterThan(0);
    });
  }

  it('«Three paddle size» совпадает с режимом по умолчанию (допущение: размер по умолчанию вики не называет, у нас прежние три клетки)', () => {
    for (const [id, pairs] of [['pong', [[0, 1], [4, 5], [8, 9], [12, 13]]], ['pneumatic-ball', [[0, 1], [4, 5]]]] as const) {
      for (const [plain, three] of pairs) {
        const def = LIBRARY_GAMES[id];
        expect(def.create({ seed: 3, mode: three }).cells(), `${id}: ${three + 1}`).toEqual(def.create({ seed: 3, mode: plain }).cells());
        expect(fingerprint(def.create({ seed: 7, mode: three }), 7), `${id}: ${three + 1}`).toBe(fingerprint(def.create({ seed: 7, mode: plain }), 7));
      }
    }
  });

  it('Pong «both»: вратарь ходит от края до края своей ширины; у Pneumatic Ball вратарь всегда три клетки', () => {
    const range = (g: BallGame): [number, number] => {
      let low = g.guard;
      let high = g.guard;
      for (let t = 0; t < 600; t++) {
        g.balls = [ball(1, 15, 1, 1)]; // мяч держим вдали от кирпичей и ракеток
        g.step(IDLE);
        low = Math.min(low, g.guard);
        high = Math.max(high, g.guard);
      }
      return [low, high];
    };
    for (const size of [1, 2, 3]) expect(range(pong(size, { speed: 10 })), `Pong, размер ${paddleOf(size)}`).toEqual([0, 10 - paddleOf(size)]);
    for (const size of [0, 1, 2, 3]) expect(range(pneumatic(size, { speed: 10 })), `Pneumatic, размер ${paddleOf(size)}`).toEqual([0, 7]);
  });

  it('отскок: у платформы из двух клеток каждая бьёт в свою сторону, из одной — как центр трёхклеточной (удержание ROTATE меняет сторону)', () => {
    for (const make of [(mode: number) => pong(mode), (mode: number) => pneumatic(mode)]) {
      const rebound = (mode: number, b: Ball, input: BrickInput = IDLE): Ball => {
        const g = make(mode);
        g.x = 3; // платформа начинается в колонке 3
        g.balls = [b];
        ballStep(g, input);
        expect(g.lives, 'мяч отбит, жизнь цела').toBe(4);
        expect(g.balls).toHaveLength(1);
        return g.balls[0]!;
      };
      // две клетки: колонки 3 и 4
      expect(rebound(2, ball(2, 17, 1, 1))).toMatchObject({ dx: -1, dy: -1 }); // в левую клетку — влево
      expect(rebound(2, ball(5, 17, -1, 1))).toMatchObject({ dx: 1, dy: -1 }); // в правую — вправо
      expect(rebound(2, ball(2, 17, 1, 1), holding('rotate'))).toMatchObject({ dx: -1, dy: -1 }); // у краёв ROTATE ничего не меняет
      // одна клетка: колонка 3
      expect(rebound(3, ball(2, 17, 1, 1))).toMatchObject({ dx: 1, dy: -1 });
      expect(rebound(3, ball(4, 17, -1, 1))).toMatchObject({ dx: -1, dy: -1 });
      expect(rebound(3, ball(2, 17, 1, 1), holding('rotate'))).toMatchObject({ dx: -1, dy: -1 });
      expect(rebound(3, ball(4, 17, -1, 1), holding('rotate'))).toMatchObject({ dx: 1, dy: -1 });
    }
  });

  it('промах мимо узкой платформы: у Pong — потеря жизни, у Pneumatic Ball — без штрафа; подача удержанием ROTATE идёт от середины платформы', () => {
    for (const size of [2, 3]) {
      const g = pong(size);
      g.x = 3; // платформа в колонках 3–4 или в одной колонке 3
      g.balls = [ball(9, 17, 1, 1)]; // отскок от правой стены и шаг в колонку 8 — мимо платформы
      expect(ballStep(g)).toContainEqual({ type: 'lifeLost' });
      expect(g.lives).toBe(3);
      const p = pneumatic(size);
      p.x = 3;
      p.balls = [ball(9, 17, 1, 1)];
      const events = ballStep(p);
      expect(count(events, 'lifeLost')).toBe(0);
      expect(p.lives).toBe(4);
      expect(p.balls).toHaveLength(0);
      p.step(holding('rotate'));
      expect(p.balls).toEqual([ball(p.x + Math.floor(paddleOf(size) / 2), 17, 0, -1)]);
    }
  });
});

describe('Pong «Brick move»: стенка из кирпичей едет вбок', () => {
  /** Самая левая колонка кирпичей в каждом такте; мяч каждый такт возвращается на безопасное место (кирпичи его не касаются). */
  function leftEdge(mode: number, ticks: number): number[] {
    const g = pong(mode, { speed: 1 });
    const edges: number[] = [];
    for (let t = 0; t < ticks; t++) {
      g.balls = [ball(1, 15, 1, 1)];
      g.step(IDLE);
      expect(g.bricks.size, `такт ${t}`).toBe(12);
      edges.push(Math.min(...[...g.bricks].map((cell) => cell % BRICK_COLS)));
    }
    return edges;
  }

  it('варианты 09–16 (Brick move): раз в 24 такта на клетку вправо до края, потом влево и обратно; в остальных вариантах стенка стоит', () => {
    for (let mode = 0; mode < 16; mode++) {
      const edges = leftEdge(mode, 24 * 14);
      if ((mode & 8) === 0) {
        expect(new Set(edges), `вариант ${mode + 1}: стенка стоит`).toEqual(new Set([2]));
        continue;
      }
      // сдвиг ровно в такты, кратные 24; соседние значения различаются на одну клетку
      edges.forEach((edge, t) => {
        const previous = edges[t - 1] ?? 2;
        if ((t + 1) % 24 === 0) expect(Math.abs(edge - previous), `вариант ${mode + 1}, такт ${t + 1}`).toBe(1);
        else expect(edge, `вариант ${mode + 1}, такт ${t + 1}`).toBe(previous);
      });
      const steps = edges.filter((_, t) => (t + 1) % 24 === 0);
      expect(steps.slice(0, 8), `вариант ${mode + 1}`).toEqual([3, 4, 3, 2, 1, 0, 1, 2]); // стенка 6 кл. упирается в правый край (колонка 9) и в левый (колонка 0)
      expect(Math.min(...steps)).toBe(0);
      expect(Math.max(...steps)).toBe(4);
    }
  });

  it('сдвинутые кирпичи настоящие: мяч разбивает кирпич в клетке, где до сдвига кирпича не было, и получает +5; сам уровень разбитая стенка не открывает', () => {
    const g = pong(8, { speed: 1 });
    until(g, () => Math.min(...[...g.bricks].map((cell) => cell % BRICK_COLS)) === 3, 30); // первый сдвиг: колонки 3–8
    expect(g.bricks.has(9 * BRICK_COLS + 8)).toBe(true);
    g.balls = [ball(7, 10, 1, -1)]; // следующий шаг — в клетку (8, 9)
    const events = ballStep(g);
    expect(events).toContainEqual({ type: 'hit' });
    expect(g.score).toBe(5);
    expect(g.bricks.has(9 * BRICK_COLS + 8)).toBe(false);
    expect(g.bricks.size).toBe(11);
    expect(g.balls[0]).toMatchObject({ dy: 1 });
  });

  it('стенка едет и неполной: оставшиеся кирпичи сохраняют взаимное положение, у края стенка разворачивается по крайнему из оставшихся', () => {
    const g = pong(8, { speed: 1 });
    g.bricks = new Set([8 * BRICK_COLS + 7, 9 * BRICK_COLS + 8, 9 * BRICK_COLS + 9]); // правый кирпич уже у края
    g.balls = [ball(1, 15, 1, 1)];
    until(g, () => g.bricks.has(8 * BRICK_COLS + 6), 30); // первый сдвиг идёт влево: правый кирпич стоит в колонке 9
    expect([...g.bricks].sort((a, b) => a - b)).toEqual([8 * BRICK_COLS + 6, 9 * BRICK_COLS + 7, 9 * BRICK_COLS + 8]);
  });

  it('у остальных игр с кирпичами стенка стоит (arkanoid-dots), у Pong «Two balls» кирпичей нет', () => {
    const dots = new BallGame('arkanoid-dots', { seed: 3 });
    dots.start();
    const before = [...dots.bricks].sort((a, b) => a - b);
    for (let t = 0; t < 100; t++) {
      dots.balls = [ball(1, 15, 1, 1)];
      dots.step(IDLE);
    }
    expect([...dots.bricks].sort((a, b) => a - b)).toEqual(before);
  });
});

// ── сценарии: Pneumatic Ball и Pong ──────────────────────────────────────────────────────────────────────────────────────────────

describe('Pong, все 16 вариантов: прогресс и неудача', () => {
  for (let mode = 0; mode < 16; mode++) {
    it(`[pong · вариант ${mode + 1} · прогресс] гол в верхнюю зону +10 и новая подача; пять голов — +100 и следующий уровень со стенкой на месте`, () => {
      const g = pong(mode);
      const serve = ball(g.x + Math.floor(paddleOf(mode & 3) / 2), 17, 1, -1);
      for (let goal = 1; goal <= 4; goal++) {
        stageGoal(g);
        expect(count(ballStep(g), 'win'), `гол ${goal}`).toBe(0);
        expect(g.score).toBe(10 * goal);
        expect(g.balls, 'новая подача').toEqual([serve]);
        expect(g.lives).toBe(4);
      }
      stageGoal(g);
      expect(ballStep(g)).toContainEqual({ type: 'win' });
      expect(g.score).toBe(150);
      until(g, () => g.level === 2, 100);
      expect(g.bricks.size).toBe(12);
      expect([...g.bricks].every((cell) => cell % BRICK_COLS >= 2 && cell % BRICK_COLS <= 7), 'стенка встала на прежнее место').toBe(true);
      expect(g.balls).toEqual([serve]);
    });

    it(`[pong · вариант ${mode + 1} · неудача] мяч мимо платформы — потеря жизни, четвёртая — конец партии; очки и рекорд сохраняются`, () => {
      const g = pong(mode);
      g.balls = [ball(4, 10, 1, -1)];
      ballStep(g); // кирпич: +5
      expect(g.score).toBe(5);
      for (let n = 1; n <= 4; n++) {
        g.balls = [ball(9, 17, 1, 1)]; // следующий шаг — колонка 8, платформа (3–6) далеко
        const events = ballStep(g);
        expect(count(events, 'lifeLost')).toBe(1);
        expect(g.lives).toBe(4 - n);
        expect(count(events, 'gameOver')).toBe(n === 4 ? 1 : 0);
        if (n < 4) settle(g);
      }
      expectFinished(g);
      expect(g.score).toBe(5);
      expect(g.hiScore).toBe(5);
    });
  }
});

describe('Pneumatic Ball, все 8 вариантов: прогресс и неудача', () => {
  for (let mode = 0; mode < 8; mode++) {
    it(`[pneumatic-ball · вариант ${mode + 1} · прогресс] гол мимо вратаря +10; пять голов — +100 и следующий уровень; новый мяч подаётся удержанием ROTATE`, () => {
      const g = pneumatic(mode);
      for (let goal = 1; goal <= 4; goal++) {
        stageGoal(g);
        ballStep(g);
        expect(g.score).toBe(10 * goal);
        expect(g.balls, 'мяч ушёл за вратаря').toHaveLength(0);
        g.step(holding('rotate'));
        expect(g.balls).toHaveLength(1);
      }
      stageGoal(g);
      expect(ballStep(g)).toContainEqual({ type: 'win' });
      expect(g.score).toBe(150);
      until(g, () => g.level === 2, 100);
      expect(g.lives).toBe(4);
    });

    it(`[pneumatic-ball · вариант ${mode + 1} · неудача] промах не стоит жизни и не кончает партию; мяча нет, пока не удержана кнопка`, () => {
      const g = pneumatic(mode);
      for (let n = 0; n < 6; n++) {
        g.balls = [ball(9, 17, 1, 1)];
        const events = ballStep(g);
        expect(count(events, 'lifeLost') + count(events, 'gameOver')).toBe(0);
        expect(g.balls).toHaveLength(0);
        expect(count(run(g, 40), 'lifeLost')).toBe(0);
        expect(g.balls, 'без кнопки нового мяча нет').toHaveLength(0);
        g.step(holding('rotate'));
        expect(g.balls).toHaveLength(1);
      }
      expect(g.lives).toBe(4);
      expect(g.phase).toBe('playing');
    });
  }
});

// ── Little Honeybee ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('Little Honeybee: диагональ, два ствола, «вверх дном»', () => {
  const bee = (mode: number, speed = 1, seed = 3): ShooterGame => {
    const g = new ShooterGame('honeybee', { seed, speed, mode });
    g.start();
    return g;
  };
  const shape = (g: ShooterGame): string => g.targets.map((p) => `${p.x},${p.y}`).sort().join(' ');
  const start = bee(0);
  const START_SHAPE = shape(start);
  const FIGURE_CELLS = start.targets.length;

  it('признаки по номеру вики: бит 0 — диагональ, бит 1 — вверх дном, бит 2 — два ствола (Mode 1–8)', () => {
    expect(Array.from({ length: 8 }, (_, mode) => bee(mode).diagonal)).toEqual([false, true, false, true, false, true, false, true]);
    expect(Array.from({ length: 8 }, (_, mode) => bee(mode).twin)).toEqual([false, false, false, false, true, true, true, true]);
    // «вверх дном»: основание пушки — строка 18 обычного кадра и строка 1 перевёрнутого (варианты 03, 04, 07, 08)
    for (const mode of [0, 1, 4, 5]) expect([litCount(bee(mode), 1), litCount(bee(mode), 18)], `вариант ${mode + 1}`).toEqual([0, 3]);
    for (const mode of [2, 3, 6, 7]) expect([litCount(bee(mode), 1), litCount(bee(mode), 18)], `вариант ${mode + 1}`).toEqual([3, 0]);
  });

  it('без «Brick move diagonally» фигура стоит на месте; с ним — на клетку вбок и на ряд вниз каждые 90 тактов (скорость 1) или 30 (скорость 10)', () => {
    for (const mode of [0, 2, 4, 6]) {
      const g = bee(mode, 10);
      expect(shape(g)).toBe(START_SHAPE);
      expect(FIGURE_CELLS).toBe(16);
    }
    for (const [speed, period] of [[1, 90], [10, 30]] as const) {
      // одна клетка-цель и пушка у левого края: ответные выстрелы и стрельба не мешают измерению шага
      const g = bee(1, speed);
      g.targets = [{ x: 4, y: 3 }];
      g.x = 0;
      let x = 4;
      let y = 3;
      let direction = 1;
      for (let step = 1; step <= 8; step++) {
        run(g, period - 1);
        expect([g.targets[0]!.x, g.targets[0]!.y], `скорость ${speed}, шаг ${step}: за такт до сдвига`).toEqual([x, y]);
        run(g, 1);
        if (x + direction > 9 || x + direction < 0) direction = -direction; // у боковой стены направление меняется
        x += direction;
        y += 1;
        expect([g.targets[0]!.x, g.targets[0]!.y], `скорость ${speed}, шаг ${step}`).toEqual([x, y]);
      }
      expect(g.lives).toBe(4);
    }
  });

  it('[honeybee · вариант 02 · неудача] фигура, дошедшая по диагонали до пушки, отнимает жизнь; после сценки поле начинается заново', () => {
    const g = bee(1, 10);
    g.targets = [{ x: 9, y: 16 }]; // у правой стены: первый шаг разворачивает вбок (8, 17), второй доводит до ряда пушки (7, 18)
    g.x = 0; // ответные выстрелы падают в колонках 7–9 и пушку у левого края не задевают
    const events: BrickEvent[] = [];
    let ticks = 0;
    while (g.lives === 4 && ticks < 200) {
      events.push(...g.step(IDLE));
      ticks++;
    }
    expect(ticks, 'два шага по 30 тактов на скорости 10').toBe(60);
    expect(count(events, 'lifeLost')).toBe(1);
    expect(g.targets[0]).toEqual({ x: 7, y: 18 });
    settle(g);
    expect(shape(g), 'поле повторено').toBe(START_SHAPE);
    expect(g.lives).toBe(3);
    expect(g.phase).toBe('playing');
  });

  it('два ствола: каждый выстрел — две пули из колонок x − 1 и x + 1; у левого края пуля одна; рисунок — два «дула» над основанием', () => {
    for (const mode of [4, 5, 6, 7]) {
      const g = bee(mode);
      g.x = 4;
      const inverted = (mode & 2) !== 0; // в перевёрнутых вариантах строки кадра зеркальны: 17 → 2, 18 → 1
      const row = (y: number): number[] => Array.from({ length: 10 }, (_, x) => lit(g, x, y));
      expect(row(inverted ? 2 : 17), `вариант ${mode + 1}: дула`).toEqual([0, 0, 0, 2, 0, 2, 0, 0, 0, 0]);
      expect(row(inverted ? 1 : 18), `вариант ${mode + 1}: основание`).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0, 0]);
      expect(has(g.step(makeBrickInput(['rotate'])), 'shot')).toBe(true);
      expect(g.bullets.filter((b) => !b.enemy).map((b) => b.x).sort()).toEqual([3, 5]);
      const edge = bee(mode);
      edge.x = 0;
      edge.step(makeBrickInput(['rotate']));
      expect(edge.bullets.filter((b) => !b.enemy).map((b) => b.x)).toEqual([1]);
      const right = bee(mode);
      right.x = 8;
      right.step(makeBrickInput(['rotate']));
      expect(right.bullets.filter((b) => !b.enemy).map((b) => b.x).sort()).toEqual([7, 9]);
    }
    for (const mode of [0, 1, 2, 3]) {
      const g = bee(mode);
      g.step(makeBrickInput(['rotate']));
      expect(g.bullets.map((b) => b.x), `вариант ${mode + 1}: один ствол по центру`).toEqual([4]);
    }
  });

  it('[honeybee · вариант 05 · прогресс] два ствола сбивают клетки в соседних с центром колонках (+5 за каждую); фигура сбита — +100 и следующий уровень', () => {
    const g = bee(4);
    g.targets = [{ x: 2, y: 2 }, { x: 6, y: 2 }];
    const walk = (column: number): void => {
      for (let i = 0; i < 12 && g.x !== column; i++) tap(g, g.x < column ? 'right' : 'left');
    };
    walk(3); // стволы в колонках 2 и 4
    g.step(makeBrickInput(['rotate']));
    until(g, () => g.score === 5, 100);
    expect(g.targets).toEqual([{ x: 6, y: 2 }]);
    expect(g.bullets.filter((b) => !b.enemy), 'вторая пуля (колонка 4) летит дальше в пустоту').toHaveLength(1);
    walk(5); // стволы в колонках 4 и 6; ответный выстрел единственной клетки придёт позже, чем долетят пули
    g.step(makeBrickInput(['rotate']));
    const events = until(g, () => g.score >= 110, 120);
    expect(count(events, 'win')).toBe(1);
    expect(g.score).toBe(110);
    expect(g.lives).toBe(4);
    until(g, () => g.level === 2, 100);
    expect(shape(g)).toBe(START_SHAPE);
  });

  it('[honeybee · все варианты · прогресс] выстрел по клетке фигуры даёт +5 и снимает её (в вариантах с двумя стволами — по клетке в соседней колонке)', () => {
    for (let mode = 0; mode < 8; mode++) {
      const g = bee(mode);
      g.x = 4;
      const column = g.twin ? 5 : 4;
      g.targets = [{ x: column, y: 2 }, { x: 9, y: 2 }];
      g.step(makeBrickInput(['rotate']));
      until(g, () => g.score > 0, 100);
      expect(g.score, `вариант ${mode + 1}`).toBe(5);
      expect(g.targets, `вариант ${mode + 1}`).toEqual([{ x: 9, y: 2 }]);
    }
  });

  it('[honeybee · все варианты · неудача] ответный выстрел, дошедший до пушки, отнимает жизнь; последняя жизнь — конец партии, рекорд сохраняется', () => {
    for (let mode = 0; mode < 8; mode++) {
      const g = bee(mode);
      g.x = 4;
      g.bullets.push({ x: 4, y: 17, enemy: true });
      until(g, () => g.lives === 3, 20);
      settle(g);
      expect(g.phase).toBe('playing');
      g.lives = 1;
      g.bullets.push({ x: g.x, y: 17, enemy: true });
      const events = until(g, () => g.lives === 0, 20);
      expect(count(events, 'gameOver'), `вариант ${mode + 1}`).toBe(1);
      expectFinished(g);
    }
  });
});

// ── Snake: Frame ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('Snake: вариант 02 «Frame»', () => {
  const snake = (mode: number, seed = 1): SnakeGame => {
    const g = new SnakeGame({ seed, mode });
    g.start();
    return g;
  };
  const onRing = (p: number): boolean => {
    const x = p % 10;
    const y = Math.floor(p / 10);
    return x === 0 || x === 9 || y === 0 || y === 19;
  };

  it('рамка в одну клетку по периметру горит (56 клеток), плод никогда не попадает на неё; в варианте 01 рамки и стен нет', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const g = snake(1, seed);
      const ring = Array.from({ length: 200 }, (_, p) => p).filter(onRing);
      expect(ring).toHaveLength(56);
      expect([...g.walls].sort((a, b) => a - b)).toEqual(ring);
      for (const p of ring) expect(g.cells()[p], `зерно ${seed}, клетка ${p}`).toBe(1);
      expect(onRing(g.food), `зерно ${seed}: плод на рамке`).toBe(false);
      expect(g.body.some(onRing)).toBe(false);
      expect(Array.from(g.cells()).filter(Boolean).length).toBe(56 + 3 + 1); // рамка, змейка из трёх клеток и плод
    }
    expect(snake(0).walls.size).toBe(0);
  });

  it('рамка уменьшает безопасный путь вправо; ROTATE не добавляет ускорение', () => {
    for(const [mode,steps] of [[0,5],[1,4]] as const){const g=snake(mode);g.food=20;for(let n=1;n<steps;n++){g.step(makeBrickInput(['right']));expect(g.lives).toBe(4);}g.step(makeBrickInput(['right']));expect(g.lives).toBe(3);}
  });
  it('рамка остаётся на следующих полях, выдуманные перегородки с уровнем не появляются', () => {
    const g=snake(1);g.food=175;g.eaten=12;g.step(makeBrickInput(['up']));expect(g.score).toBe(110);run(g,60);expect(g.level).toBe(2);expect(g.walls.size).toBe(56);expect(g.body.some(onRing)).toBe(false);expect(onRing(g.food)).toBe(false);
  });
});

// ── Dancing Game, Obstacles Race, Quarth: сценарии вариантов «вверх дном» ───────────────────────────────────────────────────────────

describe('Dancing Game, вариант 02: поле вверх дном', () => {
  const dance = (mode: number): PadsGame => {
    const g = new PadsGame('dance', { seed: 2, speed: 10, mode });
    g.start();
    return g;
  };

  it('площадки вверху (строка 1), ноты идут снизу вверх: у ноты «вниз» мигает головная клетка, под ней — след', () => {
    const g = dance(1);
    expect([0, 1, 2, 3].map((i) => lit(g, i * 2 + 1, 1))).toEqual([1, 1, 1, 1]);
    expect(litCount(g, 18)).toBe(0);
    g.notes = [{ direction: 2, y: 10 }]; // ряд 10 игры — строка 9 экрана
    expect([lit(g, 5, 9), lit(g, 5, 10)]).toEqual([2, 1]);
    const before = g.notes[0]!.y;
    until(g, () => g.notes[0]!.y > before, 40);
    expect(lit(g, 5, 19 - g.notes[0]!.y), 'нота поднялась на экране').toBe(2);
  });

  for (const mode of [0, 1]) {
    it(`[dance · вариант ${mode + 1} · прогресс] десять нот по +10 и тону дорожки, затем +100 и уровень 2`, () => {
      const g = dance(mode);
      const events: BrickEvent[] = [];
      const pressed: number[] = [];
      for (let t = 0; t < 700 && count(events, 'win') === 0; t++) {
        const note = g.notes.find((n) => n.y === 16);
        events.push(...g.step(note ? makeBrickInput([physical(KEYS[note.direction]!, mode === 1)]) : IDLE));
        if (note) pressed.push(note.direction);
      }
      expect(count(events, 'lifeLost')).toBe(0);
      expect(pressed).toHaveLength(10);
      expect(events.flatMap((e) => (e.type === 'tone' ? [e.pad] : []))).toEqual(pressed);
      expect(g.score).toBe(200);
      until(g, () => g.level === 2, 100);
      expect(g.notes).toEqual([]);
    });

    it(`[dance · вариант ${mode + 1} · неудача] четыре пропущенные ноты — конец игры; очки остаются рекордом`, () => {
      const g = dance(mode);
      g.notes = [{ direction: 1, y: 17 }];
      tap(g, physical('right', mode === 1));
      expect(g.score).toBe(10);
      for (let n = 1; n <= 4; n++) {
        g.notes = [{ direction: 0, y: 19 }];
        const events = until(g, () => g.lives === 4 - n, 40);
        expect(count(events, 'lifeLost')).toBe(1);
        expect(count(events, 'gameOver')).toBe(n === 4 ? 1 : 0);
        if (n < 4) settle(g);
      }
      expectFinished(g);
      expect(g.hiScore).toBe(10);
    });
  }
});

describe('Obstacles Race, вариант 02: поле вверх дном', () => {
  const race = (mode: number, seed = 1): RoadGame => {
    const g = new RoadGame('obstacle-race', { seed, mode });
    g.start();
    return g;
  };

  it('машина вверху: на экране её клетки в строках 0–2, коридор трассы — те же колонки', () => {
    const g = race(1);
    expect([lit(g, 4, 2), lit(g, 4, 1), lit(g, 3, 0), lit(g, 5, 0)]).toEqual([2, 1, 1, 1]); // нос — клетка (4, 17) обычной игры, строка 2 на экране
    for (let y = 3; y < 20; y++) expect([lit(g, 2, y), lit(g, 8, y)], `строка ${y}`).toEqual([1, 1]);
    expect(lit(g, 5, 10)).toBe(0);
  });

  it('[obstacle-race · вариант 02 · прогресс] тридцать шагов дороги без аварий — +1 за шаг, затем +100 и уровень 2; газ — кнопка ↓', () => {
    const make = (): RoadGame => race(1);
    const found = findSafePath(make(), { horizon: 400, stride: 2, alwaysHeld: ['down'], moves: [['left'], ['right']] });
    expect(found.found, 'существует маршрут без потери жизни').toBe(true);
    expect(found.won).toBe(true);
    const g = make();
    const events: BrickEvent[] = [];
    for (let t = 0; t < found.steps.length * 2 && count(events, 'win') === 0; t++) {
      const move = t % 2 === 0 ? ([null, 'left', 'right'] as const)[found.steps[t / 2]!] : null;
      events.push(...g.step(makeBrickInput(move ? [move] : [], ['down'])));
    }
    expect(count(events, 'win')).toBe(1);
    expect(count(events, 'lifeLost')).toBe(0);
    expect(g.score).toBe(30 + 100);
    until(g, () => g.level === 2, 200);
    expect(g.lives).toBe(4);
    expect(g.road.every((v) => v === 2)).toBe(true);
  });

  it('[obstacle-race · вариант 02 · неудача] съезд на стенку отнимает жизнь; четыре аварии — конец партии, рекорд сохраняется', () => {
    const g = race(1);
    for (let n = 1; n <= 4; n++) {
      const events: BrickEvent[] = [];
      for (let i = 0; i < 6 && g.lives === 5 - n; i++) events.push(...tap(g, 'left')); // из пяти свободных клеток безопасны три положения: первый же шаг влево задевает стенку
      expect(count(events, 'lifeLost'), `авария ${n}`).toBe(1);
      expect(g.lives).toBe(4 - n);
      expect(count(events, 'gameOver')).toBe(n === 4 ? 1 : 0);
      if (n < 4) settle(g);
    }
    expectFinished(g);
  });
});

describe('Quarth, вариант 02: поле вверх дном', () => {
  const quarth = (mode: number, options: { level?: number; speed?: number } = {}): QuarthGame => {
    const g = new QuarthGame({ seed: 3, mode, ...options });
    g.start();
    return g;
  };
  /** План выстрелов уровня: для каждой колонки — сколько клеток не хватает до прямоугольника (сначала нижние силуэты). */
  const plan = (level: number): { x: number; shots: number }[] =>
    [...QUARTH_LEVELS[level - 1]!].sort((a, b) => b.top + Math.max(...b.heights) - (a.top + Math.max(...a.heights))).flatMap((piece) => {
      const tall = Math.max(...piece.heights);
      return piece.heights.map((h, i) => ({ x: piece.x + i, shots: tall - h })).filter((s) => s.shots > 0);
    });

  it('пушка вверху (строки 0–1), силуэт подступает снизу: кадр — зеркало обычного варианта', () => {
    const g = quarth(1);
    expect(litCount(g, 0)).toBe(3);
    expect(litCount(g, 1)).toBe(1);
    expect(litCount(g, 19)).toBe(0);
    expect(g.cells()).toEqual(flipRows(quarth(0).cells()));
  });

  for (const mode of [0, 1]) {
    it(`[quarth · вариант ${mode + 1} · прогресс] планы выстрелов первых четырёх уровней проходятся без потери жизни: силуэт убран, победа`, () => {
      for (let level = 1; level <= 4; level++) {
        const g = quarth(mode, { level, speed: 5 });
        const events: BrickEvent[] = [];
        for (const { x, shots } of plan(level)) {
          for (let s = 0; s < shots; s++) {
            while (g.x !== x) events.push(...tap(g, g.x < x ? 'right' : 'left'));
            events.push(...g.step(makeBrickInput(['rotate'])));
            events.push(...run(g, 12));
          }
        }
        expect(count(events, 'win'), `уровень ${level}`).toBe(1);
        expect(g.lives).toBe(4);
      }
    });

    it(`[quarth · вариант ${mode + 1} · неудача] если не стрелять, силуэт спускается до пушки и отнимает жизнь; четыре раза — конец партии`, () => {
      const g = quarth(mode, { speed: 10 });
      for (let n = 1; n <= 4; n++) {
        const events = until(g, () => g.lives === 4 - n, 2000);
        expect(count(events, 'lifeLost')).toBe(1);
        expect(count(events, 'gameOver')).toBe(n === 4 ? 1 : 0);
        if (n < 4) settle(g);
      }
      expectFinished(g);
    });
  }
});
