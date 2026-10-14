import { svg } from './dom';

type Part = readonly ['path' | 'circle' | 'rect', Record<string, string>];

/** Линейные значки 24 × 24 в стиле уголка (штрих `currentColor`); `fill` — закрашенные детали. */
const ICONS = {
  keyboard: [
    ['rect', { x: '2.5', y: '6', width: '19', height: '12', rx: '2.6' }],
    ['path', { d: 'M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9' }],
  ],
  gamepad: [
    ['path', { d: 'M7.4 7.6h9.2a4 4 0 0 1 3.9 3.1l.9 4a2.7 2.7 0 0 1-4.9 2.1L15.6 15H8.4l-1.3 1.8a2.7 2.7 0 0 1-4.9-2.1l.9-4a4 4 0 0 1 3.9-3.1Z' }],
    ['path', { d: 'M8.4 9.9v3.2M6.8 11.5h3.2' }],
    ['circle', { cx: '15.4', cy: '10.9', r: '.8', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '17.6', cy: '12.6', r: '.8', fill: 'currentColor', stroke: 'none' }],
  ],
  sound: [
    ['path', { d: 'M4 9.6h3.4L12 6v12l-4.6-3.6H4Z' }],
    ['path', { d: 'M15.4 9.2a4 4 0 0 1 0 5.6M18 6.8a7.6 7.6 0 0 1 0 10.4' }],
  ],
  soundOff: [
    ['path', { d: 'M4 9.6h3.4L12 6v12l-4.6-3.6H4Z' }],
    ['path', { d: 'M16 9.6l5 4.8M21 9.6l-5 4.8' }],
  ],
  segments: [
    ['path', { d: 'M7.5 4h9M7.5 12h9M7.5 20h9M6 5.5v5M18 5.5v5M6 13.5v5M18 13.5v5' }],
  ],
  screen: [
    ['path', { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }],
    ['rect', { x: '8.2', y: '9', width: '7.6', height: '6', rx: '1' }],
  ],
  sun: [
    ['circle', { cx: '12', cy: '12', r: '3.8' }],
    ['path', { d: 'M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7' }],
  ],
  moon: [['path', { d: 'M20 14.6A8.2 8.2 0 0 1 9.4 4 8.2 8.2 0 1 0 20 14.6Z' }]],
  edit: [
    ['path', { d: 'M4 20l1-4.2L16.4 4.4a1.8 1.8 0 0 1 2.5 0l.7.7a1.8 1.8 0 0 1 0 2.5L8.2 19 4 20Z' }],
    ['path', { d: 'M14.5 6.3l3.2 3.2' }],
  ],
  lock: [
    ['rect', { x: '5', y: '10.5', width: '14', height: '9.5', rx: '2' }],
    ['path', { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5' }],
  ],
  play: [['path', { d: 'M8 5.5l10.5 6.5L8 18.5Z' }]],
  warn: [
    ['path', { d: 'M12 4.2l9 15.6H3Z' }],
    ['path', { d: 'M12 10v4.2M12 17h.01' }],
  ],
} as const satisfies Record<string, readonly Part[]>;

export type IconName = keyof typeof ICONS;

/** Значок как SVG-элемент; цвет — от `color` родителя, для скринридеров скрыт (подпись даёт кнопка). */
export function icon(name: IconName): SVGSVGElement {
  const root = svg('svg', {
    viewBox: '0 0 24 24',
    class: 'icon',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.6',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  for (const [tag, attrs] of ICONS[name]) root.append(svg(tag, attrs));
  return root;
}
