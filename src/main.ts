import './styles.css';
import { startApp } from './app/app';
import { startHost } from './app/host';
import { parseRoute } from './app/routes';
import { parseToy } from './app/toys';
import { startSheet } from './app/sheet';
import { clearTheme } from './app/theme';

const route = parseRoute(window.location.hash);
// Вид страницы: игрушка (комната, клип) выставляет startApp; контрольный лист и редактор — технические страницы.
if (route === 'sheet' || route === 'editor') {
  document.body.dataset['chrome'] = 'tech';
  delete document.body.dataset['booting']; // у технических страниц нет раскладки игрушки, которую надо прятать до готовности
}
// Светлый фон — только у игрушки; технические страницы всегда тёмные (index.html ставит тему заранее, до загрузки данных).
if (route !== 'room') clearTheme();
// Смена маршрута — простая перезагрузка: у каждого маршрута свой пакет данных и свои обработчики.
window.addEventListener('hashchange', () => window.location.reload());

// Страница игрушки (комната): хозяин страницы запускает игрушку из адреса `?toy=…` (без параметра — Crocodile Mario) и меняет игрушки на месте,
// без перезагрузки (шапка с логотипом и переключателем — тоже его). Техническое демо запускается напрямую: оно одно и не переключается.
const start: Promise<unknown> =
  route === 'sheet'
    ? startSheet()
    : route === 'editor'
      ? import('./editor/ui/editorApp').then((module) => module.startEditor())
      : route === 'room'
        ? startHost(parseToy(window.location.search))
        : startApp(route);

start.catch((error: unknown) => {
  delete document.body.dataset['booting']; // страница показывается и при сбое запуска: виден блок ошибки
  const box = document.getElementById('fatal');
  const text = document.getElementById('fatal-text');
  if (box && text) {
    box.hidden = false;
    text.textContent = error instanceof Error ? error.message : String(error);
  }
  console.error(error);
});
