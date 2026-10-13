import { describe, expect, it } from 'vitest';
import { MemoryDraftStore } from '../../src/editor/drafts';
import { ImportError, parseDoc } from '../../src/editor/project';
import { EditorSession, MAX_REFS, type PhotoDecoder } from '../../src/editor/session';
import { EditorStore } from '../../src/editor/store';
import { fillRect } from '../../src/editor/grid';
import { freshDoc, pngHeader } from './helpers';

class FakeDecoder implements PhotoDecoder {
  decoded = new Set<string>();
  failNext = false;
  async ensure(id: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('decode');
    }
    this.decoded.add(id);
  }
  drop(id: string): void {
    this.decoded.delete(id);
  }
  clear(): void {
    this.decoded.clear();
  }
}

function make() {
  const store = new EditorStore(freshDoc());
  const drafts = new MemoryDraftStore();
  const decoder = new FakeDecoder();
  let clock = 1000;
  let counter = 0;
  const timers: (() => void)[] = [];
  const session = new EditorSession(store, drafts, decoder, {
    now: () => ++clock,
    newId: () => `id-${++counter}`,
    schedule: (cb) => timers.push(cb),
    cancel: () => {},
  });
  return { store, drafts, decoder, session, timers };
}

function png(width: number, height: number): Uint8Array {
  const head = pngHeader(width, height);
  const out = new Uint8Array(head.length + 50);
  out.set(head);
  return out;
}

describe('сеанс редактора: автосохранение и проекты', () => {
  it('правка → состояние «не сохранено» → после паузы черновик в хранилище → «сохранено» со временем', async () => {
    const { store, drafts, session } = make();
    const states: string[] = [];
    session.onState = (s) => states.push(s.kind);
    store.commit((d) => fillRect(d, { x: 2, y: 2, w: 3, h: 1 }, '#'));
    expect(session.state.kind).toBe('dirty');
    await session.flush();
    expect(session.state).toMatchObject({ kind: 'saved' });
    expect(states).toEqual(['dirty', 'saving', 'saved']);
    const loaded = await drafts.load('p1');
    expect(parseDoc(loaded?.record.doc).rows[2]).toBe('..###........');
    expect(session.dirty).toBe(false);
  });

  it('черновик восстанавливается после «перезагрузки»: новый сеанс открывает сохранённое', async () => {
    const a = make();
    a.store.commit((d) => fillRect(d, { x: 0, y: 0, w: 2, h: 2 }, '#'));
    await a.session.flush();
    const store = new EditorStore(freshDoc());
    const decoder = new FakeDecoder();
    const reopened = new EditorSession(store, a.drafts, decoder);
    const [latest] = await reopened.list();
    expect(latest?.projectId).toBe('p1');
    await reopened.openDraft('p1');
    expect(store.doc.rows[0]).toBe('##...........');
    expect(store.canUndo).toBe(false);
  });

  it('ошибка хранилища показывается и не стирает документ; следующая попытка сохраняет', async () => {
    const { store, drafts, session } = make();
    store.commit((d) => fillRect(d, { x: 1, y: 1, w: 1, h: 1 }, '#'));
    const quota = new Error('quota');
    quota.name = 'QuotaExceededError';
    drafts.failWith = quota;
    await session.flush();
    expect(session.state).toMatchObject({ kind: 'error' });
    expect((session.state as { message: string }).message).toMatch(/переполнено.*архив/);
    expect(store.doc.rows[1]?.[1]).toBe('#');
    expect(session.dirty).toBe(true);
    drafts.failWith = null;
    await session.flush();
    expect(session.state.kind).toBe('saved');
  });

  it('правка во время сохранения не теряется: после него запланировано новое сохранение', async () => {
    const { store, session, timers } = make();
    store.commit((d) => fillRect(d, { x: 1, y: 1, w: 1, h: 1 }, '#'));
    const saving = session.flush();
    store.commit((d) => fillRect(d, { x: 2, y: 1, w: 1, h: 1 }, '#'));
    await saving;
    expect(session.dirty).toBe(true);
    expect(timers.length).toBeGreaterThan(0);
    await session.flush();
    expect(session.dirty).toBe(false);
  });

  it('новый проект и дубликат получают свои идентификаторы; текущий проект сохраняется перед переключением', async () => {
    const { store, drafts, session } = make();
    store.commit((d) => fillRect(d, { x: 3, y: 3, w: 1, h: 1 }, '#'));
    await session.duplicate();
    expect(store.doc.projectId).toBe('id-1');
    expect(store.doc.name).toBe('Тест (копия)');
    expect(store.doc.id).toBe('test-room-copy');
    expect(store.canUndo).toBe(false);
    const ids = (await drafts.list()).map((m) => m.projectId).sort();
    expect(ids).toEqual(['id-1', 'p1']);
    const original = await drafts.load('p1');
    expect(parseDoc(original?.record.doc).rows[3]).toBe('...#.........');
  });
});

describe('референсы: добавление и проверки', () => {
  it('фото добавляется как ссылка в документе и байты рядом; попадает в хранилище вместе с проектом', async () => {
    const { store, drafts, decoder, session } = make();
    const result = await session.addPhoto(png(640, 360), 'кадр-1.png');
    expect(result.ok).toBe(true);
    expect(store.doc.refs[0]).toMatchObject({ id: 'ref-1', name: 'кадр-1', width: 640, height: 360, quad: null, mime: 'image/png' });
    expect(store.ui.activeRef).toBe('ref-1');
    expect(decoder.decoded.has('ref-1')).toBe(true);
    await session.flush();
    expect(await drafts.storedImages('p1')).toEqual(new Set(['ref-1']));
  });

  it('нераспознанный, огромный и нерасшифровываемый файлы отвергаются без потери карты', async () => {
    const { store, decoder, session } = make();
    const before = store.doc;
    expect((await session.addPhoto(new TextEncoder().encode('не картинка'), 'a.png')).ok).toBe(false);
    const huge = await session.addPhoto(png(9000, 100), 'huge.png');
    expect(huge).toMatchObject({ ok: false });
    decoder.failNext = true;
    const broken = await session.addPhoto(png(100, 100), 'broken.png');
    expect(broken).toMatchObject({ ok: false });
    expect(store.doc).toBe(before);
    expect(session.images.size).toBe(0);
  });

  it(`не больше ${MAX_REFS} референсов`, async () => {
    const { session } = make();
    for (let i = 0; i < MAX_REFS; i++) expect((await session.addPhoto(png(100, 100), `f${i}.png`)).ok).toBe(true);
    expect((await session.addPhoto(png(100, 100), 'extra.png')).ok).toBe(false);
  });
});

describe('импорт: неразрушающий', () => {
  it('игровой JSON уровня импортируется в новый проект; рабочий документ не меняется', async () => {
    const { store, session } = make();
    const before = store.doc;
    const text = session.exportGameJson();
    const parsed = await session.parseImport(new TextEncoder().encode(text), 'level.json');
    expect(parsed.kind).toBe('level');
    expect(parsed.doc.rows).toEqual(before.rows);
    expect(parsed.doc.projectId).not.toBe(before.projectId);
    expect(store.doc).toBe(before);
  });

  it('архив проекта: экспорт → импорт в сеанс с чистым хранилищем восстанавливает карту и фото', async () => {
    const a = make();
    await a.session.addPhoto(png(640, 360), 'кадр.png');
    a.store.commit((d) => fillRect(d, { x: 5, y: 2, w: 2, h: 2 }, '#'));
    const zip = a.session.exportArchive();

    const b = make();
    const parsed = await b.session.parseImport(zip, 'проект.zip');
    expect(parsed.kind).toBe('project');
    await b.session.openDoc(parsed.doc, parsed.images);
    expect(b.store.doc.rows).toEqual(a.store.doc.rows);
    expect(b.store.doc.refs).toEqual(a.store.doc.refs);
    expect([...b.session.images.keys()]).toEqual(['ref-1']);
    expect(await b.drafts.storedImages(b.store.doc.projectId)).toEqual(new Set(['ref-1']));
  });

  it('повреждённые и чужие файлы не заменяют рабочий документ и объясняют причину', async () => {
    const { store, session } = make();
    const before = store.doc;
    await expect(session.parseImport(new TextEncoder().encode('{не json'), 'x.json')).rejects.toThrow(ImportError);
    await expect(session.parseImport(new TextEncoder().encode(JSON.stringify({ format: 'crocodile-mario-editor-project' })), 'p.json')).rejects.toThrow(/без изображений/);
    await expect(session.parseImport(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'x.zip')).rejects.toThrow();
    await expect(session.parseImport(new TextEncoder().encode(JSON.stringify({ schemaVersion: 9 })), 'x.json')).rejects.toThrow(/версия схемы уровня 9/);
    expect(store.doc).toBe(before);
  });
});
