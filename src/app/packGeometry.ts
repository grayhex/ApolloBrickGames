import type { OutlinePart, OutlinePoint } from './packOutline';
import type { PackFace } from './packs';

/**
 * Геометрия сборных граней блистерной карточки: боковые стенки по контуру (многоугольнику) и вырезка с лицевой картинкой. Чистые вычисления без DOM.
 * Система координат — как у CSS-сцены: начало в центре карточки, x вправо, y вниз, z на зрителя.
 */

/** Размер карточки (по ним контуры из `packOutline` переводятся в координаты сцены: у контуров начало уже в центре). */
export const CARD = { w: 660, h: 1053 } as const;

const r1 = (value: number): number => Math.round(value * 10) / 10;

/** Площадь со знаком (формула Гаусса): положительна, если обход идёт по часовой стрелке на экране (y вниз). */
export function signedArea(points: readonly OutlinePoint[]): number {
  let sum = 0;
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length] ?? [x, y];
    sum += x * ny - nx * y;
  });
  return sum / 2;
}

/** Контур, обходимый по часовой стрелке (тогда нормаль стенки — наружу). */
export function clockwise(points: readonly OutlinePoint[]): OutlinePoint[] {
  return signedArea(points) >= 0 ? [...points] : [...points].reverse();
}

/**
 * Боковые стенки: по одной грани на ребро контура, от `z0` вверх на `depth`. Грань — прямоугольник длины ребра и высоты `depth`, поставленный на ребро
 * (`rotateX(90deg)` поднимает его, `rotateZ` разворачивает вдоль ребра); нормаль — наружу, для освещения. Длина с запасом в 1 px, чтобы между соседними гранями не было щелей.
 */
export function wallFaces(prefix: string, points: readonly OutlinePoint[], z0: number, depth: number, kind: string, lit: boolean): PackFace[] {
  const ring = clockwise(points);
  return ring.map(([x, y], i): PackFace => {
    const [nx, ny] = ring[(i + 1) % ring.length] ?? [x, y];
    const dx = nx - x;
    const dy = ny - y;
    const length = Math.hypot(dx, dy) || 1;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const face: PackFace = {
      id: `${prefix}-${i}`,
      normal: [dy / length || 0, -dx / length || 0, 0], // `|| 0` убирает «минус ноль»
      kind,
      style: {
        width: `${r1(length + 1)}px`,
        height: `${r1(depth)}px`,
        margin: `${r1(-depth / 2)}px 0 0 ${r1(-(length + 1) / 2)}px`,
        transform: `translate3d(${r1((x + nx) / 2)}px, ${r1((y + ny) / 2)}px, ${r1(z0 + depth / 2)}px) rotateZ(${r1(angle)}deg) rotateX(90deg)`,
      },
    };
    if (!lit) face.lit = false;
    return face;
  });
}

/** Лицевая плоскость вырезки: картинка размером `box` (координаты карточки) на высоте `z`. */
export function frontFace(id: string, image: string, part: OutlinePart, z: number, lit: boolean): PackFace {
  const { x, y, w, h } = part.box;
  const face: PackFace = {
    id,
    normal: [0, 0, 1],
    image,
    style: {
      width: `${w}px`,
      height: `${h}px`,
      margin: `${r1(-h / 2)}px 0 0 ${r1(-w / 2)}px`,
      transform: `translate3d(${r1(x + w / 2 - CARD.w / 2)}px, ${r1(y + h / 2 - CARD.h / 2)}px, ${r1(z)}px)`,
    },
  };
  if (!lit) face.lit = false;
  return face;
}
