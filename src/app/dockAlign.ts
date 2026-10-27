/**
 * Верхняя панель настроек (клавиатура, пауза, настройки, фон, язык, справка) встаёт в правый столбец над картинкой сайта и пультом: по тому же центру и по
 * той же ширине, что у пульта справа. Так три блока — панель настроек, картинка и пульт — выглядят одним столбцом одной ширины. Это только на широком окне, где
 * пульт стоит справа; на узком панель настроек остаётся в левом углу, а картинка сайта — в правом.
 */
const WIDE = '(min-width: 1200px)';

export function alignDock(signal?: AbortSignal): void {
  const dock = document.getElementById('topleft');
  const panel = document.getElementById('side-ctl');
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
