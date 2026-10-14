import type { ContentPack, LevelDef } from '../content/schema';
import { makeTestPack } from '../editor/testPack';

/** Сколько оригинальных уровней в режиме MARIO (по упаковке устройства: «MARIO(9)»). */
export const ORIGINAL_LEVEL_COUNT = 9;

/**
 * Какие из девяти оригинальных уровней уже есть в пакете: номер → id уровня. Оригинальные уровни владелец
 * ещё не передал, поэтому пока занят только № 1 — тестовый уровень по видео; остальные слоты закрыты.
 * Когда появится новый уровень, достаточно добавить его в пакет и сюда.
 */
export const ORIGINAL_LEVELS: Readonly<Record<number, string>> = { 1: 'tunnel-run' };

export interface OriginalSlot {
  number: number;
  /** null — уровень ещё не восстановлен. */
  levelId: string | null;
  title: string;
}

export function originalSlots(pack: ContentPack): OriginalSlot[] {
  return Array.from({ length: ORIGINAL_LEVEL_COUNT }, (_, index) => {
    const number = index + 1;
    const levelId = ORIGINAL_LEVELS[number];
    const present = levelId !== undefined && pack.levels.some((level) => level.id === levelId) ? levelId : null;
    return {
      number,
      levelId: present,
      title: present ? `Уровень ${number} — тестовый, по видео (оригинал ещё не восстановлен)` : `Уровень ${number} — ещё не восстановлен`,
    };
  });
}

/** Что запущено сейчас: оригинальный уровень по номеру или карта из редактора. */
export type LevelRef = { kind: 'original'; number: number } | { kind: 'user'; projectId: string };

export const sameLevel = (a: LevelRef, b: LevelRef): boolean =>
  a.kind === 'original' ? b.kind === 'original' && a.number === b.number : b.kind === 'user' && a.projectId === b.projectId;

/** Слот, с которого пакет начинается по умолчанию (`firstLevel`). */
export function defaultLevelRef(pack: ContentPack): LevelRef {
  const slot = originalSlots(pack).find((s) => s.levelId === pack.manifest.firstLevel);
  return { kind: 'original', number: slot?.number ?? 1 };
}

/** Пакет данных для запуска оригинального уровня: тот же пакет, но игра начинается с нужного уровня. */
export function originalPack(pack: ContentPack, levelId: string): ContentPack {
  return { ...pack, manifest: { ...pack.manifest, firstLevel: levelId } };
}

/** Пакет данных для запуска карты из редактора: единственный уровень — её копия (правила, экран и ресурсы — как у игры). */
export function userPack(pack: ContentPack, level: LevelDef): ContentPack {
  return makeTestPack(pack, level);
}
