/**
 * Игра 7 консоли «168 в 1 танк»: «Стройка» (`id: 'construction'`).
 *
 * Правила — по донору, режим создания `GunGame` (`games/GunGame.java`, `games/GameWithGun.java`, `shapes/GunShape.java`,
 * `games/GameWithLives.java`, `games/GameUtils.java`): сверху висит стена из случайных рядов, каждый такт её таймера она опускается на
 * один ряд к пушке; пушка стреляет «грязью» — пуля летит вверх и останавливается перед первой клеткой стены (либо у верхнего края)
 * и становится клеткой стены (+1 очко). Заполненный ряд убирается (+10 очков): клетки гаснут от пушки к краям, а ряды между ним
 * и пушкой поднимаются на его место. Стена дошла до ряда над пушкой — потеря жизни.
 *
 * Донор — симулятор, а не прошивка Apollo. Что изменено при переносе:
 * - потоки и `sleep()` заменены тактовым автоматом (60 Гц, `msToTicks`); «мелодия» перед уровнем — сценка без ввода (≈ 90 тактов);
 * - всё считается в донорской системе координат (ряд 0 — у пушки), в строки экрана оно переводится только при рисовании;
 * - гонка потоков донора (мигающая клетка пули считалась «занятой» при проверке полного ряда) не воспроизводится;
 * - таймер спуска стены начинается заново с каждым уровнем (в доноре он не сбрасывался, и первый ряд мог упасть сразу);
 * - зажатая кнопка не повторяется: в создающем режиме донор снимает клавишу после каждого действия (кроме кнопки ускорения спуска).
 * Что допущено: из 16 вариантов `GunGame` здесь только восемь создающих (типы 5..8 и 13..16); их номера на Apollo неизвестны
 * (в `modes[].note` и в `docs/brick/construction.md` — донорский тип каждого). Всё, чего у донора нет, помечено словом «допущение».
 */
import { Countdown, Repeater, genuineTicks, msToTicks } from '../timing';
import { BRICK_COLS, type BrickGameDef, type BrickGameOptions, type BrickInput, type BrickModeDef } from '../types';
import { MOVE_TICKS } from './gun/gun';
import { GunGameBase, type GunGameConfig } from './gun/gunGame';
import { TOP_ROW } from './gun/space';

// ---------------------------------------------------------------- донорские числа

/** Шаг стены в мс на скорости 1 и 10 (`getSpeedOfFirstLevel/TenthLevel` в создающем режиме); у двух пушек шаг вдвое длиннее. */
export const DROP_FIRST_MS = 4500;
export const DROP_TENTH_MS = 2500;
/** Очков на следующую скорость (`SCORE_TO_NEXT_LEVEL`) и на добавочную жизнь (`getScoresToExtraLife`). */
export const SPEED_STEP_SCORE = 500;
export const EXTRA_LIFE_SCORE = 10000;
/** Очки: клетка (`addCell`) и убранный ряд (`removeFullLines`). */
export const CELL_POINTS = 1;
export const LINE_POINTS = 10;
/** Между рядами при загрузке уровня — `MOVEMENT_SPEED` = 45 мс. */
const LINE_STEP_TICKS = MOVE_TICKS;
/** Шаг стирания ряда от пушки к краям (`animatedClearLine`: `sleep(ANIMATION_DELAY * 2)`) = 60 мс. */
const CLEAR_STEP_TICKS = msToTicks(60);
/** Пауза перед сдвигом поля после спуска ряда (`sleep(ANIMATION_DELAY)`) = 30 мс. */
const SHIFT_DELAY_TICKS = msToTicks(30);

// ---------------------------------------------------------------- варианты

/** Донорские типы создающих вариантов `GunGame`: 5..8 (обычное поле) и 13..16 (поле вверх ногами). */
const DONOR_TYPES = [5, 6, 7, 8, 13, 14, 15, 16] as const;

/** Свойства варианта по донорскому номеру `type` (конструктор `GunGame`). */
function configOf(type: number): GunGameConfig {
  return {
    barrels: type % 4 === 3 || type % 4 === 0 ? 2 : 1,
    shifting: type % 2 === 0,
    inverted: type > 8,
    autoRepeat: false,
    speedStepScore: SPEED_STEP_SCORE,
    extraLifeScore: EXTRA_LIFE_SCORE,
  };
}

function modeOf(type: number): BrickModeDef {
  const config = configOf(type);
  const ru = [
    config.barrels === 2 ? 'Две пушки' : 'Одна пушка',
    ...(config.shifting ? ['сдвиг поля'] : []),
    ...(config.inverted ? ['поле вверх ногами'] : []),
  ].join(', ');
  const en = [
    config.barrels === 2 ? 'Two guns' : 'One gun',
    ...(config.shifting ? ['board shift'] : []),
    ...(config.inverted ? ['upside down'] : []),
  ].join(', ');
  const traits = [
    config.barrels === 2 ? 'две пушки по бокам' : 'одна пушка',
    config.shifting ? 'после спуска ряда всё поле сдвигается на клетку влево или вправо с оборачиванием' : 'без сдвига поля',
    config.inverted ? 'поле вверх ногами (пушка вверху, кнопки «вверх» и «вниз» меняются местами)' : 'пушка внизу',
  ].join('; ');
  return {
    name: { ru, en },
    note:
      `Донор: GunGame, тип ${type} (режим создания клеток): ${traits}. ` +
      'Соответствие номеру варианта на Apollo — допущение; число вариантов на устройстве неизвестно.',
  };
}

export const CONSTRUCTION_MODES: readonly BrickModeDef[] = DONOR_TYPES.map(modeOf);
const CONFIGS: readonly GunGameConfig[] = DONOR_TYPES.map(configOf);

// ---------------------------------------------------------------- игра

export class ConstructionGame extends GunGameBase {
  readonly id = 'construction';
  private readonly dropClock = new Countdown(1);
  private readonly dropRepeater = new Repeater(MOVE_TICKS, MOVE_TICKS);
  /** Сколько рядов уже выложено при загрузке уровня. */
  private linesBuilt = 0;

  constructor(options: BrickGameOptions = {}) {
    super(options, CONFIGS);
    this.init();
  }

  protected resetRules(): void {
    this.dropClock.reset(this.dropTicks());
    this.dropRepeater.reset();
    this.linesBuilt = 0;
  }

  /** Такты между спусками стены: «настоящая» скорость донора; у двух пушек вдвое дольше (`currentSpeed * 2`). */
  private dropTicks(): number {
    const factor = this.config.barrels === 2 ? 2 : 1;
    return genuineTicks(this.speed, DROP_FIRST_MS * factor, DROP_TENTH_MS * factor);
  }

  protected override prepareLevel(): void {
    this.linesBuilt = 0;
    this.dropRepeater.reset();
  }

  /** Стартовые ряды: по одному на уровень, по одному за 45 мс (`loadNewLevel`). */
  protected buildLevel(elapsed: number): void {
    const target = Math.min(this.level, Math.floor(elapsed / LINE_STEP_TICKS) + 1);
    while (this.linesBuilt < target) {
      this.pushLine();
      this.linesBuilt++;
    }
  }

  protected levelStarted(): void {
    this.dropClock.reset(this.dropTicks());
  }

  protected decorate(): void {
    // ничего не мигает, кроме пуль
  }

  protected advance(): void {
    this.dropClock.period = this.dropTicks();
    if (this.dropClock.fire()) this.dropLine();
  }

  /** Ускорение спуска (`KeyDown`; в перевёрнутом виде — `up`): ряд падает каждые 45 мс, пока кнопка зажата. */
  protected extraControls(input: BrickInput): void {
    const key = this.config.inverted ? 'up' : 'down';
    if (!this.dropRepeater.fire(key, input)) return;
    this.dropLine();
    if (!this.busy) this.emit({ type: 'move' });
  }

  /**
   * Добавить сверху случайный ряд, как `addLinesToBoard(.., fromLine = 19, 1, false)`: стена опускается на ряд; если в самом нижнем
   * ряду уже есть клетка (редко: клетка бокового ствола), ряд не добавляется. В ряду случайные клетки, но не все пустые и не все полные.
   */
  private pushLine(): void {
    if (this.space.rowCount(0) > 0) return;
    this.space.pushTowardGun();
    const row: boolean[] = [];
    for (let x = 0; x < BRICK_COLS; x++) row.push(this.rng.chance(0.5));
    const hasEmpty = row.includes(false);
    const hasFull = row.includes(true);
    // все полные — одна случайная клетка пуста, все пустые — одна случайная клетка полна
    if (!hasEmpty || !hasFull) row[this.rng.int(BRICK_COLS)] = hasEmpty;
    row.forEach((full, x) => this.space.set(x, TOP_ROW, full ? 1 : 0));
  }

  /** Спуск стены на ряд (`droppingDown`): после него — сдвиг поля (в вариантах со сдвигом), затем проверка касания пушки. */
  private dropLine(): void {
    this.pushLine();
    // как в доноре: касанием считается любая клетка в ряду над основанием пушки (ряд 1), в любой колонке
    const hit = this.space.rowCount(1) > 0;
    if (this.config.shifting) {
      this.cutscene(SHIFT_DELAY_TICKS, null, () => {
        this.space.rotateColumns(this.rng.chance(0.5) ? -1 : 1);
        if (hit) this.lose();
      });
    } else if (hit) {
      this.lose();
    }
  }

  protected flight(): void {
    this.bullets.flyCreating({
      solid: (x, y) => this.space.get(x, y) !== 0,
      blocked: (x, y) => this.space.get(x, y) !== 0 || this.gun.covers(x, y),
      ceiling: true,
      create: (x, y) => this.addCell(x, y),
    });
  }

  /** Пуля остановилась в (x, y): клетка становится частью стены (+1); если ряд полон — он убирается. Возвращает `true`, если ряд убран. */
  private addCell(x: number, y: number): boolean {
    this.space.set(x, y, 1);
    this.emit({ type: 'lock' });
    this.award(CELL_POINTS);
    if (!this.space.rowFull(y)) return false;
    this.removeLine(y);
    return true;
  }

  /** Убрать полный ряд y: пули пропадают, клетки гаснут от колонки пушки к краям, ряды ближе к пушке поднимаются на его место, +10 очков. */
  private removeLine(y: number): void {
    this.bullets.clear();
    this.emit({ type: 'lines', count: 1, rows: [this.rowOnScreen(y)] });
    const center = this.gun.x;
    const steps = Math.max(center, BRICK_COLS - center);
    this.cutscene(
      steps * CLEAR_STEP_TICKS,
      (elapsed) => {
        const step = Math.floor(elapsed / CLEAR_STEP_TICKS);
        for (let x = 0; x < BRICK_COLS; x++) {
          const distance = x < center ? center - 1 - x : x - center;
          if (distance <= step) this.space.set(x, y, 0);
        }
      },
      () => {
        this.space.collapseRow(y);
        this.award(LINE_POINTS);
      },
    );
  }
}

export const constructionDef: BrickGameDef = {
  id: 'construction',
  declaredModes: null,
  modes: CONSTRUCTION_MODES,
  create: (options) => new ConstructionGame(options),
};
