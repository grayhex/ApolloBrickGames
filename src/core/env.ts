import type { ValidationEnv } from '../content/schema';
import { ACTIONS } from './actions';
import { DEMO_BEHAVIORS, type BehaviorRegistry } from './behaviors';

/** Что знает код о данных: типы объектов и действия — для проверки при загрузке. */
export function validationEnv(
  behaviors: BehaviorRegistry = DEMO_BEHAVIORS,
  glyphs?: readonly string[],
): ValidationEnv {
  return glyphs ? { objectTypes: behaviors, actions: ACTIONS, glyphs } : { objectTypes: behaviors, actions: ACTIONS };
}
