import { h, svg } from './dom';
import type { ToyKeyId } from './toy';
import type { View } from './view';

const SHEET = `${import.meta.env.BASE_URL}brand/alibaba-logos.png`;
/** Two transparent marks on one asset sheet; each viewport retains the mark's own proportions. */
export function alibabaMark(kind: 'character' | 'dance', attrs: Record<string, string> = {}): SVGSVGElement {
  return svg(
    'svg',
    { viewBox: kind === 'character' ? '130 15 700 870' : '835 150 940 700', 'aria-hidden': 'true', focusable: 'false', ...attrs },
    svg('image', { href: SHEET, width: '1774', height: '887' }),
  );
}
let serial = 0;
function gradient(id: string, colors: string[]): SVGLinearGradientElement {
  return svg(
    'linearGradient',
    { id, x1: '0', y1: '0', x2: '.3', y2: '1' },
    ...colors.map((color, i) => svg('stop', { offset: String(i / (colors.length - 1)), 'stop-color': color })),
  );
}
function screw(x: number, y: number): SVGGElement {
  return svg(
    'g',
    { transform: `translate(${x} ${y}) rotate(-28)` },
    svg('circle', { r: '8', fill: '#999988', stroke: '#d8d8c9', 'stroke-width': '2' }),
    svg('path', { d: 'M-5 0H5M0-5V5', fill: 'none', stroke: '#55564b', 'stroke-width': '2' }),
  );
}
/** Alibaba's lid is taller and squarer than Apollo's. All artwork uses this same 400×440 surface. */
export function alibabaLid(cover = false): SVGSVGElement {
  const id = `ali-lid-${++serial}`;
  const root = svg('svg', { viewBox: '0 0 400 440', class: cover ? 'lid__cover-art' : 'lid__shell', 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg('defs', {}, gradient(id, ['#fffff4', '#e6e4d7', '#d2d0c2', '#a9a99b'])),
    svg('rect', { x: '2', y: '2', width: '396', height: '436', rx: '22', fill: `url(#${id})`, stroke: '#aaa99a', 'stroke-width': '3' }),
    svg('rect', {
      x: '6',
      y: '6',
      width: '388',
      height: '426',
      rx: '19',
      fill: 'none',
      stroke: '#ffffef',
      'stroke-opacity': '.65',
      'stroke-width': '2',
    }),
  );
  if (cover) root.append(alibabaMark('character', { x: '94', y: '51', width: '212', height: '330' }));
  else {
    root.append(
      svg('rect', { x: '15', y: '15', width: '370', height: '405', rx: '14', fill: '#aaa996', stroke: '#818271', 'stroke-width': '2' }),
      svg('rect', { x: '21', y: '21', width: '358', height: '392', rx: '10', fill: 'none', stroke: '#c7c7b5', 'stroke-width': '2' }),
    );
    for (const [x, y] of [
      [33, 33],
      [367, 33],
      [33, 400],
      [367, 400],
    ])
      root.append(screw(x!, y!));
  }
  return root;
}
export const ALIBABA_KEYS: readonly { key: ToyKeyId; label: string; x: number; y: number; r: number }[] = [
  { key: 'onoff', label: 'ON/OFF', x: 58, y: 67, r: 13 },
  { key: 'sp', label: 'S/P', x: 151, y: 67, r: 13 },
  { key: 'sound', label: 'MUTE', x: 245, y: 67, r: 13 },
  { key: 'fire', label: 'QUIT', x: 339, y: 67, r: 13 },
  { key: 'left', label: 'LEFT', x: 73, y: 142, r: 27 },
  { key: 'right', label: 'RIGHT', x: 173, y: 142, r: 27 },
  { key: 'down', label: 'DOWN', x: 123, y: 205, r: 27 },
  { key: 'jump', label: 'ROTATE', x: 312, y: 151, r: 43 },
];
export function alibabaBase(buttons = false): SVGSVGElement {
  const id = `ali-base-${++serial}`;
  const root = svg('svg', { viewBox: '0 0 400 660', class: 'base__art', 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg('defs', {}, gradient(id, ['#f8f7ed', '#e7e5d7', '#cccbbd']), gradient(`${id}-key`, ['#c2c3af', '#9fa18c', '#858875'])),
    svg('rect', { x: '2', y: '2', width: '396', height: '656', rx: '24', fill: `url(#${id})`, stroke: '#b6b5a6', 'stroke-width': '3' }),
    svg('rect', { x: '14', y: '13', width: '372', height: '450', rx: '18', fill: '#dedecf', stroke: '#f6f5e7', 'stroke-width': '4' }),
    svg('path', { d: 'M24 24H376V264H24Z', fill: '#efeee3', stroke: '#cecec0', 'stroke-width': '3' }),
  );
  for (const { label, x, y, r } of ALIBABA_KEYS) {
    root.append(
      svg(
        'text',
        {
          x: String(x),
          y: String(label === 'DOWN' ? y + r + 15 : y - r - 10),
          'text-anchor': 'middle',
          fill: '#a35856',
          'font-size': label === 'ROTATE' ? '18' : '15',
          'font-family': 'Arial,sans-serif',
          'letter-spacing': '.8',
        },
        label,
      ),
    );
    if (buttons)
      root.append(svg('circle', { cx: String(x), cy: String(y), r: String(r), fill: `url(#${id}-key)`, stroke: '#737566', 'stroke-width': '2' }));
  }
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 9 - row; col++) {
      const center = col >= 2 && col < 7 - row;
      root.append(
        svg('circle', {
          cx: String(42 + col * 39 + row * 19.5),
          cy: String(340 + row * 35),
          r: '4.6',
          fill: center ? '#57594f' : '#c5c6b7',
          stroke: center ? '#dedfd0' : '#efefe1',
          'stroke-width': '1.2',
        }),
      );
    }
  root.append(
    svg('path', { d: 'M8 463Q200 478 392 463V632Q392 654 370 654H30Q8 654 8 632Z', fill: `url(#${id})`, stroke: '#b9b9a8', 'stroke-width': '2' }),
    svg('path', { d: 'M12 472Q200 485 388 472', fill: 'none', stroke: '#fffef0', 'stroke-width': '4' }),
    alibabaMark('dance', { x: '205', y: '505', width: '160', height: '123' }),
  );
  return root;
}
export function applyAlibabaModel(): void {
  const toy = document.getElementById('toy')!,
    arena = document.getElementById('arena')!,
    base = document.getElementById('base')!,
    front = document.getElementById('lid-front')!;
  for (const el of [toy, arena]) {
    el.dataset['model'] = 'alibaba';
    el.dataset['shell'] = 'white';
  }
  document.body.dataset['toy'] = 'alibaba';
  document.title = 'Alibaba Dance 99 in 1';
  front.querySelector('.lid__shell')?.replaceWith(alibabaLid());
  const face = front.querySelector<HTMLElement>('.lid__face')!;
  for (const el of face.querySelectorAll('.lid__screw,.lid__leds,.lid__art')) el.remove();
  const cover = document.getElementById('lid-cover')!;
  cover.replaceChildren(alibabaLid(true));
  base.replaceChildren(alibabaBase());
  for (const { key, label, x, y, r } of ALIBABA_KEYS) {
    const b = h('button', { type: 'button', class: 'alibaba-key', 'data-key': key, 'aria-label': label, title: label });
    b.style.cssText = `left:${(x - r) / 4}%;top:${(y - r) / 6.6}%;width:${r / 2}%;aspect-ratio:1`;
    base.append(b);
  }
}
/** Same artwork and proportions for the colour and layout pickers, without interactive controls. */
export function alibabaMini(view: View): SVGSVGElement {
  const root = svg('svg', {
    viewBox: `0 0 400 ${view === 'full' ? 1108 : view === 'closed' ? 660 : 440}`,
    class: 'view-mini',
    'data-layout': view,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  if (view !== 'screen') {
    const base = alibabaBase(view === 'full');
    base.removeAttribute('class');
    base.setAttribute('y', view === 'full' ? '448' : '0');
    base.setAttribute('width', '400');
    base.setAttribute('height', '660');
    root.append(base);
  }
  const lid = alibabaLid(view === 'closed');
  lid.removeAttribute('class');
  lid.setAttribute('width', '400');
  lid.setAttribute('height', '440');
  root.append(lid);
  if (view !== 'closed')
    root.append(svg('rect', { x: '73', y: '65', width: '254', height: '314', fill: '#88927b', stroke: '#b8534c', 'stroke-width': '9' }));
  if (view === 'full') {
    root.append(svg('rect', { x: '130', y: '420', width: '140', height: '38', fill: '#252823' }));
    for (const x of [40, 290])
      root.append(
        svg('rect', { x: String(x), y: '426', width: '70', height: '28', rx: '8', fill: '#e7e6d8', stroke: '#aaa99a', 'stroke-width': '2' }),
      );
  }
  return root;
}
