import { BUTTON_ACTIONS, type GameGuideData } from '../brick/guide';
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
  if (model.universal) actions.add('fire');
  return actions;
}

/** Кнопки, которые нужны игре (`needs`), но которых нет на корпусе игрушки. */
export function missingButtons(def: BrickGameDef, model: ToyModel): BrickAction[] {
  const have = bodyActions(model);
  return (def.needs ?? []).filter((action) => !have.has(action));
}

/** Можно ли назначить игру игрушке: все нужные кнопки есть на корпусе. */
export const canAssign = (def: BrickGameDef, model: ToyModel): boolean => missingButtons(def, model).length === 0;

/**
 * Справка приставки описывает только физически доступные действия, включая сочетания. У универсальной приставки FIRE есть лишь в играх, которым она нужна
 * (`BrickGameDef.usesFire`), поэтому описание остальных игр её не упоминает.
 */
export function guideForBody(guide: GameGuideData, model: ToyModel, def?: BrickGameDef): GameGuideData {
  const have = bodyActions(model);
  if (!def?.usesFire) have.delete('fire');
  return {
    ...guide,
    controls: guide.controls
      .filter((control) => [control.button, ...(control.with ?? [])].every((button) => BUTTON_ACTIONS[button].every((action) => have.has(action))))
      .map((control) =>
        model.universal
          ? {
              ...control,
              keyboardOnly: false,
              text: {
                ru: control.text.ru.replace(/^Клавиатура: /, '').replace(' (клавиатура, геймпад)', ''),
                en: control.text.en.replace(/^Keyboard: /, '').replace(' (keyboard, gamepad)', ''),
              },
            }
          : control,
      ),
  };
}
