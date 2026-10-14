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
  /** Клик мышью или касанием: вернуть клавиатуру игре. */
  onPointerUse(): void;
}

/**
 * Системное меню в углу страницы: индикатор устройства управления (клавиатура и геймпад) и кнопка смены фона. Они стоят рядом
 * с языком, настройками и справкой — разметка лежит в index.html, значки и подписи ставятся здесь и обновляются при смене языка.
 */
export class CornerNav {
  private readonly elements: CornerNavElements;
  private readonly devices = new Map<'keyboard' | 'gamepad', HTMLElement>();
  private lastDevice = '';
  private lastDeviceView: DeviceView | null = null;
  private theme: Theme = 'dark';

  constructor(elements: CornerNavElements, actions: CornerNavActions) {
    this.elements = elements;
    for (const id of ['keyboard', 'gamepad'] as const) {
      const element = elements.devices.querySelector<HTMLElement>(`[data-device="${id}"]`);
      if (!element) continue;
      element.replaceChildren(icon(id satisfies IconName));
      this.devices.set(id, element);
    }
    elements.theme.addEventListener('click', (event) => {
      actions.toggleTheme();
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
