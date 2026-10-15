import type { Theme } from '../input/settings';
import { icon, type IconName } from './icons';
import { onLangChange, t } from './i18n';
import type { DeviceView } from './viewModel';

export interface CornerNavElements {
  /** Контейнер значков «клавиатура / геймпад». */
  devices: HTMLElement;
  /** Кнопка смены фона. */
  theme: HTMLButtonElement;
}

export interface CornerNavActions {
  toggleTheme(): void;
  toggleGhost(): void;
  /** Клик мышью или касанием: вернуть клавиатуру игре. */
  onPointerUse(): void;
}

/**
 * Общие системные настройки справа и индикаторы ввода и паузы слева. Сегменты и фон стоят рядом
 * с языком, настройками и справкой — разметка лежит в index.html, значки и подписи ставятся здесь и обновляются при смене языка.
 */
export class CornerNav {
  private readonly elements: CornerNavElements;
  private readonly devices = new Map<'keyboard' | 'gamepad' | 'pause', HTMLElement>();
  private paused = false;
  private lastDevice = '';
  private lastDeviceView: DeviceView | null = null;
  private readonly ghost = document.getElementById('tgl-ghost');
  private ghostOn: boolean | null = null;
  private theme: Theme = 'dark';

  constructor(elements: CornerNavElements, actions: CornerNavActions) {
    this.elements = elements;
    for (const id of ['keyboard', 'gamepad', 'pause'] as const) {
      const element = elements.devices.querySelector<HTMLElement>(`[data-device="${id}"]`);
      if (!element) continue;
      element.replaceChildren(icon(id satisfies IconName));
      this.devices.set(id, element);
    }
    elements.theme.addEventListener('click', (event) => {
      actions.toggleTheme();
      if (event.detail !== 0) actions.onPointerUse();
    });
    this.ghost?.replaceChildren(icon('segments'));
    this.ghost?.addEventListener('click', (event) => {
      actions.toggleGhost();
      if (event.detail !== 0) actions.onPointerUse();
    });
    this.relabel();
    onLangChange(() => this.relabel());
  }

  private relabel(): void {
    this.elements.devices.setAttribute('aria-label', t('dev.aria'));
    const keyboard = this.devices.get('keyboard');
    if (keyboard) keyboard.title = t('dev.keyboard');
    this.setTheme(this.theme);
    this.setPaused(this.paused, true);
    this.setGhost(this.ghostOn);
    if (this.lastDeviceView) {
      this.lastDevice = '';
      this.setDevices(this.lastDeviceView);
    } else {
      const gamepad = this.devices.get('gamepad');
      if (gamepad) gamepad.title = t('dev.gamepad');
    }
  }

  /** Кнопка фона показывает то, на что переключит: на тёмном — солнце («светлый фон»), на светлом — луна. */
  setTheme(theme: Theme): void {
    this.theme = theme;
    const { theme: button } = this.elements;
    const name: IconName = theme === 'light' ? 'moon' : 'sun';
    const label = t(theme === 'light' ? 'tgl.themeLight' : 'tgl.themeDark');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset['theme'] = theme;
    if (button.dataset['icon'] !== name) {
      button.dataset['icon'] = name;
      button.replaceChildren(icon(name));
    }
  }

  /** Индикатор паузы рядом с клавиатурой: горит, пока игра на паузе (клавишей, кнопкой, при потере фокуса или под закрытой крышкой). */
  setPaused(paused: boolean, force = false): void {
    if (!force && this.paused === paused) return;
    this.paused = paused;
    const element = this.devices.get('pause');
    if (!element) return;
    const label = t(paused ? 'dev.paused' : 'dev.running');
    element.dataset['state'] = paused ? 'on' : 'off';
    element.title = label;
    element.setAttribute('aria-label', label);
  }

  setGhost(on: boolean | null): void {
    this.ghostOn = on;
    if (!this.ghost) return;
    this.ghost.hidden = on === null;
    this.ghost.setAttribute('aria-pressed', String(on === true));
    this.ghost.setAttribute('aria-label', t('tgl.ghost'));
    this.ghost.title = t(on ? 'tgl.ghostOn' : 'tgl.ghostOff');
  }

  /** Значки «клавиатура / геймпад»: геймпад появляется при подключении; подсвечено то, чем играют сейчас. */
  setDevices(view: DeviceView): void {
    this.lastDeviceView = view;
    const signature = `${view.keyboard}|${view.gamepad}|${view.padName ?? ''}`;
    if (signature === this.lastDevice) return;
    this.lastDevice = signature;
    const keyboard = this.devices.get('keyboard');
    const gamepad = this.devices.get('gamepad');
    if (keyboard) keyboard.dataset['state'] = view.keyboard;
    if (gamepad) {
      gamepad.hidden = view.gamepad === 'hidden';
      gamepad.dataset['state'] = view.gamepad === 'hidden' ? 'ready' : view.gamepad;
      gamepad.title = view.padName ? t('dev.padNamed', { name: view.padName }) + (view.gamepad === 'ready' ? t('dev.padWait') : '') : t('dev.gamepad');
    }
    this.elements.devices.dataset['input'] = view.gamepad === 'on' ? 'gamepad' : 'keyboard';
  }
}
