import type { BrickTone } from './brickPhrases';
import { MINI_KOROBEINIKI } from './miniTunes';

/** Owner-approved temporary repertoire, not a transcription of the FM-38 firmware. */
const JOY: readonly (readonly [number, number])[] = [
  [76,1],[76,1],[77,1],[79,1],[79,1],[77,1],[76,1],[74,1],
  [72,1],[72,1],[74,1],[76,1],[76,1.5],[74,.5],[74,2],
  [76,1],[76,1],[77,1],[79,1],[79,1],[77,1],[76,1],[74,1],
  [72,1],[72,1],[74,1],[76,1],[74,1.5],[72,.5],[72,2],
];
export const FM38_TUNES = {
  fm38_korobeiniki: MINI_KOROBEINIKI,
  fm38_joy: JOY.map(([midi, beats]): BrickTone => ({hz:440*2**((midi-69)/12),ms:beats*400,gain:.7})),
};
