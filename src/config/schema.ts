import { isNativeDevice, NATIVE_DEVICE_IDS, NATIVE_MENUS, nativeEntry, nativeFamilies, nativeBase, type NativeDeviceId } from '../devices/catalog';
import { GAMES, isGameId, type GameId } from '../games/catalog';
import { BRICK_GAMES } from '../brick/games';
import { APOLLO_SHELLS, MONOBLOCK_SHELLS, type Shell } from '../input/settings';
import { APOLLO_IDS, TOYS, type ApolloId } from '../app/toys';
import { missingButtons } from '../app/bodyButtons';
import { DEFAULT_LANG, isLang, type Lang } from '../input/lang';
export interface ConfigGame {
  entryId?: string;
  /** Native modifications belonging to this one assigned game. */
  variants?: string[];
  id: GameId;
  modes?: number[];
}
export interface ConfigToy {
  defaultEntry?: string;
  shellPaletteVersion?: 2;
  games: ConfigGame[];
  defaultGame: GameId;
  shells: Shell[];
  defaultShell: Shell;
  /** Цвет миниатюры игрушки в карусели переключателя: из палитры игрушки (у универсальной — ещё и белый). */
  thumbShell: Shell;
}
/** Цвета миниатюры: у приставок Apollo — их палитра, у универсальной — все её корпуса и белый (прежний вид переключателя). */
export const thumbPalette = (id: ConfigToyId): readonly Shell[] => (isNativeDevice(id) ? [id === 'e88' ? 'gray' : 'black'] : id === 'brickgame' ? ['white', ...MONOBLOCK_SHELLS] : APOLLO_SHELLS);
export const DEFAULT_THUMB_SHELL: Shell = 'white';
export const CONFIG_TOY_IDS = [...APOLLO_IDS, 'brickgame', ...NATIVE_DEVICE_IDS] as const;
export type ConfigToyId = ApolloId | 'brickgame' | NativeDeviceId;
export interface SiteConfig {
  version: 1;
  /** Язык интерфейса по умолчанию, пока игрок не выбрал свой (RU / EN); в старых документах нет — русский. */
  language: Lang;
  toys: Record<ConfigToyId, ConfigToy>;
  /** Original game illustrations, published with the collection configuration. */
  encyclopedia?: Partial<Record<GameId, { imageUrl: string }>>;
}
export function illustrationUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Нужна ссылка HTTPS на иллюстрацию (до 2048 символов).');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Некорректная ссылка на иллюстрацию.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Для иллюстрации нужна ссылка HTTPS без логина и пароля.');
  return url.href;
}
const UNIVERSAL_DEFAULT: ConfigToy = { games: [{ id: 'tetris' }], defaultGame: 'tetris', shells: [...MONOBLOCK_SHELLS], shellPaletteVersion:2, defaultShell: 'gray', thumbShell: DEFAULT_THUMB_SHELL };
/** Computed at load time: published four-toy documents remain valid, and orphan games never disappear. */
export function universalGames(config: SiteConfig): ConfigGame[] {
  const assigned = new Set(APOLLO_IDS.flatMap((id) => config.toys[id].games.map((g) => g.id)));
  const explicit = config.toys.brickgame.games;
  const pinned = new Set(explicit.map((g) => g.id));
  return [
    ...explicit,
    ...Object.values(GAMES)
      .filter((g) => g.engine === 'brick' && BRICK_GAMES[g.id] && !assigned.has(g.id) && !pinned.has(g.id))
      .map((g) => ({ id: g.id })),
  ];
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Reject the whole document; never partly apply an invalid menu. Return a clean value without extra fields. */
export function validateConfig(value: unknown): SiteConfig {
  if (!record(value) || value['version'] !== 1 || !record(value['toys'])) throw new Error('Нужна конфигурация версии 1 с настройками игрушек.');
  const language = value['language'] ?? DEFAULT_LANG;
  if (!isLang(language)) throw new Error('Язык по умолчанию: ru или en.');
  const toys = {} as SiteConfig['toys'];
  for (const id of CONFIG_TOY_IDS) {
    if (isNativeDevice(id)) {
      toys[id] = validateNativeToy(id, id in value['toys'] ? value['toys'][id] : nativeDefault(id));
      continue;
    }
    const source = id === 'brickgame' && !('brickgame' in value['toys']) ? UNIVERSAL_DEFAULT : value['toys'][id];
    if (!record(source) || !Array.isArray(source['games']) || source['games'].length < 1 || source['games'].length > 99)
      throw new Error(`${id}: в меню должно быть от 1 до 99 игр.`);
    const seen = new Set<string>();
    const games = source['games'].map((g: unknown): ConfigGame => {
      if (!record(g) || typeof g['id'] !== 'string' || !isGameId(g['id']) || seen.has(g['id']))
        throw new Error(`${id}: неизвестная или повторная игра.`);
      const gameId = g['id'];
      seen.add(gameId);
      if (id === 'mario' ? gameId !== 'mario' : GAMES[gameId].engine !== 'brick' || !BRICK_GAMES[gameId])
        throw new Error(`${id}: игра ${gameId} несовместима с экраном приставки.`);
      const needed = id === 'mario' ? [] : missingButtons(BRICK_GAMES[gameId]!, TOYS[id]);
      if (needed.length)
        throw new Error(`${id}: игре ${gameId} нужна кнопка «${needed.join('», «')}», которой на корпусе нет, — игра не назначается.`);
      if (g['modes'] === undefined) return { id: gameId };
      const modes = g['modes'],
        max = BRICK_GAMES[gameId]?.modes.length ?? 1;
      if (
        !Array.isArray(modes) ||
        !modes.length ||
        modes.length > max ||
        new Set(modes).size !== modes.length ||
        modes.some((m) => !Number.isInteger(m) || m < 0 || m >= max)
      )
        throw new Error(`${id}/${gameId}: недопустимые варианты игры.`);
      return { id: gameId, modes: [...modes] as number[] };
    });
    const legacyPalette=id==='brickgame'&&source['shellPaletteVersion']===undefined&&JSON.stringify(source['shells'])===JSON.stringify(['gray','black']);
    const shells = legacyPalette ? [...MONOBLOCK_SHELLS] : source['shells'];
    const palette: readonly Shell[] = id === 'brickgame' ? MONOBLOCK_SHELLS : APOLLO_SHELLS;
    if (
      !Array.isArray(shells) ||
      !shells.length ||
      shells.length > 4 ||
      new Set(shells).size !== shells.length ||
      shells.some((s) => !palette.includes(s))
    )
      throw new Error(`${id}: выберите допустимые цвета корпуса.`);
    if (!shells.includes(source['defaultShell'])) throw new Error(`${id}: основной цвет должен входить в доступные.`);
    const thumbShell = source['thumbShell'] ?? DEFAULT_THUMB_SHELL;
    if (typeof thumbShell !== 'string' || !thumbPalette(id).some((s) => s === thumbShell)) throw new Error(`${id}: недопустимый цвет миниатюры в карусели.`);
    if (typeof source['defaultGame'] !== 'string' || !seen.has(source['defaultGame']))
      throw new Error(`${id}: стартовая игра должна входить в меню.`);
    toys[id] = { ...(id==='brickgame'?{shellPaletteVersion:2 as const}:{}), games, shells: [...shells] as Shell[], defaultShell: source['defaultShell'] as Shell, thumbShell: thumbShell as Shell, defaultGame: source['defaultGame'] as GameId };
  }
  const encyclopedia: NonNullable<SiteConfig['encyclopedia']> = {};
  if (value['encyclopedia'] !== undefined) {
    if (!record(value['encyclopedia'])) throw new Error('Некорректный каталог иллюстраций.');
    for (const [id, entry] of Object.entries(value['encyclopedia'])) {
      if (!isGameId(id) || !record(entry)) throw new Error('Неизвестная игра в каталоге иллюстраций.');
      encyclopedia[id] = { imageUrl: illustrationUrl(entry['imageUrl']) };
    }
  }
  return { version: 1, language, toys, ...(Object.keys(encyclopedia).length ? { encyclopedia } : {}) };
}

/** Additive v1 migration: only missing device documents are populated; existing values are validated intact. */
export function nativeDefault(id: NativeDeviceId): ConfigToy {
  const games = nativeFamilies(id).map(({base,variants})=>({id:base.gameId,entryId:base.entryId,variants:variants.map(e=>e.entryId)}));
  const shell: Shell = id === 'e88' ? 'gray' : 'black';
  return { games, defaultEntry:games[0]!.entryId,defaultGame:games[0]!.id,shells:[shell],defaultShell:shell,thumbShell:shell };
}
function validateNativeToy(id: NativeDeviceId, source: unknown): ConfigToy {
  if (!record(source) || !Array.isArray(source['games']) || !source['games'].length || source['games'].length > NATIVE_MENUS[id].length)
    throw new Error(`${id}: недопустимый набор игр.`);
  const seen = new Set<string>(), groups = new Map<GameId,ConfigGame>();
  const grouped = source['games'].some(g=>record(g)&&g['variants']!==undefined);
  for(const g of source['games']) {
    if(!record(g)||typeof g['entryId']!=='string')throw new Error(`${id}: нужен entryId игры.`);
    const entry=nativeEntry(id,g['entryId']);
    if(!entry||entry.gameId!==g['id']||seen.has(entry.entryId)||g['modes']!==undefined)throw new Error(`${id}: неизвестная, повторная или несовместимая игра.`);
    seen.add(entry.entryId);
    const base=nativeBase(id,entry.gameId);
    if(grouped&&(groups.has(entry.gameId)||entry.entryId!==base.entryId))throw new Error(`${id}: модификации должны находиться внутри игры.`);
    let game=groups.get(entry.gameId);
    if(!game){game={id:base.gameId,entryId:base.entryId,variants:[]};groups.set(game.id,game);}
    if(g['variants']!==undefined){
      const variants=g['variants'];
      if(!Array.isArray(variants)||new Set(variants).size!==variants.length||variants.some(v=>typeof v!=='string'||v===base.entryId||!nativeEntry(id,v)?.available||nativeEntry(id,v)?.gameId!==base.gameId))throw new Error(`${id}: несовместимая модификация.`);
      game.variants!.push(...variants as string[]);
    }else if(entry.available&&entry.entryId!==base.entryId)game.variants!.push(entry.entryId);
  }
  const oldDefault=typeof source['defaultEntry']==='string'?nativeEntry(id,source['defaultEntry']):undefined;
  if(!oldDefault||oldDefault.gameId!==source['defaultGame']||!seen.has(oldDefault.entryId))throw new Error(`${id}: стартовая игра должна входить в меню.`);
  const first=groups.get(oldDefault.gameId)!;
  const expected=id==='e88'?'gray':'black';
  if(!Array.isArray(source['shells'])||source['shells'].length!==1||source['shells'][0]!==expected||source['defaultShell']!==expected||(source['thumbShell']??expected)!==expected)throw new Error(`${id}: разрешён только подтверждённый цвет ${expected}.`);
  return {games:[...groups.values()],defaultEntry:first.entryId,defaultGame:first.id,shells:[expected],defaultShell:expected,thumbShell:expected};
}
