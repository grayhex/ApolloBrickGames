import type { ActionMask } from '../core/actions';
import {
  axisSource,
  buttonSource,
  compileBindings,
  maskOfSources,
  type Bindings,
  type SourceId,
} from './bindings';

export interface GamepadButtonLike {
  pressed: boolean;
  value: number;
}

/** Нужное нам подмножество объекта Gamepad (его легко подменить в тестах). */
export interface GamepadLike {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  buttons: ReadonlyArray<GamepadButtonLike>;
  axes: ReadonlyArray<number>;
}

/** Поставщик состояния устройств. В браузере — navigator.getGamepads(); в тестах — подставной. */
export type GamepadProvider = () => ReadonlyArray<GamepadLike | null | undefined>;

export interface PadInfo {
  index: number;
  id: string;
  mapping: string;
}

export type GamepadStatus =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'none' }
  | { kind: 'idle'; pads: PadInfo[] }
  | { kind: 'active'; pad: PadInfo };

export interface GamepadInputOptions {
  provider: GamepadProvider;
  /** Привязки для конкретного устройства (зависят от mapping и сохранённых настроек). */
  bindingsFor(pad: PadInfo): Bindings;
  /** Порог срабатывания направления стика, 0…1. */
  getThreshold(): number;
  /** Предпочитаемое устройство (по id); null — автоматический выбор по первому нажатию. */
  getPreferredId(): string | null;
  /** Принимает маску действий геймпада (вызывается на каждом опросе). */
  sink(mask: ActionMask): void;
  onStatus?(status: GamepadStatus): void;
  /** Активное устройство пропало. Оболочка ставит игру на паузу. */
  onDisconnect?(pad: PadInfo): void;
}

const BUTTON_VALUE_THRESHOLD = 0.5;

function infoOf(pad: GamepadLike): PadInfo {
  return { index: pad.index, id: pad.id, mapping: pad.mapping };
}

function sameStatus(a: GamepadStatus, b: GamepadStatus): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Адаптер Gamepad API.
 *  - Состояние читается через provider() на каждом опросе; объекты событий подключения не хранятся.
 *  - Активное устройство — одно; индекс не обязан быть 0. Без выбора активным становится
 *    первое устройство, на котором нажали кнопку.
 *  - При активации, после sync() и после повторного подключения сначала берётся нейтральное
 *    состояние: уже удерживаемые контролы «разоружаются», пока их не отпустят.
 *  - Стик работает с гистерезисом: направление включается выше порога, выключается ниже него.
 */
export class GamepadInput {
  private readonly options: GamepadInputOptions;
  private active: PadInfo | null = null;
  private readonly axisOn = new Set<SourceId>();
  private disarmed = new Set<SourceId>();
  private needsSync = false;
  private status: GamepadStatus = { kind: 'none' };
  private capture: { done: (pad: PadInfo, source: SourceId) => void; baselines: Map<number, Set<SourceId>> } | null =
    null;

  constructor(options: GamepadInputOptions) {
    this.options = options;
  }

  get currentStatus(): GamepadStatus {
    return this.status;
  }

  /** Следующий опрос заново «снимет» нейтральное состояние (после паузы, возврата во вкладку). */
  sync(): void {
    this.needsSync = true;
  }

  /** Захват следующего нажатия для переназначения: вызывается один раз и сам отключается. */
  beginCapture(done: (pad: PadInfo, source: SourceId) => void): void {
    this.capture = { done, baselines: new Map() };
  }

  cancelCapture(): void {
    this.capture = null;
  }

  get capturing(): boolean {
    return this.capture !== null;
  }

  poll(): void {
    let pads: GamepadLike[];
    try {
      pads = this.options
        .provider()
        .filter((pad): pad is GamepadLike => pad !== null && pad !== undefined && pad.connected);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }

    if (pads.length === 0) {
      if (this.active) this.deactivate();
      this.options.sink(0);
      this.setStatus({ kind: 'none' });
      return;
    }

    if (this.active) {
      const { index, id } = this.active;
      if (!pads.some((pad) => pad.index === index && pad.id === id)) this.deactivate();
    }

    // Пользователь выбрал в настройках другое устройство — переключаемся (с нейтральной синхронизацией).
    const preferredId = this.options.getPreferredId();
    if (this.active && preferredId && this.active.id !== preferredId && pads.some((pad) => pad.id === preferredId)) {
      this.deactivate(false);
    }

    if (this.capture) {
      this.runCapture(pads);
      this.options.sink(0);
      if (!this.active) this.setStatus({ kind: 'idle', pads: pads.map(infoOf) });
      return;
    }

    if (!this.active) {
      const preferred = this.options.getPreferredId();
      const candidate = preferred
        ? pads.find((pad) => pad.id === preferred)
        : pads.find((pad) => this.readSources(pad, false).size > 0);
      if (candidate) this.activate(candidate);
    }

    const active = this.active;
    const pad = active ? pads.find((p) => p.index === active.index && p.id === active.id) : undefined;
    if (!active || !pad) {
      this.options.sink(0);
      this.setStatus({ kind: 'idle', pads: pads.map(infoOf) });
      return;
    }

    const raw = this.readSources(pad, true);
    if (this.needsSync) {
      this.disarmed = new Set(raw);
      this.needsSync = false;
    }
    for (const source of this.disarmed) if (!raw.has(source)) this.disarmed.delete(source);
    const effective = [...raw].filter((source) => !this.disarmed.has(source));
    this.options.sink(maskOfSources(effective, compileBindings(this.options.bindingsFor(active))));
    this.setStatus({ kind: 'active', pad: active });
  }

  private activate(pad: GamepadLike): void {
    this.active = infoOf(pad);
    this.axisOn.clear();
    // Нейтральная синхронизация: то, что нажато в момент активации, не считается вводом.
    this.disarmed = new Set(this.readSources(pad, true));
    this.needsSync = false;
  }

  /** notify = false — переключение устройства, а не отключение: оболочка паузу не ставит. */
  private deactivate(notify = true): void {
    const pad = this.active;
    this.active = null;
    this.axisOn.clear();
    this.disarmed.clear();
    this.needsSync = false;
    this.options.sink(0);
    if (pad && notify) this.options.onDisconnect?.(pad);
  }

  private fail(reason: string): void {
    if (this.active) this.deactivate();
    this.options.sink(0);
    this.setStatus({ kind: 'unavailable', reason });
  }

  private setStatus(status: GamepadStatus): void {
    if (sameStatus(this.status, status)) return;
    this.status = status;
    this.options.onStatus?.(status);
  }

  private runCapture(pads: GamepadLike[]): void {
    const capture = this.capture;
    if (!capture) return;
    for (const pad of pads) {
      const current = this.readSources(pad, false);
      const baseline = capture.baselines.get(pad.index);
      if (!baseline) {
        capture.baselines.set(pad.index, current); // то, что уже нажато, не считается
        continue;
      }
      for (const source of current) {
        if (baseline.has(source)) continue;
        this.capture = null;
        this.needsSync = true;
        capture.done(infoOf(pad), source);
        return;
      }
      for (const source of baseline) if (!current.has(source)) baseline.delete(source);
    }
  }

  /** Активные источники устройства. withHysteresis: запоминать состояние осей между опросами. */
  private readSources(pad: GamepadLike, withHysteresis: boolean): Set<SourceId> {
    const out = new Set<SourceId>();
    pad.buttons.forEach((button, index) => {
      if (button.pressed || button.value > BUTTON_VALUE_THRESHOLD) out.add(buttonSource(index));
    });

    const engage = this.options.getThreshold();
    const release = Math.max(0.05, engage - Math.min(0.15, engage / 2));
    pad.axes.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      for (const direction of ['-', '+'] as const) {
        const id = axisSource(index, direction);
        const magnitude = direction === '+' ? value : -value;
        const wasOn = withHysteresis && this.axisOn.has(id);
        const on = wasOn ? magnitude > release : magnitude > engage;
        if (on) out.add(id);
        if (withHysteresis) {
          if (on) this.axisOn.add(id);
          else this.axisOn.delete(id);
        }
      }
    });
    return out;
  }
}

/** Провайдер для браузера. Если API недоступен или бросает исключение — это обрабатывает адаптер. */
export function browserGamepadProvider(): GamepadProvider {
  return () => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      throw new Error('Gamepad API недоступен (нужен HTTPS или localhost и поддержка браузера)');
    }
    return navigator.getGamepads();
  };
}
