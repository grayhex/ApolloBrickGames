import { afterEach, describe, expect, it } from 'vitest';
import { deviceEntry, setDeviceOverrides } from '../../src/app/deviceCatalog';
import { deviceFacts } from '../../src/app/deviceFacts';
import { applyConfig, defaultConfig } from '../../src/config/runtime';
import { validateConfig } from '../../src/config/schema';

afterEach(() => setDeviceOverrides({}));

describe('настройки каталога устройств в конфигурации', () => {
  it('в конфигурации по умолчанию записей нет: все модели — по значениям из deviceCatalog.ts', () => {
    expect(defaultConfig().catalog).toBeUndefined();
  });

  it('хранятся только отличия от значений по умолчанию: совпадающие поля и пустые записи отбрасываются', () => {
    const config = defaultConfig();
    config.catalog = { minibrick: { brand: 'brickgame', readiness: 'playable' }, taksun: { brand: 'taksun', readiness: 'shell' }, mario: { brand: 'taksun' } };
    expect(validateConfig(config).catalog).toEqual({ minibrick: { readiness: 'playable' }, mario: { brand: 'taksun' } });
    config.catalog = { taksun: {} };
    expect(validateConfig(config).catalog).toBeUndefined();
  });

  it('отвергает неизвестную модель, поле, бренд и статус готовности', () => {
    for (const catalog of [{ nope: { brand: 'apollo' } }, { mario: { colour: 'red' } }, { mario: { brand: 'sega' } }, { mario: { readiness: 'done' } }, { mario: 1 }, []]) {
      const config = defaultConfig();
      (config as { catalog?: unknown }).catalog = catalog;
      expect(() => validateConfig(config), JSON.stringify(catalog)).toThrow();
    }
  });

  it('применяется при запуске: каталог видит бренд и готовность из конфигурации, снятие записей возвращает значения по умолчанию', () => {
    const config = defaultConfig();
    config.catalog = { alibaba: { brand: 'apollo', readiness: 'reconstructing' } };
    applyConfig(validateConfig(config));
    expect(deviceEntry('alibaba')).toMatchObject({ brand: 'apollo', readiness: 'reconstructing' });
    applyConfig(defaultConfig());
    expect(deviceEntry('alibaba')).toMatchObject({ brand: 'brickgame', readiness: 'shell' });
  });

  it('год выпуска и питание: четыре цифры и короткая строка; пустой записи нет, неверные значения отвергаются', () => {
    const config = defaultConfig();
    config.catalog = { e88: { year: '2009', power: '2×AA' }, taksun: { power: '3×AAA (4,5 В)' } };
    expect(validateConfig(config).catalog).toEqual({ e88: { year: '2009', power: '2×AA' }, taksun: { power: '3×AAA (4,5 В)' } });
    for (const bad of [{ year: '09' }, { year: '20099' }, { year: 'abcd' }, { year: 2009 }, { year: '1859' }, { power: '' }, { power: ' 2×AA ' }, { power: '<b>2×AA</b>' }, { power: 'A'.repeat(33) }, { power: 5 }]) {
      const broken = defaultConfig();
      (broken as { catalog?: unknown }).catalog = { mario: bad };
      expect(() => validateConfig(broken), JSON.stringify(bad)).toThrow();
    }
  });

  it('год и питание из конфигурации попадают в сведения карточки, снятие записей возвращает прочерки (значения по умолчанию)', () => {
    expect(deviceFacts('e88')).toMatchObject({ year: null, power: null });
    const config = defaultConfig();
    config.catalog = { e88: { year: '2009', power: '2×AA' } };
    applyConfig(validateConfig(config));
    expect(deviceFacts('e88')).toMatchObject({ year: '2009', power: '2×AA' });
    expect(deviceFacts('e23')).toMatchObject({ year: null, power: null });
    applyConfig(defaultConfig());
    expect(deviceFacts('e88')).toMatchObject({ year: null, power: null });
  });
});
