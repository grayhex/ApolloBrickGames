import { isNativeDevice, nativeEntry, playableEntries } from '../devices/catalog';
import raw from './default.json';
import { validateConfig, universalGames, CONFIG_TOY_IDS, type SiteConfig } from './schema';
import { GAMES } from '../games/catalog';
import { TOYS } from '../app/toys';
import { setDefaultLang } from '../input/lang';
export const defaultConfig = (): SiteConfig => validateConfig(raw);
let currentConfig: SiteConfig | undefined;
export const getConfig = (): SiteConfig => currentConfig ?? defaultConfig();
export function applyConfig(config: SiteConfig): void {
  currentConfig = config;
  setDefaultLang(config.language);
  for (const id of CONFIG_TOY_IDS) {
    const model = TOYS[id],
      settings = config.toys[id];
    const original = model.games;
    model.shells = settings.shells;
    model.defaultShell = settings.defaultShell;
    model.thumbShell = settings.thumbShell;
    model.defaultGame = settings.defaultGame;
    if (isNativeDevice(id)) {
      const games = playableEntries(id, settings.games);
      model.defaultEntry = games.some(g => g.entryId === settings.defaultEntry) ? settings.defaultEntry : games[0]!.entryId;
      model.defaultGame = games.find(g => g.entryId === model.defaultEntry)!.id;
      model.games = games.map(g => {
        const entry = nativeEntry(id, g.entryId!)!;
        return {id:g.id, entryId:entry.entryId, label:`${entry.nativeCode} · ${entry.name.en}`, status:entry.available ? 'ready' : 'planned'};
      });
      continue;
    }
    model.games = (id === 'brickgame' ? universalGames(config) : settings.games).map((g) => ({
      ...original.find((old) => old.id === g.id),
      id: g.id,
      label: original.find((old) => old.id === g.id)?.label ?? GAMES[g.id].names.ru,
      status: 'ready',
      modes: g.modes,
    }));
    if (id === 'mario') model.games = [...model.games, ...original.filter((g) => g.status === 'planned')];
  }
}
export async function loadConfig(): Promise<void> {
  let config = defaultConfig();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/config`, { signal: AbortSignal.timeout(1800), cache: 'no-store' });
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const data: unknown = await response.json();
      if (typeof data === 'object' && data !== null && 'config' in data) config = validateConfig(data.config);
    }
  } catch {
    /* Static previews and offline starts use the versioned repository configuration. */
  }
  applyConfig(config);
}
