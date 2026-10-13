import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Game,
  makeFrame,
  nextInt,
  nextRandom,
  playReplay,
  ReplayError,
  ReplayRecorder,
  stateHash,
  type Replay,
} from '../../src/core';
import { contextFor, corridor, startedGame } from '../helpers/builders';
import { demoContext } from '../helpers/content';
import { Pilot } from '../helpers/pilot';
import { idle, framesOf, runFrames } from '../helpers/script';
import { playDemoWalkthrough } from '../helpers/walkthrough';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'demo-walkthrough.replay.json');

/**
 * Fixture — прохождение демо-пакета. Если демо-правила или демо-уровни изменились
 * намеренно, пересоздайте его: UPDATE_FIXTURES=1 npx vitest run tests/core/replay.test.ts
 */
if (process.env['UPDATE_FIXTURES']) {
  const pilot = new Pilot(demoContext());
  playDemoWalkthrough(pilot);
  writeFileSync(fixturePath, JSON.stringify(pilot.replay()) + '\n');
}

describe('replay', () => {
  const fixture = (): Replay => JSON.parse(readFileSync(fixturePath, 'utf-8')) as Replay;

  it('fixture на месте', () => {
    expect(existsSync(fixturePath)).toBe(true);
  });

  it('прохождение демо из fixture приводит к ожидаемому итогу', () => {
    const { game, events } = playReplay(demoContext(), fixture());
    expect(game.state.phase).toBe('completed');
    expect(game.state.levelId).toBe('demo-2');
    expect(game.state.score).toBe(2000);
    expect(game.state.lives).toBe(3);
    expect(events.filter((e) => e.type === 'levelCompleted').map((e) => e.levelId)).toEqual(['demo-1', 'demo-2']);
  });

  it('один и тот же replay даёт одинаковое состояние и одинаковые события', () => {
    const a = playReplay(demoContext(), fixture());
    const b = playReplay(demoContext(), fixture());
    expect(stateHash(a.game.state)).toBe(stateHash(b.game.state));
    expect(a.game.serialize()).toBe(b.game.serialize());
    expect(a.events).toEqual(b.events);
  });

  it('записанный и сохранённый через JSON replay воспроизводится так же', () => {
    const pilot = new Pilot(demoContext());
    playDemoWalkthrough(pilot);
    const viaJson = JSON.parse(JSON.stringify(pilot.replay())) as Replay;
    const replayed = playReplay(demoContext(), viaJson);
    expect(stateHash(replayed.game.state)).toBe(stateHash(pilot.state));
    // и совпадает с зафиксированным fixture
    expect(viaJson).toEqual(fixture());
  });

  it('идентичные повторяющиеся кадры сжимаются', () => {
    const ctx = contextFor([{ rows: corridor(10), start: { x: 0, y: 1 } }]);
    const game = new Game(ctx, 7);
    const recorder = new ReplayRecorder(game);
    for (const frame of framesOf([{ press: ['start'] }, idle(50)])) recorder.step(frame);
    const replay = recorder.finish();
    expect(replay.frames).toEqual([
      [makeFrame({ pressed: ['start'] }).pressed, makeFrame({ pressed: ['start'] }).held, 0, 1],
      [0, 0, 0, 50],
    ]);
    expect(replay.seed).toBe(7);
  });

  it('несовпадение версии правил или контента — понятная ошибка, а не тихий расхождение', () => {
    const base = fixture();
    expect(() => playReplay(demoContext(), { ...base, rulesVersion: 99 })).toThrow(ReplayError);
    expect(() => playReplay(demoContext(), { ...base, contentVersion: 99 })).toThrow(/контент/);
    expect(() => playReplay(demoContext(), { ...base, rulesId: 'other' })).toThrow(/правилах/);
    expect(() => playReplay(demoContext(), { ...base, version: 2 as 1 })).toThrow(/формат/);
  });
});

describe('сериализация состояния', () => {
  it('состояние — чистые данные: JSON-круг не меняет его', () => {
    const game = startedGame(demoContext());
    runFrames(game, framesOf([{ held: ['right'], ticks: 20 }, { press: ['fire'], held: ['fire'] }]));
    expect(JSON.parse(game.serialize())).toEqual(game.state);
  });

  it('восстановленная игра продолжает так же, как оригинал', () => {
    const ctx = demoContext();
    const a = startedGame(ctx, 5);
    runFrames(a, framesOf([{ held: ['right'], ticks: 30 }, { press: ['jump'], held: ['right'], ticks: 10 }]));
    const b = Game.restore(ctx, a.serialize());
    const tail = framesOf([{ held: ['right'], ticks: 25 }, { press: ['fire'], held: ['fire'], ticks: 6 }]);
    expect(runFrames(b, tail)).toEqual(runFrames(a, tail));
    expect(b.serialize()).toBe(a.serialize());
  });

  it('состояние от других правил или контента не принимается', () => {
    const ctx = demoContext();
    const json = startedGame(ctx).serialize();
    const newerRules = { ...ctx, rules: { ...ctx.rules, version: ctx.rules.version + 1 } };
    expect(() => Game.restore(newerRules, json)).toThrow(/другим правилам или контенту/);
    const newerContent = { ...ctx, contentVersion: ctx.contentVersion + 1 };
    expect(() => Game.restore(newerContent, json)).toThrow(/другим правилам или контенту/);
    const otherLevels = contextFor([{ rows: corridor(5), start: { x: 0, y: 1 } }]);
    expect(() => Game.restore(otherLevels, json)).toThrow(/Неизвестный уровень/);
  });
});

describe('ГСЧ с сохраняемым состоянием', () => {
  it('одинаковый seed — одинаковая последовательность, значения в [0, 1)', () => {
    const run = (seed: number): number[] => {
      const values: number[] = [];
      let state = seed;
      for (let i = 0; i < 50; i++) {
        const r = nextRandom(state);
        values.push(r.value);
        state = r.state;
      }
      return values;
    };
    expect(run(123)).toEqual(run(123));
    expect(run(123)).not.toEqual(run(124));
    for (const value of run(1)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('состояние можно сохранить и продолжить с того же места', () => {
    let state = 99;
    for (let i = 0; i < 10; i++) state = nextRandom(state).state;
    const saved = state;
    const continued = [nextInt(saved, 100), nextInt(nextInt(saved, 100).state, 100)];
    const again = [nextInt(saved, 100), nextInt(nextInt(saved, 100).state, 100)];
    expect(continued).toEqual(again);
    expect(continued[0]?.value).toBeLessThan(100);
  });

  it('seed игры и состояние генератора лежат в GameState', () => {
    const game = new Game(demoContext(), 2024);
    expect(game.state.seed).toBe(2024);
    expect(game.state.rng).toBe(2024);
  });
});
