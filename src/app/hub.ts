import { boundSources, compileBindings, maskOfSources, type SourceId } from '../input/bindings';
import {
  GamepadInput,
  type GamepadProvider,
  type GamepadStatus,
  type PadInfo,
} from '../input/gamepad';
import { KeyboardInput } from '../input/keyboard';
import { ScreenInput } from '../input/screen';
import {
  defaultSettings,
  gamepadBindingsFor,
  loadSettings,
  saveSettings,
  type Settings,
  type StorageLike,
} from '../input/settings';
import { ActionTracker } from '../input/tracker';

export interface InputHubOptions {
  /** Куда подписывать клавиатуру (window). */
  keyboardTarget: EventTarget;
  provider: GamepadProvider;
  storage: StorageLike | null;
  /** Клавиатура принадлежит игре, пока активна игровая область. */
  isKeyboardActive(): boolean;
  onGamepadStatus?(status: GamepadStatus): void;
  onGamepadDisconnect?(pad: PadInfo): void;
}

/**
 * Все устройства ввода за одним объектом: клавиатура, геймпад и экранные кнопки пишут в один трекер,
 * настройки читаются/сохраняются здесь. Игра получает только логические действия.
 */
export class InputHub {
  readonly tracker = new ActionTracker();
  readonly keyboard: KeyboardInput;
  readonly gamepad: GamepadInput;
  /** Экранные кнопки игрушки (мышь, касание). */
  readonly screen = new ScreenInput((mask) => this.tracker.setSource('screen', mask));
  settings: Settings;
  /** Какое устройство нажимали последним — для значка «клавиатура / геймпад». Геймпад становится последним и при активации. */
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';
  private readonly storage: StorageLike | null;
  private readonly provider: GamepadProvider;
  private boundKeys: Set<SourceId>;
  private saved = true;

  constructor(options: InputHubOptions) {
    this.storage = options.storage;
    this.provider = options.provider;
    this.settings = loadSettings(options.storage);
    this.boundKeys = boundSources(this.settings.keyboard);

    this.keyboard = new KeyboardInput(options.keyboardTarget, {
      isActive: options.isKeyboardActive,
      isBound: (source) => this.boundKeys.has(source),
      onSources: (down) => {
        const mask = maskOfSources(down, compileBindings(this.settings.keyboard));
        if (mask !== 0) this.lastDevice = 'keyboard';
        this.tracker.setSource('keyboard', mask);
      },
    });

    this.gamepad = new GamepadInput({
      provider: options.provider,
      bindingsFor: (pad) => gamepadBindingsFor(this.settings, pad),
      getThreshold: () => this.settings.gamepad.stickThreshold,
      getPreferredId: () => this.settings.gamepad.preferredId,
      sink: (mask) => {
        if (mask !== 0) this.lastDevice = 'gamepad';
        this.tracker.setSource('gamepad', mask);
      },
      onStatus: (status) => {
        if (status.kind === 'active') this.lastDevice = 'gamepad';
        options.onGamepadStatus?.(status);
      },
      ...(options.onGamepadDisconnect ? { onDisconnect: options.onGamepadDisconnect } : {}),
    });
  }

  /** Подключённые устройства (для выбора в настройках). Ошибки API → пустой список. */
  listPads(): PadInfo[] {
    try {
      return this.provider()
        .filter((pad): pad is NonNullable<typeof pad> => pad !== null && pad !== undefined && pad.connected)
        .map((pad) => ({ index: pad.index, id: pad.id, mapping: pad.mapping }));
    } catch {
      return [];
    }
  }

  /** false — сохранить не удалось (настройки действуют только до перезагрузки). */
  get settingsPersisted(): boolean {
    return this.saved;
  }

  attach(): void {
    this.keyboard.attach();
  }

  /** Опрос устройств; вызывается каждый кадр отрисовки, в том числе на паузе. */
  poll(): void {
    this.gamepad.poll();
  }

  /** Сброс клавиш, экранных кнопок и нейтральная синхронизация геймпада. */
  resetDevices(): void {
    this.keyboard.releaseAll();
    this.screen.releaseAll();
    this.gamepad.sync();
  }

  /** Изменить настройки: применить, пересчитать привязки, сохранить. */
  updateSettings(change: (settings: Settings) => void): void {
    change(this.settings);
    this.boundKeys = boundSources(this.settings.keyboard);
    this.saved = saveSettings(this.storage, this.settings);
  }

  resetSettings(): void {
    this.settings = defaultSettings();
    this.boundKeys = boundSources(this.settings.keyboard);
    this.saved = saveSettings(this.storage, this.settings);
  }
}
