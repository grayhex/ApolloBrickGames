import { describe, expect, it } from 'vitest';
import reference from '../fixtures/brickemu/b0202.json';
import { B0202_TETRIS_COUNTS } from '../../src/brick/b0202';
import { makeBrickInput, NEUTRAL_BRICK_INPUT } from '../../src/brick/types';
import { Lab, idle, tap, until } from './games/tetrisLab';
import { SHAPE_LINE, SHAPE_SQUARE } from '../../src/brick/games/tetris/shapes';

function game(speed = 1): Lab {
  const lab = new Lab('tetris', { speed, seed: 5 });
  lab.start();
  lab.wipe();
  return lab;
}

describe('Apollo B0202 ROM observations (cycle traces, not our own constants)', () => {
  it('uses the pinned dump table', () => {
    expect(reference.reference.revision).toBe('376cca92c6d000ffd6046e5491f2a1c3d1a5eab0');
    expect(B0202_TETRIS_COUNTS).toEqual(reference.b0202.gravityCounts);
  });
  for (const trace of reference.b0202.gravity) {
    it(`gravity ${trace.speedDigit}: accumulated timing follows the executed ROM within one frame plus sampling`, () => {
      const lab = game(trace.speedDigit + 1);
      lab.put(SHAPE_SQUARE, 0, 4, 18);
      const falls: number[] = [];
      let lastY = lab.py;
      for (let frame = 1; falls.length < trace.fallCycles.length && frame < 1000; frame++) {
        lab.step(NEUTRAL_BRICK_INPUT);
        if (lab.py !== lastY) {
          falls.push(frame);
          lastY = lab.py;
        }
      }
      expect(falls).toHaveLength(trace.fallCycles.length);
      const oursMs = ((falls.at(-1)! - falls[0]!) * 1000) / 60;
      const romMs = (trace.fallCycles.at(-1)! - trace.fallCycles[0]!) / 690;
      expect(Math.abs(oursMs - romMs)).toBeLessThan(1000 / 60 + 10);
    });
  }
  for (const trace of reference.b0202.clears) {
    it(`clear ${trace.rows} rows from score ${trace.beforeScore}, speed ${trace.beforeSpeedDigit}`, () => {
      const lab = game(trace.beforeSpeedDigit + 1);
      for (let row = 0; row < trace.rows; row++) lab.fill(row, '.#########');
      lab.put(SHAPE_LINE, 0, 0, 12);
      lab.poke(trace.beforeScore);
      for (let tick = 0; tick < 30 && !lab.landed; tick++) lab.step(makeBrickInput([], ['down']));
      until(lab, () => lab.score === trace.afterScore && lab.count() === 4 - trace.rows, 600);
      expect(lab.score).toBe(trace.afterScore);
      expect(lab.speed - 1).toBe(trace.afterSpeedDigit);
    });
  }
  it('a soft-drop on the gravity deadline moves only one row and resets that deadline', () => {
    const lab = game();
    lab.put(SHAPE_SQUARE, 0, 4, 15);
    lab.dueFall();
    tap(lab, 'down');
    expect(lab.py).toBe(14);
    idle(lab, Math.ceil(lab.fallPeriod) - 2);
    expect(lab.py).toBe(14);
    idle(lab, 1);
    expect(lab.py).toBe(13);
  });
  it('holding ROTATE does not spin repeatedly; another press rotates again', () => {
    const lab = game();
    lab.put(6, 0, 4, 15);
    tap(lab, 'rotate');
    for (let tick = 0; tick < 36; tick++) lab.step(makeBrickInput([], ['rotate']));
    expect(lab.current?.angle).toBe(1);
    tap(lab, 'rotate');
    expect(lab.current?.angle).toBe(2);
  });
  it('pause preserves fractional gravity time', () => {
    const a = game(10),
      b = game(10);
    for (const lab of [a, b]) {
      lab.put(SHAPE_SQUARE, 0, 4, 15);
      idle(lab, 3);
    }
    a.pause();
    idle(a, 120);
    a.resume();
    for (let tick = 0; tick < 20; tick++) {
      idle(a, 1);
      idle(b, 1);
      expect(a.cells()).toEqual(b.cells());
    }
  });
});
