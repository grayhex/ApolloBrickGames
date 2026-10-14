import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLang, onLangChange, richParts, setLang, t } from '../../src/app/i18n';
import { helpRows } from '../../src/app/help';
import { originalSlots, slotTitle } from '../../src/app/levels';
import { MESSAGES, type MsgKey } from '../../src/app/messages';
import { describeSource, DEFAULT_KEYBOARD_BINDINGS } from '../../src/input/bindings';
import { loadRoomPack } from '../helpers/content';

afterEach(() => setLang('ru'));

const KEYS = Object.keys(MESSAGES.ru) as MsgKey[];
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
const bold = (text: string): number => (text.match(/\*\*/g) ?? []).length;

describe('словари интерфейса', () => {
  it('английский словарь содержит все ключи русского и ничего лишнего', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual([...KEYS].sort());
  });

  it('тексты не пустые и не совпадают дословно там, где это не название кнопки', () => {
    for (const key of KEYS) {
      expect(MESSAGES.ru[key].trim(), `ru ${key}`).not.toBe('');
      expect(MESSAGES.en[key].trim(), `en ${key}`).not.toBe('');
    }
    // Перевод — настоящий: основные тексты на двух языках различаются.
    for (const key of ['info.journey.h', 'help.title', 'set.title', 'ctl.title', 'info.note', 'tgl.compactOff'] as const) {
      expect(MESSAGES.en[key]).not.toBe(MESSAGES.ru[key]);
    }
  });

  it('подстановки {имя} и жирные выделения совпадают в обоих языках', () => {
    for (const key of KEYS) {
      expect(placeholders(MESSAGES.en[key]), key).toEqual(placeholders(MESSAGES.ru[key]));
      expect(bold(MESSAGES.en[key]), key).toBe(bold(MESSAGES.ru[key]));
    }
  });

  it('в английском тексте нет кириллицы (кроме названия языка в подсказке переключателя)', () => {
    for (const key of KEYS.filter((k) => k !== 'corner.langTitle')) expect(MESSAGES.en[key], key).not.toMatch(/[А-Яа-яЁё]/);
    expect(MESSAGES.en['corner.langTitle']).toBe('Switch language to Русский');
  });
});

describe('t, язык и подписки', () => {
  it('русский по умолчанию; смена языка меняет тексты и зовёт подписчиков один раз', () => {
    const seen = vi.fn();
    const off = onLangChange(seen);
    expect(getLang()).toBe('ru');
    expect(t('common.close')).toBe('Закрыть');
    setLang('en');
    expect(getLang()).toBe('en');
    expect(t('common.close')).toBe('Close');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('en');
    setLang('en'); // тот же язык — не событие
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    setLang('ru');
    expect(seen).toHaveBeenCalledTimes(1); // отписались
  });

  it('{имя} подставляется; неизвестное имя остаётся как есть', () => {
    expect(t('lv.play', { name: 'Карта', w: 20, h: 6 })).toBe('Играть: Карта (20 × 6)');
    setLang('en');
    expect(t('lv.play', { name: 'Map', w: 20, h: 6 })).toBe('Play: Map (20 × 6)');
    expect(t('lv.play', { name: 'Map' })).toBe('Play: Map ({w} × {h})');
  });

  it('richParts: **жирное** отделяется от обычного текста; разметка не интерпретируется', () => {
    expect(richParts('Игра **MARIO** (9 уровней), **TETRIS**.')).toEqual([
      { text: 'Игра ', bold: false },
      { text: 'MARIO', bold: true },
      { text: ' (9 уровней), ', bold: false },
      { text: 'TETRIS', bold: true },
      { text: '.', bold: false },
    ]);
    expect(richParts('<img src=x>')).toEqual([{ text: '<img src=x>', bold: false }]); // всё — обычный текст
    expect(richParts('без выделений')).toEqual([{ text: 'без выделений', bold: false }]);
  });
});

describe('локализованные имена и подписи', () => {
  it('имена клавиш и кнопок геймпада по языкам', () => {
    expect(describeSource('k:Space')).toBe('Пробел');
    expect(describeSource('k:Space', 'en')).toBe('Space');
    expect(describeSource('k:ShiftLeft', 'en')).toBe('Left Shift');
    expect(describeSource('k:KeyA', 'en')).toBe('A');
    expect(describeSource('k:ArrowLeft', 'en')).toBe('←');
    expect(describeSource('b:3', 'en')).toBe('Button 3');
    expect(describeSource('a:1:-', 'en')).toBe('Axis 1 −');
  });

  it('таблица справки: UP — прыжок (по упаковке), DOWN в режиме MARIO не используется; клавиши — по привязкам', () => {
    const ru = helpRows(DEFAULT_KEYBOARD_BINDINGS);
    expect(ru.find((r) => r.button === 'UP')?.what).toBe('прыжок вверх');
    expect(ru.find((r) => r.button === 'DOWN')?.what).toMatch(/не используется/);
    expect(ru.find((r) => r.button === 'JUMP')?.keys).toMatch(/Пробел/);
    setLang('en');
    const en = helpRows(DEFAULT_KEYBOARD_BINDINGS);
    expect(en.find((r) => r.button === 'UP')?.what).toBe('jump upwards');
    expect(en.find((r) => r.button === 'DOWN')?.what).toMatch(/not used/);
    expect(en.find((r) => r.button === 'JUMP')?.keys).toMatch(/Space/);
    expect(en.map((r) => r.button)).toEqual(ru.map((r) => r.button));
  });

  it('подсказки к плиткам уровней на двух языках', () => {
    const slots = originalSlots(loadRoomPack());
    expect(slotTitle(slots[0]!)).toMatch(/тестовый/);
    expect(slotTitle(slots[3]!)).toBe('Уровень 4 — ещё не восстановлен');
    setLang('en');
    expect(slotTitle(slots[0]!)).toMatch(/test level/);
    expect(slotTitle(slots[3]!)).toBe('Level 4 — not restored yet');
  });
});
