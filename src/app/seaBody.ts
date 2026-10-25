import { svg } from './dom';
import type { ToyModel } from './toys';

/**
 * Нижняя половина «Морского боя» по фотографии оригинала (владелец, 25 октября 2026), в единицах рисунка корпуса 400 × 620:
 * четыре круглые кнопки меньше обычных и сидят в глубоких лунках (без точек и бликов под ними — на оригинале их нет), подписи изогнуты дугами (над кнопками веером, вокруг крестовины и над ROTATE по эллипсу),
 * клавиши направлений — стрелки (пятиугольник остриём в сторону хода и круглая вмятина), динамик — три ряда отверстий ромбом: тёмное ядро и бледные края.
 * Размеры сняты с фото в масштабе 0,2837 единицы на пиксель (ширина корпуса 1410 px); что на фото не видно (наклейка ниже шва), не менялось.
 */

/** Позиции круглых кнопок слева направо и их подписи: веер дуг, наружные подписи ниже и сильнее наклонены. */
const ROUND = [
  { x: 75, tilt: -10, drop: 2 },
  { x: 158, tilt: -3.5, drop: 0 },
  { x: 242, tilt: 3.5, drop: 0 },
  { x: 325, tilt: 10, drop: 2 },
] as const;
const ROUND_Y = 74;
const ROUND_W = 34;
/** Лунка круглой кнопки: центр ниже кнопки (кнопка сидит в верхней части чаши), радиус больше кнопки вдвое. */
const DIMPLE = { r: 33, dy: 10 };

const PAD = { cx: 105, cy: 222, arm: 55, w: 48 } as const;
const PAD_DISH_R = 76;
/** Эллипс подписей крестовины: центр, полуоси базовой линии подписей «наружу» и базовая линия DOWN (буквы развёрнуты к центру). */
const RING = { cx: PAD.cx - 0.2, cy: PAD.cy, outRx: 86, outRy: 89, downRy: 101, downRx: 86 } as const;

const BIG = { x: 302, y: 224, w: 85, bowl: 62 } as const;

const SPEAKER_STEP = 41.7;
/** Ряды отверстий динамика: высота, число отверстий в ряду (симметрично от оси x = 200), сколько из них тёмного «ядра». */
const SPEAKER_ROWS = [
  { y: 339, half: 4, core: 2 },
  { y: 366, half: 3, core: 1 },
  { y: 393, half: 2, core: 1 },
] as const;

const SEAM = { edge: 377, control: 443 };

/** Сторона квадратной клавиши-стрелки в единицах её SVG (40 × 40). */
const ARROWS: Record<'up' | 'down' | 'left' | 'right', { shape: string; dish: [number, number] }> = {
  up: { shape: 'M20 2.5 37 17V33Q37 36 34 36H6Q3 36 3 33V17Z', dish: [20, 23] },
  down: { shape: 'M20 37.5 3 23V7Q3 4 6 4H34Q37 4 37 7V23Z', dish: [20, 17] },
  left: { shape: 'M2.5 20 17 3H33Q36 3 36 6V34Q36 37 33 37H17Z', dish: [23, 20] },
  right: { shape: 'M37.5 20 23 3H7Q4 3 4 6V34Q4 37 7 37H23Z', dish: [17, 20] },
};

const num = (value: number): string => String(Math.round(value * 100) / 100);

function rotate(point: readonly [number, number], deg: number, about: readonly [number, number]): [number, number] {
  const a = (deg * Math.PI) / 180;
  const dx = point[0] - about[0];
  const dy = point[1] - about[1];
  return [about[0] + dx * Math.cos(a) - dy * Math.sin(a), about[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** Дуга-«улыбка наоборот» (края ниже середины), повёрнутая вокруг своей середины, чтобы подпись осталась точно над кнопкой; по ней идёт подпись. */
function archPath(x: number, y: number, tilt: number): string {
  const about: readonly [number, number] = [x, y - 1]; // середина квадратичной дуги
  const [p0, c, p1] = [
    rotate([x - 34, y + 10], tilt, about),
    rotate([x, y - 12], tilt, about),
    rotate([x + 34, y + 10], tilt, about),
  ];
  return `M${num(p0[0])} ${num(p0[1])}Q${num(c[0])} ${num(c[1])} ${num(p1[0])} ${num(p1[1])}`;
}

/** Дуга по эллипсу от угла `from` к `to` (градусы по часовой стрелке от оси x, как на экране). */
function ellipseArc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): string {
  const at = (deg: number): string => `${num(cx + rx * Math.cos((deg * Math.PI) / 180))} ${num(cy + ry * Math.sin((deg * Math.PI) / 180))}`;
  return `M${at(from)}A${rx} ${ry} 0 0 ${to > from ? 1 : 0} ${at(to)}`;
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
    art.append(...labelOn(`sea-arc-${index}`, archPath(x, ROUND_Y - 29.5 + drop, tilt), caption));
  });

  // Подписи крестовины: по эллипсу вокруг неё; UP/LEFT/RIGHT — буквами наружу, DOWN — к центру.
  art.append(
    ...labelOn('sea-arc-up', ellipseArc(RING.cx, RING.cy, RING.outRx, RING.outRy, -90 - 40, -90 + 40), labels.up),
    ...labelOn('sea-arc-left', ellipseArc(RING.cx, RING.cy, RING.outRx, RING.outRy, 135, 225), labels.left),
    ...labelOn('sea-arc-right', ellipseArc(RING.cx, RING.cy, RING.outRx, RING.outRy, -45, 45), labels.right),
    ...labelOn('sea-arc-down', ellipseArc(RING.cx, RING.cy, RING.downRx, RING.downRy, 90 + 38, 90 - 38), labels.down),
    ...labelOn('sea-arc-big', archPath(BIG.x + 2, 158, 7), labels.big),
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
    const { shape, dish } = ARROWS[direction];
    button.querySelector('svg')?.replaceChildren(
      svg('path', { class: 'key__shape', d: shape }),
      svg('circle', { class: 'key__dish', cx: String(dish[0]), cy: String(dish[1]), r: '8.5' }),
    );
  }
  const jump = base.querySelector('.key--jump');
  if (jump) place(jump, BIG.x, BIG.y, BIG.w);
}
