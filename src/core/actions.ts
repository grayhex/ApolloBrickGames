/**
 * Логические игровые действия. Ядро получает только их — никаких key/button-кодов.
 * Адаптеры ввода (src/input) переводят физические кнопки в эти действия.
 */
export const ACTIONS = [
  'left',
  'right',
  'up',
  'down',
  'jump',
  'fire',
  'start',
  'pause',
  'confirm',
  'back',
] as const;

export type Action = (typeof ACTIONS)[number];

/** Набор действий — битовая маска (по одному биту на действие). */
export type ActionMask = number;

export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

export function actionBit(action: Action): ActionMask {
  return 1 << ACTIONS.indexOf(action);
}

export function maskOf(...actions: readonly Action[]): ActionMask {
  let mask = 0;
  for (const action of actions) mask |= actionBit(action);
  return mask;
}

export function hasAction(mask: ActionMask, action: Action): boolean {
  return (mask & actionBit(action)) !== 0;
}

export function actionsIn(mask: ActionMask): Action[] {
  return ACTIONS.filter((action) => hasAction(mask, action));
}

/**
 * Что получает ядро. `confirm` и `back` — команды меню оболочки, в мир не попадают.
 */
export const CORE_ACTIONS: ActionMask = maskOf(
  'left',
  'right',
  'up',
  'down',
  'jump',
  'fire',
  'start',
  'pause',
);

/**
 * Секретный аккорд: оболочка выставляет этот бит в `held`, пока игрок держит LEFT и DOWN вместе (по упаковке оригинала —
 * «до того, как Марио выпрыгнет из колодца»). Это не действие игрока и не попадает в привязки клавиш. Нужен отдельный бит,
 * потому что во время сценария входа (герой выпрыгивает из ямы сам) его кадры подменяют ввод игрока: сами LEFT и DOWN ядро бы не увидело,
 * а подмешать их в сценарий нельзя — LEFT помешал бы последнему шагу вправо.
 */
export const SECRET_CHORD: ActionMask = 1 << 20;

/**
 * Ввод на один логический такт.
 *  - pressed:  фронт нажатия с прошлого такта (короткий тап не теряется);
 *  - held:     действие удерживается в этом такте (тап даёт held на один такт);
 *  - released: фронт отпускания с прошлого такта.
 */
export interface InputFrame {
  readonly pressed: ActionMask;
  readonly held: ActionMask;
  readonly released: ActionMask;
}

export const NEUTRAL_FRAME: InputFrame = { pressed: 0, held: 0, released: 0 };

export function makeFrame(parts: { pressed?: readonly Action[]; held?: readonly Action[]; released?: readonly Action[] }): InputFrame {
  const pressed = maskOf(...(parts.pressed ?? []));
  return {
    pressed,
    held: maskOf(...(parts.held ?? [])) | pressed,
    released: maskOf(...(parts.released ?? [])),
  };
}
