import { BrickAudio } from '../audio/brick';
import { actionBit, maskOf, type InputFrame, type Phase } from '../core';
import { WebAudioPort } from '../audio/beeper';
import { browserGamepadProvider, type GamepadStatus } from '../input/gamepad';
import { boundSources, keySource } from '../input/bindings';
import { LANGS } from '../input/lang';
import { browserStorage, musicVolumeOf, THEMES, type Shell } from '../input/settings';
import { BRICK_GAMES } from '../brick/games';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TetrisScreen, type TetrisScene } from '../render/tetrisScreen';
import { DEFAULT_SEED, MAX_SCORE, TETRIS_TICK_HZ } from '../tetris';
import { cabinetCue, createCabinet, type CabinetEvent } from './cabinet';
import { CableGlitch } from './cableGlitch';
import { ControlPanel, type ControlPanelActions } from './controlPanel';
import { CornerNav } from './cornerNav';
import { InfoPanel } from './infoPanel';
import { HelpDialog } from './help';
import { InputHub } from './hub';
import { Lifecycle, type AppHandle, type Carry } from './lifecycle';
import { applyStatic, getLang, setLang, t } from './i18n';
import type { LedState } from './leds';
import { ORIGINAL_LEVEL_COUNT, type OriginalSlot } from './levels';
import { SettingsDialog } from './settingsUi';
import { FixedStepper } from './stepper';
import { applyTheme } from './theme';
import { applyToyModel, relabelKeys } from './toyModel';
import { ToyPanel, type ToyKeyId } from './toy';
import { shellFor, TOYS, type ToyId } from './toys';
import { parseView, type View } from './view';
import { deviceView } from './viewModel';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`В index.html нет элемента #${id}`);
  return element as T;
}

const NAV_UP = actionBit('up');
const NAV_DOWN = actionBit('down');
const NAV_CONFIRM = actionBit('confirm');
const NAV_BACK = actionBit('back');
const START = actionBit('start');
const PAUSE = actionBit('pause');
const CONFIRM = actionBit('confirm');

/**
 * Действия кнопок корпуса: FIRE-кнопка у них не стреляет (под ней TIME/GAME или RESET), поэтому в таблице её нет; UP — вверх (в тетрисе поворот, в меню следующий вариант),
 * большая кнопка JUMP — ROTATE: поворот, огонь, в меню выбор игры.
 */
const TETRIS_KEY_ACTIONS: Partial<Record<ToyKeyId, number>> = {
  left: maskOf('left'),
  right: maskOf('right'),
  down: maskOf('down'),
  up: maskOf('up'),
  jump: maskOf('jump'),
};
/** Сколько тактов горят все сегменты при включении (≈ 0,8 с, как «проверка экрана» у настоящих игрушек). */
const BOOT_TICKS = 48;

/** Рекорд хранится отдельно у каждой игрушки (у консоли с меню — у каждой игры и варианта); недоступное хранилище не мешает игре. */
function loadHi(key: string): number {
  try {
    const value = Number.parseInt(browserStorage()?.getItem(key) ?? '', 10);
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), MAX_SCORE) : 0;
  } catch {
    return 0;
  }
}
function saveHi(key: string, value: number): void {
  try {
    browserStorage()?.setItem(key, String(value));
  } catch {
    // рекорд не сохранится — игре это не мешает
  }
}

/**
 * Игрушки «Часы+99», «Морской бой» и «168 в 1 танк»: та же раскладушка и та же оболочка (вид, питание, звук, пульт справа), но другая «аппаратура» —
 * см. `toyModel.ts`. Все три игрушки — консоли с меню игр (`src/brick`, правила донора,
 * `docs/brick-games.md`). Что именно играет, скрывает «кабинет» (`cabinet.ts`); экран один — `render/tetrisScreen.ts`. Уровни Mario на пульте отключены; у Brick Game свои эффекты и короткие музыкальные сигналы. Оболочка повторяет `startApp` — общая часть вынесется позже.
 */
export async function startTetrisApp(toyId: ToyId, carryIn?: Carry): Promise<AppHandle> {
  const model = TOYS[toyId];
  const life = new Lifecycle();
  const { signal } = life;
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
    help: byId<HTMLDialogElement>('help'),
    boxDialog: byId<HTMLDialogElement>('box-dialog'),
    srStatus: byId<HTMLElement>('sr-status'),
    lcdWindow: byId<HTMLElement>('lcd-window'),
    canvas: byId<HTMLCanvasElement>('screen'),
    settings: byId<HTMLDialogElement>('settings'),
  };

  document.body.dataset['chrome'] = 'toy';
  applyToyModel(model, { body: document.body, toy: refs.toy, arena: refs.arena, lid: refs.lid, base: refs.base });
  // Подпись окна и справка соответствуют выбранной игрушке.
  refs.stage.dataset['i18nAttrs'] = `aria-label=${model.stageLabel}`;

  const params = new URLSearchParams(window.location.search);
  // Вид и питание — как у Crocodile Mario: игрушка начинается закрытой и выключенной; `?view=…` и `?power=on` открывают её сразу.
  // Игрушка, на которую перешли с другой на странице, продолжает с тем же видом, цветом и питанием (`carryIn`).
  let view: View = carryIn?.view ?? parseView(params.get('view'), params.get('power') === 'on');
  let powered = carryIn ? carryIn.powered : params.get('power') === 'on';
  if (powered && view === 'closed') view = 'full';
  let bootTicks = powered ? BOOT_TICKS : 0;
  let context: 'game' | 'menu' = 'game';
  let gamepadStatus: GamepadStatus = { kind: 'none' };

  const seed = Number.parseInt(params.get('seed') ?? '', 10) || (Date.now() % 0x7fffffff) || DEFAULT_SEED;
  const cabinet = createCabinet(model, { seed, loadHi, defs: BRICK_GAMES });
  if (params.has('debug')) Object.defineProperty(window, model.menu ? '__brick' : '__tetris', { configurable: true, get: () => cabinet.debugTarget() });

  const isKeyboardActive = (): boolean => {
    if (settingsDialog.isOpen || helpDialog.isOpen || infoPanel.boxOpen) return false;
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
    onGamepadDisconnect: () => suspend(),
  });

  setLang(hub.settings.display.lang);
  // 3D-коробка рядом с наклейкой (у «168 в 1 танк»): пока диалог открыт, игра на паузе, как у справки; `openMenu`/`closeMenu` объявлены ниже.
  const infoPanel = new InfoPanel(refs.sideInfo, hub, model.id, signal, {
    dialog: refs.boxDialog,
    onOpen: () => openMenu(),
    onClose: () => closeMenu(),
    onPointerUse: () => refocusGame(),
  });
  const applyLangUi = (): void => {
    const lang = getLang();
    document.documentElement.lang = lang;
    applyStatic();
    relabelKeys(model, refs.base);
    refs.cornerLang.dataset['lang'] = lang;
    refs.cornerLang.setAttribute('aria-label', t('corner.lang'));
    refs.cornerLang.title = t('corner.langTitle');
  };
  applyLangUi();

  const audio = new WebAudioPort({
    muted: !hub.settings.display.sound,
    volume: hub.settings.display.volume,
    musicVolume: musicVolumeOf(hub.settings.display),
  });
  const brickAudio = new BrickAudio();
  life.onDispose(() => { audio.dispose(); brickAudio.dispose(); });
  const unlockAudio = (): void => { audio.unlock(); brickAudio.unlock(); };
  window.addEventListener('keydown', unlockAudio, { signal });
  window.addEventListener('pointerdown', unlockAudio, { signal });

  const stepper = new FixedStepper(1000 / TETRIS_TICK_HZ);

  // ── Экран ────────────────────────────────────────────────────────────
  refs.lid.style.setProperty('--lcd-aspect', `${SCREEN_WIDTH} / ${SCREEN_HEIGHT}`);
  refs.lid.style.setProperty('--lcd-bg', model.lcd.bg);
  const screen = new TetrisScreen(refs.canvas, { glyph: model.glyph, panel: model.panel, ink: model.lcd.ink });
  let lastScene: TetrisScene | null = null;
  const glitch = new CableGlitch();
  let glitchLevel = 0;
  const applyGlitch = (now: number): void => {
    glitchLevel = glitch.level(now);
    if (glitchLevel > 0) screen.dropout(glitchLevel, Math.floor(now / 90));
    refs.toy.toggleAttribute('data-glitch', glitchLevel > 0);
    setData('glitch', glitchLevel.toFixed(2));
  };
  const resize = (): void => {
    screen.resize(refs.lcdWindow.clientWidth, refs.lcdWindow.clientHeight, window.devicePixelRatio);
    if (!lastScene) return;
    if (!powered) {
      screen.clear();
    } else {
      screen.render(lastScene);
      applyGlitch(performance.now());
    }
  };
  life.observe(refs.lcdWindow, resize);
  window.addEventListener('resize', resize, { signal });
  resize();

  // ── Внешний вид: цвет, сегменты, звук, вид, фон ─────────────────────────
  let currentShell: Shell = shellFor(model, carryIn?.shell ?? hub.settings.display.shell);
  const ghostOn = (): boolean => hub.settings.display.ghost ?? true;
  const applyDisplay = (): void => {
    const { display } = hub.settings;
    refs.toy.dataset['shell'] = currentShell;
    refs.arena.dataset['shell'] = currentShell;
    screen.setGhost(ghostOn());
    audio.setMuted(!display.sound);
    audio.setVolume(display.volume);
    brickAudio.setMuted(!display.sound);
    brickAudio.setVolume(display.volume);
    applyTheme(display.theme);
    corner.setTheme(display.theme);
    corner.setGhost(ghostOn());
    refs.gameArea.dataset['music'] = 'none';
    controls.update({
      shell: currentShell,
      sound: display.sound,
      volume: display.volume,
      musicVolume: musicVolumeOf(display),
      music: display.music,
      view,
      powered,
      level: null,
    });
    lastScene = null; // слой сегментов мог измениться: кадр перерисуется
  };
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
  const refocusGame = (): void => refs.gameArea.focus({ preventScroll: true });
  const setView = (next: View): void => {
    if (next === view) return;
    if (next === 'closed' && powered) return; // включённую игрушку не закрыть: сначала ON/OFF
    view = next;
    applyView();
    applyDisplay();
    if (view !== 'closed') refocusGame();
  };

  // ── Игра ─────────────────────────────────────────────────────────────
  /** Рекорд текущей игры: хранится, как только он побит (ключ — у консоли с меню игра и вариант). */
  const savedHi = new Map<string, number>();
  const persistHi = (): void => {
    if (cabinet.inMenu) return;
    const key = cabinet.hiKey();
    const stored = savedHi.get(key) ?? loadHi(key);
    savedHi.set(key, stored);
    if (cabinet.hiScore > stored) {
      savedHi.set(key, cabinet.hiScore);
      saveHi(key, cabinet.hiScore);
    }
  };
  const emit = (events: readonly CabinetEvent[]): void => {
    for (const event of events) {
      if (model.menu) brickAudio.play(event, cabinet.activeGame, cabinet.inMenu);
      else { const cue = cabinetCue(cabinet, event); if (cue) audio.play(cue); }
    }
    if (events.length > 0) persistHi();
  };

  function tick(): void {
    const raw = hub.tracker.consume();
    if (context === 'menu') {
      handleMenuInput(raw);
      return;
    }
    if (bootTicks > 0) {
      bootTicks -= 1; // проверка экрана при включении: ввод не принимается
      return;
    }
    const startCmd = (raw.pressed & (START | CONFIRM)) !== 0;
    const pauseCmd = (raw.pressed & PAUSE) !== 0;
    switch (cabinet.phase) {
      case 'ready':
      case 'over':
        if (startCmd) emit(cabinet.start());
        else if (cabinet.inMenu) emit(cabinet.menu(raw));
        break;
      case 'paused':
        if (startCmd || pauseCmd) emit(cabinet.resume());
        break;
      case 'playing':
        if (pauseCmd) emit(cabinet.pause());
        else emit(cabinet.step(raw));
        break;
    }
  }

  /** Скрытие вкладки, потеря фокуса, отключение геймпада: пауза, очистка ввода и времени. */
  function suspend(): void {
    emit(cabinet.pause());
    hub.resetDevices();
    hub.tracker.reset();
    stepper.reset();
  }
  const openMenu = (): void => {
    suspend();
    context = 'menu';
    hub.tracker.reset();
    hub.resetDevices();
  };
  const closeMenu = (): void => {
    context = 'game';
    hub.tracker.reset();
    hub.resetDevices();
    refocusGame();
  };

  const settingsDialog = new SettingsDialog(refs.settings, hub, {
    signal,
    onOpen: openMenu,
    onClose: closeMenu,
    display: {
      onChange: () => {
        infoPanel.render();
        currentShell = shellFor(model, hub.settings.display.shell);
        applyDisplay();
      },
    },
  });
  const helpDialog = new HelpDialog(refs.help, hub, { onOpen: openMenu, onClose: closeMenu }, model, signal);

  /** Навигация по настройкам с геймпада: вверх/вниз — фокус, подтвердить — нажатие, назад — закрыть. */
  function handleMenuInput(frame: InputFrame): void {
    if (settingsDialog.capturing) return;
    const dialog = settingsDialog.isOpen ? refs.settings : helpDialog.isOpen ? refs.help : infoPanel.boxOpen ? refs.boxDialog : null;
    if (!dialog) return;
    if (frame.pressed & NAV_BACK) {
      settingsDialog.close();
      helpDialog.close();
      infoPanel.closeBox();
      return;
    }
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select, input')];
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    if (frame.pressed & NAV_DOWN) focusable[(index + 1) % focusable.length]?.focus();
    if (frame.pressed & NAV_UP) focusable[(index - 1 + focusable.length) % focusable.length]?.focus();
    if (frame.pressed & NAV_CONFIRM) (document.activeElement as HTMLElement | null)?.click();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
  }, { signal });
  window.addEventListener('blur', suspend, { signal });
  window.addEventListener('gamepadconnected', () => hub.poll(), { signal });
  window.addEventListener('gamepaddisconnected', () => hub.poll(), { signal });
  hub.attach();
  life.onDispose(() => hub.detach());

  // ── Питание и кнопки корпуса ─────────────────────────────────────────
  const setSound = (on: boolean): void => {
    hub.updateSettings((s) => {
      s.display.sound = on;
    });
    applyDisplay();
    audio.unlock();
    audio.play('confirm');
  };
  const setPower = (on: boolean): void => {
    if (on === powered) return;
    powered = on;
    if (on && view === 'closed') {
      view = 'full';
      applyView();
    }
    refs.toy.dataset['power'] = on ? 'on' : 'off';
    applyDisplay();
    audio.silence();
    brickAudio.silence();
    hub.tracker.reset();
    if (on) {
      cabinet.restart();
      bootTicks = BOOT_TICKS;
    } else {
      suspend();
      audio.play('powerOff');
    }
  };
  refs.toy.dataset['power'] = powered ? 'on' : 'off';
  const restartGame = (): void => {
    persistHi();
    brickAudio.silence();
    cabinet.restart();
    hub.tracker.reset();
    stepper.reset();
    refocusGame();
  };

  const toyPanel = new ToyPanel(refs.toy, hub, {
    phase: (): Phase => (cabinet.phase === 'playing' ? 'playing' : cabinet.phase === 'paused' ? 'paused' : 'ready'),
    powered: () => powered,
    onPower: () => setPower(!powered),
    onSound: () => setSound(!hub.settings.display.sound),
    keyActions: TETRIS_KEY_ACTIONS,
    // TIME/GAME и RESET возвращают в меню; игровых действий у этих кнопок нет.
    onPress: (id) => {
      if (id !== 'fire') return false;
      if (model.menu && powered && bootTicks === 0) restartGame();
      return true;
    },
  });
  const hotkeys: Record<string, 'onoff' | 'sound'> = { KeyO: 'onoff', KeyM: 'sound' };
  const hotkeyAllowed = (event: KeyboardEvent): 'onoff' | 'sound' | null => {
    const id = hotkeys[event.code];
    if (!id || event.ctrlKey || event.altKey || event.metaKey || !isKeyboardActive()) return null;
    return boundSources(hub.settings.keyboard).has(keySource(event.code)) ? null : id;
  };
  window.addEventListener('keydown', (event) => {
    const id = hotkeyAllowed(event);
    if (!id || event.repeat) return;
    event.preventDefault();
    toyPanel.hotkey(id, true);
  }, { signal });
  window.addEventListener('keyup', (event) => {
    const id = hotkeys[event.code];
    if (id) toyPanel.hotkey(id, false);
  }, { signal });
  refs.lidCover.addEventListener('click', () => setView('full'), { signal });
  window.addEventListener('keydown', (event) => {
    if (view !== 'closed' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code !== 'Enter' && event.code !== 'Space') return;
    if (settingsDialog.isOpen || helpDialog.isOpen) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== refs.lidCover) return;
    event.preventDefault();
    setView('full');
  }, { signal });
  refs.cornerSettings.addEventListener('click', () => settingsDialog.open(), { signal });
  refs.cornerHelp.addEventListener('click', () => helpDialog.open(), { signal });
  refs.cornerLang.addEventListener('click', (event) => {
    const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length] ?? 'ru';
    hub.updateSettings((s) => {
      s.display.lang = next;
    });
    setLang(next);
    applyLangUi();
    if (event.detail !== 0) refocusGame();
  }, { signal });
  // Шлейф можно «зажать»: экран рассыпается и гаснет, пока его держат.
  const band = refs.toy.querySelector<HTMLElement>('.toy__band');
  if (band) {
    const letGo = (): void => {
      glitch.release(performance.now());
      delete band.dataset['held'];
    };
    band.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
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
  // «Только экран»: кнопок корпуса нет, касание экрана включает игрушку и запускает или продолжает партию.
  refs.gameArea.addEventListener('pointerdown', () => {
    if (view !== 'screen') return;
    if (!powered) setPower(true);
    else if (cabinet.phase === 'ready' || cabinet.phase === 'over') emit(cabinet.start());
    else if (cabinet.phase === 'paused') emit(cabinet.resume());
  }, { signal });

  // ── Пульт справа и угловое меню ──────────────────────────────────────
  // Уровней у заглушки нет: девять плиток заперты, список карт недоступен, спидрана и музыки нет.
  const slots: OriginalSlot[] = Array.from({ length: ORIGINAL_LEVEL_COUNT }, (_, index) => ({ number: index + 1, levelId: null }));
  const none = (): void => undefined;
  const panelActions: ControlPanelActions = {
    pickShell: (shell) => {
      currentShell = shellFor(model, shell);
      applyDisplay();
    },
    toggleSound: () => setSound(!hub.settings.display.sound),
    setVolume: (volume, commit) => {
      audio.setVolume(volume);
      if (commit) {
        hub.updateSettings((s) => {
          s.display.volume = volume;
          s.display.musicVolume = volume;
        });
        applyDisplay();
        audio.unlock();
        audio.play('confirm');
      }
    },
    setMusicVolume: none,
    setMusic: none,
    toggleGhost: () => {
      hub.updateSettings((s) => {
        s.display.ghost = !ghostOn();
      });
      applyDisplay();
    },
    setView,
    pickOriginal: none,
    pickBundled: none,
    pickUser: none,
  };
  const controls = new ControlPanel(refs.sideCtl, {
    slots,
    bundled: [],
    actions: panelActions,
    tickRateHz: TETRIS_TICK_HZ,
    onPointerUse: refocusGame,
    toy: model.id,
    shells: model.shells,
    levelsDisabled: !model.levels,
    music: false,
    speedrun: false,
    signal,
  });
  const corner = new CornerNav(
    { devices: refs.devices, theme: refs.cornerTheme },
    {
      toggleGhost: panelActions.toggleGhost,
      toggleTheme: () => {
        hub.updateSettings((s) => {
          s.display.theme = THEMES.find((theme) => theme !== s.display.theme) ?? 'dark';
        });
        applyDisplay();
      },
      onPointerUse: refocusGame,
    },
    signal,
  );

  // ── Светодиоды и данные для проверок ─────────────────────────────────
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
    for (const name of ['red', 'yellow', 'green'] as const) leds[name]?.classList.toggle('led--lit', state[name]);
  };
  /** Светодиоды заглушки (оригинальная логика не известна): ожидание — зелёный, игра — зелёный и жёлтый, пауза — жёлтый мигает, конец — красный. */
  const ledsFor = (): LedState => {
    if (!powered || !model.leds) return { red: false, yellow: false, green: false };
    if (bootTicks > 0) return { red: true, yellow: true, green: true };
    switch (cabinet.phase) {
      case 'ready':
        return { red: false, yellow: false, green: true };
      case 'playing':
        return { red: false, yellow: true, green: true };
      case 'paused':
        return { red: false, yellow: Math.floor(performance.now() / 500) % 2 === 0, green: false };
      case 'over':
        return { red: true, yellow: false, green: false };
    }
  };
  const lastData = new Map<string, string>();
  const setData = (name: string, value: string | number): void => {
    const text = String(value);
    if (lastData.get(name) === text) return;
    lastData.set(name, text);
    refs.gameArea.dataset[name] = text;
  };
  let lastStatus = '';
  const updateUi = (): void => {
    setData('toy', model.id);
    infoPanel.setActive(cabinet.activeGame);
    setData('phase', cabinet.phase);
    setData('score', cabinet.score);
    setData('hiscore', cabinet.hiScore);
    setData('lines', cabinet.lines);
    setData('speed', cabinet.speed);
    setData('level', cabinet.level);
    setData('tick', cabinet.tick);
    for (const [name, value] of Object.entries(cabinet.info)) setData(name, value);
    setData('power', powered ? 'on' : 'off');
    setData('boot', bootTicks > 0 ? 'on' : 'off');
    setData('context', context);
    setData('gamepad', gamepadStatus.kind);
    showLeds(ledsFor());
    corner.setDevices(deviceView(gamepadStatus, hub.lastDevice));
    corner.setPaused(powered && cabinet.phase === 'paused');
    const status = !powered ? t('status.off') : cabinet.phase === 'playing' ? '' : t(cabinet.phase === 'paused' ? 'status.paused' : 'status.ready');
    if (status !== lastStatus) {
      lastStatus = status;
      refs.srStatus.textContent = status;
    }
  };

  applyView();
  applyDisplay();
  // Страница прячется (`data-booting`), пока всё не готово: сразу виден финишный вид. Показывается со вторым кадром, потом включаются переходы.
  const enableMotion = (): void => {
    delete document.body.dataset['motion'];
  };
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

  function frame(now: number): void {
    hub.poll();
    if (powered) stepper.advance(now, tick); // и пока открыты настройки: в такте ввод идёт в навигацию по диалогу
    toyPanel.sync(hub.tracker.down);
    audio.update();
    if (!powered) {
      screen.clear();
      lastScene = null;
      updateUi();
      return;
    }
    lastScene = cabinet.scene({ sound: hub.settings.display.sound, allOn: bootTicks > 0 });
    screen.render(lastScene);
    applyGlitch(now);
    updateUi();
  }

  refocusGame();
  life.loop(frame);
  return {
    dispose: () => life.dispose(),
    carry: () => ({ view, shell: currentShell, powered }),
  };
}
