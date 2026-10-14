import { describe, expect, it } from 'vitest';
import {
  cellAt,
  clearRect,
  copyRegion,
  emptyChar,
  fillRect,
  floodFill,
  inBounds,
  lineCells,
  moveRegion,
  pasteClip,
  planResize,
  rectFromCorners,
  resizeDoc,
  setCells,
} from '../../src/editor/grid';
import { addMark, addObject } from '../../src/editor/ops';
import { freshDoc } from './helpers';

describe('операции над сеткой', () => {
  it('шаблон «одна комната» берёт размер из профиля экрана, внизу пол, старт над полом', () => {
    const doc = freshDoc();
    expect([doc.width, doc.height]).toEqual([13, 6]);
    expect(doc.rows[5]).toBe('#'.repeat(13));
    expect(doc.rows[0]).toBe('.'.repeat(13));
    expect(doc.start).toEqual({ x: 1, y: 4 });
    expect(emptyChar(doc.legend)).toBe('.');
  });

  it('setCells не меняет исходный документ и возвращает тот же объект, если изменений нет', () => {
    const doc = freshDoc();
    const next = setCells(doc, [{ x: 3, y: 2, char: '#' }]);
    expect(cellAt(next, 3, 2)).toBe('#');
    expect(cellAt(doc, 3, 2)).toBe('.');
    expect(setCells(next, [{ x: 3, y: 2, char: '#' }])).toBe(next);
    expect(setCells(doc, [{ x: -1, y: 0, char: '#' }, { x: 13, y: 0, char: '#' }, { x: 0, y: 6, char: '#' }])).toBe(doc);
  });

  it('отрезок между клетками не имеет дыр в любом направлении', () => {
    for (const [a, b] of [
      [{ x: 0, y: 0 }, { x: 7, y: 3 }],
      [{ x: 7, y: 3 }, { x: 0, y: 0 }],
      [{ x: 2, y: 5 }, { x: 2, y: 0 }],
      [{ x: 1, y: 1 }, { x: 1, y: 1 }],
    ] as const) {
      const cells = lineCells(a, b);
      expect(cells[0]).toEqual(a);
      expect(cells[cells.length - 1]).toEqual(b);
      cells.slice(1).forEach((cell, i) => {
        const prev = cells[i];
        expect(Math.max(Math.abs(cell.x - (prev?.x ?? 0)), Math.abs(cell.y - (prev?.y ?? 0)))).toBe(1);
      });
    }
  });

  it('заполненный прямоугольник: углы в любом порядке, часть вне карты обрезается', () => {
    const doc = freshDoc();
    const rect = rectFromCorners({ x: 4, y: 1 }, { x: 2, y: 2 });
    expect(rect).toEqual({ x: 2, y: 1, w: 3, h: 2 });
    const filled = fillRect(doc, rect, '#');
    expect(filled.rows[1]).toBe('..###........');
    expect(filled.rows[2]).toBe('..###........');
    const clipped = fillRect(doc, { x: 11, y: 4, w: 5, h: 5 }, '#');
    expect(clipped.rows[4]).toBe('...........##');
    expect(clipped.rows).toHaveLength(6);
  });

  it('заливка закрашивает только связную область и не выходит за стены', () => {
    let doc = freshDoc();
    doc = fillRect(doc, { x: 5, y: 0, w: 1, h: 5 }, '#'); // стена делит поле
    const filled = floodFill(doc, 0, 0, '#');
    expect(filled.rows[0]).toBe('#####'.padEnd(5, '#') + '#' + '.'.repeat(7));
    expect(filled.rows[0]?.slice(6)).toBe('.......');
    expect(floodFill(doc, 0, 0, '.')).toBe(doc);
    expect(floodFill(doc, 99, 0, '#')).toBe(doc);
  });

  it('копирование и вставка: прозрачная вставка не затирает существующее пустыми клетками', () => {
    let doc = freshDoc();
    doc = fillRect(doc, { x: 1, y: 3, w: 2, h: 1 }, '#');
    const clip = copyRegion(doc, { x: 0, y: 3, w: 4, h: 1 });
    expect(clip).toEqual({ w: 4, h: 1, rows: ['.##.'] });
    if (!clip) return;
    const base = fillRect(doc, { x: 8, y: 3, w: 4, h: 1 }, '#');
    expect(pasteClip(base, clip, 8, 3).rows[3]).toBe('.##.....' + '.##.' + '.');
    expect(pasteClip(base, clip, 8, 3, true).rows[3]).toBe('.##.....' + '####' + '.');
  });

  it('перенос выделенного участка — одна операция: источник очищается, приёмник заполняется', () => {
    let doc = freshDoc();
    doc = fillRect(doc, { x: 1, y: 3, w: 2, h: 1 }, '#');
    const moved = moveRegion(doc, { x: 1, y: 3, w: 2, h: 1 }, 5, -1);
    expect(moved.rows[3]).toBe('.'.repeat(13));
    expect(moved.rows[2]).toBe('......##.....');
    expect(clearRect(moved, { x: 6, y: 2, w: 2, h: 1 }).rows[2]).toBe('.'.repeat(13));
  });

  it('размер карты: расширение добавляет пустые клетки, сужение показывает потери заранее', () => {
    let doc = freshDoc();
    doc = fillRect(doc, { x: 11, y: 4, w: 2, h: 1 }, '#');
    doc = addObject(doc, { type: 'hazard', x: 12, y: 3 }).doc;
    doc = addMark(doc, { x: 10, y: 0, w: 3, h: 2 }, 'unknown')?.doc ?? doc;
    doc = { ...doc, start: { x: 12, y: 4 } };

    const plan = planResize(doc, 11, 6);
    expect(plan.lossy).toBe(true);
    expect(plan.cutCells.map((c) => `${c.x},${c.y}`)).toContain('11,4');
    expect(plan.cutCells.map((c) => `${c.x},${c.y}`)).toContain('12,5');
    expect(plan.cutObjects).toEqual(['hazard-1']);
    expect(plan.clippedMarks).toEqual(['mark-1']);
    expect(plan.startCut).toBe(true);

    const smaller = resizeDoc(doc, 11, 6);
    expect(smaller.width).toBe(11);
    expect(smaller.rows.every((r) => r.length === 11)).toBe(true);
    expect(smaller.objects).toEqual([]);
    expect(smaller.start).toBeNull();
    expect(smaller.marks[0]).toMatchObject({ x: 10, w: 1, h: 2 });
    // Исходный документ не тронут: отмена возможна.
    expect(doc.width).toBe(13);

    const wider = resizeDoc(doc, 20, 8);
    expect([wider.width, wider.height, wider.rows.length]).toEqual([20, 8, 8]);
    expect(wider.rows[7]).toBe('.'.repeat(20));
    expect(wider.rows[5]?.startsWith('#'.repeat(13))).toBe(true);
    expect(planResize(doc, 20, 8).lossy).toBe(false);
    expect(() => resizeDoc(doc, 0, 5)).toThrow(RangeError);
    expect(() => resizeDoc(doc, 300, 5)).toThrow(RangeError);
  });

  it('границы карты', () => {
    const doc = freshDoc();
    expect(inBounds(doc, 12, 5)).toBe(true);
    expect(inBounds(doc, 13, 5)).toBe(false);
    expect(inBounds(doc, 1.5, 1)).toBe(false);
  });
});
