import { SCHEMA_VERSION, MAX_MARK_NOTE, MAX_MARK_REF, type LegendEntry, type LevelMark, type ObjectDef, type Params, type Transition } from '../content/schema';
import { Checker, ContentError, HUD_LABEL_PATTERN, ID_PATTERN } from '../content/validate';
import type { EditorDoc, Pt, Quad, ReferenceImage } from './types';
import { IMAGE_MIMES, MAX_LEVEL_SIZE } from './types';

export const PROJECT_FORMAT = 'crocodile-mario-editor-project';
export const PROJECT_VERSION = 1;
export const MAX_IMAGE_SIDE = 8192;

/** Файл нельзя импортировать по причине, не связанной с адресными ошибками данных (версия, формат, архив). */
export class ImportError extends Error {
  readonly code: 'version' | 'format' | 'archive' | 'image';

  constructor(code: ImportError['code'], message: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

// ── Запись ─────────────────────────────────────────────────────────────────

/** Документ → JSON проекта (без байтов изображений: они лежат в архиве/хранилище отдельно). */
export function docToJson(doc: EditorDoc): Record<string, unknown> {
  return {
    projectId: doc.projectId,
    pack: doc.pack,
    name: doc.name,
    id: doc.id,
    status: doc.status,
    hudLabel: doc.hudLabel,
    note: doc.note,
    width: doc.width,
    height: doc.height,
    legend: Object.fromEntries(
      Object.entries(doc.legend).map(([char, entry]) => [char, entry.asset === null ? { collision: entry.collision } : { collision: entry.collision, asset: entry.asset }]),
    ),
    rows: [...doc.rows],
    start: doc.start === null ? null : { x: doc.start.x, y: doc.start.y },
    objects: doc.objects.map((o) => ({
      id: o.id,
      type: o.type,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      asset: o.asset,
      params: { ...o.params },
    })),
    transitions: doc.transitions.map((t) => ({ from: t.from, to: t.to })),
    marks: doc.marks.map((m) => ({ id: m.id, x: m.x, y: m.y, w: m.w, h: m.h, status: m.status, note: m.note, ref: m.ref })),
    refs: doc.refs.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      videoTime: r.videoTime,
      mime: r.mime,
      width: r.width,
      height: r.height,
      quad: r.quad === null ? null : r.quad.map((p) => ({ x: p.x, y: p.y })),
      origin: { x: r.origin.x, y: r.origin.y },
      opacity: r.opacity,
      visible: r.visible,
      locked: r.locked,
    })),
  };
}

export function projectToJson(doc: EditorDoc, savedAt: string): Record<string, unknown> {
  return { format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt, doc: docToJson(doc) };
}

// ── Чтение ─────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(c: Checker, rec: Rec, key: string, path: string, min: number, max: number, fallback?: number): number {
  const value = rec[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    c.fail(`${path}.${key}`, `ожидалось число, получено ${JSON.stringify(value)}`);
    return fallback ?? min;
  }
  if (value < min || value > max) c.fail(`${path}.${key}`, `значение ${value} вне диапазона ${min}…${max}`);
  return value;
}

function text(c: Checker, rec: Rec, key: string, path: string, max: number, required = false): string {
  const value = rec[key];
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && value.trim() === '')) {
    c.fail(`${path}.${key}`, required ? 'ожидалась непустая строка' : 'ожидалась строка');
    return '';
  }
  if (value.length > max) c.fail(`${path}.${key}`, `строка длиннее ${max} символов`);
  return value;
}

function point(c: Checker, value: unknown, path: string, limit: number): Pt {
  const rec = c.record(value, path) ?? {};
  return { x: finite(c, rec, 'x', path, -limit, limit), y: finite(c, rec, 'y', path, -limit, limit) };
}

/**
 * Структурная проверка и разбор документа (проект редактора или игровой JSON после преобразования).
 * Проверяются версия, размеры, координаты, идентификаторы и ссылки между записями. Семантические проблемы
 * (неизвестный тип объекта, неизвестный ресурс, старт в земле) не отвергаются: они остаются в документе
 * и видны диагностикой, чтобы импорт ничего не терял и не подменял молча.
 */
export function parseDoc(raw: unknown, source = 'project'): EditorDoc {
  const c = new Checker();
  const rec = c.record(raw, '$');
  if (!rec) return c.abort(source);

  const width = c.int(rec, 'width', '$', 1, MAX_LEVEL_SIZE);
  const height = c.int(rec, 'height', '$', 1, MAX_LEVEL_SIZE);

  const legend: Record<string, LegendEntry> = {};
  for (const [char, value] of Object.entries(c.record(rec['legend'], '$.legend') ?? {})) {
    const path = `$.legend["${char}"]`;
    if (char.length !== 1) c.fail(path, 'ключ легенды — ровно один символ (BMP)');
    const entry = c.record(value, path);
    if (!entry) continue;
    const collision = entry['collision'];
    if (collision !== 'empty' && collision !== 'solid') {
      c.fail(`${path}.collision`, `ожидалось «empty» или «solid», получено ${JSON.stringify(collision)}`);
    }
    const asset = entry['asset'] === undefined || entry['asset'] === null ? null : c.str(entry, 'asset', path);
    legend[char] = { collision: collision === 'solid' ? 'solid' : 'empty', asset };
  }
  if (!Object.values(legend).some((entry) => entry.collision === 'empty')) {
    c.fail('$.legend', 'в легенде нет пустой клетки (collision: "empty")');
  }

  const rows: string[] = [];
  if (Array.isArray(rec['rows'])) {
    if (rec['rows'].length !== height) c.fail('$.rows', `строк ${rec['rows'].length}, а height = ${height}`);
    rec['rows'].forEach((row: unknown, y: number) => {
      if (typeof row !== 'string') {
        c.fail(`$.rows[${y}]`, 'ожидалась строка');
        return;
      }
      if (row.length !== width) c.fail(`$.rows[${y}]`, `длина ${row.length}, а width = ${width}`);
      row.split('').forEach((char, x) => {
        if (!(char in legend)) c.fail(`$.rows[${y}][${x}]`, `символ «${char}» не описан в legend`);
      });
      rows.push(row);
    });
  } else {
    c.fail('$.rows', 'ожидался массив строк');
  }

  let start: Pt | null = null;
  if (rec['start'] !== undefined && rec['start'] !== null) {
    const s = c.record(rec['start'], '$.start') ?? {};
    start = { x: c.int(s, 'x', '$.start', 0, width - 1), y: c.int(s, 'y', '$.start', 0, height - 1) };
  }

  const objects: ObjectDef[] = [];
  const objectIds = new Set<string>();
  const rawObjects = rec['objects'] === undefined ? [] : rec['objects'];
  if (!Array.isArray(rawObjects)) c.fail('$.objects', 'ожидался массив объектов');
  else {
    rawObjects.forEach((value: unknown, index: number) => {
      const path = `$.objects[${index}]`;
      const o = c.record(value, path);
      if (!o) return;
      const id = c.str(o, 'id', path, ID_PATTERN);
      if (objectIds.has(id)) c.fail(`${path}.id`, `идентификатор «${id}» уже занят`);
      objectIds.add(id);
      const type = c.str(o, 'type', path);
      const w = c.int(o, 'w', path, 1, MAX_LEVEL_SIZE, 1);
      const h = c.int(o, 'h', path, 1, MAX_LEVEL_SIZE, 1);
      const x = c.int(o, 'x', path, 0, MAX_LEVEL_SIZE);
      const y = c.int(o, 'y', path, 0, MAX_LEVEL_SIZE);
      if (x + w > width || y + h > height) c.fail(path, `область (${x}, ${y}) ${w}×${h} выходит за карту ${width}×${height}`);
      const asset = o['asset'] === undefined || o['asset'] === null ? null : c.str(o, 'asset', path);
      const params: Params = {};
      const rawParams = o['params'] === undefined ? {} : o['params'];
      if (isRec(rawParams)) {
        for (const [key, p] of Object.entries(rawParams)) {
          if (typeof p === 'number' || typeof p === 'string' || typeof p === 'boolean') params[key] = p;
          else c.fail(`${path}.params.${key}`, 'параметр — число, строка или true/false');
        }
      } else c.fail(`${path}.params`, 'ожидался объект параметров');
      objects.push({ id, type, x, y, w, h, asset, params });
    });
  }

  const transitions: Transition[] = [];
  const rawTransitions = rec['transitions'] === undefined ? [] : rec['transitions'];
  if (!Array.isArray(rawTransitions)) c.fail('$.transitions', 'ожидался массив переходов');
  else {
    rawTransitions.forEach((value: unknown, index: number) => {
      const path = `$.transitions[${index}]`;
      const t = c.record(value, path);
      if (!t) return;
      const from = c.str(t, 'from', path);
      if (!objectIds.has(from)) c.fail(`${path}.from`, `объект «${from}» не найден среди objects`);
      const to = t['to'];
      if (to !== null && (typeof to !== 'string' || to === '')) c.fail(`${path}.to`, 'ожидался id уровня или null');
      transitions.push({ from, to: typeof to === 'string' ? to : null });
    });
  }

  const marks: LevelMark[] = [];
  const markIds = new Set<string>();
  const rawMarks = rec['marks'] === undefined ? [] : rec['marks'];
  if (!Array.isArray(rawMarks)) c.fail('$.marks', 'ожидался массив пометок');
  else {
    rawMarks.forEach((value: unknown, index: number) => {
      const path = `$.marks[${index}]`;
      const m = c.record(value, path);
      if (!m) return;
      const id = c.str(m, 'id', path, ID_PATTERN);
      if (markIds.has(id)) c.fail(`${path}.id`, `идентификатор «${id}» уже занят`);
      markIds.add(id);
      const w = c.int(m, 'w', path, 1, MAX_LEVEL_SIZE, 1);
      const h = c.int(m, 'h', path, 1, MAX_LEVEL_SIZE, 1);
      const x = c.int(m, 'x', path, 0, MAX_LEVEL_SIZE);
      const y = c.int(m, 'y', path, 0, MAX_LEVEL_SIZE);
      if (x + w > width || y + h > height) c.fail(path, `область (${x}, ${y}) ${w}×${h} выходит за карту ${width}×${height}`);
      const status = m['status'];
      if (status !== 'unknown' && status !== 'assumed' && status !== 'confirmed') {
        c.fail(`${path}.status`, `ожидалось «unknown», «assumed» или «confirmed», получено ${JSON.stringify(status)}`);
      }
      marks.push({
        id,
        x,
        y,
        w,
        h,
        status: status === 'assumed' || status === 'confirmed' ? status : 'unknown',
        note: text(c, m, 'note', path, MAX_MARK_NOTE),
        ref: text(c, m, 'ref', path, MAX_MARK_REF),
      });
    });
  }

  const refs: ReferenceImage[] = [];
  const refIds = new Set<string>();
  const rawRefs = rec['refs'] === undefined ? [] : rec['refs'];
  if (!Array.isArray(rawRefs)) c.fail('$.refs', 'ожидался массив референсов');
  else {
    rawRefs.forEach((value: unknown, index: number) => {
      const path = `$.refs[${index}]`;
      const r = c.record(value, path);
      if (!r) return;
      const id = c.str(r, 'id', path, /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
      if (refIds.has(id)) c.fail(`${path}.id`, `идентификатор «${id}» уже занят`);
      refIds.add(id);
      const mimeValue = r['mime'];
      const mime = IMAGE_MIMES.find((m) => m === mimeValue);
      if (!mime) c.fail(`${path}.mime`, `поддерживаются ${IMAGE_MIMES.join(', ')}, получено ${JSON.stringify(mimeValue)}`);
      let quad: Quad | null = null;
      if (r['quad'] !== undefined && r['quad'] !== null) {
        if (Array.isArray(r['quad']) && r['quad'].length === 4) {
          const [a, b, d, e] = (r['quad'] as unknown[]).map((p, i) => point(c, p, `${path}.quad[${i}]`, 1_000_000));
          quad = [a as Pt, b as Pt, d as Pt, e as Pt];
        } else c.fail(`${path}.quad`, 'калибровка — ровно четыре угла или null');
      }
      refs.push({
        id,
        name: text(c, r, 'name', path, 120, true),
        description: text(c, r, 'description', path, 1000),
        videoTime: text(c, r, 'videoTime', path, 64),
        mime: mime ?? 'image/png',
        width: c.int(r, 'width', path, 1, MAX_IMAGE_SIDE),
        height: c.int(r, 'height', path, 1, MAX_IMAGE_SIDE),
        quad,
        origin: point(c, r['origin'] ?? { x: 0, y: 0 }, `${path}.origin`, 100_000),
        opacity: finite(c, r, 'opacity', path, 0, 1, 0.6),
        visible: r['visible'] === undefined ? true : c.bool(r, 'visible', path),
        locked: r['locked'] === undefined ? false : c.bool(r, 'locked', path),
      });
    });
  }

  const doc: EditorDoc = {
    projectId: c.str(rec, 'projectId', '$', /^[A-Za-z0-9-]{1,64}$/),
    pack: c.str(rec, 'pack', '$', ID_PATTERN),
    name: text(c, rec, 'name', '$', 120, true),
    id: c.str(rec, 'id', '$', ID_PATTERN),
    status: c.status(rec, '$'),
    hudLabel: c.str(rec, 'hudLabel', '$', HUD_LABEL_PATTERN),
    note: text(c, rec, 'note', '$', 2000),
    width,
    height,
    legend,
    rows,
    start,
    objects,
    transitions,
    marks,
    refs,
  };
  c.done(source);
  return doc;
}

/** JSON проекта (project.json из архива): версия и формат проверяются раньше данных. */
export function parseProject(raw: unknown): EditorDoc {
  if (!isRec(raw) || raw['format'] !== PROJECT_FORMAT) {
    throw new ImportError('format', 'Это не файл проекта редактора Crocodile Mario (нет поля format).');
  }
  if (raw['version'] !== PROJECT_VERSION) {
    throw new ImportError('version', `Неподдерживаемая версия проекта ${JSON.stringify(raw['version'])}: редактор понимает версию ${PROJECT_VERSION}.`);
  }
  return parseDoc(raw['doc'], 'project.json');
}

export interface ImportTarget {
  projectId: string;
  name: string;
  pack: string;
}

/**
 * Игровой JSON уровня (общий формат) → документ редактора. Версия схемы проверяется строго;
 * неизвестные типы объектов и ресурсы сохраняются в документе и покажутся в диагностике.
 */
export function docFromGameJson(raw: unknown, target: ImportTarget): EditorDoc {
  if (!isRec(raw)) throw new ContentError('level', [{ path: '$', message: 'ожидался объект уровня' }]);
  if (raw['schemaVersion'] !== SCHEMA_VERSION) {
    throw new ImportError(
      'version',
      `Неподдерживаемая версия схемы уровня ${JSON.stringify(raw['schemaVersion'])}: поддерживается ${SCHEMA_VERSION}.`,
    );
  }
  return parseDoc(
    {
      ...raw,
      projectId: target.projectId,
      pack: target.pack,
      name: target.name,
      hudLabel: raw['hudLabel'] ?? 'IMPORT',
      note: raw['note'] ?? '',
      refs: [],
    },
    'level',
  );
}
