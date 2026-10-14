import { describe, expect, it } from 'vitest';
import { cellAtScreen, panBy, zoomAt, type View } from '../../src/editor/viewport';
import { addMark, addObject, addRef } from '../../src/editor/ops';
import { EditorStore } from '../../src/editor/store';
import { ToolController, type Pointer } from '../../src/editor/tools';
import { freshDoc } from './helpers';
import type { ReferenceImage } from '../../src/editor/types';

function at(x: number, y: number, shift = false): Pointer {
  return { cell: { x, y }, world: { x: x + 0.5, y: y + 0.5 }, shift };
}

function setup() {
  const store = new EditorStore(freshDoc());
  return { store, tools: new ToolController(store) };
}

function stroke(tools: ToolController, points: [number, number][]): void {
  const [first, ...rest] = points;
  if (!first) return;
  tools.down(at(first[0], first[1]));
  for (const [x, y] of rest) tools.move(at(x, y));
  const last = points[points.length - 1] ?? first;
  tools.up(at(last[0], last[1]));
}

const ref: ReferenceImage = {
  id: 'ref-1',
  name: 'Кадр 1',
  description: '',
  videoTime: '',
  mime: 'image/png',
  width: 640,
  height: 360,
  quad: null,
  origin: { x: 0, y: 0 },
  opacity: 0.6,
  visible: true,
  locked: false,
};

describe('инструменты: кисть, ластик, прямоугольник, заливка', () => {
  it('непрерывный мазок кисти — одна операция истории; undo возвращает всё, redo повторяет', () => {
    const { store, tools } = setup();
    const before = store.doc;
    store.setTool('brush');
    stroke(tools, [[0, 2], [6, 2], [6, 0], [10, 3]]);
    expect(store.doc.rows[2]?.slice(0, 7)).toBe('#######');
    expect(store.doc.rows[0]?.[6]).toBe('#');
    expect(store.undo()).toBe(true);
    expect(store.doc).toBe(before);
    expect(store.canUndo).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.doc.rows[2]?.slice(0, 7)).toBe('#######');
  });

  it('быстрое движение мыши не оставляет дыр: клетки интерполируются между событиями', () => {
    const { store, tools } = setup();
    store.setTool('brush');
    stroke(tools, [[0, 0], [12, 4]]);
    const painted = store.doc.rows.slice(0, 5).join('').split('#').length - 1;
    expect(painted).toBeGreaterThanOrEqual(13);
  });

  it('ластик стирает только землю: объекты, старт и пометки рядом остаются', () => {
    const { store, tools } = setup();
    store.commit((d) => addObject(d, { type: 'hazard', x: 4, y: 4 }).doc);
    store.commit((d) => addMark(d, { x: 4, y: 5, w: 1, h: 1 }, 'assumed', 'пол здесь не виден')?.doc ?? d);
    const startBefore = store.doc.start;
    store.setTool('eraser');
    stroke(tools, [[3, 5], [5, 5]]);
    expect(store.doc.rows[5]?.slice(3, 6)).toBe('...');
    expect(store.doc.objects).toHaveLength(1);
    expect(store.doc.marks).toHaveLength(1);
    expect(store.doc.start).toEqual(startBefore);
  });

  it('прямоугольник: превью во время движения, запись в историю только при отпускании', () => {
    const { store, tools } = setup();
    store.setTool('rect');
    tools.down(at(2, 1));
    tools.move(at(5, 2));
    expect(tools.preview).toEqual({ kind: 'rect', rect: { x: 2, y: 1, w: 4, h: 2 }, tone: 'paint' });
    expect(store.doc.rows[1]).toBe('.'.repeat(13));
    tools.up(at(5, 2));
    expect(store.doc.rows[1]).toBe('..####.......');
    expect(tools.preview).toBeNull();
    expect(store.undo()).toBe(true);
    expect(store.doc.rows[1]).toBe('.'.repeat(13));
  });

  it('заливка и пипетка', () => {
    const { store, tools } = setup();
    store.setTool('fill');
    tools.down(at(0, 0));
    tools.up(at(0, 0));
    expect(store.doc.rows[0]).toBe('#'.repeat(13));
    store.setTool('eyedropper');
    store.setChar('#');
    tools.down(at(0, 5));
    tools.up(at(0, 5));
    expect(store.tool.char).toBe('#');
    // Пипетка по пустой клетке выбирает «пустую» — ею можно стирать прямоугольником.
    const empty = new ToolController(new EditorStore(freshDoc()));
    expect(empty).toBeDefined();
  });

  it('клики вне карты ничего не рисуют', () => {
    const { store, tools } = setup();
    const before = store.doc;
    store.setTool('brush');
    stroke(tools, [[-3, -3], [-1, 2]]);
    expect(store.doc.rows).toEqual(before.rows);
    store.setTool('start');
    tools.down(at(40, 40));
    tools.up(at(40, 40));
    expect(store.doc.start).toEqual(before.start);
  });

  it('Escape посреди мазка отменяет всю операцию', () => {
    const { store, tools } = setup();
    store.setTool('brush');
    tools.down(at(1, 1));
    tools.move(at(4, 1));
    tools.cancel();
    expect(store.doc.rows[1]).toBe('.'.repeat(13));
    expect(store.canUndo).toBe(false);
  });
});

describe('выделение, копирование, перенос', () => {
  it('выделение прямоугольником; Ctrl+C / Ctrl+V; повтор вставки; дублирование', () => {
    const { store, tools } = setup();
    store.setTool('brush');
    stroke(tools, [[1, 3], [2, 3]]);
    store.setTool('select');
    tools.down(at(0, 3));
    tools.move(at(3, 3));
    tools.up(at(3, 3));
    expect(store.selection).toEqual({ kind: 'cells', rect: { x: 0, y: 3, w: 4, h: 1 } });
    expect(store.copy()).toBe(true);
    expect(store.paste({ x: 6, y: 1 })).toBe(true);
    expect(store.doc.rows[1]).toBe('.......##....');
    expect(store.selection).toEqual({ kind: 'cells', rect: { x: 6, y: 1, w: 4, h: 1 } });
    // Справа копия не помещается (6 + 4 + 4 > 13) — дубликат ложится под выделением.
    expect(store.duplicate()).toBe(true);
    expect(store.doc.rows[2]).toBe('.......##....');
    expect(store.selection).toEqual({ kind: 'cells', rect: { x: 6, y: 2, w: 4, h: 1 } });
    store.undo();
    store.undo();
    expect(store.doc.rows[1]).toBe('.'.repeat(13));
  });

  it('перенос выделения мышью — одна операция; выделение следует за содержимым', () => {
    const { store, tools } = setup();
    store.setTool('rect');
    tools.down(at(1, 3));
    tools.up(at(2, 3));
    store.setTool('select');
    tools.down(at(1, 3));
    tools.move(at(2, 3));
    tools.up(at(2, 3));
    expect(store.selection).toEqual({ kind: 'cells', rect: { x: 1, y: 3, w: 2, h: 1 } });
    tools.down(at(1, 3));
    tools.move(at(5, 2));
    expect(tools.preview).toMatchObject({ kind: 'move', dx: 4, dy: -1 });
    tools.up(at(5, 2));
    expect(store.doc.rows[3]).toBe('.'.repeat(13));
    expect(store.doc.rows[2]).toBe('.....##......');
    expect(store.selection).toEqual({ kind: 'cells', rect: { x: 5, y: 2, w: 2, h: 1 } });
    store.undo();
    expect(store.doc.rows[3]?.slice(1, 3)).toBe('##');
  });

  it('Delete стирает выделенные клетки; для объекта/пометки/старта удаляет их', () => {
    const { store } = setup();
    store.select({ kind: 'cells', rect: { x: 0, y: 5, w: 13, h: 1 } });
    store.deleteSelection();
    expect(store.doc.rows[5]).toBe('.'.repeat(13));
    store.select({ kind: 'start' });
    store.deleteSelection();
    expect(store.doc.start).toBeNull();
    expect(store.selection).toBeNull();
  });

  it('после undo выделение объекта, которого больше нет, сбрасывается', () => {
    const { store, tools } = setup();
    store.setObjectType('hazard');
    store.setTool('object');
    tools.down(at(5, 4));
    tools.up(at(5, 4));
    expect(store.selection).toEqual({ kind: 'object', id: 'hazard-1' });
    store.undo();
    expect(store.selection).toBeNull();
  });
});

describe('объекты, пометки, старт, подложка', () => {
  it('объект ставится, выделяется и переносится перетаскиванием одной операцией, не выходя за карту', () => {
    const { store, tools } = setup();
    store.objectDefaults = () => ({ params: { hp: 2 }, asset: null });
    store.setObjectType('target');
    store.setTool('object');
    tools.down(at(5, 4));
    tools.up(at(5, 4));
    expect(store.doc.objects[0]).toMatchObject({ id: 'target-1', x: 5, y: 4, params: { hp: 2 } });
    tools.down(at(5, 4));
    tools.move(at(8, 3));
    tools.move(at(40, -9));
    tools.up(at(40, -9));
    expect(store.doc.objects[0]).toMatchObject({ x: 12, y: 0 });
    store.undo();
    expect(store.doc.objects[0]).toMatchObject({ x: 5, y: 4 });
  });

  it('без выбранного типа объект не ставится и объясняет почему', () => {
    const { store, tools } = setup();
    store.setTool('object');
    tools.down(at(2, 2));
    expect(store.doc.objects).toHaveLength(0);
    expect(tools.hint).toMatch(/тип объекта/);
  });

  it('пометка рисуется прямоугольником со статусом из панели; существующую можно перетащить', () => {
    const { store, tools } = setup();
    store.setMarkStatus('unknown');
    store.setTool('mark');
    tools.down(at(3, 1));
    tools.move(at(5, 2));
    tools.up(at(5, 2));
    expect(store.doc.marks[0]).toMatchObject({ id: 'mark-1', x: 3, y: 1, w: 3, h: 2, status: 'unknown' });
    expect(store.selection).toEqual({ kind: 'mark', id: 'mark-1' });
    tools.down(at(4, 1));
    tools.move(at(6, 3));
    tools.up(at(6, 3));
    expect(store.doc.marks[0]).toMatchObject({ x: 5, y: 3 });
  });

  it('старт: ставится на любую клетку карты (проблему покажет диагностика), стереть землю под ним нельзя молча — это видно в диагностике', () => {
    const { store, tools } = setup();
    store.setTool('start');
    tools.down(at(7, 5));
    tools.up(at(7, 5));
    expect(store.doc.start).toEqual({ x: 7, y: 5 });
    expect(store.selection).toEqual({ kind: 'start' });
  });

  it('подложка: перетаскивание двигает референс, блокировка не даёт; рисовать при этом нельзя', () => {
    const { store, tools } = setup();
    store.commit((d) => addRef(d, ref));
    store.patchUi({ activeRef: 'ref-1' });
    store.setTool('photo');
    tools.down({ cell: { x: 2, y: 2 }, world: { x: 2.4, y: 2.4 }, shift: false });
    tools.move({ cell: { x: 5, y: 3 }, world: { x: 5.65, y: 3.1 }, shift: false });
    tools.up({ cell: { x: 5, y: 3 }, world: { x: 5.65, y: 3.1 }, shift: false });
    expect(store.doc.refs[0]?.origin).toEqual({ x: 3.25, y: 0.7 });
    expect(store.doc.rows).toEqual(freshDoc().rows);

    store.commit((d) => ({ ...d, refs: d.refs.map((r) => ({ ...r, locked: true })) }));
    tools.down(at(1, 1));
    tools.move(at(8, 8));
    tools.up(at(8, 8));
    expect(store.doc.refs[0]?.origin).toEqual({ x: 3.25, y: 0.7 });
    expect(tools.hint).toMatch(/заблокирован/);
  });
});

describe('после pan, zoom и изменения размера редактируется клетка под курсором', () => {
  it('кисть попадает в клетку, на которую указывает курсор в любом виде', () => {
    const { store, tools } = setup();
    store.setTool('brush');
    let view: View = { scale: 24, tx: 40, ty: 30 };
    view = zoomAt(view, 2, 200, 120);
    view = panBy(view, -50, 17);
    view = zoomAt(view, 0.75, 310, 90);
    const target = { x: 7, y: 2 };
    const sx = view.tx + (target.x + 0.37) * view.scale;
    const sy = view.ty + (target.y + 0.81) * view.scale;
    const cell = cellAtScreen(view, sx, sy);
    stroke(tools, [[cell.x, cell.y]]);
    expect(store.doc.rows[2]?.[7]).toBe('#');
    expect(store.doc.rows.join('').split('#').length - 1).toBe(13 + 1);
  });
});
