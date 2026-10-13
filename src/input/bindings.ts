import { ACTIONS, actionBit, type Action, type ActionMask } from '../core/actions';

/**
 * Физический источник ввода — строка:
 *   k:<KeyboardEvent.code>   клавиша (по коду, а не по символу: раскладка не мешает)
 *   b:<индекс>               кнопка геймпада
 *   a:<индекс>:<+|->         направление оси геймпада
 */
export type SourceId = string;

export type Bindings = Record<Action, SourceId[]>;
export type CompiledBindings = ReadonlyMap<SourceId, ActionMask>;

const SOURCE_PATTERN = /^(k:[A-Za-z0-9_+-]{1,32}|b:\d{1,3}|a:\d{1,2}:[+-])$/;

export const keySource = (code: string): SourceId => `k:${code}`;
export const buttonSource = (index: number): SourceId => `b:${index}`;
export const axisSource = (index: number, direction: '+' | '-'): SourceId => `a:${index}:${direction}`;

export const isValidSource = (id: unknown): id is SourceId => typeof id === 'string' && SOURCE_PATTERN.test(id);
export const isKeyboardSource = (id: SourceId): boolean => id.startsWith('k:');
export const isGamepadSource = (id: SourceId): boolean => id.startsWith('b:') || id.startsWith('a:');

export function emptyBindings(): Bindings {
  return Object.fromEntries(ACTIONS.map((action) => [action, []])) as unknown as Bindings;
}

export function cloneBindings(bindings: Bindings): Bindings {
  return Object.fromEntries(ACTIONS.map((action) => [action, [...bindings[action]]])) as unknown as Bindings;
}

/**
 * Веб-раскладка по умолчанию (предложение из ТЗ, не утверждение о поведении оригинала).
 * Один физический ввод может давать несколько действий: Enter — и start, и confirm;
 * какое из них сработает, решает контекст (игра или меню), см. app.
 */
export const DEFAULT_KEYBOARD_BINDINGS: Bindings = {
  left: ['k:ArrowLeft', 'k:KeyA'],
  right: ['k:ArrowRight', 'k:KeyD'],
  up: ['k:ArrowUp', 'k:KeyW'],
  down: ['k:ArrowDown', 'k:KeyS'],
  jump: ['k:Space', 'k:KeyZ'],
  fire: ['k:KeyX'],
  start: ['k:Enter'],
  pause: ['k:Escape', 'k:KeyP'],
  confirm: ['k:Enter', 'k:Space'],
  back: ['k:Escape', 'k:KeyP'],
};

/**
 * Геймпад с mapping === "standard": D-pad/левый стик — направления,
 * нижняя лицевая кнопка (buttons[0]) — прыжок/подтверждение, левая (buttons[2]) — огонь,
 * Start (buttons[9]) — старт/пауза, buttons[1] — «назад» в меню.
 * Для нестандартного mapping автоматической раскладки нет — только настройка.
 */
export const DEFAULT_STANDARD_GAMEPAD_BINDINGS: Bindings = {
  left: ['b:14', 'a:0:-'],
  right: ['b:15', 'a:0:+'],
  up: ['b:12', 'a:1:-'],
  down: ['b:13', 'a:1:+'],
  jump: ['b:0'],
  fire: ['b:2'],
  start: ['b:9'],
  pause: ['b:9'],
  confirm: ['b:0'],
  back: ['b:1'],
};

const compiledCache = new WeakMap<Bindings, { signature: string; compiled: CompiledBindings }>();

/** source → маска действий. Результат кэшируется до изменения привязок. */
export function compileBindings(bindings: Bindings): CompiledBindings {
  const signature = JSON.stringify(bindings);
  const cached = compiledCache.get(bindings);
  if (cached && cached.signature === signature) return cached.compiled;
  const compiled = new Map<SourceId, ActionMask>();
  for (const action of ACTIONS) {
    for (const source of bindings[action]) {
      compiled.set(source, (compiled.get(source) ?? 0) | actionBit(action));
    }
  }
  compiledCache.set(bindings, { signature, compiled });
  return compiled;
}

/** Объединение действий от всех активных источников (логическое ИЛИ). */
export function maskOfSources(sources: Iterable<SourceId>, compiled: CompiledBindings): ActionMask {
  let mask = 0;
  for (const source of sources) mask |= compiled.get(source) ?? 0;
  return mask;
}

/** Все источники, у которых есть хоть одна привязка. */
export function boundSources(bindings: Bindings): Set<SourceId> {
  return new Set(compileBindings(bindings).keys());
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Пробел',
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Tab: 'Tab',
  ShiftLeft: 'Shift (лев.)',
  ShiftRight: 'Shift (прав.)',
};

/** Человекочитаемое имя источника для настроек. */
export function describeSource(id: SourceId): string {
  if (id.startsWith('k:')) {
    const code = id.slice(2);
    const label = KEY_LABELS[code];
    if (label) return label;
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    return code;
  }
  if (id.startsWith('b:')) return `Кнопка ${id.slice(2)}`;
  if (id.startsWith('a:')) {
    const [, index, direction] = id.split(':');
    return `Ось ${index} ${direction === '-' ? '−' : '+'}`;
  }
  return id;
}

/** Проверка и очистка привязок из внешних данных (localStorage). */
export function sanitizeBindings(
  raw: unknown,
  fallback: Bindings,
  accept: (id: SourceId) => boolean,
): Bindings {
  const result = emptyBindings();
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  for (const action of ACTIONS) {
    const value = record[action];
    if (Array.isArray(value)) {
      const ids = value.filter((id): id is SourceId => isValidSource(id) && accept(id));
      result[action] = [...new Set(ids)].slice(0, 8);
    } else {
      result[action] = [...fallback[action]];
    }
  }
  return result;
}
