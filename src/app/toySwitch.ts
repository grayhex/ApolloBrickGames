import { h } from './dom';
import { onLangChange, t } from './i18n';
import { miniConsole } from './shellPicker';
import { TOY_IDS, TOYS, toyHref, type ToyId } from './toys';

/**
 * Переключатель игрушек в шапке страницы: три миниатюры закрытых игрушек (в своём цвете по умолчанию, с наклейкой на подбородке) и их названия.
 * Это обычные ссылки `?toy=…`: у каждой игрушки свой пакет данных и свои обработчики, смена — перезагрузка страницы (как смена маршрута).
 * Текущая игрушка помечена `aria-current`; на узком окне подпись остаётся только у неё.
 */
export function mountToySwitch(nav: HTMLElement, current: ToyId): void {
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
    if (id === current) link.setAttribute('aria-current', 'page');
    return { id, link };
  });
  nav.replaceChildren(...items.map((item) => item.link));
  const relabel = (): void => {
    nav.setAttribute('aria-label', t('toy.nav'));
    for (const { id, link } of items) link.title = t('toy.title', { name: TOYS[id].name });
  };
  relabel();
  onLangChange(relabel);
}
