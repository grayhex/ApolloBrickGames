/**
 * Блокировка игрового ввода, пока открыт каталог устройств (`toySwitch.ts`): клавиатура, геймпад и экранные кнопки не доходят до игры, а то, что было
 * зажато в момент открытия, сбрасывается. Один общий замок на страницу: его слушает `InputHub` каждой игрушки, а оболочки игр ставят партию на паузу.
 * Замок считает владельцев (`token`): каталог и любое другое окно могут держать его одновременно, ввод возвращается, когда отпустили все.
 */
const holders = new Set<symbol>();
const lockListeners = new Set<(locked: boolean) => void>();

export const isInputLocked = (): boolean => holders.size > 0;

/** Взять замок; возвращает функцию, которая его отпускает (повторный вызов ничего не делает). */
export function lockInput(): () => void {
  const token = Symbol('input-lock');
  const wasLocked = isInputLocked();
  holders.add(token);
  if (!wasLocked) for (const listener of lockListeners) listener(true);
  return () => {
    if (!holders.delete(token) || isInputLocked()) return;
    for (const listener of lockListeners) listener(false);
  };
}

/** Подписка на смену состояния замка; `signal` или возвращённая функция снимают её. */
export function onInputLock(listener: (locked: boolean) => void, signal?: AbortSignal): () => void {
  lockListeners.add(listener);
  const off = (): void => void lockListeners.delete(listener);
  signal?.addEventListener('abort', off, { once: true });
  return off;
}
