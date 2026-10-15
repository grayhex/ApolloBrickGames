import type { Shell } from '../input/settings';
import type { View } from './view';

/** Что игрушка передаёт следующей при переключении на странице: вид (свёрнута / полная / только экран), цвет корпуса и включена ли. */
export interface Carry {
  view: View;
  shell: Shell;
  powered: boolean;
}

/** Запущенное приложение игрушки: снять со страницы и узнать, с чем продолжить в следующей. */
export interface AppHandle {
  dispose(): void;
  carry(): Carry;
}

/**
 * Жизненный цикл приложения игрушки на странице. Игрушки меняются на месте, без перезагрузки (см. `host.ts`), поэтому всё, что приложение
 * навесило на страницу — обработчики окна, документа и постоянных элементов, цикл кадров, таймеры, наблюдатели, звук, — должно сниматься
 * одним вызовом `dispose()`, иначе обработчики прежней игрушки продолжали бы работать поверх новой.
 */
export class Lifecycle {
  private readonly controller = new AbortController();
  private readonly cleanups: (() => void)[] = [];
  private frame = 0;
  private done = false;

  /** Для `addEventListener(тип, обработчик, { signal })`: обработчик снимается при `dispose()`. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get disposed(): boolean {
    return this.done;
  }

  /** Цикл кадров (`requestAnimationFrame`): прекращается при `dispose()`; `step` сам планировать следующий кадр не должен. */
  loop(step: (now: number) => void): void {
    const tick = (now: number): void => {
      if (this.done) return;
      this.frame = requestAnimationFrame(tick);
      step(now);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Таймер, который не переживёт игрушку. */
  timeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      if (!this.done) callback();
    }, ms);
    this.cleanups.push(() => clearTimeout(id));
    return id;
  }

  /** Наблюдатель за размером: отключается при `dispose()`. */
  observe(target: Element, callback: ResizeObserverCallback): ResizeObserver {
    const observer = new ResizeObserver(callback);
    observer.observe(target);
    this.cleanups.push(() => observer.disconnect());
    return observer;
  }

  /** Что ещё сделать при `dispose()` (отключить ввод, заглушить звук). */
  onDispose(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.controller.abort();
    cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error(error);
      }
    }
  }
}
