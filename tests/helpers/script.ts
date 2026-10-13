import { makeFrame, type Action, type Game, type GameEvent, type InputFrame } from '../../src/core';

/** Отрезок сценария: действия удерживаются `ticks` тактов; `press` — фронт на первом такте. */
export interface Segment {
  held?: readonly Action[];
  press?: readonly Action[];
  ticks?: number;
}

/** Разворачивает сценарий в кадры по тактам. */
export function framesOf(segments: readonly Segment[]): InputFrame[] {
  const frames: InputFrame[] = [];
  for (const segment of segments) {
    const ticks = segment.ticks ?? 1;
    for (let i = 0; i < ticks; i++) {
      frames.push(makeFrame({ held: segment.held ?? [], pressed: i === 0 ? (segment.press ?? []) : [] }));
    }
  }
  return frames;
}

export function runFrames(game: Game, frames: readonly InputFrame[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const frame of frames) events.push(...game.step(frame));
  return events;
}

export function run(game: Game, ...segments: Segment[]): GameEvent[] {
  return runFrames(game, framesOf(segments));
}

export const idle = (ticks: number): Segment => ({ ticks });
