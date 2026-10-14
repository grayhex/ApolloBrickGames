import type { Theme } from '../input/settings';

/** Фон страницы: атрибут на `<html>` переключает переменные цвета в styles.css. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
}

/** Технические страницы (редактор, демо движка, лист ресурсов) всегда тёмные. */
export function clearTheme(): void {
  delete document.documentElement.dataset['theme'];
}
