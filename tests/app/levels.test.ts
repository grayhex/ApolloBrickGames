import { describe, expect, it } from 'vitest';
import { defaultLevelRef, ORIGINAL_LEVEL_COUNT, originalPack, originalSlots, sameLevel, slotTitle, startingLevel, userPack, type OriginalSlot } from '../../src/app/levels';
import { createContext, Game } from '../../src/core';
import { levelOf, loadRoomPack } from '../helpers/content';

const pack = loadRoomPack();

describe('оригинальные уровни 1–9', () => {
  it('девять слотов, все заняты уровнями mario-1…9 (геймплейное приближение)', () => {
    const slots = originalSlots(pack);
    expect(slots).toHaveLength(ORIGINAL_LEVEL_COUNT);
    expect(slots.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(slots.map((s) => s.levelId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `mario-${n}`));
    expect(slots.every((s) => /приближение/.test(slotTitle(s)))).toBe(true);
  });

  it('слот не открывается, если уровня нет в пакете', () => {
    const without = { ...pack, levels: pack.levels.filter((l) => l.id !== 'mario-4') };
    const slots = originalSlots(without);
    expect(slots[3]).toEqual({ number: 4, levelId: null });
    expect(slotTitle(slots[3] as OriginalSlot)).toMatch(/не восстановлен/);
    expect(slots.filter((s) => s.levelId === null)).toHaveLength(1);
    expect(originalSlots({ ...pack, levels: [] }).every((s) => s.levelId === null)).toBe(true);
  });

  it('запуск по умолчанию совпадает с первым уровнем пакета; ссылки на уровни сравниваются по виду и номеру', () => {
    expect(defaultLevelRef(pack)).toEqual({ kind: 'original', number: 1 });
    expect(sameLevel({ kind: 'original', number: 1 }, { kind: 'original', number: 1 })).toBe(true);
    expect(sameLevel({ kind: 'original', number: 1 }, { kind: 'original', number: 2 })).toBe(false);
    expect(sameLevel({ kind: 'user', projectId: 'a' }, { kind: 'user', projectId: 'a' })).toBe(true);
    expect(sameLevel({ kind: 'user', projectId: 'a' }, { kind: 'original', number: 1 })).toBe(false);
  });

  it('?level=N или ?level=id открывает нужный уровень; неверное значение и пустой слот — уровень по умолчанию', () => {
    const at = (query: string | null) => startingLevel(pack, query);
    expect(at(null).ref).toEqual({ kind: 'original', number: 1 });
    expect(at('7').ref).toEqual({ kind: 'original', number: 7 });
    expect(new Game(createContext(at('7').pack)).state.levelId).toBe('mario-7');
    expect(at('0').ref).toEqual({ kind: 'original', number: 1 });
    expect(at('10').ref).toEqual({ kind: 'original', number: 1 });
    expect(at('abc').ref).toEqual({ kind: 'original', number: 1 });
    expect(at('mario-5').ref).toEqual({ kind: 'original', number: 5 }); // id уровня слота
    // Уровень вне девяти слотов (тестовый по видео): открывается, плитка не подсвечена.
    expect(at('tunnel-run').ref).toEqual({ kind: 'original', number: 0 });
    expect(new Game(createContext(at('tunnel-run').pack)).state.levelId).toBe('tunnel-run');
    expect(startingLevel({ ...pack, levels: pack.levels.filter((l) => l.id !== 'mario-3') }, '3').ref).toEqual({ kind: 'original', number: 1 });
  });
});

describe('пакеты для запуска', () => {
  it('оригинальный уровень: игра начинается с него, остальной пакет не меняется', () => {
    const launched = originalPack(pack, 'demo-room');
    expect(launched.levels).toBe(pack.levels);
    expect(new Game(createContext(launched)).state.levelId).toBe('demo-room');
    expect(new Game(createContext(pack)).state.levelId).toBe('mario-1'); // исходный пакет не тронут
  });

  it('карта из редактора: единственный уровень — её копия; правила и экран — как у игры', () => {
    const level = levelOf(pack, 'demo-room');
    const launched = userPack(pack, { ...level, id: 'my-map' });
    expect(launched.levels.map((l) => l.id)).toEqual(['my-map']);
    expect(launched.screen).toBe(pack.screen);
    expect(launched.rules).toBe(pack.rules);
    expect(new Game(createContext(launched)).state.levelId).toBe('my-map');
  });
});
