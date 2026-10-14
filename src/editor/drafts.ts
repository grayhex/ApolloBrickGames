import type { StoredImage } from './archive';

/** Краткие сведения о черновике (для списка «Открыть»). */
export interface DraftMeta {
  projectId: string;
  name: string;
  levelId: string;
  width: number;
  height: number;
  savedAt: number;
}

export interface DraftRecord {
  meta: DraftMeta;
  /** JSON документа (docToJson). */
  doc: unknown;
}

export interface SaveRequest {
  record: DraftRecord;
  /** Изображения, которых ещё нет в хранилище. */
  images: Map<string, StoredImage>;
  /** Идентификаторы референсов, которые должны остаться; остальные изображения проекта удаляются. */
  keep: readonly string[];
}

export interface DraftStore {
  list(): Promise<DraftMeta[]>;
  load(projectId: string): Promise<{ record: DraftRecord; images: Map<string, StoredImage> } | null>;
  /** Только документ, без байтов фотографий: для списков и запуска карт в игре. */
  loadRecord(projectId: string): Promise<DraftRecord | null>;
  save(request: SaveRequest): Promise<void>;
  /** Идентификаторы референсов проекта, чьи изображения уже сохранены. */
  storedImages(projectId: string): Promise<Set<string>>;
  remove(projectId: string): Promise<void>;
}

/** Хранилище в памяти: для тестов и как запасной вариант без IndexedDB (черновики живут до перезагрузки). */
export class MemoryDraftStore implements DraftStore {
  readonly records = new Map<string, DraftRecord>();
  readonly images = new Map<string, Map<string, StoredImage>>();
  /** Подставить ошибку записи (например, переполнение квоты). */
  failWith: Error | null = null;

  async list(): Promise<DraftMeta[]> {
    return [...this.records.values()].map((r) => r.meta).sort((a, b) => b.savedAt - a.savedAt);
  }

  async load(projectId: string): Promise<{ record: DraftRecord; images: Map<string, StoredImage> } | null> {
    const record = this.records.get(projectId);
    if (!record) return null;
    return { record: structuredClone(record), images: new Map(this.images.get(projectId) ?? []) };
  }

  async loadRecord(projectId: string): Promise<DraftRecord | null> {
    const record = this.records.get(projectId);
    return record ? structuredClone(record) : null;
  }

  async save({ record, images, keep }: SaveRequest): Promise<void> {
    if (this.failWith) throw this.failWith;
    const stored = this.images.get(record.meta.projectId) ?? new Map<string, StoredImage>();
    for (const [id, image] of images) stored.set(id, image);
    for (const id of [...stored.keys()]) if (!keep.includes(id)) stored.delete(id);
    this.images.set(record.meta.projectId, stored);
    this.records.set(record.meta.projectId, structuredClone(record));
  }

  async storedImages(projectId: string): Promise<Set<string>> {
    return new Set(this.images.get(projectId)?.keys() ?? []);
  }

  async remove(projectId: string): Promise<void> {
    this.records.delete(projectId);
    this.images.delete(projectId);
  }
}

const DB_NAME = 'crocodile-mario-editor';
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Ошибка IndexedDB'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Ошибка IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('Транзакция IndexedDB прервана'));
  });
}

interface ImageRow {
  key: string;
  projectId: string;
  refId: string;
  mime: StoredImage['mime'];
  bytes: ArrayBuffer;
}

/** Черновики в IndexedDB: документ и изображения в разных хранилищах, чтобы автосохранение не переписывало мегабайты фото. */
export async function openIndexedDbStore(factory: IDBFactory = indexedDB): Promise<DraftStore> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const created = open.result;
      created.createObjectStore('projects', { keyPath: 'meta.projectId' });
      const images = created.createObjectStore('images', { keyPath: 'key' });
      images.createIndex('byProject', 'projectId');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Не удалось открыть IndexedDB'));
    open.onblocked = () => reject(new Error('IndexedDB заблокирована другой вкладкой'));
  });

  const imageRows = async (projectId: string): Promise<ImageRow[]> => {
    const tx = db.transaction('images', 'readonly');
    return request(tx.objectStore('images').index('byProject').getAll(projectId) as IDBRequest<ImageRow[]>);
  };

  return {
    async list() {
      const tx = db.transaction('projects', 'readonly');
      const all = await request(tx.objectStore('projects').getAll() as IDBRequest<DraftRecord[]>);
      return all.map((r) => r.meta).sort((a, b) => b.savedAt - a.savedAt);
    },
    async load(projectId) {
      const tx = db.transaction('projects', 'readonly');
      const record = (await request(tx.objectStore('projects').get(projectId))) as DraftRecord | undefined;
      if (!record) return null;
      const images = new Map<string, StoredImage>();
      for (const row of await imageRows(projectId)) images.set(row.refId, { mime: row.mime, bytes: new Uint8Array(row.bytes) });
      return { record, images };
    },
    async loadRecord(projectId) {
      const tx = db.transaction('projects', 'readonly');
      return ((await request(tx.objectStore('projects').get(projectId))) as DraftRecord | undefined) ?? null;
    },
    async save({ record, images, keep }) {
      const tx = db.transaction(['projects', 'images'], 'readwrite');
      const store = tx.objectStore('images');
      for (const [refId, image] of images) {
        const row: ImageRow = {
          key: `${record.meta.projectId}/${refId}`,
          projectId: record.meta.projectId,
          refId,
          mime: image.mime,
          bytes: image.bytes.slice().buffer as ArrayBuffer,
        };
        store.put(row);
      }
      const existing = await request(store.index('byProject').getAllKeys(record.meta.projectId));
      for (const key of existing) {
        const refId = String(key).slice(record.meta.projectId.length + 1);
        if (!keep.includes(refId)) store.delete(key);
      }
      tx.objectStore('projects').put(record);
      await done(tx);
    },
    async storedImages(projectId) {
      return new Set((await imageRows(projectId)).map((row) => row.refId));
    },
    async remove(projectId) {
      const tx = db.transaction(['projects', 'images'], 'readwrite');
      tx.objectStore('projects').delete(projectId);
      const store = tx.objectStore('images');
      const keys = await request(store.index('byProject').getAllKeys(projectId));
      for (const key of keys) store.delete(key);
      await done(tx);
    },
  };
}
