import { BRICK_GAMES } from '../brick/games';
import { TOYS, type ToyId } from '../app/toys';
import { canAssign } from '../app/bodyButtons';
import { isGameId, type GameId } from '../games/catalog';
import { rulesetFor } from '../games/rulesets';

/** Default revision for unchanged games; use rulesetFor(gameId) for selections. */
export const RULESET_VERSION = '1';
export const STANDARD_START = 'standard-v1';
export interface RankingSpec {
  gameId: GameId;
  mode: number;
  rulesetVersion: string;
  startProfile: string;
  controls: string;
}
export interface RunSelection {
  gameId: GameId;
  mode: number;
  toyId: ToyId;
  rulesetVersion: string;
  startProfile: string;
}
export interface TopEntry {
  rank: number;
  nickname: string;
  score: number;
  toyId: ToyId;
}
export interface PublicTop {
  category: string;
  entries: TopEntry[];
}
export const MAX_RANKED_SCORE = 9_999_999;

export function selection(value: unknown): RunSelection {
  if (!value || typeof value !== 'object') throw new Error('Invalid selection');
  const v = value as Record<string, unknown>;
  const allowed = new Set(['gameId', 'mode', 'toyId', 'rulesetVersion', 'startProfile', 'requestId']);
  if (Object.keys(v).some((key) => !allowed.has(key))) throw new Error('Nonstandard start');
  if (typeof v['gameId'] !== 'string' || !isGameId(v['gameId'])) throw new Error('Invalid game');
  const gameId = v['gameId'];
  if (typeof v['toyId'] !== 'string' || !Object.hasOwn(TOYS, v['toyId'])) throw new Error('Invalid toy');
  const toyId = v['toyId'] as ToyId;
  if (toyId === 'alibaba' || toyId === 'minibrick') throw new Error('Exhibition model');
  const mode = v['mode'];
  const def = BRICK_GAMES[gameId];
  if (
    !Number.isInteger(mode) ||
    Number(mode) < 0 ||
    (gameId === 'mario'
      ? mode !== 0 || toyId !== 'mario'
      : !def || Number(mode) >= def.modes.length || toyId === 'mario' || !canAssign(def, TOYS[toyId]))
  )
    throw new Error('Invalid canonical mode or controls');
  const revision = rulesetFor(gameId);
  if (v['rulesetVersion'] !== revision || v['startProfile'] !== STANDARD_START) throw new Error('Unsupported rules/start profile');
  return { gameId, mode: Number(mode), toyId, rulesetVersion: revision, startProfile: STANDARD_START };
}
export function specFor(value: unknown): RankingSpec {
  const s = selection(value);
  // FIRE is exposed only where it changes an action. Other matrix models share identical input capabilities.
  const controls = s.gameId === 'mario' ? 'mario' : BRICK_GAMES[s.gameId]?.usesFire && TOYS[s.toyId].universal ? 'matrix-fire' : 'matrix';
  return { gameId: s.gameId, mode: s.mode, rulesetVersion: s.rulesetVersion, startProfile: s.startProfile, controls };
}
export function categoryFor(value: unknown): string {
  const s = specFor(value);
  return `${s.gameId}:${s.mode}:r${s.rulesetVersion}:${s.startProfile}:${s.controls}`;
}
export function validateCategory(value: unknown): string {
  if (typeof value !== 'string' || value.length > 160) throw new Error('Invalid category');
  const parts = value.split(':');
  if (parts.length !== 5) throw new Error('Invalid category');
  const [gameId, mode, rules, startProfile, controls] = parts;
  const toyId = controls === 'mario' ? 'mario' : controls === 'matrix-fire' ? 'brickgame' : 'clock99';
  if (
    !/^(0|[1-9]\d*)$/.test(mode ?? '') ||
    rules !== `r${rulesetFor(gameId ?? '')}` ||
    categoryFor({ gameId, mode: Number(mode), rulesetVersion: rulesetFor(gameId ?? ''), startProfile, toyId }) !== value
  )
    throw new Error('Unknown category');
  return value;
}
export function nickname(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid nickname');
  const name = value.normalize('NFKC').trim();
  if ([...name].length < 2 || [...name].length > 20 || !/^[\p{L}\p{N}\p{M}\p{P}\p{S} ]+$/u.test(name) || /[<>]/.test(name))
    throw new Error('Nickname: 2–20 visible characters, without markup or controls');
  return name;
}
export function validScore(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > MAX_RANKED_SCORE) throw new Error('Invalid score');
  return Number(value);
}
/** No URL/debug/editor/custom starts enter the common table. Presentation, sound and language do not change rules. */
export function rankedPage(search: string, hash: string): boolean {
  const params = new URLSearchParams(search);
  const allowed = new Set(['toy', 'view', 'power', 'level']);
  if (params.has('level') && (params.get('toy') !== 'mario' || !['1', 'mario-1'].includes(params.get('level') ?? ''))) return false;
  return [...params.keys()].every((k) => allowed.has(k)) && (!hash || hash === '#' || hash === '#/' || hash === '#/room' || hash === '#room');
}
