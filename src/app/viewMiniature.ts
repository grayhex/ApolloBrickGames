import { alibabaMini } from './alibabaModel';
import { svg } from './dom';
import { TOYS, type ToyId } from './toys';
import type { View } from './view';

let serial = 0;
const BASE_SHAPE = 'M12 0H388Q400 0 400 12V556Q400 620 336 620H64Q0 620 0 556V12Q0 0 12 0Z';

/** Статичная копия векторного рисунка настоящего корпуса, без интерактивных элементов. */
function copyArt(selector: string, attrs: Record<string, string>): SVGGElement {
  const source = document.querySelector<SVGSVGElement>(selector);
  if (!source) throw new Error(`Нет рисунка корпуса: ${selector}`);
  const box = source.viewBox.baseVal;
  const x = Number(attrs['x'] ?? 0), y = Number(attrs['y'] ?? 0);
  const sx = Number(attrs['width'] ?? box.width) / box.width;
  const sy = Number(attrs['height'] ?? box.height) / box.height;
  // Один SVG viewport: вложенные рисунки переводятся в группы с фиксированным масштабом.
  const copy = svg('g', { transform: `translate(${x} ${y}) scale(${sx} ${sy}) translate(${-box.x} ${-box.y})` });
  copy.append(...[...source.childNodes].map(node => node.cloneNode(true)));
  for (const [name, value] of Object.entries(attrs)) {
    if (!['x', 'y', 'width', 'height'].includes(name)) copy.setAttribute(name, value);
  }
  // У миниатюр достаточно градиентов: фильтры большой игрушки здесь избыточны.
  for (const filter of copy.querySelectorAll('filter')) filter.remove();
  for (const node of copy.querySelectorAll('[filter]')) node.removeAttribute('filter');
  return copy;
}

/** Локальные ID исключают пересечение градиентов, clipPath и textPath с основной игрушкой. */
function scopeIds(root: SVGSVGElement): void {
  const prefix = `view-mini-${++serial}-`;
  const ids = new Map<string, string>();
  for (const node of root.querySelectorAll('[id]')) {
    ids.set(node.id, prefix + node.id);
    node.id = prefix + node.id;
  }
  for (const node of root.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      let value = attr.value.replace(/url\(["']?#([^"')]+)["']?\)/g, (match, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : match);
      if (value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
      if (value !== attr.value) node.setAttribute(attr.name, value);
    }
  }
}

function image(file: string, attrs: Record<string, string>): SVGImageElement {
  return svg('image', { href: `${import.meta.env.BASE_URL}brand/${file}`, preserveAspectRatio: 'xMidYMid meet', ...attrs });
}

function sticker(toy: ToyId): SVGGElement {
  const group = svg('g');
  if (toy === 'mario') {
    for (const [file, print] of [['crocodile-mario-logo.png', 'dark'], ['crocodile-mario-logo-white.png', 'light']] as const) {
      group.append(image(file, { x: '48', y: '412', width: '304', height: '135', 'data-print': print }));
    }
  } else {
    group.append(image(`sticker-${toy}.webp`, { class: `sticker--${toy}`, x: '36', y: '406', width: '328', height: '182' }));
  }
  return group;
}

function base(toy: ToyId, closed: boolean): SVGGElement {
  const group = svg('g', { transform: closed ? 'translate(20 20)' : 'translate(20 416)' },
    svg('path', { d: BASE_SHAPE, fill: 'url(#mini-body)', stroke: 'var(--rim-lo)', 'stroke-width': '4' }));
  if (!closed) {
    group.append(copyArt('#toy .base__art', { x: '0', y: '0', width: '400', height: '620', 'clip-path': 'url(#mini-base-clip)' }));
    for (const x of [68, 152, 240, 324]) {
      group.append(svg('circle', { cx: String(x), cy: '74', r: '19.5', fill: 'url(#keyg)', stroke: 'var(--key-lo)', 'stroke-width': '2' }));
    }
    for (const [key, x, y, size] of [['up', 110, 170, 48], ['left', 62, 218, 48], ['right', 158, 218, 48], ['down', 110, 266, 48], ['jump', 292, 198, 86]] as const) {
      const cap = copyArt(`#toy [data-key="${key}"] svg`, { x: String(x - size / 2), y: String(y - size / 2), width: String(size), height: String(size) });
      // Эти заливки большого корпуса заданы в CSS. Переносим ссылки внутрь копии перед сменой ID.
      for (const node of cap.querySelectorAll<SVGElement>('.key__shape, .key__cap')) {
        node.style.fill = 'url(#keyg)';
        node.style.stroke = 'url(#keyg)';
      }
      for (const node of cap.querySelectorAll<SVGElement>('.key__dish')) node.style.fill = 'url(#concave)';
      group.append(cap);
    }
  }
  group.append(sticker(toy));
  return group;
}

/** Миниатюры используют реальные рисунки крышки, кнопок, динамика и наклеек выбранной модели. */
export function miniView(view: View, toy: ToyId = 'mario'): SVGSVGElement {
  if (toy === 'alibaba') return alibabaMini(view);
  const model = TOYS[toy];
  const height = view === 'full' ? 1056 : view === 'closed' ? 660 : 431;
  const root = svg('svg', { class: 'view-mini', viewBox: `0 0 440 ${height}`, 'data-layout': view, 'aria-hidden': 'true', focusable: 'false' });
  root.append(svg('defs', {},
    svg('linearGradient', { id: 'mini-body', x1: '0', y1: '0', x2: '.25', y2: '1' },
      ...([['0', 'var(--rim-hi)'], ['.16', 'var(--rim)'], ['.82', 'var(--rim-dark)'], ['1', 'var(--rim-lo)']] as const).map(([offset, color]) =>
        svg('stop', { offset, 'stop-color': color }))),
    svg('linearGradient', { id: 'mini-glass', x1: '0', y1: '0', x2: '1', y2: '1' },
      svg('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.28' }),
      svg('stop', { offset: '.5', 'stop-color': '#fff', 'stop-opacity': '0' })),
    svg('clipPath', { id: 'mini-base-clip' }, svg('path', { d: BASE_SHAPE })),
  ));
  if (view === 'closed') {
    root.append(base(toy, true), copyArt('#toy .lid__cover-art', { x: '27', y: '20', width: '386', height: '391' }));
    for (const [file, print] of [['apollo-logo.svg', 'dark'], ['apollo-logo-white-caption.svg', 'light']] as const) {
      root.append(image(file, { x: '90', y: '92', width: '260', height: '260', 'data-print': print }));
    }
    for (const x of [65, 293]) root.append(svg('rect', { x: String(x), y: '17', width: '82', height: '19', rx: '6', fill: 'url(#mini-body)' }));
  } else {
    const lid = svg('g', { transform: 'translate(20 20)' }, copyArt('#toy .lid__shell', { x: '0', y: '0', width: '400', height: '391' }));
    // Режим «экран» показывает крышку без выреза под шарнир.
    lid.querySelector<SVGElement>('.lid__open')?.style.setProperty('opacity', view === 'screen' ? '0' : '1');
    lid.querySelector<SVGElement>('.lid__closed')?.style.setProperty('opacity', view === 'screen' ? '1' : '0');
    for (const [x, y] of [[42, 51], [358, 51], [42, 338], [358, 338]] as const) {
      lid.append(svg('circle', { cx: String(x), cy: String(y), r: '9', fill: '#b8b7aa', stroke: '#797a70', 'stroke-width': '2' }),
        svg('path', { d: `M${x - 4} ${y + 4}l8-8`, stroke: '#62665f', 'stroke-width': '2' }));
    }
    if (model.leds) for (const [x, color] of [[150, '#663b38'], [200, '#7a7442'], [250, '#35695d']] as const) {
      lid.append(svg('circle', { cx: String(x), cy: '55', r: '11', fill: color, stroke: '#79796b', 'stroke-width': '4' }));
    }
    const mario = toy === 'mario';
    const x = mario ? 40 : 80, y = mario ? 118 : 80, w = mario ? 320 : 240, h = mario ? 150 : 280;
    lid.append(svg('rect', { x: String(x), y: String(y), width: String(w), height: String(h), fill: model.lcd.bg, stroke: '#999b87', 'stroke-width': mario ? '17' : '5' }),
      svg('rect', { x: String(x + 4), y: String(y + 4), width: String(w - 8), height: String(h - 8), fill: 'url(#mini-glass)', stroke: model.lcd.ink, 'stroke-width': '2' }));
    if (mario) {
      const art = copyArt('#toy .lid__art', { x: '42', y: '285', width: '316', height: '69', stroke: 'var(--art)', 'stroke-width': '3' });
      art.querySelector('#art-figure')?.setAttribute('stroke-width', '1.9');
      for (const fill of art.querySelectorAll<SVGElement>('.art__fill')) { fill.style.fill = 'var(--art)'; fill.style.stroke = 'none'; }
      lid.append(art);
    } else {
      lid.append(svg('path', { d: 'M240 86V354M247 118h58M247 258h58M247 296h58', fill: 'none', stroke: model.lcd.ink, 'stroke-opacity': '.25', 'stroke-width': '3' }));
      if (model.deco === 'flourish') for (const x of [55, 345]) lid.append(svg('path', { d: `M${x} 120q-9 16 0 32t0 32t0 32m0 40q-9 16 0 32t0 32`, fill: 'none', stroke: 'var(--rim)', 'stroke-width': '3' }));
    }
    root.append(lid);
    if (view === 'full') {
      root.append(base(toy, false), svg('rect', { x: '148', y: '394', width: '144', height: '24', fill: '#252728' }));
      for (const x of [65, 293]) root.append(svg('rect', { x: String(x), y: '395', width: '82', height: '30', rx: '9', fill: 'url(#mini-body)' }));
    }
  }
  scopeIds(root);
  return root;
}
