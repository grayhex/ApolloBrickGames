import type { ContentPack, LevelDef } from '../content/schema';
import { makeTestPack } from '../editor/testPack';
import { t } from './i18n';

/** Сколько оригинальных уровней в режиме MARIO (по упаковке устройства: «MARIO(9)»). */
export const ORIGINAL_LEVEL_COUNT = 9;

/**
 * Девять уровней режима MARIO: номер → id уровня в пакете. Это «геймплейное приближение»: расстановка придумана по видео геймплея
 * и общей логике игры (tools/levels/generate.mjs), а не восстановлена 1 в 1 — оригинальные уровни владелец передаст позже.
 * Когда оригинальный уровень будет восстановлен, он заменяет приближение под тем же номером.
 */
export const ORIGINAL_LEVELS: Readonly<Record<number, string>> = {
  1: 'mario-1',
  2: 'mario-2',
  3: 'mario-3',
  4: 'mario-4',
  5: 'mario-5',
  6: 'mario-6',
  7: 'mario-7',
  8: 'mario-8',
  9: 'mario-9',
};

export interface OriginalSlot {
  number: number;
  /** null — уровень ещё не восстановлен. */
  levelId: string | null;
}

/** Подсказка к плитке уровня на текущем языке. */
export const slotTitle = (slot: OriginalSlot): string => (slot.levelId ? t('lv.open', { n: slot.number }) : t('lv.locked', { n: slot.number }));

export function originalSlots(pack: ContentPack): OriginalSlot[] {
  return Array.from({ length: ORIGINAL_LEVEL_COUNT }, (_, index) => {
    const number = index + 1;
    const levelId = ORIGINAL_LEVELS[number];
    const present = levelId !== undefined && pack.levels.some((level) => level.id === levelId) ? levelId : null;
    return { number, levelId: present };
  });
}

/**
 * Готовые пользовательские уровни: лежат в пакете, но не входят в девять оригинальных; стоят в выпадающем списке «Пользовательские»
 * рядом с картами из редактора. Первый (`custom-1`) сгенерирован по общей логике движка (tools/levels/generate.mjs).
 */
export interface BundledLevel {
  levelId: string;
  /** Названия на текущем языке берутся из словаря по этим ключам. */
  name: 'lv.gen1';
  title: 'lv.gen1.title';
}

export const BUNDLED_LEVELS: readonly BundledLevel[] = [{ levelId: 'custom-1', name: 'lv.gen1', title: 'lv.gen1.title' }];

/** Готовые уровни, которые есть в пакете. */
export const bundledLevels = (pack: ContentPack): BundledLevel[] => BUNDLED_LEVELS.filter((b) => pack.levels.some((level) => level.id === b.levelId));

/** Что запущено сейчас: оригинальный уровень по номеру, готовый пользовательский уровень или карта из редактора. */
export type LevelRef = { kind: 'original'; number: number } | { kind: 'bundled'; levelId: string } | { kind: 'user'; projectId: string };

export const sameLevel = (a: LevelRef, b: LevelRef): boolean => {
  if (a.kind === 'original') return b.kind === 'original' && a.number === b.number;
  if (a.kind === 'bundled') return b.kind === 'bundled' && a.levelId === b.levelId;
  return b.kind === 'user' && a.projectId === b.projectId;
};

/**
 * Какая плитка подсвечена после начала участка `levelId`: когда игрок проходит уровень, игра сама переходит на следующий (`mario-N → mario-N+1`),
 * и подсветка должна идти следом. Карта из редактора и участок вне девяти слотов (тестовый по видео) подсветку не меняют.
 */
export function refAfterLevelStart(current: LevelRef, slots: readonly OriginalSlot[], levelId: string): LevelRef {
  if (current.kind !== 'original') return current;
  const slot = slots.find((s) => s.levelId === levelId);
  return slot && slot.number !== current.number ? { kind: 'original', number: slot.number } : current;
}

/** Слот, с которого пакет начинается по умолчанию (`firstLevel`). */
export function defaultLevelRef(pack: ContentPack): LevelRef {
  const slot = originalSlots(pack).find((s) => s.levelId === pack.manifest.firstLevel);
  return { kind: 'original', number: slot?.number ?? 1 };
}

/**
 * С какого уровня начинается страница: `?level=N` (слот 1–9) или `?level=id` (любой уровень пакета, например `tunnel-run` —
 * тестовый уровень по видео, нужен тестам; `?level=custom-1` — готовый пользовательский уровень); иначе — первый уровень пакета. Уровень вне девяти слотов получает «слот 0»:
 * ни одна плитка панели не подсвечена. В игре уровень сменяется кнопками панели.
 */
export function startingLevel(pack: ContentPack, query: string | null): { ref: LevelRef; pack: ContentPack } {
  const slots = originalSlots(pack);
  const number = /^\d+$/.test(query ?? '') ? Number.parseInt(query ?? '', 10) : Number.NaN;
  const slot = slots.find((s) => s.levelId !== null && (s.number === number || s.levelId === query));
  if (slot?.levelId) return { ref: { kind: 'original', number: slot.number }, pack: originalPack(pack, slot.levelId) };
  const bundled = bundledLevels(pack).find((b) => b.levelId === query);
  if (bundled) return { ref: { kind: 'bundled', levelId: bundled.levelId }, pack: originalPack(pack, bundled.levelId) };
  if (query !== null && pack.levels.some((level) => level.id === query)) return { ref: { kind: 'original', number: 0 }, pack: originalPack(pack, query) };
  return { ref: defaultLevelRef(pack), pack };
}

/** Пакет данных для запуска оригинального уровня: тот же пакет, но игра начинается с нужного уровня. */
export function originalPack(pack: ContentPack, levelId: string): ContentPack {
  return { ...pack, manifest: { ...pack.manifest, firstLevel: levelId } };
}

/** Пакет данных для запуска карты из редактора: единственный уровень — её копия (правила, экран и ресурсы — как у игры). */
export function userPack(pack: ContentPack, level: LevelDef): ContentPack {
  return makeTestPack(pack, level);
}
