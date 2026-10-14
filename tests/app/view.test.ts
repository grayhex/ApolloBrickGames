import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, parseView, VIEWS } from '../../src/app/view';

describe('вид игрушки', () => {
  it('по умолчанию игрушка закрыта', () => {
    expect(DEFAULT_VIEW).toBe('closed');
    expect(parseView(null)).toBe('closed');
    expect(parseView('мусор')).toBe('closed');
  });

  it('адрес может задать вид явно; `?power=on` раскрывает игрушку, если вид не задан', () => {
    for (const view of VIEWS) expect(parseView(view)).toBe(view);
    expect(parseView(null, true)).toBe('full');
    expect(parseView('screen', true)).toBe('screen');
    expect(parseView('closed', true)).toBe('closed');
  });
});
