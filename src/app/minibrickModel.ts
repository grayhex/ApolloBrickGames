import { MiniLcd, miniLcdIdle } from '../render/miniScreen';
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
/** Ось ложбины: через центры ON/OFF (64, 255), MUSIC/VOICE (64, 310) и RESET (91, 362). */
const FUNCTION_GROOVE = 'M64 238V312C64 340 76 353 91 364';
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
    // Три функциональные кнопки слева (ON/OFF, MUSIC/VOICE, RESET) сидят в одной выемке-ложбине, как на фото: светлая кромка снизу, тень сверху, дно темнее панели.
    svg('path', { d: FUNCTION_GROOVE, transform: 'translate(0 1.8)', fill: 'none', stroke: '#6aa7c1', 'stroke-opacity': '.55', 'stroke-width': '28', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    svg('path', { d: FUNCTION_GROOVE, fill: 'none', stroke: '#0b2c42', 'stroke-width': '28', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    svg('path', { d: FUNCTION_GROOVE, transform: 'translate(0 1.2)', fill: 'none', stroke: '#154a68', 'stroke-width': '23', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
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
    ['ON', 20, 254],
    ['OFF', 20, 265],
    ['MUSIC', 19, 308],
    ['VOICE', 19, 319],
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
/** Корпус и ЖК-экран Mini Brick Game на странице; возвращает живой экран, которым управляет `miniBrickApp`. */
export function applyMiniBrickModel(): MiniLcd {
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
  const lcd = new MiniLcd();
  lcd.element.classList.add('minibrick-lcd--live');
  document.getElementById('game-area')!.append(lcd.element);
  document.getElementById('lid-cover')!.replaceChildren(miniBrickLid(true));
  const base = document.getElementById('base')!;
  base.replaceChildren(miniBrickBase());
  for (const { key, label, x, y, w, h: height } of MINI_BRICK_KEYS) {
    const button = h('button', { type: 'button', class: 'minibrick-key', 'data-key': key, 'aria-label': label, title: label });
    button.style.cssText = `left:${(x - w / 2) / 4}%;top:${(y - height / 2) / 6.5}%;width:${w / 4}%;height:${height / 6.5}%`;
    base.append(button);
  }
  return lcd;
}
export function miniBrickMini(view: View, white = false): SVGSVGElement {
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
    root.append(svg('rect', { x: '87', y: '68', width: '226', height: '310', fill: '#bec9a6', stroke: '#124e6e', 'stroke-width': '10' }));
    const lcd = miniLcdIdle();
    for (const [key, value] of Object.entries({ x: '92', y: '73', width: '216', height: '300' })) lcd.setAttribute(key, value);
    root.append(lcd);
  }
  if (view === 'full') {
    root.append(svg('rect', { x: '125', y: '424', width: '150', height: '35', fill: '#242625' }));
    for (const x of [40, 290])
      root.append(
        svg('rect', { x: String(x), y: '426', width: '70', height: '28', rx: '8', fill: '#df3b24', stroke: '#9f2b21', 'stroke-width': '2' }),
      );
  }
  if (white) {
    for (const stop of root.querySelectorAll('linearGradient stop')) {
      const offset = Number(stop.getAttribute('offset'));
      stop.setAttribute('stop-color', offset < .5 ? '#fffdf3' : offset < 1 ? '#e4e3d9' : '#b4b4aa');
    }
    for (const shape of root.querySelectorAll('[stroke]')) {
      if (['#ac281c', '#ad291a', '#183f53', '#205774'].includes(shape.getAttribute('stroke')!)) shape.setAttribute('stroke', '#999a91');
    }
  }
  return root;
}
