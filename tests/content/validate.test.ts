import { describe, expect, it } from 'vitest';
import {
  assemblePack,
  ContentError,
  validateAssetCatalog,
  validateLevel,
  validateRuleSet,
  validateScreenProfile,
  type RawPack,
} from '../../src/content/validate';
import { screenSize, type AssetCatalog } from '../../src/content/schema';
import { validationEnv } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { loadRawDemoPack, loadRawPack } from '../helpers/content';
import { rawLevel } from '../helpers/builders';

const env = validationEnv(undefined, GLYPH_NAMES);

function catalog(): AssetCatalog {
  const raw = loadRawDemoPack();
  return validateAssetCatalog(raw.assets, env);
}

/** Проверка, что данные отвергаются именно с ожидаемым сообщением. */
function issuesOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError);
    return (error as ContentError).issues.join('\n');
  }
  throw new Error('ожидалась ContentError, но данные приняты');
}

const base = {
  rows: ['.....', '.....', '#####'],
  start: { x: 1, y: 1 },
};

describe('демо-пакет', () => {
  it('проходит проверку целиком и помечен как demo', () => {
    const pack = assemblePack(loadRawDemoPack(), env);
    expect(pack.manifest.status).toBe('demo');
    expect(pack.rules.status).toBe('demo');
    expect(pack.screen.status).toBe('demo');
    expect(pack.levels.map((l) => l.id)).toEqual(['demo-1', 'demo-2']);
    expect(pack.levels.every((l) => l.status === 'demo')).toBe(true);
  });

  it('графика и коллизия разделены: проходимость берётся только из collision', () => {
    const pack = assemblePack(loadRawDemoPack(), env);
    const level = pack.levels[0];
    // «o» — декоративный рисунок без коллизии, «#» — рисунок с коллизией.
    expect(level?.legend['o']).toEqual({ collision: 'empty', asset: 'tile.deco' });
    expect(level?.legend['#']).toEqual({ collision: 'solid', asset: 'tile.block' });
  });
});

describe('валидация уровня', () => {
  const validate = (patch: Record<string, unknown>) =>
    validateLevel({ ...rawLevel(base), ...patch }, catalog(), env, 'test-level');

  it('корректный уровень принимается, значения по умолчанию заполняются', () => {
    const level = validate({ objects: [{ id: 'h', type: 'hazard', x: 2, y: 1 }] });
    expect(level.objects[0]).toMatchObject({ w: 1, h: 1, asset: null, params: {} });
    expect(level.hudLabel).toBe('T1');
    expect(level.transitions).toEqual([]);
  });

  it('неподдерживаемая версия схемы', () => {
    expect(issuesOf(() => validate({ schemaVersion: 2 }))).toMatch(/schemaVersion.*неподдерживаемая версия схемы 2/);
  });

  it('корень не объект', () => {
    expect(issuesOf(() => validateLevel(null, catalog(), env))).toMatch(/ожидался объект/);
  });

  it('число строк и длина строки должны совпадать с размерами', () => {
    expect(issuesOf(() => validate({ rows: ['.....', '#####'] }))).toMatch(/\$\.rows: строк 2, а height = 3/);
    expect(issuesOf(() => validate({ rows: ['.....', '....', '#####'] }))).toMatch(/\$\.rows\[1\]: длина 4, а width = 5/);
  });

  it('символ статического слоя должен быть описан в легенде', () => {
    expect(issuesOf(() => validate({ rows: ['..?..', '.....', '#####'] }))).toMatch(/символ «\?» не описан в legend/);
  });

  it('коллизия — только empty или solid', () => {
    const legend = { '.': { collision: 'maybe' }, '#': { collision: 'solid' } };
    expect(issuesOf(() => validate({ legend }))).toMatch(/collision.*«empty» или «solid»/);
  });

  it('размеры карты ограничены', () => {
    expect(issuesOf(() => validate({ width: 0 }))).toMatch(/\$\.width/);
    expect(issuesOf(() => validate({ height: 1000 }))).toMatch(/\$\.height.*вне диапазона/);
  });

  it('старт вне карты или в занятой клетке', () => {
    expect(issuesOf(() => validate({ start: { x: 9, y: 1 } }))).toMatch(/start\.x.*вне диапазона/);
    expect(issuesOf(() => validate({ start: { x: 1, y: 2 } }))).toMatch(/в занятой клетке/);
  });

  it('неизвестный тип объекта называет доступные', () => {
    const text = issuesOf(() => validate({ objects: [{ id: 'x', type: 'dragon', x: 1, y: 1 }] }));
    expect(text).toMatch(/неизвестный тип «dragon», доступны: target, patroller, hazard, finish/);
  });

  it('объект не может выходить за карту; id уникальны', () => {
    expect(issuesOf(() => validate({ objects: [{ id: 'x', type: 'hazard', x: 4, y: 1, w: 3 }] }))).toMatch(
      /выходит за карту 5×3/,
    );
    const dup = [
      { id: 'x', type: 'hazard', x: 1, y: 1 },
      { id: 'x', type: 'hazard', x: 2, y: 1 },
    ];
    expect(issuesOf(() => validate({ objects: dup }))).toMatch(/«x» уже занят/);
  });

  it('ссылка на ресурс проверяется по каталогу', () => {
    const text = issuesOf(() => validate({ objects: [{ id: 'x', type: 'hazard', x: 1, y: 1, asset: 'nope' }] }));
    expect(text).toMatch(/ресурс «nope» не найден в каталоге «demo-assets»/);
    const legend = { '.': { collision: 'empty' }, '#': { collision: 'solid', asset: 'missing.tile' } };
    expect(issuesOf(() => validate({ legend }))).toMatch(/legend\["#"\]\.asset.*«missing.tile»/);
  });

  it('параметры объекта проверяются обработчиком типа', () => {
    const objects = [{ id: 't', type: 'target', x: 1, y: 1, params: { hp: 0 } }];
    expect(issuesOf(() => validate({ objects }))).toMatch(/«hp» — целое число 1…99/);
    const bad = [{ id: 't', type: 'target', x: 1, y: 1, params: { hp: { nested: true } } }];
    expect(issuesOf(() => validate({ objects: bad }))).toMatch(/параметр — число, строка или true\/false/);
  });

  it('переход должен ссылаться на существующий объект', () => {
    expect(issuesOf(() => validate({ transitions: [{ from: 'ghost', to: null }] }))).toMatch(
      /объект «ghost» не найден среди objects/,
    );
  });

  it('собирает сразу все ошибки, а не только первую', () => {
    const text = issuesOf(() =>
      validate({ rows: ['..?..', '.....'], start: { x: 9, y: 9 }, objects: [{ id: 'x', type: 'dragon', x: 0, y: 0 }] }),
    );
    expect(text.split('\n').length).toBeGreaterThanOrEqual(4);
  });

  it('сообщение исключения содержит источник и список ошибок', () => {
    try {
      validate({ schemaVersion: 7 });
    } catch (error) {
      expect((error as Error).message).toMatch(/Ошибка данных в «test-level»:\n {2}• /);
    }
  });
});

describe('валидация профиля экрана, ресурсов и правил', () => {
  const screen = loadRawDemoPack().screen as Record<string, unknown>;
  const rules = loadRawDemoPack().rules as { params: Record<string, unknown> } & Record<string, unknown>;

  it('профиль экрана: клетка, поля, встроенный HUD', () => {
    const parsed = validateScreenProfile(screen);
    expect(parsed.viewport).toEqual({ columns: 13, rows: 7 });
    expect(parsed.cell).toEqual({ width: 8, height: 8 });
    expect(parsed.margin).toEqual({ left: 0, right: 0, top: 8, bottom: 0 });
    expect(parsed.hud.kind).toBe('builtin');
    expect(screenSize(parsed)).toEqual({ width: 104, height: 64 });
    expect(issuesOf(() => validateScreenProfile({ ...screen, cell: { width: 0, height: 8 } }))).toMatch(/cell\.width/);
    expect(issuesOf(() => validateScreenProfile({ ...screen, hud: { kind: 'builtin', position: 'left' } }))).toMatch(/hud\.position/);
    expect(issuesOf(() => validateScreenProfile({ ...screen, hud: { kind: 'wide' } }))).toMatch(/hud\.kind/);
    expect(issuesOf(() => validateScreenProfile({ ...screen, margin: {} }))).toMatch(/margin\.top не меньше 5/);
  });

  it('профиль экрана: прямоугольная ячейка и LCD-раскладка HUD (комната)', () => {
    const room = loadRawPack('room').screen;
    const parsed = validateScreenProfile(room);
    expect(parsed.cell).toEqual({ width: 128, height: 112 });
    expect(screenSize(parsed)).toEqual({ width: 1728, height: 864 }); // как у эталонных экранов владельца
    expect(parsed.smoothing).toBe(true);
    expect(parsed.ghost).toEqual({ asset: 'cell.ghost', enabled: true });
    expect(parsed.hud.kind).toBe('lcd');
    const broken = { ...(room as Record<string, unknown>), hud: { kind: 'lcd', lives: {}, label: {}, score: {}, font: {} } };
    expect(issuesOf(() => validateScreenProfile(broken))).toMatch(/hud\.lives/);
    expect(issuesOf(() => validateScreenProfile({ ...(room as object), colors: { background: 'green', ink: '#000000' } }))).toMatch(/colors\.background/);
  });

  it('ресурсы: неизвестная заглушка и битое описание картинки', () => {
    const raw = { schemaVersion: 1, id: 'c', status: 'demo' };
    expect(
      issuesOf(() => validateAssetCatalog({ ...raw, assets: { a: { kind: 'placeholder', glyph: 'dragon' } } }, env)),
    ).toMatch(/неизвестная заглушка «dragon»/);
    expect(
      issuesOf(() =>
        validateAssetCatalog({ ...raw, assets: { a: { kind: 'image', src: 'a.png', frameWidth: 8, frameHeight: 8, frames: 0 } } }, env),
      ),
    ).toMatch(/frames.*вне диапазона/);
    expect(issuesOf(() => validateAssetCatalog({ ...raw, assets: { a: { kind: 'sound' } } }, env))).toMatch(/kind/);
  });

  it('ресурс-картинка с кадрами принимается; заглушка по умолчанию — unknown', () => {
    const ok = validateAssetCatalog(
      {
        schemaVersion: 1,
        id: 'c',
        status: 'demo',
        assets: { hero: { kind: 'image', src: 'hero.png', frameWidth: 8, frameHeight: 8, frames: 4, frameTicks: 3 } },
      },
      env,
    );
    expect(ok.assets['hero']).toMatchObject({ kind: 'image', frames: 4, frameTicks: 3, fallbackGlyph: 'unknown' });
  });

  it('правила: диапазоны, действия прыжка и таблица', () => {
    const patch = (params: Record<string, unknown>) => ({ ...rules, params: { ...rules.params, ...params } });
    expect(validateRuleSet(rules, env).params.tickRateHz).toBe(20);
    expect(issuesOf(() => validateRuleSet(patch({ tickRateHz: 0 }), env))).toMatch(/tickRateHz/);
    expect(
      issuesOf(() => validateRuleSet(patch({ jump: { triggers: ['teleport'], table: [-1], stepTicks: 1 } }), env)),
    ).toMatch(/неизвестное действие "teleport"/);
    expect(issuesOf(() => validateRuleSet(patch({ jump: { triggers: ['jump'], table: [], stepTicks: 1 } }), env))).toMatch(
      /jump\.table/,
    );
    expect(issuesOf(() => validateRuleSet(patch({ lives: 0 }), env))).toMatch(/lives/);
  });
});

describe('сборка пакета и ссылки между файлами', () => {
  const mutate = (change: (raw: RawPack & { manifest: Record<string, unknown> }) => void): RawPack => {
    const raw = loadRawDemoPack() as RawPack & { manifest: Record<string, unknown> };
    change(raw);
    return raw;
  };

  it('firstLevel должен существовать', () => {
    expect(issuesOf(() => assemblePack(mutate((r) => (r.manifest['firstLevel'] = 'nope')), env))).toMatch(
      /firstLevel «nope» не найден/,
    );
  });

  it('переход на несуществующий уровень', () => {
    const raw = mutate((r) => {
      const level = r.levels[0] as { transitions: { to: string }[] };
      level.transitions[0]!.to = 'demo-9';
    });
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/ведёт в несуществующий уровень «demo-9»/);
  });

  it('спрайты героя/снаряда/жизни обязаны быть в каталоге', () => {
    const raw = mutate((r) => (r.manifest['sprites'] = { hero: 'ghost', projectile: 'projectile', life: 'life' }));
    expect(issuesOf(() => assemblePack(raw, env))).toMatch(/sprites\.hero: ресурс «ghost» не найден/);
  });

  it('повтор id уровня и расхождение числа файлов', () => {
    const dup = mutate((r) => {
      const copy = JSON.parse(JSON.stringify(r.levels[0])) as unknown;
      r.levels[1] = copy;
    });
    expect(issuesOf(() => assemblePack(dup, env))).toMatch(/уровень «demo-1» объявлен дважды/);
    const short = mutate((r) => r.levels.pop());
    expect(issuesOf(() => assemblePack(short, env))).toMatch(/в манифесте 2 файлов уровней, загружено 1/);
  });

  it('комната: HUD и слой неактивных сегментов ссылаются на существующие ресурсы и символы', () => {
    const room = (change: (raw: RawPack) => void): RawPack => {
      const raw = loadRawPack('room');
      change(raw);
      return raw;
    };
    expect(assemblePack(room(() => undefined), env).screen.hud.kind).toBe('lcd');
    const ghost = room((r) => ((r.screen as { ghost: { asset: string } }).ghost.asset = 'cell.nope'));
    expect(issuesOf(() => assemblePack(ghost, env))).toMatch(/screen\.ghost\.asset: ресурс «cell\.nope» не найден/);
    const glyph = room((r) => delete (r.assets as { assets: Record<string, unknown> }).assets['hud.digit.minus']);
    expect(issuesOf(() => assemblePack(glyph, env))).toMatch(/font\.glyphs\["-"\]: ресурс «hud\.digit\.minus» не найден/);
    const label = room((r) => ((r.screen as { hud: { fixed: unknown } }).hud.fixed = { lives: 3, label: '0-0Z0', score: 0 }));
    expect(issuesOf(() => assemblePack(label, env))).toMatch(/длиннее числа позиций|нет в шрифте/);
  });

  it('ошибка в одном уровне не даёт собрать «частично сломанную» сцену', () => {
    const raw = mutate((r) => {
      (r.levels[1] as { rows: string[] }).rows[3] = 'short';
    });
    expect(() => assemblePack(raw, env)).toThrow(ContentError);
  });
});
