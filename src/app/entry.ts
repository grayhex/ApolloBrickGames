import type { AnimationsDef } from '../content/schema';
import { isAction, makeFrame, type Action, type GameEvent, type InputFrame, type Phase } from '../core';

/**
 * Сценарий входа: после старта участка первые такты вместо игрока вводит заготовленный ввод
 * (в тестовом уровне герой выпрыгивает из ямы «туннеля» и выходит наружу). Для ядра это обычные кадры ввода,
 * поэтому сценарий идёт через те же правила (прыжки, удары головой, крышка) и записывается в replay. Логика без DOM.
 */
export class EntryScript {
  private readonly scripts = new Map<string, readonly InputFrame[]>();
  /** Участок, для которого сценарий ждёт старта игры. */
  private armed: string | null = null;
  private running: readonly InputFrame[] | null = null;
  private index = 0;

  constructor(entry: AnimationsDef['entry'] | null | undefined) {
    for (const [levelId, steps] of Object.entries(entry?.scripts ?? {})) {
      const frames: InputFrame[] = [];
      for (const step of steps) {
        const held = step.held.filter(isAction) as Action[];
        const press = step.press.filter(isAction) as Action[];
        for (let i = 0; i < step.ticks; i++) frames.push(makeFrame({ held, pressed: i === 0 ? press : [] }));
      }
      this.scripts.set(levelId, frames);
    }
  }

  /** Сценарий ждёт, пока на этом участке начнётся игра (новая игра, возрождение, переход). */
  arm(levelId: string): void {
    this.armed = levelId;
    this.running = null;
    this.index = 0;
  }

  onEvent(event: GameEvent): void {
    if (event.type === 'levelStarted') this.arm(event.levelId);
  }

  /** Идёт ли сценарий прямо сейчас. */
  get active(): boolean {
    return this.running !== null;
  }

  /** Сценарий идёт или стартует на ближайшем такте (участок начат, а сценарий ещё не взят в работу). */
  pending(phase: Phase): boolean {
    return this.running !== null || (phase === 'playing' && this.armed !== null && this.scripts.has(this.armed));
  }

  /** Сколько тактов сценария осталось (0 — не идёт). */
  get remaining(): number {
    return this.running ? this.running.length - this.index : 0;
  }

  /** Ввод вместо игрока на этот такт; null — играет игрок. Вызывать на каждом такте фазы `playing`. */
  next(levelId: string, phase: Phase): InputFrame | null {
    if (phase !== 'playing') return null;
    if (this.running === null) {
      if (this.armed !== levelId) return null;
      this.armed = null;
      const frames = this.scripts.get(levelId);
      if (!frames || frames.length === 0) return null;
      this.running = frames;
      this.index = 0;
    }
    const frame = this.running[this.index];
    this.index += 1;
    if (this.index >= this.running.length) this.running = null;
    return frame ?? null;
  }
}
