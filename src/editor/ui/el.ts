export type Props = Record<string, string | number | boolean | null | undefined>;
export type Kid = Node | string | null | false | undefined;

/** Построение DOM без innerHTML: текст никогда не интерпретируется как разметка. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Kid[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== false && child !== undefined) node.append(child);
  return node;
}

export function button(label: string, onClick: () => void, props: Props = {}): HTMLButtonElement {
  const node = el('button', { type: 'button', class: 'btn', ...props }, label);
  node.addEventListener('click', onClick);
  return node;
}

export interface FieldOptions {
  /** Ключ для возврата фокуса после перерисовки панели. */
  key: string;
  title?: string;
}

/** Подпись + поле: удобная обёртка для панелей свойств. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return el('label', { class: 'field' }, el('span', { class: 'field__label' }, label), control, hint ? el('small', { class: 'field__hint' }, hint) : null);
}

export function numberInput(
  key: string,
  value: number,
  options: { min?: number; max?: number; step?: number; onCommit: (value: number) => void; disabled?: boolean },
): HTMLInputElement {
  const input = el('input', {
    type: 'number',
    'data-field': key,
    value: String(value),
    min: options.min,
    max: options.max,
    step: options.step ?? 1,
    disabled: options.disabled,
  });
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(next)) {
      input.value = String(value);
      return;
    }
    options.onCommit(next);
  });
  return input;
}

export function textInput(
  key: string,
  value: string,
  options: { maxLength?: number; onCommit: (value: string) => void; list?: string; placeholder?: string },
): HTMLInputElement {
  const input = el('input', {
    type: 'text',
    'data-field': key,
    value,
    maxlength: options.maxLength,
    list: options.list,
    placeholder: options.placeholder,
  });
  input.addEventListener('change', () => options.onCommit(input.value));
  return input;
}

export function selectInput(
  key: string,
  value: string,
  options: readonly { value: string; label: string }[],
  onCommit: (value: string) => void,
): HTMLSelectElement {
  const select = el('select', { 'data-field': key });
  for (const option of options) select.append(el('option', { value: option.value }, option.label));
  select.value = value;
  select.addEventListener('change', () => onCommit(select.value));
  return select;
}

export function checkbox(key: string, checked: boolean, label: string, onCommit: (value: boolean) => void): HTMLLabelElement {
  const input = el('input', { type: 'checkbox', 'data-field': key });
  input.checked = checked;
  input.addEventListener('change', () => onCommit(input.checked));
  return el('label', { class: 'check' }, input, label);
}

/** Запоминает поле в фокусе (по data-field) и возвращает функцию, которая вернёт на него фокус после перерисовки. */
export function keepFocus(container: HTMLElement): () => void {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && container.contains(active) ? active.dataset['field'] : undefined;
  return () => {
    if (!key) return;
    container.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  };
}

export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file'].includes(type);
  }
  return false;
}
