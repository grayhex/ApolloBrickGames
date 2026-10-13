import type { InputFrame } from './actions';
import { Game, type GameContext } from './sim';
import type { GameEvent, GameState } from './state';

export const REPLAY_FORMAT = 'crocodile-mario-replay';
export const REPLAY_VERSION = 1;

/** [pressed, held, released, сколько тактов подряд повторяется такой кадр]. */
export type ReplayFrame = [pressed: number, held: number, released: number, count: number];

export interface Replay {
  format: typeof REPLAY_FORMAT;
  version: typeof REPLAY_VERSION;
  contentId: string;
  contentVersion: number;
  rulesId: string;
  rulesVersion: number;
  seed: number;
  frames: ReplayFrame[];
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayError';
  }
}

/** Записывает кадры ввода, которые подаются в Game.step() через recorder.step(). */
export class ReplayRecorder {
  private readonly frames: ReplayFrame[] = [];
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  step(frame: InputFrame): readonly GameEvent[] {
    const last = this.frames[this.frames.length - 1];
    if (last && last[0] === frame.pressed && last[1] === frame.held && last[2] === frame.released) {
      last[3] += 1;
    } else {
      this.frames.push([frame.pressed, frame.held, frame.released, 1]);
    }
    return this.game.step(frame);
  }

  finish(): Replay {
    const { meta, seed } = this.game.state;
    return {
      format: REPLAY_FORMAT,
      version: REPLAY_VERSION,
      contentId: meta.contentId,
      contentVersion: meta.contentVersion,
      rulesId: meta.rulesId,
      rulesVersion: meta.rulesVersion,
      seed,
      frames: this.frames.map((frame) => [...frame]),
    };
  }
}

/** Проигрывает replay на свежей игре. Бросает ReplayError при несовпадении версий. */
export function playReplay(ctx: GameContext, replay: Replay): { game: Game; events: GameEvent[] } {
  if (replay.format !== REPLAY_FORMAT || replay.version !== REPLAY_VERSION) {
    throw new ReplayError(`Неподдерживаемый формат replay: ${String(replay.format)} v${String(replay.version)}`);
  }
  if (replay.rulesId !== ctx.rules.id || replay.rulesVersion !== ctx.rules.version) {
    throw new ReplayError(
      `Replay записан на правилах ${replay.rulesId} v${replay.rulesVersion}, загружены ${ctx.rules.id} v${ctx.rules.version}.`,
    );
  }
  if (replay.contentId !== ctx.contentId || replay.contentVersion !== ctx.contentVersion) {
    throw new ReplayError(
      `Replay записан на контенте ${replay.contentId} v${replay.contentVersion}, загружен ${ctx.contentId} v${ctx.contentVersion}.`,
    );
  }
  const game = new Game(ctx, replay.seed);
  const events: GameEvent[] = [];
  for (const [pressed, held, released, count] of replay.frames) {
    for (let i = 0; i < count; i++) events.push(...game.step({ pressed, held, released }));
  }
  return { game, events };
}

/** Стабильный хэш состояния (FNV-1a по JSON) для сравнения результатов replay. */
export function stateHash(state: GameState): string {
  const text = JSON.stringify(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
