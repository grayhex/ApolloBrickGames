import type { MsgKey } from './messages';
import { TOY_IDS, TOYS, type ToyId } from './toys';

/**
 * Каталог устройств (выпадающее меню выбора игрушки, `toySwitch.ts`): явные метаданные каждой модели — бренд и готовность.
 *
 * Правила (документированы здесь и в docs/toys.md, ничего не выводится по названию, форме корпуса или `ToyModel.family`):
 *  - **Бренд** (`brand`) — производитель, он же категория фильтра «Apollo | TAKSUN | Brick Game». Подтверждённый бренд (печать на корпусе или упаковке, документы
 *    репозитория, решение владельца) записан явно; **если другой бренд не установлен, модель считается Brick Game** — это значение по умолчанию, отдельной
 *    пометки «бренд не подтверждён» нет. Бренд и готовность можно изменить в админке (`config.catalog`, `setDeviceOverrides`): записи конфигурации важнее
 *    значений по умолчанию отсюда.
 *  - **Готовность** (`readiness`) — три значка: `playable` ✓ — есть играбельная реализация; `reconstructing` ◐ — реконструкция продолжается (часть игр, экрана или
 *    поведения приближена); `shell` ○ — пока только корпус. Это явное решение по документам модели, а не вычисление по числу готовых игр: общий движок
 *    не доказывает точную эмуляцию оригинала, проценты не используются.
 *
 * Запись обязана быть у каждой игрушки (`Record<ToyId, …>`): новая модель, добавленная в `TOY_IDS`, не компилируется без метаданных и сама появляется в каталоге.
 */
export type DeviceBrand = 'apollo' | 'taksun' | 'brickgame';
export const DEVICE_BRANDS: readonly DeviceBrand[] = ['apollo', 'taksun', 'brickgame'];
/** Бренд, который получает модель, если другой не установлен. */
export const DEFAULT_BRAND: DeviceBrand = 'brickgame';

/** Названия брендов — не переводятся. */
export const BRAND_LABEL: Readonly<Record<DeviceBrand, string>> = { apollo: 'Apollo', taksun: 'TAKSUN', brickgame: 'Brick Game' };

export type DeviceReadiness = 'playable' | 'reconstructing' | 'shell';
export const READINESS_ORDER: readonly DeviceReadiness[] = ['playable', 'reconstructing', 'shell'];
export const isBrand = (value: unknown): value is DeviceBrand => DEVICE_BRANDS.some((brand) => brand === value);
export const isReadiness = (value: unknown): value is DeviceReadiness => READINESS_ORDER.some((ready) => ready === value);

export interface DeviceCatalogEntry {
  brand: DeviceBrand;
  readiness: DeviceReadiness;
  /** Название модели в каталоге, если оно короче или иначе, чем `TOYS[id].name` (не переводится). */
  title?: string;
  /** Название модели из словаря (универсальная приставка: «Universal» / «Универсальный»). */
  titleKey?: MsgKey;
  /** Обозначения модели для поиска (`E‑88`, `B0202`, `126 in 1`); не показываются. */
  aliases: readonly string[];
}

/** Значения по умолчанию (в репозитории); поверх них накладываются настройки из админки. */
export const DEVICE_DEFAULTS: Readonly<Record<ToyId, DeviceCatalogEntry>> = {
  fm38: {brand:'brickgame',readiness:'reconstructing',title:'FM-38 · 2 in 1',aliases:['FM38','FM-38']},
  mario: { brand: 'apollo', readiness: 'playable', aliases: ['Mario'] },
  clock99: { brand: 'apollo', readiness: 'playable', aliases: ['Clock+99', 'Clock 99'] },
  seabattle: { brand: 'apollo', readiness: 'playable', aliases: ['Sea Battle', 'Seabattle'] },
  tank168: { brand: 'apollo', readiness: 'playable', aliases: ['Tank 168', '168 in 1'] },
  alibaba: { brand: DEFAULT_BRAND, readiness: 'shell', aliases: ['Dance 99 in 1', '99 in 1'] },
  // Играет, но порядок вариаций тетриса и часть ЖК — допущения (docs/minibrick.md): реконструкция продолжается.
  // Неразрывный дефис (U+2011) в названии: в узкой карточке «B‑S96» не рвётся на две строки.
  minibrick: { brand: DEFAULT_BRAND, readiness: 'reconstructing', title: 'Mini Brick Game B\u2011S96', aliases: ['B-S96', '96 in 1', 'Mini Brick'] },
  brickgame: { brand: 'brickgame', readiness: 'playable', titleKey: 'toy.universal', aliases: ['Universal', 'Универсальный'] },
  e88: { brand: 'brickgame', readiness: 'reconstructing', title: 'E-88 · 8 in 1', aliases: ['E-88', 'E88', '8 in 1'] },
  'apollo-b0202': { brand: 'apollo', readiness: 'reconstructing', title: 'B0202 · 126 in 1', aliases: ['B0202', '126 in 1', 'Apollo B0202'] },
  e23: { brand: 'brickgame', readiness: 'reconstructing', title: 'E-23 · 96 in 1', aliases: ['E-23', 'E23', '96 in 1'] },
  'apollo-b0302': { brand: 'apollo', readiness: 'reconstructing', title: 'B0302 · 18 in 1', aliases: ['B0302', '18 in 1', 'Apollo B0302'] },
  // Корпус по фото владельца (docs/taksun.md); игры появятся позже.
  taksun: { brand: 'taksun', readiness: 'shell', title: 'TS-995 · 9999 in 1', aliases: ['TAKSUN TS-995', 'TS-995', 'TS995', '9999 in 1', 'Taksun'] },
};

/** Отличия от значений по умолчанию, заданные в админке (`config.catalog`). */
export interface DeviceOverride {
  brand?: DeviceBrand;
  readiness?: DeviceReadiness;
  /** Год выпуска для карточки устройства (четыре цифры); в репозитории он нигде не записан, задаётся в админке. */
  year?: string;
  /** Питание для карточки устройства (например, `2×AA`); задаётся в админке. */
  power?: string;
}
let overrides: Partial<Record<ToyId, DeviceOverride>> = {};

/** Принять настройки из конфигурации (вызывает `applyConfig`); пустой объект возвращает значения по умолчанию. */
export function setDeviceOverrides(next: Partial<Record<ToyId, DeviceOverride>> = {}): void {
  overrides = next;
}

/** Отличия модели от значений по умолчанию, заданные в админке (для карточки устройства: год и питание). */
export function deviceOverride(id: ToyId): DeviceOverride | undefined {
  return overrides[id];
}

/** Бренд и готовность модели с учётом настроек админки. */
export function deviceEntry(id: ToyId): DeviceCatalogEntry {
  const base = DEVICE_DEFAULTS[id];
  const own = overrides[id];
  return { ...base, brand: own?.brand ?? base.brand, readiness: own?.readiness ?? base.readiness };
}

/** Первой в каталоге стоит универсальная модель — основная на сайте (открывается без параметра `?toy=`). */
const FIRST_DEVICE: ToyId = 'brickgame';

/** Порядок в сетке: сначала универсальный Brick Game, затем бренды подряд (Apollo, TAKSUN, Brick Game), внутри бренда — порядок регистрации в `TOY_IDS`. */
export function catalogOrder(ids: readonly ToyId[] = TOY_IDS): ToyId[] {
  const rank = (id: ToyId): number => (id === FIRST_DEVICE ? -1 : DEVICE_BRANDS.indexOf(deviceEntry(id).brand));
  return [...ids].sort((a, b) => rank(a) - rank(b) || ids.indexOf(a) - ids.indexOf(b));
}

export interface DeviceLabel {
  /** Мелкий вторичный текст: бренд (производитель). */
  maker: string;
  /** Основной текст: название модели. */
  title: string;
}

export function deviceLabel(id: ToyId, translate: (key: MsgKey) => string): DeviceLabel {
  const entry = deviceEntry(id);
  return {
    maker: BRAND_LABEL[entry.brand],
    title: entry.titleKey ? translate(entry.titleKey) : (entry.title ?? TOYS[id].name),
  };
}

/** Сравнение без регистра, пробелов и знаков: `E88`, `e-88` и `E‑88` — одно и то же. */
export function normalizeQuery(text: string): string {
  return text.toLocaleLowerCase().replace(/[\s·\-‐‑–—_.+/,]+/g, '');
}

/** Что ищется у модели: бренд, название, название в каталоге и обозначения. */
export function searchTerms(id: ToyId, translate: (key: MsgKey) => string): string[] {
  const entry = deviceEntry(id);
  const label = deviceLabel(id, translate);
  return [BRAND_LABEL[entry.brand], TOYS[id].name, label.title, ...entry.aliases];
}

export interface CatalogFilter {
  category: DeviceBrand | 'all';
  query: string;
}

/** Модели, подходящие под категорию (бренд) и строку поиска (порядок сохраняется). Пустой запрос — все модели категории. */
export function filterDevices(ids: readonly ToyId[], filter: CatalogFilter, translate: (key: MsgKey) => string): ToyId[] {
  const query = normalizeQuery(filter.query);
  return ids.filter((id) => {
    if (filter.category !== 'all' && deviceEntry(id).brand !== filter.category) return false;
    return query === '' || searchTerms(id, translate).some((term) => normalizeQuery(term).includes(query));
  });
}

/** Сколько моделей в каждой категории (для подсказок вкладок и проверок). */
export function brandCounts(ids: readonly ToyId[] = TOY_IDS): Record<DeviceBrand | 'all', number> {
  const counts: Record<DeviceBrand | 'all', number> = { all: ids.length, apollo: 0, taksun: 0, brickgame: 0 };
  for (const id of ids) counts[deviceEntry(id).brand] += 1;
  return counts;
}

/** «9 моделей» / «1 модель» / «9 models»: число с правильной формой слова. */
export function modelsCount(count: number, lang: 'ru' | 'en'): string {
  if (lang === 'en') return `${count} ${count === 1 ? 'model' : 'models'}`;
  const tens = count % 100;
  const ones = count % 10;
  const word = tens >= 11 && tens <= 14 ? 'моделей' : ones === 1 ? 'модель' : ones >= 2 && ones <= 4 ? 'модели' : 'моделей';
  return `${count} ${word}`;
}
