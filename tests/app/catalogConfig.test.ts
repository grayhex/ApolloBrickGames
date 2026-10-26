import { afterEach, describe, expect, it } from 'vitest';
import { deviceEntry, setDeviceOverrides } from '../../src/app/deviceCatalog';
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
});
