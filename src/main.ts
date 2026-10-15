import './styles.css';
import { startApp } from './app/app';
import { parseRoute } from './app/routes';
import { mountToySwitch } from './app/toySwitch';
import { parseToy, TOYS } from './app/toys';
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

// Игрушка выбирается адресом `?toy=…`; шапка с логотипом и переключателем — только у страницы игрушки (комнаты).
const toy = parseToy(window.location.search);
if (route === 'room') {
  const nav = document.getElementById('toy-switch');
  if (nav) mountToySwitch(nav, toy);
}

const start =
  route === 'sheet'
    ? startSheet()
    : route === 'editor'
      ? import('./editor/ui/editorApp').then((module) => module.startEditor())
      : route === 'room' && TOYS[toy].game === 'tetris'
        ? import('./app/tetrisApp').then((module) => module.startTetrisApp(toy))
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
