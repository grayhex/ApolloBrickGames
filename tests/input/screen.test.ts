import { describe, expect, it } from 'vitest';
import { actionBit, maskOf } from '../../src/core/actions';
import { ScreenInput } from '../../src/input/screen';
import { ActionTracker } from '../../src/input/tracker';

const RIGHT = actionBit('right');
const LEFT = actionBit('left');
const JUMP = actionBit('jump');

describe('экранные кнопки как источник ввода', () => {
  it('каждый указатель держит свою маску; результат — объединение', () => {
    const seen: number[] = [];
    const input = new ScreenInput((mask) => seen.push(mask));
    input.press(1, RIGHT);
    input.press(2, JUMP);
    expect(input.held).toBe(RIGHT | JUMP);
    input.release(1);
    expect(input.held).toBe(JUMP);
    input.release(2);
    expect(seen).toEqual([RIGHT, RIGHT | JUMP, JUMP, 0]);
  });

  it('повторное нажатие тем же указателем заменяет маску; отпускание неизвестного указателя ничего не делает', () => {
    const seen: number[] = [];
    const input = new ScreenInput((mask) => seen.push(mask));
    input.press(1, RIGHT);
    input.press(1, LEFT);
    input.release(99);
    expect(input.held).toBe(LEFT);
    expect(seen).toEqual([RIGHT, LEFT]);
  });

  it('releaseAll отпускает всё одним действием и молчит, если держать нечего', () => {
    const seen: number[] = [];
    const input = new ScreenInput((mask) => seen.push(mask));
    input.releaseAll();
    expect(seen).toEqual([]);
    input.press(1, RIGHT);
    input.press(2, JUMP);
    input.releaseAll();
    expect(input.held).toBe(0);
    expect(seen.at(-1)).toBe(0);
  });

  it('вместе с трекером: короткое касание не теряется, противоположные направления гасят друг друга', () => {
    const tracker = new ActionTracker();
    const input = new ScreenInput((mask) => tracker.setSource('screen', mask));
    input.press(1, JUMP);
    input.release(1); // тап между двумя тактами
    expect(tracker.consume()).toEqual({ pressed: JUMP, held: JUMP, released: JUMP });
    input.press(1, LEFT);
    input.press(2, RIGHT);
    expect(tracker.down & (LEFT | RIGHT)).toBe(0);
    input.release(2);
    expect(tracker.down).toBe(LEFT);
    expect(maskOf('left')).toBe(LEFT);
  });
});
