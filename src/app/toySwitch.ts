import { h } from './dom';
import { onLangChange, t } from './i18n';
import { miniConsole } from './shellPicker';
import { TOY_IDS, TOYS, toyHref, type ToyId } from './toys';

export interface ToySwitch {
  /** Пометить текущую игрушку (`aria-current`), не пересоздавая переключатель. */
  setCurrent(id: ToyId): void;
}

/**
 * Переключатель игрушек в шапке страницы: миниатюры закрытых игрушек (в своём цвете по умолчанию, с наклейкой на подбородке) и их названия.
 * Это обычные ссылки `?toy=…` — они работают и без скрипта, и по средней кнопке, и «в новой вкладке»; обычный щелчок перехватывается:
 * игрушка меняется на месте, страница не перезагружается (`onSelect`, см. `host.ts`). Текущая игрушка помечена `aria-current`;
 * на узком окне подпись остаётся только у неё.
 */
export function mountToySwitch(nav: HTMLElement, current: ToyId, onSelect: (id: ToyId) => void): ToySwitch {
  const items = TOY_IDS.map((id, index) => {
    const model = TOYS[id];
    const icon = miniConsole(model.defaultShell, 100 + index, id);
    icon.classList.add('toysw__icon');
    const link = h(
      'a',
      { class: 'toysw__item', href: toyHref(id, window.location.search), 'data-toy': id, 'data-shell': model.defaultShell, 'aria-label': model.name },
      icon,
      h('span', { class: 'toysw__name' }, model.name),
    );
    return { id, link };
  });
  nav.replaceChildren(...items.map((item) => item.link));
  const setCurrent = (id: ToyId): void => {
    for (const item of items) {
      if (item.id === id) item.link.setAttribute('aria-current', 'page');
      else item.link.removeAttribute('aria-current');
    }
  };
  setCurrent(current);
  nav.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.toysw__item');
    // Щелчок с Ctrl/⌘/Shift, средняя кнопка, «в новой вкладке» — обычная навигация браузера.
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const id = TOY_IDS.find((toy) => toy === link.dataset['toy']);
    if (id) onSelect(id);
  });
  const relabel = (): void => {
    nav.setAttribute('aria-label', t('toy.nav'));
    for (const { id, link } of items) link.title = t('toy.title', { name: TOYS[id].name });
  };
  relabel();
  onLangChange(relabel);
  return { setCurrent };
}
