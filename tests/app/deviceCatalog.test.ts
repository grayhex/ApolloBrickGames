import { beforeEach, describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL,
  DEVICE_CATALOG,
  DEVICE_CATEGORIES,
  READINESS_ORDER,
  catalogOrder,
  categoryCounts,
  deviceLabel,
  filterDevices,
  modelsCount,
  normalizeQuery,
} from '../../src/app/deviceCatalog';
import { setLang, t } from '../../src/app/i18n';
import { TOY_IDS, TOYS } from '../../src/app/toys';

beforeEach(() => setLang('ru'));

describe('каталог устройств: метаданные', () => {
  it('у каждой зарегистрированной игрушки есть запись, лишних записей нет', () => {
    expect(Object.keys(DEVICE_CATALOG).sort()).toEqual([...TOY_IDS].sort());
    for (const id of TOY_IDS) {
      const entry = DEVICE_CATALOG[id];
      expect(READINESS_ORDER).toContain(entry.readiness);
      if (entry.category !== null) expect(DEVICE_CATEGORIES).toContain(entry.category);
    }
  });

  it('производитель задан явно: Apollo — только подтверждённые модели, TAKSUN в коллекции нет, неподтверждённые остаются без бренда', () => {
    const apollo = TOY_IDS.filter((id) => DEVICE_CATALOG[id].maker === 'Apollo');
    expect(apollo).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'apollo-b0202']);
    expect(TOY_IDS.filter((id) => DEVICE_CATALOG[id].category === 'taksun')).toEqual([]);
    expect(TOY_IDS.filter((id) => DEVICE_CATALOG[id].maker === null)).toEqual(['alibaba', 'minibrick', 'e88']);
    // Семейство `ToyModel.family` не определяет производителя: у моделей `other` производитель не выводится из него.
    expect(TOYS.alibaba.family).toBe('other');
    expect(DEVICE_CATALOG.alibaba.category).toBeNull();
    expect(DEVICE_CATALOG.minibrick.category).toBeNull();
  });

  it('готовность — явное решение, а не число готовых игр', () => {
    expect(TOY_IDS.filter((id) => DEVICE_CATALOG[id].readiness === 'playable')).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'brickgame']);
    expect(DEVICE_CATALOG.alibaba.readiness).toBe('shell');
    expect(DEVICE_CATALOG.minibrick.readiness).toBe('reconstructing');
    expect(DEVICE_CATALOG.e88.readiness).toBe('reconstructing');
    expect(DEVICE_CATALOG['apollo-b0202'].readiness).toBe('reconstructing');
  });

  it('порядок в сетке: категории подряд, внутри — порядок регистрации; модели без категории в конце', () => {
    expect(catalogOrder()).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'apollo-b0202', 'brickgame', 'e88', 'alibaba', 'minibrick']);
    expect(catalogOrder(['minibrick', 'brickgame', 'mario'])).toEqual(['mario', 'brickgame', 'minibrick']);
  });

  it('счётчики категорий', () => {
    expect(categoryCounts()).toEqual({ all: 9, apollo: 5, taksun: 0, brickgame: 2 });
  });
});

describe('каталог устройств: подписи и поиск', () => {
  it('производитель мелко, модель крупно; без бренда — категория или пометка', () => {
    expect(deviceLabel('mario', t)).toEqual({ maker: 'Apollo', title: 'Crocodile Mario' });
    expect(deviceLabel('brickgame', t)).toEqual({ maker: 'Brick Game', title: 'Универсальный' });
    expect(deviceLabel('e88', t)).toEqual({ maker: 'Brick Game', title: 'E-88 · 8 in 1' });
    expect(deviceLabel('alibaba', t)).toEqual({ maker: 'Бренд не подтверждён', title: 'Alibaba Dance 99 in 1' });
    setLang('en');
    expect(deviceLabel('brickgame', t).title).toBe('Universal');
    expect(deviceLabel('alibaba', t).maker).toBe('Brand unconfirmed');
    expect(CATEGORY_LABEL).toEqual({ apollo: 'Apollo', taksun: 'TAKSUN', brickgame: 'Brick Game' }); // бренды не переводятся
  });

  it('нормализация запроса не зависит от регистра, пробелов, дефисов и точек', () => {
    expect(normalizeQuery(' E‑88 ')).toBe('e88');
    expect(normalizeQuery('E 88')).toBe('e88');
    expect(normalizeQuery('Часы+99')).toBe('часы99');
  });

  it('поиск по производителю, названию и обозначению; пустой запрос — всё', () => {
    const ids = catalogOrder();
    const find = (query: string, category: 'all' | (typeof DEVICE_CATEGORIES)[number] = 'all') => filterDevices(ids, { category, query }, t);
    expect(find('')).toEqual(ids);
    expect(find('apollo')).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'apollo-b0202']);
    expect(find('b0202')).toEqual(['apollo-b0202']);
    expect(find('126')).toEqual(['apollo-b0202']);
    expect(find('e88')).toEqual(['e88']);
    expect(find('морской')).toEqual(['seabattle']);
    expect(find('UNIVERSAL')).toEqual(['brickgame']);
    expect(find('b-s96')).toEqual(['minibrick']);
    expect(find('zzz')).toEqual([]);
  });

  it('категория и запрос сужают выдачу вместе; пустой TAKSUN остаётся пустым, «Все» показывает всё', () => {
    const ids = catalogOrder();
    expect(filterDevices(ids, { category: 'apollo', query: '' }, t)).toEqual(['mario', 'clock99', 'seabattle', 'tank168', 'apollo-b0202']);
    expect(filterDevices(ids, { category: 'brickgame', query: '' }, t)).toEqual(['brickgame', 'e88']);
    expect(filterDevices(ids, { category: 'brickgame', query: 'apollo' }, t)).toEqual([]);
    expect(filterDevices(ids, { category: 'taksun', query: '' }, t)).toEqual([]);
    expect(filterDevices(ids, { category: 'all', query: '' }, t)).toHaveLength(9);
  });
});

describe('каталог устройств: «N моделей»', () => {
  it('русские формы по числу', () => {
    expect([1, 2, 4, 5, 9, 11, 12, 14, 15, 21, 22, 25].map((n) => modelsCount(n, 'ru'))).toEqual([
      '1 модель',
      '2 модели',
      '4 модели',
      '5 моделей',
      '9 моделей',
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
    expect(modelsCount(9, 'en')).toBe('9 models');
  });
});
