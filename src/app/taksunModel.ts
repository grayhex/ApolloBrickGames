import { h, svg } from './dom';
import type { ToyKeyId } from './toy';
import type { View } from './view';

/**
 * TAKSUN TS-995 · 9999 in 1: складной корпус по фотографиям владельца (синий, розовые кнопки). Компоновка близка к Mini Brick Game B-S96 (крышка 400 × 440,
 * основание 400 × 650, экран с рамкой, ромб кнопок, вытянутая кнопка вращения, круглый динамик), но есть отличия: четыре служебные кнопки (PAUSE / START,
 * VOLUME, ON/OFF в изогнутой ложбине слева и RESET ниже), пунктир обводки стакана внизу, декор из тетрамино по бокам экрана, лучник на крышке и надпись TAKSUN
 * в еле заметной вытравленной выемке (подложка не выделяется: владелец — «там просто немного вытравлено»).
 * Логотипы — векторы из архива `TAKSUN-brand-assets.zip` в истории Git (`public/brand/taksun-*.svg`). Игр у модели пока нет: корпус и экран с обводкой стакана.
 */
const BRAND = `${import.meta.env.BASE_URL}brand`;
/** Лучник «9999 in 1 BRICK GAME» (трафарет: синий пластик виден сквозь непропечатанные места) и золотая надпись TAKSUN без подложки. */
export function taksunMark(kind: 'cover' | 'wordmark', attrs: Record<string, string> = {}): SVGSVGElement {
  const [file, width, height] = kind === 'cover' ? ['taksun-upper-logo-stencil.svg', '905', '1160'] : ['taksun-wordmark.svg', '465', '125'];
  return svg(
    'svg',
    { viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false', ...attrs },
    svg('image', { href: `${BRAND}/${file}`, width, height }),
  );
}

let serial = 0;
function gradient(id: string, colors: string[]): SVGLinearGradientElement {
  return svg(
    'linearGradient',
    { id, x1: '0', y1: '0', x2: '.4', y2: '1' },
    ...colors.map((color, i) => svg('stop', { offset: String(i / (colors.length - 1)), 'stop-color': color })),
  );
}
function screw(x: number, y: number): SVGGElement {
  return svg(
    'g',
    { transform: `translate(${x} ${y}) rotate(-20)` },
    svg('circle', { r: '6.5', fill: '#c8b27c', stroke: '#6c5d33', 'stroke-width': '1.6' }),
    svg('path', { d: 'M-3.8 0H3.8M0-3.8V3.8', stroke: '#5b4e2b', 'stroke-width': '1.8' }),
  );
}

const BLUE = ['#1b86c4', '#0d6ba8', '#07508a'];
const CREAM = '#efe8c6';
/** Одна клетка декора: белый контур и жёлто-оранжевая заливка (печать по крышке). */
const CELL = 17.5;
/** Центры клеток тетрамино слева и справа от экрана и над ним (единицы крышки 400 × 440, по снимку). */
const DECOR: readonly (readonly (readonly [number, number])[])[] = [
  [[134, 17], [158, 17], [110, 40], [134, 40]],
  [[258, 17], [281, 17], [304, 17], [258, 40], [304, 40]],
  [[34, 97], [15, 120], [35, 120], [55, 120], [15, 143], [55, 143]],
  [[26, 192], [26, 222], [26, 251], [52, 251]],
  [[27, 299], [27, 328], [52, 328], [27, 357]],
  [[362, 99], [342, 123], [362, 123], [383, 123], [342, 146], [383, 146]],
  [[346, 192], [371, 192], [346, 222], [371, 222]],
  [[358, 269], [358, 298], [358, 328], [358, 357]],
];

/** Крышка 400 × 440: у `cover` — закрытая (с лучником), иначе — лицевая панель с декором, рамкой экрана и винтами. */
export function taksunLid(cover = false): SVGSVGElement {
  const id = `taksun-lid-${++serial}`;
  const root = svg('svg', { viewBox: '0 0 400 440', class: cover ? 'lid__cover-art' : 'lid__shell', 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg('defs', {}, gradient(id, BLUE)),
    svg('rect', { x: '2', y: '2', width: '396', height: '436', rx: '27', fill: `url(#${id})`, stroke: '#06456f', 'stroke-width': '3' }),
    svg('rect', { x: '6', y: '6', width: '388', height: '427', rx: '24', fill: 'none', stroke: '#fff', 'stroke-opacity': '.14', 'stroke-width': '2' }),
  );
  if (cover) {
    root.append(taksunMark('cover', { x: '52', y: '34', width: '296', height: '380' }));
    return root;
  }
  // Тонкая светлая рамка вокруг окна экрана (печать), затем клетки декора.
  root.append(svg('rect', { x: '72', y: '55', width: '256', height: '351', fill: 'none', stroke: '#e8eef4', 'stroke-width': '3.2', 'stroke-opacity': '.92' }));
  for (const group of DECOR)
    for (const [x, y] of group)
      root.append(
        svg('rect', { x: String(x - CELL / 2), y: String(y - CELL / 2), width: String(CELL), height: String(CELL), fill: 'none', stroke: '#e8eef4', 'stroke-width': '1.2' }),
        svg('rect', { x: String(x - CELL / 2 + 3), y: String(y - CELL / 2 + 3), width: String(CELL - 6), height: String(CELL - 6), fill: '#e7a21b' }),
      );
  for (const [x, y] of [[20, 51], [375, 51], [25, 400], [374, 400]] as const) root.append(screw(x, y));
  return root;
}

/** Кнопки основания в единицах 400 × 650; DIR / ROTATE — вытянутая, наклонена. Подписи — как напечатано на корпусе. */
export const TAKSUN_KEYS: readonly { key: ToyKeyId; label: string; x: number; y: number; w: number; h: number }[] = [
  { key: 'up', label: 'UP', x: 114, y: 83, w: 50, h: 50 },
  { key: 'left', label: 'LEFT/LEVEL', x: 68, y: 129, w: 50, h: 50 },
  { key: 'right', label: 'RIGHT/SPEED', x: 161, y: 129, w: 50, h: 50 },
  { key: 'down', label: 'DOWN/GAME', x: 114.5, y: 177, w: 50, h: 50 },
  { key: 'jump', label: 'DIR/ROTATE', x: 322, y: 140, w: 70, h: 122 },
  { key: 'sp', label: 'PAUSE/START', x: 86, y: 270, w: 30, h: 30 },
  { key: 'sound', label: 'VOLUME', x: 94, y: 320, w: 29, h: 29 },
  { key: 'onoff', label: 'ON/OFF', x: 120, y: 365, w: 29, h: 29 },
  { key: 'fire', label: 'RESET', x: 161.5, y: 396, w: 26, h: 26 },
];
/** Ось ложбины: через центры PAUSE/START (86, 270), VOLUME (94, 320) и ON/OFF (120, 365); RESET стоит ниже, вне ложбины. */
const FUNCTION_GROOVE = 'M86 262Q84 322 122 368';
const TILT = -24;

export function taksunBase(buttons = false): SVGSVGElement {
  const id = `taksun-base-${++serial}`;
  const root = svg('svg', { viewBox: '0 0 400 650', class: 'base__art', 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg(
      'defs',
      {},
      gradient(id, BLUE),
      gradient(`${id}-panel`, ['#0f72b0', '#0b5f98', '#074f82']),
      gradient(`${id}-key`, ['#ffc4d2', '#f08aa8', '#d5628a']),
    ),
    svg('rect', { x: '2', y: '2', width: '396', height: '646', rx: '26', fill: `url(#${id})`, stroke: '#06456f', 'stroke-width': '3' }),
    svg('rect', { x: '18', y: '20', width: '364', height: '410', rx: '8', fill: `url(#${id}-panel)`, stroke: '#053d66', 'stroke-width': '4' }),
    // Ступенька-уступ поперёк панели: выше — кнопки направлений, ниже — динамик и служебные кнопки.
    svg('rect', { x: '22', y: '228', width: '356', height: '14', fill: '#2c8cc4', 'fill-opacity': '.5', stroke: '#0a4f80', 'stroke-width': '1.5' }),
    svg('path', { d: 'M22 229H378', stroke: '#8fd0ee', 'stroke-opacity': '.55', 'stroke-width': '1.4' }),
    svg('circle', { cx: '215', cy: '265', r: '94', fill: `url(#${id}-panel)`, stroke: '#07406a', 'stroke-width': '3' }),
    svg('circle', { cx: '215', cy: '265', r: '89', fill: 'none', stroke: '#52b2e0', 'stroke-opacity': '.35', 'stroke-width': '1.5' }),
    // Три служебные кнопки сидят в одной изогнутой ложбине: светлая кромка снизу, тень сверху, дно темнее панели.
    svg('path', { d: FUNCTION_GROOVE, transform: 'translate(0 1.8)', fill: 'none', stroke: '#6cc0e8', 'stroke-opacity': '.5', 'stroke-width': '38', 'stroke-linecap': 'round' }),
    svg('path', { d: FUNCTION_GROOVE, fill: 'none', stroke: '#042f4f', 'stroke-width': '38', 'stroke-linecap': 'round' }),
    svg('path', { d: FUNCTION_GROOVE, transform: 'translate(0 1.2)', fill: 'none', stroke: '#0a4c7b', 'stroke-width': '33', 'stroke-linecap': 'round' }),
  );
  // Динамик: семь прорезей 2 + 3 + 2.
  for (const [row, offsets] of [
    [0, [-21, 21]],
    [1, [-42, 0, 42]],
    [2, [-21, 21]],
  ] as const)
    for (const offset of offsets)
      root.append(svg('rect', { x: String(215 + offset - 17), y: String(246 + row * 25.5 - 3.5), width: '34', height: '7', rx: '1.6', fill: '#04243b', stroke: '#2b79a3', 'stroke-width': '1' }));
  // Крестовина из четырёх контурных треугольников между кнопками направлений.
  root.append(
    svg('path', {
      d: 'M112 117L107 124H117Z M112 146L107 139H117Z M96 131.5L103.5 126.5V136.5Z M128 131.5L120.5 126.5V136.5Z',
      fill: 'none',
      stroke: CREAM,
      'stroke-width': '1.5',
      'stroke-linejoin': 'round',
    }),
    // Круговые стрелки у вытянутой кнопки: поворот влево-вниз сверху и вправо-вверх снизу.
    svg('path', {
      d: 'M303 58Q287 56 276 70M277 70L282 63M277 70L285 72M336 212Q353 210 366 194M366 195L359 197M366 195L365 203',
      fill: 'none',
      stroke: CREAM,
      'stroke-width': '2',
      'stroke-linecap': 'round',
    }),
    svg('path', { d: 'M230 148H273', stroke: CREAM, 'stroke-width': '1.4' }),
  );
  const caption = (label: string, x: number, y: number, size = 11, anchor: 'start' | 'middle' = 'start'): SVGTextElement =>
    svg('text', { x: String(x), y: String(y), fill: CREAM, 'font-family': 'Arial,sans-serif', 'font-size': String(size), 'font-weight': '700', 'letter-spacing': '.4', 'text-anchor': anchor }, label);
  root.append(
    caption('UP', 145, 87),
    caption('RIGHT', 199, 117),
    caption('SPEED', 199, 128),
    caption('LEFT', 40, 170),
    caption('LEVEL', 40, 180),
    caption('DOWN', 51, 201),
    caption('GAME', 51, 211.5),
    caption('DIR', 251, 143, 11, 'middle'),
    caption('ROTATE', 251, 158, 11, 'middle'),
    caption('PAUSE', 24, 282, 8),
    caption('START', 24, 291, 8),
    caption('VOLUME', 24, 345, 10),
    caption('ON/OFF', 46, 377, 10),
    caption('RESET', 183, 401, 11),
  );
  if (buttons)
    for (const { key, x, y, w, h: height } of TAKSUN_KEYS)
      root.append(
        svg('rect', {
          x: String(x - w / 2),
          y: String(y - height / 2),
          width: String(w),
          height: String(height),
          rx: String(w / 2),
          fill: `url(#${id}-key)`,
          stroke: '#a73f66',
          'stroke-width': '2',
          ...(key === 'jump' ? { transform: `rotate(${TILT} ${x} ${y})` } : {}),
        }),
      );
  for (const [x, y] of [[54.5, 68], [352, 68], [55.5, 412], [349, 412]] as const) root.append(screw(x, y));
  root.append(
    svg('rect', { x: '181', y: '436', width: '40', height: '4', rx: '1.5', fill: '#03243d' }),
    svg('path', { d: 'M12 450Q200 462 388 450', fill: 'none', stroke: '#6cc0e8', 'stroke-opacity': '.55', 'stroke-width': '3' }),
    // Выемка под надписью едва заметна: чуть темнее корпуса, тонкая тень сверху и слабый свет снизу.
    svg('rect', { x: '100', y: '508', width: '200', height: '54', rx: '11', fill: '#03345a', 'fill-opacity': '.16' }),
    svg('path', { d: 'M111 508H289Q300 508 300 519', fill: 'none', stroke: '#03294a', 'stroke-opacity': '.4', 'stroke-width': '1.3' }),
    svg('path', { d: 'M300 551Q300 562 289 562H111Q100 562 100 551', fill: 'none', stroke: '#7cc6ee', 'stroke-opacity': '.22', 'stroke-width': '1.3' }),
    taksunMark('wordmark', { x: '125', y: '515', width: '150', height: '40' }),
  );
  return root;
}

/** Экран: обводка стакана (слева, сверху, справа сплошная, внизу пунктир) и разделитель, как напечатано на стекле; видна всегда, игр пока нет. */
export function taksunLcd(attrs: Record<string, string> = {}): SVGSVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 400 570', preserveAspectRatio: 'none', class: 'taksun-lcd', 'aria-hidden': 'true', focusable: 'false', ...attrs },
    svg('path', { class: 'lcd-line', d: 'M12 540V20H260V540' }),
    svg('path', { class: 'lcd-line lcd-line--dash', d: 'M12 540H260' }),
  );
}

/** Корпус и экран на странице; возвращает экран, который лежит в окне крышки. */
export function applyTaksunModel(): SVGSVGElement {
  for (const id of ['toy', 'arena']) {
    const element = document.getElementById(id)!;
    element.dataset['model'] = 'taksun';
    element.dataset['shell'] = 'blue';
  }
  document.body.dataset['toy'] = 'taksun';
  document.title = 'TAKSUN TS-995 · 9999 in 1';
  const front = document.getElementById('lid-front')!;
  front.querySelector('.lid__shell')?.replaceWith(taksunLid());
  for (const node of front.querySelectorAll('.lid__screw,.lid__leds,.lid__art')) node.remove();
  const lcd = taksunLcd();
  document.getElementById('game-area')!.append(lcd);
  document.getElementById('lid-cover')!.replaceChildren(taksunLid(true));
  const base = document.getElementById('base')!;
  base.replaceChildren(taksunBase());
  for (const { key, label, x, y, w, h: height } of TAKSUN_KEYS) {
    const button = h('button', { type: 'button', class: 'taksun-key', 'data-key': key, 'aria-label': label, title: label });
    button.style.cssText = `left:${(x - w / 2) / 4}%;top:${(y - height / 2) / 6.5}%;width:${w / 4}%;height:${height / 6.5}%`;
    base.append(button);
  }
  return lcd;
}

/** Миниатюра для выбора вида и каталога: те же рисунки корпуса, без живых кнопок. */
export function taksunMini(view: View): SVGSVGElement {
  const root = svg('svg', {
    viewBox: `0 0 400 ${view === 'full' ? 1098 : view === 'closed' ? 650 : 440}`,
    class: 'view-mini',
    'data-layout': view,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  if (view !== 'screen') {
    const base = taksunBase(view === 'full');
    base.removeAttribute('class');
    base.setAttribute('y', view === 'full' ? '448' : '0');
    base.setAttribute('width', '400');
    base.setAttribute('height', '650');
    root.append(base);
  }
  const lid = taksunLid(view === 'closed');
  lid.removeAttribute('class');
  lid.setAttribute('width', '400');
  lid.setAttribute('height', '440');
  root.append(lid);
  if (view !== 'closed') {
    root.append(
      svg('rect', { x: '82', y: '67', width: '236', height: '334', fill: '#0b4f7f', stroke: '#04304f', 'stroke-width': '4' }),
      svg('rect', { x: '88', y: '73', width: '224', height: '322', fill: '#a4aa8b' }),
      svg('path', { d: 'M98 380V90H228V380', fill: 'none', stroke: '#2c3226', 'stroke-width': '2.4' }),
    );
  }
  if (view === 'full') {
    root.append(svg('rect', { x: '125', y: '424', width: '150', height: '35', fill: '#050606' }));
    for (const x of [40, 290])
      root.append(svg('rect', { x: String(x), y: '426', width: '70', height: '28', rx: '8', fill: '#0d6ba8', stroke: '#06456f', 'stroke-width': '2' }));
  }
  return root;
}
