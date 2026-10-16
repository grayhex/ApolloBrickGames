import { LIBRARY_IDS, type LibraryId } from '../../../games/library';
import { LIBRARY_GAMES } from './index';
/** Static illustrations sampled once from the actual initial state; no second gameplay loop. */
export const LIBRARY_FIELDS: Record<LibraryId, readonly string[]> = Object.fromEntries(LIBRARY_IDS.map((id): [LibraryId, readonly string[]] => {
  const field = LIBRARY_GAMES[id].create({ seed:7 }).cells();
  return [id,Array.from({ length:20 },(_,y) => Array.from({ length:10 },(_,x) => field[y*10+x] ? '#' : '.').join(''))];
})) as Record<LibraryId, readonly string[]>;
export const LIBRARY_ICONS: Record<LibraryId, readonly string[]> = Object.fromEntries(LIBRARY_IDS.map((id): [LibraryId, readonly string[]] => [id,
  Array.from({length:5},(_,y) => Array.from({length:10},(_,x) => LIBRARY_FIELDS[id].slice(y*4,y*4+4).some((r) => r[x] === '#') ? '#' : '.').join('')),
])) as Record<LibraryId, readonly string[]>;
