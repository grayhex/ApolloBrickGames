import type { AssetCatalog, AssetDef } from '../content/schema';
import { drawGlyph } from './glyphs';

/** Загрузчик картинки. `ink` — цвет LCD, которым заменяется `currentColor` в SVG. */
export type ImageLoader = (url: string, ink: string) => Promise<CanvasImageSource | null>;

/** SVG-ресурсы рисуются цветом LCD-профиля: `currentColor` → цвет «чернил». Один источник цвета — профиль экрана. */
export function tintSvg(svg: string, ink: string): string {
  return svg.replaceAll('currentColor', ink);
}

function loadImage(url: string): Promise<CanvasImageSource | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

const isSvg = (url: string): boolean => /\.svg(\?.*)?$/i.test(url);

/** SVG по адресу → data-URL с подставленным цветом LCD. null — файл недоступен. */
export async function tintedSvgDataUrl(url: string, ink: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tintSvg(await response.text(), ink))}`;
  } catch {
    return null;
  }
}

/** Загрузка картинки; при ошибке — null (тогда рисуется заглушка). */
export const browserImageLoader: ImageLoader = async (url, ink) => {
  if (!isSvg(url)) return loadImage(url);
  const dataUrl = await tintedSvgDataUrl(url, ink);
  return dataUrl ? loadImage(dataUrl) : null;
};

/**
 * Ресурсы по стабильным идентификаторам. Каталог описывает, чем рисовать идентификатор:
 * заглушкой (`placeholder`) или картинкой-полосой кадров (`image`, PNG/SVG). Подмена заглушки на
 * картинку — правка каталога, а не ядра или рендера.
 */
export class AssetStore {
  private readonly catalog: AssetCatalog;
  private readonly baseUrl: string;
  private readonly ink: string;
  private readonly loader: ImageLoader;
  private readonly images = new Map<string, CanvasImageSource>();

  constructor(catalog: AssetCatalog, baseUrl: string, ink: string, loader: ImageLoader = browserImageLoader) {
    this.catalog = catalog;
    this.baseUrl = baseUrl;
    this.ink = ink;
    this.loader = loader;
  }

  /** Загружает картинки. Возвращает предупреждения по тем, что не загрузились (будут заглушки). */
  async load(): Promise<string[]> {
    const warnings: string[] = [];
    await Promise.all(
      Object.entries(this.catalog.assets).map(async ([id, def]) => {
        if (def.kind !== 'image') return;
        const image = await this.loader(new URL(def.src, this.baseUrl).href, this.ink);
        if (image) this.images.set(id, image);
        else warnings.push(`Ресурс «${id}»: не удалось загрузить ${def.src}, используется заглушка «${def.fallbackGlyph}».`);
      }),
    );
    return warnings;
  }

  def(id: string): AssetDef | undefined {
    return this.catalog.assets[id];
  }

  /** Картинка загружена (иначе рисуется заглушка). */
  hasImage(id: string): boolean {
    return this.images.has(id);
  }

  /** Зеркалить ли ресурс при взгляде влево. Заглушки зеркалятся; картинки — только если это явно разрешено в каталоге. */
  mirrorsWhenLeft(id: string): boolean {
    const def = this.def(id);
    return !def || def.kind === 'placeholder' || def.mirrorWhenLeft;
  }

  /** Номер кадра анимации по такту симуляции. */
  frameIndex(id: string, tick: number): number {
    const def = this.def(id);
    if (!def || def.kind !== 'image') return 0;
    return Math.floor(tick / def.frameTicks) % def.frames;
  }

  /** Рисует ресурс в прямоугольник width × height (клетка, значок, символ HUD). */
  draw(
    ctx: CanvasRenderingContext2D,
    id: string,
    tick: number,
    x: number,
    y: number,
    width: number,
    height: number,
    ink: string,
    flipX = false,
  ): void {
    const def = this.def(id);
    if (!def) {
      this.drawGlyphFit(ctx, 'unknown', x, y, width, height, ink, flipX);
      return;
    }
    if (def.kind === 'placeholder') {
      this.drawGlyphFit(ctx, def.glyph, x, y, width, height, ink, flipX);
      return;
    }
    const image = this.images.get(id);
    if (!image) {
      this.drawGlyphFit(ctx, def.fallbackGlyph, x, y, width, height, ink, flipX);
      return;
    }
    this.drawImageFrame(ctx, image, def, this.frameIndex(id, tick), x, y, width, height, flipX);
  }

  /** Рисует один кадр картинки (по умолчанию — в натуральном размере кадра). false — картинки нет. */
  drawFrame(ctx: CanvasRenderingContext2D, id: string, frame: number, x: number, y: number, width?: number, height?: number): boolean {
    const def = this.def(id);
    const image = this.images.get(id);
    if (!def || def.kind !== 'image' || !image) return false;
    this.drawImageFrame(ctx, image, def, frame, x, y, width ?? def.frameWidth, height ?? def.frameHeight, false);
    return true;
  }

  /** Заглушка квадратная: вписываем её в прямоугольник по центру. */
  private drawGlyphFit(
    ctx: CanvasRenderingContext2D,
    glyph: string,
    x: number,
    y: number,
    width: number,
    height: number,
    ink: string,
    flipX: boolean,
  ): void {
    const size = Math.min(width, height);
    drawGlyph(ctx, glyph, x + (width - size) / 2, y + (height - size) / 2, size, ink, flipX);
  }

  private drawImageFrame(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    def: Extract<AssetDef, { kind: 'image' }>,
    frame: number,
    x: number,
    y: number,
    width: number,
    height: number,
    flipX: boolean,
  ): void {
    const sx = def.origin.x + frame * def.frameWidth;
    const sy = def.origin.y;
    if (!flipX) {
      ctx.drawImage(image, sx, sy, def.frameWidth, def.frameHeight, x, y, width, height);
      return;
    }
    ctx.save();
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, sx, sy, def.frameWidth, def.frameHeight, 0, 0, width, height);
    ctx.restore();
  }
}
