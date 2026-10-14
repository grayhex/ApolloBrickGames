import { describe, expect, it } from 'vitest';
import { History } from '../../src/editor/history';

describe('история изменений', () => {
  it('undo/redo, и новая правка после отмены очищает ветку redo', () => {
    const h = new History('a');
    h.commit('b');
    h.commit('c');
    expect(h.undo()).toBe('b');
    expect(h.canRedo).toBe(true);
    h.commit('x');
    expect(h.canRedo).toBe(false);
    expect(h.present).toBe('x');
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
  });

  it('мазок — одна операция, даже если внутри много промежуточных значений', () => {
    const h = new History(0);
    h.begin();
    for (let i = 1; i <= 50; i++) h.replace(i);
    expect(h.end()).toBe(true);
    expect(h.present).toBe(50);
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  it('операция без изменений не попадает в историю; cancel возвращает начало', () => {
    const h = new History(5);
    h.begin();
    h.replace(5);
    expect(h.end()).toBe(false);
    expect(h.canUndo).toBe(false);
    h.begin();
    h.replace(9);
    h.cancel();
    expect(h.present).toBe(5);
    expect(h.commit(5)).toBe(false);
  });

  it('предел глубины отбрасывает самые старые записи', () => {
    const h = new History(0, 3);
    for (let i = 1; i <= 10; i++) h.commit(i);
    let steps = 0;
    while (h.undo() !== null) steps++;
    expect(steps).toBe(3);
    expect(h.present).toBe(7);
  });

  it('undo посреди незавершённой операции сначала завершает её', () => {
    const h = new History('a');
    h.begin();
    h.replace('b');
    expect(h.undo()).toBe('a');
    expect(h.present).toBe('a');
    expect(h.redo()).toBe('b');
  });
});
