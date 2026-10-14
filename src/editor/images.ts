import type { ImageMime } from './types';

export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_DIMENSION = 8192;

export const MIME_EXTENSION: Record<ImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number): number => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number): number => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u32be = (b: Uint8Array, i: number): number => (u16be(b, i) * 65536 + u16be(b, i + 2)) >>> 0;
const u32le = (b: Uint8Array, i: number): number => (u16le(b, i) + u16le(b, i + 2) * 65536) >>> 0;

function ascii(b: Uint8Array, i: number, n: number): string {
  let s = '';
  for (let k = 0; k < n; k++) s += String.fromCharCode(b[i + k] ?? 0);
  return s;
}

/**
 * Тип и размер изображения по заголовку файла (PNG, JPEG, WebP) — без декодирования, поэтому
 * слишком большие и подделанные файлы отсеиваются до того, как браузер начнёт их распаковывать.
 * null — формат не поддерживается или заголовок повреждён.
 */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && ascii(bytes, 12, 4) === 'IHDR') {
    return { mime: 'image/png', width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1] ?? 0;
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { mime: 'image/jpeg', height: u16be(bytes, i + 5), width: u16be(bytes, i + 7) };
      i += 2 + u16be(bytes, i + 2);
    }
    return null;
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const kind = ascii(bytes, 12, 4);
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { mime: 'image/webp', width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    }
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = u32le(bytes, 21);
      return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') {
      const w = (bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16);
      const h = (bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16);
      return { mime: 'image/webp', width: w + 1, height: h + 1 };
    }
  }
  return null;
}

/** Сообщение, почему файл не подходит, или null. */
export function imageProblem(info: ImageInfo | null, byteLength: number): string | null {
  if (!info) return 'Не удалось распознать изображение: поддерживаются PNG, JPEG и WebP.';
  if (byteLength > MAX_IMAGE_BYTES) {
    return `Файл слишком большой (${(byteLength / 1048576).toFixed(1)} МБ, предел ${MAX_IMAGE_BYTES / 1048576} МБ).`;
  }
  if (info.width < 1 || info.height < 1) return 'Размер изображения в заголовке некорректен.';
  if (info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION) {
    return `Изображение ${info.width}×${info.height} больше допустимых ${MAX_IMAGE_DIMENSION} пикселей по стороне.`;
  }
  if (info.width * info.height > MAX_IMAGE_PIXELS) {
    return `Изображение ${info.width}×${info.height} содержит больше ${MAX_IMAGE_PIXELS / 1_000_000} мегапикселей: уменьшите или обрежьте его.`;
  }
  return null;
}
