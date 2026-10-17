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
} from '../input/settings';
import { h } from './dom';
import { getLang, onLangChange, t, type MsgKey } from './i18n';
import type { InputHub } from './hub';
import { ShellPicker } from './shellPicker';

const ACTION_KEYS: Record<Action, MsgKey> = {
  left: 'act.left',
  right: 'act.right',
  up: 'act.up',
  down: 'act.down',
  jump: 'act.jump',
  fire: 'act.fire',
  start: 'act.start',
  pause: 'act.pause',
  confirm: 'act.confirm',
  back: 'act.back',
};

type Capture = { device: 'keyboard' | 'gamepad'; action: Action };

function describeList(sources: readonly string[]): string {
  const lang = getLang();
  return sources.length === 0 ? t('common.unset') : sources.map((source) => describeSource(source, lang)).join(' · ');
}

/** Раздел «Цвет по умолчанию» (только в игре, не в редакторе). Цвет текущей игры выбирается на самой странице. */
export interface DisplayOptions {
  /** Цвет по умолчанию изменён или настройки сброшены: применить к странице. */
  onChange(): void;
}

export interface SettingsDialogOptions {
  /** Доступные действия текущей приставки; общие привязки Mario сохраняются. */
  actions?: readonly Action[];
  onOpen(): void;
  onClose(): void;
  display?: DisplayOptions;
  /** Обработчики диалога (он остаётся тем же элементом страницы) снимаются, когда игрушка на странице меняется. */
  signal?: AbortSignal;
}

/**
 * Экран настроек: переназначение кнопок клавиатуры и геймпада, порог стика, выбор устройства, сброс к стандартному
 * профилю и (в игре) цвет игрушки по умолчанию. Звук, сегменты, вид экрана и фон — кнопки на самой странице. Пока диалог открыт, игра на паузе,
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
    const { signal } = options;
    dialog.addEventListener(
      'close',
      () => {
        this.endCapture();
        this.options.onClose();
      },
      { signal },
    );
    // Esc: закрыть сразу и вернуть фокус игре в том же событии, а не после `close` (браузер сперва возвращает его на кнопку-опенер).
    dialog.addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        this.close();
      },
      { signal },
    );
    window.addEventListener('keydown', this.onCaptureKey, { capture: true, signal });
    // Открытый диалог переписывается на лету, когда меняется язык (во время назначения клавиши — не трогаем).
    onLangChange(() => this.refresh(), signal);
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

    const title = h('h2', { id: 'settings-title' }, t('set.title'));
    this.dialog.setAttribute('aria-labelledby', 'settings-title');

    const keyboard = h(
      'section',
      { class: 'settings__section' },
      h('h3', {}, t('set.kb.h')),
      h('p', { class: 'settings__note' }, t('set.kb.note')),
      this.bindingsTable(settings.keyboard, 'keyboard'),
      h('div', { class: 'settings__row' }, this.button(t('set.kb.reset'), () => {
        this.hub.updateSettings((s) => {
          s.keyboard = cloneBindings(DEFAULT_KEYBOARD_BINDINGS);
        });
        this.render();
      })),
    );

    const gamepad = h('section', { class: 'settings__section' }, h('h3', {}, t('set.pad.h')), this.gamepadControls(pad));
    if (pad && padBindings) {
      gamepad.append(
        this.bindingsTable(padBindings, 'gamepad'),
        h('div', { class: 'settings__row' }, this.button(t('set.pad.reset'), () => {
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
        ? t('set.stored')
        : t('set.notStored'),
    );

    const actions = h(
      'div',
      { class: 'settings__row settings__row--end' },
      this.button(t('set.resetAll'), () => {
        this.hub.resetSettings();
        this.options.display?.onChange();
        this.render();
      }),
      this.button(t('common.close'), () => this.close(), 'btn--primary'),
    );

    const defaults = this.options.display ? this.defaultsSection(this.options.display) : null;
    this.dialog.replaceChildren(...(defaults ? [title, defaults] : [title]), keyboard, gamepad, storage, actions);
    this.restoreFocus();
  }

  private defaultsSection(display: DisplayOptions): HTMLElement {
    const picker = new ShellPicker({
      id: 'settings-shell',
      label: t('set.def.h'),
      value: this.hub.settings.display.shell,
      onPick: (shell) => {
        this.hub.updateSettings((s) => void (s.display.shell = shell));
        display.onChange();
      },
    });
    return h(
      'section',
      { class: 'settings__section' },
      h('h3', {}, t('set.def.h')),
      h('p', { class: 'settings__note' }, t('set.def.note')),
      picker.root,
    );
  }

  private gamepadControls(pad: PadInfo | null): Node {
    const { settings } = this.hub;
    const wrapper = h('div', { class: 'settings__pad' });

    const select = h('select', { id: 'settings-pad' });
    select.append(h('option', { value: '' }, t('set.pad.auto')));
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
      h('label', { for: 'settings-pad' }, t('set.pad.device')),
      select,
      h('label', { for: 'settings-threshold' }, t('set.pad.threshold')),
      h('span', { class: 'settings__range' }, threshold, output),
    );

    if (!pad) {
      wrapper.append(h('p', { class: 'settings__warn' }, t('set.pad.none')));
    } else if (needsGamepadSetup(settings, pad)) {
      wrapper.append(
        h(
          'p',
          { class: 'settings__warn' },
          t('set.pad.nonstandard', { id: pad.id, mapping: pad.mapping || t('set.pad.mappingNone') }),
        ),
      );
    } else {
      wrapper.append(h('p', { class: 'settings__note' }, t('set.pad.configuring', { id: pad.id, mapping: pad.mapping || t('set.pad.noMapping') })));
    }
    return wrapper;
  }

  private bindingsTable(bindings: Bindings, device: 'keyboard' | 'gamepad'): HTMLTableElement {
    const table = h('table', { class: 'settings__table' });
    table.append(h('caption', { class: 'visually-hidden' }, device === 'keyboard' ? t('set.table.kb') : t('set.table.pad')));
    const body = h('tbody');
    for (const action of this.options.actions ?? ACTIONS) {
      const capturing = this.capture?.device === device && this.capture.action === action;
      const key = `${device === 'keyboard' ? 'kb' : 'pad'}:${action}`;
      const assign = this.button(
        capturing ? (device === 'keyboard' ? t('set.press.key') : t('set.press.pad')) : t('set.assign'),
        () => (capturing ? (this.endCapture(), this.render()) : device === 'keyboard' ? this.beginKeyboardCapture(action) : this.beginGamepadCapture(action)),
      );
      assign.dataset['key'] = key;
      const clear = this.button(t('set.clear'), () => {
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
          h('th', { scope: 'row' }, t(ACTION_KEYS[action])),
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
