import type { ObservationStatus, Params } from '../content/schema';
import {
  clampRect,
  clearRect,
  copyRegion,
  emptyChar,
  inBounds,
  pasteClip,
  rectContains,
} from './grid';
import { History } from './history';
import {
  findMark,
  findObject,
  findRef,
  removeMark,
  removeObject,
  removeRef,
  setStart,
} from './ops';
import type { Clip, EditorDoc, Pt, Rect, Selection, ToolName, ViewMode } from './types';

export interface ToolState {
  tool: ToolName;
  /** Символ легенды, которым рисуют кисть, прямоугольник и заливка. */
  char: string;
  /** Тип объекта, который ставит инструмент «Объект». */
  objectType: string | null;
  /** Статус новых исследовательских пометок. */
  markStatus: ObservationStatus;
  /** Вставка не затирает существующее пустыми клетками фрагмента. */
  transparentPaste: boolean;
}

export interface UiState {
  mode: ViewMode;
  showGrid: boolean;
  showGhost: boolean;
  showMarks: boolean;
  showObjects: boolean;
  /** Положение окна просмотра (один экран игры) на карте, в клетках. */
  windowX: number;
  windowY: number;
  /** Референс, с которым работают инструменты «Подложка» и калибровка. */
  activeRef: string | null;
}

/** Параметры нового объекта по умолчанию (задаёт интерфейс из каталога типов). */
export type ObjectDefaults = (type: string) => { params: Params; asset: string | null };

type Listener = () => void;

/**
 * Состояние редактора без DOM: документ с историей, инструмент, выделение, буфер обмена.
 * Всё, что меняет документ, проходит через commit() либо begin()/update()/end() — тогда история
 * и счётчик `revision` (для автосохранения) всегда согласованы.
 */
export class EditorStore {
  private readonly history: History<EditorDoc>;
  private readonly listeners = new Set<Listener>();
  private revisionCounter = 0;
  tool: ToolState = { tool: 'brush', char: '#', objectType: null, markStatus: 'assumed', transparentPaste: false };
  ui: UiState = {
    mode: 'overlay',
    showGrid: true,
    showGhost: false,
    showMarks: true,
    showObjects: true,
    windowX: 0,
    windowY: 0,
    activeRef: null,
  };
  selection: Selection | null = null;
  clipboard: Clip | null = null;
  objectDefaults: ObjectDefaults = () => ({ params: {}, asset: null });

  constructor(doc: EditorDoc) {
    this.history = new History(doc);
    this.ui.activeRef = doc.refs[0]?.id ?? null;
    this.tool.char = firstSolidChar(doc);
  }

  get doc(): EditorDoc {
    return this.history.present;
  }

  /** Растёт при любом изменении документа (в том числе undo/redo) — по нему работает автосохранение. */
  get revision(): number {
    return this.revisionCounter;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** Открыть другой документ: история, выделение и буфер вставки не переносятся. */
  load(doc: EditorDoc): void {
    this.history.reset(doc);
    this.selection = null;
    this.ui.activeRef = doc.refs[0]?.id ?? null;
    this.tool.char = this.doc.legend[this.tool.char] ? this.tool.char : firstSolidChar(doc);
    this.revisionCounter++;
    this.notify();
  }

  // ── Изменение документа ──────────────────────────────────────────────────

  /** Одна завершённая операция (одна запись в истории). */
  commit(change: (doc: EditorDoc) => EditorDoc): boolean {
    const changed = this.history.commit(change(this.doc));
    if (changed) this.afterChange();
    return changed;
  }

  /** Начало непрерывной операции (мазок кисти, перетаскивание): до end() в истории одна запись. */
  begin(): void {
    this.history.begin();
  }

  update(change: (doc: EditorDoc) => EditorDoc): void {
    if (!this.history.inTransaction) throw new Error('update вне begin()');
    const next = change(this.doc);
    if (next === this.doc) return;
    this.history.replace(next);
    this.afterChange();
  }

  end(): boolean {
    const changed = this.history.end();
    if (changed) this.afterChange();
    return changed;
  }

  cancel(): void {
    this.history.cancel();
    this.afterChange();
  }

  undo(): boolean {
    const result = this.history.undo();
    if (result) this.afterChange();
    return result !== null;
  }

  redo(): boolean {
    const result = this.history.redo();
    if (result) this.afterChange();
    return result !== null;
  }

  private afterChange(): void {
    this.revisionCounter++;
    this.sanitize();
    this.notify();
  }

  /** Выделение и ссылки на удалённое/исчезнувшее после изменения (в том числе undo) сбрасываются. */
  private sanitize(): void {
    const { doc, selection } = this;
    if (selection) {
      if (selection.kind === 'cells') {
        const rect = clampRect(selection.rect, doc);
        this.selection = rect ? { kind: 'cells', rect } : null;
      } else if (selection.kind === 'object' && !findObject(doc, selection.id)) this.selection = null;
      else if (selection.kind === 'mark' && !findMark(doc, selection.id)) this.selection = null;
      else if (selection.kind === 'ref' && !findRef(doc, selection.id)) this.selection = null;
      else if (selection.kind === 'start' && doc.start === null) this.selection = null;
    }
    if (this.ui.activeRef !== null && !findRef(doc, this.ui.activeRef)) this.ui.activeRef = doc.refs[0]?.id ?? null;
    if (!doc.legend[this.tool.char]) this.tool.char = firstSolidChar(doc);
  }

  // ── Инструмент и выделение ───────────────────────────────────────────────

  setTool(tool: ToolName): void {
    this.tool = { ...this.tool, tool };
    this.notify();
  }

  setChar(char: string): void {
    if (!this.doc.legend[char]) return;
    this.tool = { ...this.tool, char };
    this.notify();
  }

  setObjectType(type: string | null): void {
    this.tool = { ...this.tool, objectType: type };
    this.notify();
  }

  setMarkStatus(status: ObservationStatus): void {
    this.tool = { ...this.tool, markStatus: status };
    this.notify();
  }

  setTransparentPaste(value: boolean): void {
    this.tool = { ...this.tool, transparentPaste: value };
    this.notify();
  }

  patchUi(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.notify();
  }

  select(selection: Selection | null): void {
    this.selection = selection;
    this.notify();
  }

  selectAll(): void {
    this.select({ kind: 'cells', rect: { x: 0, y: 0, w: this.doc.width, h: this.doc.height } });
  }

  // ── Буфер обмена ─────────────────────────────────────────────────────────

  /** Копирует выделенные клетки (только тайлы; объекты и пометки переносятся отдельно). */
  copy(): boolean {
    const { selection, doc } = this;
    if (selection?.kind !== 'cells') return false;
    const clip = copyRegion(doc, selection.rect);
    if (!clip) return false;
    this.clipboard = clip;
    this.notify();
    return true;
  }

  /** Вставка в точку `at` (по умолчанию — левый верхний угол выделения или окна просмотра). */
  paste(at?: Pt): boolean {
    const clip = this.clipboard;
    if (!clip) return false;
    const origin: Pt =
      at ?? (this.selection?.kind === 'cells' ? { x: this.selection.rect.x, y: this.selection.rect.y } : { x: this.ui.windowX, y: this.ui.windowY });
    const transparent = this.tool.transparentPaste;
    const changed = this.commit((doc) => pasteClip(doc, clip, origin.x, origin.y, transparent));
    const rect = clampRect({ x: origin.x, y: origin.y, w: clip.w, h: clip.h }, this.doc);
    if (rect) this.select({ kind: 'cells', rect });
    return changed;
  }

  /** Копия выделенного участка рядом с ним: справа, а если не помещается — снизу. */
  duplicate(): boolean {
    const { selection } = this;
    if (selection?.kind !== 'cells' || !this.copy()) return false;
    const { rect } = selection;
    const { doc } = this;
    const target: Pt =
      rect.x + rect.w * 2 <= doc.width
        ? { x: rect.x + rect.w, y: rect.y }
        : rect.y + rect.h * 2 <= doc.height
          ? { x: rect.x, y: rect.y + rect.h }
          : { x: Math.min(rect.x + 1, Math.max(0, doc.width - rect.w)), y: Math.min(rect.y + 1, Math.max(0, doc.height - rect.h)) };
    return this.paste(target);
  }

  /** Delete: стирает выделенные клетки либо удаляет выделенный объект/пометку/старт/референс. */
  deleteSelection(): boolean {
    const { selection } = this;
    if (!selection) return false;
    let changed = false;
    switch (selection.kind) {
      case 'cells':
        changed = this.commit((doc) => clearRect(doc, selection.rect));
        break;
      case 'object':
        changed = this.commit((doc) => removeObject(doc, selection.id));
        break;
      case 'mark':
        changed = this.commit((doc) => removeMark(doc, selection.id));
        break;
      case 'start':
        changed = this.commit((doc) => setStart(doc, null));
        break;
      case 'ref':
        changed = this.commit((doc) => removeRef(doc, selection.id));
        break;
    }
    return changed;
  }

  /** Клетка свободна для «Тест отсюда»: внутри карты, не занята твёрдой клеткой. */
  isFreeCell(x: number, y: number): boolean {
    const { doc } = this;
    if (!inBounds(doc, x, y)) return false;
    const char = doc.rows[y]?.[x];
    return char !== undefined && doc.legend[char]?.collision !== 'solid';
  }

  selectionRect(): Rect | null {
    return this.selection?.kind === 'cells' ? this.selection.rect : null;
  }

  cellSelected(x: number, y: number): boolean {
    const rect = this.selectionRect();
    return rect !== null && rectContains(rect, x, y);
  }
}

export function firstSolidChar(doc: Pick<EditorDoc, 'legend'>): string {
  const solid = Object.entries(doc.legend).find(([, entry]) => entry.collision === 'solid');
  return solid?.[0] ?? emptyChar(doc.legend) ?? '.';
}
