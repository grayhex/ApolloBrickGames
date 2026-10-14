import { describe, expect, it } from 'vitest';
import { docToJson } from '../../src/editor/project';
import { MemoryDraftStore, type DraftRecord } from '../../src/editor/drafts';
import { loadUserLevels, readUserLevel, type LibraryTarget } from '../../src/editor/library';
import type { EditorDoc } from '../../src/editor/types';
import { demoRoomDoc, env, freshDoc, pack } from './helpers';

const target: LibraryTarget = { packName: 'room', pack, env };

function record(doc: EditorDoc, savedAt: number): DraftRecord {
  return { meta: { projectId: doc.projectId, name: doc.name, levelId: doc.id, width: doc.width, height: doc.height, savedAt }, doc: docToJson(doc) };
}

async function storeWith(...entries: [EditorDoc, number][]): Promise<MemoryDraftStore> {
  const store = new MemoryDraftStore();
  for (const [doc, at] of entries) await store.save({ record: record(doc, at), images: new Map(), keep: [] });
  return store;
}

describe('карты редактора на странице игры', () => {
  it('корректная карта запускается: уровень готов, причины нет', async () => {
    const store = await storeWith([freshDoc(), 10]);
    const [level] = await loadUserLevels(store, target);
    expect(level).toMatchObject({ projectId: 'p1', name: 'Тест', levelId: 'test-room', width: 13, height: 6, problem: null });
    expect(level?.level?.id).toBe('test-room');
    expect(level?.level?.rows).toEqual(freshDoc().rows);
  });

  it('новые сверху; пустое хранилище — пустой список', async () => {
    expect(await loadUserLevels(new MemoryDraftStore(), target)).toEqual([]);
    const store = await storeWith([freshDoc(), 10], [demoRoomDoc(), 20]);
    expect((await loadUserLevels(store, target)).map((l) => l.projectId)).toEqual(['p2', 'p1']);
  });

  it('карта без старта не запускается, причина названа', async () => {
    const store = await storeWith([{ ...freshDoc(), start: null }, 10]);
    const [level] = await loadUserLevels(store, target);
    expect(level?.level).toBeNull();
    expect(level?.problem).toMatch(/старт/);
  });

  it('карта с переходом на другой уровень не запускается: в игре она одна', async () => {
    const doc: EditorDoc = {
      ...freshDoc(),
      objects: [{ id: 'exit', type: 'finish', x: 5, y: 4, w: 1, h: 1, asset: null, params: {} }],
      transitions: [{ from: 'exit', to: 'другой-уровень' }],
    };
    const [level] = await loadUserLevels(await storeWith([doc, 10]), target);
    expect(level?.problem).toMatch(/доступна только эта карта|переход/);
    expect(level?.level).toBeNull();
  });

  it('карта для другого пакета открывается только в редакторе', async () => {
    const store = await storeWith([{ ...freshDoc(), pack: 'demo' }, 10]);
    const [level] = await loadUserLevels(store, target);
    expect(level?.problem).toMatch(/«demo»/);
    expect(level?.level).toBeNull();
  });

  it('повреждённый черновик не ломает список: остальные карты на месте', async () => {
    const store = await storeWith([freshDoc(), 10], [demoRoomDoc(), 20]);
    store.records.get('p2')!.doc = { мусор: true };
    const levels = await loadUserLevels(store, target);
    expect(levels).toHaveLength(2);
    expect(levels[0]).toMatchObject({ projectId: 'p2', level: null });
    expect(levels[0]?.problem).toBeTruthy();
    expect(levels[1]).toMatchObject({ projectId: 'p1', problem: null });
  });

  it('метаданные есть, а документа нет — причина названа', async () => {
    const store = await storeWith([freshDoc(), 10]);
    const meta = (await store.list())[0]!;
    store.records.delete('p1');
    expect((await readUserLevel(store, meta, target)).problem).toMatch(/не найден/);
  });
});
