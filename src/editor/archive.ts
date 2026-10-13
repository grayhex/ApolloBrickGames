import { ContentError } from '../content/validate';
import { imageProblem, MIME_EXTENSION, sniffImage } from './images';
import { ImportError, parseProject, projectToJson } from './project';
import type { EditorDoc, ImageMime, ReferenceImage } from './types';
import { readZip, writeZip, ZipError, type Inflate, type NameCheck, type ZipEntry, type ZipLimits } from './zip';

/** Байты референса и его тип: хранятся отдельно от документа (в историю изменений не входят). */
export interface StoredImage {
  mime: ImageMime;
  bytes: Uint8Array;
}

export const ARCHIVE_LIMITS: ZipLimits = {
  maxFiles: 64,
  maxTotalBytes: 128 * 1024 * 1024,
  maxEntryBytes: 32 * 1024 * 1024,
};

export const MAX_PROJECT_JSON_BYTES = 4 * 1024 * 1024;
export const PROJECT_ENTRY = 'project.json';

export function imageEntryName(ref: Pick<ReferenceImage, 'id' | 'mime'>): string {
  return `refs/${ref.id}.${MIME_EXTENSION[ref.mime]}`;
}

const IMAGE_ENTRY = /^refs\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(?:png|jpg|webp)$/;

const nameCheck: NameCheck = (name) => {
  if (name === PROJECT_ENTRY || name === 'refs/' || IMAGE_ENTRY.test(name)) return null;
  return 'в архиве проекта допускаются только project.json и изображения refs/<id>.png|jpg|webp';
};

/** Архив проекта: project.json (карта, пометки, калибровки, привязки) и копии референсов. Работает офлайн, без временных ссылок. */
export function buildArchive(doc: EditorDoc, images: ReadonlyMap<string, StoredImage>, savedAt: string): Uint8Array {
  const entries: ZipEntry[] = [
    { name: PROJECT_ENTRY, data: new TextEncoder().encode(`${JSON.stringify(projectToJson(doc, savedAt), null, 2)}\n`) },
  ];
  for (const ref of doc.refs) {
    const image = images.get(ref.id);
    if (!image) throw new Error(`Нет данных изображения для референса «${ref.name}»: архив был бы неполным.`);
    entries.push({ name: imageEntryName(ref), data: image.bytes });
  }
  return writeZip(entries);
}

export interface ArchiveContents {
  doc: EditorDoc;
  images: Map<string, StoredImage>;
}

/**
 * Разбор архива проекта. Любая ошибка — исключение (ImportError, ContentError или ZipError), а результат
 * возвращается только целиком: рабочий документ при неудаче не затрагивается.
 */
export async function readArchive(bytes: Uint8Array, inflate?: Inflate): Promise<ArchiveContents> {
  let entries: ZipEntry[];
  try {
    entries = await readZip(bytes, { limits: ARCHIVE_LIMITS, nameCheck, ...(inflate ? { inflate } : {}) });
  } catch (error) {
    if (error instanceof ZipError) throw new ImportError('archive', error.message);
    throw error;
  }
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]));
  const projectBytes = byName.get(PROJECT_ENTRY);
  if (!projectBytes) throw new ImportError('archive', 'В архиве нет project.json.');
  if (projectBytes.length > MAX_PROJECT_JSON_BYTES) throw new ImportError('archive', 'project.json слишком велик.');
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(projectBytes));
  } catch {
    throw new ImportError('archive', 'project.json не является корректным JSON.');
  }
  const doc = parseProject(raw);

  const images = new Map<string, StoredImage>();
  const issues: { path: string; message: string }[] = [];
  doc.refs.forEach((ref, index) => {
    const data = byName.get(imageEntryName(ref));
    const path = `$.refs[${index}]`;
    if (!data) {
      issues.push({ path, message: `в архиве нет файла ${imageEntryName(ref)} для референса «${ref.name}»` });
      return;
    }
    const info = sniffImage(data);
    const problem = imageProblem(info, data.length);
    if (problem || !info) {
      issues.push({ path, message: `${ref.name}: ${problem ?? 'изображение не распознано'}` });
      return;
    }
    if (info.mime !== ref.mime) issues.push({ path, message: `${ref.name}: тип файла (${info.mime}) не совпадает с записанным в проекте (${ref.mime})` });
    else if (info.width !== ref.width || info.height !== ref.height) {
      issues.push({ path, message: `${ref.name}: размер файла ${info.width}×${info.height} не совпадает с записанным в проекте (${ref.width}×${ref.height})` });
    } else images.set(ref.id, { mime: info.mime, bytes: data });
  });
  if (issues.length > 0) throw new ContentError('архив проекта', issues);
  return { doc, images };
}
