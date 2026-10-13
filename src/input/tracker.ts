import { actionBit, type ActionMask, type InputFrame } from '../core/actions';

const LEFT = actionBit('left');
const RIGHT = actionBit('right');
const UP = actionBit('up');
const DOWN = actionBit('down');

/** Одновременные противоположные направления гасят друг друга (нейтраль). */
export function resolveOpposites(mask: ActionMask): ActionMask {
  let result = mask;
  if ((result & (LEFT | RIGHT)) === (LEFT | RIGHT)) result &= ~(LEFT | RIGHT);
  if ((result & (UP | DOWN)) === (UP | DOWN)) result &= ~(UP | DOWN);
  return result;
}

/** Оставляет в кадре только выбранные действия (например, только «мировые»). */
export function restrictFrame(frame: InputFrame, mask: ActionMask): InputFrame {
  return { pressed: frame.pressed & mask, held: frame.held & mask, released: frame.released & mask };
}

/**
 * Объединяет источники (клавиатура, геймпад) и превращает состояние в кадры по тактам.
 *
 * Источник сообщает «сейчас нажато вот это» в любой момент (событие клавиши, опрос геймпада).
 * Каждое изменение сразу фиксирует фронт в «защёлке», поэтому нажатие и отпускание между
 * двумя тактами не теряются. consume() вызывается один раз на логический такт:
 * после него защёлки очищаются, и на догоняющих тактах pressed не повторяется.
 */
export class ActionTracker {
  private readonly sources = new Map<string, ActionMask>();
  private effective: ActionMask = 0;
  private pressedLatch: ActionMask = 0;
  private releasedLatch: ActionMask = 0;

  setSource(name: string, mask: ActionMask): void {
    if ((this.sources.get(name) ?? 0) === mask) return;
    this.sources.set(name, mask);
    let raw = 0;
    for (const value of this.sources.values()) raw |= value;
    const next = resolveOpposites(raw);
    this.pressedLatch |= next & ~this.effective;
    this.releasedLatch |= this.effective & ~next;
    this.effective = next;
  }

  /** Сейчас удерживаемые действия (после объединения и разрешения конфликтов). */
  get down(): ActionMask {
    return this.effective;
  }

  /** Кадр на один логический такт. Тап между тактами даёт pressed+held+released сразу. */
  consume(): InputFrame {
    const pressed = this.pressedLatch;
    const frame: InputFrame = { pressed, held: this.effective | pressed, released: this.releasedLatch };
    this.pressedLatch = 0;
    this.releasedLatch = 0;
    return frame;
  }

  /** Полный сброс: удерживаемое забывается, фронты не генерируются. */
  reset(): void {
    this.sources.clear();
    this.effective = 0;
    this.pressedLatch = 0;
    this.releasedLatch = 0;
  }
}
