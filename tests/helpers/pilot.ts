import {
  Game,
  makeFrame,
  ReplayRecorder,
  type Action,
  type GameContext,
  type GameEvent,
  type GameState,
  type Replay,
} from '../../src/core';

/** Играет в замкнутом цикле (смотрит на состояние) и записывает кадры в replay. */
export class Pilot {
  readonly game: Game;
  readonly events: GameEvent[] = [];
  private readonly recorder: ReplayRecorder;

  constructor(ctx: GameContext, seed = 1) {
    this.game = new Game(ctx, seed);
    this.recorder = new ReplayRecorder(this.game);
  }

  get state(): GameState {
    return this.game.state;
  }

  tick(held: readonly Action[] = [], press: readonly Action[] = []): void {
    this.events.push(...this.recorder.step(makeFrame({ held, pressed: press })));
  }

  ticks(count: number, held: readonly Action[] = [], press: readonly Action[] = []): void {
    for (let i = 0; i < count; i++) this.tick(held, i === 0 ? press : []);
  }

  /** Держит действия, пока условие не выполнится (press — только на первом такте). */
  until(cond: () => boolean, held: readonly Action[] = [], press: readonly Action[] = [], max = 400): void {
    for (let i = 0; i < max; i++) {
      if (cond()) return;
      this.tick(held, i === 0 ? press : []);
    }
    throw new Error(
      `Пилот не дождался условия за ${max} тактов: уровень ${this.state.levelId}, герой (${this.state.hero.x}, ${this.state.hero.y}), фаза ${this.state.phase}`,
    );
  }

  /** Ждёт, пока герой не встанет на опору. */
  settle(): void {
    this.until(() => !this.state.hero.airborne && this.state.hero.jumpIndex < 0, [], [], 100);
  }

  replay(): Replay {
    return this.recorder.finish();
  }
}
