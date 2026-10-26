/** Gameplay revisions, independent of cosmetic deployments.
 * v2 arcade balance: timers, visible hitboxes and fair obstacle/flight pacing.
 * Honeybee's ROM Beetle mode 0 stays v2; only wiki modes 1–7 advance to v3.
 */
const REVISIONS: Readonly<Record<string, string>> = {
  snake:'2', dice:'2', frog:'2', honeybee:'2',
  maze:'2', 'obstacle-race':'2', 'racing-four':'2', 'pong-double':'2',
  'meteor-fighter':'2', 'dual-shooting':'2', 'tetris-shooting':'2',
  'talking-shooting':'2', 'ufo-raiders':'2', 'space-invaders':'2',
  'helicopter-bomber':'2', 'flappy-bird':'2', basket:'2',
};
export const rulesetFor = (gameId: string, mode=0): string => gameId==='honeybee' && mode!==0 ? '3' : REVISIONS[gameId] ?? '1';
export const localHiSuffix = (gameId: string, mode=0, toyId=''): string => gameId === 'arkanoid' && mode === 0 && toyId === 'seabattle' ? ':sea-photo-v1:hi' : rulesetFor(gameId,mode) === '1' ? ':hi' : `:r${rulesetFor(gameId,mode)}:hi`;
