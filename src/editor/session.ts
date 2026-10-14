import { buildArchive, readArchive, type StoredImage, ARCHIVE_LIMITS } from './archive';
import type { DraftMeta, DraftStore } from './drafts';
import { gameLevelJson } from './diagnose';
import { imageProblem, sniffImage } from './images';
import { addRef, uniqueId } from './ops';
import { docFromGameJson, docToJson, ImportError, parseDoc, type ImportTarget } from './project';
import type { EditorStore } from './store';
import type { EditorDoc, ReferenceImage } from './types';

export const MAX_REFS = 20;

export type SaveState =
  | { kind: 'saved'; at: number }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

/** Сохранить текущий проект не удалось: переключение на другой проект отменено, чтобы не потерять правки. */
export class SaveFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFailedError';
  }
}

/** Декодирование изображений для рисования; ошибка декодирования — исключение. */
export interface PhotoDecoder {
  has(id: string): boolean;
  ensure(id: string, image: StoredImage): Promise<void>;
  drop(id: string): void;
  clear(): void;
}

export interface SessionOptions {
  now?: () => number;
  newId?: () => string;
  /** Задержка автосохранения, мс. */
  debounceMs?: number;
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export function describeStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') {
    return 'Хранилище браузера переполнено: черновик не сохранён. Скачайте архив проекта («Экспорт проекта») и освободите место.';
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return 'Браузер не разрешает локальное хранилище (приватный режим или запрет сайта): черновик не сохранён. Скачайте архив проекта.';
  }
  return `Не удалось сохранить черновик: ${error instanceof Error ? error.message : String(error)}. Скачайте архив проекта.`;
}

/**
 * Проект в работе: автосохранение в IndexedDB (карта и изображения), открытие, дублирование, импорт и экспорт.
 * Неудачная операция никогда не заменяет и не стирает текущий документ.
 */
export class EditorSession {
  readonly store: EditorStore;
  /** Байты референсов текущего проекта (отдельно от документа и истории). */
  images = new Map<string, StoredImage>();
  state: SaveState = { kind: 'saved', at: 0 };
  onState: (state: SaveState) => void = () => {};
  private readonly drafts: DraftStore;
  private readonly photos: PhotoDecoder;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly debounceMs: number;
  private readonly schedule: (callback: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private savedImages = new Set<string>();
  private savedRevision: number;
  private timer: unknown = null;
  private saving: Promise<void> | null = null;

  constructor(store: EditorStore, drafts: DraftStore, photos: PhotoDecoder, options: SessionOptions = {}) {
    this.store = store;
    this.drafts = drafts;
    this.photos = photos;
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.debounceMs = options.debounceMs ?? 700;
    this.schedule = options.schedule ?? ((cb, ms) => setTimeout(cb, ms));
    this.cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.savedRevision = store.revision;
    store.subscribe(() => {
      if (store.revision !== this.savedRevision) this.markDirty();
      this.decodeMissing();
    });
  }

  get dirty(): boolean {
    return this.store.revision !== this.savedRevision;
  }

  newProjectId(): string {
    return this.newId();
  }

  private setState(state: SaveState): void {
    this.state = state;
    this.onState(state);
  }

  private markDirty(): void {
    if (this.state.kind !== 'dirty' && this.state.kind !== 'saving') this.setState({ kind: 'dirty' });
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /**
   * Сохранить сейчас (вызывается автоматически после паузы в правках и при закрытии вкладки).
   * true — всё сохранено (или сохранять нечего); false — хранилище отказало, документ остаётся только в памяти.
   */
  async flush(): Promise<boolean> {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    if (this.saving) await this.saving;
    if (!this.dirty) return true;
    this.saving = this.save().finally(() => {
      this.saving = null;
    });
    await this.saving;
    return this.state.kind !== 'error';
  }

  /** Фото, которых нет в кэше декодированных (например, референс вернули отменой удаления), декодируются заново. */
  private decodeMissing(): void {
    for (const ref of this.store.doc.refs) {
      const image = this.images.get(ref.id);
      if (image && !this.photos.has(ref.id)) void this.photos.ensure(ref.id, image).catch(() => {});
    }
  }

  private async save(): Promise<void> {
    const { doc } = this.store;
    const revision = this.store.revision;
    // Изображения хранилища удаляются только у референсов, которых больше нет в документе;
    // неполный набор байтов в памяти никогда не стирает сохранённое.
    const keep = doc.refs.map((r) => r.id);
    const toPut = new Map<string, StoredImage>();
    for (const id of keep) {
      const image = this.images.get(id);
      if (image && !this.savedImages.has(id)) toPut.set(id, image);
    }
    const at = this.now();
    this.setState({ kind: 'saving' });
    try {
      await this.drafts.save({
        record: { meta: { projectId: doc.projectId, name: doc.name, levelId: doc.id, width: doc.width, height: doc.height, savedAt: at }, doc: docToJson(doc) },
        images: toPut,
        keep,
      });
    } catch (error) {
      this.setState({ kind: 'error', message: describeStorageError(error) });
      return;
    }
    this.savedImages = new Set(keep.filter((id) => this.images.has(id) || this.savedImages.has(id)));
    this.savedRevision = revision;
    if (this.store.revision !== revision) this.markDirty();
    else this.setState({ kind: 'saved', at });
  }

  // ── Проекты ──────────────────────────────────────────────────────────────

  async list(): Promise<DraftMeta[]> {
    return this.drafts.list();
  }

  /** Открыть документ (после сохранения предыдущего). Историю и выделение новый документ не наследует. */
  async openDoc(doc: EditorDoc, images: Map<string, StoredImage>, options: { alreadySaved?: boolean } = {}): Promise<void> {
    // Если текущий проект сохранить не удалось, он остаётся открытым: переключение отменяется до любых изменений.
    if (!(await this.flush())) {
      throw new SaveFailedError(
        this.state.kind === 'error' ? this.state.message : 'Текущий проект не удалось сохранить.',
      );
    }
    this.photos.clear();
    this.images = new Map(images);
    this.savedImages = options.alreadySaved ? new Set(images.keys()) : new Set();
    this.store.load(doc);
    if (options.alreadySaved) {
      this.savedRevision = this.store.revision;
      this.setState({ kind: 'saved', at: this.now() });
    } else {
      this.savedRevision = -1;
      await this.flush();
    }
    await this.decodeAll();
  }

  /** Фото, которые не удалось декодировать, остаются в проекте (их можно выгрузить в архив), но на карте не рисуются. */
  async decodeAll(): Promise<string[]> {
    const failed: string[] = [];
    for (const ref of this.store.doc.refs) {
      const image = this.images.get(ref.id);
      if (!image) {
        failed.push(`${ref.name}: нет данных изображения`);
        continue;
      }
      try {
        await this.photos.ensure(ref.id, image);
      } catch {
        failed.push(`${ref.name}: изображение не удалось декодировать`);
      }
    }
    return failed;
  }

  async openDraft(projectId: string): Promise<void> {
    const loaded = await this.drafts.load(projectId);
    if (!loaded) throw new ImportError('format', 'Черновик не найден в хранилище.');
    const doc = parseDoc(loaded.record.doc, 'черновик');
    await this.openDoc(doc, loaded.images, { alreadySaved: true });
  }

  async removeDraft(projectId: string): Promise<void> {
    await this.drafts.remove(projectId);
  }

  /** Копия проекта с новым идентификатором проекта и уровня; изображения копируются. */
  async duplicate(): Promise<void> {
    const { doc } = this.store;
    const copy: EditorDoc = { ...doc, projectId: this.newId(), name: `${doc.name} (копия)`, id: `${doc.id}-copy`.slice(0, 64) };
    await this.openDoc(copy, new Map(this.images));
  }

  // ── Референсы ────────────────────────────────────────────────────────────

  /** Добавить фото из файла. Ошибка — сообщение; документ и карта остаются прежними. */
  async addPhoto(bytes: Uint8Array, fileName: string): Promise<{ ok: true; ref: ReferenceImage } | { ok: false; message: string }> {
    const { doc } = this.store;
    if (doc.refs.length >= MAX_REFS) return { ok: false, message: `Слишком много референсов (предел ${MAX_REFS}).` };
    const info = sniffImage(bytes);
    const problem = imageProblem(info, bytes.length);
    if (problem || !info) return { ok: false, message: problem ?? 'Не удалось распознать изображение.' };
    let total = bytes.length;
    for (const image of this.images.values()) total += image.bytes.length;
    if (total > ARCHIVE_LIMITS.maxTotalBytes) {
      return { ok: false, message: 'Суммарный размер фотографий проекта превысит предел архива (128 МБ). Удалите ненужные кадры или уменьшите файлы.' };
    }
    const id = uniqueId('ref', doc.refs.map((r) => r.id));
    const stored: StoredImage = { mime: info.mime, bytes };
    try {
      await this.photos.ensure(id, stored);
    } catch {
      this.photos.drop(id);
      return { ok: false, message: 'Браузер не смог декодировать изображение: файл повреждён или формат не поддерживается.' };
    }
    this.images.set(id, stored);
    const previous = doc.refs[doc.refs.length - 1];
    const ref: ReferenceImage = {
      id,
      name: fileName.replace(/\.[^.]+$/, '').slice(0, 120) || `Кадр ${doc.refs.length + 1}`,
      description: '',
      videoTime: '',
      mime: info.mime,
      width: info.width,
      height: info.height,
      quad: null,
      origin: previous ? { ...previous.origin } : { x: 0, y: 0 },
      opacity: 0.6,
      visible: true,
      locked: false,
    };
    this.store.commit((d) => addRef(d, ref));
    this.store.patchUi({ activeRef: id });
    this.store.select({ kind: 'ref', id });
    return { ok: true, ref };
  }

  /** Референс удалён из документа: байты остаются, пока проект открыт (undo вернёт референс), а в хранилище не сохраняются. */
  forget(id: string): void {
    this.photos.drop(id);
  }

  // ── Импорт и экспорт ─────────────────────────────────────────────────────

  /**
   * Разбор файла: ZIP-архив проекта или игровой JSON уровня. Ничего не применяет — результат
   * применяет вызывающий (openDoc), поэтому ошибка не затрагивает рабочий документ.
   */
  async parseImport(bytes: Uint8Array, fileName: string): Promise<{ doc: EditorDoc; images: Map<string, StoredImage>; kind: 'project' | 'level' }> {
    const target: ImportTarget = { projectId: this.newId(), name: fileName.replace(/\.[^.]+$/, '').slice(0, 120) || 'Импорт', pack: this.store.doc.pack };
    const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    if (isZip) {
      const { doc, images } = await readArchive(bytes);
      return { doc: { ...doc, projectId: target.projectId }, images, kind: 'project' };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new ImportError('format', 'Файл не является ни ZIP-архивом проекта, ни корректным JSON уровня.');
    }
    if (typeof raw === 'object' && raw !== null && (raw as { format?: unknown }).format === 'crocodile-mario-editor-project') {
      throw new ImportError('format', 'Это JSON проекта без изображений. Откройте архив проекта (.zip) или игровой JSON уровня.');
    }
    return { doc: docFromGameJson(raw, { ...target, name: target.name }), images: new Map(), kind: 'level' };
  }

  exportArchive(): Uint8Array {
    return buildArchive(this.store.doc, this.images, new Date(this.now()).toISOString());
  }

  exportGameJson(): string {
    return `${JSON.stringify(gameLevelJson(this.store.doc), null, 2)}\n`;
  }
}
