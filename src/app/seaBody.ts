import { svg } from './dom';
import type { ToyModel } from './toys';

/**
 * Нижняя половина «Морского боя» по фотографиям оригинала (владелец, 25 октября 2026), в единицах рисунка корпуса 400 × 620:
 * четыре круглые кнопки меньше обычных и сидят в глубоких лунках (без точек и бликов под ними — на оригинале их нет), подписи почти горизонтальны (едва выгнуты и чуть наклонены: над кнопками веером,
 * над ROTATE и вокруг крестовины — UP и DOWN горизонтально, LEFT и RIGHT вдоль левого и правого края почти вертикально), клавиши направлений — плоские квадраты со скошенными двумя углами в сторону хода и большой круглой
 * вмятиной посередине (форма — по фото снизу; объём не рисуется, клавиши в общем стиле игрушек), динамик — три ряда отверстий ромбом: тёмное ядро и бледные края.
 * Размеры сняты с фото в масштабе 0,2837 единицы на пиксель (ширина корпуса 1410 px); что на фото не видно (наклейка ниже шва), не менялось.
 */

/** Позиции круглых кнопок слева направо и их подписи: почти горизонтальные, наружные чуть ниже и наклонены к краям. */
const ROUND = [
  { x: 75, tilt: -4, drop: 1 },
  { x: 158, tilt: -1.5, drop: 0 },
  { x: 242, tilt: 1.5, drop: 0 },
  { x: 325, tilt: 4, drop: 1 },
] as const;
const ROUND_Y = 74;
const ROUND_W = 34;
/** Лунка круглой кнопки: центр ниже кнопки (кнопка сидит в верхней части чаши), радиус больше кнопки вдвое. */
const DIMPLE = { r: 33, dy: 10 };

const PAD = { cx: 105, cy: 222, arm: 55, w: 48 } as const;
const PAD_DISH_R = 76;
/** Подписи крестовины: центр, длина пути, направление чтения (градусы по часовой от оси x) и выгиб; UP, DOWN и ROTATE почти горизонтальны, LEFT и RIGHT идут вдоль краёв почти вертикально. */
const CAPTIONS = {
  up: { x: PAD.cx, y: 133, length: 120, deg: 4, bulge: 3 },
  down: { x: PAD.cx, y: 323, length: 90, deg: -6, bulge: -2.5 },
  left: { x: PAD.cx - 81, y: PAD.cy + 4, length: 128, deg: -80, bulge: 2.5 },
  right: { x: PAD.cx + 86, y: PAD.cy - 2, length: 138, deg: 80, bulge: 2.5 },
} as const;

const BIG = { x: 302, y: 224, w: 85, bowl: 62 } as const;

const SPEAKER_STEP = 41.7;
/** Ряды отверстий динамика: высота, число отверстий в ряду (симметрично от оси x = 200), сколько из них тёмного «ядра». */
const SPEAKER_ROWS = [
  { y: 339, half: 4, core: 2 },
  { y: 366, half: 3, core: 1 },
  { y: 393, half: 2, core: 1 },
] as const;

const SEAM = { edge: 377, control: 443 };

/**
 * Клавиша-стрелка в её SVG 40 × 40: квадрат 27 × 30 единиц (контур `.key__shape` ещё расширяет его обводкой в 5 единиц), два угла со стороны хода срезаны под 45°, остальные скруглены;
 * посередине большая круглая вмятина (диаметр 23, около 3/4 клавиши, как на фото). Объёма нет: тень и градиент — общие для клавиш игрушек (`.key--pad` в styles.css).
 */
const KEY = { x0: 6.5, x1: 33.5, y0: 5, y1: 33, cut: 7, round: 2, dish: { cx: 20, cy: 19, r: 11.5 } } as const;
const ARROW_CUTS: Record<'up' | 'down' | 'left' | 'right', readonly ('tl' | 'tr' | 'br' | 'bl')[]> = {
  up: ['tl', 'tr'],
  down: ['bl', 'br'],
  left: ['tl', 'bl'],
  right: ['tr', 'br'],
};

function keyPath(cuts: readonly ('tl' | 'tr' | 'br' | 'bl')[]): string {
  const { x0, x1, y0, y1, cut: c, round: r } = KEY;
  const has = (corner: 'tl' | 'tr' | 'br' | 'bl'): boolean => cuts.includes(corner);
  return [
    `M${x0 + (has('tl') ? c : r)} ${y0}`,
    has('tr') ? `H${x1 - c}L${x1} ${y0 + c}` : `H${x1 - r}Q${x1} ${y0} ${x1} ${y0 + r}`,
    has('br') ? `V${y1 - c}L${x1 - c} ${y1}` : `V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}`,
    has('bl') ? `H${x0 + c}L${x0} ${y1 - c}` : `H${x0 + r}Q${x0} ${y1} ${x0} ${y1 - r}`,
    has('tl') ? `V${y0 + c}L${x0 + c} ${y0}Z` : `V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}Z`,
  ].join('');
}

/** Содержимое SVG клавиши-стрелки: контур и круглая вмятина. */
function arrowKey(direction: 'up' | 'down' | 'left' | 'right'): SVGElement[] {
  const { cx, cy, r } = KEY.dish;
  return [
    svg('path', { class: 'key__shape', d: keyPath(ARROW_CUTS[direction]) }),
    svg('circle', { class: 'key__dish', cx: String(cx), cy: String(cy), r: String(r) }),
  ];
}

const num = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * Путь подписи: отрезок длиной `length` через (cx, cy) в направлении чтения `deg` (градусы по часовой стрелке от оси x: плюс — вниз вправо), едва выгнутый на `sagitta`
 * (плюс — выпуклостью в сторону верха букв, минус — «улыбкой»). Подпись на фото почти прямая, поэтому кривизна — единицы.
 */
function linePath(cx: number, cy: number, length: number, deg: number, sagitta: number): string {
  const a = (deg * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const [nx, ny] = [Math.sin(a), -Math.cos(a)]; // нормаль в сторону верха букв
  const [x0, y0] = [cx - (ux * length) / 2, cy - (uy * length) / 2];
  const [x1, y1] = [cx + (ux * length) / 2, cy + (uy * length) / 2];
  return `M${num(x0)} ${num(y0)}Q${num(cx + 2 * sagitta * nx)} ${num(cy + 2 * sagitta * ny)} ${num(x1)} ${num(y1)}`;
}

function labelOn(id: string, path: string, text: string): SVGElement[] {
  return [
    svg('path', { id, d: path, fill: 'none' }),
    svg('text', { class: 'base__label' }, svg('textPath', { href: `#${id}`, startOffset: '50%', 'text-anchor': 'middle' }, text)),
  ];
}

/** Лунка: чаша с тёмной стенкой сверху-слева и светлой снизу-справа, глубже обычных. */
function dimple(cx: number, cy: number, r: number): SVGElement[] {
  return [
    svg('circle', { cx: num(cx), cy: num(cy), r: num(r), fill: 'url(#sea-dimple)' }),
    svg('circle', { class: 'base__rim-lo base__rim-deep', cx: num(cx - 0.7), cy: num(cy - 1), r: num(r) }),
    svg('circle', { class: 'base__rim-hi', cx: num(cx + 0.7), cy: num(cy + 1.1), r: num(r + 0.4) }),
  ];
}

function speaker(): SVGElement {
  const group = svg('g', { class: 'base__speaker' });
  for (const { y, half, core } of SPEAKER_ROWS)
    for (let k = -half; k <= half; k++) {
      const faint = Math.abs(k) > core;
      group.append(
        svg('circle', { cx: num(200 + k * SPEAKER_STEP), cy: String(y), r: faint ? '3.2' : '4.8', ...(faint ? { class: 'base__hole--faint' } : {}) }),
      );
    }
  return group;
}

/** Рисунок корпуса: оставляет `defs` исходной разметки (градиенты клавиш) и заменяет всё остальное. */
function drawArt(art: Element, model: ToyModel): void {
  for (const child of [...art.children]) if (child.tagName.toLowerCase() !== 'defs') child.remove();
  const defs = art.querySelector('defs');
  defs?.append(
    svg(
      'radialGradient',
      { id: 'sea-dimple', cx: '52%', cy: '60%', r: '58%' },
      svg('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0' }),
      svg('stop', { offset: '0.55', 'stop-color': '#000', 'stop-opacity': '0.12' }),
      svg('stop', { offset: '0.88', 'stop-color': '#000', 'stop-opacity': '0.36' }),
      svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0.5' }),
    ),
  );
  const { labels } = model;

  // Подписи верхнего ряда: дуги веером над кнопками.
  ROUND.forEach(({ x, tilt, drop }, index) => {
    const caption = labels.round[index]?.top ?? '';
    art.append(...labelOn(`sea-arc-${index}`, linePath(x, ROUND_Y - 29.5 + drop, 84, tilt, 2.5), caption));
  });

  // Подписи крестовины и ROTATE: почти прямые.
  const caption = ({ x, y, length, deg, bulge }: (typeof CAPTIONS)[keyof typeof CAPTIONS]): string => linePath(x, y, length, deg, bulge);
  art.append(
    ...labelOn('sea-arc-up', caption(CAPTIONS.up), labels.up),
    ...labelOn('sea-arc-left', caption(CAPTIONS.left), labels.left),
    ...labelOn('sea-arc-right', caption(CAPTIONS.right), labels.right),
    ...labelOn('sea-arc-down', caption(CAPTIONS.down), labels.down),
    ...labelOn('sea-arc-big', linePath(BIG.x + 2, 158, 100, 5, 3), labels.big),
  );

  // Лунки: четыре под круглыми кнопками, большая чаша под ROTATE и блюдце крестовины.
  const dimples = svg('g', { class: 'base__dimples' });
  for (const { x } of ROUND) {
    const cy = ROUND_Y + DIMPLE.dy;
    dimples.append(...dimple(x, cy, DIMPLE.r));
  }
  const bowl = svg('g', { class: 'base__bowl' });
  bowl.append(...dimple(BIG.x, BIG.y + 6, BIG.bowl));
  dimples.append(bowl);
  art.append(
    dimples,
    svg('circle', { cx: String(PAD.cx), cy: String(PAD.cy), r: String(PAD_DISH_R), fill: 'url(#dish)' }),
    svg('circle', { class: 'base__rim-lo', cx: num(PAD.cx - 0.6), cy: num(PAD.cy - 1), r: String(PAD_DISH_R) }),
    svg('circle', { class: 'base__rim-hi', cx: num(PAD.cx + 0.6), cy: num(PAD.cy + 1), r: num(PAD_DISH_R + 0.4) }),
    speaker(),
  );

  // Ступенька корпуса ниже динамика.
  const seam = `M0 ${SEAM.edge}Q200 ${SEAM.control} 400 ${SEAM.edge}`;
  art.append(
    svg('path', { class: 'base__cover', d: `${seam}L400 620L0 620Z`, fill: 'url(#cover)' }),
    svg('path', { class: 'base__cover', d: `${seam}L400 620L0 620Z`, fill: 'url(#sheen)' }),
    svg('path', { class: 'base__seam-lo', d: `M0 ${SEAM.edge + 3}Q200 ${SEAM.control + 3} 400 ${SEAM.edge + 3}`, fill: 'none' }),
    svg('path', { class: 'base__seam', d: seam, fill: 'none' }),
  );
}

function place(button: Element, x: number, y: number, w: number): void {
  (button as HTMLElement).style.cssText = `--x:${num(x)};--y:${num(y)};--w:${w}`;
}

/** Применить корпус «Морского боя» к нижней половине (`#base`): рисунок, положение и форма клавиш. */
export function applySeaBody(base: HTMLElement, model: ToyModel): void {
  const art = base.querySelector('.base__art');
  if (!art) return;
  base.dataset['body'] = 'sea';
  drawArt(art, model);
  [...base.querySelectorAll('.key--round')].forEach((button, index) => place(button, ROUND[index]?.x ?? 0, ROUND_Y, ROUND_W));
  const arms = { up: [0, -PAD.arm], down: [-0.6, PAD.arm], left: [-PAD.arm, 0], right: [PAD.arm, 0] } as const;
  for (const direction of ['up', 'down', 'left', 'right'] as const) {
    const button = base.querySelector(`.key--pad[data-key="${direction}"]`);
    if (!button) continue;
    const [dx, dy] = arms[direction];
    place(button, PAD.cx + dx, PAD.cy + dy, PAD.w);
    button.querySelector('svg')?.replaceChildren(...arrowKey(direction));
  }
  const jump = base.querySelector('.key--jump');
  if (jump) place(jump, BIG.x, BIG.y, BIG.w);
}
