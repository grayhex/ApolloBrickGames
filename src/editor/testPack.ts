import type { ContentPack, LevelDef } from '../content/schema';

/**
 * Пакет для тестового запуска: профиль экрана, правила и ресурсы — те же, что у игры, но единственный
 * уровень — копия редактируемой карты из памяти. Редактируемый документ при этом не изменяется.
 */
export function makeTestPack(base: ContentPack, level: LevelDef): ContentPack {
  const copy = structuredClone(level);
  return {
    ...base,
    // Карта из редактора — проба механики, а не игра на время: таймер игры (400 единиц) для неё отключён.
    rules: { ...base.rules, params: { ...base.rules.params, timerLimitTicks: 0 } },
    manifest: { ...base.manifest, levels: [`levels/${copy.id}.json`], firstLevel: copy.id },
    levels: [copy],
  };
}
