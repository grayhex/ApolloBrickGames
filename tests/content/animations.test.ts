import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentLoadError, loadContentPack, type FetchJson } from '../../src/app/loadContent';
import { assemblePack, ContentError, validateAnimations, validateRuleSet } from '../../src/content/validate';
import { validationEnv } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { loadRawPack, loadRoomPack, readJson } from '../helpers/content';

const env = validationEnv(undefined, GLYPH_NAMES);

function issuesOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ContentError) return error.issues.join('\n');
    throw error;
  }
  return '';
}

const validAnimations = (): Record<string, unknown> => ({
  schemaVersion: 1,
  id: 'a',
  status: 'demo',
  bump: { ticks: 5 },
  intro: {
    blankTicks: 1,
    fillTicks: 2,
    holdTicks: 0,
    dissolveTicks: 2,
    emptyTicks: 1,
    coverage: 0.5,
    stepTicks: 3,
    routes: { 'tunnel-run': [[2, 5], [2, 4], [2, 3], [1, 3], [1, 4], [1, 5]] },
  },
});

describe('animations.json: проверка формата', () => {
  it('основной пакет несёт отскок, интро с маршрутом в 18 клеток и сценарий входа (выход героя из ямы)', () => {
    const anim = loadRoomPack().animations;
    expect(anim?.id).toBe('room-animations');
    expect(anim?.status).toBe('demo');
    expect(anim?.bump).toEqual({ ticks: 5 });
    expect(anim?.intro?.routes['tunnel-run']).toHaveLength(18);
    const script = anim?.entry?.scripts['tunnel-run'] ?? [];
    expect(script.map((step) => step.ticks)).toEqual([11, 11, 11, 7, 1, 12]);
    expect(script.slice(0, 4).every((step) => step.press.includes('jump'))).toBe(true); // три удара о крышку и прыжок на три клетки
    expect(script[4]?.held).toEqual(['right']);
  });

  it('корректный файл принимается; без bump и intro — тоже', () => {
    const ok = validateAnimations(validAnimations());
    expect(ok.intro?.routes['tunnel-run']?.[0]).toEqual({ x: 2, y: 5 });
    const empty = validateAnimations({ schemaVersion: 1, id: 'a', status: 'demo' });
    expect(empty).toMatchObject({ bump: null, intro: null, entry: null });
  });

  it('диапазоны: такты, доля заполнения, формат клеток маршрута', () => {
    const bad = validAnimations();
    (bad['bump'] as { ticks: number }).ticks = 0;
    const intro = bad['intro'] as Record<string, unknown>;
    intro['coverage'] = 1.5;
    intro['stepTicks'] = 0;
    intro['routes'] = { 'tunnel-run': [[2, 5], [2], 'x'], пустой: [] };
    const text = issuesOf(() => validateAnimations(bad));
    expect(text).toMatch(/\$\.bump\.ticks.*вне диапазона/);
    expect(text).toMatch(/\$\.intro\.coverage.*от 0 до 1/);
    expect(text).toMatch(/\$\.intro\.stepTicks.*вне диапазона/);
    expect(text).toMatch(/\$\.intro\.routes\["tunnel-run"\]\[1\].*клетка \[x, y\]/);
    expect(text).toMatch(/\$\.intro\.routes\["tunnel-run"\]\[2\]/);
    expect(text).toMatch(/\$\.intro\.routes\["пустой"\].*непустой массив/);
  });

  it('неподдерживаемая версия схемы и корень не объект', () => {
    expect(issuesOf(() => validateAnimations({ ...validAnimations(), schemaVersion: 2 }))).toMatch(/schemaVersion/);
    expect(issuesOf(() => validateAnimations([]))).toMatch(/ожидался объект/);
  });
});

describe('анимации в сборке пакета: маршрут проверяется по уровню', () => {
  const withRoute = (route: unknown): ReturnType<typeof loadRawPack> => {
    const raw = loadRawPack('room');
    ((raw.animations as { intro: { routes: Record<string, unknown> } }).intro.routes)['tunnel-run'] = route;
    return raw;
  };

  it('маршрут должен заканчиваться в точке старта, идти соседними клетками, не повторяться и не выходить за карту', () => {
    expect(issuesOf(() => assemblePack(withRoute([[12, 5], [11, 5]]), env))).toMatch(/заканчиваться в точке старта уровня \(1,5\)/);
    expect(issuesOf(() => assemblePack(withRoute([[12, 5], [10, 5], [1, 5]]), env))).toMatch(/\[1\]: шаг 12,5 → 10,5/);
    expect(issuesOf(() => assemblePack(withRoute([[2, 5], [1, 5], [2, 5], [1, 5]]), env))).toMatch(/уже есть в маршруте/);
    expect(issuesOf(() => assemblePack(withRoute([[56, 5], [1, 5]]), env))).toMatch(/вне карты 56×6/);
  });

  it('маршрут для несуществующего уровня', () => {
    const raw = loadRawPack('room');
    (raw.animations as { intro: { routes: Record<string, unknown> } }).intro.routes['нет'] = [[0, 0]];
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/уровень «нет» не найден в пакете/);
  });

  it('манифест и загруженные файлы не расходятся', () => {
    const raw = loadRawPack('room');
    delete raw.animations;
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/файл анимаций объявлен в манифесте/);
  });

  it('параметры пробиваемого блока проверяются по описанию типа', () => {
    const raw = loadRawPack('room');
    ((raw.levels[0] as { objects: { params: { hp: number } }[] }).objects[0] as { params: { hp: number } }).params.hp = 0;
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/hp/);
  });

  it('bottomEdge: только pit или floor', () => {
    const raw = loadRawPack('room');
    (raw.rules as { params: { bottomEdge: unknown } }).params.bottomEdge = 'water';
    expect(issuesOf(() => validateRuleSet(raw.rules, env))).toMatch(/\$\.params\.bottomEdge.*«pit» или «floor»/);
    const defaults = loadRawPack('room');
    delete (defaults.rules as { params: { bottomEdge?: unknown } }).params.bottomEdge;
    expect(validateRuleSet(defaults.rules, env).params.bottomEdge).toBeUndefined(); // по умолчанию — провал
  });
});

describe('загрузка пакета с анимациями и общими файлами', () => {
  const dir = fileURLToPath(new URL('../../public/content/', import.meta.url));
  const base = 'https://example.test/CrocodileMario/content/';

  const diskFetch =
    (requested: string[] = []): FetchJson =>
    async (url) => {
      requested.push(url);
      if (!url.startsWith(base)) throw new ContentLoadError(url, 'HTTP 404');
      return readJson(join(dir, new URL(url).pathname.replace('/CrocodileMario/content/', '')));
    };

  it('основной пакет: анимации загружаются отдельным файлом, ресурсы лежат рядом', async () => {
    const requested: string[] = [];
    const loaded = await loadContentPack(`${base}room/pack.json`, env, diskFetch(requested));
    expect(loaded.assetsUrl).toBe(`${base}room/assets.json`);
    expect(requested).toContain(`${base}room/animations.json`);
    expect(loaded.pack.animations?.id).toBe('room-animations');
    expect(loaded.pack.levels.map((l) => l.id)).toEqual([
      ...Array.from({ length: 9 }, (_, i) => `mario-${i + 1}`),
      ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `mario-${n}-${n % 2 === 1 ? 'boss' : 'bonus'}`),
      'tunnel-run',
      'custom-1',
    ]);
  });

  it('пакеты без объявленного файла анимаций загружаются как раньше', async () => {
    const requested: string[] = [];
    const loaded = await loadContentPack(`${base}demo/pack.json`, env, diskFetch(requested));
    expect(loaded.pack.animations).toBeUndefined();
    expect(requested.some((url) => url.endsWith('animations.json'))).toBe(false);
  });
});

describe('animations.json: сценарий входа', () => {
  const withEntry = (entry: unknown): Record<string, unknown> => ({ ...validAnimations(), entry });

  it('шаги разворачиваются в кадры: действия проверяются по списку действий, такты — по диапазону', () => {
    const ok = validateAnimations(withEntry({ scripts: { a: [{ ticks: 2, press: ['jump'], held: ['right'] }, { ticks: 1 }] } }), 'x', env);
    expect(ok.entry?.scripts['a']).toEqual([
      { ticks: 2, press: ['jump'], held: ['right'] },
      { ticks: 1, press: [], held: [] },
    ]);
    const text = issuesOf(() => validateAnimations(withEntry({ scripts: { a: [{ ticks: 0, press: ['fly'] }, 5], b: [] } }), 'x', env));
    expect(text).toMatch(/\$\.entry\.scripts\["a"\]\[0\]\.ticks.*вне диапазона/);
    expect(text).toMatch(/press\[0\].*неизвестное действие "fly"/);
    expect(text).toMatch(/\["a"\]\[1\].*ожидался объект/);
    expect(text).toMatch(/\["b"\].*непустой массив шагов/);
    expect(issuesOf(() => validateAnimations(withEntry({ scripts: { a: Array.from({ length: 3 }, () => ({ ticks: 900 })) } }), 'x', env))).toMatch(/длиннее 2000 тактов/);
  });

  it('сценарий для несуществующего уровня отвергается при сборке пакета', () => {
    const raw = loadRawPack('room');
    (raw.animations as { entry: { scripts: Record<string, unknown> } }).entry.scripts['нет'] = [{ ticks: 1 }];
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/entry\.scripts\["нет"\]: уровень «нет» не найден/);
  });
});
