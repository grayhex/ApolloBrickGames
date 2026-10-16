/**
 * Основа игр с пушкой («Стройка» и «Стрельба по фигурам»): пушка внизу (или вверху в перевёрнутом виде), пули, стена или фигуры,
 * жизни, потеря жизни со взрывом, победа в уровне, скорость и уровень от очков.
 * Правила — по донору (`games/GunGame.java`, `GameWithGun.java`, `GameWithLives.java`): каждые `SCORE_TO_NEXT_LEVEL` очков скорость растёт на
 * единицу, после десятой скорость сбрасывается на первую, уровень растёт и играется победа (очистка поля), затем уровень загружается заново;
 * потеря жизни — взрыв на месте пушки, очистка поля и тот же уровень сначала; без жизней — конец игры.
 *
 * Игры наследуют `GunGameBase` и дают: набор вариантов (`GunGameConfig`), спуск стены или фигур (`advance`), полёт пуль (`flight`),
 * постройку уровня (`prepareLevel`, `buildLevel`, `levelStarted`) и сброс своего состояния (`resetRules`). Конструктор наследника
 * заканчивается вызовом `this.init()`.
 */
import { BrickBase, CLEAR_LOSE_TICKS, CLEAR_WIN_TICKS, MAX_LIVES } from '../../base';
import { Countdown, msToTicks } from '../../timing';
import {
  MAX_LEVEL,
  MIN_LEVEL,
  MIN_SPEED,
  type BrickGameOptions,
  type BrickInput,
} from '../../types';
import { BULLET_TICKS_ONE, BULLET_TICKS_TWO, Bullets, Gun } from './gun';
import { GunSpace, screenRow, spaceToScreen } from './space';

/** «Мелодия» перед уровнем (`START_MUSIC_DURATION` = 1500 мс): сценка без ввода (в доноре за это время пушку ещё можно двигать — упрощение). */
export const INTRO_TICKS = msToTicks(1500);

/** Свойства варианта игры с пушкой. */
export interface GunGameConfig {
  /** Стволов: 1 — по центру, 2 — по бокам. */
  readonly barrels: 1 | 2;
  /** Поле «вверх ногами» (`drawInvertedBoard`): пушка вверху, кнопки «вверх» и «вниз» меняются местами. */
  readonly inverted: boolean;
  /** Горизонтальный сдвиг поля (`isShiftingBoard`). */
  readonly shifting: boolean;
  /** Зажатые кнопки пушки повторяются (иначе одно действие на нажатие). */
  readonly autoRepeat: boolean;
  /** Сколько очков нужно для следующей скорости (`SCORE_TO_NEXT_LEVEL`). */
  readonly speedStepScore: number;
  /** Каждые столько очков — добавочная жизнь (`getScoresToExtraLife`). */
  readonly extraLifeScore: number;
}

export abstract class GunGameBase extends BrickBase {
  protected readonly config: GunGameConfig;
  /** Стена или фигуры в пространстве пушки (пушка и пули хранятся отдельно и накладываются при рисовании). */
  protected readonly space = new GunSpace();
  protected readonly gun: Gun;
  protected readonly bullets = new Bullets();
  private readonly bulletClock: Countdown;
  /** Набрана скорость сверх десятой: после текущего такта играется победа и грузится следующий уровень (`isWin`). */
  protected winPending = false;

  protected constructor(options: BrickGameOptions, configs: readonly GunGameConfig[]) {
    super(options, configs.length);
    const config = configs[this.mode] ?? configs[0];
    if (!config) throw new Error('GunGameBase: нет вариантов игры');
    this.config = config;
    this.gun = new Gun(config.barrels, config.autoRepeat);
    this.bulletClock = new Countdown(config.barrels === 2 ? BULLET_TICKS_TWO : BULLET_TICKS_ONE);
  }

  // ---------------------------------------------------------------- что реализует игра

  /** Сбросить своё состояние новой партии (таймеры, счётчики). Поле, пушка, пули и жизни уже сброшены. */
  protected abstract resetRules(): void;
  /** Спуск стены или фигур по своему таймеру; может начать сценку (потеря жизни, сдвиг). */
  protected abstract advance(): void;
  /** Кнопки, кроме пушки и огня (например, ускорение спуска). Вызывается после движения пушки. */
  protected abstract extraControls(input: BrickInput): void;
  /** Проход полёта пуль по таймеру пуль. */
  protected abstract flight(): void;
  /** Начало уровня: поле уже очищено, пушка в центре. Здесь можно сразу расставить стартовое содержимое. */
  protected prepareLevel(): void {
    // по умолчанию ничего
  }
  /** Кадр «мелодии» перед уровнем (`elapsed` — такты сценки, первый кадр сразу); должен быть идемпотентным. */
  protected abstract buildLevel(elapsed: number): void;
  /** «Мелодия» закончилась: уровень пошёл, запускаются таймеры. */
  protected abstract levelStarted(): void;
  /** Подкрасить буфер пространства перед выводом (например, мигание исчезающего прямоугольника). */
  protected abstract decorate(buffer: Uint8Array): void;

  // ---------------------------------------------------------------- BrickBase

  protected reset(): void {
    this.setLives(MAX_LIVES);
    this.scoresToExtraLife = this.config.extraLifeScore;
    this.space.clear();
    this.gun.reset();
    this.bullets.clear();
    this.bulletClock.reset();
    this.winPending = false;
    this.resetRules();
  }

  protected override onStart(): void {
    this.loadLevel();
  }

  protected update(input: BrickInput): void {
    if (this.winPending) {
      this.beginWin();
      return;
    }
    this.advance();
    if (this.busy) return;
    if (this.gun.steer(input, (x, y) => this.space.get(x, y) !== 0)) this.emit({ type: 'move' });
    this.extraControls(input);
    if (this.busy) return;
    if (this.gun.trigger(input) && this.bullets.fire(this.gun) > 0) this.emit({ type: 'shot' });
    if (this.bulletClock.fire()) this.flight();
  }

  protected draw(): Uint8Array {
    const buffer = this.space.cells.slice();
    this.decorate(buffer);
    this.bullets.drawInto(buffer);
    this.gun.drawInto(buffer);
    return spaceToScreen(buffer, this.config.inverted);
  }

  // ---------------------------------------------------------------- общие правила

  /** Загрузить уровень: чистое поле, пушка в центре, «мелодия» без ввода (`loadNewLevel`). */
  protected loadLevel(): void {
    this.space.clear();
    this.gun.reset();
    this.bullets.clear();
    this.winPending = false;
    this.prepareLevel();
    this.cutscene(INTRO_TICKS, (elapsed) => this.buildLevel(elapsed), () => this.levelStarted());
  }

  /** Добавить очки; каждые `speedStepScore` очков скорость растёт, после десятой — уровень и победа (`GunGame.setScore`). */
  protected award(points: number): void {
    const step = this.config.speedStepScore;
    const before = Math.floor(this.score / step);
    this.addScore(points);
    if (Math.floor(this.score / step) <= before) return;
    this.setSpeed(this.speed + 1);
    if (this.speed === MIN_SPEED) {
      this.level = this.level >= MAX_LEVEL ? MIN_LEVEL : this.level + 1;
      this.winPending = true;
    }
    this.emit({ type: 'levelUp', speed: this.speed });
  }

  /** Потеря жизни (`GameWithLives.loss`): взрыв на месте пушки, жизнь меньше, очистка поля и уровень заново; без жизней — конец игры. */
  protected lose(): void {
    this.bullets.clear();
    this.emit({ type: 'crash' });
    this.animateKaboom(this.gun.x, this.rowOnScreen(0), () => {
      this.setLives((this.lives ?? 0) - 1);
      this.emit({ type: 'lifeLost' });
      if ((this.lives ?? 0) > 0) this.animateClear(CLEAR_LOSE_TICKS, () => this.loadLevel());
      else this.gameOver();
    });
  }

  /** Строка экрана для ряда пространства пушки. */
  protected rowOnScreen(y: number): number {
    return screenRow(y, this.config.inverted);
  }

  private beginWin(): void {
    this.winPending = false;
    this.bullets.clear();
    this.emit({ type: 'win' });
    this.animateClear(CLEAR_WIN_TICKS, () => this.loadLevel());
  }
}
