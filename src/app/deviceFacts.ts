import { gt, type GuideText } from '../brick/guide';
import { deviceOverride } from './deviceCatalog';
import type { ToyId } from './toys';

/**
 * Сведения о каждой игрушке для карточки устройства в левой панели (`deviceCard.ts`): что за устройство, какие в нём настоящие игры и сколько вариаций,
 * на чём основана реконструкция. Бренд и название берутся из каталога устройств (`deviceCatalog.ts`), здесь — остальное.
 *
 * Правила данных: записывается только то, что подтверждено документами репозитория, фото, упаковкой или решением владельца. Год выпуска и питание
 * в репозитории нигде не записаны — они `null` и показываются прочерком, пока владелец не сообщит значения (например, `'2×AA'`).
 * Игры — настоящие игры устройства по наклейке, упаковке или дампу (не названия вариантов); вариации — число «N in 1» на корпусе или сумма вариантов
 * по упаковке, `null`, если у устройства оно не известно.
 */
export type SourceKind = 'rom' | 'photo' | 'video' | 'wiki' | 'owner' | 'donor';

export interface DeviceFacts {
  /** Год выпуска: строка вида `'2008'`; `null` — не установлен. */
  year: string | null;
  /** Питание: строка вида `'2×AA'`; `null` — не установлено. */
  power: string | null;
  /** Игры устройства по порядку на корпусе; пусто, если набор не расшифрован или набирается на лету (универсальный Brick Game). */
  games: readonly GuideText[];
  /** Число вариаций («N in 1»); `null` — неизвестно. */
  variations: number | null;
  /** На чём основана реконструкция (порядок — как показываются значки). */
  sources: readonly SourceKind[];
}

const g = gt;
const TETRIS = g('Тетрис', 'Tetris');
const SNAKE = g('Змейка', 'Snake');
const ARRAY = g('Стрельба по массиву', 'Array shooting');
const DESTROY = g('Разрушение клеток', 'Cell destruction');
const BUILD = g('Строительство клеток', 'Cell construction');

export const DEVICE_FACTS: Readonly<Record<ToyId, DeviceFacts>> = {
  mario: { year: null, power: null, games: [g('Марио', 'Mario'), TETRIS, g('Стрельба', 'Shooting')], variations: 109, sources: ['photo', 'video', 'owner'] },
  clock99: {
    year: null,
    power: null,
    games: [
      TETRIS, g('Автогонка', 'Car race'), g('Стрельба', 'Shooting'), g('Танки', 'Tanks'), g('Лягушка', 'Frog'), g('Гонки со стрельбой', 'Shooting race'),
      g('Стрельба по фигурам', 'Shape shooting'), g('Строитель', 'Builder'), g('Тетрис Pentix', 'Tetris Pentix'), g('Арканоид', 'Arkanoid'),
    ],
    variations: null,
    sources: ['photo', 'donor'],
  },
  seabattle: {
    year: null,
    power: null,
    games: [g('Морской бой', 'Sea Battle'), g('Танки', 'Tanks'), g('Ромео и Джульетта', 'Romeo and Juliet'), g('Тетрис с большими фигурами', 'Big-piece Tetris'), TETRIS, g('Арканоид', 'Arkanoid')],
    variations: null,
    sources: ['photo', 'video', 'owner', 'donor'],
  },
  tank168: {
    year: null,
    power: null,
    games: [
      g('Танки', 'Tanks'), g('Лягушка', 'Frog'), g('Гонки', 'Racing'), g('Гонки со стрельбой', 'Shooting race'), ARRAY, g('Стрельба по фигурам', 'Shape shooting'),
      g('Строитель', 'Builder'), TETRIS, g('Тетрис Pentix', 'Tetris Pentix'),
    ],
    variations: 168,
    sources: ['photo', 'owner', 'wiki', 'donor'],
  },
  alibaba: { year: null, power: null, games: [], variations: 99, sources: ['photo'] },
  minibrick: { year: null, power: null, games: [g('Гонки', 'Racing'), TETRIS], variations: 96, sources: ['photo', 'owner', 'donor'] },
  brickgame: { year: null, power: null, games: [], variations: null, sources: ['rom', 'wiki', 'donor'] },
  e88: { year: null, power: null, games: [TETRIS, SNAKE, ARRAY, DESTROY, BUILD], variations: 8, sources: ['rom', 'photo', 'owner', 'donor'] },
  'apollo-b0202': {
    year: null,
    power: null,
    games: [g('Лягушка', 'Frog'), g('Гонки', 'Racing'), g('Стрельба', 'Shooting'), g('Жук', 'Beetle'), g('Кости', 'Dice'), ARRAY, g('Падающие цели', 'Falling targets'), TETRIS, g('Пентамино', 'Pentomino')],
    variations: 126,
    sources: ['rom', 'photo', 'wiki', 'donor'],
  },
  e23: { year: null, power: null, games: [TETRIS, SNAKE, ARRAY, DESTROY, BUILD], variations: 96, sources: ['rom', 'photo'] },
  'apollo-b0302': { year: null, power: null, games: [g('Гонки', 'Racing'), TETRIS], variations: 18, sources: ['rom', 'photo'] },
  taksun: { year: null, power: null, games: [], variations: 9999, sources: ['photo'] },
  fm38: { year: null, power: null, games: [g('Тетрис A', 'Tetris A'), g('Тетрис B', 'Tetris B')], variations: 2, sources: ['photo', 'owner'] },
};

export const SOURCE_ORDER: readonly SourceKind[] = ['rom', 'photo', 'video', 'wiki', 'owner', 'donor'];

/** Пределы значений, которые вносятся в админке: год — четыре цифры, питание — короткая строка без разметки и управляющих символов. */
export const YEAR_PATTERN = /^(19[6-9]\d|20\d{2})$/;
export const POWER_MAX = 32;
export const isYear = (value: unknown): value is string => typeof value === 'string' && YEAR_PATTERN.test(value);
const hasControl = (value: string): boolean => [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export const isPower = (value: unknown): value is string =>
  typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= POWER_MAX && !hasControl(value) && !/[<>]/.test(value);

/** Сведения об устройстве с учётом настроек админки: год и питание из конфигурации важнее записанных в репозитории. */
export function deviceFacts(id: ToyId): DeviceFacts {
  const base = DEVICE_FACTS[id];
  const own = deviceOverride(id);
  return { ...base, year: own?.year ?? base.year, power: own?.power ?? base.power };
}
