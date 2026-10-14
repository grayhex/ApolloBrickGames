import type { HudLives } from '../content/schema';

/** Сколько жизней изображают значки: запасные (жизни − 1; текущая не рисуется) или все. */
export const shownLives = (hud: HudLives, lives: number): number => (hud.spare ? Math.max(0, lives - 1) : lives);

/** Сколько значков рисуется: не больше `max` (по умолчанию 9) — при секрете с 200 жизнями ряд не растёт. */
export const lifeIconCount = (hud: HudLives, shown: number): number => Math.min(Math.max(0, shown), hud.max ?? 9);
