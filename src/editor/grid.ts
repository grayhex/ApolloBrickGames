import type { LegendEntry } from '../content/schema';
import type { CellChange, Clip, EditorDoc, Pt, Rect } from './types';
import { MAX_LEVEL_SIZE, MIN_LEVEL_SIZE } from './types';

/** Символ «пустой клетки»: предпочитаем «.», иначе первая проходимая клетка без рисунка, иначе любая проходимая. */
export function emptyChar(legend: Readonly<Record<string, LegendEntry>>): string | null {
  const dot = legend['.'];
  if (dot && dot.collision === 'empty') return '.';
  const entries = Object.entries(legend).filter(([, entry]) => entry.collision === 'empty');
  return (entries.find(([, entry]) => entry.asset === null) ?? entries[0])?.[0] ?? null;
}

export function inBounds(doc: Pick<EditorDoc, 'width' | 'height'>, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < doc.width && y < doc.height;
}

export function cellAt(doc: EditorDoc, x: number, y: number): string | null {
  if (!inBounds(doc, x, y)) return null;
  return doc.rows[y]?.[x] ?? null;
}

/** Прямоугольник по двум угловым клеткам (включительно), в любом порядке. */
export function rectFromCorners(a: Pt, b: Pt): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

/** Часть прямоугольника, лежащая внутри карты; null — снаружи целиком. */
export function clampRect(rect: Rect, doc: Pick<EditorDoc, 'width' | 'height'>): Rect | null {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(doc.width, rect.x + rect.w);
  const y1 = Math.min(doc.height, rect.y + rect.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Клетки отрезка между двумя клетками (алгоритм Брезенхема, включая концы): мазок без «дыр» при быстром движении мыши. */
export function lineCells(a: Pt, b: Pt): Pt[] {
  const cells: Pt[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

/** Записывает символы в клетки; клетки вне карты пропускаются. Если ничего не изменилось — возвращает тот же документ. */
export function setCells(doc: EditorDoc, changes: readonly CellChange[]): EditorDoc {
  let rows: string[] | null = null;
  for (const { x, y, char } of changes) {
    if (!inBounds(doc, x, y)) continue;
    const row = (rows ?? doc.rows)[y];
    if (row === undefined || row[x] === char) continue;
    rows ??= [...doc.rows];
    rows[y] = row.slice(0, x) + char + row.slice(x + 1);
  }
  return rows ? { ...doc, rows } : doc;
}

export function fillRect(doc: EditorDoc, rect: Rect, char: string): EditorDoc {
  const area = clampRect(rect, doc);
  if (!area) return doc;
  const changes: CellChange[] = [];
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) changes.push({ x, y, char });
  }
  return setCells(doc, changes);
}

/** Заливка связной области (по четырём сторонам) клеток с тем же символом. */
export function floodFill(doc: EditorDoc, x: number, y: number, char: string): EditorDoc {
  const target = cellAt(doc, x, y);
  if (target === null || target === char) return doc;
  const seen = new Uint8Array(doc.width * doc.height);
  const stack: number[] = [y * doc.width + x];
  const changes: CellChange[] = [];
  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined || seen[index] === 1) continue;
    const cx = index % doc.width;
    const cy = Math.floor(index / doc.width);
    if (doc.rows[cy]?.[cx] !== target) continue;
    seen[index] = 1;
    changes.push({ x: cx, y: cy, char });
    if (cx > 0) stack.push(index - 1);
    if (cx < doc.width - 1) stack.push(index + 1);
    if (cy > 0) stack.push(index - doc.width);
    if (cy < doc.height - 1) stack.push(index + doc.width);
  }
  return setCells(doc, changes);
}

export function copyRegion(doc: EditorDoc, rect: Rect): Clip | null {
  const area = clampRect(rect, doc);
  if (!area) return null;
  const rows: string[] = [];
  for (let y = area.y; y < area.y + area.h; y++) rows.push((doc.rows[y] ?? '').slice(area.x, area.x + area.w));
  return { w: area.w, h: area.h, rows };
}

/** Вставка фрагмента с левым верхним углом в (x, y). `transparent` — пустые клетки фрагмента не затирают существующее. */
export function pasteClip(doc: EditorDoc, clip: Clip, x: number, y: number, transparent = false): EditorDoc {
  const empty = emptyChar(doc.legend);
  const changes: CellChange[] = [];
  clip.rows.forEach((row, dy) => {
    [...row].forEach((char, dx) => {
      if (transparent && char === empty) return;
      if (!(char in doc.legend)) return; // символ из чужой легенды не вносим молча
      changes.push({ x: x + dx, y: y + dy, char });
    });
  });
  return setCells(doc, changes);
}

export function clearRect(doc: EditorDoc, rect: Rect): EditorDoc {
  const empty = emptyChar(doc.legend);
  return empty === null ? doc : fillRect(doc, rect, empty);
}

/** Перенос содержимого прямоугольника на (dx, dy): одна операция для истории. Возвращает новый документ и перенесённую область. */
export function moveRegion(doc: EditorDoc, rect: Rect, dx: number, dy: number): EditorDoc {
  const area = clampRect(rect, doc);
  if (!area || (dx === 0 && dy === 0)) return doc;
  const clip = copyRegion(doc, area);
  if (!clip) return doc;
  return pasteClip(clearRect(doc, area), clip, area.x + dx, area.y + dy);
}

// ── Размер карты ───────────────────────────────────────────────────────────

export interface ResizePlan {
  width: number;
  height: number;
  /** Непустые клетки, которые исчезнут. */
  cutCells: CellChange[];
  /** Объекты, не помещающиеся целиком (будут удалены вместе с их переходами). */
  cutObjects: string[];
  /** Пометки, лежащие целиком снаружи (будут удалены). */
  cutMarks: string[];
  /** Пометки, у которых останется только часть. */
  clippedMarks: string[];
  startCut: boolean;
  lossy: boolean;
}

export function validSize(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= MIN_LEVEL_SIZE &&
    height >= MIN_LEVEL_SIZE &&
    width <= MAX_LEVEL_SIZE &&
    height <= MAX_LEVEL_SIZE
  );
}

/** Что потеряется при изменении размера: показывается пользователю до подтверждения. */
export function planResize(doc: EditorDoc, width: number, height: number): ResizePlan {
  const empty = emptyChar(doc.legend);
  const cutCells: CellChange[] = [];
  doc.rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if ((x >= width || y >= height) && char !== empty) cutCells.push({ x, y, char });
    });
  });
  const cutObjects = doc.objects.filter((o) => o.x + o.w > width || o.y + o.h > height).map((o) => o.id);
  const cutMarks: string[] = [];
  const clippedMarks: string[] = [];
  for (const mark of doc.marks) {
    if (mark.x >= width || mark.y >= height) cutMarks.push(mark.id);
    else if (mark.x + mark.w > width || mark.y + mark.h > height) clippedMarks.push(mark.id);
  }
  const startCut = doc.start !== null && (doc.start.x >= width || doc.start.y >= height);
  return {
    width,
    height,
    cutCells,
    cutObjects,
    cutMarks,
    clippedMarks,
    startCut,
    lossy: cutCells.length + cutObjects.length + cutMarks.length + clippedMarks.length > 0 || startCut,
  };
}

/** Новый размер: новые клетки пустые, лишнее обрезается (см. planResize). Не пересобирает документ, если размер тот же. */
export function resizeDoc(doc: EditorDoc, width: number, height: number): EditorDoc {
  if (!validSize(width, height)) throw new RangeError(`размер ${width}×${height} вне допустимого диапазона`);
  if (width === doc.width && height === doc.height) return doc;
  const empty = emptyChar(doc.legend);
  if (empty === null) throw new Error('в легенде нет пустой клетки: нечем заполнить новые клетки');
  const rows: string[] = [];
  for (let y = 0; y < height; y++) rows.push((doc.rows[y] ?? '').slice(0, width).padEnd(width, empty));
  const plan = planResize(doc, width, height);
  const dropped = new Set(plan.cutObjects);
  return {
    ...doc,
    width,
    height,
    rows,
    start: plan.startCut ? null : doc.start,
    objects: doc.objects.filter((o) => !dropped.has(o.id)),
    transitions: doc.transitions.filter((t) => !dropped.has(t.from)),
    marks: doc.marks.flatMap((mark) => {
      if (mark.x >= width || mark.y >= height) return [];
      return [{ ...mark, w: Math.min(mark.x + mark.w, width) - mark.x, h: Math.min(mark.y + mark.h, height) - mark.y }];
    }),
  };
}
