import { adminLeaderboards } from './leaderboards';
import './admin.css';
import { TOYS } from '../app/toys';
import { GAMES, type GameId } from '../games/catalog';
import { BRICK_GAMES } from '../brick/games';
import { canAssign } from '../app/bodyButtons';
import { APOLLO_SHELLS, MONOBLOCK_SHELLS, type Shell } from '../input/settings';
import { defaultConfig } from '../config/runtime';
import { validateConfig, universalGames, thumbPalette, CONFIG_TOY_IDS, type ConfigToyId } from '../config/schema';
import { BRICK_GUIDES } from '../brick/guides';
import type { Lang } from '../input/lang';
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] { const e = document.createElement(tag); e.textContent = text; e.className = className; return e; }
function button(text: string, fn: () => void, disabled = false): HTMLButtonElement { const b = el('button',text); b.type = 'button'; b.disabled = disabled; b.addEventListener('click',fn); return b; }
const colors: Record<Shell,string> = { blue:'Синий',red:'Красный',yellow:'Жёлтый',white:'Белый',gray:'Серый',black:'Чёрный' };
export async function startAdmin(): Promise<void> {
  document.title = 'Apollo · Настройки коллекции'; document.body.dataset['chrome'] = 'tech'; delete document.body.dataset['booting'];
  const root = el('main','','admin'); document.body.replaceChildren(root);
  let config = defaultConfig(), revision = 0, active: ConfigToyId = 'mario', dirty = false, busy = false, connected = false;
  const header = el('header','','admin__header'); header.append(el('div','BRICK GAME / STUDIO','admin__eyebrow'),el('h1','Ваша коллекция. Ваши игры.'),el('p','Соберите меню каждой приставки, выберите доступные цвета и опубликуйте настройки для всех игроков.'));
  const back = el('a','Открыть коллекцию ↗'); back.href = import.meta.env.BASE_URL; header.append(back); root.append(header);
  const status = el('p','Загрузка конфигурации…','admin__status'); status.setAttribute('role','status'); root.append(status);
  const general = el('section','','admin__card admin__general'); root.append(general);
  const tabs = el('nav','','admin__tabs'); tabs.setAttribute('aria-label','Приставки'); root.append(tabs);
  const content = el('section','','admin__content'); root.append(content);
  const footer = el('section','','admin__publish');
  const keyLabel = el('label','Ключ администратора'); const key = el('input'); key.type = 'password'; key.autocomplete = 'off'; key.placeholder = 'ADMIN_TOKEN'; keyLabel.append(key);
  const save = button('Опубликовать',() => void publish());
  const exportButton = button('Скачать JSON',() => {
    const blob = new Blob([JSON.stringify(validateConfig(config),null,2)+'\n'],{ type:'application/json' }); const url = URL.createObjectURL(blob); const link = el('a'); link.href = url; link.download = 'default.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    message('Файл готов. Для публикации через Git замените src/config/default.json и выполните обычный деплой.');
  });
  const upload = el('input'); upload.type = 'file'; upload.accept = 'application/json,.json'; upload.id = 'config-import';
  const importLabel = el('label','Импорт JSON','admin__import'); importLabel.htmlFor = upload.id; importLabel.append(upload);
  upload.addEventListener('change',() => void (async () => { const file = upload.files?.[0]; if (!file) return; try { if (file.size > 65536) throw new Error('Файл больше 64 КБ.'); config = validateConfig(JSON.parse(await file.text())); changed(); render(); message('Файл проверен и загружен в черновик. Для общего доступа нажмите «Опубликовать».'); } catch(error) { message(String(error),true); } upload.value = ''; })());
  const reload = button('Загрузить опубликованную',() => { if (!dirty || window.confirm('Заменить несохранённый черновик опубликованной конфигурацией?')) void load(); });
  const reset = button('Вернуть набор из репозитория',() => { if (window.confirm('Заменить черновик исходной конфигурацией? Публикация выполняется отдельно.')) { config = defaultConfig(); changed(); render(); } });
  footer.append(el('h2','Публикация'),el('p','Ключ хранится только в этой открытой вкладке. Изменения вступят в силу при следующем открытии коллекции.'),keyLabel,save,exportButton,importLabel,reload,reset); root.append(footer);
  window.addEventListener('beforeunload',(event) => { if (dirty) event.preventDefault(); });
  function setBusy(value: boolean): void { busy = value; content.inert = value; tabs.inert = value; footer.inert = value; save.disabled = value || !connected; }
  function message(text: string, error = false): void { status.textContent = text; status.dataset['error'] = String(error); }
  function changed(): void { dirty = true; message('Есть неопубликованные изменения.'); }
  function option(value: string, text: string): HTMLOptionElement { const o = el('option',text); o.value = value; return o; }
  function render(): void {
    const languageLabel = el('label','Язык по умолчанию'); const languageSelect = el('select'); languageSelect.setAttribute('aria-label','Язык по умолчанию'); languageSelect.append(option('ru','Русский'),option('en','English')); languageSelect.value = config.language;
    languageSelect.addEventListener('change',() => { config.language = languageSelect.value as Lang; changed(); }); languageLabel.append(languageSelect);
    general.replaceChildren(el('h2','Общие настройки'),el('p','Язык интерфейса для тех, кто ещё не выбирал его кнопкой RU / EN. Выбор игрока важнее.','admin__eyebrow'),languageLabel);
    tabs.replaceChildren(...CONFIG_TOY_IDS.map((id) => { const b = button(TOYS[id].name,() => { active = id; render(); }); b.setAttribute('aria-pressed',String(active === id)); return b; }));
    content.replaceChildren(); const toy = config.toys[active];
    const appearance = el('section','','admin__card'); appearance.append(el('h2',TOYS[active].name),el('p','Цвета корпуса','admin__eyebrow'));
    const swatches = el('div','','admin__swatches');
    for (const color of active === 'brickgame' ? MONOBLOCK_SHELLS : APOLLO_SHELLS) {
      const label = el('label',colors[color]); const input = el('input'); input.type = 'checkbox'; input.checked = toy.shells.includes(color); input.setAttribute('aria-label',`Доступен цвет: ${colors[color]}`); label.dataset['color'] = color;
      input.addEventListener('change',() => { if (!input.checked && toy.shells.length === 1) { input.checked = true; message('Оставьте хотя бы один цвет.',true); return; } toy.shells = input.checked ? [...toy.shells,color] : toy.shells.filter((s) => s !== color); if (!toy.shells.includes(toy.defaultShell)) toy.defaultShell = toy.shells[0]!; changed(); render(); }); label.prepend(input); swatches.append(label);
    }
    const defaultLabel = el('label','Основной цвет'); const defaultSelect = el('select'); defaultSelect.setAttribute('aria-label','Основной цвет'); defaultSelect.append(...toy.shells.map((s) => option(s,colors[s]))); defaultSelect.value = toy.defaultShell;
    defaultSelect.addEventListener('change',() => { toy.defaultShell = defaultSelect.value as Shell; changed(); }); defaultLabel.append(defaultSelect); appearance.append(swatches,defaultLabel);
    const thumbLabel = el('label','Цвет миниатюры в карусели'); const thumbSelect = el('select'); thumbSelect.setAttribute('aria-label','Цвет миниатюры в карусели'); thumbSelect.append(...thumbPalette(active).map((s) => option(s,colors[s]))); thumbSelect.value = toy.thumbShell;
    thumbSelect.addEventListener('change',() => { toy.thumbShell = thumbSelect.value as Shell; changed(); }); thumbLabel.append(thumbSelect); appearance.append(thumbLabel);
    const music = el('div','','admin__music'); const musicButton = button('Загрузка однобитной мелодии — позже',() => {},true); music.append(el('h3','Мелодия'),el('p','Здесь появится импорт простой однобитной мелодии для этой приставки.'),musicButton); appearance.append(music); content.append(appearance);
    const menu = el('section','','admin__card'); menu.append(el('h2',`Меню · ${toy.games.length}`));
    if (active === 'mario') menu.append(el('p','У Mario собственный сегментный экран. Сейчас доступен Mario; оригинальные Tetris и Shooting подключим позже. Игры матрицы 10×20 назначаются матричным приставкам.'));
    if (active === 'brickgame') {
      const automatic = universalGames(config).filter(g => !toy.games.some(p => p.id === g.id));
      const extra = el('details'); extra.append(el('summary',`Автоматически · ${automatic.length}`), el('p','Игры, не назначенные другим приставкам, появляются здесь автоматически. Закрепите игру в меню ниже, чтобы оставить её независимо от остальных назначений.'),el('p',automatic.map(g => GAMES[g.id].names.ru).join(' · '))); menu.append(extra);
    }
    const firstLabel = el('label','Выбрана при включении'); const first = el('select'); first.setAttribute('aria-label','Выбрана при включении'); first.append(...toy.games.map((g) => option(g.id,GAMES[g.id].names.ru))); first.value = toy.defaultGame; first.addEventListener('change',() => { toy.defaultGame = first.value as GameId; changed(); }); firstLabel.append(first); menu.append(firstLabel);
    const list = el('ol','','admin__games');
    toy.games.forEach((game,index) => {
      const row = el('li'); row.dataset['game'] = game.id; const heading = el('strong',GAMES[game.id].names.ru); row.append(heading);
      const up = button('↑',() => { [toy.games[index-1],toy.games[index]] = [game,toy.games[index-1]!]; changed(); render(); },index === 0); up.setAttribute('aria-label',`Выше: ${heading.textContent}`);
      const down = button('↓',() => { [toy.games[index+1],toy.games[index]] = [game,toy.games[index+1]!]; changed(); render(); },index === toy.games.length-1); down.setAttribute('aria-label',`Ниже: ${heading.textContent}`);
      const remove = button('Удалить',() => { toy.games.splice(index,1); if (toy.defaultGame === game.id) toy.defaultGame = toy.games[0]!.id; changed(); render(); },toy.games.length === 1);
      const controls = el('div','','admin__row-actions'); controls.append(up,down,remove); row.append(controls);
      const def = BRICK_GAMES[game.id];
      if (def && def.modes.length > 1) {
        const label = el('label',`Варианты 1–${def.modes.length} (пусто — все)`); const modes = el('input'); modes.value = game.modes?.map((m) => m+1).join(', ') ?? ''; modes.placeholder = '1, 2, 3';
        modes.addEventListener('change',() => { const old = game.modes; if (!modes.value.trim()) delete game.modes; else game.modes = modes.value.split(',').map((n) => Number(n.trim())-1); try { validateConfig(config); modes.setCustomValidity(''); changed(); } catch(error) { game.modes = old; modes.setCustomValidity(String(error)); modes.reportValidity(); modes.value = old?.map((m) => m+1).join(', ') ?? ''; } }); label.append(modes); row.append(label);
      }
      const guide = BRICK_GUIDES[game.id]; if (guide) { const details = el('details'); details.append(el('summary','Правила и статус'),el('p',guide.goal.ru),...guide.rules.map((r) => el('p',r.ru)),el('p','Реализована. Правила и допущения уточняются по источникам.')); row.append(details); }
      list.append(row);
    }); menu.append(list);
    if (active === 'mario') { const editor = el('a','Открыть редактор уровней Mario ↗','admin__editor'); editor.href = `${import.meta.env.BASE_URL}?toy=mario#/editor`; appearance.append(editor); }
    if (active === 'mario') { const future = el('div','','admin__music'); future.append(el('h3','Оригинальные игры · позже'),el('p','TETRIS (99) — ожидает реализации'),el('p','SHOOTING (1) — ожидает реализации')); menu.append(future); }
    const add = el('select'); add.setAttribute('aria-label','Добавить игру'); const available = Object.values(GAMES).filter((g) => (active === 'mario' ? g.id === 'mario' : g.engine === 'brick' && BRICK_GAMES[g.id] && canAssign(BRICK_GAMES[g.id]!, TOYS[active])) && !toy.games.some((i) => i.id === g.id)); add.append(...available.map((g) => option(g.id,g.names.ru))); add.disabled = !available.length;
    menu.append(add,button('Добавить в меню',() => { if (!add.value) return; toy.games.push({ id:add.value as GameId }); changed(); render(); },!available.length)); content.append(menu);
    save.disabled = busy || !connected;
  }
  async function load(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/config`,{ cache:'no-store', signal:AbortSignal.timeout(10000) });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Серверное хранилище недоступно. Можно редактировать и скачать JSON для репозитория.');
      const data = await response.json() as { config:unknown; revision:number }; config = validateConfig(data.config); if (!Number.isInteger(data.revision)) throw new Error('Недопустимая ревизия.'); revision = data.revision; connected = true; dirty = false;
      message(`Опубликованная конфигурация · ревизия ${revision}`);
    } catch(error) { connected = false; message(String(error)); }
    finally { setBusy(false); render(); }
  }
  async function publish(): Promise<void> {
    if (busy || !connected) return; setBusy(true);
    try {
      const clean = validateConfig(config);
      const response = await fetch(`${import.meta.env.BASE_URL}api/admin/config`,{ method:'PUT',signal:AbortSignal.timeout(10000),headers:{ 'Content-Type':'application/json',Authorization:`Bearer ${key.value}` },body:JSON.stringify({ revision,config:clean }) });
      const data = await response.json() as { error?:string; revision:number };
      if (!response.ok) throw new Error(data.error ?? `Ошибка ${response.status}`);
      revision = data.revision; dirty = false; key.value = ''; message(`Опубликовано для всех игроков · ревизия ${revision}`);
    } catch(error) { message(String(error),true); }
    finally { setBusy(false); }
  }
  adminLeaderboards(root,key);
  render(); await load();
}
