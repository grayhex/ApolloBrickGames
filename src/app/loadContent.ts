import type { ContentPack, ValidationEnv } from '../content/schema';
import { assemblePack, ContentError } from '../content/validate';

export type FetchJson = (url: string) => Promise<unknown>;

/** Не удалось получить или разобрать файл (сеть, 404, не JSON). */
export class ContentLoadError extends Error {
  readonly url: string;

  constructor(url: string, reason: string) {
    super(`Не удалось загрузить «${url}»: ${reason}`);
    this.name = 'ContentLoadError';
    this.url = url;
  }
}

export const fetchJson: FetchJson = async (url) => {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new ContentLoadError(url, error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) throw new ContentLoadError(url, `HTTP ${response.status}`);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ContentLoadError(url, 'файл не является корректным JSON');
  }
};

export interface LoadedContent {
  pack: ContentPack;
  /** Адрес каталога ресурсов — от него считаются пути к картинкам. */
  assetsUrl: string;
}

/**
 * Загружает статические JSON-файлы пакета и проверяет их целиком.
 * Любая ошибка — исключение (ContentLoadError или ContentError): частично сломанной сцены не бывает.
 */
export async function loadContentPack(
  manifestUrl: string,
  env: ValidationEnv,
  load: FetchJson = fetchJson,
): Promise<LoadedContent> {
  const manifest = await load(manifestUrl);
  const files = manifest as { screen?: unknown; rules?: unknown; assets?: unknown; levels?: unknown };
  const resolve = (path: unknown, field: string): string => {
    if (typeof path !== 'string' || path === '') {
      throw new ContentError('manifest', [`$.${field}: ожидался путь к файлу`]);
    }
    return new URL(path, manifestUrl).href;
  };
  const levelPaths = Array.isArray(files.levels) ? (files.levels as unknown[]) : [];
  if (levelPaths.length === 0) throw new ContentError('manifest', ['$.levels: ожидался непустой массив путей']);

  const screenUrl = resolve(files.screen, 'screen');
  const rulesUrl = resolve(files.rules, 'rules');
  const assetsUrl = resolve(files.assets, 'assets');
  const levelUrls = levelPaths.map((path, index) => resolve(path, `levels[${index}]`));

  const [screen, rules, assets, ...levels] = await Promise.all([
    load(screenUrl),
    load(rulesUrl),
    load(assetsUrl),
    ...levelUrls.map((url) => load(url)),
  ]);
  return { pack: assemblePack({ manifest, screen, rules, assets, levels }, env), assetsUrl };
}
