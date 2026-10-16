import { h, svg } from './dom';
import type { ToyKeyId } from './toy';
import type { View } from './view';

const SHEET = `${import.meta.env.BASE_URL}brand/minibrick-logos.png`;
/** Transparent marks supplied by the owner, separated with SVG viewports. */
export function miniBrickMark(kind: 'cover' | 'label', attrs: Record<string, string> = {}): SVGSVGElement {
  return svg(
    'svg',
    { viewBox: kind === 'cover' ? '155 60 690 680' : '955 230 1005 415', 'aria-hidden': 'true', focusable: 'false', ...attrs },
    svg('image', { href: SHEET, width: '1983', height: '793' }),
  );
}
let serial = 0;
function gradient(id: string, colors: string[]): SVGLinearGradientElement {
  return svg(
    'linearGradient',
    { id, x1: '0', y1: '0', x2: '.5', y2: '1' },
    ...colors.map((color, i) => svg('stop', { offset: String(i / (colors.length - 1)), 'stop-color': color })),
  );
}
function screw(x: number, y: number): SVGGElement {
  return svg(
    'g',
    { transform: `translate(${x} ${y}) rotate(-25)` },
    svg('circle', { r: '7', fill: '#b9b9a7', stroke: '#183c4a', 'stroke-width': '2' }),
    svg('path', { d: 'M-4 0H4M0-4V4', stroke: '#494d46', 'stroke-width': '2' }),
  );
}
export function miniBrickLid(cover = false): SVGSVGElement {
  const id = `mini-lid-${++serial}`;
  const root = svg('svg', { viewBox: '0 0 400 440', class: cover ? 'lid__cover-art' : 'lid__shell', 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg('defs', {}, gradient(id, cover ? ['#ee482c', '#d32c17', '#a91e10'] : ['#3195be', '#227ca5', '#175b80'])),
    svg('rect', {
      x: '2',
      y: '2',
      width: '396',
      height: '436',
      rx: '27',
      fill: `url(#${id})`,
      stroke: cover ? '#ad291a' : '#285a6e',
      'stroke-width': '3',
    }),
    svg('rect', {
      x: '6',
      y: '6',
      width: '388',
      height: '427',
      rx: '24',
      fill: 'none',
      stroke: '#fff',
      'stroke-opacity': '.14',
      'stroke-width': '2',
    }),
  );
  if (cover) root.append(miniBrickMark('cover', { x: '45', y: '57', width: '310', height: '320' }));
  else
    for (const [x, y] of [
      [23, 35],
      [377, 35],
      [23, 405],
      [377, 405],
    ])
      root.append(screw(x!, y!));
  return root;
}
export const MINI_BRICK_KEYS: readonly { key: ToyKeyId; label: string; x: number; y: number; w: number; h: number }[] = [
  { key: 'left', label: 'LEFT/LEVEL', x: 65, y: 112, w: 50, h: 50 },
  { key: 'sp', label: 'START/PAUSE', x: 112, y: 65, w: 50, h: 50 },
  { key: 'right', label: 'RIGHT/SPEED', x: 160, y: 112, w: 50, h: 50 },
  { key: 'down', label: 'DOWN/GAME', x: 112, y: 160, w: 50, h: 50 },
  { key: 'jump', label: 'ROTATE', x: 314, y: 115, w: 66, h: 144 },
  { key: 'onoff', label: 'ON/OFF', x: 64, y: 255, w: 25, h: 25 },
  { key: 'sound', label: 'MUSIC/VOICE', x: 64, y: 310, w: 25, h: 25 },
  { key: 'fire', label: 'RESET', x: 91, y: 362, w: 22, h: 22 },
];
export function miniBrickBase(buttons = false): SVGSVGElement {
  const id = `mini-base-${++serial}`;
  const root = svg('svg', { viewBox: '0 0 400 650', class: 'base__art', 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg(
      'defs',
      {},
      gradient(id, ['#f04b2d', '#dd321b', '#ad2414']),
      gradient(`${id}-blue`, ['#3283a5', '#246484', '#154665']),
      gradient(`${id}-key`, ['#fbef51', '#e6da22', '#bdb61c']),
    ),
    svg('rect', { x: '2', y: '2', width: '396', height: '646', rx: '26', fill: `url(#${id})`, stroke: '#ac281c', 'stroke-width': '3' }),
    svg('rect', { x: '17', y: '14', width: '366', height: '425', rx: '9', fill: `url(#${id}-blue)`, stroke: '#183f53', 'stroke-width': '4' }),
    svg('path', { d: 'M24 25H376V227Q200 213 24 227Z', fill: '#569ab5', 'fill-opacity': '.28', stroke: '#4c8ba6', 'stroke-width': '2' }),
    svg('circle', { cx: '220', cy: '300', r: '102', fill: `url(#${id}-blue)`, stroke: '#205774', 'stroke-width': '3' }),
  );
  for (const [row, offsets] of [
    [0, [-21, 21]],
    [1, [-42, 0, 42]],
    [2, [-21, 21]],
  ] as const)
    for (const offset of offsets)
      root.append(
        svg('rect', { x: String(205 + offset), y: String(274 + row * 28), width: '30', height: '7', rx: '3', fill: '#1b2c32', stroke: '#508099' }),
      );
  const captions: [string, number, number][] = [
    ['LEFT', 49, 60],
    ['LEVEL', 49, 70],
    ['START', 148, 53],
    ['PAUSE', 148, 63],
    ['RIGHT', 187, 111],
    ['SPEED', 187, 121],
    ['DOWN', 47, 169],
    ['GAME', 47, 179],
    ['ON', 24, 254],
    ['OFF', 24, 265],
    ['MUSIC', 22, 308],
    ['VOICE', 22, 319],
    ['RESET', 32, 366],
  ];
  for (const [label, x, y] of captions)
    root.append(
      svg('text', { x: String(x), y: String(y), fill: '#e6e5c7', 'font-family': 'Arial,sans-serif', 'font-size': '8', 'letter-spacing': '1' }, label),
    );
  root.append(
    svg('path', {
      d: 'M260 70L258 88L253 82L258 96L265 84L260 88 M365 151L363 133L358 140L362 125L370 137L364 133',
      fill: '#e6e5c7',
      stroke: '#e6e5c7',
      'stroke-width': '2',
    }),
  );
  if (buttons)
    for (const { key, x, y, w, h: height } of MINI_BRICK_KEYS)
      root.append(
        svg('rect', {
          x: String(x - w / 2),
          y: String(y - height / 2),
          width: String(w),
          height: String(height),
          rx: String(w / 2),
          fill: `url(#${id}-key)`,
          stroke: '#8b9128',
          'stroke-width': '2',
          ...(key === 'jump' ? { transform: `rotate(-15 ${x} ${y})` } : {}),
        }),
      );
  for (const [x, y] of [
    [33, 35],
    [367, 35],
    [33, 418],
    [367, 418],
  ])
    root.append(screw(x!, y!));
  root.append(
    svg('path', { d: 'M12 448Q200 459 388 448', fill: 'none', stroke: '#fb6a44', 'stroke-width': '3' }),
    miniBrickMark('label', { x: '39', y: '481', width: '322', height: '140' }),
  );
  return root;
}
/** Unpowered LCD only: no invented game or animation. Layout is traced from the supplied photograph. */
export function miniBrickLcd(): SVGSVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 240 340', class: 'minibrick-lcd', 'aria-hidden': 'true', focusable: 'false' },
    svg(
      'g',
      { fill: '#354737', opacity: '.18', 'font-family': 'Arial,sans-serif', 'font-size': '10' },
      svg('text', { x: '53', y: '15' }, 'SCORE'),
      svg('rect', { x: '9', y: '33', width: '146', height: '295', fill: 'none', stroke: '#354737', 'stroke-width': '1.5' }),
      svg('text', { x: '171', y: '63' }, 'NEXT'),
      svg('text', { x: '168', y: '150' }, 'SPEED'),
      svg('text', { x: '166', y: '296' }, 'PAUSE'),
      svg('path', { d: 'M175 312H192V320Q184 329 175 320ZM192 314H197V319H192M171 329H198', fill: 'none', stroke: '#354737', 'stroke-width': '2' }),
    ),
  );
}
export function applyMiniBrickModel(): void {
  for (const id of ['toy', 'arena']) {
    const element = document.getElementById(id)!;
    element.dataset['model'] = 'minibrick';
    element.dataset['shell'] = 'red';
  }
  document.body.dataset['toy'] = 'minibrick';
  document.title = 'Mini Brick Game B-S96';
  const front = document.getElementById('lid-front')!;
  front.querySelector('.lid__shell')?.replaceWith(miniBrickLid());
  for (const node of front.querySelectorAll('.lid__screw,.lid__leds,.lid__art')) node.remove();
  document.getElementById('game-area')!.append(miniBrickLcd());
  document.getElementById('lid-cover')!.replaceChildren(miniBrickLid(true));
  const base = document.getElementById('base')!;
  base.replaceChildren(miniBrickBase());
  for (const { key, label, x, y, w, h: height } of MINI_BRICK_KEYS) {
    const button = h('button', { type: 'button', class: 'minibrick-key', 'data-key': key, 'aria-label': label, title: label });
    button.style.cssText = `left:${(x - w / 2) / 4}%;top:${(y - height / 2) / 6.5}%;width:${w / 4}%;height:${height / 6.5}%`;
    base.append(button);
  }
}
export function miniBrickMini(view: View): SVGSVGElement {
  const root = svg('svg', {
    viewBox: `0 0 400 ${view === 'full' ? 1098 : view === 'closed' ? 650 : 440}`,
    class: 'view-mini',
    'data-layout': view,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  if (view !== 'screen') {
    const base = miniBrickBase(view === 'full');
    base.removeAttribute('class');
    base.setAttribute('y', view === 'full' ? '448' : '0');
    base.setAttribute('width', '400');
    base.setAttribute('height', '650');
    root.append(base);
  }
  const lid = miniBrickLid(view === 'closed');
  lid.removeAttribute('class');
  lid.setAttribute('width', '400');
  lid.setAttribute('height', '440');
  root.append(lid);
  if (view !== 'closed') {
    root.append(svg('rect', { x: '72', y: '53', width: '256', height: '347', fill: '#bec9a6', stroke: '#124e6e', 'stroke-width': '10' }));
    const lcd = miniBrickLcd();
    lcd.removeAttribute('class');
    for (const [key, value] of Object.entries({ x: '78', y: '59', width: '244', height: '335' })) lcd.setAttribute(key, value);
    root.append(lcd);
  }
  if (view === 'full') {
    root.append(svg('rect', { x: '125', y: '424', width: '150', height: '35', fill: '#242625' }));
    for (const x of [40, 290])
      root.append(
        svg('rect', { x: String(x), y: '426', width: '70', height: '28', rx: '8', fill: '#df3b24', stroke: '#9f2b21', 'stroke-width': '2' }),
      );
  }
  return root;
}
