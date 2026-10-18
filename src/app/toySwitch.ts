import { h } from './dom';
import { onLangChange, t } from './i18n';
import { miniConsole } from './shellPicker';
import { APOLLO_IDS, TOY_IDS, TOYS, toyHref, type ToyId } from './toys';

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
      h('span', { class: 'toysw__label' }, ...(APOLLO_IDS.some(toy=>toy===id) ? [h('span',{class:'toysw__maker'},'Apollo')] : []), h('span', { class: 'toysw__name' }, model.name)),
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
  // Vertical wheels browse the horizontal shelf; at either end normal page scrolling resumes.
  let wheelTimer:ReturnType<typeof setTimeout> | undefined;
  shelf.addEventListener('wheel', event => {
    if(event.ctrlKey || event.metaKey || Math.abs(event.deltaX)>Math.abs(event.deltaY)) return;
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?shelf.clientWidth:1);
    const before=shelf.scrollLeft;
    const target=Math.max(0,Math.min(shelf.scrollWidth-shelf.clientWidth,before+delta));
    if(Math.abs(target-before)<1) return;
    event.preventDefault();
    shelf.dataset['wheeling']='';
    clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{delete shelf.dataset['wheeling'];},180);
    shelf.scrollBy({left:delta,behavior:'instant'});
  },{passive:false});
  let drag: {id:number;x:number;left:number;moving:boolean} | null=null;
  let suppressClick=false;
  shelf.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='mouse'||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    suppressClick=false;drag={id:event.pointerId,x:event.clientX,left:shelf.scrollLeft,moving:false};
  });
  shelf.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    if(!(event.buttons&1)){drag=null;delete shelf.dataset['dragging'];return;}
    const distance=event.clientX-drag.x;
    if(!drag.moving&&Math.abs(distance)<6)return;
    if(!drag.moving){drag.moving=true;shelf.setPointerCapture(event.pointerId);shelf.dataset['dragging']='';}
    event.preventDefault();shelf.scrollLeft=drag.left-distance;
  });
  const endDrag=(event:PointerEvent):void=>{
    if(!drag||event.pointerId!==drag.id)return;
    suppressClick=drag.moving;drag=null;delete shelf.dataset['dragging'];
    if(shelf.hasPointerCapture(event.pointerId))shelf.releasePointerCapture(event.pointerId);
  };
  shelf.addEventListener('pointerup',endDrag);
  shelf.addEventListener('pointercancel',endDrag);
  shelf.addEventListener('lostpointercapture',()=>{drag=null;delete shelf.dataset['dragging'];});
  shelf.addEventListener('dragstart',event=>event.preventDefault());
  shelf.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},true);
  new ResizeObserver(() => {
    const selected = shelf.querySelector<HTMLAnchorElement>('[aria-current="page"]');
    if (selected) reveal(selected);
    updateArrows();
  }).observe(shelf);
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
