import { keySource, type SourceId } from './bindings';

/** Минимальный вид целевого элемента события (удобно подставлять в тестах). */
export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

const INTERACTIVE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'SUMMARY']);

/** Поля ввода, кнопки и ссылки сами обрабатывают клавиши — игра их не перехватывает. */
export function isInteractiveTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const { tagName, isContentEditable } = target as TargetLike;
  return isContentEditable === true || (typeof tagName === 'string' && INTERACTIVE_TAGS.has(tagName.toUpperCase()));
}

export interface KeyEventLike {
  code: string;
  repeat: boolean;
  isComposing?: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: unknown;
  preventDefault(): void;
}

export interface KeyboardInputOptions {
  /** Клавиатура принадлежит игре только пока активна игровая область (например, в фокусе). */
  isActive(): boolean;
  /** Есть ли у клавиши привязка. Непривязанные клавиши игра не трогает. */
  isBound(source: SourceId): boolean;
  /** Новое множество удерживаемых источников. */
  onSources(down: ReadonlySet<SourceId>): void;
}

/**
 * Адаптер клавиатуры: KeyboardEvent.code → источник `k:<code>`.
 * preventDefault() вызывается только для привязанных клавиш и только пока игра активна,
 * поэтому прокрутка страницы и браузерные сочетания вне игровой области не страдают.
 */
export class KeyboardInput {
  private readonly target: EventTarget;
  private readonly options: KeyboardInputOptions;
  private readonly down = new Set<SourceId>();

  constructor(target: EventTarget, options: KeyboardInputOptions) {
    this.target = target;
    this.options = options;
  }

  attach(): void {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.releaseAll();
  }

  /** Забыть все удерживаемые клавиши (потеря фокуса, скрытие вкладки). */
  releaseAll(): void {
    if (this.down.size === 0) return;
    this.down.clear();
    this.options.onSources(this.down);
  }

  private readonly onKeyDown: EventListener = (raw): void => {
    const event = raw as unknown as KeyEventLike;
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!this.options.isActive() || isInteractiveTarget(event.target)) return;
    const source = keySource(event.code);
    if (!this.options.isBound(source)) return;
    event.preventDefault();
    if (event.repeat) return; // повтор определяют правила игры, а не key-repeat ОС
    if (this.down.has(source)) return;
    this.down.add(source);
    this.options.onSources(this.down);
  };

  private readonly onKeyUp: EventListener = (raw): void => {
    const event = raw as unknown as KeyEventLike;
    const source = keySource(event.code);
    if (!this.down.has(source)) return;
    this.down.delete(source);
    this.options.onSources(this.down);
    if (this.options.isActive()) event.preventDefault();
  };
}
