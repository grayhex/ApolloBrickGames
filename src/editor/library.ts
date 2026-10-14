import type { ContentPack, LevelDef } from '../content/schema';
import { ContentError } from '../content/validate';
import { diagnoseForTest, errorsOf, levelFromDoc, type DiagnoseEnv } from './diagnose';
import type { DraftMeta, DraftStore } from './drafts';
import { parseDoc } from './project';

/** Карта из редактора, как её видит страница игры. */
export interface UserLevel {
  projectId: string;
  /** Название проекта для людей. */
  name: string;
  levelId: string;
  width: number;
  height: number;
  savedAt: number;
  /** null — карту можно запускать; иначе причина, почему нельзя. */
  problem: string | null;
  /** Уровень общего формата; есть, только когда `problem === null`. */
  level: LevelDef | null;
}

/** Пакет, в котором игра запускает карты: профиль экрана и ресурсы совпадают с картами, нарисованными для него. */
export interface LibraryTarget {
  /** Каталог пакета в public/content (`room`). */
  packName: string;
  pack: ContentPack;
  env: DiagnoseEnv;
}

function describe(error: unknown): string {
  if (error instanceof ContentError) return error.issues[0] ?? error.message;
  return error instanceof Error ? error.message : String(error);
}

function shorten(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Проверка одной карты: можно ли запустить её в игре как есть. Ничего не исправляется молча. */
export async function readUserLevel(store: DraftStore, meta: DraftMeta, target: LibraryTarget): Promise<UserLevel> {
  const base = { projectId: meta.projectId, name: meta.name, levelId: meta.levelId, width: meta.width, height: meta.height, savedAt: meta.savedAt };
  try {
    const record = await store.loadRecord(meta.projectId);
    if (!record) return { ...base, problem: 'черновик не найден в хранилище', level: null };
    const doc = parseDoc(record.doc, 'черновик');
    if (doc.pack !== target.packName) {
      return { ...base, problem: `карта нарисована для пакета «${doc.pack}»; в игре запускаются только карты пакета «${target.packName}» — тестируйте её в редакторе`, level: null };
    }
    const errors = errorsOf(diagnoseForTest(doc, target.env));
    const first = errors[0];
    if (first) return { ...base, problem: shorten(`${first.path}: ${first.message}${errors.length > 1 ? ` (и ещё ошибок: ${errors.length - 1})` : ''}`), level: null };
    return { ...base, level: levelFromDoc(doc), problem: null };
  } catch (error) {
    return { ...base, problem: shorten(describe(error)), level: null };
  }
}

/** Все карты редактора, новые сверху. Сломанные остаются в списке с причиной — игрок видит, что именно не открывается. */
export async function loadUserLevels(store: DraftStore, target: LibraryTarget): Promise<UserLevel[]> {
  const metas = await store.list();
  return Promise.all(metas.map((meta) => readUserLevel(store, meta, target)));
}
