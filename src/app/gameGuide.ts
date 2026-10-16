import { LIBRARY_IDS, type LibraryId } from '../games/library';
import type { GameId } from '../games/catalog';
import type { MsgKey } from './messages';

/**
 * Описание игры для левой панели («вкладка» игры у консоли): что это за игра, что известно о её правилах и что не установлено.
 * Это справка, а не правила: сами игры восстанавливаются отдельно, а сведения здесь — наблюдения владельца, наклейки и упаковки и описания близких
 * Brick Game (открытый симулятор, обзоры других моделей). Совпадение названий не означает совпадения прошивки, поэтому «не установлено» названо прямо.
 */
export type GameSource = 'owner' | 'donor' | 'sticker' | 'wiki';

export interface GameGuide {
  /** Что за игра — одна-две фразы. */
  what: MsgKey;
  /** Что известно о том, как она устроена в близких играх (если известно). */
  how?: MsgKey;
  /** Что не установлено или не подтверждено. */
  open: MsgKey;
  /** Откуда сведения. */
  sources: readonly GameSource[];
}

export const GAME_GUIDE: Record<GameId, GameGuide> = {
  ...Object.fromEntries(LIBRARY_IDS.map((id): [LibraryId, GameGuide] => [id, { what:'game.library.what', open:'game.library.open', sources:['wiki'] }])) as Record<LibraryId, GameGuide>,
  mario: { what: 'game.mario.what', open: 'game.mario.open', sources: ['sticker'] },
  clock: { what: 'game.clock.what', open: 'game.clock.open', sources: ['sticker'] },
  tetris: { what: 'game.tetris.what', open: 'game.tetris.open', sources: ['owner'] },
  'tetris-big': { what: 'game.tetris-big.what', open: 'game.tetris-big.open', sources: ['owner'] },
  'tetris-pentix': { what: 'game.tetris-pentix.what', how: 'game.tetris-pentix.how', open: 'game.tetris-pentix.open', sources: ['owner', 'donor'] },
  shooting: { what: 'game.shooting.what', open: 'game.shooting.open', sources: ['sticker', 'donor'] },
  'shooting-array': { what: 'game.shooting-array.what', how: 'game.shooting-array.how', open: 'game.shooting-array.open', sources: ['owner', 'donor'] },
  'shooting-figures': { what: 'game.shooting-figures.what', how: 'game.shooting-figures.how', open: 'game.shooting-figures.open', sources: ['owner', 'donor'] },
  racing: { what: 'game.racing.what', how: 'game.racing.how', open: 'game.racing.open', sources: ['owner', 'donor'] },
  'racing-shooting': { what: 'game.racing-shooting.what', how: 'game.racing-shooting.how', open: 'game.racing-shooting.open', sources: ['owner', 'donor'] },
  tank: { what: 'game.tank.what', how: 'game.tank.how', open: 'game.tank.open', sources: ['owner', 'donor'] },
  arkanoid: { what: 'game.arkanoid.what', open: 'game.arkanoid.open', sources: ['owner', 'sticker'] },
  'romeo-juliet': { what: 'game.romeo-juliet.what', open: 'game.romeo-juliet.open', sources: ['owner'] },
  'sea-battle': { what: 'game.sea-battle.what', open: 'game.sea-battle.open', sources: ['owner', 'sticker'] },
  frog: { what: 'game.frog.what', how: 'game.frog.how', open: 'game.frog.open', sources: ['owner', 'donor'] },
  construction: { what: 'game.construction.what', how: 'game.construction.how', open: 'game.construction.open', sources: ['owner', 'donor'] },
};

export const SOURCE_KEYS: Record<GameSource, 'games.src.owner' | 'games.src.donor' | 'games.src.sticker' | 'games.src.wiki'> = {
  wiki: 'games.src.wiki',
  owner: 'games.src.owner',
  donor: 'games.src.donor',
  sticker: 'games.src.sticker',
};
