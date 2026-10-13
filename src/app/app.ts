import { cueForEvent, NullAudio, type AudioPort } from '../audio/audio';
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
import { Renderer } from '../render/renderer';
import { browserGamepadProvider, type GamepadStatus } from '../input/gamepad';
import { browserStorage, needsGamepadSetup } from '../input/settings';
import { InputHub } from './hub';
import { loadContentPack } from './loadContent';
import { GameSession } from './session';
import { SettingsDialog } from './settingsUi';
import { FixedStepper } from './stepper';
import {
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

export async function startApp(): Promise<void> {
  const refs = {
    gameArea: byId<HTMLElement>('game-area'),
    stage: byId<HTMLElement>('stage'),
    canvas: byId<HTMLCanvasElement>('screen'),
    overlay: byId<HTMLElement>('overlay'),
    overlayTitle: byId<HTMLElement>('overlay-title'),
    overlayHint: byId<HTMLElement>('overlay-hint'),
    overlayAction: byId<HTMLButtonElement>('overlay-action'),
    focusHint: byId<HTMLElement>('focus-hint'),
    badge: byId<HTMLElement>('badge'),
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

  // ── Данные: статические JSON, проверка при загрузке ──────────────────────
  const manifestUrl = new URL(`${import.meta.env.BASE_URL}content/demo/pack.json`, window.location.href).href;
  const { pack, assetsUrl } = await loadContentPack(manifestUrl, validationEnv(DEMO_BEHAVIORS, GLYPH_NAMES));

  const assets = new AssetStore(pack.assets, assetsUrl);
  const assetWarnings = await assets.load();
  for (const warning of assetWarnings) console.warn(warning);

  const ctx = createContext(pack);
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get('seed') ?? '', 10) || 1;
  const game = new Game(ctx, seed);
  const renderer = new Renderer(refs.canvas, pack.screen, assets);
  const audio: AudioPort = new NullAudio();
  const { sprites } = pack.manifest;
  const isDemo = [pack.manifest, pack.screen, pack.rules, pack.assets, ...pack.levels].some((part) => part.status === 'demo');
  refs.badge.hidden = !isDemo;
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

  const stepper = new FixedStepper(1000 / ctx.rules.params.tickRateHz);

  const onEvents = (events: readonly GameEvent[]): void => {
    for (const event of events) {
      if (event.type === 'levelStarted') snapCamera = true;
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

  const resize = (): void => {
    renderer.resize(refs.stage.clientWidth, refs.stage.clientHeight, window.devicePixelRatio);
  };
  new ResizeObserver(resize).observe(refs.stage);
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
  refs.chkDebug.addEventListener('change', () => {
    refs.debug.hidden = !refs.chkDebug.checked;
  });

  const setText = {
    keyboard: cachedText(refs.statusKeyboard),
    gamepad: cachedText(refs.statusGamepad),
    timer: cachedText(refs.statusTimer),
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

    const overlay = overlayView(s, suspendReason);
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

    renderer.render({
      state: game.state,
      level,
      camera,
      sprites,
      debug: { grid: refs.chkGrid.checked, collisions: refs.chkCollisions.checked },
    });
    updateUi();
  }

  refocusGame();
  requestAnimationFrame(frame);
}
