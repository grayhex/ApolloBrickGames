import { describe, expect, it } from 'vitest';
import { actionBit, maskOf, NEUTRAL_FRAME } from '../../src/core';
import { ActionTracker, resolveOpposites, restrictFrame } from '../../src/input/tracker';

const L = actionBit('left');
const R = actionBit('right');
const U = actionBit('up');
const D = actionBit('down');
const J = actionBit('jump');
const F = actionBit('fire');

describe('ActionTracker: pressed / held / released', () => {
  it('нажатие даёт pressed+held один раз, затем только held; отпускание — released', () => {
    const t = new ActionTracker();
    t.setSource('kb', J);
    expect(t.consume()).toEqual({ pressed: J, held: J, released: 0 });
    expect(t.consume()).toEqual({ pressed: 0, held: J, released: 0 });
    t.setSource('kb', 0);
    expect(t.consume()).toEqual({ pressed: 0, held: 0, released: J });
    expect(t.consume()).toEqual(NEUTRAL_FRAME);
  });

  it('короткое нажатие между тактами не теряется: pressed+held+released в одном кадре, дальше — тишина', () => {
    const t = new ActionTracker();
    t.setSource('kb', F);
    t.setSource('kb', 0);
    expect(t.consume()).toEqual({ pressed: F, held: F, released: F });
    expect(t.consume()).toEqual(NEUTRAL_FRAME);
  });

  it('догоняющие такты в одном кадре отрисовки не повторяют pressed', () => {
    const t = new ActionTracker();
    t.setSource('kb', J | R);
    const frames = [t.consume(), t.consume(), t.consume()];
    expect(frames.map((f) => f.pressed)).toEqual([J | R, 0, 0]);
    expect(frames.map((f) => f.held)).toEqual([J | R, J | R, J | R]);
  });

  it('повторное нажатие после отпускания даёт новый pressed', () => {
    const t = new ActionTracker();
    t.setSource('kb', J);
    t.consume();
    t.setSource('kb', 0);
    t.consume();
    t.setSource('kb', J);
    expect(t.consume().pressed).toBe(J);
  });

  it('изменение без смены маски ничего не генерирует', () => {
    const t = new ActionTracker();
    t.setSource('kb', L);
    t.consume();
    t.setSource('kb', L);
    expect(t.consume()).toEqual({ pressed: 0, held: L, released: 0 });
  });

  it('reset забывает удерживаемое и не генерирует фронтов', () => {
    const t = new ActionTracker();
    t.setSource('kb', L | J);
    t.reset();
    expect(t.down).toBe(0);
    expect(t.consume()).toEqual(NEUTRAL_FRAME);
  });
});

describe('ActionTracker: несколько источников и конфликты', () => {
  it('источники объединяются по ИЛИ: действие держится, пока нажато хотя бы в одном', () => {
    const t = new ActionTracker();
    t.setSource('kb', R);
    t.setSource('pad', R);
    expect(t.consume().pressed).toBe(R); // один фронт, а не два
    t.setSource('kb', 0);
    expect(t.consume()).toEqual({ pressed: 0, held: R, released: 0 });
    t.setSource('pad', 0);
    expect(t.consume()).toEqual({ pressed: 0, held: 0, released: R });
  });

  it('left+right одновременно — нейтраль, и так же для up+down', () => {
    expect(resolveOpposites(L | R)).toBe(0);
    expect(resolveOpposites(U | D)).toBe(0);
    expect(resolveOpposites(L | R | U)).toBe(U);
    expect(resolveOpposites(L | J)).toBe(L | J);
  });

  it('конфликт между источниками (клавиатура влево, геймпад вправо) даёт нейтраль независимо от порядка', () => {
    const a = new ActionTracker();
    a.setSource('kb', L);
    a.setSource('pad', R);
    const b = new ActionTracker();
    b.setSource('pad', R);
    b.setSource('kb', L);
    expect(a.down).toBe(0);
    expect(b.down).toBe(0);
  });

  it('при отпускании одной из конфликтующих сторон остаётся другая — с новым фронтом', () => {
    const t = new ActionTracker();
    t.setSource('kb', L | R);
    t.consume();
    t.setSource('kb', L);
    expect(t.consume()).toEqual({ pressed: L, held: L, released: 0 });
  });

  it('одинаковая последовательность событий даёт одинаковые кадры (детерминизм)', () => {
    const script = (t: ActionTracker): unknown[] => {
      const out: unknown[] = [];
      t.setSource('kb', L);
      out.push(t.consume());
      t.setSource('pad', R | J);
      t.setSource('kb', 0);
      out.push(t.consume());
      t.setSource('pad', 0);
      t.setSource('pad', F);
      out.push(t.consume(), t.consume());
      return out;
    };
    expect(script(new ActionTracker())).toEqual(script(new ActionTracker()));
  });

  it('restrictFrame оставляет только выбранные действия', () => {
    const frame = { pressed: J | maskOf('confirm'), held: J | L, released: F };
    expect(restrictFrame(frame, J | L)).toEqual({ pressed: J, held: J | L, released: 0 });
  });
});
