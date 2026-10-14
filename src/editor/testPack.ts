import type { ContentPack, LevelDef } from '../content/schema';

/**
 * Пакет для тестового запуска: профиль экрана, правила и ресурсы — те же, что у игры, но единственный
 * уровень — копия редактируемой карты из памяти. Редактируемый документ при этом не изменяется.
 */
export function makeTestPack(base: ContentPack, level: LevelDef): ContentPack {
  const copy = structuredClone(level);
  return {
    ...base,
    manifest: { ...base.manifest, levels: [`levels/${copy.id}.json`], firstLevel: copy.id },
    levels: [copy],
  };
}
