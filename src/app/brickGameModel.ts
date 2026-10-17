import { h, svg } from './dom';
import type { ToyModelRefs } from './toyModel';
import type { ToyModel } from './toys';
import type { Shell } from '../input/settings';
import type { View } from './view';

/**
 * Узор по бокам экрана: группы вложенных квадратов в два столбца, как на фотографии оригинала (левая и правая стороны разные). Строка группы — два символа:
 * слева направо по корпусу, `1` — квадрат есть. Смещения групп — в шагах решётки (между группами полтора шага).
 */
const SIDE_PATTERN: Readonly<Record<'left' | 'right', readonly { at: number; rows: readonly string[] }[]>> = {
  left: [
    { at: 0, rows: ['01', '11', '10'] },
    { at: 3.45, rows: ['10', '11', '10'] },
    { at: 6.9, rows: ['11', '11'] },
    { at: 9.35, rows: ['10', '11', '10', '11'] },
  ],
  right: [
    { at: 0, rows: ['11', '11'] },
    { at: 2.45, rows: ['10', '11', '10', '11'] },
    { at: 6.9, rows: ['10', '11', '10'] },
    { at: 10.35, rows: ['01', '11', '10'] },
  ],
};
/** Шаг решётки узора и сторона квадрата в единицах рисунка. */
const PITCH = 10;
const CELL = 7;
/** Высота рисунка: нижний ряд последней группы — на 12,35 шага от верха, плюс сторона квадрата. */
const MOTIF_HEIGHT = 12.35 * PITCH + CELL;

function sideMotif(side: 'left' | 'right'): SVGSVGElement {
  const motif = svg('svg', {
    class: `classic__motif classic__motif--${side}`,
    viewBox: `0 0 ${PITCH + CELL} ${MOTIF_HEIGHT}`,
    'aria-hidden': 'true',
  });
  for (const group of SIDE_PATTERN[side])
    group.rows.forEach((row, index) =>
      [...row].forEach((cell, column) => {
        if (cell !== '1') return;
        const x = column * PITCH;
        const y = (group.at + index) * PITCH;
        motif.append(
          svg('rect', { x: String(x + 0.35), y: String(y + 0.35), width: String(CELL - 0.7), height: String(CELL - 0.7), fill: 'none', stroke: 'currentColor', 'stroke-width': '.7' }),
          svg('rect', { x: String(x + 1.85), y: String(y + 1.85), width: String(CELL - 3.7), height: String(CELL - 3.7), fill: 'currentColor' }),
        );
      }),
    );
  return motif;
}

/** Подпись кнопки направления: как у консоли — UP/DOWN листают варианты (MODE), LEFT — уровень (LEVEL), RIGHT — скорость (SPEED). */
const DIRECTION_CAPTIONS: Readonly<Record<string, string>> = { up: 'MODE', left: 'LEVEL', right: 'SPEED', down: 'MODE' };

/**
 * Надпись на корпусе по снимку оригинала (серия E-S88): «BRICK» и «GAME» — две параллельные строки, поднимающиеся вправо под углом, ниже и правее —
 * тонкое «N IN 1» (N — число игр, назначенных универсальной модели сейчас), рядом на корпусе — красный круглый знак с улыбкой и раскрытыми ладонями.
 * Допущения: угол, кегль, межстрочное расстояние и размер знака — по пропорциям снимка; шрифт гротеск без засечек (на оригинале он геометрический),
 * китайские иероглифы под знаком не воспроизводятся: что на них напечатано, не установлено.
 */
function wordmark(games: number): SVGSVGElement {
  const mark = svg('svg', { class: 'classic__wordmark', viewBox: '0 0 100 60', 'aria-hidden': 'true' });
  const count = `${games} IN 1`;
  const text = (cls: string, x: number, y: number, length: number, content: string): SVGTextElement =>
    svg('text', { class: cls, x: String(x), y: String(y), textLength: String(length), lengthAdjust: 'spacing' }, content);
  const hand = (side: -1 | 1): SVGGElement => {
    const palm = svg('ellipse', { cx: '0', cy: '0', rx: '3.3', ry: '3.9', fill: 'currentColor' });
    const fingers = [-34, -12, 10, 32].map((angle) =>
      svg('line', { x1: '0', y1: '-2', x2: '0', y2: '-7.6', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', transform: `rotate(${angle} 0 1)` }),
    );
    return svg('g', { transform: `translate(${side * 11.6} 11.4) rotate(${side * 22})` }, palm, ...fingers);
  };
  mark.append(
    svg(
      'g',
      { transform: 'translate(4 53) rotate(-38)', class: 'classic__lines' },
      text('classic__brand', 0, 0, 42, 'BRICK'),
      text('classic__brand', 22, 14.4, 37, 'GAME'),
      text('classic__count', 46, 25.6, count.length * 4.5, count),
    ),
    svg(
      'g',
      { class: 'classic__face', transform: 'translate(80 41)' },
      svg('circle', { r: '10.6', fill: 'currentColor' }),
      svg('g', { fill: 'var(--classic-body)' },
        svg('circle', { cx: '-3.6', cy: '-2.6', r: '1.3' }),
        svg('circle', { cx: '3.6', cy: '-2.6', r: '1.3' }),
        svg('path', { d: 'M-6 1.6Q0 11 6 1.6Z' }),
      ),
      hand(-1),
      hand(1),
    ),
  );
  return mark;
}

/** A new universal design inspired by classic vertical Brick Games, not a replica of a firmware model. */
export function applyBrickGame(refs: ToyModelRefs, model: ToyModel): void {
  const { lid, base } = refs;
  lid.querySelector('.lid__art')?.remove();
  for (const screw of lid.querySelectorAll('.lid__screw')) screw.remove();
  const face = lid.querySelector('.lid__face')!;
  face.append(h('span', { class: 'classic__edition', 'aria-hidden': 'true' }, 'DOT MATRIX • 10 × 20'));
  const bezel = lid.querySelector('.lid__bezel');
  for (const side of ['left', 'right'] as const) (bezel ?? face).append(sideMotif(side));
  const leds = lid.querySelector<HTMLElement>('.lid__leds');
  if (leds) leds.hidden = true;
  base.replaceChildren(
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
        ...(DIRECTION_CAPTIONS[key!]
          ? [
              svg(
                'svg',
                { viewBox: '0 0 20 20', class: 'classic__arrow', 'aria-hidden': 'true' },
                svg('path', {
                  d: 'M10 4L16 15H4Z',
                  fill: 'currentColor',
                  transform: `rotate(${{ up: 0, right: 90, down: 180, left: 270 }[key!] ?? 0} 10 10)`,
                }),
              ),
              h('i', { class: 'classic__caption', 'aria-hidden': 'true' }, DIRECTION_CAPTIONS[key!]!),
            ]
          : [h('span', {}, label!)]),
      ),
    ),
    h('div', { class: 'classic__speaker', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, () => h('i'))),
    wordmark(model.games.length),
  );
}
export function brickGameMini(view: View = 'full', shell?: Shell): SVGSVGElement {
  const body = shell === 'white' ? '#eee' : shell === 'gray' ? '#cecec0' : shell === 'black' ? '#222725' : 'var(--classic-body, #cecec0)';
  const ridge = shell === 'white' ? '#fafaf6' : shell === 'black' ? '#3b403c' : shell === 'gray' ? '#e0e0d5' : 'var(--classic-hi, #e0e0d5)';
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
      svg('path', { d: 'M2 46Q22 43 42 46V53Q22 59 2 53Z', fill: ridge }),
      svg('path', { d: 'M2 53Q22 59 42 53', fill: 'none', stroke: '#111', opacity: '.3', 'stroke-width': '1.2' }),
      ...[9, 18, 27, 35].map((x) => svg('circle', { cx: String(x), cy: '60', r: '2', fill: '#e5cb52' })),
      svg('path', { d: 'M13 68h5v5h5v5h-5v5h-5v-5H8v-5h5Z', fill: '#e5cb52' }),
      svg('circle', { cx: '33', cy: '73', r: '5', fill: '#e5cb52' }),
      svg('circle', { cx: '31', cy: '85', r: '3', fill: '#e5cb52' }),
      svg('path', { d: 'M8 91h14m-14 3h14', stroke: '#777', 'stroke-width': '1.2' }),
    );
  return root;
}
