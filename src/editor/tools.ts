import {
  cellAt,
  clampRect,
  emptyChar,
  fillRect,
  floodFill,
  inBounds,
  lineCells,
  moveRegion,
  rectContains,
  rectFromCorners,
  setCells,
} from './grid';
import { addMark, addObject, markAt, objectAt, setStart, updateMark, updateObject, updateRef, findMark, findObject, findRef } from './ops';
import type { EditorStore } from './store';
import type { Pt, Rect } from './types';

export interface Pointer {
  /** Клетка под курсором (целые координаты; могут быть вне карты). */
  cell: Pt;
  /** Точка в клетках (дробные координаты). */
  world: Pt;
  shift: boolean;
}

/** Временная картинка поверх карты, пока кнопка мыши зажата. */
export type Preview =
  | { kind: 'rect'; rect: Rect; tone: 'paint' | 'select' | 'mark' }
  | { kind: 'move'; rect: Rect; dx: number; dy: number };

type Drag =
  | { kind: 'paint'; char: string; last: Pt }
  | { kind: 'rect'; anchor: Pt; char: string }
  | { kind: 'marquee'; anchor: Pt }
  | { kind: 'moveSel'; anchor: Pt; rect: Rect; dx: number; dy: number }
  | { kind: 'object'; id: string; anchor: Pt; origin: Pt }
  | { kind: 'newMark'; anchor: Pt }
  | { kind: 'mark'; id: string; anchor: Pt; origin: Pt }
  | { kind: 'photo'; id: string; anchor: Pt; origin: Pt };

function clampPoint(doc: { width: number; height: number }, p: Pt): Pt {
  return { x: Math.min(doc.width - 1, Math.max(0, p.x)), y: Math.min(doc.height - 1, Math.max(0, p.y)) };
}

/**
 * Инструменты мыши. Каждый работает со своим слоем данных:
 * кисть/ластик/прямоугольник/заливка/выделение — только с тайлами; «Старт», «Объект», «Пометка» и «Подложка» — каждый
 * со своими; поэтому стирание земли не трогает объекты, пометки и референсы. Мазок — одна операция истории.
 */
export class ToolController {
  preview: Preview | null = null;
  /** Подсказка о том, почему действие не выполнено (показывается в строке состояния). */
  hint = '';
  private drag: Drag | null = null;
  private readonly store: EditorStore;

  constructor(store: EditorStore) {
    this.store = store;
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  down(p: Pointer): void {
    if (this.drag) this.cancel();
    this.hint = '';
    const { store } = this;
    const { doc } = store;
    switch (store.tool.tool) {
      case 'brush':
      case 'eraser': {
        const char = store.tool.tool === 'eraser' ? emptyChar(doc.legend) : store.tool.char;
        if (char === null || !(char in doc.legend)) {
          this.hint = 'В легенде нет подходящей клетки';
          return;
        }
        store.begin();
        this.drag = { kind: 'paint', char, last: p.cell };
        store.update((d) => setCells(d, [{ ...p.cell, char }]));
        break;
      }
      case 'rect': {
        if (!(store.tool.char in doc.legend)) return;
        this.drag = { kind: 'rect', anchor: p.cell, char: store.tool.char };
        this.preview = { kind: 'rect', rect: rectFromCorners(p.cell, p.cell), tone: 'paint' };
        break;
      }
      case 'fill': {
        if (!inBounds(doc, p.cell.x, p.cell.y) || !(store.tool.char in doc.legend)) return;
        const char = store.tool.char;
        store.commit((d) => floodFill(d, p.cell.x, p.cell.y, char));
        break;
      }
      case 'eyedropper': {
        const char = cellAt(doc, p.cell.x, p.cell.y);
        if (char !== null) store.setChar(char);
        break;
      }
      case 'select': {
        const selected = store.selectionRect();
        if (selected && rectContains(selected, p.cell.x, p.cell.y)) {
          this.drag = { kind: 'moveSel', anchor: p.cell, rect: selected, dx: 0, dy: 0 };
        } else {
          const anchor = clampPoint(doc, p.cell);
          this.drag = { kind: 'marquee', anchor };
          this.preview = { kind: 'rect', rect: rectFromCorners(anchor, anchor), tone: 'select' };
        }
        break;
      }
      case 'start': {
        if (!inBounds(doc, p.cell.x, p.cell.y)) return;
        store.commit((d) => setStart(d, p.cell));
        store.select({ kind: 'start' });
        break;
      }
      case 'object': {
        const hit = objectAt(doc, p.cell.x, p.cell.y);
        if (hit) {
          store.select({ kind: 'object', id: hit.id });
          store.begin();
          this.drag = { kind: 'object', id: hit.id, anchor: p.cell, origin: { x: hit.x, y: hit.y } };
          return;
        }
        const type = store.tool.objectType;
        if (!type) {
          this.hint = 'Выберите тип объекта в палитре';
          return;
        }
        if (!inBounds(doc, p.cell.x, p.cell.y)) return;
        const defaults = store.objectDefaults(type);
        let newId = '';
        store.commit((d) => {
          const result = addObject(d, { type, x: p.cell.x, y: p.cell.y, params: defaults.params, asset: defaults.asset });
          newId = result.id;
          return result.doc;
        });
        store.select({ kind: 'object', id: newId });
        break;
      }
      case 'mark': {
        const hit = p.shift ? null : markAt(doc, p.cell.x, p.cell.y);
        if (hit) {
          store.select({ kind: 'mark', id: hit.id });
          store.begin();
          this.drag = { kind: 'mark', id: hit.id, anchor: p.cell, origin: { x: hit.x, y: hit.y } };
          return;
        }
        if (!inBounds(doc, p.cell.x, p.cell.y)) return;
        this.drag = { kind: 'newMark', anchor: p.cell };
        this.preview = { kind: 'rect', rect: rectFromCorners(p.cell, p.cell), tone: 'mark' };
        break;
      }
      case 'photo': {
        const id = store.ui.activeRef;
        const ref = id === null ? null : findRef(doc, id);
        if (!ref) {
          this.hint = 'Нет выбранного референса';
          return;
        }
        if (ref.locked) {
          this.hint = 'Референс заблокирован: снимите блокировку, чтобы двигать подложку';
          return;
        }
        store.begin();
        this.drag = { kind: 'photo', id: ref.id, anchor: p.world, origin: { ...ref.origin } };
        break;
      }
      case 'pan':
        break;
    }
  }

  move(p: Pointer): void {
    const { drag, store } = this;
    if (!drag) return;
    const { doc } = store;
    switch (drag.kind) {
      case 'paint': {
        const cells = lineCells(drag.last, p.cell).map((c) => ({ ...c, char: drag.char }));
        store.update((d) => setCells(d, cells));
        drag.last = p.cell;
        break;
      }
      case 'rect':
        this.preview = { kind: 'rect', rect: rectFromCorners(drag.anchor, p.cell), tone: 'paint' };
        break;
      case 'marquee':
        this.preview = { kind: 'rect', rect: rectFromCorners(drag.anchor, clampPoint(doc, p.cell)), tone: 'select' };
        break;
      case 'moveSel':
        drag.dx = p.cell.x - drag.anchor.x;
        drag.dy = p.cell.y - drag.anchor.y;
        this.preview = { kind: 'move', rect: drag.rect, dx: drag.dx, dy: drag.dy };
        break;
      case 'object': {
        const object = findObject(doc, drag.id);
        if (!object) return;
        const x = Math.min(doc.width - object.w, Math.max(0, drag.origin.x + p.cell.x - drag.anchor.x));
        const y = Math.min(doc.height - object.h, Math.max(0, drag.origin.y + p.cell.y - drag.anchor.y));
        store.update((d) => updateObject(d, drag.id, { x, y }));
        break;
      }
      case 'newMark':
        this.preview = { kind: 'rect', rect: rectFromCorners(drag.anchor, clampPoint(doc, p.cell)), tone: 'mark' };
        break;
      case 'mark': {
        const mark = findMark(doc, drag.id);
        if (!mark) return;
        const x = Math.min(doc.width - mark.w, Math.max(0, drag.origin.x + p.cell.x - drag.anchor.x));
        const y = Math.min(doc.height - mark.h, Math.max(0, drag.origin.y + p.cell.y - drag.anchor.y));
        store.update((d) => updateMark(d, drag.id, { x, y }));
        break;
      }
      case 'photo': {
        let x = drag.origin.x + p.world.x - drag.anchor.x;
        let y = drag.origin.y + p.world.y - drag.anchor.y;
        if (p.shift) {
          x = Math.round(x);
          y = Math.round(y);
        } else {
          x = Math.round(x * 100) / 100;
          y = Math.round(y * 100) / 100;
        }
        store.update((d) => updateRef(d, drag.id, { origin: { x, y } }));
        break;
      }
    }
  }

  up(p: Pointer): void {
    const { drag, store } = this;
    if (!drag) return;
    this.move(p);
    this.drag = null;
    this.preview = null;
    switch (drag.kind) {
      case 'paint':
      case 'object':
      case 'mark':
      case 'photo':
        store.end();
        break;
      case 'rect': {
        const rect = rectFromCorners(drag.anchor, p.cell);
        store.commit((d) => fillRect(d, rect, drag.char));
        break;
      }
      case 'marquee': {
        const rect = clampRect(rectFromCorners(drag.anchor, clampPoint(store.doc, p.cell)), store.doc);
        store.select(rect ? { kind: 'cells', rect } : null);
        break;
      }
      case 'moveSel': {
        if (drag.dx !== 0 || drag.dy !== 0) {
          store.commit((d) => moveRegion(d, drag.rect, drag.dx, drag.dy));
          const moved = clampRect({ x: drag.rect.x + drag.dx, y: drag.rect.y + drag.dy, w: drag.rect.w, h: drag.rect.h }, store.doc);
          store.select(moved ? { kind: 'cells', rect: moved } : null);
        }
        break;
      }
      case 'newMark': {
        const rect = rectFromCorners(drag.anchor, clampPoint(store.doc, p.cell));
        let newId: string | null = null;
        store.commit((d) => {
          const result = addMark(d, rect, store.tool.markStatus);
          newId = result?.id ?? null;
          return result?.doc ?? d;
        });
        if (newId !== null) store.select({ kind: 'mark', id: newId });
        break;
      }
    }
    store.notify();
  }

  /** Escape или потеря указателя: незавершённая операция отменяется целиком. */
  cancel(): void {
    const { drag } = this;
    this.drag = null;
    this.preview = null;
    if (drag && (drag.kind === 'paint' || drag.kind === 'object' || drag.kind === 'mark' || drag.kind === 'photo')) {
      this.store.cancel();
    } else {
      this.store.notify();
    }
  }
}
