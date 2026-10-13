import { HUD_LABEL_PATTERN, ID_PATTERN } from '../content/validate';
import type { LevelMark, ObjectDef, ObservationStatus, Params } from '../content/schema';
import { MAX_MARK_NOTE, MAX_MARK_REF } from '../content/schema';
import { clampRect, rectContains } from './grid';
import type { EditorDoc, Pt, Rect, ReferenceImage } from './types';

/** Свободный идентификатор вида `<префикс>-<номер>`. */
export function uniqueId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) {
    const candidate = `${prefix}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

// ── Старт ──────────────────────────────────────────────────────────────────

export function setStart(doc: EditorDoc, point: Pt | null): EditorDoc {
  if (point === null) return doc.start === null ? doc : { ...doc, start: null };
  if (doc.start && doc.start.x === point.x && doc.start.y === point.y) return doc;
  return { ...doc, start: { x: point.x, y: point.y } };
}

// ── Объекты ────────────────────────────────────────────────────────────────

export interface NewObject {
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  asset?: string | null;
  params?: Params;
}

export function objectAt(doc: EditorDoc, x: number, y: number): ObjectDef | null {
  for (let i = doc.objects.length - 1; i >= 0; i--) {
    const object = doc.objects[i];
    if (object && rectContains({ x: object.x, y: object.y, w: object.w, h: object.h }, x, y)) return object;
  }
  return null;
}

export function findObject(doc: EditorDoc, id: string): ObjectDef | null {
  return doc.objects.find((o) => o.id === id) ?? null;
}

export function addObject(doc: EditorDoc, spec: NewObject): { doc: EditorDoc; id: string } {
  const id = uniqueId(spec.type, doc.objects.map((o) => o.id));
  const object: ObjectDef = {
    id,
    type: spec.type,
    x: spec.x,
    y: spec.y,
    w: spec.w ?? 1,
    h: spec.h ?? 1,
    asset: spec.asset ?? null,
    params: { ...(spec.params ?? {}) },
  };
  return { doc: { ...doc, objects: [...doc.objects, object] }, id };
}

export type ObjectPatch = Partial<Pick<ObjectDef, 'x' | 'y' | 'w' | 'h' | 'asset' | 'params'>>;

export function updateObject(doc: EditorDoc, id: string, patch: ObjectPatch): EditorDoc {
  let changed = false;
  const objects = doc.objects.map((object) => {
    if (object.id !== id) return object;
    const next: ObjectDef = {
      ...object,
      ...patch,
      params: patch.params ? { ...patch.params } : object.params,
    };
    changed = JSON.stringify(next) !== JSON.stringify(object);
    return changed ? next : object;
  });
  return changed ? { ...doc, objects } : doc;
}

/** Переименование с сохранением переходов. null — идентификатор недопустим или занят. */
export function renameObject(doc: EditorDoc, id: string, newId: string): EditorDoc | null {
  if (id === newId) return doc;
  if (!ID_PATTERN.test(newId) || doc.objects.some((o) => o.id === newId)) return null;
  if (!doc.objects.some((o) => o.id === id)) return null;
  return {
    ...doc,
    objects: doc.objects.map((o) => (o.id === id ? { ...o, id: newId } : o)),
    transitions: doc.transitions.map((t) => (t.from === id ? { ...t, from: newId } : t)),
  };
}

export function removeObject(doc: EditorDoc, id: string): EditorDoc {
  if (!doc.objects.some((o) => o.id === id)) return doc;
  return {
    ...doc,
    objects: doc.objects.filter((o) => o.id !== id),
    transitions: doc.transitions.filter((t) => t.from !== id),
  };
}

// ── Переходы ───────────────────────────────────────────────────────────────

/** Задаёт переход от объекта-триггера; `to === undefined` удаляет переход. */
export function setTransition(doc: EditorDoc, from: string, to: string | null | undefined): EditorDoc {
  const others = doc.transitions.filter((t) => t.from !== from);
  if (to === undefined) return others.length === doc.transitions.length ? doc : { ...doc, transitions: others };
  return { ...doc, transitions: [...others, { from, to }] };
}

// ── Пометки ────────────────────────────────────────────────────────────────

export function markAt(doc: EditorDoc, x: number, y: number): LevelMark | null {
  for (let i = doc.marks.length - 1; i >= 0; i--) {
    const mark = doc.marks[i];
    if (mark && rectContains(mark, x, y)) return mark;
  }
  return null;
}

export function findMark(doc: EditorDoc, id: string): LevelMark | null {
  return doc.marks.find((m) => m.id === id) ?? null;
}

export function addMark(
  doc: EditorDoc,
  rect: Rect,
  status: ObservationStatus,
  note = '',
  ref = '',
): { doc: EditorDoc; id: string } | null {
  const area = clampRect(rect, doc);
  if (!area) return null;
  const id = uniqueId('mark', doc.marks.map((m) => m.id));
  const mark: LevelMark = { id, ...area, status, note: note.slice(0, MAX_MARK_NOTE), ref: ref.slice(0, MAX_MARK_REF) };
  return { doc: { ...doc, marks: [...doc.marks, mark] }, id };
}

export type MarkPatch = Partial<Pick<LevelMark, 'x' | 'y' | 'w' | 'h' | 'status' | 'note' | 'ref'>>;

export function updateMark(doc: EditorDoc, id: string, patch: MarkPatch): EditorDoc {
  let changed = false;
  const marks = doc.marks.map((mark) => {
    if (mark.id !== id) return mark;
    const next: LevelMark = { ...mark, ...patch };
    next.note = next.note.slice(0, MAX_MARK_NOTE);
    next.ref = next.ref.slice(0, MAX_MARK_REF);
    changed = JSON.stringify(next) !== JSON.stringify(mark);
    return changed ? next : mark;
  });
  return changed ? { ...doc, marks } : doc;
}

export function removeMark(doc: EditorDoc, id: string): EditorDoc {
  return doc.marks.some((m) => m.id === id) ? { ...doc, marks: doc.marks.filter((m) => m.id !== id) } : doc;
}

// ── Референсы ──────────────────────────────────────────────────────────────

export function findRef(doc: EditorDoc, id: string): ReferenceImage | null {
  return doc.refs.find((r) => r.id === id) ?? null;
}

export function addRef(doc: EditorDoc, ref: ReferenceImage): EditorDoc {
  return { ...doc, refs: [...doc.refs, ref] };
}

export type RefPatch = Partial<Omit<ReferenceImage, 'id' | 'mime' | 'width' | 'height'>>;

export function updateRef(doc: EditorDoc, id: string, patch: RefPatch): EditorDoc {
  let changed = false;
  const refs = doc.refs.map((ref) => {
    if (ref.id !== id) return ref;
    const next: ReferenceImage = { ...ref, ...patch };
    changed = JSON.stringify(next) !== JSON.stringify(ref);
    return changed ? next : ref;
  });
  return changed ? { ...doc, refs } : doc;
}

export function removeRef(doc: EditorDoc, id: string): EditorDoc {
  return doc.refs.some((r) => r.id === id) ? { ...doc, refs: doc.refs.filter((r) => r.id !== id) } : doc;
}

// ── Свойства карты ─────────────────────────────────────────────────────────

export interface LevelPropsPatch {
  name?: string;
  id?: string;
  hudLabel?: string;
  note?: string;
  status?: EditorDoc['status'];
}

/** Свойства карты; null — значение недопустимо (поле остаётся прежним). */
export function setLevelProps(doc: EditorDoc, patch: LevelPropsPatch): EditorDoc | null {
  if (patch.id !== undefined && !ID_PATTERN.test(patch.id)) return null;
  if (patch.hudLabel !== undefined && !HUD_LABEL_PATTERN.test(patch.hudLabel)) return null;
  if (patch.name !== undefined && (patch.name.trim() === '' || patch.name.length > 120)) return null;
  return { ...doc, ...patch };
}
