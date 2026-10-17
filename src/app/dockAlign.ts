/**
 * Верхняя панель настроек (клавиатура, пауза, настройки, фон, язык, справка) встаёт над левой панелью справки: по её центру и по её ширине.
 * Так обе панели выглядят одним столбцом. Это только на широком окне, где справка стоит слева; на узком панель настроек остаётся в углу.
 */
const WIDE = '(min-width: 1200px)';

export function alignDock(signal?: AbortSignal): void {
  const dock = document.getElementById('topleft');
  const panel = document.getElementById('side-info');
  if (!dock || !panel) return;
  const apply = (): void => {
    const rect = panel.getBoundingClientRect();
    if (window.matchMedia(WIDE).matches && rect.width > 0) {
      dock.style.setProperty('--dock-left', `${Math.round(rect.left)}px`);
      dock.style.setProperty('--dock-width', `${Math.round(rect.width)}px`);
      dock.dataset['aligned'] = '';
    } else {
      dock.style.removeProperty('--dock-left');
      dock.style.removeProperty('--dock-width');
      delete dock.dataset['aligned'];
    }
  };
  const observer = new ResizeObserver(apply);
  observer.observe(panel);
  window.addEventListener('resize', apply, signal ? { signal } : undefined);
  signal?.addEventListener('abort', () => observer.disconnect());
  apply();
  requestAnimationFrame(apply); // раскладка страницы окончательно устанавливается после первого кадра
}
