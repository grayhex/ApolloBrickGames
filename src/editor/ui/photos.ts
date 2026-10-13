import { quadKey, warpImage } from '../calibration';
import type { StoredImage } from '../archive';
import type { ReferenceImage } from '../types';

/** Ширина и высота клетки в выпрямленном снимке (пикселей): достаточно для приближения до ×3. */
export const WARP_CELL = { w: 96, h: 84 };

interface Entry {
  bitmap: ImageBitmap;
  pixels: ImageData | null;
  warped: { key: string; canvas: HTMLCanvasElement } | null;
}

/**
 * Декодированные референсы и выпрямленные снимки. Исходные байты не изменяются:
 * калибровка живёт в документе, а выпрямленная картинка — только кэш для рисования.
 */
export class PhotoCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<void>>();
  onChange: () => void = () => {};

  has(id: string): boolean {
    return this.entries.has(id);
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.bitmap.close();
    this.entries.clear();
    this.pending.clear();
  }

  drop(id: string): void {
    this.entries.get(id)?.bitmap.close();
    this.entries.delete(id);
    this.pending.delete(id);
  }

  /** Декодирует изображение (если ещё не декодировано). Ошибка декодирования — исключение, документ не затрагивается. */
  async ensure(id: string, image: StoredImage): Promise<void> {
    if (this.entries.has(id)) return;
    const running = this.pending.get(id);
    if (running) return running;
    const task = (async () => {
      const blob = new Blob([image.bytes as BlobPart], { type: image.mime });
      const bitmap = await createImageBitmap(blob);
      this.entries.set(id, { bitmap, pixels: null, warped: null });
      this.onChange();
    })().finally(() => this.pending.delete(id));
    this.pending.set(id, task);
    return task;
  }

  bitmapOf(id: string): ImageBitmap | null {
    return this.entries.get(id)?.bitmap ?? null;
  }

  /** Холст с выпрямленной игровой областью (columns × rows клеток) либо целиком кадр, если калибровки нет. */
  surface(ref: ReferenceImage, columns: number, rows: number, aspect = { w: WARP_CELL.w, h: WARP_CELL.h }): CanvasImageSource | null {
    const entry = this.entries.get(ref.id);
    if (!entry) return null;
    if (ref.quad === null) return entry.bitmap;
    const outW = Math.max(1, Math.round(columns * aspect.w));
    const outH = Math.max(1, Math.round(rows * aspect.h));
    const key = `${quadKey(ref.quad)}|${outW}x${outH}`;
    if (entry.warped?.key === key) return entry.warped.canvas;
    if (!entry.pixels) {
      const source = document.createElement('canvas');
      source.width = entry.bitmap.width;
      source.height = entry.bitmap.height;
      const ctx = source.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(entry.bitmap, 0, 0);
      entry.pixels = ctx.getImageData(0, 0, source.width, source.height);
    }
    const out = new Uint8ClampedArray(warpImage(entry.pixels, ref.quad, outW, outH));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext('2d')?.putImageData(new ImageData(out, outW, outH), 0, 0);
    entry.warped = { key, canvas };
    return canvas;
  }
}
