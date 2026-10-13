import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { ContentError } from '../../src/content/validate';
import { buildArchive, imageEntryName, readArchive, type StoredImage } from '../../src/editor/archive';
import { MemoryDraftStore } from '../../src/editor/drafts';
import { gameLevelJson } from '../../src/editor/diagnose';
import { imageProblem, sniffImage } from '../../src/editor/images';
import { addMark, addObject, addRef, updateObject } from '../../src/editor/ops';
import { docFromGameJson, docToJson, ImportError, parseDoc, parseProject, projectToJson, PROJECT_VERSION } from '../../src/editor/project';
import type { ReferenceImage } from '../../src/editor/types';
import { crc32, readZip, writeZip, ZipError } from '../../src/editor/zip';
import { demoRoomDoc, freshDoc, pngHeader } from './helpers';

function pngBytes(width: number, height: number, extra = 0): Uint8Array {
  const head = pngHeader(width, height);
  const out = new Uint8Array(head.length + extra);
  out.set(head);
  return out;
}

const ref: ReferenceImage = {
  id: 'ref-1',
  name: 'Кадр 1',
  description: 'первый кадр',
  videoTime: '00:01:23',
  mime: 'image/png',
  width: 640,
  height: 360,
  quad: [{ x: 60, y: 40 }, { x: 600, y: 30 }, { x: 610, y: 330 }, { x: 50, y: 320 }],
  origin: { x: 2.5, y: 0 },
  opacity: 0.5,
  visible: true,
  locked: false,
};

function richDoc() {
  let doc = demoRoomDoc();
  doc = addObject(doc, { type: 'target', x: 9, y: 4, params: { hp: 2, score: 100 } }).doc;
  doc = addMark(doc, { x: 0, y: 0, w: 2, h: 1 }, 'unknown', 'не видно', 'Кадр 1')?.doc ?? doc;
  doc = { ...doc, note: 'по фото 1-09', hudLabel: '1-09' };
  return addRef(doc, ref);
}

const ASSETS = new Map<string, StoredImage>([['ref-1', { mime: 'image/png', bytes: pngBytes(640, 360, 100) }]]);

describe('проект редактора: сериализация и разбор', () => {
  it('документ → JSON → документ без потерь (клетки, свойства объектов, пометки, референсы)', () => {
    const doc = richDoc();
    expect(parseDoc(docToJson(doc))).toEqual(doc);
    expect(parseProject(projectToJson(doc, '2026-10-13T20:00:00Z'))).toEqual(doc);
    expect(parseDoc(JSON.parse(JSON.stringify(docToJson(doc))))).toEqual(doc);
  });

  it('неподдерживаемая версия и чужой формат объясняются, а не угадываются', () => {
    const json = projectToJson(freshDoc(), 'x');
    expect(() => parseProject({ ...json, version: PROJECT_VERSION + 1 })).toThrow(/версия проекта 2/);
    expect(() => parseProject({ ...json, format: 'другое' })).toThrow(ImportError);
    expect(() => parseProject('строка')).toThrow(ImportError);
  });

  it('структурные ошибки показываются адресно и все сразу', () => {
    const json = docToJson(richDoc()) as Record<string, unknown>;
    const broken = {
      ...json,
      width: 14,
      rows: (json['rows'] as string[]).map((r, y) => (y === 1 ? `${r.slice(0, 3)}?${r.slice(4)}` : r)),
      objects: [{ id: 'a', type: 'hazard', x: 99, y: 0 }],
      transitions: [{ from: 'нет-такого', to: null }],
      refs: [{ ...(json['refs'] as object[])[0], quad: [{ x: 0, y: 0 }], opacity: 3 }],
    };
    try {
      parseDoc(broken);
      throw new Error('ожидалась ошибка');
    } catch (error) {
      expect(error).toBeInstanceOf(ContentError);
      const paths = (error as ContentError).details.map((d) => d.path);
      expect(paths).toContain('$.rows[0]');
      expect(paths).toContain('$.rows[1][3]');
      expect(paths).toContain('$.objects[0]');
      expect(paths).toContain('$.transitions[0].from');
      expect(paths).toContain('$.refs[0].quad');
      expect(paths).toContain('$.refs[0].opacity');
    }
  });

  it('неизвестный тип объекта и неизвестный ресурс не отвергаются при импорте и не подменяются', () => {
    let doc = addObject(freshDoc(), { type: 'dragon', x: 3, y: 3 }).doc;
    doc = updateObject(doc, 'dragon-1', { asset: 'чужой.ресурс' });
    const back = parseDoc(docToJson(doc));
    expect(back.objects[0]).toMatchObject({ type: 'dragon', asset: 'чужой.ресурс' });
  });

  it('импорт игрового JSON: версия схемы проверяется, пометки и подпись сохраняются', () => {
    const doc = richDoc();
    const json = gameLevelJson(doc);
    const imported = docFromGameJson(json, { projectId: 'p9', name: 'Импорт', pack: 'room' });
    expect(imported.projectId).toBe('p9');
    expect(imported.rows).toEqual(doc.rows);
    expect(imported.marks).toEqual(doc.marks);
    expect(imported.hudLabel).toBe('1-09');
    expect(imported.refs).toEqual([]);
    expect(() => docFromGameJson({ ...json, schemaVersion: 2 }, { projectId: 'p9', name: 'x', pack: 'room' })).toThrow(/версия схемы уровня 2/);
    expect(() => docFromGameJson([], { projectId: 'p9', name: 'x', pack: 'room' })).toThrow(ContentError);
  });
});

describe('изображения: тип и размер по заголовку', () => {
  it('PNG, JPEG, WebP (три вида) распознаются без декодирования', () => {
    expect(sniffImage(pngBytes(640, 360))).toEqual({ mime: 'image/png', width: 640, height: 360 });

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x01, 0x68, 0x02, 0x80, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImage(jpeg)).toEqual({ mime: 'image/jpeg', width: 640, height: 360 });

    const webpLossy = new Uint8Array(40);
    webpLossy.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
    webpLossy.set([0x9d, 0x01, 0x2a, 0x80, 0x02, 0x68, 0x01], 23);
    expect(sniffImage(webpLossy)).toEqual({ mime: 'image/webp', width: 640, height: 360 });

    const webpLossless = new Uint8Array(40);
    webpLossless.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
    const bits = (640 - 1) | ((360 - 1) << 14);
    webpLossless.set([0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255], 20);
    expect(sniffImage(webpLossless)).toEqual({ mime: 'image/webp', width: 640, height: 360 });

    const webpExt = new Uint8Array(40);
    webpExt.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    webpExt.set([0x7f, 0x02, 0, 0x67, 0x01, 0], 24);
    expect(sniffImage(webpExt)).toEqual({ mime: 'image/webp', width: 640, height: 360 });
  });

  it('чужие и повреждённые файлы отвергаются; слишком большие — до декодирования', () => {
    expect(sniffImage(new TextEncoder().encode('GIF89a...........................'))).toBeNull();
    expect(imageProblem(null, 10)).toMatch(/PNG, JPEG и WebP/);
    expect(imageProblem({ mime: 'image/png', width: 4100, height: 4100 }, 100)).toMatch(/мегапикселей/);
    expect(imageProblem({ mime: 'image/png', width: 9000, height: 10 }, 100)).toMatch(/по стороне/);
    expect(imageProblem({ mime: 'image/png', width: 100, height: 100 }, 20 * 1024 * 1024)).toMatch(/слишком большой/);
    expect(imageProblem({ mime: 'image/png', width: 1280, height: 720 }, 500_000)).toBeNull();
  });
});

describe('ZIP: запись, чтение, лимиты', () => {
  const limits = { maxFiles: 4, maxTotalBytes: 1000, maxEntryBytes: 600 };
  const allow = (name: string): string | null => (/^[a-z]+\.txt$/.test(name) ? null : 'недопустимое имя');
  const data = (text: string): Uint8Array => new TextEncoder().encode(text);

  it('запись → чтение возвращает те же файлы; CRC считается верно', async () => {
    expect(crc32(data('123456789'))).toBe(0xcbf43926);
    const zip = writeZip([{ name: 'a.txt', data: data('привет') }, { name: 'b.txt', data: data('') }]);
    const back = await readZip(zip, { limits, nameCheck: allow });
    expect(back.map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
    expect(new TextDecoder().decode(back[0]?.data)).toBe('привет');
    expect(back[1]?.data.length).toBe(0);
    // Воспроизводимость: два раза одно и то же.
    expect(writeZip([{ name: 'a.txt', data: data('привет') }, { name: 'b.txt', data: data('') }])).toEqual(zip);
  });

  it('читает архивы со сжатием DEFLATE (созданные другими программами)', async () => {
    const text = 'abc'.repeat(100);
    const stored = writeZip([{ name: 'a.txt', data: data(text) }]);
    // Подменим STORE на DEFLATE вручную: пересоберём локальную запись и каталог.
    const compressed = new Uint8Array(deflateRawSync(Buffer.from(text)));
    const zip = deflated('a.txt', data(text), compressed);
    const back = await readZip(zip, { limits, nameCheck: allow });
    expect(new TextDecoder().decode(back[0]?.data)).toBe(text);
    expect(stored.length).toBeGreaterThan(compressed.length);
  });

  it('«бомба»: фактически больше заявленного размера — отказ', async () => {
    const big = 'x'.repeat(500);
    const compressed = new Uint8Array(deflateRawSync(Buffer.from(big)));
    const zip = deflated('a.txt', data(big), compressed, 10); // заявлено 10 байт
    await expect(readZip(zip, { limits, nameCheck: allow })).rejects.toThrow(/Размер распакованных данных|не совпадает/);
  });

  it('лимиты: число файлов, размер записи, суммарный размер', async () => {
    const many = writeZip(Array.from({ length: 5 }, (_, i) => ({ name: `f${'a'.repeat(i + 1)}.txt`, data: data('x') })));
    await expect(readZip(many, { limits, nameCheck: allow })).rejects.toThrow(/5 записей/);
    const huge = writeZip([{ name: 'a.txt', data: new Uint8Array(700) }]);
    await expect(readZip(huge, { limits, nameCheck: allow })).rejects.toThrow(/слишком велика/);
    const sum = writeZip([{ name: 'a.txt', data: new Uint8Array(500) }, { name: 'b.txt', data: new Uint8Array(500) }, { name: 'c.txt', data: new Uint8Array(500) }]);
    await expect(readZip(sum, { limits, nameCheck: allow })).rejects.toThrow(/Суммарный/);
  });

  it('недопустимые пути и типы, дубликаты, повреждения', async () => {
    for (const name of ['../evil.txt', '/abs.txt', 'dir\\x.txt', 'a.exe', 'ａ.txt']) {
      await expect(readZip(writeZip([{ name, data: data('x') }]), { limits, nameCheck: allow })).rejects.toThrow(ZipError);
    }
    await expect(readZip(writeZip([{ name: 'a.txt', data: data('1') }, { name: 'A.txt', data: data('2') }]), { limits, nameCheck: () => null })).rejects.toThrow(/дважды/);
    const zip = writeZip([{ name: 'a.txt', data: data('content') }]);
    const corrupted = zip.slice();
    corrupted[30 + 5] = (corrupted[30 + 5] ?? 0) ^ 0xff; // портим данные
    await expect(readZip(corrupted, { limits, nameCheck: allow })).rejects.toThrow(/контрольная сумма/);
    await expect(readZip(new Uint8Array(100), { limits, nameCheck: allow })).rejects.toThrow(/не ZIP/);
    await expect(readZip(data('not a zip at all, but long enough to try'), { limits, nameCheck: allow })).rejects.toThrow(ZipError);
  });
});

/** Архив из одной записи с методом DEFLATE (8); `declared` — заявленный распакованный размер. */
function deflated(name: string, raw: Uint8Array, compressed: Uint8Array, declared = raw.length): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + nameBytes.length + compressed.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(14, crc32(raw), true);
  lv.setUint32(18, compressed.length, true);
  lv.setUint32(22, declared, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(compressed, 30 + nameBytes.length);
  const central = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(16, crc32(raw), true);
  cv.setUint32(20, compressed.length, true);
  cv.setUint32(24, declared, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint32(42, 0, true);
  central.set(nameBytes, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}

describe('архив проекта: перенос между браузерами', () => {
  it('экспорт → импорт в чистое хранилище восстанавливает карту, пометки, калибровку и изображение', async () => {
    const doc = richDoc();
    const zip = buildArchive(doc, ASSETS, '2026-10-13T20:00:00Z');
    const { doc: back, images } = await readArchive(zip);
    expect(back).toEqual(doc);
    expect([...images.keys()]).toEqual(['ref-1']);
    expect(images.get('ref-1')?.bytes).toEqual(ASSETS.get('ref-1')?.bytes);
    // Чистое хранилище «другого браузера»: сохранить и загрузить.
    const store = new MemoryDraftStore();
    await store.save({
      record: { meta: { projectId: back.projectId, name: back.name, levelId: back.id, width: back.width, height: back.height, savedAt: 1 }, doc: docToJson(back) },
      images,
      keep: ['ref-1'],
    });
    const loaded = await store.load(back.projectId);
    expect(parseDoc(loaded?.record.doc)).toEqual(doc);
    expect(loaded?.images.get('ref-1')?.bytes).toEqual(ASSETS.get('ref-1')?.bytes);
  });

  it('в архиве нет изображения, нет project.json, чужой файл или неверный размер — документ не принимается', async () => {
    const doc = richDoc();
    const noImage = writeZip([{ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(projectToJson(doc, 'x'))) }]);
    await expect(readArchive(noImage)).rejects.toThrow(/нет файла refs\/ref-1\.png/);
    await expect(readArchive(writeZip([{ name: 'readme.txt', data: new Uint8Array(1) }]))).rejects.toThrow(ImportError);
    await expect(readArchive(writeZip([{ name: 'refs/a.png', data: pngBytes(1, 1) }]))).rejects.toThrow(/нет project\.json/);
    const wrongSize = writeZip([
      { name: 'project.json', data: new TextEncoder().encode(JSON.stringify(projectToJson(doc, 'x'))) },
      { name: imageEntryName(ref), data: pngBytes(100, 100) },
    ]);
    await expect(readArchive(wrongSize)).rejects.toThrow(/не совпадает/);
    const notImage = writeZip([
      { name: 'project.json', data: new TextEncoder().encode(JSON.stringify(projectToJson(doc, 'x'))) },
      { name: imageEntryName(ref), data: new TextEncoder().encode('<script>alert(1)</script>') },
    ]);
    await expect(readArchive(notImage)).rejects.toThrow(/PNG, JPEG и WebP/);
  });

  it('версия проекта из будущего: причина названа, ничего не угадывается', async () => {
    const json = { ...projectToJson(freshDoc(), 'x'), version: 99 };
    const zip = writeZip([{ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(json)) }]);
    await expect(readArchive(zip)).rejects.toThrow(/версия проекта 99/);
  });

  it('экспорт отказывает, если для референса нет данных изображения (архив был бы неполным)', () => {
    expect(() => buildArchive(richDoc(), new Map(), 'x')).toThrow(/Нет данных изображения/);
  });
});

describe('локальные черновики (хранилище)', () => {
  const meta = (projectId: string, savedAt: number) => ({ projectId, name: projectId, levelId: 'l', width: 13, height: 6, savedAt });

  it('список по давности, загрузка, удаление, чистка изображений, которых больше нет в документе', async () => {
    const store = new MemoryDraftStore();
    const doc = richDoc();
    await store.save({ record: { meta: meta('a', 1), doc: docToJson(doc) }, images: ASSETS, keep: ['ref-1'] });
    await store.save({ record: { meta: meta('b', 2), doc: docToJson(freshDoc()) }, images: new Map(), keep: [] });
    expect((await store.list()).map((m) => m.projectId)).toEqual(['b', 'a']);
    expect(await store.storedImages('a')).toEqual(new Set(['ref-1']));
    await store.save({ record: { meta: meta('a', 3), doc: docToJson(doc) }, images: new Map(), keep: [] });
    expect(await store.storedImages('a')).toEqual(new Set());
    await store.remove('b');
    expect(await store.load('b')).toBeNull();
  });

  it('ошибка записи (например, квота) не стирает предыдущее сохранённое состояние', async () => {
    const store = new MemoryDraftStore();
    await store.save({ record: { meta: meta('a', 1), doc: docToJson(freshDoc()) }, images: new Map(), keep: [] });
    store.failWith = new Error('QuotaExceededError');
    await expect(store.save({ record: { meta: meta('a', 2), doc: docToJson(richDoc()) }, images: ASSETS, keep: ['ref-1'] })).rejects.toThrow(/Quota/);
    const loaded = await store.load('a');
    expect(parseDoc(loaded?.record.doc)).toEqual(freshDoc());
  });
});
