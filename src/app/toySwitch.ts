import { h } from './dom';
import { onLangChange, t } from './i18n';
import { miniConsole } from './shellPicker';
import { TOY_IDS, TOYS, toyHref, type ToyId, type ToyFamily } from './toys';

export interface ToySwitch {
  setCurrent(id: ToyId): void;
}
/** Family tabs keep the original Apollo collection together; console choices remain ordinary links. */
export function mountToySwitch(nav: HTMLElement, current: ToyId, onSelect: (id: ToyId) => void): ToySwitch {
  const families = ['apollo', 'other'] as const;
  const tabs = h('div', { class: 'toysw__families', role: 'tablist' });
  const panels = new Map<ToyFamily, HTMLElement>(),
    buttons = new Map<ToyFamily, HTMLButtonElement>();
  let active = TOYS[current].family;
  const show = (family: ToyFamily): void => {
    active = family;
    for (const image of panels.get(family)!.querySelectorAll('image[data-src]')) {
      image.setAttribute('href', image.getAttribute('data-src')!);
      image.removeAttribute('data-src');
    }
    for (const id of families) {
      const on = id === family;
      const button = buttons.get(id)!;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      panels.get(id)!.hidden = !on;
    }
  };
  for (const family of families) {
    const button = h('button', {
      type: 'button',
      class: 'toysw__family',
      role: 'tab',
      id: `toy-family-${family}`,
      'aria-controls': `toy-family-panel-${family}`,
    });
    const panel = h('div', {
      class: 'toysw__items',
      role: 'tabpanel',
      id: `toy-family-panel-${family}`,
      'aria-labelledby': button.id,
      'data-family': family,
    });
    button.addEventListener('click', () => show(family));
    buttons.set(family, button);
    panels.set(family, panel);
    tabs.append(button);
  }
  const items = TOY_IDS.map((id, index) => {
    const model = TOYS[id],
      icon = miniConsole(model.defaultShell, 100 + index, id);
    icon.classList.add('toysw__icon');
    if (model.family !== active)
      for (const image of icon.querySelectorAll('image[href]')) {
        image.setAttribute('data-src', image.getAttribute('href')!);
        image.removeAttribute('href');
      }
    const link = h(
      'a',
      { class: 'toysw__item', href: toyHref(id, window.location.search), 'data-toy': id, 'data-shell': model.defaultShell, 'aria-label': model.name },
      icon,
      h('span', { class: 'toysw__name' }, model.name),
    );
    panels.get(model.family)!.append(link);
    return { id, link };
  });
  nav.replaceChildren(tabs, ...panels.values());
  tabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focused = (event.target as HTMLElement).id === 'toy-family-apollo' ? 'apollo' : 'other';
    const next = event.key === 'Home' ? 'apollo' : event.key === 'End' ? 'other' : focused === 'apollo' ? 'other' : 'apollo';
    show(next);
    buttons.get(next)!.focus();
  });
  const setCurrent = (id: ToyId): void => {
    for (const item of items) {
      if (item.id === id) item.link.setAttribute('aria-current', 'page');
      else item.link.removeAttribute('aria-current');
    }
    show(TOYS[id].family);
  };
  setCurrent(current);
  nav.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.toysw__item');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const id = TOY_IDS.find((toy) => toy === link.dataset['toy']);
    if (id) onSelect(id);
  });
  const relabel = (): void => {
    nav.setAttribute('aria-label', t('toy.nav'));
    tabs.setAttribute('aria-label', t('toy.families'));
    for (const family of families) buttons.get(family)!.textContent = t(`toy.family.${family}`);
    for (const { id, link } of items) link.title = t('toy.title', { name: TOYS[id].name });
  };
  relabel();
  onLangChange(relabel);
  return { setCurrent };
}
