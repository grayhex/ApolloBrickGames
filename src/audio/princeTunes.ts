import type { BrickTone } from './brickPhrases';

/**
 * Звук Prince 皇太子 (118 in 1). Владелец: при включении один раз играет «Финал» (Allegro vivace) увертюры к опере «Вильгельм Телль» Дж. Россини, в начале партии один раз —
 * куплет украинской народной песни «Ти ж мене підманула». Обе мелодии — общественное достояние, звучат монофонией (один голос-меандр), как у остальных игрушек.
 * Ноты взяты из открытых записей, а не сняты с устройства: «Вильгельм Телль» — из ABC-записи темы финала в до мажоре (аранжировка Hugh Barwell для контрданса, trillian.mit.edu/~jc/music/abc),
 * «Ти ж мене підманула» — из одноголосной MIDI-записи куплета (pidmanula.narod.ru). Темп и высота — допущения: оригинал не записывался.
 */
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Ноты по номерам MIDI: до первой октавы — C4 = 60. */
const G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, F5 = 77, Fs5 = 78, G5 = 79, A5 = 81, Gs4 = 68, REST = 0;

/** (нота, длительность в долях четверти). */
type Note = readonly [number, number];

const toTones = (notes: readonly Note[], beatMs: number): readonly BrickTone[] =>
  notes.map(([midi, beats]): BrickTone => ({ hz: midi === REST ? 0 : hz(midi), ms: beats * beatMs, gain: 0.7 }));

/** Одна «четверть» финала, мс: темп галопа (≈ 6 нот в секунду в быстрых группах). */
export const PRINCE_TELL_BEAT_MS = 165;

/**
 * Финал увертюры, 4/4. Тема A — три такта «галопа» на соль и подъём к ми; тема B — повторяющееся ми с ходом до ля; в конце — каденция A.
 * Затакт `соль соль` (две восьмые) открывает каждую тему.
 */
const TELL_PICKUP: readonly Note[] = [[G4, 0.5], [G4, 0.5]];
const TELL_A: readonly Note[] = [
  [G4, 1], [G4, 0.5], [G4, 0.5], [G4, 1], [G4, 1],
  [C5, 1], [D5, 1], [E5, 1], [G4, 0.5], [G4, 0.5],
  [G4, 1], [G4, 0.5], [G4, 0.5], [C5, 1], [E5, 1],
  [D5, 1], [B4, 1], [G4, 1], [G4, 0.5], [G4, 0.5],
  [G4, 1], [G4, 0.5], [G4, 0.5], [G4, 1], [G4, 1],
  [C5, 1], [D5, 1], [E5, 1], [C5, 0.5], [E5, 0.5],
  [G5, 2.5], [F5, 0.5], [E5, 0.5], [D5, 0.5],
  [C5, 1], [E5, 1], [C5, 1],
];
const TELL_B: readonly Note[] = [
  [E5, 0.5], [E5, 0.5],
  [E5, 1], [E5, 0.5], [E5, 0.5], [E5, 1], [E5, 1],
  [E5, 1], [A5, 1], [E5, 1], [A5, 1],
  [E5, 1], [A5, 1], [E5, 1], [D5, 1],
  [C5, 1], [B4, 1], [A4, 1], [E5, 0.5], [E5, 0.5],
  [E5, 1], [E5, 0.5], [E5, 0.5], [E5, 1], [E5, 1],
  [E5, 1], [A5, 1], [E5, 1], [A5, 1],
  [E5, 1], [A5, 1], [G5, 1], [Fs5, 1],
  [G5, 3],
];
const TELL_END: readonly Note[] = [[REST, 1], [C5, 1], [E5, 1], [C5, 2]];

/** «Финал» один раз: затакт, тема A, тема B и каденция. */
export const PRINCE_TELL: readonly BrickTone[] = toTones([...TELL_PICKUP, ...TELL_A, ...TELL_B, ...TELL_END], PRINCE_TELL_BEAT_MS);
export const PRINCE_TELL_MS = PRINCE_TELL.reduce((sum, note) => sum + note.ms, 0);

/** Одна «четверть» куплета, мс (112 ударов в минуту, как в записи). */
export const PRINCE_VERSE_BEAT_MS = 536;

/** (нота, длительность звучания, пауза после неё) в долях четверти: так записаны отрывистые ноты куплета. */
type VerseNote = readonly [number, number, number];

/** Куплет «Ти ж мене підманула, ти ж мене підвела…»: четыре строки, 16 четвертей (из одноголосной MIDI-записи). */
const PIDMANULA: readonly VerseNote[] = [
  [C5, 0.5, 0.5], [C5, 0.5, 0], [E5, 0.5, 0], [G5, 0.25, 0.25],
  [G5, 0.5, 0], [F5, 0.5, 0], [E5, 0.5, 0], [G5, 1, 0],
  [D5, 0.25, 0.25], [D5, 0.25, 0.25], [D5, 0.5, 0], [F5, 0.5, 0],
  [E5, 0.5, 0.5], [A5, 1, 0], [A4, 0.5, 0], [C5, 0.5, 0],
  [E5, 0.25, 0.25], [E5, 0.5, 0], [D5, 0.5, 0], [C5, 0.5, 0],
  [E5, 0.25, 0.25], [E5, 0.25, 0.25], [E5, 0.5, 0.25], [Gs4, 0.25, 0],
  [A4, 0.25, 0.25], [A4, 0.25, 0.25], [A4, 1, 0],
];

export const PRINCE_VERSE: readonly BrickTone[] = PIDMANULA.flatMap(([midi, beats, rest]): BrickTone[] => [
  { hz: hz(midi), ms: beats * PRINCE_VERSE_BEAT_MS, gain: 0.7 },
  ...(rest > 0 ? [{ hz: 0, ms: rest * PRINCE_VERSE_BEAT_MS }] : []),
]);
export const PRINCE_VERSE_MS = PRINCE_VERSE.reduce((sum, note) => sum + note.ms, 0);

/** Короткие сигналы меню и игры — допущения, как у Mini Brick: шаг выбора, поворот, посадка, переключение игры. */
export const PRINCE_TUNES = {
  prince_tell: PRINCE_TELL,
  prince_verse: PRINCE_VERSE,
  prince_demo_switch: [{ hz: 1319, ms: 40 }, { hz: 1760, ms: 60 }] as readonly BrickTone[],
};
