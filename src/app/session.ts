import {
  actionBit,
  CORE_ACTIONS,
  makeFrame,
  maskOf,
  NEUTRAL_FRAME,
  SECRET_CHORD,
  type Game,
  type GameEvent,
  type InputFrame,
} from '../core';
import type { ActionTracker } from '../input/tracker';
import type { EntryScript } from './entry';
import { restrictFrame } from '../input/tracker';
import type { FixedStepper } from './stepper';

/** `game` — ввод идёт в игру; `menu` — открыты настройки: мир ввода не получает. */
export type InputContext = 'game' | 'menu';

export interface SessionDeps {
  game: Game;
  tracker: ActionTracker;
  stepper: FixedStepper;
  /** События каждого такта (звук, HUD). */
  onEvents(events: readonly GameEvent[]): void;
  /** Ввод в контексте menu (навигация по настройкам с геймпада). */
  onMenuInput?(frame: InputFrame): void;
  /** Сбросить состояние устройств: клавиши, нейтральная синхронизация геймпада. */
  resetDevices(): void;
  /** Сценарий входа: первые такты участка вместо игрока (необязателен). */
  entry?: EntryScript;
}

const START = actionBit('start');
const PAUSE = actionBit('pause');
const CONFIRM = actionBit('confirm');
/** Секретный аккорд оригинала: LEFT и DOWN вместе (у упаковки: «до того, как Марио выпрыгнет из колодца»). */
const CHORD_KEYS = maskOf('left', 'down');

/**
 * Связка «время → такты → ввод → ядро» без DOM.
 * Здесь решается, что получает мир: только игровые действия, и только в контексте game.
 */
export class GameSession {
  context: InputContext = 'game';
  /** Последний кадр, отправленный в ядро (для отладочной панели). */
  lastFrame: InputFrame = NEUTRAL_FRAME;
  private readonly deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  /** Вызывается раз в кадр отрисовки (requestAnimationFrame), в том числе на паузе. */
  frame(nowMs: number): number {
    return this.deps.stepper.advance(nowMs, () => this.tick());
  }

  private tick(): void {
    const { game, tracker } = this.deps;
    const raw = tracker.consume();

    if (this.context === 'menu') {
      this.lastFrame = NEUTRAL_FRAME;
      this.deps.onMenuInput?.(raw);
      this.deps.onEvents(game.step(NEUTRAL_FRAME));
      return;
    }

    // В игровом контексте мир видит только свои действия. `confirm` — команда оболочки:
    // вне фазы playing (старт, продолжение, новая игра) он работает как start.
    let frame = restrictFrame(raw, CORE_ACTIONS);
    if (game.state.phase !== 'playing' && (raw.pressed & CONFIRM) !== 0) {
      frame = { pressed: frame.pressed | START, held: frame.held | START, released: frame.released };
    }
    // Сценарий входа подменяет ввод игрока (кроме паузы: она всегда доступна, сценарий при этом ждёт).
    const { entry } = this.deps;
    if (entry && game.state.phase === 'playing' && (frame.pressed & PAUSE) === 0) {
      frame = entry.next(game.state.levelId, game.state.phase) ?? frame;
    }
    // Аккорд берётся из настоящего ввода, а не из кадра сценария входа: пока герой сам выпрыгивает из ямы, его кадры подменяют ввод игрока.
    if ((raw.held & CHORD_KEYS) === CHORD_KEYS) frame = { ...frame, held: frame.held | SECRET_CHORD };
    this.lastFrame = frame;
    this.deps.onEvents(game.step(frame));
  }

  /**
   * Скрытие вкладки, потеря фокуса, отключение геймпада, открытие настроек:
   * игра ставится на паузу, накопленное время и ввод очищаются. Продолжение — только явное.
   */
  suspend(): void {
    const { game } = this.deps;
    if (game.state.phase === 'playing') this.deps.onEvents(game.step(makeFrame({ pressed: ['pause'] })));
    this.deps.resetDevices();
    this.deps.tracker.reset();
    this.deps.stepper.reset();
    this.lastFrame = NEUTRAL_FRAME;
  }

  /** Явная команда продолжения (кнопка в интерфейсе): работает так же, как нажатие start. */
  requestStart(): void {
    const { game } = this.deps;
    this.deps.onEvents(game.step(makeFrame({ pressed: ['start'] })));
  }

  requestPause(): void {
    const { game } = this.deps;
    if (game.state.phase === 'playing') this.deps.onEvents(game.step(makeFrame({ pressed: ['pause'] })));
  }

  /** Отладка: один такт мира на паузе (с текущим удерживаемым вводом, без start/pause). */
  stepWhilePaused(): void {
    const { game, tracker } = this.deps;
    if (game.state.phase !== 'paused') return;
    const raw = restrictFrame(tracker.consume(), CORE_ACTIONS & ~(START | PAUSE));
    this.lastFrame = raw;
    this.deps.onEvents(game.step(raw, { simulateWhilePaused: true }));
  }

  /** Новая игра с тем же seed: ввод и время очищаются. */
  restart(): void {
    this.deps.onEvents(this.deps.game.reset());
    this.deps.resetDevices();
    this.deps.tracker.reset();
    this.deps.stepper.reset();
    this.lastFrame = NEUTRAL_FRAME;
  }

  setContext(context: InputContext): void {
    if (this.context === context) return;
    this.context = context;
    this.deps.tracker.reset();
    this.deps.resetDevices();
  }
}
