import { h, svg } from './dom';
import { deviceEntry, deviceLabel } from './deviceCatalog';
import { deviceFacts, SOURCE_ORDER, type SourceKind } from './deviceFacts';
import { getLang, t } from './i18n';
import type { MsgKey } from './messages';
import type { ToyId } from './toys';
import './deviceCard.css';

/** Контуры значков карточки (сетка 24 × 24, обводка): каждый — набор путей. */
const ICONS = {
  tag: ['M3 12V4h8l9 9-8 8-9-9z', 'M7.5 8.5h.01'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  battery: ['M3 8h15v8H3z', 'M20 11v2', 'M6.5 10.5v3', 'M9.5 10.5v3', 'M12.5 10.5v3'],
  gamepad: ['M6 8h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2l-1.3-1.5h-5L9.2 15A3 3 0 0 1 2 13v-1a4 4 0 0 1 4-4z', 'M8 10.5v3', 'M6.5 12h3', 'M16 11h.01', 'M18 13h.01'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 12l9 5 9-5', 'M3 16l9 5 9-5'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01'],
  rom: ['M7 7h10v10H7z', 'M10 3v4', 'M14 3v4', 'M10 17v4', 'M14 17v4', 'M3 10h4', 'M3 14h4', 'M17 10h4', 'M17 14h4'],
  photo: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  video: ['M3 6h18v12H3z', 'M10 9.5v5l4.5-2.5z'],
  wiki: ['M4 4.5C7 3.5 10 4 12 5.5 14 4 17 3.5 20 4.5V19c-3-1-6-.5-8 1-2-1.5-5-2-8-1z', 'M12 5.5V20'],
  owner: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c0-4 3.6-6 8-6s8 2 8 6'],
  donor: ['M8 8l-5 4 5 4', 'M16 8l5 4-5 4', 'M14 5l-4 14'],
  cube: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9'],
} as const satisfies Record<string, readonly string[]>;

type IconName = keyof typeof ICONS;

function icon(name: IconName): SVGSVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 24 24', class: `dcard__ic dcard__ic--${name}`, 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    ...ICONS[name].map((d) => svg('path', { d })),
  );
}

export interface DeviceCardOptions {
  toy: ToyId;
  /** Логотип устройства (наклейка, знак): остаётся в карточке, как и раньше в шапке панели. */
  logo: HTMLElement;
  /** Открыть 3D-коробку, если она есть: показывается ссылкой, без миниатюры. */
  box?: { open(): void; label: string; id: string };
  /** Игры, набранные на лету (универсальный Brick Game): названия на языке интерфейса. */
  liveGames?: readonly string[];
}

/** Сколько названий игр показано в списке; остальные — «и ещё N» (полный список — во всплывающей подсказке). */
const LIST_LIMIT = 7;

/** Ячейка «подпись + значок и значение»; подпись короткая, полное название — во всплывающей подсказке. */
const fact = (name: IconName, label: string, full: string, value: string, unknown: boolean, index: number): HTMLElement =>
  h(
    'div',
    { class: 'dcard__fact', style: `--i:${index}`, title: unknown ? `${full}: ${t('dcard.unknown')}` : `${full}: ${value}`, ...(unknown ? { 'data-unknown': '' } : {}), ...(value.length >= 3 ? { 'data-wide': '' } : {}) },
    h('dt', { class: 'dcard__flabel' }, label),
    h('dd', { class: 'dcard__fvalue' }, icon(name), h('span', {}, value)),
  );

/**
 * Карточка устройства — верх левой панели каждой игрушки: логотип, бренд и модель, год выпуска, питание, число игр и вариаций, список игр (просто названия),
 * значки источников реконструкции (ROM из эмулятора, фото, видео, вики, материалы владельца, открытый код) и ссылка на 3D-коробку там, где она есть.
 * Данные — `deviceFacts.ts` (бренд и название — каталог устройств); неизвестное показано прочерком. Карточка компактна и не заменяет энциклопедию.
 */
export function deviceCard(options: DeviceCardOptions): HTMLElement {
  const { toy, logo, box, liveGames } = options;
  const lang = getLang();
  const facts = deviceFacts(toy);
  const label = deviceLabel(toy, t);
  const names = liveGames ?? facts.games.map((game) => game[lang]);
  const shown = names.slice(0, LIST_LIMIT).join(' · ');
  const rest = names.length - LIST_LIMIT;
  const dash = '—';
  let step = 0;
  const next = (): string => `--i:${step++}`;

  const top = h(
    'div',
    { class: 'dcard__top', style: next() },
    h('div', { class: 'dcard__logo' }, logo),
    h('div', { class: 'dcard__id' }, h('span', { class: 'dcard__brand', 'data-brand': deviceEntry(toy).brand }, icon('tag'), label.maker), h('h3', { class: 'dcard__model' }, label.title)),
  );
  const list = h(
    'dl',
    { class: 'dcard__facts', style: next() },
    fact('calendar', t('dcard.year'), t('dcard.year.title'), facts.year ?? dash, facts.year === null, 0),
    fact('battery', t('dcard.power'), t('dcard.power'), facts.power ?? dash, facts.power === null, 1),
    fact('gamepad', t('dcard.games'), t('dcard.games'), names.length > 0 ? String(names.length) : dash, names.length === 0, 2),
    fact('layers', t('dcard.variations'), t('dcard.variations'), facts.variations !== null ? String(facts.variations) : dash, facts.variations === null, 3),
  );
  const games =
    names.length > 0
      ? h(
          'p',
          { class: 'dcard__games', style: next(), title: names.join(' · ') },
          icon('list'),
          h('span', { class: 'dcard__gtext' }, shown, ...(rest > 0 ? [h('i', { class: 'dcard__more' }, ` · ${t('dcard.more').replace('{n}', String(rest))}`)] : [])),
        )
      : null;
  const sources = h(
    'ul',
    { class: 'dcard__sources', 'aria-label': t('dcard.sources') },
    ...SOURCE_ORDER.filter((kind) => facts.sources.includes(kind)).map((kind: SourceKind, index) =>
      h(
        'li',
        { class: 'dcard__source', 'data-kind': kind, title: t(`dcard.src.${kind}.title` as MsgKey), style: `--i:${index}` },
        icon(kind),
        h('span', {}, t(`dcard.src.${kind}` as MsgKey)),
      ),
    ),
  );
  const foot = h('div', { class: 'dcard__foot', style: next() }, sources);
  if (box) {
    const link = h(
      'button',
      { type: 'button', class: 'dcard__box', 'data-box-open': box.id, 'aria-label': box.label, title: t('dcard.box.title') },
      icon('cube'),
      h('span', {}, t('dcard.box')),
    );
    link.addEventListener('click', () => box.open());
    foot.append(link);
  }
  return h('section', { class: 'dcard', 'data-toy': toy, 'aria-label': `${label.maker} ${label.title}` }, top, list, ...(games ? [games] : []), foot);
}
