import { GAMES, isGameId, type GameId } from '../games/catalog';
import { BRICK_GAMES } from '../brick/games';
import { SHELLS, type Shell } from '../input/settings';
import { APOLLO_IDS, TOYS, type ApolloId } from '../app/toys';
import { missingButtons } from '../app/bodyButtons';
export interface ConfigGame {
  id: GameId;
  modes?: number[];
}
export interface ConfigToy {
  games: ConfigGame[];
  defaultGame: GameId;
  shells: Shell[];
  defaultShell: Shell;
}
export const CONFIG_TOY_IDS = [...APOLLO_IDS, 'brickgame'] as const;
export type ConfigToyId = ApolloId | 'brickgame';
export interface SiteConfig {
  version: 1;
  toys: Record<ConfigToyId, ConfigToy>;
}
const UNIVERSAL_DEFAULT: ConfigToy = { games: [{ id: 'tetris' }], defaultGame: 'tetris', shells: ['white'], defaultShell: 'white' };
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
  const toys = {} as SiteConfig['toys'];
  for (const id of CONFIG_TOY_IDS) {
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
    const shells = source['shells'];
    if (
      !Array.isArray(shells) ||
      !shells.length ||
      shells.length > 4 ||
      new Set(shells).size !== shells.length ||
      shells.some((s) => !SHELLS.includes(s))
    )
      throw new Error(`${id}: выберите допустимые цвета корпуса.`);
    if (id === 'brickgame' && (shells.length !== 1 || shells[0] !== 'white')) throw new Error('Brick Game: корпус серо-чёрный, палитра фиксирована.');
    if (!shells.includes(source['defaultShell'])) throw new Error(`${id}: основной цвет должен входить в доступные.`);
    if (typeof source['defaultGame'] !== 'string' || !seen.has(source['defaultGame']))
      throw new Error(`${id}: стартовая игра должна входить в меню.`);
    toys[id] = { games, shells: [...shells] as Shell[], defaultShell: source['defaultShell'] as Shell, defaultGame: source['defaultGame'] as GameId };
  }
  return { version: 1, toys };
}
