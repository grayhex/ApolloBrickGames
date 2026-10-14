import type { RuleSetDef } from '../content/schema';
import type { GameState } from './state';

/** Длительность одной единицы таймера на HUD, такты (по умолчанию — секунда). */
export function timerUnitTicks(rules: RuleSetDef): number {
  return rules.params.timerUnitTicks ?? rules.params.tickRateHz;
}

/**
 * Число на HUD вместо подписи: `TIME 397`. `null` — таймера нет или игра ещё не началась (тогда на HUD подпись уровня).
 * Значение — `ceil(осталось тактов / такты в единице)`: в начале 400, через единицу — 399.
 */
export function timerUnits(rules: RuleSetDef, state: GameState): number | null {
  if (rules.params.timerLimitTicks <= 0 || !state.gameStarted) return null;
  return Math.max(0, Math.ceil(state.timerTicks / timerUnitTicks(rules)));
}
