import { LeaderboardCard } from './leaderboard';
import { screenSize, type ContentPack } from '../content/schema';
import type { AudioPort } from '../audio/audio';
import { WebAudioPort } from '../audio/beeper';
import { remasterSources } from '../audio/remaster';
import { SoundDirector } from '../audio/director';
import {
  actionBit,
  actionsIn,
  createContext,
  DEMO_BEHAVIORS,
  Game,
  timerUnits,
  timerUnitTicks,
  validationEnv,
  type GameEvent,
  type InputFrame,
  type Phase,
} from '../core';
import { centerCamera, followCamera, type CameraArea, type CameraPos } from '../render/camera';
import { AssetStore } from '../render/assets';
import { GLYPH_NAMES } from '../render/glyphs';
import { effectsWorld, LevelEffects, NO_EFFECTS, type EffectsFrame } from '../render/effects';
import { Renderer } from '../render/renderer';
import { browserGamepadProvider, type GamepadStatus } from '../input/gamepad';
import { openIndexedDbStore, type DraftStore } from '../editor/drafts';
import { loadUserLevels, type LibraryTarget, type UserLevel } from '../editor/library';
import { browserStorage, musicVolumeOf, needsGamepadSetup, THEMES, type Music, type Shell } from '../input/settings';
import { LANGS } from '../input/lang';
import { boundSources, keySource } from '../input/bindings';
import { CableGlitch } from './cableGlitch';
import { ControlPanel, type ControlPanelActions } from './controlPanel';
import { CornerNav } from './cornerNav';
import { openEncyclopedia } from './help';
import { applyStatic, getLang, setLang, t } from './i18n';
import { InfoPanel } from './infoPanel';
import { InputHub } from './hub';
import { onInputLock } from './inputLock';
import { ledState, type LedState } from './leds';
import { bundledLevels, originalPack, originalSlots, refAfterLevelStart, startingLevel, userPack, type LevelRef } from './levels';
import { Lifecycle, type AppHandle, type Carry } from './lifecycle';
import { GAME_ROUTES } from './routes';
import { loadContentPack } from './loadContent';
import { EntryScript } from './entry';
import { GameSession } from './session';
import { SettingsDialog } from './settingsUi';
import { Speedrun } from './speedrun';
import { applyTheme } from './theme';
import { ToyPanel } from './toy';
import { FixedStepper } from './stepper';
import { shellFor, TOYS } from './toys';
import { parseView, type View } from './view';
import {
  controlsHint,
  deviceView,
  gamepadStatusText,
  keyboardStatusText,
  overlayView,
  timerText,
  type SuspendReason,
} from './viewModel';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`В index.html нет элемента #${id}`);
  return element as T;
}

/** Записывает значение только если оно изменилось — чтобы не дёргать DOM каждый кадр. */
function cachedText(element: HTMLElement): (value: string) => void {
  let last: string | null = null;
  return (value) => {
    if (value === last) return;
    last = value;
    element.textContent = value;
  };
}

const NAV_UP = actionBit('up');
const NAV_DOWN = actionBit('down');
const NAV_CONFIRM = actionBit('confirm');
const NAV_BACK = actionBit('back');

function namesOf(mask: number): string {
  const names = actionsIn(mask);
  return names.length === 0 ? '—' : names.join(' ');
}

/** Ресурсы маршрута (пакет данных, картинки LCD) загружаются один раз: при смене игрушек на странице возврат к Crocodile Mario мгновенный. */
const loadedRoutes = new Map<string, Promise<{ pack: ContentPack; assetsUrl: string; assets: AssetStore; assetWarnings: string[] }>>();

function loadRoute(routeName: 'room' | 'tech'): Promise<{ pack: ContentPack; assetsUrl: string; assets: AssetStore; assetWarnings: string[] }> {
  const route = GAME_ROUTES[routeName];
  const manifestUrl = new URL(`${import.meta.env.BASE_URL}${route.manifest}`, window.location.href).href;
  let loading = loadedRoutes.get(manifestUrl);
  if (!loading) {
    loading = (async () => {
      const { pack, assetsUrl } = await loadContentPack(manifestUrl, validationEnv(DEMO_BEHAVIORS, GLYPH_NAMES));
      const assets = new AssetStore(pack.assets, assetsUrl, pack.screen.colors.ink);
      const assetWarnings = await assets.load();
      return { pack, assetsUrl, assets, assetWarnings };
    })();
    loadedRoutes.set(manifestUrl, loading);
    // Сбой загрузки не кэшируется: следующий запуск попробует снова.
    loading.catch(() => loadedRoutes.delete(manifestUrl));
  }
  return loading;
}

/** Заранее подгружает данные и картинки Crocodile Mario (пока играют в другую игрушку), чтобы переключение на него не ждало сеть. */
export function preloadRoom(): Promise<void> {
  return loadRoute('room').then(() => undefined);
}

/**
 * Запуск Crocodile Mario (или технической демоверсии). Возвращает хэндл: `dispose()` снимает всё, что приложение навесило на страницу, а `carry()` отдаёт
 * вид, цвет и питание — следующая игрушка продолжает с ними (см. `host.ts`). `carry` на входе — то же от прежней игрушки.
 */
export async function startApp(routeName: 'room' | 'tech', carryIn?: Carry): Promise<AppHandle> {
  const route = GAME_ROUTES[routeName];
  const life = new Lifecycle();
  const { signal } = life;
  let leaderboard: LeaderboardCard | null = null;
  let marioPartyStarted = false;
  const refs = {
    gameArea: byId<HTMLElement>('game-area'),
    stage: byId<HTMLElement>('stage'),
    arena: byId<HTMLElement>('arena'),
    sideInfo: byId<HTMLElement>('side-info'),
    sideCtl: byId<HTMLElement>('side-ctl'),
    lid: byId<HTMLElement>('lid'),
    toy: byId<HTMLElement>('toy'),
    base: byId<HTMLElement>('base'),
    cornerSettings: byId<HTMLButtonElement>('corner-settings'),
    cornerHelp: byId<HTMLButtonElement>('corner-help'),
    cornerLang: byId<HTMLButtonElement>('corner-lang'),
    cornerTheme: byId<HTMLButtonElement>('corner-theme'),
    devices: byId<HTMLElement>('devices'),
    lidFront: byId<HTMLElement>('lid-front'),
    lidCover: byId<HTMLButtonElement>('lid-cover'),
    lower: byId<HTMLElement>('lower'),
    boxDialog: byId<HTMLDialogElement>('box-dialog'),
    srStatus: byId<HTMLElement>('sr-status'),
    lcdWindow: byId<HTMLElement>('lcd-window'),
    canvas: byId<HTMLCanvasElement>('screen'),
    overlay: byId<HTMLElement>('overlay'),
    overlayTitle: byId<HTMLElement>('overlay-title'),
    overlayHint: byId<HTMLElement>('overlay-hint'),
    overlayAction: byId<HTMLButtonElement>('overlay-action'),
    focusHint: byId<HTMLElement>('focus-hint'),
    badge: byId<HTMLElement>('badge'),
    subtitle: byId<HTMLElement>('subtitle'),
    rowTimer: byId<HTMLElement>('row-timer'),
    controlsHint: byId<HTMLElement>('controls-hint'),
    debugToggle: byId<HTMLElement>('debug-toggle'),
    ghostToggle: byId<HTMLElement>('ghost-toggle'),
    chkGhost: byId<HTMLInputElement>('chk-ghost'),
    chkSound: byId<HTMLInputElement>('chk-sound'),
    routeLink: byId<HTMLAnchorElement>('route-link'),
    btnPause: byId<HTMLButtonElement>('btn-pause'),
    btnRestart: byId<HTMLButtonElement>('btn-restart'),
    btnSettings: byId<HTMLButtonElement>('btn-settings'),
    chkDebug: byId<HTMLInputElement>('chk-debug'),
    statusKeyboard: byId<HTMLElement>('status-keyboard'),
    statusGamepad: byId<HTMLElement>('status-gamepad'),
    statusTimer: byId<HTMLElement>('status-timer'),
    statusWarning: byId<HTMLElement>('status-warning'),
    statusContent: byId<HTMLElement>('status-content'),
    debug: byId<HTMLElement>('debug'),
    debugText: byId<HTMLElement>('debug-text'),
    chkGrid: byId<HTMLInputElement>('chk-grid'),
    chkCollisions: byId<HTMLInputElement>('chk-collisions'),
    btnStep: byId<HTMLButtonElement>('btn-step'),
    btnDebugRestart: byId<HTMLButtonElement>('btn-debug-restart'),
    settings: byId<HTMLDialogElement>('settings'),
  };

  // Вид страницы: игрушка (комната, клип) или техническая страница. `?debug` возвращает панели разработчика.
  document.body.dataset['chrome'] = route.lid ? 'toy' : 'tech';
  if (new URLSearchParams(window.location.search).has('debug')) {
    document.body.dataset['debug'] = '';
    // Отладка (`?debug`): текущая игра ядра доступна из консоли и тестов как `window.__game` (телепорт героя, проверка состояния) — продукт её не использует.
    Object.defineProperty(window, '__game', { configurable: true, get: () => game });
  }
  if (!route.lid) document.title = 'Crocodile Mario — движок (демо)';

  // Подписи маршрута ставятся до загрузки данных, чтобы страница не «мигала».
  refs.badge.textContent = route.badge;
  refs.subtitle.textContent = route.subtitle;
  refs.btnRestart.textContent = route.restartLabel;
  refs.routeLink.href = route.otherRoute.hash;
  refs.routeLink.textContent = route.otherRoute.label;
  // Отладка — для разработки: в основной комнате флажок скрыт, `?debug` его возвращает.
  refs.debugToggle.hidden = routeName !== 'tech' && !new URLSearchParams(window.location.search).has('debug');

  // ── Данные: статические JSON, проверка при загрузке ──────────────────────
  const { pack, assets, assetWarnings } = await loadRoute(routeName);
  for (const warning of assetWarnings) console.warn(warning);

  // Контекст, игра, эффекты, сценарий входа и сессия пересоздаются при выборе другого уровня (см. launch).
  const params = new URLSearchParams(window.location.search);
  // Вид игрушки: всегда начинается закрытой (не сохраняется); `?view=full|screen` и `?power=on` открывают сразу — для ссылок и тестов.
  // Игрушка, на которую перешли с другой на странице, продолжает с тем же видом и питанием (`carryIn`).
  let view: View = route.lid ? (carryIn?.view ?? parseView(params.get('view'), params.get('power') === 'on')) : 'full';
  // Питание (ON/OFF): игрушка при открытии страницы выключена; `?power=on` включает сразу. Технические страницы всегда включены.
  let powered = !route.lid || (carryIn ? carryIn.powered : params.get('power') === 'on');
  if (powered && view === 'closed') view = 'full'; // включённая игрушка не бывает закрытой, даже по адресу `?view=closed&power=on`
  const start = startingLevel(pack, params.get('level')); // `?level=N` открывает уровень N (1–9) сразу
  let ctx = createContext(start.pack);
  const seed = Number.parseInt(params.get('seed') ?? '', 10) || 1;
  let game = new Game(ctx, seed);
  const renderer = new Renderer(refs.canvas, pack.screen, assets);
  // Презентационные эффекты (отскок перекладины, интро участка) — только отрисовка, симуляцию не меняют.
  let effects = new LevelEffects(pack.animations ?? null, { viewport: pack.screen.viewport, intro: true });
  let fx: EffectsFrame = NO_EFFECTS;
  const { sprites } = pack.manifest;
  refs.rowTimer.hidden = ctx.rules.params.timerLimitTicks <= 0;
  const contentLine = (source: ContentPack): string =>
    `Контент: ${source.manifest.title} (id ${source.manifest.id}, v${source.manifest.version}); правила ${source.rules.id} v${source.rules.version}; ${ctx.rules.params.tickRateHz} тактов/с — значения демо, не установленные параметры оригинала.`;
  refs.statusContent.textContent = contentLine(pack);

  // ── Состояние оболочки ───────────────────────────────────────────────────
  let suspendReason: SuspendReason = null;
  let snapCamera = true;
  let camera: CameraPos = { x: 0, y: 0 };
  let gamepadStatus: GamepadStatus = { kind: 'none' };
  let fps = 0;
  let lastFrameTime: number | null = null;

  // Клавиатура принадлежит игре, пока не открыт диалог и фокус не в кнопке/поле страницы: на пустом месте
  // страницы или на игровой области клавиши работают без предварительного клика.
  const isKeyboardActive = (): boolean => {
    if (settingsDialog.isOpen || infoPanel?.boxOpen) return false;
    if (view === 'closed') return false; // пока крышка закрыта, игре клавиши не принадлежат: Enter или пробел открывают игрушку
    const active = document.activeElement;
    return active === null || active === document.body || refs.gameArea.contains(active);
  };

  const hub = new InputHub({
    keyboardTarget: window,
    provider: browserGamepadProvider(),
    storage: browserStorage(),
    isKeyboardActive,
    onGamepadStatus: (status) => {
      gamepadStatus = status;
      settingsDialog.refresh();
    },
    onGamepadDisconnect: () => suspend('gamepad'),
  });

  // Язык интерфейса игрушки (настройки, справка, панели): из настроек; подписи страницы следуют за ним на лету.
  if (route.lid) setLang(hub.settings.display.lang);
  const applyLangUi = (): void => {
    const lang = getLang();
    document.documentElement.lang = lang;
    if (!route.lid) return;
    applyStatic();
    refs.cornerLang.dataset['lang'] = lang;
    refs.cornerLang.setAttribute('aria-label', t('corner.lang'));
    refs.cornerLang.title = t('corner.langTitle');
  };
  applyLangUi();

  // Звук: мелодия и эффекты, восстановленные по записи со звуком (src/audio); включается настройкой и жестом пользователя (политика браузеров).
  // Музыка «Ремастер» — готовая запись public/audio/remaster.m4a (грузится при первом выборе; нет файла — звучит оригинал).
  const audio: AudioPort & { unlock(): void } = new WebAudioPort({
    muted: !hub.settings.display.sound,
    volume: hub.settings.display.volume,
    musicVolume: musicVolumeOf(hub.settings.display),
    // Opus в MP4 (лучше при том же размере) и запасная AAC; браузер, не играющий Opus (Safari старых версий), сразу берёт AAC.
    remaster: remasterSources(import.meta.env.BASE_URL, (type) => document.createElement('audio').canPlayType(type)),
  });
  life.onDispose(() => audio.dispose?.());
  const unlockAudio = (): void => audio.unlock();
  window.addEventListener('keydown', unlockAudio, { signal });
  window.addEventListener('pointerdown', unlockAudio, { signal });

  const stepper = new FixedStepper(1000 / ctx.rules.params.tickRateHz);

  const onEvents = (events: readonly GameEvent[]): void => {
    if(!marioPartyStarted&&events.some(event=>event.type==='phaseChanged'&&event.to==='playing'&&event.from==='ready')){
      marioPartyStarted = true;
      leaderboard?.select({gameId:'mario',mode:0,toyId:'mario'},currentLevel.kind==='original'&&game.state.levelId===slots.find(slot=>slot.number===1)?.levelId&&game.state.lives===ctx.rules.params.lives&&game.state.score===0);
      leaderboard?.begin();
    }
    if(events.some(event=>event.type==='secretLives')){leaderboard?.cancel();leaderboard?.select({gameId:'mario',mode:0,toyId:'mario'},false);}
    if(events.some(event=>event.type==='gameOver'||event.type==='gameCompleted')){
      leaderboard?.finish(game.state.score);
      marioPartyStarted = false;
    }
    for (const event of events) {
      if (event.type === 'levelStarted') {
        snapCamera = true;
        // Переход на следующий уровень после финиша: плитка на пульте следует за игрой.
        const shown = refAfterLevelStart(currentLevel, slots, event.levelId);
        if (shown !== currentLevel) {
          currentLevel = shown;
          applyDisplay();
        }
      }
      if (event.type === 'roomEntered' || event.type === 'roomLeft') snapCamera = true; // колодец: другой экран, камера сразу на героя
      speedrun.onEvent(event, game.state.worldTick);
      const world = effectsWorld(ctx, game.state);
      if (world) effects.onEvent(event, world);
      entry.onEvent(event);
      director.onEvent(event);
    }
  };

  let entry = new EntryScript(pack.animations?.entry);
  entry.arm(game.state.levelId);
  // События и фазы движка → эффекты и мелодия; мелодия ждёт конца сценария входа (там герой выпрыгивает из ямы).
  const director = new SoundDirector({
    audio,
    typeOf: (id) => ctx.levels.get(game.state.levelId)?.def.objects.find((object) => object.id === id)?.type ?? null,
    entryPending: (phase) => entry.pending(phase),
  });

  const makeSession = (): GameSession =>
    new GameSession({
      game,
      tracker: hub.tracker,
      stepper,
      entry,
      onEvents,
      onMenuInput: handleMenuInput,
      resetDevices: () => hub.resetDevices(),
    });
  let session = makeSession();

  const openMenu = (): void => {
    if (game.state.phase === 'playing') suspendReason = 'settings';
    session.suspend();
    session.setContext('menu');
  };
  const closeMenu = (): void => {
    session.setContext('game');
    infoPanel?.render(); // клавиши могли быть переназначены
    refocusGame();
  };

  const settingsDialog = new SettingsDialog(refs.settings, hub, {
    signal,
    onOpen: openMenu,
    onClose: closeMenu,
  });

  function refocusGame(): void {
    refs.gameArea.focus({ preventScroll: true });
  }

  /** Скрытие вкладки, потеря фокуса окна, отключение геймпада: пауза и очистка ввода/времени. */
  function suspend(reason: Exclude<SuspendReason, null>): void {
    if (game.state.phase === 'playing') suspendReason = reason;
    session.suspend();
  }

  /** Навигация по настройкам с геймпада: вверх/вниз — фокус, подтвердить — нажатие, назад — закрыть. */
  function handleMenuInput(frame: InputFrame): void {
    if (settingsDialog.capturing) return;
    const dialog = settingsDialog.isOpen ? refs.settings : infoPanel?.boxOpen ? refs.boxDialog : null;
    if (!dialog) return;
    if (frame.pressed & NAV_BACK) {
      settingsDialog.close();
      infoPanel?.closeBox();
      return;
    }
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select, input')];
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    if (frame.pressed & NAV_DOWN) focusable[(index + 1) % focusable.length]?.focus();
    if (frame.pressed & NAV_UP) focusable[(index - 1 + focusable.length) % focusable.length]?.focus();
    if (frame.pressed & NAV_CONFIRM) (document.activeElement as HTMLElement | null)?.click();
  }

  // ── События окна и интерфейса ────────────────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend('hidden');
    else void refreshUserLevels(); // карты могли измениться в редакторе в другой вкладке
  }, { signal });
  window.addEventListener('blur', () => suspend('blur'), { signal });
  onInputLock((locked) => { if (locked) suspend('picker'); }, signal); // открыт каталог устройств: партия на паузе
  window.addEventListener('gamepadconnected', () => hub.poll(), { signal });
  window.addEventListener('gamepaddisconnected', () => hub.poll(), { signal });
  hub.attach();
  life.onDispose(() => hub.detach());

  // Окно LCD: пропорции берутся из профиля экрана, Canvas вписывается в него без растяжения.
  const logical = screenSize(pack.screen);
  refs.lid.style.setProperty('--lcd-aspect', `${logical.width} / ${logical.height}`);
  refs.lid.style.setProperty('--lcd-bg', pack.screen.colors.background);
  refs.stage.classList.toggle('stage--plain', !route.lid);
  // Внешний вид: цвет корпуса текущей игры, слой неактивных сегментов, звук, вид экрана, фон страницы.
  // Источник правды — hub.settings.display; исключение — цвет: в настройках лежит цвет по умолчанию,
  // а выбор на странице действует только на текущую игру (до перезагрузки).
  // Цвет текущей игры: при переходе с другой игрушки — тот же, если у Crocodile Mario он есть (все четыре есть), иначе из настроек.
  let currentShell: Shell = carryIn ? shellFor(TOYS.mario, carryIn.shell) : TOYS.mario.defaultShell;
  const ghostOn = (): boolean => hub.settings.display.ghost ?? pack.screen.ghost?.enabled ?? false;
  const applyDisplay = (): void => {
    const { display } = hub.settings;
    refs.toy.dataset['shell'] = currentShell;
    refs.arena.dataset['shell'] = currentShell;
    refs.chkGhost.checked = ghostOn();
    renderer.setGhost(ghostOn());
    refs.chkSound.checked = display.sound;
    audio.setMuted(!display.sound);
    audio.setVolume(display.volume);
    audio.setMusicVolume(musicVolumeOf(display));
    audio.setMusic(display.music);
    if (route.lid) applyTheme(display.theme);
    corner?.setTheme(display.theme);
    corner?.setGhost(renderer.hasGhostLayer ? ghostOn() : null);
    refs.gameArea.dataset['music'] = display.music;
    controls?.update({
      shell: currentShell,
      sound: display.sound,
      volume: display.volume,
      musicVolume: musicVolumeOf(display),
      music: display.music,
      view,
      powered,
      level: currentLevel,
    });
  };

  /**
   * Вид игрушки: закрыта / полная / только экран. Атрибуты `data-closed` и `data-compact` ведут CSS-анимации (раскрытие крышки,
   * сворачивание нижней половины); закрытая крышка — кнопка «Открыть игрушку», а экран и клавиши под ней недоступны.
   */
  const applyView = (): void => {
    const closed = view === 'closed';
    refs.toy.dataset['view'] = view;
    refs.arena.dataset['view'] = view;
    for (const element of [refs.toy, refs.arena]) {
      element.toggleAttribute('data-closed', closed);
      element.toggleAttribute('data-compact', view === 'screen');
    }
    refs.lidFront.inert = closed;
    refs.lower.inert = closed;
    refs.lidCover.inert = !closed;
    refs.lidCover.tabIndex = closed ? 0 : -1;
  };
  const setView = (next: View): void => {
    if (!route.lid || next === view) return;
    if (next === 'closed' && powered) return; // включённую игрушку не закрыть: сначала явно выключить (ON/OFF), кнопка «Свёрнута» недоступна
    view = next;
    applyView();
    applyDisplay();
    if (view !== 'closed') refocusGame();
  };

  // ── Выбор уровня: оригинальные 1–9 и карты из редактора ──────────────────
  const slots = originalSlots(pack);
  const bundled = bundledLevels(pack);
  // Спидран: порядок прохождения — оригинальные уровни пакета; забег начинается с того уровня, что запущен.
  const speedrun = new Speedrun(slots.flatMap((slot) => (slot.levelId ? [slot.levelId] : [])), game.state.levelId);
  let currentLevel: LevelRef = start.ref;
  let userLevels: readonly UserLevel[] = [];
  const libraryTarget: LibraryTarget = {
    packName: route.packName,
    pack,
    env: { assets: pack.assets, validation: validationEnv(DEMO_BEHAVIORS, GLYPH_NAMES) },
  };
  let drafts: DraftStore | null = null;

  /** Список карт из редактора (IndexedDB). Недоступное хранилище не мешает игре — панель просто сообщает об этом. */
  async function refreshUserLevels(): Promise<void> {
    if (!controls) return;
    try {
      drafts ??= await openIndexedDbStore();
      userLevels = await loadUserLevels(drafts, libraryTarget);
      if (life.disposed) return; // игрушку на странице уже сменили: общие элементы страницы принадлежат новой
      controls.setUserLevels(userLevels, null);
    } catch {
      if (life.disposed) return;
      userLevels = [];
      controls.setUserLevels([], 'lv.noStorage');
    }
    applyDisplay();
  }

  /**
   * Новая игра на выбранном уровне: пересоздаются контекст, ядро, эффекты, сценарий входа и сессия; ввод, время и
   * камера очищаются, питание включается. Интро и сценарий выхода из туннеля — только у оригинальных уровней
   * (они описаны наблюдениями по видео); карта из редактора запускается сразу, как в тестовом запуске редактора.
   */
  function launch(ref: LevelRef): boolean {
    let source: ContentPack | null = null;
    if (ref.kind === 'original') {
      const levelId = slots.find((slot) => slot.number === ref.number)?.levelId;
      if (levelId) source = originalPack(pack, levelId);
    } else if (ref.kind === 'bundled') {
      if (bundled.some((b) => b.levelId === ref.levelId)) source = originalPack(pack, ref.levelId);
    } else {
      const level = userLevels.find((user) => user.projectId === ref.projectId)?.level;
      if (level) source = userPack(pack, level);
    }
    if (!source) return false;
    marioPartyStarted = false;
    leaderboard?.cancel();
    const original = ref.kind !== 'user'; // интро и сценарий входа — у уровней пакета (оригинальных и готовых); карта из редактора стартует сразу
    session.suspend();
    ctx = createContext(source);
    game = new Game(ctx, seed);
    effects = new LevelEffects(pack.animations ?? null, { viewport: pack.screen.viewport, intro: original });
    fx = NO_EFFECTS;
    entry = new EntryScript(original ? pack.animations?.entry : null);
    entry.arm(game.state.levelId);
    session = makeSession();
    director.reset();
    suspendReason = null;
    snapCamera = true;
    powered = true;
    if (view === 'closed') {
      view = 'full'; // уровень выбран на пульте при закрытой крышке: игрушка раскрывается, включённой она закрытой не бывает
      applyView();
    }
    refs.toy.dataset['power'] = 'on';
    hub.resetDevices();
    hub.tracker.reset();
    stepper.reset();
    refs.statusContent.textContent = contentLine(source);
    speedrun.reset(game.state.levelId);
    currentLevel = ref;
    leaderboard?.select({gameId:'mario',mode:0,toyId:'mario'},ref.kind==='original'&&ref.number===1);
    applyDisplay();
    return true;
  }

  // ── Панели вокруг игрушки ────────────────────────────────────────────────
  // Блистерная карточка рядом с логотипом: пока диалог 3D-упаковки открыт, игра на паузе, как у справки.
  const infoPanel = route.lid ? new InfoPanel(refs.sideInfo, hub, 'mario', signal, { dialog: refs.boxDialog, onOpen: () => openMenu(), onClose: () => closeMenu(), onPointerUse: () => refocusGame() }) : null;
  const panelActions: ControlPanelActions = {
    pickShell: (shell) => {
      currentShell = shellFor(TOYS.mario, shell);
      applyDisplay();
    },
    toggleSound: () => setSound(!hub.settings.display.sound),
    setVolume: (volume, commit) => {
      audio.setVolume(volume);
      if (hub.settings.display.music === 'original') audio.setMusicVolume(volume); // под «Оригинал» звук и музыка — один уровень
      if (commit) commitVolume('volume', volume);
    },
    setMusicVolume: (volume, commit) => {
      audio.setMusicVolume(volume);
      if (hub.settings.display.music === 'original') audio.setVolume(volume);
      if (commit) commitVolume('musicVolume', volume);
    },
    // Нет записи — переключатель сохраняется, а звучит та же мелодия (см. подсказку у кнопки).
    setMusic: (music: Music) => {
      const changed = hub.settings.display.music !== music;
      hub.updateSettings((s) => {
        s.display.music = music;
      });
      applyDisplay();
      if (changed) {
        audio.unlock();
        audio.play('confirm'); // отклик на касание: пока игра не идёт, смена музыки на слух иначе незаметна (при выключенном звуке молчит)
      }
    },
    toggleGhost: () => {
      hub.updateSettings((s) => {
        s.display.ghost = !ghostOn();
      });
      applyDisplay();
    },
    setView,
    pickOriginal: (number) => void launch({ kind: 'original', number }),
    pickBundled: (levelId) => void launch({ kind: 'bundled', levelId }),
    pickUser: (projectId) => void launch({ kind: 'user', projectId }),
  };
  /** Громкость отпущенного ползунка — в настройки (под «Оригинал» обе громкости вместе) и услышать выбранный уровень. */
  const commitVolume = (which: 'volume' | 'musicVolume', volume: number): void => {
    hub.updateSettings((s) => {
      if (s.display.music === 'original') {
        s.display.volume = volume;
        s.display.musicVolume = volume;
      } else {
        s.display[which] = volume;
      }
    });
    applyDisplay();
    audio.unlock();
    audio.play('confirm'); // услышать выбранный уровень (при выключенном звуке молчит)
  };
  const toggleTheme = (): void => {
    hub.updateSettings((s) => {
      s.display.theme = THEMES.find((theme) => theme !== s.display.theme) ?? 'dark';
    });
    applyDisplay();
  };
  const controls = route.lid
    ? new ControlPanel(refs.sideCtl, {
      shells: TOYS.mario.shells, slots, bundled, actions: panelActions, tickRateHz: ctx.rules.params.tickRateHz, onPointerUse: refocusGame, remote: ['onoff', 'sp'], signal,
    })
    : null;
  // Угловое меню: индикатор клавиатуры/геймпада и смена фона — рядом с языком, настройками и справкой.
  if(route.lid){leaderboard=new LeaderboardCard(refs.sideCtl,signal);leaderboard.select({gameId:'mario',mode:0,toyId:'mario'},currentLevel.kind==='original'&&currentLevel.number===1);}

  const corner = route.lid ? new CornerNav({ devices: refs.devices, theme: refs.cornerTheme }, { toggleTheme, toggleGhost: panelActions.toggleGhost, togglePause: () => { if (!powered) return; if (game.state.phase === 'playing') session.requestPause(); else if (game.state.phase === 'paused') session.requestStart(); }, onPointerUse: refocusGame }, signal) : null;

  // Шутка со шлейфом: пока шлейф между половинами держат курсором или пальцем, экран рассыпается и гаснет; отпустили — возвращается.
  const glitch = new CableGlitch();
  let glitchLevel = 0;
  const applyGlitch = (now: number): void => {
    glitchLevel = glitch.level(now);
    if (glitchLevel > 0) renderer.dropout(glitchLevel, Math.floor(now / 90)); // зерно меняется ~11 раз в секунду: куски мерцают
    refs.toy.toggleAttribute('data-glitch', glitchLevel > 0);
    setData('glitch', glitchLevel.toFixed(2));
  };

  // Последняя нарисованная сцена: смена размера очищает холст, а ResizeObserver срабатывает уже после кадра игры,
  // поэтому сцену дорисовываем сразу — иначе при плавном изменении размера экран мигал бы пустым.
  let lastScene: Parameters<Renderer['render']>[0] | null = null;
  const resize = (): void => {
    renderer.resize(refs.lcdWindow.clientWidth, refs.lcdWindow.clientHeight, window.devicePixelRatio);
    if (!lastScene) return; // первый вызов до начала игры: рисовать нечего
    if (!powered) {
      renderer.clear();
    } else {
      renderer.render(lastScene);
      applyGlitch(performance.now());
    }
  };
  life.observe(refs.lcdWindow, resize);
  window.addEventListener('resize', resize, { signal });
  resize();

  refs.overlayAction.addEventListener('click', () => {
    session.requestStart();
    refocusGame();
  }, { signal });
  refs.btnPause.addEventListener('click', () => {
    if (game.state.phase === 'playing') session.requestPause();
    else if (game.state.phase === 'paused') session.requestStart();
    refocusGame();
  }, { signal });
  const restart = (): void => {
    marioPartyStarted = false;
    leaderboard?.cancel();
    suspendReason = null;
    director.reset(); // явный рестарт — не возрождение после гибели: обрывает звучащую гибель и снова с фанфары
    session.restart();
    speedrun.reset(game.state.levelId);
    refocusGame();
  };
  refs.btnRestart.addEventListener('click', restart, { signal });
  refs.btnDebugRestart.addEventListener('click', restart, { signal });
  refs.btnSettings.addEventListener('click', () => settingsDialog.open(), { signal });
  refs.btnStep.addEventListener('click', () => {
    session.stepWhilePaused();
    refocusGame();
  }, { signal });
  // Слой неактивных сегментов: значение по умолчанию задаёт профиль экрана, выбор пользователя сохраняется.
  refs.ghostToggle.hidden = !renderer.hasGhostLayer;
  refs.chkGhost.addEventListener('change', () => {
    hub.updateSettings((s) => {
      s.display.ghost = refs.chkGhost.checked;
    });
    applyDisplay();
    refocusGame();
  }, { signal });
  refs.chkDebug.addEventListener('change', () => {
    refs.debug.hidden = !refs.chkDebug.checked;
  }, { signal });
  /** Включить или выключить звук (кнопка SOUND, флажок, настройки). */
  const setSound = (on: boolean): void => {
    hub.updateSettings((s) => {
      s.display.sound = on;
    });
    applyDisplay();
    audio.unlock();
    audio.play('confirm'); // короткий сигнал-подтверждение (при выключении звука молчит)
  };
  refs.chkSound.addEventListener('change', () => {
    setSound(refs.chkSound.checked);
    refocusGame();
  }, { signal });
  applyView();
  applyDisplay();
  void refreshUserLevels();

  // Плавные переходы (вид «только экран») включаются после первой отрисовки, чтобы сохранённый вид не «выезжал» при загрузке,
  // и на время изменения размера окна выключаются: иначе ширина игрушки отставала бы от окна.
  const enableMotion = (): void => {
    delete document.body.dataset['motion'];
  };
  // Страница прячется (`data-booting`, см. стиль), пока данные не загружены, панели не заполнены, а первый кадр не нарисован, — сразу видно
  // финишный вид, а не промежуточный (открытая игрушка и пустые панели). Показывается со вторым кадром, потом включаются переходы.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (life.disposed) return;
      delete document.body.dataset['booting'];
      enableMotion();
      refocusGame();
    }),
  );
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    document.body.dataset['motion'] = 'off';
    clearTimeout(resizeTimer);
    resizeTimer = life.timeout(enableMotion, 200);
  }, { signal });

  // ── Питание и кнопки корпуса ─────────────────────────────────────────────
  // ON/OFF: выключенная игрушка — пустой экран и погасшие светодиоды; включение начинает всё с начала.
  // Игрушка при открытии страницы выключена: включает кнопка ON/OFF (клавиша O); `?power=on` включает сразу (для ссылок и тестов).
  // Технические страницы кнопок корпуса не показывают — они всегда включены.
  refs.toy.dataset['power'] = powered ? 'on' : 'off';
  const setPower = (on: boolean): void => {
    if (on === powered) return;
    powered = on;
    marioPartyStarted = false;
    leaderboard?.cancel();
    if (on && view === 'closed') {
      view = 'full';
      applyView();
    }
    refs.toy.dataset['power'] = on ? 'on' : 'off';
    applyDisplay(); // «Свёрнута» на пульте доступна, только пока игрушка выключена
    suspendReason = null;
    director.reset();
    if (on) {
      session.restart();
      speedrun.reset(game.state.levelId);
      hub.tracker.reset();
    } else {
      session.suspend();
      audio.play('powerOff'); // щелчок выключения (после silence: этот эффект самый сильный)
    }
  };
  const toy = new ToyPanel(refs.toy, hub, {
    phase: () => game.state.phase,
    powered: () => powered,
    onPower: () => setPower(!powered),
    onSound: () => setSound(!hub.settings.display.sound),
  });
  if (controls) toy.bindRemote(refs.sideCtl);
  // Горячие клавиши питания и звука (в настройках управления не переназначаются).
  const hotkeys: Record<string, 'onoff' | 'sound'> = { KeyO: 'onoff', KeyM: 'sound' };
  const hotkeyAllowed = (event: KeyboardEvent): 'onoff' | 'sound' | null => {
    const id = hotkeys[event.code];
    if (!id || event.ctrlKey || event.altKey || event.metaKey || !isKeyboardActive()) return null;
    return boundSources(hub.settings.keyboard).has(keySource(event.code)) ? null : id; // занято привязкой игры — не трогаем
  };
  window.addEventListener('keydown', (event) => {
    const id = hotkeyAllowed(event);
    if (!id || event.repeat) return;
    event.preventDefault();
    toy.hotkey(id, true);
  }, { signal });
  window.addEventListener('keyup', (event) => {
    const id = hotkeys[event.code];
    if (id) toy.hotkey(id, false);
  }, { signal });
  // Закрытая игрушка: щелчок по крышке (или Enter / пробел) раскрывает её с анимацией.
  refs.lidCover.addEventListener('click', () => setView('full'), { signal });
  window.addEventListener('keydown', (event) => {
    if (view !== 'closed' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code !== 'Enter' && event.code !== 'Space') return;
    if (settingsDialog.isOpen || infoPanel?.boxOpen) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== refs.lidCover) return; // фокус в кнопке или поле — клавиша им и нужна
    event.preventDefault();
    setView('full');
  }, { signal });
  refs.cornerSettings.addEventListener('click', () => settingsDialog.open(), { signal });
  refs.cornerHelp.addEventListener('click', () => openEncyclopedia('mario'), { signal });
  // Шлейф можно «зажать»: см. CableGlitch. Захват указателя — чтобы отпускание засчиталось, где бы ни оказался курсор.
  const band = refs.toy.querySelector<HTMLElement>('.toy__band');
  if (band) {
    const letGo = (): void => {
      glitch.release(performance.now());
      delete band.dataset['held'];
    };
    band.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault(); // фокус остаётся у игры, текст не выделяется
      band.setPointerCapture(event.pointerId);
      glitch.grab(performance.now());
      band.dataset['held'] = '';
    }, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) band.addEventListener(type, letGo, { signal });
    band.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    window.addEventListener('blur', letGo, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) letGo();
    }, { signal });
  }
  refs.cornerLang.addEventListener('click', (event) => {
    const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length] ?? 'ru';
    hub.updateSettings((s) => {
      s.display.lang = next;
      s.display.langSet = true;
    });
    setLang(next); // панели и открытые диалоги перерисуются сами
    applyLangUi();
    if (event.detail !== 0) refocusGame(); // мышью — клавиатура возвращается игре; со стрелок фокус остаётся на кнопке
  }, { signal });
  // Без кнопок корпуса управлять пальцем нечем: в режиме «только экран» касание экрана — это S./P. (старт и продолжение).
  // Выключенная игрушка в этом виде включается касанием экрана: кнопки ON/OFF на экране нет.
  refs.gameArea.addEventListener('pointerdown', () => {
    if (view !== 'screen') return;
    if (!powered) setPower(true);
    else if (game.state.phase !== 'playing') session.requestStart();
  }, { signal });

  // Светодиоды: наблюдение по видео — в игре горят все три; остальное условно, см. app/leds.ts. состояния (оригинальная логика не установлена), см. app/leds.ts.
  const leds = {
    red: refs.lid.querySelector<HTMLElement>('.led--red'),
    yellow: refs.lid.querySelector<HTMLElement>('.led--yellow'),
    green: refs.lid.querySelector<HTMLElement>('.led--green'),
  };
  let lastLeds = '';
  const showLeds = (state: LedState): void => {
    const key = `${+state.red}${+state.yellow}${+state.green}`;
    if (key === lastLeds) return;
    lastLeds = key;
    for (const name of ['red', 'yellow', 'green'] as const) {
      const on = state[name];
      leds[name]?.classList.toggle('led--lit', on);
      refs.lid.dataset[`led${name[0]?.toUpperCase()}${name.slice(1)}`] = on ? 'on' : 'off';
    }
  };

  const setText = {
    keyboard: cachedText(refs.statusKeyboard),
    gamepad: cachedText(refs.statusGamepad),
    timer: cachedText(refs.statusTimer),
    hint: cachedText(refs.controlsHint),
    overlayTitle: cachedText(refs.overlayTitle),
    overlayHint: cachedText(refs.overlayHint),
    debug: cachedText(refs.debugText),
    status: cachedText(refs.srStatus),
    pause: cachedText(refs.btnPause),
    warning: cachedText(refs.statusWarning),
  };
  /** Короткое состояние для скринридеров (на экране текста нет). */
  const statusLine = (phase: Phase): string =>
    phase === 'playing' ? '' : t(`status.${phase}`);
  const lastData = new Map<string, string>();
  const setData = (name: string, value: string | number): void => {
    const text = String(value);
    if (lastData.get(name) === text) return;
    lastData.set(name, text);
    refs.gameArea.dataset[name] = text;
  };

  /** Обновление интерфейса вокруг Canvas. data-* — стабильный контракт для браузерного smoke-теста. */
  function updateUi(): void {
    const s = game.state;
    if (s.phase === 'playing') suspendReason = null;

    setData('phase', s.phase);
    setData('level', s.levelId);
    setData('hud', game.level.def.hudLabel); // подпись `G-LL` на экране
    setData('time', timerUnits(ctx.rules, s) ?? ''); // число на таймере (`TIME 397`); пусто — на HUD подпись
    setData('tick', s.tick);
    setData('worldTick', s.worldTick);
    setData('heroX', s.hero.x);
    setData('heroY', s.hero.y);
    setData('score', s.score);
    setData('lives', s.lives);
    setData('projectiles', s.projectiles.length);
    setData('gamepad', gamepadStatus.kind);
    setData('context', session.context);
    setData('power', powered ? 'on' : 'off');
    setData('musicSource', audio.musicSource); // чем звучит мелодия: original (пищалка) или remaster (запись)
    setData('remaster', audio.remasterStatus); // запись «Ремастера»: idle, loading, ready или failed
    controls?.setRemasterStatus(audio.remasterStatus);
    setData('entry', entry.pending(s.phase) ? 'on' : 'off');
    setData('cameraX', camera.x);
    setData('intro', fx.intro ? 'on' : 'off');
    showLeds(powered ? ledState(s.phase, s.tick, audio.ledBeat()) : { red: false, yellow: false, green: false });
    setText.status(powered ? statusLine(s.phase) : t('status.off'));

    // Пока идёт интро участка, оверлей «Старт» не закрывает поле (Enter всё равно запускает игру).
    const overlay = fx.intro ? null : overlayView(s, suspendReason);
    if (refs.overlay.hidden !== (overlay === null)) refs.overlay.hidden = overlay === null;
    if (overlay) {
      setText.overlayTitle(overlay.title);
      setText.overlayHint(overlay.hint);
      if (refs.overlayAction.hidden !== (overlay.action === null)) refs.overlayAction.hidden = overlay.action === null;
      if (overlay.action !== null && refs.overlayAction.textContent !== overlay.action) {
        refs.overlayAction.textContent = overlay.action;
      }
    }

    setText.pause(s.phase === 'paused' ? 'Продолжить' : 'Пауза');
    const pauseDisabled = s.phase !== 'playing' && s.phase !== 'paused';
    if (refs.btnPause.disabled !== pauseDisabled) refs.btnPause.disabled = pauseDisabled;

    const keyboardActive = isKeyboardActive();
    const hintHidden = keyboardActive || settingsDialog.isOpen;
    if (refs.focusHint.hidden !== hintHidden) refs.focusHint.hidden = hintHidden;
    setText.keyboard(keyboardStatusText(keyboardActive));
    const setup = gamepadStatus.kind === 'active' && needsGamepadSetup(hub.settings, gamepadStatus.pad);
    setText.gamepad(gamepadStatusText(gamepadStatus, setup));
    corner?.setDevices(deviceView(gamepadStatus, hub.lastDevice));
    corner?.setPaused(powered && s.phase === 'paused');
    setText.hint(controlsHint(hub.settings.keyboard, route.fireHint));
    setText.timer(timerText(s, timerUnitTicks(ctx.rules), ctx.rules.params.timerLimitTicks, ctx.rules.params.timerUnitTicks ? 'ед.' : 'с'));

    const warnings: string[] = [...assetWarnings];
    if (!hub.settingsPersisted) warnings.push('Настройки не сохраняются: хранилище браузера недоступно.');
    if (refs.statusWarning.hidden !== (warnings.length === 0)) refs.statusWarning.hidden = warnings.length === 0;
    setText.warning(warnings.join(' '));

    if (refs.btnStep.disabled !== (s.phase !== 'paused')) refs.btnStep.disabled = s.phase !== 'paused';
    if (!refs.debug.hidden) {
      const { hero } = s;
      const last = session.lastFrame;
      setText.debug(
        [
          `такт: ${s.tick} (мир: ${s.worldTick})   темп: ${ctx.rules.params.tickRateHz} тактов/с   FPS: ${fps.toFixed(0)}`,
          `фаза: ${s.phase}   участок: ${s.levelId}   контекст ввода: ${session.context}`,
          `герой: x=${hero.x} y=${hero.y} взгляд=${hero.facing === 1 ? '→' : '←'} в воздухе=${hero.airborne ? 'да' : 'нет'} прыжок=${hero.jumpIndex} падение=${hero.fallTimer}`,
          `снаряды: ${s.projectiles.length}   жизни: ${s.lives}   счёт: ${s.score}   перезарядка: ${hero.fireCooldown}`,
          `ввод в такте: pressed=[${namesOf(last.pressed)}] held=[${namesOf(last.held)}] released=[${namesOf(last.released)}]`,
          `сейчас нажато: [${namesOf(hub.tracker.down)}]`,
          `объекты: ${s.objects.map((o) => `${o.id}${o.active ? '' : '✗'}@${o.x},${o.y}`).join(' ')}`,
        ].join('\n'),
      );
    }
  }

  function frame(now: number): void {
    if (lastFrameTime !== null && now > lastFrameTime) fps = fps * 0.9 + (1000 / (now - lastFrameTime)) * 0.1;
    lastFrameTime = now;

    hub.poll(); // опрос геймпада — каждый кадр, в том числе на паузе (там ждём команду продолжения)
    if (powered) session.frame(now);
    director.frame(); // мелодия стартует, когда игрок получил управление; порт планирует звук на ~0,3 с вперёд
    toy.sync(hub.tracker.down); // кнопки корпуса подсвечиваются от клавиатуры, геймпада и мыши
    if (!powered) {
      fx = NO_EFFECTS;
      renderer.clear();
      updateUi();
      return;
    }

    const level = ctx.levels.get(game.state.levelId)?.def;
    if (!level) return;
    const area: CameraArea = {
      columns: pack.screen.viewport.columns,
      rows: pack.screen.viewport.rows,
      levelWidth: level.width,
      levelHeight: level.height,
    };
    const target = { x: game.state.hero.x, y: Math.min(game.state.hero.y, level.height - 1) };
    // Игрушка: герой остаётся в середине поля (13 столбцов — столбец 6), мир прокручивается клетками, как на видео.
    // Техническая страница — прежняя «мёртвая рамка».
    camera = snapCamera || route.lid ? centerCamera(target, area) : followCamera(camera, target, area);
    snapCamera = false;

    fx = effects.frame(game.state, level);
    // Построение комнаты: щелчок на каждый шаг героя по маршруту интро.
    director.introStep(fx.intro && typeof fx.hero === 'object' ? `${fx.hero.x},${fx.hero.y}` : null);
    lastScene = {
      state: game.state,
      level,
      camera,
      sprites,
      debug: { grid: refs.chkGrid.checked, collisions: refs.chkCollisions.checked },
      effects: fx,
      time: timerUnits(ctx.rules, game.state),
    };
    renderer.render(lastScene);
    applyGlitch(now);
    updateUi();
    controls?.setRun(speedrun.view(game.state.worldTick));
  }

  refocusGame();
  life.loop(frame);
  return {
    dispose: () => life.dispose(),
    carry: () => ({ view, shell: currentShell, powered }),
  };
}
