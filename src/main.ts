import './styles.css';
import { startApp } from './app/app';
import { parseRoute } from './app/routes';
import { startSheet } from './app/sheet';
import { clearTheme } from './app/theme';

const route = parseRoute(window.location.hash);
// Вид страницы: игрушка (комната, клип) выставляет startApp; контрольный лист и редактор — технические страницы.
if (route === 'sheet' || route === 'editor') document.body.dataset['chrome'] = 'tech';
// Светлый фон — только у игрушки; технические страницы всегда тёмные (index.html ставит тему заранее, до загрузки данных).
if (route !== 'room') clearTheme();
// Смена маршрута — простая перезагрузка: у каждого маршрута свой пакет данных и свои обработчики.
window.addEventListener('hashchange', () => window.location.reload());

const start =
  route === 'sheet'
    ? startSheet()
    : route === 'editor'
      ? import('./editor/ui/editorApp').then((module) => module.startEditor())
      : startApp(route);

start.catch((error: unknown) => {
  const box = document.getElementById('fatal');
  const text = document.getElementById('fatal-text');
  if (box && text) {
    box.hidden = false;
    text.textContent = error instanceof Error ? error.message : String(error);
  }
  console.error(error);
});
