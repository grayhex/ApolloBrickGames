import { describe, expect, it } from 'vitest';
import { Game, playReplay, stateHash, type InputFrame, type Replay } from '../../src/core';
import { FixedStepper } from '../../src/app/stepper';
import { demoContext } from '../helpers/content';
import { readJson } from '../helpers/content';
import { fileURLToPath } from 'node:url';

const fixture = readJson(fileURLToPath(new URL('../fixtures/demo-walkthrough.replay.json', import.meta.url))) as Replay;

/** Кадры fixture, развёрнутые по тактам. */
function fixtureFrames(): InputFrame[] {
  const frames: InputFrame[] = [];
  for (const [pressed, held, released, count] of fixture.frames) {
    for (let i = 0; i < count; i++) frames.push({ pressed, held, released });
  }
  return frames;
}

/** Моделирует расписание отрисовки: now(i) — время i-го кадра в мс. */
function runSchedule(frames: readonly InputFrame[], now: (frameIndex: number) => number): { game: Game; ticks: number; renderFrames: number } {
  const ctx = demoContext();
  const game = new Game(ctx, fixture.seed);
  const stepper = new FixedStepper(1000 / ctx.rules.params.tickRateHz);
  let index = 0;
  let renderFrames = 0;
  while (index < frames.length && renderFrames < 100_000) {
    stepper.advance(now(renderFrames), () => {
      const frame = frames[index];
      if (frame) {
        game.step(frame);
        index += 1;
      }
    });
    renderFrames += 1;
  }
  return { game, ticks: index, renderFrames };
}

describe('FixedStepper', () => {
  it('число тактов в секунду не зависит от частоты отрисовки (30/60/144 Гц)', () => {
    for (const fps of [30, 60, 144]) {
      const stepper = new FixedStepper(50); // 20 тактов/с
      let ticks = 0;
      const frameMs = 1000 / fps;
      for (let i = 0; i <= fps * 10; i++) stepper.advance(i * frameMs, () => (ticks += 1));
      expect(Math.abs(ticks - 200), `fps=${fps}, тактов=${ticks}`).toBeLessThanOrEqual(1);
    }
  });

  it('одни и те же команды по тактам дают одно и то же состояние при разных расписаниях отрисовки', () => {
    const frames = fixtureFrames();
    const expected = stateHash(playReplay(demoContext(), fixture).game.state);

    const schedules: Record<string, (i: number) => number> = {
      '30 FPS': (i) => i * (1000 / 30),
      '60 FPS': (i) => i * (1000 / 60),
      '144 FPS': (i) => i * (1000 / 144),
      // неровные кадры: 4, 33, 16, 100, 8 мс по кругу
      'неровные кадры': (() => {
        const deltas = [4, 33, 16, 100, 8];
        const times: number[] = [0];
        return (i: number): number => {
          while (times.length <= i) times.push((times.at(-1) ?? 0) + (deltas[(times.length - 1) % deltas.length] ?? 16));
          return times[i] ?? 0;
        };
      })(),
    };
    for (const [name, now] of Object.entries(schedules)) {
      const result = runSchedule(frames, now);
      expect(result.ticks, name).toBe(frames.length);
      expect(stateHash(result.game.state), name).toBe(expected);
    }
  });

  it('первый кадр после reset() не даёт тактов — никакого скачка', () => {
    const stepper = new FixedStepper(50);
    let ticks = 0;
    const tick = (): number => (ticks += 1);
    expect(stepper.advance(1000, tick)).toBe(0);
    stepper.advance(1050, tick);
    expect(ticks).toBe(1);
    stepper.reset();
    expect(stepper.advance(60_000, tick)).toBe(0); // вернулись во вкладку через минуту
    expect(stepper.advance(60_050, tick)).toBe(1);
    expect(ticks).toBe(2);
  });

  it('огромная пауза между кадрами не превращается в лавину тактов', () => {
    const stepper = new FixedStepper(50, { maxCatchUpSteps: 5, maxFrameMs: 250 });
    let ticks = 0;
    stepper.advance(0, () => (ticks += 1));
    stepper.advance(10_000, () => (ticks += 1));
    expect(ticks).toBeLessThanOrEqual(5);
    const before = ticks;
    stepper.advance(10_050, () => (ticks += 1));
    expect(ticks - before).toBeLessThanOrEqual(2); // долг не копится
  });

  it('лимит догоняющих шагов отбрасывает остаток', () => {
    const stepper = new FixedStepper(10, { maxCatchUpSteps: 3, maxFrameMs: 1000 });
    let ticks = 0;
    stepper.advance(0, () => (ticks += 1));
    expect(stepper.advance(500, () => (ticks += 1))).toBe(3);
    expect(stepper.advance(510, () => (ticks += 1))).toBe(1);
  });

  it('время, пошедшее назад, игнорируется', () => {
    const stepper = new FixedStepper(50);
    let ticks = 0;
    stepper.advance(1000, () => (ticks += 1));
    stepper.advance(900, () => (ticks += 1));
    expect(ticks).toBe(0);
  });
});
