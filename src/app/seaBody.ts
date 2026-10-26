import { svg } from './dom';
import type { ToyModel } from './toys';

/**
 * Нижняя половина «Морского боя» по фотографиям оригинала (владелец, 25 октября 2026), в единицах рисунка корпуса 400 × 620:
 * четыре круглые кнопки меньше обычных и сидят в неглубоких лунках (без точек и бликов под ними — на оригинале их нет), подписи — пологие дуги по снимку анфас (над кнопками ровно, без наклона;
 * UP/MODE дугой над стрелкой, LEFT/LEVEL и RIGHT/SPEED выпуклостью наружу вдоль краёв крестовины, DOWN едва заметной «улыбкой», ROTATE дугой над большой кнопкой),
 * клавиши направлений — стрелки (пятиугольник острием в сторону хода) с круглой выемкой внутри (без светлой обводки: на оригинале это просто углубление), динамик — три ряда отверстий ромбом: тёмное ядро и бледные края.
 * Размеры сняты с фото в масштабе 0,2837 единицы на пиксель (ширина корпуса 1410 px); что на фото не видно (наклейка ниже шва), не менялось.
 */

/** Позиции круглых кнопок слева направо; подписи над ними — пологие симметричные дуги без наклона. */
const ROUND = [{ x: 76 }, { x: 158 }, { x: 242 }, { x: 325 }] as const;
const ROUND_Y = 74;
const ROUND_W = 34;
/** Лунка круглой кнопки: центр ниже кнопки (кнопка сидит в верхней части чаши), радиус больше кнопки вдвое. */
const DIMPLE = { r: 33, dy: 10 };

const PAD = { cx: 105, cy: 222, arm: 55, w: 48 } as const;
const PAD_DISH_R = 76;
/**
 * Подписи по снимку анфас: центр хорды пути, длина пути, направление чтения (градусы по часовой от оси x) и выгиб (плюс — выпуклостью в сторону верха букв).
 * Радиусы дуг на снимке: над кнопками ≈ 100 единиц, UP/MODE ≈ 56, LEFT/LEVEL ≈ 97 и RIGHT/SPEED ≈ 81 (оба — выпуклостью наружу), DOWN ≈ 72 («улыбка»), ROTATE ≈ 70.
 */
const CAPTIONS = {
  up: { x: 111, y: 134, length: 80, deg: 0, bulge: 8 },
  down: { x: 106, y: 318, length: 80, deg: 0, bulge: -3 },
  left: { x: 34.8, y: 217, length: 96, deg: -76, bulge: 12 },
  right: { x: 178, y: 223.5, length: 101, deg: 77, bulge: 15 },
  big: { x: 306, y: 158, length: 80, deg: 0, bulge: 8 },
} as const;
const ROUND_CAPTION = { y: 45, length: 84, bulge: 8.5 } as const;

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
 * Клавиша-стрелка в её SVG 40 × 40: скруглённый хвост с острием в сторону хода (углы при острие — около 90°), остальные углы скруглены; посередине круглая выемка (диаметр 21, около 2/3 клавиши, как на фото).
 * Выемка — просто углубление: градиент `#concave`, без светлой обводки. Объёма нет: тень и градиент клавиши — общие для игрушек (`.key--pad` в styles.css).
 */
// One rounded tail and two small shoulders, rotated around the dished centre.
const UP_ARROW = 'M20 2.5 Q21 2.5 23 5L37 19Q40 23 34 23H32C34 40 6 40 8 23H6Q0 23 3 19L17 5Q19 2.5 20 2.5Z';
const ARROWS = {
  up: { angle: 0 }, down: { angle: 180 }, left: { angle: -90 }, right: { angle: 90 },
} as const;
const DISH_R = 10.5;

/** Содержимое SVG клавиши-стрелки: контур и круглая выемка. */
function arrowKey(direction: 'up' | 'down' | 'left' | 'right'): SVGElement[] {
  const { angle } = ARROWS[direction];
  return [svg('path', { class: 'key__shape', d: UP_ARROW, transform: `rotate(${angle} 20 20)` }), svg('circle', { class: 'key__dish', cx: '20', cy: '23', r: String(DISH_R), transform: `rotate(${angle} 20 20)` })];
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
      svg('stop', { offset: '0.55', 'stop-color': '#000', 'stop-opacity': '0.03' }),
      svg('stop', { offset: '0.88', 'stop-color': '#000', 'stop-opacity': '0.09' }),
      svg('stop', { offset: '0.94', 'stop-color': '#000', 'stop-opacity': '0.06' }),
      svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0' }),
    ),
  );
  defs?.append(svg('radialGradient', { id: 'sea-key-dish', cx: '45%', cy: '24%', r: '78%' },
    svg('stop', {offset:'0', 'stop-color':'var(--key-lo)'}),
    svg('stop', {offset:'0.7', 'stop-color':'var(--key)'}),
    svg('stop', {offset:'1', 'stop-color':'var(--key-hi)'})));
  const { labels } = model;

  // Подписи верхнего ряда: пологие симметричные дуги над кнопками, без наклона.
  ROUND.forEach(({ x }, index) => {
    const caption = labels.round[index]?.top ?? '';
    art.append(...labelOn(`sea-arc-${index}`, linePath(x, ROUND_CAPTION.y, ROUND_CAPTION.length, 0, ROUND_CAPTION.bulge), caption));
  });

  // Подписи крестовины и ROTATE: дуги по снимку анфас.
  const caption = ({ x, y, length, deg, bulge }: (typeof CAPTIONS)[keyof typeof CAPTIONS]): string => linePath(x, y, length, deg, bulge);
  art.append(
    ...labelOn('sea-arc-up', caption(CAPTIONS.up), labels.up),
    ...labelOn('sea-arc-left', caption(CAPTIONS.left), labels.left),
    ...labelOn('sea-arc-right', caption(CAPTIONS.right), labels.right),
    ...labelOn('sea-arc-down', caption(CAPTIONS.down), labels.down),
    ...labelOn('sea-arc-big', caption(CAPTIONS.big), labels.big),
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
