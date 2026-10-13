import type { AssetCatalog, AssetDef } from '../content/schema';
import { drawGlyph } from './glyphs';

export type ImageLoader = (url: string) => Promise<CanvasImageSource | null>;

/** Загрузка картинки; при ошибке — null (тогда рисуется заглушка). */
export const browserImageLoader: ImageLoader = (url) =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });

/**
 * Ресурсы по стабильным идентификаторам. Каталог описывает, чем рисовать идентификатор:
 * заглушкой (`placeholder`) или картинкой-полосой кадров (`image`). Подмена заглушки на
 * PNG/SVG — правка каталога, а не ядра или рендера.
 */
export class AssetStore {
  private readonly catalog: AssetCatalog;
  private readonly baseUrl: string;
  private readonly loader: ImageLoader;
  private readonly images = new Map<string, CanvasImageSource>();

  constructor(catalog: AssetCatalog, baseUrl: string, loader: ImageLoader = browserImageLoader) {
    this.catalog = catalog;
    this.baseUrl = baseUrl;
    this.loader = loader;
  }

  /** Загружает картинки. Возвращает предупреждения по тем, что не загрузились (будут заглушки). */
  async load(): Promise<string[]> {
    const warnings: string[] = [];
    await Promise.all(
      Object.entries(this.catalog.assets).map(async ([id, def]) => {
        if (def.kind !== 'image') return;
        const image = await this.loader(new URL(def.src, this.baseUrl).href);
        if (image) this.images.set(id, image);
        else warnings.push(`Ресурс «${id}»: не удалось загрузить ${def.src}, используется заглушка «${def.fallbackGlyph}».`);
      }),
    );
    return warnings;
  }

  def(id: string): AssetDef | undefined {
    return this.catalog.assets[id];
  }

  /** Номер кадра анимации по такту симуляции. */
  frameIndex(id: string, tick: number): number {
    const def = this.def(id);
    if (!def || def.kind !== 'image') return 0;
    return Math.floor(tick / def.frameTicks) % def.frames;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    id: string,
    tick: number,
    x: number,
    y: number,
    size: number,
    ink: string,
    flipX = false,
  ): void {
    const def = this.def(id);
    if (!def) {
      drawGlyph(ctx, 'unknown', x, y, size, ink, flipX);
      return;
    }
    if (def.kind === 'placeholder') {
      drawGlyph(ctx, def.glyph, x, y, size, ink, flipX);
      return;
    }
    const image = this.images.get(id);
    if (!image) {
      drawGlyph(ctx, def.fallbackGlyph, x, y, size, ink, flipX);
      return;
    }
    const frame = this.frameIndex(id, tick);
    if (!flipX) {
      ctx.drawImage(image, frame * def.frameWidth, 0, def.frameWidth, def.frameHeight, x, y, size, size);
      return;
    }
    ctx.save();
    ctx.translate(x + size, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, frame * def.frameWidth, 0, def.frameWidth, def.frameHeight, 0, 0, size, size);
    ctx.restore();
  }
}
