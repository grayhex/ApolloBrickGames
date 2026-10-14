/**
 * «Сбой шлейфа»: экран пропадает кусками, как при плохом контакте. Чистая геометрия без DOM и часов:
 * по уровню потери (0 — всё цело, 1 — экран погас совсем) и зерну кадра получается набор прямоугольников,
 * которые рисуются цветом подложки поверх готовой картинки. Зерно меняется каждые несколько кадров — потеря мерцает.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DropoutOptions {
  /** Потеря 0…1. */
  level: number;
  /** Зерно кадра: тот же уровень и зерно дают тот же набор прямоугольников. */
  seed: number;
  /** Размер холста в логических пикселях. */
  width: number;
  height: number;
  /** Размер плитки, на которую «рассыпается» картинка (половина ячейки поля). */
  tileWidth: number;
  tileHeight: number;
}

/** Небольшой детерминированный генератор (mulberry32): 0 ≤ значение < 1. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Прямоугольники, закрашиваемые подложкой. Уровень ≥ 1 — один прямоугольник на весь холст. Ниже — часть плиток
 * (доля растёт быстрее уровня, чтобы середина пути уже была заметна) и горизонтальные полосы разной длины.
 */
export function dropoutRects(options: DropoutOptions): Rect[] {
  const { width, height, tileWidth, tileHeight } = options;
  const level = Math.min(1, Math.max(0, options.level));
  if (level <= 0) return [];
  if (level >= 1) return [{ x: 0, y: 0, w: width, h: height }];

  const random = prng(options.seed * 2654435761 + Math.round(level * 997));
  const rects: Rect[] = [];
  const columns = Math.ceil(width / tileWidth);
  const rows = Math.ceil(height / tileHeight);
  const share = Math.min(0.94, level * 1.15);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (random() >= share * share) continue;
      const x = column * tileWidth;
      const y = row * tileHeight;
      rects.push({ x, y, w: Math.min(tileWidth, width - x), h: Math.min(tileHeight, height - y) }); // крайние плитки не выходят за холст
    }
  }
  // Полосы: чем хуже контакт, тем их больше и тем они длиннее.
  const bands = Math.round(level * 16);
  for (let i = 0; i < bands; i++) {
    const bandHeight = 3 + Math.floor(random() * (4 + level * 14));
    const bandWidth = width * (0.2 + random() * (0.35 + level * 0.45));
    rects.push({ x: random() * (width - bandWidth), y: random() * (height - bandHeight), w: bandWidth, h: bandHeight });
  }
  return rects;
}

/** Доля площади холста, закрытая набором прямоугольников (приблизительно: перекрытия не вычитаются из суммы — берём верхнюю границу, ограниченную 1). */
export function coverage(rects: readonly Rect[], width: number, height: number): number {
  const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
  return Math.min(1, area / (width * height));
}
