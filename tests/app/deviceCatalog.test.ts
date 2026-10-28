import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BRAND_LABEL,
  DEFAULT_BRAND,
  DEVICE_BRANDS,
  DEVICE_DEFAULTS,
  READINESS_ORDER,
  brandCounts,
  catalogOrder,
  deviceEntry,
  deviceLabel,
  filterDevices,
  modelsCount,
  normalizeQuery,
  setDeviceOverrides,
} from '../../src/app/deviceCatalog';
import { setLang, t } from '../../src/app/i18n';
import { TOY_IDS } from '../../src/app/toys';

beforeEach(() => setLang('ru'));
afterEach(() => setDeviceOverrides({}));

describe('каталог устройств: метаданные', () => {
  it('у каждой зарегистрированной игрушки есть запись, лишних записей нет', () => {
    expect(Object.keys(DEVICE_DEFAULTS).sort()).toEqual([...TOY_IDS].sort());
    for (const id of TOY_IDS) {
      expect(DEVICE_BRANDS).toContain(DEVICE_DEFAULTS[id].brand);
      expect(READINESS_ORDER).toContain(DEVICE_DEFAULTS[id].readiness);
    }
  });

  it('бренд указан явно; если другой не установлен, модель считается Brick Game', () => {
    expect(DEFAULT_BRAND).toBe('brickgame');
    expect(TOY_IDS.filter((id) => DEVICE_DEFAULTS[id].brand === 'apollo')).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'apollo-b0202', 'apollo-b0302']);
    expect(TOY_IDS.filter((id) => DEVICE_DEFAULTS[id].brand === 'taksun')).toEqual(['taksun']);
    expect(TOY_IDS.filter((id) => DEVICE_DEFAULTS[id].brand === 'brickgame')).toEqual(['alibaba', 'minibrick', 'brickgame', 'e88', 'e23', 'fm38', 'prince118']);
  });

  it('готовность — явное решение, а не число готовых игр', () => {
    expect(TOY_IDS.filter((id) => DEVICE_DEFAULTS[id].readiness === 'playable')).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'brickgame']);
    expect(DEVICE_DEFAULTS.alibaba.readiness).toBe('shell');
    expect(DEVICE_DEFAULTS.taksun.readiness).toBe('shell');
    expect(DEVICE_DEFAULTS.minibrick.readiness).toBe('reconstructing');
    expect(DEVICE_DEFAULTS.e88.readiness).toBe('reconstructing');
    expect(DEVICE_DEFAULTS['apollo-b0202'].readiness).toBe('reconstructing');
  });

  it('порядок в сетке: сначала универсальный, затем бренды подряд (Apollo, TAKSUN, Brick Game), внутри — порядок регистрации', () => {
    expect(catalogOrder()).toEqual(['brickgame', 'mario', 'clock99', 'seabattle', 'tank168', 'apollo-b0202', 'apollo-b0302', 'taksun', 'alibaba', 'minibrick', 'e88', 'e23', 'fm38', 'prince118']);
    expect(catalogOrder(['minibrick', 'mario', 'brickgame'])).toEqual(['brickgame', 'mario', 'minibrick']);
  });

  it('счётчики категорий', () => {
    expect(brandCounts()).toEqual({ all: 14, apollo: 6, taksun: 1, brickgame: 7 });
  });
});

describe('каталог устройств: настройки из админки', () => {
  it('бренд и готовность из конфигурации важнее значений по умолчанию, остальное остаётся', () => {
    setDeviceOverrides({ minibrick: { readiness: 'playable' }, taksun: { brand: 'brickgame', readiness: 'reconstructing' } });
    expect(deviceEntry('minibrick')).toMatchObject({ brand: 'brickgame', readiness: 'playable' });
    expect(deviceEntry('taksun')).toMatchObject({ brand: 'brickgame', readiness: 'reconstructing' });
    expect(deviceEntry('mario')).toMatchObject({ brand: 'apollo', readiness: 'playable' });
    expect(brandCounts()).toEqual({ all: 14, apollo: 6, taksun: 0, brickgame: 8 });
    expect(deviceLabel('taksun', t).maker).toBe('Brick Game');
    expect(catalogOrder().indexOf('taksun')).toBeGreaterThan(catalogOrder().indexOf('apollo-b0202'));
    setDeviceOverrides({});
    expect(deviceEntry('taksun')).toMatchObject({ brand: 'taksun', readiness: 'shell' });
  });
});

describe('каталог устройств: подписи и поиск', () => {
  it('бренд мелко, модель крупно; «бренд не подтверждён» нет', () => {
    expect(deviceLabel('mario', t)).toEqual({ maker: 'Apollo', title: 'Crocodile Mario' });
    expect(deviceLabel('brickgame', t)).toEqual({ maker: 'Brick Game', title: 'Универсальный' });
    expect(deviceLabel('e88', t)).toEqual({ maker: 'Brick Game', title: 'E-88 · 8 in 1' });
    expect(deviceLabel('alibaba', t)).toEqual({ maker: 'Brick Game', title: 'Alibaba Dance 99 in 1' });
    expect(deviceLabel('taksun', t)).toEqual({ maker: 'TAKSUN', title: 'TS-995 · 9999 in 1' });
    setLang('en');
    expect(deviceLabel('brickgame', t).title).toBe('Universal');
    expect(BRAND_LABEL).toEqual({ apollo: 'Apollo', taksun: 'TAKSUN', brickgame: 'Brick Game' }); // бренды не переводятся
  });

  it('нормализация запроса не зависит от регистра, пробелов, дефисов и точек', () => {
    expect(normalizeQuery(' E‑88 ')).toBe('e88');
    expect(normalizeQuery('E 88')).toBe('e88');
    expect(normalizeQuery('Часы+99')).toBe('часы99');
  });

  it('поиск по бренду, названию и обозначению; пустой запрос — всё', () => {
    const ids = catalogOrder();
    const find = (query: string, category: 'all' | (typeof DEVICE_BRANDS)[number] = 'all') => filterDevices(ids, { category, query }, t);
    expect(find('')).toEqual(ids);
    expect(find('apollo')).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'apollo-b0202', 'apollo-b0302']);
    expect(find('b0202')).toEqual(['apollo-b0202']);
    expect(find('126')).toEqual(['apollo-b0202']);
    expect(find('e88')).toEqual(['e88']);
    expect(find('морской')).toEqual(['seabattle']);
    expect(find('UNIVERSAL')).toEqual(['brickgame']);
    expect(find('b-s96')).toEqual(['minibrick']);
    expect(find('taksun')).toEqual(['taksun']);
    expect(find('ts-995')).toEqual(['taksun']);
    expect(find('9999')).toEqual(['taksun']);
    expect(find('zzz')).toEqual([]);
  });

  it('категория и запрос сужают выдачу вместе', () => {
    const ids = catalogOrder();
    expect(filterDevices(ids, { category: 'apollo', query: '' }, t)).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'apollo-b0202', 'apollo-b0302']);
    expect(filterDevices(ids, { category: 'taksun', query: '' }, t)).toEqual(['taksun']);
    expect(filterDevices(ids, { category: 'brickgame', query: '' }, t)).toEqual(['brickgame', 'alibaba', 'minibrick', 'e88', 'e23', 'fm38', 'prince118']);
    expect(filterDevices(ids, { category: 'brickgame', query: 'apollo' }, t)).toEqual([]);
    expect(filterDevices(ids, { category: 'all', query: '' }, t)).toHaveLength(14);
  });
});

describe('каталог устройств: «N моделей»', () => {
  it('русские формы по числу', () => {
    expect([1, 2, 4, 5, 9, 10, 11, 12, 14, 15, 21, 22, 25].map((n) => modelsCount(n, 'ru'))).toEqual([
      '1 модель',
      '2 модели',
      '4 модели',
      '5 моделей',
      '9 моделей',
      '10 моделей',
      '11 моделей',
      '12 моделей',
      '14 моделей',
      '15 моделей',
      '21 модель',
      '22 модели',
      '25 моделей',
    ]);
  });

  it('английские формы', () => {
    expect(modelsCount(1, 'en')).toBe('1 model');
    expect(modelsCount(10, 'en')).toBe('10 models');
  });
});
