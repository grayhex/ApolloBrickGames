import { describe, expect, it } from 'vitest';
import { defaultLevelRef, ORIGINAL_LEVEL_COUNT, originalPack, originalSlots, sameLevel, userPack } from '../../src/app/levels';
import { createContext, Game } from '../../src/core';
import { levelOf, loadRoomPack } from '../helpers/content';

const pack = loadRoomPack();

describe('оригинальные уровни 1–9', () => {
  it('девять слотов; заняты только те, чьи уровни есть в пакете (сейчас — № 1, тестовый по видео)', () => {
    const slots = originalSlots(pack);
    expect(slots).toHaveLength(ORIGINAL_LEVEL_COUNT);
    expect(slots.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(slots[0]).toMatchObject({ number: 1, levelId: 'tunnel-run' });
    expect(slots[0]?.title).toMatch(/тестовый/);
    expect(slots.slice(1).every((s) => s.levelId === null && /не восстановлен/.test(s.title))).toBe(true);
  });

  it('слот не открывается, если уровня нет в пакете', () => {
    const without = { ...pack, levels: pack.levels.filter((l) => l.id !== 'tunnel-run') };
    expect(originalSlots(without).every((s) => s.levelId === null)).toBe(true);
  });

  it('запуск по умолчанию совпадает с первым уровнем пакета; ссылки на уровни сравниваются по виду и номеру', () => {
    expect(defaultLevelRef(pack)).toEqual({ kind: 'original', number: 1 });
    expect(sameLevel({ kind: 'original', number: 1 }, { kind: 'original', number: 1 })).toBe(true);
    expect(sameLevel({ kind: 'original', number: 1 }, { kind: 'original', number: 2 })).toBe(false);
    expect(sameLevel({ kind: 'user', projectId: 'a' }, { kind: 'user', projectId: 'a' })).toBe(true);
    expect(sameLevel({ kind: 'user', projectId: 'a' }, { kind: 'original', number: 1 })).toBe(false);
  });
});

describe('пакеты для запуска', () => {
  it('оригинальный уровень: игра начинается с него, остальной пакет не меняется', () => {
    const launched = originalPack(pack, 'demo-room');
    expect(launched.levels).toBe(pack.levels);
    expect(new Game(createContext(launched)).state.levelId).toBe('demo-room');
    expect(new Game(createContext(pack)).state.levelId).toBe('tunnel-run'); // исходный пакет не тронут
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
