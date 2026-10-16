/**
 * Игра 6 консоли «168 в 1 танк»: «Стрельба по фигурам / достройка фигур» (`id: 'shapes'`).
 *
 * Донор — только частичный: механика пушки, пуль, жизней, скорости и уровней взята из `GunGame` / `GameWithGun` / `GameWithLives`
 * (общий код — в `games/gun/`), а правил самой игры в доноре нет. Их источник — описание владельца другого Brick Game (MT1997, «Чапай»,
 * hipilion.livejournal.com/29802.html): «4 варианта: 2 на отстрел фигур и 2 на достройку фигур до прямоугольников, с движением в бок и
 * без него» и сравнение (…/24635.html): «не расстреливать фигуры, летящие сверху, а достраивать их до прямоугольных форм, после чего они
 * исчезали сами; чем больше прямоугольник, тем больше очков». Всё остальное — допущения (отмечены словом «допущение»):
 * - фигуры: семь тетрамино (разрушение) и «висячие» столбики разной высоты с выровненным верхом (достройка); новая фигура появляется
 *   сверху случайно, каждые 5 шагов спуска, а если поле расчищено — на ближайшем шаге (не ждать пустое поле); все фигуры опускаются
 *   вместе на ряд за шаг (обломки разрушенной фигуры тоже — отдельной «гравитации» у них нет) и не складываются в кучу;
 * - разрушение: пуля уничтожает первую клетку на пути (+1 очко); достройка: пуля останавливается под первой клеткой и добавляет клетку
 *   (+1 очко); связная группа клеток, ставшая сплошным прямоугольником, мигает и исчезает (+2 очка за клетку), группы соприкоснувшихся
 *   фигур считаются одной (объединение разрешено); пуля, не встретившая клетку, в достройке улетает;
 * - «движение в бок» — после каждого шага спуска всё поле на клетку сдвигается влево или вправо (случайно, без оборачивания);
 * - касание любой клеткой ряда ствола (ряд 1) — потеря жизни, как у стены донора; скорость спуска — 800 мс на скорости 1 и 300 мс на
 *   скорости 10; на уровне стартует столько фигур, сколько уровней по четыре (1..3); скорость растёт каждые 100 очков;
 * - «подмога» (вторая пушка за потерянную жизнь) и вишенки-награды MT1997 не восстановлены.
 */
import { spriteWidth } from '../grid';
import { CELL_BLINK, BRICK_COLS, type BrickGameDef, type BrickGameOptions, type BrickModeDef } from '../types';
import { Countdown, genuineTicks, msToTicks } from '../timing';
import { findRectangle, placeFigure, randomHanging, randomTetromino } from './gun/figures';
import { GunGameBase, type GunGameConfig } from './gun/gunGame';
import { TOP_ROW } from './gun/space';

// ---------------------------------------------------------------- допущения (скорость и очки)

/** Допущение: шаг спуска фигур в мс на скорости 1 и 10. */
export const DESCENT_FIRST_MS = 800;
export const DESCENT_TENTH_MS = 300;
/** Допущение: новая фигура появляется каждые столько шагов спуска или сразу на ближайшем шаге, если поле расчищено. */
export const SPAWN_EVERY = 5;
/** Допущение: на уровне стартует `ceil(уровень / 4)` фигур, но не больше трёх. */
export const START_FIGURES_PER_LEVEL = 4;
export const START_FIGURES_MAX = 3;
/** Допущение: очков на следующую скорость и на добавочную жизнь (в доноре — 500 и 10000 для стены). */
export const SPEED_STEP_SCORE = 100;
export const EXTRA_LIFE_SCORE = 2000;
/** Очки: клетка, уничтоженная или добавленная пулей (`removeCell` / `addCell` донора), и клетка исчезнувшего прямоугольника (допущение). */
export const CELL_POINTS = 1;
export const RECTANGLE_CELL_POINTS = 2;
/** Допущение: достроенный прямоугольник мигает 0,4 с и исчезает. */
export const VANISH_TICKS = msToTicks(400);

// ---------------------------------------------------------------- варианты

interface ShapesTraits {
  /** Достройка до прямоугольников (иначе разрушение фигур). */
  readonly building: boolean;
  /** «Движение в бок»: поле сдвигается после каждого шага спуска. */
  readonly shifting: boolean;
}

const TRAITS: readonly ShapesTraits[] = [
  { building: false, shifting: false },
  { building: false, shifting: true },
  { building: true, shifting: false },
  { building: true, shifting: true },
];

const CONFIGS: readonly GunGameConfig[] = TRAITS.map((traits) => ({
  barrels: 1,
  inverted: false,
  shifting: traits.shifting,
  autoRepeat: true,
  speedStepScore: SPEED_STEP_SCORE,
  extraLifeScore: EXTRA_LIFE_SCORE,
}));

export const SHAPES_MODES: readonly BrickModeDef[] = [
  {
    name: { ru: 'Отстрел фигур', en: 'Shoot the shapes' },
    note:
      'Источник: описание MT1997 («отстрел фигур»). Пуля уничтожает первую клетку на пути. Фигуры — тетрамино, спускаются вместе; ' +
      'правила, очки и скорость — допущение. Механика пушки — донор (GunGame, режим уничтожения клеток).',
  },
  {
    name: { ru: 'Отстрел фигур, движение в бок', en: 'Shoot the shapes, sideways' },
    note:
      'Как вариант 01, но после каждого шага спуска всё поле сдвигается на клетку влево или вправо (случайно, без оборачивания): ' +
      'в MT1997 «с движением в бок и без», что именно движется — допущение (у донора сдвиг поля — isShiftingBoard).',
  },
  {
    name: { ru: 'Достройка до прямоугольников', en: 'Complete the rectangles' },
    note:
      'Источник: описание MT1997 («достройка фигур до прямоугольников, после чего они исчезают; чем больше, тем больше очков»). ' +
      'Пуля встаёт под первую клетку и добавляет клетку; сплошной прямоугольник исчезает. Фигуры, очки, объединение — допущение. ' +
      'Механика пули — донор (GunGame, режим создания клеток).',
  },
  {
    name: { ru: 'Достройка, движение в бок', en: 'Complete the rectangles, sideways' },
    note:
      'Как вариант 03, но после каждого шага спуска всё поле сдвигается на клетку влево или вправо (случайно, без оборачивания): ' +
      'что именно «движется в бок» в MT1997 — допущение.',
  },
];

// ---------------------------------------------------------------- игра

export class ShapesGame extends GunGameBase {
  readonly id = 'shapes';
  /** Достройка (иначе разрушение). */
  private readonly building: boolean;
  /** Таймер спуска фигур (открыт для тестов). */
  readonly descentClock = new Countdown(1);
  /** Шагов спуска с появления последней фигуры. */
  private sinceSpawn = 0;
  /** Клетки достроенного прямоугольника, который сейчас мигает перед исчезновением. */
  private vanishing: readonly number[] | null = null;

  constructor(options: BrickGameOptions = {}) {
    super(options, CONFIGS);
    this.building = TRAITS[this.mode]?.building ?? false;
    this.init();
  }

  protected resetRules(): void {
    this.sinceSpawn = 0;
    this.vanishing = null;
    this.descentClock.reset(this.descentTicks());
  }

  private descentTicks(): number {
    return genuineTicks(this.speed, DESCENT_FIRST_MS, DESCENT_TENTH_MS);
  }

  /** Стартовые фигуры: на уровне 1..4 одна, 5..8 две, 9..10 три; новая и предыдущие стоят друг от друга через `SPAWN_EVERY` рядов. */
  protected override prepareLevel(): void {
    this.vanishing = null;
    const count = Math.min(START_FIGURES_MAX, Math.ceil(this.level / START_FIGURES_PER_LEVEL));
    for (let age = count - 1; age >= 0; age--) this.spawnFigure(TOP_ROW - SPAWN_EVERY * age);
    this.sinceSpawn = 0;
  }

  protected buildLevel(): void {
    // фигуры уже стоят: на уровне они появляются сразу, «мелодия» только ждёт
  }

  protected levelStarted(): void {
    this.descentClock.reset(this.descentTicks());
  }

  protected extraControls(): void {
    // других кнопок, кроме пушки и огня, нет
  }

  protected advance(): void {
    this.descentClock.period = this.descentTicks();
    if (this.descentClock.fire()) this.descend();
  }

  /** Шаг спуска: всё опускается на ряд; в вариантах «в бок» — сдвиг; клетка в ряду ствола — потеря жизни; пора — новая фигура. */
  private descend(): void {
    this.space.pushTowardGun();
    const crashed = this.space.rowCount(0) + this.space.rowCount(1) > 0;
    if (this.config.shifting) this.drift();
    if (crashed) {
      this.lose();
      return;
    }
    this.sinceSpawn++;
    if (this.sinceSpawn >= SPAWN_EVERY || this.space.total() === 0) {
      this.spawnFigure(TOP_ROW);
      this.sinceSpawn = 0;
    }
  }

  /** Допущение: сдвиг всего поля на клетку в случайную сторону; у края — в другую, если и там нельзя — остаётся на месте. */
  private drift(): void {
    const range = this.space.columnRange();
    if (!range) return;
    const preferLeft = this.rng.chance(0.5);
    const canLeft = range.min > 0;
    const canRight = range.max < BRICK_COLS - 1;
    const first = preferLeft ? -1 : 1;
    const canFirst = preferLeft ? canLeft : canRight;
    const canSecond = preferLeft ? canRight : canLeft;
    if (canFirst) this.space.shiftColumns(first);
    else if (canSecond) this.space.shiftColumns(-first);
  }

  /** Новая фигура: вверху поля, в случайной колонке (допущение: тетрамино для разрушения, «висячие» столбики для достройки). */
  private spawnFigure(topY: number): void {
    const sprite = this.building ? randomHanging(this.rng) : randomTetromino(this.rng);
    const x = this.rng.range(0, BRICK_COLS - spriteWidth(sprite));
    placeFigure(this.space, sprite, x, topY);
  }

  protected flight(): void {
    const solid = (x: number, y: number): boolean => this.space.get(x, y) !== 0;
    if (this.building) {
      this.bullets.flyCreating({
        solid,
        blocked: (x, y) => solid(x, y) || this.gun.covers(x, y),
        ceiling: false,
        create: (x, y) => this.attachCell(x, y),
      });
    } else {
      this.bullets.flyDestroying({ solid, destroy: (x, y) => this.shootCell(x, y) });
    }
  }

  /** Разрушение: пуля уничтожила клетку (x, y), +1 очко (`removeCell`). */
  private shootCell(x: number, y: number): boolean {
    this.space.set(x, y, 0);
    this.emit({ type: 'hit' });
    this.award(CELL_POINTS);
    return false;
  }

  /** Достройка: пуля добавила клетку (x, y), +1 очко (`addCell`); если группа стала прямоугольником, она исчезает. */
  private attachCell(x: number, y: number): boolean {
    this.space.set(x, y, 1);
    this.emit({ type: 'lock' });
    this.award(CELL_POINTS);
    const rectangle = findRectangle(this.space, x, y);
    if (!rectangle) return false;
    this.vanish(rectangle);
    return true;
  }

  /** Допущение: сплошной прямоугольник мигает и исчезает, очки — по числу его клеток (чем больше, тем больше); пули пропадают. */
  private vanish(cells: readonly number[]): void {
    this.bullets.clear();
    this.emit({ type: 'lines', count: 1 });
    this.vanishing = cells;
    this.cutscene(VANISH_TICKS, null, () => {
      for (const index of cells) this.space.cells[index] = 0;
      this.vanishing = null;
      this.award(cells.length * RECTANGLE_CELL_POINTS);
    });
  }

  protected decorate(buffer: Uint8Array): void {
    if (!this.vanishing) return;
    for (const index of this.vanishing) buffer[index] = CELL_BLINK;
  }
}

export const shapesDef: BrickGameDef = {
  id: 'shapes',
  declaredModes: null,
  modes: SHAPES_MODES,
  create: (options) => new ShapesGame(options),
};
