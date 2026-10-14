import type { UserLevel } from '../editor/library';
import type { Shell, Theme } from '../input/settings';
import { h } from './dom';
import { icon, type IconName } from './icons';
import { sameLevel, type LevelRef, type OriginalSlot } from './levels';
import { ShellPicker } from './shellPicker';
import type { DeviceView } from './viewModel';

export interface ControlPanelActions {
  pickShell(shell: Shell): void;
  toggleSound(): void;
  /** Громкость 0…1 от ползунка. `commit = false` — ползунок ещё тянут (звук меняется, сохранять рано); `true` — отпустили. */
  setVolume(volume: number, commit: boolean): void;
  toggleGhost(): void;
  toggleCompact(): void;
  toggleTheme(): void;
  pickOriginal(number: number): void;
  pickUser(projectId: string): void;
}

/** Всё, что панель показывает о странице. `ghost: null` — у экрана нет слоя неактивных сегментов. */
export interface ControlPanelView {
  shell: Shell;
  sound: boolean;
  /** Громкость 0…1. */
  volume: number;
  ghost: boolean | null;
  compact: boolean;
  theme: Theme;
  level: LevelRef | null;
}

export interface ControlPanelOptions {
  slots: readonly OriginalSlot[];
  actions: ControlPanelActions;
  /** Клик мышью или касанием: вернуть клавиатуру игре. С клавиатуры фокус остаётся на кнопке панели. */
  onPointerUse(): void;
}

interface Toggle {
  button: HTMLButtonElement;
  icon: HTMLElement;
  label: HTMLElement;
}

/**
 * Правая панель страницы: быстрые кнопки (звук, сегменты, «только экран», фон), цвет корпуса текущей игры
 * и выбор уровней — оригинальные 1–9 и карты из редактора. DOM строится один раз, дальше меняются только
 * атрибуты, поэтому фокус и прокрутка при переключениях не сбиваются.
 */
export class ControlPanel {
  private readonly root: HTMLElement;
  private readonly options: ControlPanelOptions;
  private readonly picker: ShellPicker;
  private readonly toggles = new Map<'sound' | 'ghost' | 'compact' | 'theme', Toggle>();
  private readonly tiles = new Map<number, HTMLButtonElement>();
  private readonly userList = h('ul', { class: 'uv', id: 'user-levels', 'aria-label': 'Карты из редактора' });
  private readonly devices = new Map<'keyboard' | 'gamepad', HTMLElement>();
  private readonly volume = h('input', {
    type: 'range',
    class: 'vol__range',
    id: 'volume',
    min: '0',
    max: '100',
    step: '5',
    value: '50',
    'aria-label': 'Громкость',
  });
  private readonly volumeRow = h('div', { class: 'vol', id: 'volume-row', 'data-muted': 'false' });
  private readonly volumeValue = h('output', { class: 'vol__value', for: 'volume' }, '50%');
  private readonly volumeIcon = h('span', { class: 'vol__icon' }, icon('sound'));
  private users: readonly UserLevel[] = [];
  private level: LevelRef | null = null;
  private lastDevice = '';

  constructor(root: HTMLElement, options: ControlPanelOptions) {
    this.root = root;
    this.options = options;
    const { actions } = options;

    // ── Шапка: название и устройство ввода ───────────────────────────────
    const keyboard = this.device('keyboard', 'keyboard', 'Клавиатура');
    const gamepad = this.device('gamepad', 'gamepad', 'Геймпад');
    gamepad.hidden = true;
    const top = h(
      'header',
      { class: 'side__top' },
      h('h2', { class: 'side__title', id: 'ctl-title' }, 'Пульт'),
      h('div', { class: 'devs', id: 'devices', role: 'status', 'aria-label': 'Устройство управления' }, keyboard, gamepad),
    );

    // ── Быстрые кнопки ───────────────────────────────────────────────────
    const quick = h('div', { class: 'quick', role: 'group', 'aria-label': 'Звук, экран и фон' });
    quick.append(
      this.toggle('sound', 'sound', 'Звук', actions.toggleSound),
      this.toggle('ghost', 'segments', 'Сегменты', actions.toggleGhost),
      this.toggle('compact', 'screen', 'Экран', actions.toggleCompact),
      this.toggle('theme', 'sun', 'Фон', actions.toggleTheme),
    );

    // ── Громкость ────────────────────────────────────────────────────────
    this.volume.addEventListener('input', () => {
      this.showVolume(Number(this.volume.value) / 100);
      actions.setVolume(Number(this.volume.value) / 100, false);
    });
    this.volume.addEventListener('change', () => actions.setVolume(Number(this.volume.value) / 100, true));
    // Мышь и касание возвращают клавиатуру игре; со стрелок фокус остаётся на ползунке.
    this.volume.addEventListener('pointerup', () => options.onPointerUse());
    this.volumeRow.append(this.volumeIcon, this.volume, this.volumeValue);

    // ── Цвет текущей игры ────────────────────────────────────────────────
    this.picker = new ShellPicker({
      id: 'shell-picker',
      label: 'Цвет игрушки',
      value: 'blue',
      onPick: (shell, byPointer) => {
        actions.pickShell(shell);
        if (byPointer) options.onPointerUse();
      },
    });

    // ── Уровни ───────────────────────────────────────────────────────────
    const grid = h('div', { class: 'lvgrid', id: 'original-levels', role: 'group', 'aria-label': 'Оригинальные уровни' });
    for (const slot of options.slots) {
      const open = slot.levelId !== null;
      const tile = h(
        'button',
        { type: 'button', class: 'lv', 'data-level': String(slot.number), title: slot.title, ...(open ? {} : { 'aria-disabled': 'true' }) },
        h('span', { class: 'lv__num' }, String(slot.number)),
        ...(open ? [] : [icon('lock')]),
      );
      tile.addEventListener('click', (event) => {
        if (open) actions.pickOriginal(slot.number);
        if (event.detail !== 0) options.onPointerUse(); // и закрытый уровень не уводит клавиатуру от игры
      });
      this.tiles.set(slot.number, tile);
      grid.append(tile);
    }
    const editor = h('a', { class: 'side__link', id: 'open-editor', href: '#/editor', title: 'Редактор уровней' }, icon('edit'), 'Редактор');
    const levels = h(
      'section',
      { class: 'side__sec', 'aria-labelledby': 'lv-title' },
      h('h3', { class: 'side__h', id: 'lv-title' }, 'Уровни'),
      h('p', { class: 'side__cap' }, 'Оригинальные'),
      grid,
      h('p', { class: 'side__cap side__cap--row' }, h('span', {}, 'Пользовательские'), editor),
      this.userList,
    );

    const colour = h(
      'section',
      { class: 'side__sec', 'aria-labelledby': 'clr-title' },
      h('h3', { class: 'side__h', id: 'clr-title' }, 'Цвет игрушки'),
      this.picker.root,
    );

    this.root.replaceChildren(top, quick, this.volumeRow, colour, levels);
    this.setUserLevels([], null);
  }

  private device(id: 'keyboard' | 'gamepad', name: IconName, label: string): HTMLElement {
    const element = h('span', { class: 'dev', 'data-device': id, 'data-state': 'ready', title: label }, icon(name), h('span', { class: 'dev__label' }, label));
    this.devices.set(id, element);
    return element;
  }

  private toggle(id: 'sound' | 'ghost' | 'compact' | 'theme', name: IconName, label: string, action: () => void): HTMLButtonElement {
    const iconHolder = h('span', { class: 'tgl__icon' }, icon(name));
    const caption = h('span', { class: 'tgl__label' }, label);
    const button = h('button', { type: 'button', class: 'tgl', id: `tgl-${id}`, 'data-tgl': id, 'aria-pressed': 'false' }, iconHolder, caption);
    button.addEventListener('click', (event) => {
      action();
      if (event.detail !== 0) this.options.onPointerUse();
    });
    this.toggles.set(id, { button, icon: iconHolder, label: caption });
    return button;
  }

  private setToggle(id: 'sound' | 'ghost' | 'compact' | 'theme', pressed: boolean, name: IconName, title: string): void {
    const toggle = this.toggles.get(id);
    if (!toggle) return;
    toggle.button.setAttribute('aria-pressed', String(pressed));
    toggle.button.title = title;
    if (toggle.icon.dataset['icon'] !== name) {
      toggle.icon.dataset['icon'] = name;
      toggle.icon.replaceChildren(icon(name));
    }
  }

  /** Подпись и заливка ползунка (без побочных действий). */
  private showVolume(volume: number): void {
    const percent = Math.round(volume * 100);
    this.volumeValue.textContent = `${percent}%`;
    this.volume.style.setProperty('--pct', `${percent}%`);
    this.volume.setAttribute('aria-valuetext', `${percent}%`);
  }

  /** Состояние страницы изменилось: обновить кнопки, цвет и подсветку выбранного уровня. */
  update(view: ControlPanelView): void {
    this.root.dataset['shell'] = view.shell;
    this.picker.set(view.shell);
    this.setToggle('sound', view.sound, view.sound ? 'sound' : 'soundOff', view.sound ? 'Звук включён — выключить' : 'Звук выключен — включить');
    // Пока ползунок тянут, значение не трогаем: его двигает сам пользователь.
    if (document.activeElement !== this.volume || this.volume.value !== String(Math.round(view.volume * 100))) {
      this.volume.value = String(Math.round(view.volume * 100));
    }
    this.showVolume(view.volume);
    this.volumeRow.dataset['muted'] = String(!view.sound);
    const volumeIcon = view.sound ? 'sound' : 'soundOff';
    if (this.volumeIcon.dataset['icon'] !== volumeIcon) {
      this.volumeIcon.dataset['icon'] = volumeIcon;
      this.volumeIcon.replaceChildren(icon(volumeIcon));
    }
    const ghost = this.toggles.get('ghost');
    if (ghost) {
      ghost.button.hidden = view.ghost === null;
      this.setToggle('ghost', view.ghost === true, 'segments', view.ghost ? 'Неактивные сегменты видны — скрыть' : 'Показать неактивные сегменты экрана');
    }
    this.setToggle('compact', view.compact, 'screen', view.compact ? 'Показать всю игрушку' : 'Только экран');
    this.setToggle('theme', view.theme === 'light', view.theme === 'light' ? 'moon' : 'sun', view.theme === 'light' ? 'Тёмный фон' : 'Светлый фон');
    this.level = view.level;
    this.markLevel();
  }

  private markLevel(): void {
    const current = this.level;
    for (const [number, tile] of this.tiles) {
      const on = current !== null && sameLevel(current, { kind: 'original', number });
      if (on) tile.setAttribute('aria-current', 'true');
      else tile.removeAttribute('aria-current');
    }
    for (const button of this.userList.querySelectorAll<HTMLButtonElement>('.uv__go')) {
      const on = current !== null && sameLevel(current, { kind: 'user', projectId: button.dataset['project'] ?? '' });
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  }

  /** Значки «клавиатура / геймпад»: геймпад появляется при подключении; подсвечено то, чем играют сейчас. */
  setDevices(view: DeviceView): void {
    const signature = `${view.keyboard}|${view.gamepad}|${view.padName ?? ''}`;
    if (signature === this.lastDevice) return;
    this.lastDevice = signature;
    const keyboard = this.devices.get('keyboard');
    const gamepad = this.devices.get('gamepad');
    if (keyboard) keyboard.dataset['state'] = view.keyboard;
    if (gamepad) {
      gamepad.hidden = view.gamepad === 'hidden';
      gamepad.dataset['state'] = view.gamepad === 'hidden' ? 'ready' : view.gamepad;
      gamepad.title = view.padName ? `Геймпад: ${view.padName}${view.gamepad === 'ready' ? ' — нажмите любую кнопку, чтобы играть с него' : ''}` : 'Геймпад';
    }
    this.root.dataset['input'] = view.gamepad === 'on' ? 'gamepad' : 'keyboard';
  }

  /** Карты из редактора. `note` — почему список недоступен (например, нет хранилища браузера). */
  setUserLevels(levels: readonly UserLevel[], note: string | null): void {
    this.users = levels;
    const rows: HTMLElement[] = [];
    for (const user of levels) {
      const playable = user.problem === null;
      const go = h(
        'button',
        {
          type: 'button',
          class: playable ? 'uv__go' : 'uv__go uv__go--bad',
          'data-project': user.projectId,
          title: playable ? `Играть: ${user.name} (${user.width} × ${user.height})` : `Не запускается: ${user.problem ?? ''}`,
          ...(playable ? {} : { 'aria-disabled': 'true' }),
        },
        h('span', { class: 'uv__ico' }, icon(playable ? 'play' : 'warn')),
        h('span', { class: 'uv__text' }, h('span', { class: 'uv__name' }, user.name), ...(playable ? [] : [h('span', { class: 'uv__why' }, user.problem ?? '')])),
        h('span', { class: 'uv__size' }, `${user.width}×${user.height}`),
      );
      go.addEventListener('click', (event) => {
        if (playable) this.options.actions.pickUser(user.projectId);
        if (event.detail !== 0) this.options.onPointerUse();
      });
      const edit = h('a', { class: 'uv__edit', href: `#/editor?project=${encodeURIComponent(user.projectId)}`, title: 'Открыть в редакторе', 'aria-label': `Редактировать «${user.name}»` }, icon('edit'));
      rows.push(h('li', { class: 'uv__item', 'data-project': user.projectId }, go, edit));
    }
    if (rows.length === 0) {
      rows.push(
        h(
          'li',
          { class: 'uv__empty' },
          note ?? 'Здесь появятся ваши карты. Нарисуйте уровень в редакторе — он сохранится сам и сразу окажется в этом списке.',
        ),
      );
    }
    this.userList.replaceChildren(...rows);
    this.markLevel();
  }

  /** Найденные сейчас карты (для проверок и повторной подсветки). */
  get userLevels(): readonly UserLevel[] {
    return this.users;
  }
}
