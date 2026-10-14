import type { Action } from '../core/actions';
import { describeSource, type Bindings } from '../input/bindings';
import { h } from './dom';
import type { InputHub } from './hub';

export interface HelpRow {
  /** Кнопка на корпусе. */
  button: string;
  /** Что она делает. */
  what: string;
  /** Клавиши клавиатуры. */
  keys: string;
}

/** Горячие клавиши питания и звука (в настройках управления не переназначаются). */
export const POWER_KEY = 'O';
export const SOUND_KEY = 'M';

function keysOf(bindings: Bindings, ...actions: Action[]): string {
  const sources = [...new Set(actions.flatMap((action) => bindings[action]))];
  return sources.length === 0 ? '—' : sources.map(describeSource).join(' · ');
}

/** Таблица «кнопка → что делает → клавиши» по текущим привязкам клавиатуры. */
export function helpRows(bindings: Bindings): HelpRow[] {
  return [
    { button: 'ON/OFF', what: 'включить или выключить игрушку', keys: POWER_KEY },
    { button: 'S./P.', what: 'старт, пауза и продолжение', keys: keysOf(bindings, 'start', 'pause') },
    { button: 'SOUND', what: 'звук вкл./выкл.', keys: SOUND_KEY },
    { button: 'FIRE', what: 'огонь (в этих комнатах не используется)', keys: keysOf(bindings, 'fire') },
    { button: '◀ LEFT', what: 'шаг влево', keys: keysOf(bindings, 'left') },
    { button: 'RIGHT ▶', what: 'шаг вправо', keys: keysOf(bindings, 'right') },
    { button: 'UP', what: 'вверх (в этих комнатах не используется)', keys: keysOf(bindings, 'up') },
    { button: 'DOWN', what: 'вниз (в этих комнатах не используется)', keys: keysOf(bindings, 'down') },
    { button: 'JUMP', what: 'прыжок', keys: keysOf(bindings, 'jump') },
  ];
}

export interface HelpDialogOptions {
  onOpen(): void;
  onClose(): void;
}

/** Справка: что делают кнопки игрушки и как ими управлять. Пока она открыта, игра на паузе. */
export class HelpDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly hub: InputHub;
  private readonly options: HelpDialogOptions;

  constructor(dialog: HTMLDialogElement, hub: InputHub, options: HelpDialogOptions) {
    this.dialog = dialog;
    this.hub = hub;
    this.options = options;
    dialog.addEventListener('close', () => this.options.onClose());
    // Esc: закрыть сразу и вернуть фокус игре в том же событии, а не после `close` (браузер сперва возвращает его на кнопку-опенер).
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
  }

  get isOpen(): boolean {
    return this.dialog.open;
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
    this.options.onClose(); // не ждать события `close`: фокус сразу возвращается игре
  }

  private render(): void {
    this.dialog.setAttribute('aria-labelledby', 'help-title');
    const table = h('table', { class: 'settings__table help__table' });
    table.append(h('caption', { class: 'visually-hidden' }, 'Кнопки игрушки'));
    const body = h('tbody');
    for (const row of helpRows(this.hub.settings.keyboard)) {
      body.append(h('tr', {}, h('th', { scope: 'row' }, row.button), h('td', {}, row.what), h('td', { class: 'help__keys' }, row.keys)));
    }
    table.append(body);

    const close = h('button', { type: 'button', class: 'btn btn--primary' }, 'Закрыть');
    close.addEventListener('click', () => this.close());

    this.dialog.replaceChildren(
      h('h2', { id: 'help-title' }, 'Справка'),
      h(
        'section',
        { class: 'settings__section' },
        h('h3', {}, 'Как играть'),
        h('p', { class: 'help__text' }, 'Включите игрушку кнопкой ON/OFF и начните игру кнопкой S./P. Герой ходит влево и вправо и прыгает; кнопка S./P. ставит игру на паузу и снимает с паузы.'),
      ),
      h('section', { class: 'settings__section' }, h('h3', {}, 'Кнопки и клавиши'), table),
      h(
        'section',
        { class: 'settings__section' },
        h('h3', {}, 'Мышь, касание, геймпад'),
        h('p', { class: 'help__text' }, 'Кнопки на корпусе нажимаются мышью или пальцем — стрелки и JUMP можно удерживать. Подключённый геймпад работает сразу: крестовина — направления, нижняя кнопка — прыжок, левая — огонь, Start — старт и пауза. Клавиши и кнопки геймпада можно переназначить в настройках.'),
      ),
      h(
        'section',
        { class: 'settings__section' },
        h('h3', {}, 'Об игре'),
        h('p', { class: 'help__text' }, 'Неофициальная браузерная реконструкция электронной игры Apollo Crocodile Mario по фотографиям и видео устройства. Графика, звуки и правила приближены к оригиналу, но ещё уточняются.'),
      ),
      h('div', { class: 'settings__row settings__row--end' }, close),
    );
  }
}
