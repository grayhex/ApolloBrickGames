import { cueForEvent, type AudioPort } from '../../audio/audio';
import { GameSession } from '../../app/session';
import { SettingsDialog } from '../../app/settingsUi';
import { FixedStepper } from '../../app/stepper';
import type { InputHub } from '../../app/hub';
import { overlayView, type SuspendReason } from '../../app/viewModel';
import type { ContentPack, LevelDef } from '../../content/schema';
import { createContext, Game, type GameEvent } from '../../core';
import { centerCamera, followCamera, type CameraArea, type CameraPos } from '../../render/camera';
import type { AssetStore } from '../../render/assets';
import type { GamepadStatus } from '../../input/gamepad';
import { effectsWorld, LevelEffects } from '../../render/effects';
import { Renderer } from '../../render/renderer';
import { makeTestPack } from '../testPack';
import { button, el } from './el';

export interface TestStart {
  pack: ContentPack;
  assets: AssetStore;
  /** Копия редактируемой карты (со своей точкой старта: для «Тест отсюда» она подменена). */
  level: LevelDef;
  /** Подпись источника старта для строки состояния. */
  startNote: string;
  /** Слой неактивных сегментов (из настроек отображения). */
  ghost: boolean;
  onExit(): void;
}

/**
 * Тестовый запуск карты на том же ядре, рендерере, цикле и вводе, что и игра: GameSession, FixedStepper, Renderer
 * и общий InputHub с теми же привязками и настройками. Состояние симуляции живёт здесь и документ редактора не трогает.
 */
export class TestRunner {
  readonly root: HTMLElement;
  private readonly area: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLElement;
  private readonly overlayTitle: HTMLElement;
  private readonly overlayHint: HTMLElement;
  private readonly overlayAction: HTMLButtonElement;
  private readonly banner: HTMLElement;
  private readonly status: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly hub: InputHub;
  private readonly audio: AudioPort & { unlock(): void };
  private running = false;
  private raf = 0;
  private game: Game | null = null;
  private session: GameSession | null = null;
  private renderer: Renderer | null = null;
  private effects: LevelEffects | null = null;
  private start: TestStart | null = null;
  private camera: CameraPos = { x: 0, y: 0 };
  private snapCamera = true;
  private suspendReason: SuspendReason = null;
  private readonly observer: ResizeObserver;
  readonly settings: SettingsDialog;

  constructor(hub: InputHub, settingsDialog: HTMLDialogElement, audio: AudioPort & { unlock(): void }) {
    this.hub = hub;
    this.audio = audio;
    this.canvas = el('canvas', { id: 'test-screen', 'aria-hidden': 'true' });
    this.overlayTitle = el('p', { class: 'overlay__title' });
    this.overlayHint = el('p', { class: 'overlay__hint' });
    this.overlayAction = button('', () => {
      this.session?.requestStart();
      this.refocus();
    }, { class: 'btn btn--primary' });
    this.overlay = el('div', { class: 'overlay', hidden: true }, this.overlayTitle, this.overlayHint, this.overlayAction);
    this.area = el(
      'div',
      {
        class: 'game-area',
        id: 'test-area',
        tabindex: '0',
        role: 'application',
        'aria-label': 'Тестовый запуск. Управление — как в игре; привязки меняются в «Настройках управления».',
      },
      this.canvas,
      this.overlay,
    );
    this.banner = el('p', { class: 'test__banner' });
    this.status = el('p', { class: 'test__status', role: 'status' });
    this.pauseButton = button('Пауза', () => {
      const game = this.game;
      if (!game) return;
      if (game.state.phase === 'playing') this.session?.requestPause();
      else if (game.state.phase === 'paused') this.session?.requestStart();
      this.refocus();
    });
    const ghost = el('input', { type: 'checkbox', id: 'test-ghost' });
    ghost.addEventListener('change', () => this.renderer?.setGhost(ghost.checked));
    const sound = el('input', { type: 'checkbox', id: 'test-sound' });
    sound.checked = hub.settings.display.sound;
    sound.addEventListener('change', () => {
      hub.updateSettings((s) => {
        s.display.sound = sound.checked;
      });
      this.audio.setMuted(!sound.checked);
      this.audio.unlock();
      this.audio.play('start');
      this.refocus();
    });
    this.root = el(
      'section',
      { class: 'test', id: 'editor-test', hidden: true, 'aria-label': 'Тестовый запуск карты' },
      el(
        'div',
        { class: 'test__bar' },
        button('← Вернуться в редактор', () => this.exit(), { id: 'test-back', class: 'btn btn--primary' }),
        this.pauseButton,
        button('Заново', () => this.restart()),
        button('Настройки управления…', () => this.settings.open()),
        el('label', { class: 'toolbar__check' }, ghost, ' Неактивные сегменты'),
        el('label', { class: 'toolbar__check' }, sound, ' Звук'),
      ),
      this.banner,
      el('div', { class: 'test__stage' }, this.area),
      this.status,
    );

    this.settings = new SettingsDialog(settingsDialog, hub, {
      onOpen: () => {
        if (this.game?.state.phase === 'playing') this.suspendReason = 'settings';
        this.session?.suspend();
        this.session?.setContext('menu');
      },
      onClose: () => {
        this.session?.setContext('game');
        this.refocus();
      },
    });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.root.querySelector('.test__stage') ?? this.root);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.suspend('hidden');
    });
    window.addEventListener('blur', () => this.suspend('blur'));
  }

  /** Клавиатура принадлежит тесту, пока в фокусе его игровая область. */
  keyboardActive(): boolean {
    return this.running && this.area.contains(document.activeElement);
  }

  get active(): boolean {
    return this.running;
  }

  onGamepadStatus(status: GamepadStatus): void {
    this.area.dataset['gamepad'] = status.kind;
    this.settings.refresh();
  }

  onGamepadDisconnect(): void {
    this.suspend('gamepad');
  }

  begin(start: TestStart): void {
    this.end();
    this.start = start;
    const testPack = makeTestPack(start.pack, start.level);
    const ctx = createContext(testPack);
    this.game = new Game(ctx, 1);
    this.renderer = new Renderer(this.canvas, start.pack.screen, start.assets);
    // Интро в тестовом запуске выключено (карту проверяют, а не смотрят заставку); отскок перекладины — как в игре.
    const effects = new LevelEffects(start.pack.animations ?? null, { viewport: start.pack.screen.viewport, intro: false });
    this.effects = effects;
    const ghostOn = this.hub.settings.display.ghost ?? start.pack.screen.ghost?.enabled ?? false;
    this.renderer.setGhost(ghostOn);
    (this.root.querySelector('#test-ghost') as HTMLInputElement).checked = ghostOn;
    const stepper = new FixedStepper(1000 / ctx.rules.params.tickRateHz);
    this.session = new GameSession({
      game: this.game,
      tracker: this.hub.tracker,
      stepper,
      onEvents: (events: readonly GameEvent[]) => {
        for (const event of events) {
          if (event.type === 'levelStarted') this.snapCamera = true;
          const world = this.game ? effectsWorld(ctx, this.game.state) : null;
          if (world) effects.onEvent(event, world);
          const cue = cueForEvent(event);
          if (cue) this.audio.play(cue);
        }
      },
      resetDevices: () => this.hub.resetDevices(),
    });
    this.banner.textContent = `Тестовые правила (demo): ${start.pack.manifest.title}; правила ${ctx.rules.id} v${ctx.rules.version}, ${ctx.rules.params.tickRateHz} тактов/с. Это проверка карты на демо-движке, а не доказательство того, что оригинал ведёт себя так же. ${start.startNote}`;
    this.root.hidden = false;
    this.running = true;
    this.suspendReason = null;
    this.snapCamera = true;
    // Вход в тест: удерживаемые клавиши и кнопки геймпада не должны превратиться в прыжок или выстрел.
    this.hub.resetDevices();
    this.hub.tracker.reset();
    stepper.reset();
    this.resize();
    this.session.requestStart();
    this.refocus();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Закрыть тест без вызова onExit (вызывающий сам переключает экран). */
  end(): void {
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.running) {
      this.hub.resetDevices();
      this.hub.tracker.reset();
    }
    this.running = false;
    this.game = null;
    this.session = null;
    this.renderer = null;
    this.effects = null;
    this.root.hidden = true;
  }

  private exit(): void {
    const start = this.start;
    this.end();
    start?.onExit();
  }

  private restart(): void {
    this.suspendReason = null;
    this.session?.restart();
    this.refocus();
  }

  private suspend(reason: Exclude<SuspendReason, null>): void {
    if (!this.running || !this.game) return;
    if (this.game.state.phase === 'playing') this.suspendReason = reason;
    this.session?.suspend();
  }

  private refocus(): void {
    this.area.focus({ preventScroll: true });
  }

  private resize(): void {
    const stage = this.root.querySelector('.test__stage');
    if (!stage || !this.renderer) return;
    const rect = stage.getBoundingClientRect();
    this.renderer.resize(Math.max(1, rect.width - 4), Math.max(1, rect.height - 4), window.devicePixelRatio || 1);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const { game, session, renderer, start } = this;
    if (!game || !session || !renderer || !start) return;
    this.hub.poll();
    session.frame(now);

    const level = start.level;
    const area: CameraArea = {
      columns: start.pack.screen.viewport.columns,
      rows: start.pack.screen.viewport.rows,
      levelWidth: level.width,
      levelHeight: level.height,
    };
    const target = { x: game.state.hero.x, y: Math.min(game.state.hero.y, level.height - 1) };
    this.camera = this.snapCamera ? centerCamera(target, area) : followCamera(this.camera, target, area);
    this.snapCamera = false;
    renderer.render({
      state: game.state,
      level,
      camera: this.camera,
      sprites: start.pack.manifest.sprites,
      debug: { grid: false, collisions: false },
      ...(this.effects ? { effects: this.effects.frame(game.state, level) } : {}),
    });
    this.updateUi(game);
  };

  private updateUi(game: Game): void {
    const s = game.state;
    if (s.phase === 'playing') this.suspendReason = null;
    const data = this.area.dataset;
    data['phase'] = s.phase;
    data['heroX'] = String(s.hero.x);
    data['heroY'] = String(s.hero.y);
    data['tick'] = String(s.tick);
    data['level'] = s.levelId;
    data['context'] = this.session?.context ?? 'game';
    const overlay = overlayView(s, this.suspendReason);
    this.overlay.hidden = overlay === null;
    if (overlay) {
      this.overlayTitle.textContent = overlay.title;
      this.overlayHint.textContent = overlay.hint;
      this.overlayAction.hidden = overlay.action === null;
      if (overlay.action !== null) this.overlayAction.textContent = overlay.action;
    }
    this.pauseButton.textContent = s.phase === 'paused' ? 'Продолжить' : 'Пауза';
    this.pauseButton.disabled = s.phase !== 'playing' && s.phase !== 'paused';
    this.status.textContent = `Фаза: ${s.phase} · герой: x=${s.hero.x}, y=${s.hero.y} · такт ${s.tick} · клавиатура ${this.keyboardActive() ? 'активна' : 'не активна — кликните по игре'}`;
  }
}
