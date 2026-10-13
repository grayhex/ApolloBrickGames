import { describe, expect, it } from 'vitest';
import { levelToJson } from '../../src/content/serialize';
import { ContentError, validateAssetCatalog, validateLevel } from '../../src/content/validate';
import { describeObjectTypes, validationEnv, DEMO_BEHAVIORS } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { loadDemoPack, loadRawDemoPack } from '../helpers/content';
import { rawLevel } from '../helpers/builders';

const env = validationEnv(undefined, GLYPH_NAMES);

describe('сериализация уровня (общий формат для игры и будущего редактора)', () => {
  it('уровень → JSON → уровень без потерь для всех уровней демо-пакета', () => {
    const pack = loadDemoPack();
    for (const level of pack.levels) {
      const json = levelToJson(level);
      expect(validateLevel(json, pack.assets, env, level.id)).toEqual(level);
    }
  });

  it('вывод стабилен: двойная сериализация даёт тот же текст; значения по умолчанию опущены', () => {
    const pack = loadDemoPack();
    const level = pack.levels[0];
    if (!level) throw new Error('нет уровня');
    const text = JSON.stringify(levelToJson(level));
    expect(JSON.stringify(levelToJson(validateLevel(JSON.parse(text), pack.assets, env)))).toBe(text);
    const finish = (levelToJson(level)['objects'] as Record<string, unknown>[]).find((o) => o['id'] === 'finish-1');
    expect(finish).not.toHaveProperty('w');
    expect(finish).not.toHaveProperty('h');
  });

  it('JSON файла и экспортированный JSON описывают один и тот же уровень', () => {
    const raw = loadRawDemoPack();
    const pack = loadDemoPack();
    const fromFile = validateLevel(raw.levels[1], pack.assets, env);
    expect(validateLevel(levelToJson(fromFile), pack.assets, env)).toEqual(fromFile);
  });
});

describe('подготовка к редактору: адресные ошибки и каталог типов', () => {
  it('ошибка содержит машинно-читаемый путь до клетки/объекта', () => {
    const assets = validateAssetCatalog(loadRawDemoPack().assets, env);
    const broken = {
      ...rawLevel({ rows: ['..?..', '.....', '#####'], start: { x: 1, y: 1 }, objects: [{ id: 'x', type: 'dragon', x: 1, y: 1 }] }),
    };
    try {
      validateLevel(broken, assets, env, 'broken');
      throw new Error('ожидалась ошибка');
    } catch (error) {
      expect(error).toBeInstanceOf(ContentError);
      const { details } = error as ContentError;
      expect(details.map((d) => d.path)).toContain('$.rows[0][2]');
      expect(details.map((d) => d.path)).toContain('$.objects[0].type');
      expect((error as ContentError).issues[0]).toMatch(/^\$\./);
    }
  });

  it('типы объектов описаны декларативно: подпись, твёрдость и параметры с диапазонами', () => {
    const types = describeObjectTypes(DEMO_BEHAVIORS);
    expect(types.map((t) => t.type).sort()).toEqual(['finish', 'hazard', 'patroller', 'target']);
    const target = types.find((t) => t.type === 'target');
    expect(target).toMatchObject({ label: 'Мишень', solid: true });
    expect(target?.params.map((p) => p.key)).toEqual(['hp', 'score']);
    expect(types.find((t) => t.type === 'hazard')?.params).toEqual([]);
    // Диапазоны из описания — те же, что проверяет валидатор.
    const assets = validateAssetCatalog(loadRawDemoPack().assets, env);
    const badHp = rawLevel({ rows: ['...', '...', '###'], start: { x: 0, y: 1 }, objects: [{ id: 't', type: 'target', x: 1, y: 1, params: { hp: 100 } }] });
    expect(() => validateLevel(badHp, assets, env)).toThrow(/«hp» — целое число 1…99/);
  });
});
