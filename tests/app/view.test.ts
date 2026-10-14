import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, openedView, padWanted, PHONE_QUERY, parseView, VIEWS } from '../../src/app/view';

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

describe('телефон', () => {
  it('на узком экране крышка раскрывается сразу в «только экран» (под ним пульт для телефона), на широком — в «полную»', () => {
    expect(openedView(true)).toBe('screen');
    expect(openedView(false)).toBe('full');
    expect(openedView(true, true)).toBe('screen');
    expect(openedView(false, true)).toBe('full');
  });

  it('пульт выключен явно — и на телефоне крышка открывается целиком, с настоящими кнопками корпуса', () => {
    expect(openedView(true, false)).toBe('full');
  });

  it('пульт нужен по выбору пользователя; без выбора — только в «только экран»; под закрытой крышкой — никогда', () => {
    expect(padWanted('screen', null)).toBe(true);
    expect(padWanted('full', null)).toBe(false);
    expect(padWanted('full', true)).toBe(true); // включили в «полной»
    expect(padWanted('screen', false)).toBe(false); // выключили в «только экран»
    expect(padWanted('screen', true)).toBe(true);
    expect(padWanted('full', false)).toBe(false);
    for (const pad of [null, true, false] as const) expect(padWanted('closed', pad)).toBe(false);
  });

  it('порог узкого экрана — тот же, что в styles.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
    expect(PHONE_QUERY).toBe('(max-width: 899px)');
    expect(css).toContain(`@media ${PHONE_QUERY} {\n  body[data-chrome='toy'] .arena[data-pad='on'] .deck {`);
  });
});

