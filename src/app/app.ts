import { screenSize } from '../content/schema';
import { cueForEvent, type AudioPort } from '../audio/audio';
import { WebAudioPort } from '../audio/beeper';
import {
  actionBit,
  actionsIn,
  createContext,
  DEMO_BEHAVIORS,
  Game,
  validationEnv,
  type GameEvent,
  type InputFrame,
} from '../core';
import { centerCamera, followCamera, type CameraArea, type CameraPos } from '../render/camera';
import { AssetStore } from '../render/assets';
import { GLYPH_NAMES } from '../render/glyphs';
import { effectsWorld, LevelEffects, NO_EFFECTS, type EffectsFrame } from '../render/effects';
import { Renderer } from '../render/renderer';
import { browserGamepadProvider, type GamepadStatus } from '../input/gamepad';
import { browserStorage, needsGamepadSetup, SHELLS } from '../input/settings';
import { InputHub } from './hub';
import { ledState, type LedState } from './leds';
import { GAME_ROUTES } from './routes';
import { loadContentPack } from './loadContent';
import { GameSession } from './session';
import { SettingsDialog } from './settingsUi';
import { FixedStepper } from './stepper';
import {
  controlsHint,
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

export async function startApp(routeName: 'room' | 'tech' | 'clip'): Promise<void> {
  const route = GAME_ROUTES[routeName];
  const refs = {
    gameArea: byId<HTMLElement>('game-area'),
    stage: byId<HTMLElement>('stage'),
    lid: byId<HTMLElement>('lid'),
    lcdWindow: byId<HTMLElement>('lcd-window'),
    shellToggle: byId<HTMLElement>('shell-toggle'),
    selShell: byId<HTMLSelectElement>('sel-shell'),
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

  // Подписи маршрута ставятся до загрузки данных, чтобы страница не «мигала».
  refs.badge.textContent = route.badge;
  refs.subtitle.textContent = route.subtitle;
  refs.btnRestart.textContent = route.restartLabel;
  refs.routeLink.href = route.otherRoute.hash;
  refs.routeLink.textContent = route.otherRoute.label;
  // Отладка — для разработки: в основной комнате флажок скрыт, `?debug` его возвращает.
  refs.debugToggle.hidden = routeName !== 'tech' && !new URLSearchParams(window.location.search).has('debug');

  // ── Данные: статические JSON, проверка при загрузке ──────────────────────
  const manifestUrl = new URL(`${import.meta.env.BASE_URL}${route.manifest}`, window.location.href).href;
  const { pack, assetsUrl } = await loadContentPack(manifestUrl, validationEnv(DEMO_BEHAVIORS, GLYPH_NAMES));

  const assets = new AssetStore(pack.assets, assetsUrl, pack.screen.colors.ink);
  const assetWarnings = await assets.load();
  for (const warning of assetWarnings) console.warn(warning);

  const ctx = createContext(pack);
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get('seed') ?? '', 10) || 1;
  const game = new Game(ctx, seed);
  const renderer = new Renderer(refs.canvas, pack.screen, assets);
  // Презентационные эффекты (отскок перекладины, интро участка) — только отрисовка, симуляцию не меняют.
  const effects = new LevelEffects(pack.animations ?? null, { viewport: pack.screen.viewport, intro: true });
  let fx: EffectsFrame = NO_EFFECTS;
  const { sprites } = pack.manifest;
  refs.rowTimer.hidden = ctx.rules.params.timerLimitTicks <= 0;
  refs.statusContent.textContent = `Контент: ${pack.manifest.title} (id ${pack.manifest.id}, v${pack.manifest.version}); правила ${pack.rules.id} v${pack.rules.version}; ${ctx.rules.params.tickRateHz} тактов/с — значения демо, не установленные параметры оригинала.`;

  // ── Состояние оболочки ───────────────────────────────────────────────────
  let suspendReason: SuspendReason = null;
  let snapCamera = true;
  let camera: CameraPos = { x: 0, y: 0 };
  let gamepadStatus: GamepadStatus = { kind: 'none' };
  let fps = 0;
  let lastFrameTime: number | null = null;

  // Клавиатура принадлежит игре, пока в фокусе игровая область. Когда открыт диалог настроек,
  // фокус внутри него, так что клавиши игре не достаются и работают обычные Tab/Enter/Esc.
  const isKeyboardActive = (): boolean => refs.gameArea.contains(document.activeElement);

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

  // Звук: условные 1-битные сигналы; громкость включается настройкой и жестом пользователя (политика браузеров).
  const audio: AudioPort & { unlock(): void } = new WebAudioPort({ muted: !hub.settings.display.sound });
  const unlockAudio = (): void => audio.unlock();
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('pointerdown', unlockAudio);

  const stepper = new FixedStepper(1000 / ctx.rules.params.tickRateHz);

  const onEvents = (events: readonly GameEvent[]): void => {
    for (const event of events) {
      if (event.type === 'levelStarted') snapCamera = true;
      const world = effectsWorld(ctx, game.state);
      if (world) effects.onEvent(event, world);
      const cue = cueForEvent(event);
      if (cue) audio.play(cue);
    }
  };

  const session = new GameSession({
    game,
    tracker: hub.tracker,
    stepper,
    onEvents,
    onMenuInput: handleMenuInput,
    resetDevices: () => hub.resetDevices(),
  });

  const settingsDialog = new SettingsDialog(refs.settings, hub, {
    onOpen: () => {
      if (game.state.phase === 'playing') suspendReason = 'settings';
      session.suspend();
      session.setContext('menu');
    },
    onClose: () => {
      session.setContext('game');
      refocusGame();
    },
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
    if (!settingsDialog.isOpen || settingsDialog.capturing) return;
    if (frame.pressed & NAV_BACK) {
      settingsDialog.close();
      return;
    }
    const focusable = [
      ...refs.settings.querySelectorAll<HTMLElement>('button:not([disabled]), select, input'),
    ];
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    if (frame.pressed & NAV_DOWN) focusable[(index + 1) % focusable.length]?.focus();
    if (frame.pressed & NAV_UP) focusable[(index - 1 + focusable.length) % focusable.length]?.focus();
    if (frame.pressed & NAV_CONFIRM) (document.activeElement as HTMLElement | null)?.click();
  }

  // ── События окна и интерфейса ────────────────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend('hidden');
  });
  window.addEventListener('blur', () => suspend('blur'));
  window.addEventListener('gamepadconnected', () => hub.poll());
  window.addEventListener('gamepaddisconnected', () => hub.poll());
  hub.attach();

  // Окно LCD: пропорции берутся из профиля экрана, Canvas вписывается в него без растяжения.
  const logical = screenSize(pack.screen);
  refs.lid.style.setProperty('--lcd-aspect', `${logical.width} / ${logical.height}`);
  refs.lid.style.setProperty('--lcd-bg', pack.screen.colors.background);
  refs.stage.classList.toggle('stage--plain', !route.lid);
  refs.shellToggle.hidden = !route.lid;
  const applyShell = (): void => {
    refs.lid.dataset['shell'] = hub.settings.display.shell;
    refs.selShell.value = hub.settings.display.shell;
  };
  applyShell();
  refs.selShell.addEventListener('change', () => {
    hub.updateSettings((s) => {
      s.display.shell = SHELLS.find((shell) => shell === refs.selShell.value) ?? 'blue';
    });
    applyShell();
    refocusGame();
  });

  const resize = (): void => {
    renderer.resize(refs.lcdWindow.clientWidth, refs.lcdWindow.clientHeight, window.devicePixelRatio);
  };
  new ResizeObserver(resize).observe(refs.lcdWindow);
  window.addEventListener('resize', resize);
  resize();

  refs.overlayAction.addEventListener('click', () => {
    session.requestStart();
    refocusGame();
  });
  refs.btnPause.addEventListener('click', () => {
    if (game.state.phase === 'playing') session.requestPause();
    else if (game.state.phase === 'paused') session.requestStart();
    refocusGame();
  });
  const restart = (): void => {
    suspendReason = null;
    session.restart();
    refocusGame();
  };
  refs.btnRestart.addEventListener('click', restart);
  refs.btnDebugRestart.addEventListener('click', restart);
  refs.btnSettings.addEventListener('click', () => settingsDialog.open());
  refs.btnStep.addEventListener('click', () => {
    session.stepWhilePaused();
    refocusGame();
  });
  // Слой неактивных сегментов: значение по умолчанию задаёт профиль экрана, выбор пользователя сохраняется.
  const ghostOn = (): boolean => hub.settings.display.ghost ?? pack.screen.ghost?.enabled ?? false;
  refs.ghostToggle.hidden = !renderer.hasGhostLayer;
  refs.chkGhost.checked = ghostOn();
  renderer.setGhost(ghostOn());
  refs.chkGhost.addEventListener('change', () => {
    hub.updateSettings((s) => {
      s.display.ghost = refs.chkGhost.checked;
    });
    renderer.setGhost(refs.chkGhost.checked);
    refocusGame();
  });
  refs.chkDebug.addEventListener('change', () => {
    refs.debug.hidden = !refs.chkDebug.checked;
  });
  refs.chkSound.checked = hub.settings.display.sound;
  refs.chkSound.addEventListener('change', () => {
    hub.updateSettings((s) => {
      s.display.sound = refs.chkSound.checked;
    });
    audio.setMuted(!refs.chkSound.checked);
    audio.unlock();
    audio.play('start'); // короткий сигнал-подтверждение (при выключении звука молчит)
    refocusGame();
  });

  // Светодиоды: условная схема состояния (оригинальная логика не установлена), см. app/leds.ts.
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
  };
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
    setData('tick', s.tick);
    setData('worldTick', s.worldTick);
    setData('heroX', s.hero.x);
    setData('heroY', s.hero.y);
    setData('score', s.score);
    setData('lives', s.lives);
    setData('projectiles', s.projectiles.length);
    setData('gamepad', gamepadStatus.kind);
    setData('context', session.context);
    showLeds(ledState(s.phase, s.tick));

    // Пока идёт интро участка, оверлей «Старт» не закрывает поле (Enter всё равно запускает игру).
    const overlay = fx.intro ? null : overlayView(s, suspendReason);
    refs.overlay.hidden = overlay === null;
    if (overlay) {
      setText.overlayTitle(overlay.title);
      setText.overlayHint(overlay.hint);
      refs.overlayAction.hidden = overlay.action === null;
      if (overlay.action !== null && refs.overlayAction.textContent !== overlay.action) {
        refs.overlayAction.textContent = overlay.action;
      }
    }

    refs.btnPause.textContent = s.phase === 'paused' ? 'Продолжить' : 'Пауза';
    refs.btnPause.disabled = s.phase !== 'playing' && s.phase !== 'paused';

    const keyboardActive = isKeyboardActive();
    refs.focusHint.hidden = keyboardActive || settingsDialog.isOpen;
    setText.keyboard(keyboardStatusText(keyboardActive));
    const setup = gamepadStatus.kind === 'active' && needsGamepadSetup(hub.settings, gamepadStatus.pad);
    setText.gamepad(gamepadStatusText(gamepadStatus, setup));
    setText.hint(controlsHint(hub.settings.keyboard, route.fireHint));
    setText.timer(timerText(s, ctx.rules.params.tickRateHz, ctx.rules.params.timerLimitTicks));

    const warnings: string[] = [...assetWarnings];
    if (!hub.settingsPersisted) warnings.push('Настройки не сохраняются: хранилище браузера недоступно.');
    refs.statusWarning.hidden = warnings.length === 0;
    refs.statusWarning.textContent = warnings.join(' ');

    refs.btnStep.disabled = s.phase !== 'paused';
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
    requestAnimationFrame(frame);
    if (lastFrameTime !== null && now > lastFrameTime) fps = fps * 0.9 + (1000 / (now - lastFrameTime)) * 0.1;
    lastFrameTime = now;

    hub.poll(); // опрос геймпада — каждый кадр, в том числе на паузе (там ждём команду продолжения)
    session.frame(now);

    const level = ctx.levels.get(game.state.levelId)?.def;
    if (!level) return;
    const area: CameraArea = {
      columns: pack.screen.viewport.columns,
      rows: pack.screen.viewport.rows,
      levelWidth: level.width,
      levelHeight: level.height,
    };
    const target = { x: game.state.hero.x, y: Math.min(game.state.hero.y, level.height - 1) };
    camera = snapCamera ? centerCamera(target, area) : followCamera(camera, target, area);
    snapCamera = false;

    fx = effects.frame(game.state, level);
    renderer.render({
      state: game.state,
      level,
      camera,
      sprites,
      debug: { grid: refs.chkGrid.checked, collisions: refs.chkCollisions.checked },
      effects: fx,
    });
    updateUi();
  }

  refocusGame();
  requestAnimationFrame(frame);
}
