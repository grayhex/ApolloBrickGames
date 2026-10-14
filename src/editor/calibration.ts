import type { Pt, Quad } from './types';

/** Матрица 3×3 по строкам. */
export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

export const MIN_QUAD_SIDE = 8;
export const MIN_QUAD_AREA = 100;

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function quadArea(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i] as Pt;
    const b = quad[(i + 1) % 4] as Pt;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Отрезки пересекаются собственным образом (не только касаются концами). */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Проверка четырёх углов игровой области: порядок «верхний левый → верхний правый → нижний правый → нижний левый»,
 * четырёхугольник выпуклый, не вырожден и не самопересекается. Пустой список — углы годятся.
 */
export function quadProblems(quad: Quad): string[] {
  const [p0, p1, p2, p3] = quad;
  if (![p0, p1, p2, p3].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
    return ['координаты углов должны быть числами'];
  }
  for (let i = 0; i < 4; i++) {
    const a = quad[i] as Pt;
    const b = quad[(i + 1) % 4] as Pt;
    if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_QUAD_SIDE) {
      return ['вырожденный четырёхугольник: два соседних угла совпадают или слишком близки'];
    }
  }
  // Самопересечение проверяется раньше площади: у симметричной «бабочки» знаковая площадь равна нулю.
  if (segmentsCross(p0, p1, p2, p3) || segmentsCross(p1, p2, p3, p0)) {
    return ['самопересекающийся четырёхугольник: углы указаны не по порядку (верхний левый, верхний правый, нижний правый, нижний левый)'];
  }
  if (quadArea(quad) < MIN_QUAD_AREA) return ['вырожденный четырёхугольник: слишком малая площадь'];
  const turns = [cross(p3, p0, p1), cross(p0, p1, p2), cross(p1, p2, p3), cross(p2, p3, p0)];
  if (turns.some((t) => Math.abs(t) < 1e-6)) return ['вырожденный четырёхугольник: три угла лежат на одной прямой'];
  const positive = turns.filter((t) => t > 0).length;
  if (positive === 4) return [];
  if (positive === 0) return ['углы указаны против часовой стрелки: нужен порядок верхний левый, верхний правый, нижний правый, нижний левый'];
  return ['невыпуклый четырёхугольник: перспективный снимок прямоугольника всегда выпуклый, проверьте положение углов'];
}

/** Стартовые углы калибровки: прямоугольник с отступом от краёв кадра. */
export function defaultQuad(width: number, height: number): Quad {
  const mx = width * 0.15;
  const my = height * 0.2;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}

export function quadKey(quad: Quad): string {
  return quad.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';');
}

/** Решение системы A·x = b методом Гаусса с выбором главного элемента; null — вырожденная. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] as number]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs((m[row] as number[])[col] as number) > Math.abs((m[pivot] as number[])[col] as number)) pivot = row;
    }
    const pivotRow = m[pivot] as number[];
    if (Math.abs(pivotRow[col] as number) < 1e-12) return null;
    m[pivot] = m[col] as number[];
    m[col] = pivotRow;
    for (let row = col + 1; row < n; row++) {
      const current = m[row] as number[];
      const factor = (current[col] as number) / (pivotRow[col] as number);
      for (let k = col; k <= n; k++) current[k] = (current[k] as number) - factor * (pivotRow[k] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    const current = m[row] as number[];
    let sum = current[n] as number;
    for (let k = row + 1; k < n; k++) sum -= (current[k] as number) * (x[k] as number);
    x[row] = sum / (current[row] as number);
  }
  return x;
}

/** Проективное преобразование, переводящее четыре точки `src` в четыре точки `dst`. null — точки вырождены. */
export function homography(src: readonly Pt[], dst: readonly Pt[]): Matrix3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i] as Pt;
    const { x: u, y: v } = dst[i] as Pt;
    a.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solve(a, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] as unknown as Matrix3;
}

export function applyMatrix(m: Matrix3, x: number, y: number): Pt | null {
  const w = m[6] * x + m[7] * y + m[8];
  if (Math.abs(w) < 1e-12) return null;
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, по строкам. */
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Выпрямляет перспективу: прямоугольник outW × outH заполняется пикселями исходного кадра внутри `quad`
 * (билинейная выборка). Пиксели вне исходного кадра прозрачны. Исходное изображение не изменяется.
 */
export function warpImage(src: RasterImage, quad: Quad, outW: number, outH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const m = homography(dst, quad);
  if (!m) return out;
  const { width, height, data } = src;
  for (let j = 0; j < outH; j++) {
    for (let i = 0; i < outW; i++) {
      const p = applyMatrix(m, i + 0.5, j + 0.5);
      if (!p) continue;
      const fx = p.x - 0.5;
      const fy = p.y - 0.5;
      if (fx < -0.5 || fy < -0.5 || fx > width - 0.5 || fy > height - 0.5) continue;
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)));
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const tx = Math.min(1, Math.max(0, fx - x0));
      const ty = Math.min(1, Math.max(0, fy - y0));
      const o = (j * outW + i) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = data[(y0 * width + x0) * 4 + c] as number;
        const v10 = data[(y0 * width + x1) * 4 + c] as number;
        const v01 = data[(y1 * width + x0) * 4 + c] as number;
        const v11 = data[(y1 * width + x1) * 4 + c] as number;
        out[o + c] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
      }
    }
  }
  return out;
}
