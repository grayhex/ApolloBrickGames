import { CATEGORY_LABEL, DEVICE_CATALOG, DEVICE_CATEGORIES, catalogOrder, categoryCounts, deviceLabel, filterDevices, modelsCount, type DeviceCategory, type DeviceReadiness } from './deviceCatalog';
import { h, svg } from './dom';
import { getLang, onLangChange, t, type MsgKey } from './i18n';
import { lockInput } from './inputLock';
import { miniConsole } from './shellPicker';
import { TOY_IDS, TOYS, toyHref, type ToyId } from './toys';

export interface ToySwitch {
  setCurrent(id: ToyId): void;
  /** Закрыть каталог, не переключая устройство (кнопка «назад» браузера, смена вида). */
  close(): void;
  readonly isOpen: boolean;
}

type CategoryFilter = DeviceCategory | 'all';

/** Ширина каталога на десктопе и отступ от края окна, px. */
const MAX_WIDTH = 760;
const EDGE = 12;

const READY_TEXT: Record<DeviceReadiness, { label: MsgKey; hint: MsgKey }> = {
  playable: { label: 'picker.ready.playable', hint: 'picker.hint.playable' },
  reconstructing: { label: 'picker.ready.reconstructing', hint: 'picker.hint.reconstructing' },
  shell: { label: 'picker.ready.shell', hint: 'picker.hint.shell' },
};

/** Значок готовности: ✓ круг с галочкой, ◐ наполовину закрашенный круг, ○ пустой круг. Описание — в `aria-label` и `title`, текста рядом нет. */
function readyIcon(ready: DeviceReadiness): HTMLSpanElement {
  const mark =
    ready === 'playable'
      ? svg('path', { d: 'M5.2 8.3l2 2 3.8-4.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
      : ready === 'reconstructing'
        ? svg('path', { d: 'M8 3.2a4.8 4.8 0 0 0 0 9.6z', fill: 'currentColor' })
        : svg('circle', { cx: '8', cy: '8', r: '1.1', fill: 'currentColor', opacity: '.55' });
  const icon = svg(
    'svg',
    { viewBox: '0 0 16 16', class: 'devpick__ready-icon', 'aria-hidden': 'true', focusable: 'false' },
    svg('circle', { cx: '8', cy: '8', r: '6.4', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3' }),
    mark,
  );
  return h('span', { class: 'devpick__ready', 'data-ready': ready, role: 'img' }, icon);
}

function chevron(): SVGSVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 16 16', class: 'devpick__chevron', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M3.5 6l4.5 4.5L12.5 6', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  );
}

function setReadyText(node: HTMLElement, ready: DeviceReadiness): string {
  const label = t(READY_TEXT[ready].label);
  node.setAttribute('aria-label', label);
  node.title = `${label}. ${t(READY_TEXT[ready].hint)}`;
  return label;
}

let thumbSerial = 500;

/** Миниатюра настоящего корпуса (те же рисунки, что в пульте): цвет — `thumbShell` модели, как его задали в админке. */
function thumb(id: ToyId, className: string): SVGSVGElement {
  const icon = miniConsole(TOYS[id].thumbShell ?? 'white', thumbSerial++, id);
  icon.classList.add(className);
  return icon;
}

/**
 * Выпадающий каталог устройств вместо горизонтальной карусели. Закрытая панель — компактная строка над консолью (миниатюра, производитель и название,
 * значок готовности, стрелка); по нажатию вниз поверх страницы раскрывается каталог: поиск, категории «Все | Apollo | TAKSUN | Brick Game» и сетка карточек со
 * всеми моделями из `TOY_IDS` — Brick Game в ней обычная модель, без закреплённого блока. Метаданные — `deviceCatalog.ts`. Пока каталог открыт, игровой ввод
 * заблокирован (`inputLock.ts`), а клики мимо закрывают его и до кнопок игрушки не доходят. Выбор — ссылка `toyHref`: переключение на месте делает хозяин
 * страницы (`host.ts`), адрес и история обновляются там же.
 */
export function mountToySwitch(nav: HTMLElement, current: ToyId, onSelect: (id: ToyId) => void): ToySwitch {
  const order = catalogOrder(TOY_IDS);
  const panelId = 'devpick-panel';
  const titleId = 'devpick-title';
  let open = false;
  let category: CategoryFilter = 'all';
  let query = '';
  let active: ToyId = current;
  let release: (() => void) | null = null;

  // ── Закрытая панель ─────────────────────────────────────────────────
  const trigger = h('button', { type: 'button', class: 'devpick__trigger', 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-haspopup': 'dialog' });
  const scrim = h('div', { class: 'devpick__scrim', hidden: '' });

  // ── Каталог ─────────────────────────────────────────────────────────
  const title = h('h2', { class: 'devpick__title', id: titleId });
  const count = h('span', { class: 'devpick__count' });
  const close = h('button', { type: 'button', class: 'devpick__close' }, svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: 'M4 4l8 8M12 4l-8 8', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' })));
  const search = h('input', { type: 'search', class: 'devpick__search', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  const tabs = h('div', { class: 'devpick__tabs', role: 'tablist' });
  const categories: CategoryFilter[] = ['all', ...DEVICE_CATEGORIES];
  const tabButtons = new Map<CategoryFilter, HTMLButtonElement>();
  for (const value of categories) {
    const tab = h('button', { type: 'button', class: 'devpick__tab', role: 'tab', id: `devpick-tab-${value}`, 'aria-controls': 'devpick-results', 'data-category': value });
    tabButtons.set(value, tab);
    tabs.append(tab);
  }
  const list = h('ul', { class: 'devpick__list', id: 'devpick-results', role: 'tabpanel', 'aria-labelledby': 'devpick-tab-all' });
  const cards = new Map<ToyId, { item: HTMLLIElement; link: HTMLAnchorElement; maker: HTMLElement; model: HTMLElement; ready: HTMLElement; readyText: HTMLElement }>();
  for (const id of order) {
    const maker = h('span', { class: 'devpick__maker' });
    const model = h('span', { class: 'devpick__model' });
    const ready = readyIcon(DEVICE_CATALOG[id].readiness);
    const readyText = h('span', { class: 'visually-hidden' });
    const link = h(
      'a',
      { class: 'devpick__card', href: toyHref(id, window.location.search), 'data-toy': id, 'data-shell': TOYS[id].thumbShell ?? 'white', 'data-ready': DEVICE_CATALOG[id].readiness, tabindex: '-1' },
      thumb(id, 'devpick__icon'),
      h('span', { class: 'devpick__label' }, maker, model),
      ready,
      readyText,
    );
    const item = h('li', { class: 'devpick__item' }, link);
    cards.set(id, { item, link, maker, model, ready, readyText });
    list.append(item);
  }
  const empty = h('p', { class: 'devpick__empty', role: 'status', hidden: '' });
  const found = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const legend = h('ul', { class: 'devpick__legend' });
  const legendItems = (Object.keys(READY_TEXT) as DeviceReadiness[]).map((ready) => {
    const label = h('span');
    legend.append(h('li', {}, readyIcon(ready), label));
    return { ready, label };
  });
  const panel = h(
    'div',
    { class: 'devpick__panel', id: panelId, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId, hidden: '' },
    h('div', { class: 'devpick__head' }, title, count, close),
    h('div', { class: 'devpick__tools' }, search, tabs),
    h('div', { class: 'devpick__scroll' }, list, empty),
    found,
    legend,
  );
  nav.className = 'devpick';
  nav.replaceChildren(trigger, panel);
  document.body.append(scrim);

  // ── Тексты и состояние ─────────────────────────────────────────────
  const visible = (): HTMLAnchorElement[] => [...list.querySelectorAll<HTMLAnchorElement>('.devpick__item:not([hidden]) .devpick__card')];

  const paintTrigger = (): void => {
    const label = deviceLabel(active, t);
    const ready = DEVICE_CATALOG[active].readiness;
    const status = readyIcon(ready);
    const statusLabel = setReadyText(status, ready);
    trigger.replaceChildren(thumb(active, 'devpick__thumb'), h('span', { class: 'devpick__text' }, h('span', { class: 'devpick__maker' }, label.maker), h('span', { class: 'devpick__model' }, label.title)), status, chevron());
    trigger.setAttribute('aria-label', `${t('picker.trigger', { name: `${label.maker} ${label.title}` })}, ${statusLabel}`);
    trigger.dataset['toy'] = active;
  };

  const paintTabs = (): void => {
    const counts = categoryCounts(order);
    for (const [value, tab] of tabButtons) {
      tab.textContent = value === 'all' ? t('picker.cat.all') : CATEGORY_LABEL[value];
      tab.title = `${tab.textContent} · ${counts[value]}`;
      tab.setAttribute('aria-selected', String(value === category));
      tab.tabIndex = value === category ? 0 : -1;
    }
    list.setAttribute('aria-labelledby', `devpick-tab-${category}`);
  };

  const paintCards = (): void => {
    for (const [id, card] of cards) {
      const label = deviceLabel(id, t);
      const ready = DEVICE_CATALOG[id].readiness;
      card.maker.textContent = label.maker;
      card.model.textContent = label.title;
      card.readyText.textContent = setReadyText(card.ready, ready);
      if (id === active) card.link.setAttribute('aria-current', 'page');
      else card.link.removeAttribute('aria-current');
    }
  };

  const applyFilter = (): void => {
    const shown = new Set(filterDevices(order, { category, query }, t));
    for (const [id, card] of cards) card.item.hidden = !shown.has(id);
    const total = shown.size;
    empty.hidden = total > 0;
    empty.textContent = query.trim() === '' && category !== 'all' ? t('picker.emptyCategory') : t('picker.empty');
    found.textContent = query.trim() === '' && category === 'all' ? '' : t('picker.found', { n: total });
    // Движущийся фокус (roving tabindex): Tab попадает ровно на одну карточку — текущую или первую из показанных.
    const links = visible();
    const stop = links.find((link) => link.dataset['toy'] === active) ?? links[0];
    for (const [, card] of cards) card.link.tabIndex = card.link === stop ? 0 : -1;
  };

  const paintLegend = (): void => {
    for (const { ready, label } of legendItems) label.textContent = t(READY_TEXT[ready].label);
    for (const node of legend.querySelectorAll<HTMLElement>('.devpick__ready')) setReadyText(node, node.dataset['ready'] as DeviceReadiness);
  };

  const relabel = (): void => {
    nav.setAttribute('aria-label', t('toy.nav'));
    title.textContent = t('picker.title');
    count.textContent = modelsCount(order.length, getLang());
    close.setAttribute('aria-label', t('picker.close'));
    close.title = t('picker.close');
    search.placeholder = t('picker.search');
    search.setAttribute('aria-label', t('picker.search'));
    tabs.setAttribute('aria-label', t('picker.categories'));
    paintTrigger();
    paintTabs();
    paintCards();
    paintLegend();
    applyFilter();
  };

  // ── Положение и размеры: каталог выпадает вниз и ограничен окном ────
  const fit = (): void => {
    const view = window.visualViewport;
    const height = view?.height ?? window.innerHeight; // с экранной клавиатурой окно ниже
    const width = document.documentElement.clientWidth;
    const bar = trigger.getBoundingClientRect();
    const top = bar.bottom + 8;
    // Ширина — как у каталога на десктопе, но не шире окна; по горизонтали каталог стоит под панелью, не выходя за края окна.
    const panelWidth = Math.min(MAX_WIDTH, width - 2 * EDGE);
    const left = Math.min(Math.max(bar.left + bar.width / 2 - panelWidth / 2, EDGE), width - EDGE - panelWidth);
    panel.style.setProperty('--devpick-w', `${Math.round(panelWidth)}px`);
    panel.style.setProperty('--devpick-left', `${Math.round(left - nav.getBoundingClientRect().left)}px`);
    panel.style.setProperty('--devpick-max', `${Math.max(240, Math.floor(height - top - EDGE))}px`);
  };

  const focusCard = (link: HTMLAnchorElement | undefined): void => {
    if (!link) return;
    for (const [, card] of cards) card.link.tabIndex = card.link === link ? 0 : -1;
    link.focus({ preventScroll: true });
    const box = link.closest<HTMLElement>('.devpick__scroll');
    if (!box) return;
    const item = link.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    if (item.top < frame.top) box.scrollTop -= frame.top - item.top + 6;
    else if (item.bottom > frame.bottom) box.scrollTop += item.bottom - frame.bottom + 6;
  };

  const openPanel = (): void => {
    if (open) return;
    open = true;
    category = 'all';
    query = '';
    search.value = '';
    release = lockInput(); // ввод в игру заблокирован, зажатое отпущено; оболочки игр ставят партию на паузу
    paintTabs();
    applyFilter();
    fit();
    panel.hidden = false;
    scrim.hidden = false;
    nav.dataset['open'] = '';
    trigger.setAttribute('aria-expanded', 'true');
    focusCard(visible().find((link) => link.dataset['toy'] === active) ?? visible()[0]);
  };

  const closePanel = (focusTrigger = false): void => {
    if (!open) return;
    open = false;
    release?.();
    release = null;
    panel.hidden = true;
    scrim.hidden = true;
    delete nav.dataset['open'];
    trigger.setAttribute('aria-expanded', 'false');
    if (focusTrigger) trigger.focus({ preventScroll: true });
  };

  const select = (id: ToyId): void => {
    closePanel();
    onSelect(id);
  };

  // ── События ────────────────────────────────────────────────────────
  trigger.addEventListener('click', () => (open ? closePanel(true) : openPanel()));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      openPanel();
    }
  });
  close.addEventListener('click', () => closePanel(true));
  // Клик мимо каталога закрывает его и не доходит до игрушки под ним.
  scrim.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    closePanel();
  });
  scrim.addEventListener('click', (event) => event.preventDefault());
  // Страница под каталогом не прокручивается (без `overflow: hidden`: полоса прокрутки не пропадает, консоль не сдвигается): колесо над затемнением и над
  // шапкой панели гасится, а список карточек сам удерживает прокрутку (`overscroll-behavior`), если ему есть куда прокручиваться.
  scrim.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  panel.addEventListener(
    'wheel',
    (event) => {
      const scroller = (event.target as Element | null)?.closest<HTMLElement>('.devpick__scroll');
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight) event.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('focusin', (event) => {
    if (open && event.target instanceof Node && !nav.contains(event.target)) closePanel();
  });
  window.addEventListener('popstate', () => closePanel());
  window.addEventListener('resize', () => open && fit());
  window.visualViewport?.addEventListener('resize', () => open && fit());
  // Escape закрывает каталог, где бы ни был фокус (в том числе на пустом месте панели), и не доходит до других окон страницы.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault();
      event.stopPropagation();
      closePanel(true);
    },
    true,
  );

  search.addEventListener('input', () => {
    query = search.value;
    applyFilter();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault();
      focusCard(visible()[0]);
    }
  });

  const pick = (value: CategoryFilter): void => {
    category = value;
    paintTabs();
    applyFilter();
  };
  tabs.addEventListener('click', (event) => {
    const tab = (event.target as Element | null)?.closest<HTMLButtonElement>('.devpick__tab');
    if (tab) pick(tab.dataset['category'] as CategoryFilter);
  });
  tabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') return focusCard(visible()[0]);
    const index = categories.indexOf(category);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + categories.length) % categories.length;
    pick(categories[next]!);
    tabButtons.get(categories[next]!)?.focus();
  });

  // Сетка карточек: стрелки двигают по строкам и столбцам, Home/End — в начало и конец; вверх из первой строки — в поиск.
  list.addEventListener('keydown', (event) => {
    const links = visible();
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index < 0) return;
    const here = links[index]!;
    if (event.key === ' ') {
      event.preventDefault();
      here.click();
      return;
    }
    let target: HTMLAnchorElement | undefined;
    const rowShift = (direction: 1 | -1): HTMLAnchorElement | undefined => {
      const rows = links.filter((link) => (direction === 1 ? link.offsetTop > here.offsetTop + 4 : link.offsetTop < here.offsetTop - 4));
      if (rows.length === 0) return undefined;
      const rowTop = direction === 1 ? Math.min(...rows.map((link) => link.offsetTop)) : Math.max(...rows.map((link) => link.offsetTop));
      return rows.filter((link) => link.offsetTop === rowTop).sort((a, b) => Math.abs(a.offsetLeft - here.offsetLeft) - Math.abs(b.offsetLeft - here.offsetLeft))[0];
    };
    switch (event.key) {
      case 'ArrowRight':
        target = links[Math.min(links.length - 1, index + 1)];
        break;
      case 'ArrowLeft':
        target = links[Math.max(0, index - 1)];
        break;
      case 'ArrowDown':
        target = rowShift(1) ?? here;
        break;
      case 'ArrowUp':
        target = rowShift(-1);
        if (!target) {
          event.preventDefault();
          search.focus({ preventScroll: true });
          return;
        }
        break;
      case 'Home':
        target = links[0];
        break;
      case 'End':
        target = links[links.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    focusCard(target);
  });

  list.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.devpick__card');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const id = TOY_IDS.find((toy) => toy === link.dataset['toy']);
    if (id) select(id);
  });

  const setCurrent = (id: ToyId): void => {
    active = id;
    paintTrigger();
    paintCards();
    applyFilter();
  };

  relabel();
  onLangChange(relabel);
  return {
    setCurrent,
    close: () => closePanel(),
    get isOpen() {
      return open;
    },
  };
}
