import { ACTIONS, type Action } from '../core/actions';
import {
  cloneBindings,
  DEFAULT_KEYBOARD_BINDINGS,
  describeSource,
  keySource,
  type Bindings,
} from '../input/bindings';
import type { PadInfo } from '../input/gamepad';
import {
  DEFAULT_STICK_THRESHOLD,
  gamepadBindingsFor,
  MAX_STICK_THRESHOLD,
  MIN_STICK_THRESHOLD,
  needsGamepadSetup,
  SHELLS,
  type Shell,
} from '../input/settings';
import { h } from './dom';
import type { InputHub } from './hub';

const ACTION_LABELS: Record<Action, string> = {
  left: 'Влево',
  right: 'Вправо',
  up: 'Вверх',
  down: 'Вниз',
  jump: 'Прыжок',
  fire: 'Огонь',
  start: 'Старт',
  pause: 'Пауза',
  confirm: 'Подтвердить (меню)',
  back: 'Назад (меню)',
};

type Capture = { device: 'keyboard' | 'gamepad'; action: Action };

function describeList(sources: readonly string[]): string {
  return sources.length === 0 ? 'не назначено' : sources.map(describeSource).join(' · ');
}

/** Подписи цветов корпуса в настройках. */
export const SHELL_LABELS: Record<Shell, string> = {
  blue: 'синий',
  red: 'красный',
  yellow: 'жёлтый',
  white: 'белый',
};

/** Раздел «Внешний вид и звук» (только в игре, не в редакторе). */
export interface DisplayOptions {
  /** Есть ли у экрана слой неактивных сегментов. */
  hasGhost: boolean;
  /** Значение по умолчанию для слоя, если пользователь не выбирал. */
  ghostDefault: boolean;
  /** Настройка изменена: применить к странице. */
  onChange(): void;
}

export interface SettingsDialogOptions {
  onOpen(): void;
  onClose(): void;
  display?: DisplayOptions;
}

/**
 * Экран настроек: цвет корпуса, неактивные сегменты и звук (в игре), переназначение кнопок клавиатуры и геймпада,
 * порог стика, выбор устройства, сброс к стандартному профилю. Пока диалог открыт, игра на паузе,
 * а клавиатура игре не принадлежит (работают обычные Tab/Enter/Esc).
 */
export class SettingsDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly hub: InputHub;
  private readonly options: SettingsDialogOptions;
  private capture: Capture | null = null;
  private focusKey: string | null = null;

  constructor(dialog: HTMLDialogElement, hub: InputHub, options: SettingsDialogOptions) {
    this.dialog = dialog;
    this.hub = hub;
    this.options = options;
    dialog.addEventListener('close', () => {
      this.endCapture();
      this.options.onClose();
    });
    // Esc: закрыть сразу и вернуть фокус игре в том же событии, а не после `close` (браузер сперва возвращает его на кнопку-опенер).
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    window.addEventListener('keydown', this.onCaptureKey, true);
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  get capturing(): boolean {
    return this.capture !== null;
  }

  open(): void {
    if (this.dialog.open) return;
    this.options.onOpen();
    this.render();
    this.dialog.showModal();
  }

  close(): void {
    if (!this.dialog.open) return;
    this.dialog.close();
    // Браузер возвращает фокус на кнопку, открывшую диалог, а событие `close` приходит позже:
    // возвращаем управление игре сразу, чтобы Enter/Space не нажали эту кнопку (onClose идемпотентен).
    this.endCapture();
    this.options.onClose();
  }

  /** Состояние геймпада изменилось — перерисовать, если диалог открыт. */
  refresh(): void {
    if (this.dialog.open && !this.capture) this.render();
  }

  // ── Захват нажатия для переназначения ────────────────────────────────────

  private readonly onCaptureKey = (event: KeyboardEvent): void => {
    const capture = this.capture;
    if (!capture) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      this.endCapture();
      this.render();
      return;
    }
    if (capture.device !== 'keyboard' || event.repeat) return;
    this.hub.updateSettings((settings) => {
      settings.keyboard[capture.action] = [keySource(event.code)];
    });
    this.endCapture();
    this.render();
  };

  private beginKeyboardCapture(action: Action): void {
    this.endCapture();
    this.capture = { device: 'keyboard', action };
    this.focusKey = `kb:${action}`;
    this.render();
  }

  private beginGamepadCapture(action: Action): void {
    this.endCapture();
    this.capture = { device: 'gamepad', action };
    this.focusKey = `pad:${action}`;
    this.hub.gamepad.beginCapture((pad, source) => {
      this.hub.updateSettings((settings) => {
        const own = settings.gamepad.byId[pad.id] ?? cloneBindings(gamepadBindingsFor(settings, pad));
        own[action] = [source];
        settings.gamepad.byId[pad.id] = own;
      });
      this.capture = null;
      this.render();
    });
    this.render();
  }

  private endCapture(): void {
    this.capture = null;
    this.hub.gamepad.cancelCapture();
  }

  // ── Отрисовка ────────────────────────────────────────────────────────────

  private targetPad(): PadInfo | null {
    const status = this.hub.gamepad.currentStatus;
    if (status.kind === 'active') return status.pad;
    const pads = this.hub.listPads();
    const preferred = this.hub.settings.gamepad.preferredId;
    return pads.find((pad) => pad.id === preferred) ?? pads[0] ?? null;
  }

  private render(): void {
    const { settings } = this.hub;
    const pad = this.targetPad();
    const padBindings: Bindings | null = pad ? gamepadBindingsFor(settings, pad) : null;

    const title = h('h2', { id: 'settings-title' }, 'Настройки');
    this.dialog.setAttribute('aria-labelledby', 'settings-title');

    const keyboard = h(
      'section',
      { class: 'settings__section' },
      h('h3', {}, 'Клавиатура'),
      h('p', { class: 'settings__note' }, 'Клавиша назначается по её положению на клавиатуре — раскладка не важна. Esc отменяет назначение.'),
      this.bindingsTable(settings.keyboard, 'keyboard'),
      h('div', { class: 'settings__row' }, this.button('Сбросить клавиатуру', () => {
        this.hub.updateSettings((s) => {
          s.keyboard = cloneBindings(DEFAULT_KEYBOARD_BINDINGS);
        });
        this.render();
      })),
    );

    const gamepad = h('section', { class: 'settings__section' }, h('h3', {}, 'Геймпад'), this.gamepadControls(pad));
    if (pad && padBindings) {
      gamepad.append(
        this.bindingsTable(padBindings, 'gamepad'),
        h('div', { class: 'settings__row' }, this.button('Сбросить геймпад', () => {
          this.hub.updateSettings((s) => {
            delete s.gamepad.byId[pad.id];
            s.gamepad.stickThreshold = DEFAULT_STICK_THRESHOLD;
          });
          this.render();
        })),
      );
    }

    const storage = h(
      'p',
      { class: 'settings__note' },
      this.hub.settingsPersisted
        ? 'Настройки сохраняются в этом браузере.'
        : 'Хранилище браузера недоступно: настройки действуют только до перезагрузки страницы.',
    );

    const actions = h(
      'div',
      { class: 'settings__row settings__row--end' },
      this.button('Сбросить всё к стандартному', () => {
        this.hub.resetSettings();
        this.render();
      }),
      this.button('Закрыть', () => this.close(), 'btn--primary'),
    );

    const appearance = this.options.display ? this.appearanceSection(this.options.display) : null;
    this.dialog.replaceChildren(...(appearance ? [title, appearance] : [title]), keyboard, gamepad, storage, actions);
    this.restoreFocus();
  }

  private appearanceSection(display: DisplayOptions): HTMLElement {
    const { settings } = this.hub;
    const apply = (change: () => void): void => {
      change();
      display.onChange();
    };

    const shell = h('select', { id: 'settings-shell' });
    for (const value of SHELLS) shell.append(h('option', { value }, SHELL_LABELS[value]));
    shell.value = settings.display.shell;
    shell.addEventListener('change', () => {
      const chosen = SHELLS.find((value) => value === shell.value) ?? 'blue';
      apply(() => this.hub.updateSettings((s) => void (s.display.shell = chosen)));
    });

    const check = (id: string, label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement => {
      const input = h('input', { type: 'checkbox', id });
      input.checked = checked;
      input.addEventListener('change', () => apply(() => onChange(input.checked)));
      return h('label', { class: 'settings__check', for: id }, input, ` ${label}`);
    };

    const section = h(
      'section',
      { class: 'settings__section' },
      h('h3', {}, 'Внешний вид и звук'),
      h('div', { class: 'settings__pad' }, h('label', { for: 'settings-shell' }, 'Цвет корпуса'), shell),
      check('settings-sound', 'Звук', settings.display.sound, (value) =>
        this.hub.updateSettings((s) => void (s.display.sound = value)),
      ),
    );
    if (display.hasGhost) {
      section.append(
        check('settings-ghost', 'Показывать неактивные сегменты экрана', settings.display.ghost ?? display.ghostDefault, (value) =>
          this.hub.updateSettings((s) => void (s.display.ghost = value)),
        ),
      );
    }
    return section;
  }

  private gamepadControls(pad: PadInfo | null): Node {
    const { settings } = this.hub;
    const wrapper = h('div', { class: 'settings__pad' });

    const select = h('select', { id: 'settings-pad' });
    select.append(h('option', { value: '' }, 'Автоматически (первое нажатое устройство)'));
    for (const info of this.hub.listPads()) {
      select.append(h('option', { value: info.id }, `${info.id} [${info.index}]`));
    }
    select.value = settings.gamepad.preferredId ?? '';
    select.addEventListener('change', () => {
      this.hub.updateSettings((s) => {
        s.gamepad.preferredId = select.value === '' ? null : select.value;
      });
      this.render();
    });

    const threshold = h('input', {
      id: 'settings-threshold',
      type: 'range',
      min: String(MIN_STICK_THRESHOLD),
      max: String(MAX_STICK_THRESHOLD),
      step: '0.05',
      value: String(settings.gamepad.stickThreshold),
    });
    const output = h('output', { for: 'settings-threshold' }, settings.gamepad.stickThreshold.toFixed(2));
    threshold.addEventListener('input', () => {
      const value = Number(threshold.value);
      output.textContent = value.toFixed(2);
      this.hub.updateSettings((s) => {
        s.gamepad.stickThreshold = value;
      });
    });

    wrapper.append(
      h('label', { for: 'settings-pad' }, 'Устройство'),
      select,
      h('label', { for: 'settings-threshold' }, 'Порог стика (мёртвая зона)'),
      h('span', { class: 'settings__range' }, threshold, output),
    );

    if (!pad) {
      wrapper.append(h('p', { class: 'settings__warn' }, 'Геймпад не обнаружен. Подключите его и нажмите любую кнопку — затем вернитесь сюда.'));
    } else if (needsGamepadSetup(settings, pad)) {
      wrapper.append(
        h(
          'p',
          { class: 'settings__warn' },
          `У «${pad.id}» нестандартный mapping («${pad.mapping || 'не указан'}»): автоматической раскладки нет. Назначьте кнопки вручную.`,
        ),
      );
    } else {
      wrapper.append(h('p', { class: 'settings__note' }, `Настраивается: ${pad.id} (${pad.mapping || 'без mapping'}).`));
    }
    return wrapper;
  }

  private bindingsTable(bindings: Bindings, device: 'keyboard' | 'gamepad'): HTMLTableElement {
    const table = h('table', { class: 'settings__table' });
    table.append(h('caption', { class: 'visually-hidden' }, device === 'keyboard' ? 'Привязки клавиатуры' : 'Привязки геймпада'));
    const body = h('tbody');
    for (const action of ACTIONS) {
      const capturing = this.capture?.device === device && this.capture.action === action;
      const key = `${device === 'keyboard' ? 'kb' : 'pad'}:${action}`;
      const assign = this.button(
        capturing ? (device === 'keyboard' ? 'Нажмите клавишу…' : 'Нажмите кнопку на геймпаде…') : 'Назначить',
        () => (capturing ? (this.endCapture(), this.render()) : device === 'keyboard' ? this.beginKeyboardCapture(action) : this.beginGamepadCapture(action)),
      );
      assign.dataset['key'] = key;
      const clear = this.button('Очистить', () => {
        this.hub.updateSettings((settings) => {
          if (device === 'keyboard') {
            settings.keyboard[action] = [];
          } else {
            const pad = this.targetPad();
            if (!pad) return;
            const own = settings.gamepad.byId[pad.id] ?? cloneBindings(gamepadBindingsFor(settings, pad));
            own[action] = [];
            settings.gamepad.byId[pad.id] = own;
          }
        });
        this.render();
      });
      body.append(
        h(
          'tr',
          {},
          h('th', { scope: 'row' }, ACTION_LABELS[action]),
          h('td', {}, describeList(bindings[action])),
          h('td', { class: 'settings__cell-actions' }, assign, clear),
        ),
      );
    }
    table.append(body);
    return table;
  }

  private button(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
    const button = h('button', { type: 'button', class: `btn ${extraClass}`.trim() }, label);
    button.addEventListener('click', onClick);
    return button;
  }

  private restoreFocus(): void {
    if (!this.focusKey) return;
    const target = this.dialog.querySelector<HTMLElement>(`[data-key="${this.focusKey}"]`);
    target?.focus();
    if (!this.capture) this.focusKey = null;
  }
}
