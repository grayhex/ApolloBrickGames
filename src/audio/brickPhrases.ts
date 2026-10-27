import { E88_TETRIS_EFFECTS } from './e88TetrisEffects';
import { B0202_EFFECTS } from './b0202Effects';
import { B0302_TETRIS_TUNE } from './b0302Tunes';
import { E88_EFFECTS } from './e88Effects';
import { MINI_INTRO_TONES, MINI_KOROBEINIKI, MINI_LOCK_TONES, MINI_MOVE_TONES, MINI_SELECT_TONES, MINI_TURN_TONES } from './miniTunes';
import { SEA_BLAST_TONES, SEA_FALL_TICK_TONES, SEA_INTRO_ONCE_TUNE, SEA_INTRO_TUNE, SEA_ROMEO_TUNE, SEA_SPLASH_TONES } from './seaTunes';
/** B0202 register traces plus synthesized transcription of other n0Live/BrickGame cues (MIT; see docs/THIRD_PARTY.md).
 * Frequencies retain the donor's tuning rather than imposing concert pitch.
 * No recording noise, codec padding or sampled waveforms are retained.
 */
export interface BrickTone {
  hz: number;
  ms: number;
  to?: number;
  noise?: boolean;
  gain?: number;
  track?: number;
  atMs?: number;
  /** Форма волны дорожки (берётся с первой ноты дорожки): по умолчанию — чистый меандр; синус доступен для отдельных исследованных сигналов. */
  wave?: 'sine';
}
const tone = (hz: number, ms: number, to?: number): BrickTone => ({ hz, ms, ...(to === undefined ? {} : { to }) });
const tune = (beat: number, notes: readonly (number | readonly [number, number])[]): BrickTone[] =>
  notes.map((note) => (typeof note === 'number' ? tone(note, beat) : tone(note[0], note[1] * beat)));
export const BRICK_PHRASES = {
  // Original short greeting for the universal console, not a firmware transcription.
  welcome: [{hz:523,ms:100},{hz:659,ms:100},{hz:784,ms:100},{hz:0,ms:50},{hz:1047,ms:180},{hz:784,ms:100},{hz:1047,ms:220}],
  ...B0202_EFFECTS,
  b0302_tetris_music: B0302_TETRIS_TUNE,
  ...E88_EFFECTS,
  ...E88_TETRIS_EFFECTS,
  sea_intro: SEA_INTRO_TUNE,
  sea_intro_once: SEA_INTRO_ONCE_TUNE,
  sea_romeo_music: SEA_ROMEO_TUNE,
  mini_intro: MINI_INTRO_TONES,
  mini_korobeiniki: MINI_KOROBEINIKI,
  mini_select: MINI_SELECT_TONES,
  mini_move: MINI_MOVE_TONES,
  mini_turn: MINI_TURN_TONES,
  mini_lock: MINI_LOCK_TONES,
  sea_blast: SEA_BLAST_TONES,
  sea_splash: SEA_SPLASH_TONES,
  sea_fall_tick: SEA_FALL_TICK_TONES,
  select: [tone(1110, 45), tone(990, 45), tone(825, 45), tone(1560, 45)],
  move: [tone(620, 130, 1450)],
  turn: [tone(1350, 65, 800)],
  hit_cell: [{ hz: 1100, ms: 230, noise: true }],
  bonus: [tone(620, 700, 1380)],
  fall: [{ hz: 900, ms: 200, noise: true }],
  fall_super: [{ hz: 1000, ms: 100, noise: true }, tone(2100, 720, 1050)],
  remove_line: [tone(620, 730, 1400)],
  start: tune(132, [550, 690, 820, 550, 690, 820, [1100, 4.8]]),
  win: tune(155, [
    0,
    800,
    0,
    800,
    0,
    1010,
    1180,
    1010,
    800,
    900,
    0,
    900,
    0,
    800,
    900,
    760,
    600,
    800,
    0,
    800,
    0,
    1010,
    1180,
    1010,
    800,
    1180,
    1070,
    1010,
    900,
    800,
    600,
    [800, 2],
  ]),
  game_over: tune(208, [
    690,
    1370,
    550,
    [690, 2],
    815,
    730,
    685,
    610,
    570,
    610,
    [730, 2],
    935,
    900,
    730,
    685,
    1370,
    550,
    [685, 2],
    815,
    720,
    685,
    [610, 4],
  ]),
  kaboom: [{ hz: 1050, ms: 1040, to: 780, noise: true }],
  tetris: tune(188, [
    0,
    [890, 2],
    680,
    725,
    815,
    [890, 0.5],
    [815, 0.5],
    725,
    680,
    [610, 0.5],
    [0, 0.5],
    [610, 0.5],
    [570, 0.5],
    610,
    725,
    890,
    [0, 0.5],
    [890, 0.5],
    950,
    890,
    [815, 0.5],
    [0, 0.5],
    [815, 0.5],
    [725, 0.5],
    680,
    725,
    [815, 0.5],
    [0, 0.5],
    [815, 0.5],
    [725, 0.5],
    680,
    725,
    815,
    [890, 0.5],
    [815, 0.5],
    725,
    680,
    [610, 2],
  ]),
} satisfies Record<string, readonly BrickTone[]>;
export type BrickSound = keyof typeof BRICK_PHRASES;
