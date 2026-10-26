import { MINI_GAMES, type MiniGameId } from '../brick/guides/mini';
import { h } from './dom';
import { compactGuide } from './guidePanel';
import { getLang, onLangChange, t } from './i18n';
import { keyCaps, POWER_KEY, SOUND_KEY } from './help';
import type { InputHub } from './hub';
import { keyRow } from './infoPanel';
import { miniBrickMark } from './minibrickModel';
import { TOYS } from './toys';

export interface MiniInfoHooks {
  /** Вкладку игры выбрали: консоль в меню переходит к первому номеру этой игры. */
  onChoose?(id: MiniGameId): void;
  /** Щелчок мышью по вкладке: клавиатура возвращается игре. */
  onPointerUse?(): void;
  signal?: AbortSignal;
}

/**
 * Левая панель Mini Brick Game B-S96 — как у остальных игрушек с играми: наклейка «96 IN 1», схема управления (по текущим привязкам) и раздел «Игры на устройстве»
 * со вкладками. Игр две — гонки (номера 00–01, две вариации) и тетрис (02–96): у каждой общее описание «по факту реализации» (`brick/guides/mini.ts`), а не карточка на каждый
 * номер. Вкладка с точкой — игра под курсором меню консоли; щелчок по вкладке ставит курсор на первый номер этой игры.
 */
export class MiniInfoPanel {
  private readonly root: HTMLElement;
  private readonly hub: InputHub;
  private readonly hooks: MiniInfoHooks;
  private selected: MiniGameId = 'racing';
  private active: MiniGameId = 'racing';
  private tabs = new Map<MiniGameId, HTMLButtonElement>();
  private showTab: ((id: MiniGameId) => void) | null = null;

  constructor(root: HTMLElement, hub: InputHub, hooks: MiniInfoHooks = {}) {
    this.root = root;
    this.hub = hub;
    this.hooks = hooks;
    this.render();
    onLangChange(() => this.render(), hooks.signal);
  }

  /** Игра под курсором меню консоли изменилась: точка на вкладке и открытое описание переходят к ней (пока игра та же, вкладку читателя не трогаем). */
  setActive(id: MiniGameId): void {
    if (id === this.active) return;
    this.active = id;
    for (const [gameId, tab] of this.tabs) {
      if (gameId === id) tab.dataset['playing'] = '';
      else delete tab.dataset['playing'];
    }
    this.showTab?.(id);
  }

  render(): void {
    const { keyboard } = this.hub.settings;
    const keys = (...actions: Parameters<typeof keyCaps>[1][]): string[] => keyCaps(keyboard, ...actions);
    this.root.dataset['toy'] = 'minibrick';
    const head = h(
      'header',
      { class: 'side__top side__top--logo' },
      h('h2', { class: 'visually-hidden', id: 'info-title' }, TOYS.minibrick.name),
      h('div', { class: 'about__sticker' }, miniBrickMark('label', { class: 'minibrick-sticker' })),
    );
    const keyList = h(
      'ul',
      { class: 'keys', id: 'keymap' },
      keyRow('LEFT / LEVEL', keys('left')),
      keyRow('RIGHT / SPEED', keys('right')),
      keyRow('DOWN / GAME', keys('down')),
      keyRow('ROTATE', keys('jump', 'up')),
      keyRow(t('info.keys.startPause'), keys('start', 'pause')),
      keyRow(t('info.keys.power'), [POWER_KEY]),
      keyRow(t('info.keys.sound'), [SOUND_KEY]),
    );
    const controls = h('details', { class: 'side__sec side__sec--keys' }, h('summary', { class: 'side__h', id: 'keys-title' }, t('info.controls.h')), keyList);
    this.root.replaceChildren(head, controls, this.gamesSection());
  }

  private gamesSection(): HTMLElement {
    const lang = getLang();
    const list = h('div', { class: 'gtabs', role: 'tablist', 'aria-label': t('games.tabs') });
    const panel = h('div', { class: 'gpanel', role: 'region', id: 'gpanel' });
    const tabs = new Map<MiniGameId, HTMLButtonElement>();
    this.tabs = tabs;
    const select = (id: MiniGameId, focus = false): void => {
      this.selected = id;
      for (const [gameId, tab] of tabs) {
        tab.setAttribute('aria-selected', String(gameId === id));
        tab.tabIndex = gameId === id ? 0 : -1;
      }
      const game = MINI_GAMES.find((item) => item.id === id)!;
      panel.dataset['game'] = id;
      panel.setAttribute('aria-labelledby', `gtab-${id}`);
      panel.replaceChildren(
        h('header', { class: 'gpanel__head' }, h('span', { class: 'gkey', 'aria-hidden': 'true' }, game.key), h('h4', { class: 'gpanel__name' }, game.name[lang])),
        ...compactGuide(game.guide, lang),
        h('p', { class: 'side__text' }, game.note[lang]),
      );
      if (focus) tabs.get(id)?.focus();
    };
    for (const game of MINI_GAMES) {
      const tab = h(
        'button',
        { type: 'button', role: 'tab', class: 'gtab', id: `gtab-${game.id}`, 'data-game': game.id, 'aria-controls': 'gpanel', title: `${game.key}: ${game.name[lang]}`, 'aria-label': `${game.key}: ${game.name[lang]}` },
        game.key,
      );
      if (game.id === this.active) tab.dataset['playing'] = '';
      tab.addEventListener('click', (event) => {
        select(game.id);
        this.hooks.onChoose?.(game.id);
        if (event.detail !== 0) this.hooks.onPointerUse?.();
      });
      tabs.set(game.id, tab);
      list.append(tab);
    }
    list.addEventListener('keydown', (event) => {
      const ids = MINI_GAMES.map((game) => game.id);
      const at = ids.indexOf(this.selected);
      const last = ids.length - 1;
      const next = { ArrowRight: at >= last ? 0 : at + 1, ArrowDown: at >= last ? 0 : at + 1, ArrowLeft: at <= 0 ? last : at - 1, ArrowUp: at <= 0 ? last : at - 1, Home: 0, End: last }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(ids[next] ?? this.selected, true);
      this.hooks.onChoose?.(this.selected);
    });
    this.showTab = (id) => select(id);
    select(this.selected);
    return h('section', { class: 'side__sec side__sec--games', 'aria-labelledby': 'games-title' }, h('div', { class: 'side__hrow' }, h('h3', { class: 'side__h', id: 'games-title' }, t('help.games.h'))), list, panel);
  }
}
