import type { BrickAction, BrickGameDef } from '../brick/types';
import type { ToyModel } from './toys';
import type { ToyKeyId } from './toy';

/**
 * Какие игровые кнопки есть на корпусе игрушки. У игрушек 1–4 это стрелки и большая ROTATE (`jump`); кнопка с id `fire` — это RESET корпуса (выход в меню),
 * отдельного «огня» нет. Игра, которой нужна кнопка, отсутствующая на корпусе, игрушке не назначается: кнопки не дорисовываются, клавиатура и длинные
 * нажатия вместо недостающей кнопки не вводятся (у нас всё аутентично).
 */
const GAME_KEYS: Readonly<Partial<Record<ToyKeyId, BrickAction>>> = { left: 'left', right: 'right', up: 'up', down: 'down', jump: 'rotate' };

export function bodyActions(model: ToyModel): Set<BrickAction> {
  const actions = new Set<BrickAction>();
  for (const [key, action] of Object.entries(GAME_KEYS) as [ToyKeyId, BrickAction][]) if (model.keyWhat[key] !== undefined) actions.add(action);
  return actions;
}

/** Кнопки, которые нужны игре (`needs`), но которых нет на корпусе игрушки. */
export function missingButtons(def: BrickGameDef, model: ToyModel): BrickAction[] {
  const have = bodyActions(model);
  return (def.needs ?? []).filter((action) => !have.has(action));
}

/** Можно ли назначить игру игрушке: все нужные кнопки есть на корпусе. */
export const canAssign = (def: BrickGameDef, model: ToyModel): boolean => missingButtons(def, model).length === 0;
