import type { ActionMask } from '../core/actions';

/**
 * Экранные кнопки игрушки (мышь, касание) как ещё один источник ввода: маска действий для трекера.
 * Каждый указатель (палец, мышь) держит свою маску; результат — их объединение. Логика без DOM.
 */
export class ScreenInput {
  private readonly pointers = new Map<number, ActionMask>();
  private readonly sink: (mask: ActionMask) => void;

  constructor(sink: (mask: ActionMask) => void) {
    this.sink = sink;
  }

  /** Указатель нажал кнопку с такими действиями (повторное нажатие тем же указателем заменяет маску). */
  press(pointerId: number, mask: ActionMask): void {
    this.pointers.set(pointerId, mask);
    this.push();
  }

  release(pointerId: number): void {
    if (this.pointers.delete(pointerId)) this.push();
  }

  /** Все указатели отпущены (пауза, потеря фокуса, выключение питания). */
  releaseAll(): void {
    if (this.pointers.size === 0) return;
    this.pointers.clear();
    this.push();
  }

  /** Сейчас удерживаемые экранными кнопками действия. */
  get held(): ActionMask {
    let mask = 0;
    for (const value of this.pointers.values()) mask |= value;
    return mask;
  }

  private push(): void {
    this.sink(this.held);
  }
}
