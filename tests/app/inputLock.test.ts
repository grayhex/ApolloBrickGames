import { describe, expect, it } from 'vitest';
import { isInputLocked, lockInput, onInputLock } from '../../src/app/inputLock';

describe('блокировка игрового ввода', () => {
  it('замок считает владельцев: ввод возвращается, когда отпустили все', () => {
    const events: boolean[] = [];
    const off = onInputLock((locked) => events.push(locked));
    expect(isInputLocked()).toBe(false);
    const first = lockInput();
    const second = lockInput();
    expect(isInputLocked()).toBe(true);
    first();
    expect(isInputLocked()).toBe(true);
    second();
    expect(isInputLocked()).toBe(false);
    expect(events).toEqual([true, false]); // слушатели получают только смену состояния
    off();
  });

  it('повторное снятие одного замка ничего не ломает', () => {
    const release = lockInput();
    const other = lockInput();
    release();
    release();
    expect(isInputLocked()).toBe(true);
    other();
    expect(isInputLocked()).toBe(false);
  });

  it('подписку снимает возвращённая функция и AbortSignal', () => {
    const events: boolean[] = [];
    const off = onInputLock((locked) => events.push(locked));
    off();
    const controller = new AbortController();
    onInputLock((locked) => events.push(locked), controller.signal);
    controller.abort();
    lockInput()();
    expect(events).toEqual([]);
  });
});
