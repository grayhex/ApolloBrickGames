import { DEFAULT_LANG, type Lang } from '../input/lang';
import { MESSAGES, type MsgKey } from './messages';

export type { MsgKey } from './messages';

let current: Lang = DEFAULT_LANG;
const listeners = new Set<(lang: Lang) => void>();

export const getLang = (): Lang => current;

/** Сменить язык интерфейса; подписчики перерисовывают свои тексты. Тот же язык — ничего не происходит. */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  for (const listener of listeners) listener(lang);
}

/** Подписка на смену языка; возвращает функцию отписки. */
export function onLangChange(listener: (lang: Lang) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Текст по ключу на текущем языке; `{имя}` заменяется значением из `vars`. */
export function t(key: MsgKey, vars?: Readonly<Record<string, string | number>>): string {
  const text = MESSAGES[current][key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Разбор текста с выделениями: `**жирный**` — отдельный кусок с `bold: true`. Чистая функция (без DOM). */
export function richParts(text: string): { text: string; bold: boolean }[] {
  const parts: { text: string; bold: boolean }[] = [];
  text.split(/\*\*(.+?)\*\*/g).forEach((part, index) => {
    if (part !== '') parts.push({ text: part, bold: index % 2 === 1 });
  });
  return parts;
}

/** Текст с выделениями для вставки в DOM: `**жирный**` превращается в `<b>`. Разметка не интерпретируется — только эти звёздочки. */
export function rich(text: string): (Node | string)[] {
  return richParts(text).map((part) => {
    if (!part.bold) return part.text;
    const bold = document.createElement('b');
    bold.textContent = part.text;
    return bold;
  });
}

/**
 * Статические подписи из index.html: `data-i18n="ключ"` — текст элемента,
 * `data-i18n-attrs="aria-label=ключ;title=ключ"` — атрибуты. Вызывается при запуске и при смене языка.
 */
export function applyStatic(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset['i18n'] as MsgKey | undefined;
    if (key && key in MESSAGES.ru) element.textContent = t(key);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-attrs]')) {
    for (const pair of (element.dataset['i18nAttrs'] ?? '').split(';')) {
      const [attr, key] = pair.split('=');
      if (attr && key && key in MESSAGES.ru) element.setAttribute(attr.trim(), t(key.trim() as MsgKey));
    }
  }
}
