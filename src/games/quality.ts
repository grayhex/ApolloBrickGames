import type { GameId } from './catalog';

export type DevelopmentStage = 'alpha' | 'beta' | null;
export type LogicOrigin = 'rom' | 'ai';
/** Provenance is about the implemented logic, not merely the existence of a ROM
 * link in the bibliography. ROM includes rules researched in another emulator. */
const RESEARCHED = new Set<GameId>([
  'tetris', 'tetris-big', 'tetris-pentix', 'tetris-flicker', 'snake', 'dice', 'frog', 'honeybee',
  'shooting', 'shooting-array', 'shooting-figures', 'racing', 'racing-shooting', 'tank', 'arkanoid', 'construction',
]);
/** Explicit readiness assessment. Evidence percentages never select a stage.
 * Beta: a complete playable loop, checked goals/failures and usable variations.
 * Alpha: a simplified prototype or incomplete distinctive rules/variant coverage.
 * No preview badge: the mature reference implementations. */
const BETA = new Set<GameId>([
  ...RESEARCHED, 'maze', 'jigsaw', 'lights-out', 'sokoban', 'peg-solitaire', 'reversi', '2048', 'fill-connect',
  'whack-a-mole', 'simon', 'dance', 'matching-blocks', 'flappy-bird', 'basket', 'digger', 'helicopter-bomber',
  'obstacle-race', 'boat-racing', 'racing-four', 'super-tank', 'racing-pickup', 'punch-racing',
  'pong', 'pong-double', 'pneumatic-ball', 'arkanoid-dots', 'bowling', 'quarth', 'dr-mario', 'columns', 'columns-flicker',
  'romeo-juliet', 'sea-battle',
]);
export function logicOrigin(id: GameId, mode = 0): LogicOrigin {
  if (id === 'honeybee' && mode !== 0) return 'ai';
  return RESEARCHED.has(id) ? 'rom' : 'ai';
}
export function previewStage(id: GameId, mode = 0): DevelopmentStage {
  if (id === 'mario' || id === 'tetris') return null;
  if (id === 'honeybee' && mode !== 0) return 'alpha';
  return BETA.has(id) ? 'beta' : 'alpha';
}
