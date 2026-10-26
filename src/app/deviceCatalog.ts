import type { MsgKey } from './messages';
import { TOY_IDS, TOYS, type ToyId } from './toys';

/**
 * Каталог устройств (выпадающее меню выбора игрушки, `toySwitch.ts`): явные метаданные каждой модели — производитель, категория фильтра и готовность.
 *
 * Правила классификации (документированы здесь и в docs/toys.md, ничего не выводится по названию, форме корпуса или `ToyModel.family`):
 *  - **Производитель** (`maker`) — только подтверждённый: печатью на корпусе или упаковке, документацией репозитория или решением владельца. Если бренд не
 *    подтверждён, `maker = null`: на карточке тогда пишется название категории (если она задана) или «Бренд не подтверждён»; производитель не придумывается.
 *  - **Категория** (`category`) — группа фильтра «Apollo | TAKSUN | Brick Game»; `null` — модель входит только в «Все». «Brick Game» — универсальная приставка
 *    проекта и устройства, которые каталог проекта называет Brick Game (E‑88). TAKSUN — для моделей этого бренда (в коллекции их пока нет: в `docs/research`
 *    лежат только вектора логотипов); пустая категория показывает пояснение, а не прячется.
 *  - **Готовность** (`readiness`) — три значка: `playable` ✓ — есть играбельная реализация; `reconstructing` ◐ — реконструкция продолжается (часть игр, экрана
 *    или поведения приближена); `shell` ○ — пока только корпус. Это явное решение по документам модели, а не вычисление по числу готовых игр: общий движок
 *    не доказывает точную эмуляцию оригинала, проценты не используются.
 *
 * Запись обязана быть у каждой игрушки (`Record<ToyId, …>`): новая модель, добавленная в `TOY_IDS`, не компилируется без метаданных и сама появляется в каталоге.
 */
export type DeviceCategory = 'apollo' | 'taksun' | 'brickgame';
export const DEVICE_CATEGORIES: readonly DeviceCategory[] = ['apollo', 'taksun', 'brickgame'];

/** Названия категорий — бренды, не переводятся. */
export const CATEGORY_LABEL: Readonly<Record<DeviceCategory, string>> = { apollo: 'Apollo', taksun: 'TAKSUN', brickgame: 'Brick Game' };

export type DeviceReadiness = 'playable' | 'reconstructing' | 'shell';
export const READINESS_ORDER: readonly DeviceReadiness[] = ['playable', 'reconstructing', 'shell'];

export interface DeviceCatalogEntry {
  /** Подтверждённый производитель (бренд); `null` — не установлен. */
  maker: string | null;
  category: DeviceCategory | null;
  readiness: DeviceReadiness;
  /** Название модели в каталоге, если оно короче или иначе, чем `TOYS[id].name` (не переводится). */
  title?: string;
  /** Название модели из словаря (универсальная приставка: «Universal» / «Универсальный»). */
  titleKey?: MsgKey;
  /** Обозначения модели для поиска (`E‑88`, `B0202`, `126 in 1`); не показываются. */
  aliases: readonly string[];
}

export const DEVICE_CATALOG: Readonly<Record<ToyId, DeviceCatalogEntry>> = {
  mario: { maker: 'Apollo', category: 'apollo', readiness: 'playable', aliases: ['Mario'] },
  clock99: { maker: 'Apollo', category: 'apollo', readiness: 'playable', aliases: ['Clock+99', 'Clock 99'] },
  seabattle: { maker: 'Apollo', category: 'apollo', readiness: 'playable', aliases: ['Sea Battle', 'Seabattle'] },
  tank168: { maker: 'Apollo', category: 'apollo', readiness: 'playable', aliases: ['Tank 168', '168 in 1'] },
  alibaba: { maker: null, category: null, readiness: 'shell', aliases: ['Dance 99 in 1', '99 in 1'] },
  // Играет, но порядок вариаций тетриса и часть ЖК — допущения (docs/minibrick.md): реконструкция продолжается.
  // Неразрывный дефис (U+2011) в названии: в узкой карточке «B‑S96» не рвётся на две строки.
  minibrick: { maker: null, category: null, readiness: 'reconstructing', title: 'Mini Brick Game B\u2011S96', aliases: ['B-S96', '96 in 1', 'Mini Brick'] },
  brickgame: { maker: 'Brick Game', category: 'brickgame', readiness: 'playable', titleKey: 'toy.universal', aliases: ['Universal', 'Универсальный'] },
  e88: { maker: null, category: 'brickgame', readiness: 'reconstructing', title: 'E-88 · 8 in 1', aliases: ['E-88', 'E88', '8 in 1'] },
  'apollo-b0202': { maker: 'Apollo', category: 'apollo', readiness: 'reconstructing', title: 'B0202 · 126 in 1', aliases: ['B0202', '126 in 1', 'Apollo B0202'] },
};

/** Порядок в сетке: категории подряд (Apollo, TAKSUN, Brick Game, без категории), внутри — порядок регистрации в `TOY_IDS`. */
export function catalogOrder(ids: readonly ToyId[] = TOY_IDS): ToyId[] {
  const rank = (id: ToyId): number => {
    const category = DEVICE_CATALOG[id].category;
    return category === null ? DEVICE_CATEGORIES.length : DEVICE_CATEGORIES.indexOf(category);
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || ids.indexOf(a) - ids.indexOf(b));
}

export interface DeviceLabel {
  /** Мелкий вторичный текст: производитель, иначе категория, иначе пометка «бренд не подтверждён». */
  maker: string;
  /** Основной текст: название модели. */
  title: string;
}

export function deviceLabel(id: ToyId, translate: (key: MsgKey) => string): DeviceLabel {
  const entry = DEVICE_CATALOG[id];
  return {
    maker: entry.maker ?? (entry.category ? CATEGORY_LABEL[entry.category] : translate('picker.unbranded')),
    title: entry.titleKey ? translate(entry.titleKey) : (entry.title ?? TOYS[id].name),
  };
}

/** Сравнение без регистра, пробелов и знаков: `E88`, `e-88` и `E‑88` — одно и то же. */
export function normalizeQuery(text: string): string {
  return text.toLocaleLowerCase().replace(/[\s·\-‐‑–—_.+/,]+/g, '');
}

/** Что ищется у модели: производитель, категория, название, название в каталоге и обозначения. */
export function searchTerms(id: ToyId, translate: (key: MsgKey) => string): string[] {
  const entry = DEVICE_CATALOG[id];
  const label = deviceLabel(id, translate);
  return [entry.maker ?? '', entry.category ? CATEGORY_LABEL[entry.category] : '', TOYS[id].name, label.title, ...entry.aliases];
}

export interface CatalogFilter {
  category: DeviceCategory | 'all';
  query: string;
}

/** Модели, подходящие под категорию и строку поиска (порядок сохраняется). Пустой запрос — все модели категории. */
export function filterDevices(ids: readonly ToyId[], filter: CatalogFilter, translate: (key: MsgKey) => string): ToyId[] {
  const query = normalizeQuery(filter.query);
  return ids.filter((id) => {
    if (filter.category !== 'all' && DEVICE_CATALOG[id].category !== filter.category) return false;
    return query === '' || searchTerms(id, translate).some((term) => normalizeQuery(term).includes(query));
  });
}

/** Сколько моделей в каждой категории (для пустого состояния и проверок). */
export function categoryCounts(ids: readonly ToyId[] = TOY_IDS): Record<DeviceCategory | 'all', number> {
  const counts: Record<DeviceCategory | 'all', number> = { all: ids.length, apollo: 0, taksun: 0, brickgame: 0 };
  for (const id of ids) {
    const category = DEVICE_CATALOG[id].category;
    if (category) counts[category] += 1;
  }
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
