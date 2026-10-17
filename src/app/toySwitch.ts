import { h } from './dom';
import { onLangChange, t } from './i18n';
import { miniConsole } from './shellPicker';
import { TOY_IDS, TOYS, toyHref, type ToyId } from './toys';

export interface ToySwitch {
  setCurrent(id: ToyId): void;
}
/** Universal console stays pinned; the real models share one keyboard/touch-scrollable shelf. */
export function mountToySwitch(nav: HTMLElement, current: ToyId, onSelect: (id: ToyId) => void): ToySwitch {
  const shelf = h('div', { class: 'toysw__carousel', id: 'real-models', role: 'group' });
  const title = h('span', { class: 'toysw__caption' });
  const previous = h('button', { type: 'button', class: 'toysw__arrow', 'aria-controls': 'real-models' }, '‹');
  const next = h('button', { type: 'button', class: 'toysw__arrow', 'aria-controls': 'real-models' }, '›');
  const real = h('div', { class: 'toysw__real' }, h('div', { class: 'toysw__heading' }, title, previous, next), shelf);
  const items = TOY_IDS.map((id, index) => {
    const model = TOYS[id],
      shell = model.thumbShell ?? 'white',
      icon = miniConsole(shell, 100 + index, id);
    icon.classList.add('toysw__icon');
    const link = h(
      'a',
      { class: 'toysw__item', href: toyHref(id, window.location.search), 'data-toy': id, 'data-shell': shell, 'aria-label': model.name },
      icon,
      h('span', { class: 'toysw__name' }, model.name),
    );
    if (id !== 'brickgame') shelf.append(link);
    return { id, link };
  });
  const universal = items.find((item) => item.id === 'brickgame')!.link;
  universal.classList.add('toysw__universal');
  nav.replaceChildren(universal, real);
  const scroll = (direction: number): void =>
    shelf.scrollBy({
      left: direction * shelf.clientWidth * 0.7,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  // Scroll only the shelf: scrollIntoView can also move the page underneath the fixed controls.
  const reveal = (link: HTMLAnchorElement): void => {
    const item = link.getBoundingClientRect(),
      box = shelf.getBoundingClientRect();
    const left = item.left < box.left ? item.left - box.left : item.right > box.right ? item.right - box.right : 0;
    shelf.scrollBy({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const updateArrows = (): void => {
    previous.disabled = shelf.scrollLeft < 2;
    next.disabled = shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 2;
  };
  previous.addEventListener('click', () => scroll(-1));
  next.addEventListener('click', () => scroll(1));
  shelf.addEventListener('scroll', updateArrows, { passive: true });
  new ResizeObserver(updateArrows).observe(shelf);
  shelf.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const links = items.filter((item) => item.id !== 'brickgame').map((item) => item.link);
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index < 0) return;
    event.preventDefault();
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? links.length - 1
          : Math.max(0, Math.min(links.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    links[target]!.focus({ preventScroll: true });
    reveal(links[target]!);
  });
  const setCurrent = (id: ToyId): void => {
    for (const item of items) {
      if (item.id === id) item.link.setAttribute('aria-current', 'page');
      else item.link.removeAttribute('aria-current');
    }
    requestAnimationFrame(() => {
      const link = items.find((item) => item.id === id)?.link;
      if (id !== 'brickgame' && link) reveal(link);
      updateArrows();
    });
  };
  nav.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.toysw__item');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const id = TOY_IDS.find((id) => id === link.dataset['toy']);
    if (id) onSelect(id);
  });
  const relabel = (): void => {
    nav.setAttribute('aria-label', t('toy.nav'));
    title.textContent = t('toy.real');
    shelf.setAttribute('aria-label', t('toy.real'));
    previous.setAttribute('aria-label', t('toy.previous'));
    next.setAttribute('aria-label', t('toy.next'));
  };
  relabel();
  onLangChange(relabel);
  setCurrent(current);
  return { setCurrent };
}
