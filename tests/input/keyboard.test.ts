import { describe, expect, it } from 'vitest';
import { compileBindings, DEFAULT_KEYBOARD_BINDINGS, maskOfSources, boundSources } from '../../src/input/bindings';
import { isInteractiveTarget, KeyboardInput } from '../../src/input/keyboard';
import { actionBit } from '../../src/core';

interface Harness {
  win: EventTarget & { tagName?: string };
  kb: KeyboardInput;
  masks: number[];
  active: { value: boolean };
  press(code: string, extra?: Record<string, unknown>): { prevented: boolean };
  release(code: string): { prevented: boolean };
}

function harness(tagName?: string): Harness {
  const win: EventTarget & { tagName?: string } = new EventTarget();
  if (tagName) win.tagName = tagName;
  const active = { value: true };
  const bound = boundSources(DEFAULT_KEYBOARD_BINDINGS);
  const compiled = compileBindings(DEFAULT_KEYBOARD_BINDINGS);
  const masks: number[] = [];
  const kb = new KeyboardInput(win, {
    isActive: () => active.value,
    isBound: (source) => bound.has(source),
    onSources: (down) => masks.push(maskOfSources(down, compiled)),
  });
  kb.attach();
  const fire = (type: string, code: string, extra: Record<string, unknown> = {}): { prevented: boolean } => {
    const result = { prevented: false };
    const event = Object.assign(new Event(type), {
      code,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => {
        result.prevented = true;
      },
      ...extra,
    });
    win.dispatchEvent(event);
    return result;
  };
  return {
    win,
    kb,
    masks,
    active,
    press: (code, extra) => fire('keydown', code, extra),
    release: (code) => fire('keyup', code),
  };
}

describe('KeyboardInput', () => {
  it('стрелки и WASD — направления; Space/Z — прыжок; X — огонь', () => {
    const h = harness();
    h.press('ArrowLeft');
    h.press('KeyD');
    h.press('Space');
    h.press('KeyX');
    expect(h.masks.at(-1)).toBe(
      actionBit('left') | actionBit('right') | actionBit('jump') | actionBit('confirm') | actionBit('fire'),
    );
  });

  it('работает по KeyboardEvent.code: русская раскладка (key = «ф») не ломает управление', () => {
    const h = harness();
    h.press('KeyA', { key: 'ф' });
    expect(h.masks.at(-1)).toBe(actionBit('left'));
    h.release('KeyA');
    expect(h.masks.at(-1)).toBe(0);
  });

  it('автоповтор ОС (repeat: true) игнорируется, но стрелки всё равно не прокручивают страницу', () => {
    const h = harness();
    h.press('ArrowRight');
    const count = h.masks.length;
    const repeated = h.press('ArrowRight', { repeat: true });
    expect(h.masks.length).toBe(count);
    expect(repeated.prevented).toBe(true);
  });

  it('вне активной игровой области клавиши не перехватываются и не блокируют прокрутку', () => {
    const h = harness();
    h.active.value = false;
    const result = h.press('Space');
    expect(result.prevented).toBe(false);
    expect(h.masks).toEqual([]);
  });

  it('непривязанные клавиши игра не трогает', () => {
    const h = harness();
    const result = h.press('KeyQ');
    expect(result.prevented).toBe(false);
    expect(h.masks).toEqual([]);
  });

  it('сочетания с Ctrl/Alt/Meta не перехватываются', () => {
    const h = harness();
    expect(h.press('KeyP', { ctrlKey: true }).prevented).toBe(false);
    expect(h.press('KeyA', { metaKey: true }).prevented).toBe(false);
    expect(h.masks).toEqual([]);
  });

  it('поля ввода, кнопки и списки не перехватываются', () => {
    for (const tag of ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']) {
      const h = harness(tag);
      expect(h.press('Space').prevented).toBe(false);
      expect(h.masks).toEqual([]);
    }
    expect(isInteractiveTarget({ tagName: 'div' })).toBe(false);
    expect(isInteractiveTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isInteractiveTarget(null)).toBe(false);
  });

  it('отпускание клавиши обрабатывается, даже если фокус успел уйти', () => {
    const h = harness();
    h.press('ArrowLeft');
    h.active.value = false;
    h.release('ArrowLeft');
    expect(h.masks.at(-1)).toBe(0);
  });

  it('releaseAll сбрасывает всё удерживаемое; keyup после этого ничего не делает', () => {
    const h = harness();
    h.press('ArrowLeft');
    h.kb.releaseAll();
    expect(h.masks.at(-1)).toBe(0);
    const count = h.masks.length;
    h.release('ArrowLeft');
    expect(h.masks.length).toBe(count);
  });

  it('detach снимает слушатели и сбрасывает ввод', () => {
    const h = harness();
    h.press('ArrowLeft');
    h.kb.detach();
    const count = h.masks.length;
    h.press('ArrowRight');
    expect(h.masks.length).toBe(count);
  });
});
