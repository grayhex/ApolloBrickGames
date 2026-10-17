import { h, svg } from './dom';
import type { ToyModelRefs } from './toyModel';
import type { Shell } from '../input/settings';
import type { View } from './view';

/** A new universal design inspired by classic vertical Brick Games, not a replica of a firmware model. */
export function applyBrickGame(refs: ToyModelRefs): void {
  const { lid, base } = refs;
  lid.querySelector('.lid__art')?.remove();
  const face = lid.querySelector('.lid__face')!;
  face.append(h('span', { class: 'classic__edition', 'aria-hidden': 'true' }, 'DOT MATRIX • 10 × 20'));
  for (const side of ['left', 'right']) {
    const motif = svg('svg', { class: `classic__motif classic__motif--${side}`, viewBox: '0 0 8 90', 'aria-hidden': 'true' });
    const patterns = ['110110', '101011', '111100', '011110', '111001'];
    patterns.forEach((pattern, index) =>
      [...pattern].forEach((cell, i) => {
        if (cell === '1')
          motif.append(
            svg('rect', {
              x: String(1 + (i % 2) * 3),
              y: String(2 + index * 17 + Math.floor(i / 2) * 3),
              width: '2.2',
              height: '2.2',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '.45',
            }),
          );
      }),
    );
    face.append(motif);
  }
  const leds = lid.querySelector<HTMLElement>('.lid__leds');
  if (leds) leds.hidden = true;
  base.replaceChildren(
    h('div', { class: 'classic__ridge', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'classic__system' },
      ...[
        ['onoff', 'ON/OFF'],
        ['sound', 'SOUND'],
        ['sp', 'START / PAUSE'],
      ].map(([key, label]) =>
        h('button', { type: 'button', class: 'key classic__small', tabindex: '-1', 'data-key': key!, 'aria-label': label! }, h('span', {}, label!)),
      ),
      h('button', { type: 'button', class: 'classic__reset', 'data-action': 'reset', 'aria-label': 'RESET — Menu' }, h('span', {}, 'RESET')),
    ),
    ...[
      ['up', '▲'],
      ['left', '◀︎'],
      ['right', '▶︎'],
      ['down', '▼'],
      ['jump', 'ROTATE'],
      ['fire', 'FIRE'],
    ].map(([key, label]) =>
      h(
        'button',
        { type: 'button', class: `key classic__key classic__key--${key}`, tabindex: '-1', 'data-key': key!, 'aria-label': label! },
        ['up', 'left', 'right', 'down'].includes(key!)
          ? svg(
              'svg',
              { viewBox: '0 0 20 20', class: 'classic__arrow', 'aria-hidden': 'true' },
              svg('path', {
                d: 'M10 4L16 15H4Z',
                fill: 'currentColor',
                transform: `rotate(${{ up: 0, right: 90, down: 180, left: 270 }[key!] ?? 0} 10 10)`,
              }),
            )
          : h('span', {}, label!),
      ),
    ),
    h('div', { class: 'classic__speaker', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, () => h('i'))),
    h('div', { class: 'classic__wordmark', 'aria-hidden': 'true' }, h('strong', {}, 'BRICK GAME'), h('span', {}, 'PLAY THE CLASSICS')),
  );
}
export function brickGameMini(view: View = 'full', shell?: Shell): SVGSVGElement {
  const body = shell === 'white' ? '#eee' : shell === 'gray' ? '#cecec0' : shell === 'black' ? '#222725' : 'var(--classic-body, #cecec0)';
  const screen = view === 'screen';
  const root = svg('svg', { class: 'view-mini', viewBox: `0 0 44 ${screen ? 52 : 100}`, 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg('rect', { x: '1', y: '1', width: '42', height: screen ? '50' : '98', rx: '5', fill: body, stroke: '#777', 'stroke-width': '1.2' }),
    svg('rect', { x: '5', y: '7', width: '34', height: '39', rx: '2', fill: '#292d2c' }),
    svg('rect', { x: '8', y: '10', width: '28', height: '33', fill: '#bac49c' }),
    svg('path', { d: 'M26 11V42M11 38h3v-3h3v3h3v3h-9Z', fill: '#3c4537', stroke: '#3c4537', 'stroke-width': '.4' }),
  );
  if (!screen)
    root.append(
      svg('path', { d: 'M2 51Q22 58 42 51', fill: 'none', stroke: '#999', 'stroke-width': '2' }),
      ...[9, 18, 27, 35].map((x) => svg('circle', { cx: String(x), cy: '60', r: '2', fill: '#e5cb52' })),
      svg('path', { d: 'M13 68h5v5h5v5h-5v5h-5v-5H8v-5h5Z', fill: '#e5cb52' }),
      svg('circle', { cx: '33', cy: '73', r: '5', fill: '#e5cb52' }),
      svg('circle', { cx: '31', cy: '85', r: '3', fill: '#e5cb52' }),
      svg('path', { d: 'M8 91h14m-14 3h14', stroke: '#777', 'stroke-width': '1.2' }),
    );
  return root;
}
