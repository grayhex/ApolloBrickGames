/**
 * Геометрия и освещение 3D-модели коробки (чистые вычисления без DOM — их проверяют модульные тесты).
 * Коробка — параллелепипед из шести граней-картинок (развёртка упаковки), углы поворота — в градусах в том же порядке, что у CSS-преобразования
 * `rotateX(pitch) rotateY(yaw)`: сначала поворот вокруг вертикальной оси, потом наклон к зрителю.
 */
export type FaceName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export const FACE_NAMES: readonly FaceName[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

/** Размеры коробки в условных единицах: ширина, высота, толщина (по развёртке: лицо 529 × 746, торец ≈ 122). */
export const BOX = { w: 525, h: 750, d: 122 } as const;

/** Наклон вверх-вниз не доходит до полюсов, чтобы коробка не переворачивалась через голову. */
export const MAX_PITCH = 88;
export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 2.2;

export interface BoxView {
  /** Поворот вокруг вертикальной оси: 0 — лицо, 90 — левая грань, 180 — оборот, −90 — правая. */
  yaw: number;
  /** Наклон: отрицательный — коробка смотрит верхней гранью на зрителя. */
  pitch: number;
}

/** Исходный «трёхчетвертной» вид: лицо, правая грань и верх. */
export const HOME_VIEW: BoxView = { yaw: -28, pitch: -14 };

/** Кнопки «Лицо», «Оборот», «Бок», «Верх». */
export const PRESET_VIEWS = {
  front: { yaw: 0, pitch: 0 },
  back: { yaw: 180, pitch: 0 },
  side: { yaw: 90, pitch: 0 },
  top: { yaw: 0, pitch: -MAX_PITCH + 8 },
} as const satisfies Record<string, BoxView>;

export type PresetName = keyof typeof PRESET_VIEWS;

/** Нормали граней в системе коробки: x — вправо, y — вниз, z — на зрителя (как у CSS). */
export const NORMALS: Readonly<Record<FaceName, readonly [number, number, number]>> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, -1, 0],
  bottom: [0, 1, 0],
};

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Угол в диапазоне (−180, 180]. */
export function wrapAngle(angle: number): number {
  const wrapped = ((((angle + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/** Кратчайшая разность углов `to − from` в диапазоне (−180, 180]. */
export function shortestDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const clampPitch = (pitch: number): number => clamp(pitch, -MAX_PITCH, MAX_PITCH);

/** Нормаль грани после поворота `rotateX(pitch) rotateY(yaw)` (матрицы из спецификации CSS Transforms). */
export function rotatedNormal(face: FaceName, view: BoxView): [number, number, number] {
  const [x, y, z] = NORMALS[face];
  const cy = Math.cos(rad(view.yaw));
  const sy = Math.sin(rad(view.yaw));
  const x1 = cy * x + sy * z;
  const z1 = -sy * x + cy * z;
  const cx = Math.cos(rad(view.pitch));
  const sx = Math.sin(rad(view.pitch));
  return [x1, cx * y - sx * z1, sx * y + cx * z1];
}

/** Обращена ли грань к зрителю (камера смотрит вдоль −z). */
export function isFacing(face: FaceName, view: BoxView): boolean {
  return rotatedNormal(face, view)[2] > 1e-6;
}

/** Куда падает свет: сверху-слева-спереди (x вправо, y вниз, z на зрителя). */
const LIGHT: readonly [number, number, number] = (() => {
  const v = [-0.45, -0.55, 0.7] as const;
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length] as const;
})();

const AMBIENT = 0.5;

/** Яркость грани 0…1: фон плюс косинус угла к свету; грань к свету спиной остаётся в тени, но не чёрной. */
export function faceBrightness(face: FaceName, view: BoxView): number {
  const n = rotatedNormal(face, view);
  const lit = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  return AMBIENT + (1 - AMBIENT) * lit;
}

/** Непрозрачность чёрного слоя поверх грани: чем темнее грань, тем плотнее (светлейшая — 0). */
export function faceDim(face: FaceName, view: BoxView): number {
  return Number(((1 - faceBrightness(face, view)) * 0.85).toFixed(3));
}

/** Масштаб, при котором коробка (с запасом на вращение) помещается в область `width × height`. */
export function fitScale(width: number, height: number, zoom = 1): number {
  if (!(width > 0) || !(height > 0)) return 0;
  return Math.min(width / (BOX.w * 1.12), height / (BOX.h * 1.12)) * clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}
