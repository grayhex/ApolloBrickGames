/**
 * Минимальный ZIP без внешних зависимостей: запись без сжатия (STORE), чтение STORE и DEFLATE.
 * Читатель рассчитан на недоверенные файлы: проверяет число файлов, размеры (заявленные и фактические),
 * имена, CRC и не выполняет ничего из содержимого.
 */
export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export interface ZipLimits {
  maxFiles: number;
  /** Сумма распакованных размеров. */
  maxTotalBytes: number;
  maxEntryBytes: number;
}

/** Возвращает причину отказа или null, если имя допустимо. Каталоги проверяются так же (имя оканчивается на «/»). */
export type NameCheck = (name: string) => string | null;

export type Inflate = (data: Uint8Array, expectedSize: number) => Promise<Uint8Array>;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

/** Запись архива без сжатия; время файлов фиксировано (1980-01-01), поэтому результат воспроизводим. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const push = (chunk: Uint8Array): void => {
    chunks.push(chunk);
    offset += chunk.length;
  };
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); // имена в UTF-8
    view.setUint16(8, 0, true); // STORE
    view.setUint16(10, 0, true);
    view.setUint16(12, 33, true); // 1980-01-01
    view.setUint32(14, crc, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    local.set(name, 30);

    const head = new Uint8Array(46 + name.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x02014b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 20, true);
    h.setUint16(8, 0x0800, true);
    h.setUint16(10, 0, true);
    h.setUint16(12, 0, true);
    h.setUint16(14, 33, true);
    h.setUint32(16, crc, true);
    h.setUint32(20, entry.data.length, true);
    h.setUint32(24, entry.data.length, true);
    h.setUint16(28, name.length, true);
    h.setUint32(42, offset, true);
    head.set(name, 46);
    central.push(head);

    push(local);
    push(entry.data);
  }
  const centralStart = offset;
  for (const head of central) push(head);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, offset - centralStart, true);
  e.setUint32(16, centralStart, true);
  push(end);
  const out = new Uint8Array(offset);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Распаковка DEFLATE средствами браузера/Node с жёстким пределом на размер результата. */
export const inflateRaw: Inflate = async (data, expectedSize) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('Этот браузер не умеет распаковывать сжатые архивы (нет DecompressionStream). Сожмите проект без сжатия или откройте в другом браузере.');
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const out = new Uint8Array(expectedSize);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > expectedSize) {
        await reader.cancel();
        throw new ZipError('Размер распакованных данных превышает заявленный в архиве (возможна «бомба»).');
      }
      out.set(value, size);
      size += value.length;
    }
  } catch (error) {
    if (error instanceof ZipError) throw error;
    throw new ZipError('Не удалось распаковать данные архива: файл повреждён.');
  }
  if (size !== expectedSize) throw new ZipError('Размер распакованных данных не совпадает с заявленным в архиве.');
  return out;
};

const decoder = new TextDecoder('utf-8', { fatal: true });

export async function readZip(
  bytes: Uint8Array,
  options: { limits: ZipLimits; nameCheck: NameCheck; inflate?: Inflate },
): Promise<ZipEntry[]> {
  const { limits, nameCheck } = options;
  const inflate = options.inflate ?? inflateRaw;
  if (bytes.length < 22) throw new ZipError('Файл слишком мал для ZIP-архива.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Это не ZIP-архив: не найден конец центрального каталога.');
  const disk = view.getUint16(eocd + 4, true);
  const total = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || view.getUint16(eocd + 6, true) !== 0) throw new ZipError('Многотомные архивы не поддерживаются.');
  if (total === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new ZipError('Архивы ZIP64 не поддерживаются.');
  if (total > limits.maxFiles) throw new ZipError(`В архиве ${total} записей, допускается не более ${limits.maxFiles}.`);
  if (cdOffset + cdSize > eocd) throw new ZipError('Центральный каталог архива повреждён.');

  interface Item {
    name: string;
    method: number;
    crc: number;
    compressed: number;
    size: number;
    local: number;
  }
  const items: Item[] = [];
  const seen = new Set<string>();
  let position = cdOffset;
  let declaredTotal = 0;
  for (let index = 0; index < total; index++) {
    if (position + 46 > eocd || view.getUint32(position, true) !== 0x02014b50) throw new ZipError('Запись центрального каталога повреждена.');
    const flags = view.getUint16(position + 8, true);
    const method = view.getUint16(position + 10, true);
    const crc = view.getUint32(position + 16, true);
    const compressed = view.getUint32(position + 20, true);
    const size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const local = view.getUint32(position + 42, true);
    if (position + 46 + nameLength > eocd) throw new ZipError('Имя файла в архиве выходит за границы каталога.');
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    } catch {
      throw new ZipError('Имя файла в архиве не в кодировке UTF-8.');
    }
    position += 46 + nameLength + extraLength + commentLength;

    const refusal = nameCheck(name);
    if (refusal !== null) throw new ZipError(`Недопустимая запись «${name}»: ${refusal}`);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new ZipError(`Имя «${name}» встречается в архиве дважды.`);
    seen.add(key);
    if (flags & 1) throw new ZipError(`Запись «${name}» зашифрована: такие архивы не поддерживаются.`);
    if (method !== 0 && method !== 8) throw new ZipError(`Запись «${name}»: метод сжатия ${method} не поддерживается.`);
    if (size > limits.maxEntryBytes) throw new ZipError(`Запись «${name}» слишком велика (${size} байт, предел ${limits.maxEntryBytes}).`);
    declaredTotal += size;
    if (declaredTotal > limits.maxTotalBytes) throw new ZipError(`Суммарный распакованный размер превышает ${limits.maxTotalBytes} байт.`);
    items.push({ name, method, crc, compressed, size, local });
  }

  const entries: ZipEntry[] = [];
  for (const item of items) {
    if (item.name.endsWith('/')) continue;
    if (item.local + 30 > bytes.length || view.getUint32(item.local, true) !== 0x04034b50) {
      throw new ZipError(`Локальный заголовок записи «${item.name}» повреждён.`);
    }
    const start = item.local + 30 + view.getUint16(item.local + 26, true) + view.getUint16(item.local + 28, true);
    if (start + item.compressed > bytes.length) throw new ZipError(`Данные записи «${item.name}» выходят за границы файла.`);
    const raw = bytes.subarray(start, start + item.compressed);
    let data: Uint8Array;
    if (item.method === 0) {
      if (raw.length !== item.size) throw new ZipError(`Запись «${item.name}»: размеры в заголовке не совпадают.`);
      data = raw.slice();
    } else {
      data = await inflate(raw, item.size);
    }
    if (crc32(data) !== item.crc) throw new ZipError(`Запись «${item.name}»: контрольная сумма не совпадает, файл повреждён.`);
    entries.push({ name: item.name, data });
  }
  return entries;
}
