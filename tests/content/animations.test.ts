import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentLoadError, loadContentPack, type FetchJson } from '../../src/app/loadContent';
import { assemblePack, ContentError, validateAnimations, validateRuleSet } from '../../src/content/validate';
import { validationEnv } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { loadClipPack, loadRawPack, loadRoomPack, readJson } from '../helpers/content';

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
    routes: { 'clip-room': [[2, 5], [2, 4], [2, 3], [1, 3], [1, 4], [1, 5]] },
  },
});

describe('animations.json: проверка формата', () => {
  it('пакеты комнаты и клипа несут анимации; у комнаты только отскок, у клипа ещё и интро с маршрутом', () => {
    const room = loadRoomPack().animations;
    expect(room?.bump).toEqual({ ticks: 5 });
    expect(room?.intro).toBeNull();
    const clip = loadClipPack().animations;
    expect(clip?.bump).toEqual({ ticks: 5 });
    expect(clip?.intro?.routes['clip-room']).toHaveLength(18);
    expect(clip?.status).toBe('demo');
  });

  it('корректный файл принимается; без bump и intro — тоже', () => {
    const ok = validateAnimations(validAnimations());
    expect(ok.intro?.routes['clip-room']?.[0]).toEqual({ x: 2, y: 5 });
    const empty = validateAnimations({ schemaVersion: 1, id: 'a', status: 'demo' });
    expect(empty).toMatchObject({ bump: null, intro: null });
  });

  it('диапазоны: такты, доля заполнения, формат клеток маршрута', () => {
    const bad = validAnimations();
    (bad['bump'] as { ticks: number }).ticks = 0;
    const intro = bad['intro'] as Record<string, unknown>;
    intro['coverage'] = 1.5;
    intro['stepTicks'] = 0;
    intro['routes'] = { 'clip-room': [[2, 5], [2], 'x'], пустой: [] };
    const text = issuesOf(() => validateAnimations(bad));
    expect(text).toMatch(/\$\.bump\.ticks.*вне диапазона/);
    expect(text).toMatch(/\$\.intro\.coverage.*от 0 до 1/);
    expect(text).toMatch(/\$\.intro\.stepTicks.*вне диапазона/);
    expect(text).toMatch(/\$\.intro\.routes\["clip-room"\]\[1\].*клетка \[x, y\]/);
    expect(text).toMatch(/\$\.intro\.routes\["clip-room"\]\[2\]/);
    expect(text).toMatch(/\$\.intro\.routes\["пустой"\].*непустой массив/);
  });

  it('неподдерживаемая версия схемы и корень не объект', () => {
    expect(issuesOf(() => validateAnimations({ ...validAnimations(), schemaVersion: 2 }))).toMatch(/schemaVersion/);
    expect(issuesOf(() => validateAnimations([]))).toMatch(/ожидался объект/);
  });
});

describe('анимации в сборке пакета: маршрут проверяется по уровню', () => {
  const withRoute = (route: unknown): ReturnType<typeof loadRawPack> => {
    const raw = loadRawPack('clip');
    ((raw.animations as { intro: { routes: Record<string, unknown> } }).intro.routes)['clip-room'] = route;
    return raw;
  };

  it('маршрут должен заканчиваться в точке старта, идти соседними клетками, не повторяться и не выходить за карту', () => {
    expect(issuesOf(() => assemblePack(withRoute([[12, 5], [11, 5]]), env))).toMatch(/заканчиваться в точке старта уровня \(1,5\)/);
    expect(issuesOf(() => assemblePack(withRoute([[12, 5], [10, 5], [1, 5]]), env))).toMatch(/\[1\]: шаг 12,5 → 10,5/);
    expect(issuesOf(() => assemblePack(withRoute([[2, 5], [1, 5], [2, 5], [1, 5]]), env))).toMatch(/уже есть в маршруте/);
    expect(issuesOf(() => assemblePack(withRoute([[13, 5], [1, 5]]), env))).toMatch(/вне карты 13×6/);
  });

  it('маршрут для несуществующего уровня', () => {
    const raw = loadRawPack('clip');
    (raw.animations as { intro: { routes: Record<string, unknown> } }).intro.routes['нет'] = [[0, 0]];
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/уровень «нет» не найден в пакете/);
  });

  it('манифест и загруженные файлы не расходятся', () => {
    const raw = loadRawPack('clip');
    delete raw.animations;
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/файл анимаций объявлен в манифесте/);
  });

  it('параметры пробиваемого блока проверяются по описанию типа', () => {
    const raw = loadRawPack('clip');
    ((raw.levels[0] as { objects: { params: { hp: number } }[] }).objects[0] as { params: { hp: number } }).params.hp = 0;
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/hp/);
  });

  it('bottomEdge: только pit или floor', () => {
    const raw = loadRawPack('clip');
    (raw.rules as { params: { bottomEdge: unknown } }).params.bottomEdge = 'water';
    expect(issuesOf(() => validateRuleSet(raw.rules, env))).toMatch(/\$\.params\.bottomEdge.*«pit» или «floor»/);
    const defaults = loadRawPack('clip');
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

  it('клип-пакет: ресурсы берутся из соседнего каталога room, анимации загружаются отдельным файлом', async () => {
    const requested: string[] = [];
    const loaded = await loadContentPack(`${base}clip/pack.json`, env, diskFetch(requested));
    expect(loaded.assetsUrl).toBe(`${base}room/assets.json`);
    expect(requested).toContain(`${base}clip/animations.json`);
    expect(loaded.pack.animations?.id).toBe('clip-animations');
    expect(loaded.pack.levels.map((l) => l.id)).toEqual(['clip-room']);
  });

  it('пакеты без объявленного файла анимаций загружаются как раньше', async () => {
    const requested: string[] = [];
    const loaded = await loadContentPack(`${base}demo/pack.json`, env, diskFetch(requested));
    expect(loaded.pack.animations).toBeUndefined();
    expect(requested.some((url) => url.endsWith('animations.json'))).toBe(false);
  });
});
