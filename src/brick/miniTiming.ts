/** One verse shared by the Mini buzzer and its race-start scene (32 quarter-note beats). */
export const MINI_BEAT_MS = 400;
export const MINI_VERSE_MS = 32 * MINI_BEAT_MS;
export const MINI_RACE_INTRO_TICKS = MINI_VERSE_MS * 60 / 1000;
/**
 * Шаг «простоя» в меню и на заставке (владелец: раз в секунду — слишком быстро, нужно 2 секунды): раз в этот интервал очки чередуются с рядами (HI-SCORE ↔ LINES)
 * и на шкале значков добавляется (затем убирается) один значок. Отсчёт идёт от включения питания и переживает выбор номера и настройки.
 */
export const MINI_IDLE_STEP_SECONDS = 2;
export const MINI_IDLE_STEP_TICKS = MINI_IDLE_STEP_SECONDS * 60;
