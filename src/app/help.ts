import { guideForBody } from './bodyButtons';
import { BRICK_GAMES } from '../brick/games';
import { BRICK_GUIDES } from '../brick/guides';
import { GAME_GUIDE, SOURCE_KEYS } from './gameGuide';
import { guideBlocks } from './guidePanel';
import type { Action } from '../core/actions';
import { describeSource, type Bindings } from '../input/bindings';
import { h } from './dom';
import { getLang, onLangChange, rich, t, type MsgKey } from './i18n';
import type { InputHub } from './hub';
import { GAMES, type GameStatus } from '../games/catalog';
import { engineOf, gameKey, keyLabel, TOYS, type ToyModel } from './toys';
import type { ToyKeyId } from './toy';

export interface HelpRow {
  /** Кнопка на корпусе. */
  button: string;
  /** Что она делает (на текущем языке). */
  what: string;
  /** Клавиши клавиатуры. */
  keys: string;
}

/** Горячие клавиши питания и звука (в настройках управления не переназначаются). */
export const POWER_KEY = 'O';
export const SOUND_KEY = 'M';

/** Названия клавиш, на которых висят эти действия по текущим привязкам (без повторов). */
export function keyCaps(bindings: Bindings, ...actions: Action[]): string[] {
  const lang = getLang();
  return [...new Set(actions.flatMap((action) => bindings[action]))].map((source) => describeSource(source, lang));
}

function keysOf(bindings: Bindings, ...actions: Action[]): string {
  const caps = keyCaps(bindings, ...actions);
  return caps.length === 0 ? '—' : caps.join(' · ');
}

/** Таблица «кнопка → что делает → клавиши» по текущим привязкам клавиатуры. По упаковке: UP и JUMP — прыжок, у DOWN в режиме MARIO действия нет. */
export function helpRows(bindings: Bindings): HelpRow[] {
  const row = (button: string, what: MsgKey, keys: string): HelpRow => ({ button, what: t(what), keys });
  return [
    row('ON/OFF', 'help.row.onoff', POWER_KEY),
    row('S./P.', 'help.row.sp', keysOf(bindings, 'start', 'pause')),
    row('SOUND', 'help.row.sound', SOUND_KEY),
    row('FIRE', 'help.row.fire', keysOf(bindings, 'fire')),
    row('◀ LEFT', 'help.row.left', keysOf(bindings, 'left')),
    row('RIGHT ▶', 'help.row.right', keysOf(bindings, 'right')),
    row('UP', 'help.row.up', keysOf(bindings, 'up')),
    row('DOWN', 'help.row.down', keysOf(bindings, 'down')),
    row('JUMP', 'help.row.jump', keysOf(bindings, 'jump')),
  ];
}

const STATUS_KEYS: Record<GameStatus, 'game.status.ready' | 'game.status.placeholder' | 'game.status.planned'> = {
  ready: 'game.status.ready',
  placeholder: 'game.status.placeholder',
  planned: 'game.status.planned',
};

/** Строки списка игр консоли: у консолей с меню — со знаком игры на экране (цифра или буква). */
export function gameRows(model: ToyModel): HTMLElement[] {
  const lang = getLang();
  return model.games.map((game, index) => {
    const symbol = model.menu ? gameKey(model, index) : null;
    return h(
      'li',
      { class: 'games__row', 'data-game': game.id, 'data-status': game.status, ...(symbol ? { 'data-symbol': symbol } : {}) },
      h('b', { class: 'games__name' }, `${symbol ? `${symbol}. ` : ''}${game.variants ? `${game.label} (${game.variants})` : game.label}`),
      h('span', { class: 'games__note' }, `${GAMES[game.id].names[lang]} — ${t(STATUS_KEYS[game.status])}`),
    );
  });
}

/** Build the full library only when opened; large LCD diagrams stay out of initial layout. */
function libraryHelp(model: ToyModel): HTMLElement {
  const ru = getLang() === 'ru';
  const details = h(
    'details',
    { class: 'help__game' },
    h('summary', {}, ru ? 'Полный каталог движка и статус реконструкций' : 'Full engine catalog and reconstruction status'),
  );
  let mounted = false;
  details.addEventListener('toggle', () => {
    if (!details.open || mounted) return;
    mounted = true;
    const select = h('select', { 'aria-label': ru ? 'Игра из полного каталога' : 'Game from full catalog' });
    for (const id of Object.keys(BRICK_GAMES)) {
      const game = Object.values(GAMES).find((g) => g.id === id);
      if (game) select.append(h('option', { value: id }, game.names[getLang()]));
    }
    const body = h('div', {});
    const render = (): void => {
      const guide = BRICK_GUIDES[select.value];
      body.replaceChildren(...(guide ? guideBlocks(guideForBody(guide, model, BRICK_GAMES[select.value]), BRICK_GAMES[select.value], undefined, getLang()) : []));
    };
    select.addEventListener('change', render);
    render();
    details.append(
      select,
      body,
      h(
        'p',
        { class: 'gtext' },
        ru
          ? 'Не реализованы: Four Dice, Magic Slab, Flipull, Capture Prey, Fighting и два 3D-режима. Для них недостаточно подтверждённых правил.'
          : 'Not implemented: Four Dice, Magic Slab, Flipull, Capture Prey, Fighting and both 3D modes. Their confirmed rules are insufficient.',
      ),
      h(
        'a',
        { href: 'https://github.com/grayhex/CrocodileMario/blob/main/docs/brick/library.md', target: '_blank', rel: 'noopener noreferrer' },
        ru ? 'Таблица покрытия статьи и ограничения' : 'Article coverage and limitations',
      ),
    );
  });
  return details;
}

/** Раздел «Игры на устройстве»: набор игр консоли по наклейке, упаковке или меню и состояние каждой. */
export function gamesSection(model: ToyModel): HTMLElement {
  const rows = gameRows(model);
  return h(
    'section',
    { class: 'settings__section help__games', id: 'device-games' },
    h('h3', {}, t('help.games.h')),
    h('p', { class: 'help__text' }, t('help.games.p')),
    h('ul', { class: 'games' }, ...rows),
    ...(model.id === 'clock99' || model.id === 'seabattle'
      ? [h('p', { class: 'help__text' }, t(model.id === 'clock99' ? 'games.note.clock99' : 'games.note.seabattle'))]
      : []),
    ...model.games.map((game) => {
      const guide = BRICK_GUIDES[game.id];
      const detail = GAME_GUIDE[game.id];
      return h(
        'details',
        { class: 'help__game', 'data-game': game.id },
        h('summary', {}, GAMES[game.id].names[getLang()]),
        h('p', { class: 'gtext' }, t(STATUS_KEYS[game.status])),
        ...(model.menu && guide
          ? guideBlocks(guideForBody(guide, model, BRICK_GAMES[game.id]), BRICK_GAMES[game.id], game.modes, getLang())
          : detail
            ? [h('p', { class: 'gtext' }, t(detail.what)), h('p', { class: 'gtext' }, t(detail.open))]
            : []),
        h(
          'p',
          { class: 'gtext' },
          `${t('games.src.h')}: ${detail ? detail.sources.map((source) => t(SOURCE_KEYS[source])).join('; ') : 'Retro Consoles Wiki · Games · 2026-01-12'}`,
        ),
      );
    }),
    libraryHelp(model),
    ...(model.menu ? [h('p', { class: 'help__text' }, t('help.brick.audio'))] : []),
    ...(model.gamesCount ? [h('p', { class: 'help__text' }, t('help.games.count', { n: model.gamesCount }))] : []),
  );
}

/** Таблица кнопок игрушки с тетрисом («Часы+99», «Морской бой»): подписи напечатаны на корпусе, RESET возвращает в меню. */
export function toyHelpRows(model: ToyModel, bindings: Bindings): HelpRow[] {
  const order: ToyKeyId[] = ['onoff', 'sp', 'sound', 'fire', 'left', 'right', 'up', 'down', 'jump'];
  const keys: Record<ToyKeyId, string> = {
    onoff: POWER_KEY,
    sp: keysOf(bindings, 'start', 'pause'),
    sound: SOUND_KEY,
    fire: model.universal ? keysOf(bindings, 'fire') : '—',
    left: keysOf(bindings, 'left'),
    right: keysOf(bindings, 'right'),
    up: keysOf(bindings, 'up'),
    down: keysOf(bindings, 'down'),
    jump: keysOf(bindings, 'jump'),
  };
  const rows = order.flatMap((id): HelpRow[] => {
    const what = model.keyWhat[id];
    return what ? [{ button: keyLabel(model, id), what: t(what), keys: keys[id] }] : [];
  });
  if (model.universal) rows.push({ button: 'RESET', what: t('help.row.menu'), keys: '—' });
  return rows;
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
  /** Игрушка, о которой справка (по умолчанию Crocodile Mario). */
  private readonly model: ToyModel;
  /** Игрушка с тетрисом: у справки свои кнопки и текст, раздела об оригинальном устройстве Crocodile Mario нет. */
  private readonly toy: ToyModel | null;

  /** `signal` — когда игрушка на странице меняется на другую, прежние обработчики снимаются (диалог остаётся тем же элементом страницы). */
  constructor(dialog: HTMLDialogElement, hub: InputHub, options: HelpDialogOptions, model: ToyModel = TOYS.mario, signal?: AbortSignal) {
    this.dialog = dialog;
    this.hub = hub;
    this.options = options;
    this.model = model;
    this.toy = engineOf(model) === 'tetris' ? model : null;
    dialog.addEventListener('close', () => this.options.onClose(), { signal });
    // Esc: закрыть сразу и вернуть фокус игре в том же событии, а не после `close` (браузер сперва возвращает его на кнопку-опенер).
    dialog.addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        this.close();
      },
      { signal },
    );
    // Открытая справка переписывается на лету, когда меняется язык.
    onLangChange(() => {
      if (this.dialog.open) this.render();
    }, signal);
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
    table.append(h('caption', { class: 'visually-hidden' }, t('help.table')));
    const body = h('tbody');
    const rows = this.toy ? toyHelpRows(this.toy, this.hub.settings.keyboard) : helpRows(this.hub.settings.keyboard);
    for (const row of rows) {
      body.append(h('tr', {}, h('th', { scope: 'row' }, row.button), h('td', {}, row.what), h('td', { class: 'help__keys' }, row.keys)));
    }
    table.append(body);

    const close = h('button', { type: 'button', class: 'btn btn--primary' }, t('common.close'));
    close.addEventListener('click', () => this.close());

    this.dialog.replaceChildren(
      h('h2', { id: 'help-title' }, t('help.title')),
      h(
        'section',
        { class: 'settings__section' },
        h('h3', {}, t(this.toy ? 'help.t.how.h' : 'help.how.h')),
        h('p', { class: 'help__text' }, ...rich(t(this.toy ? (this.toy.menu ? 'help.m.how.p' : 'help.t.how.p') : 'help.how.p'))),
      ),
      h('section', { class: 'settings__section' }, h('h3', {}, t('help.keys.h')), table),
      gamesSection(this.model),
      h(
        'section',
        { class: 'settings__section' },
        h('h3', {}, t('help.pointer.h')),
        h('p', { class: 'help__text' }, t(this.toy ? (this.toy.menu ? 'help.m.pointer.p' : 'help.t.pointer.p') : 'help.pointer.p')),
      ),
      ...(this.toy
        ? []
        : [
            h(
              'section',
              { class: 'settings__section help__orig', id: 'original-device' },
              h('h3', {}, t('help.orig.h')),
              ...(['help.orig.pick', 'help.orig.tetris', 'help.orig.shooting', 'help.orig.special', 'help.orig.cheat'] as const).map((key) =>
                h('p', { class: 'help__text help__text--orig' }, ...rich(t(key))),
              ),
            ),
          ]),
      h(
        'section',
        { class: 'settings__section' },
        h('h3', {}, t('help.about.h')),
        h('p', { class: 'help__text' }, t(this.toy ? (this.toy.menu ? 'help.m.about.p' : 'help.t.about.p') : 'help.about.p')),
      ),
      h('div', { class: 'settings__row settings__row--end' }, close),
    );
  }
}
