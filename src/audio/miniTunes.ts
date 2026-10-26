import { MINI_BEAT_MS } from '../brick/miniTiming';
import type { BrickTone } from './brickPhrases';

/**
 * Звук Mini Brick Game B-S96. Владелец: музыка в играх звучит один раз при старте партии, это классические «Коробейники» из tetris brick game, монофония —
 * один голос-меандр без аккомпанемента. Мелодия — общеизвестная народная (тема A игры Tetris): один куплет из восьми тактов 4/4, темп 150 уд/мин.
 * Высота нот — равномерная темперация от ля первой октавы 440 Гц, а не настройка пищалки оригинала (запись с устройства не снималась).
 * Остальные сигналы (шаг меню, движение, поворот, посадка) — короткие допущения, не расшифровка прошивки.
 */
const BEAT_MS = MINI_BEAT_MS;
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Ноты по номерам MIDI. */
const A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79, A5 = 81, REST = 0;

/** (нота, длительность в долях такта-четверти). */
type Note = readonly [number, number];

const PART_A: readonly Note[] = [
  [E5, 1], [B4, 0.5], [C5, 0.5], [D5, 1], [C5, 0.5], [B4, 0.5],
  [A4, 1], [A4, 0.5], [C5, 0.5], [E5, 1], [D5, 0.5], [C5, 0.5],
  [B4, 1.5], [C5, 0.5], [D5, 1], [E5, 1],
  [C5, 1], [A4, 1], [A4, 1], [REST, 1],
  [D5, 1.5], [F5, 0.5], [A5, 1], [G5, 0.5], [F5, 0.5],
  [E5, 1.5], [C5, 0.5], [E5, 1], [D5, 0.5], [C5, 0.5],
  [B4, 1], [B4, 0.5], [C5, 0.5], [D5, 1], [E5, 1],
  [C5, 1], [A4, 1], [A4, 1], [REST, 1],
];

/** Один куплет (часть A), без второго куплета и без повтора. */
export const MINI_KOROBEINIKI: readonly BrickTone[] = PART_A.map(([midi, beats]): BrickTone => ({ hz: midi === REST ? 0 : hz(midi), ms: beats * BEAT_MS, gain: 0.7 }));
/** Длительность мелодии, мс. */
export const MINI_KOROBEINIKI_MS = MINI_KOROBEINIKI.reduce((sum, note) => sum + note.ms, 0);

/** Включение: короткий восходящий сигнал под рожицу заставки. */
export const MINI_INTRO_TONES: readonly BrickTone[] = [
  { hz: 988, ms: 70 },
  { hz: 1319, ms: 70 },
  { hz: 1760, ms: 70 },
  { hz: 0, ms: 60 },
  { hz: 1760, ms: 160 },
];
export const MINI_SELECT_TONES: readonly BrickTone[] = [{ hz: 1480, ms: 28 }];
export const MINI_MOVE_TONES: readonly BrickTone[] = [{ hz: 1250, ms: 12 }];
export const MINI_TURN_TONES: readonly BrickTone[] = [{ hz: 1000, ms: 18 }, { hz: 1500, ms: 18 }];
export const MINI_LOCK_TONES: readonly BrickTone[] = [{ hz: 260, ms: 36 }];
