/** Gameplay revisions, independent of builds. Unchanged games keep their existing records.
 * Revision 2: ROM-based Snake movement/timing, B0202 Dice, Frog A01 and Beetle D01 profiles.
 */
const REVISIONS: Readonly<Record<string, string>> = { snake: '2', dice: '2', frog: '2', honeybee: '2' };
export const rulesetFor = (gameId: string): string => REVISIONS[gameId] ?? '1';
export const localHiSuffix = (gameId: string): string => rulesetFor(gameId) === '1' ? ':hi' : `:r${rulesetFor(gameId)}:hi`;
