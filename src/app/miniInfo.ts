import type { GameGuideData, GuideText } from '../brick/guide';
import { MINI_GAMES } from '../brick/guides/mini';
import { h } from './dom';
import { deviceCard } from './deviceCard';
import { compactGuide } from './guidePanel';
import { getLang, onLangChange, t } from './i18n';
import type { InputHub } from './hub';
import { miniBrickMark } from './minibrickModel';
import { TOYS } from './toys';

/** Игра на вкладке левой панели: метка, название, описание «по факту реализации» и короткая пометка (Mini: гонки и тетрис; FM-38: тетрис A и B). */
export interface PanelGame {
  id: string;
  key: string;
  name: GuideText;
  guide: GameGuideData;
  note: GuideText;
}

export interface MiniInfoHooks {
  /** Какая это игрушка и какие у неё вкладки (по умолчанию — Mini Brick B-S96). */
  toy?: 'minibrick' | 'fm38' | 'prince118';
  games?: readonly PanelGame[];
  /** Вкладку игры выбрали: консоль в меню переходит к первому номеру этой игры (или к варианту A/B). */
  onChoose?(id: string): void;
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
  private readonly hooks: MiniInfoHooks;
  private readonly games: readonly PanelGame[];
  private selected: string;
  private active: string;
  private tabs = new Map<string, HTMLButtonElement>();
  private showTab: ((id: string) => void) | null = null;

  constructor(root: HTMLElement, _hub: InputHub, hooks: MiniInfoHooks = {}) {
    this.root = root;
    this.hooks = hooks;
    this.games = hooks.games ?? MINI_GAMES;
    this.selected = this.games[0]!.id;
    this.active = this.selected;
    this.render();
    onLangChange(() => this.render(), hooks.signal);
  }

  /** Игра под курсором меню консоли изменилась: точка на вкладке и открытое описание переходят к ней (пока игра та же, вкладку читателя не трогаем). */
  setActive(id: string): void {
    if (id === this.active) return;
    this.active = id;
    for (const [gameId, tab] of this.tabs) {
      if (gameId === id) tab.dataset['playing'] = '';
      else delete tab.dataset['playing'];
    }
    this.showTab?.(id);
  }

  render(): void {
    const toy = this.hooks.toy ?? 'minibrick';
    this.root.dataset['toy'] = toy;
    // Логотип: у Mini — наклейка «96 IN 1», у FM-38 — знак «2 IN 1 BRICK GAME» по графике владельца.
    const logo =
      toy === 'fm38'
        ? h('img', { class: 'about__logo fm38-logo', src: `${import.meta.env.BASE_URL}devices/fm38/logo.png`, width: '600', height: '600', alt: 'Brick Game 2 in 1' })
        : toy === 'prince118'
          ? h('img', { class: 'about__logo prince-logo', src: `${import.meta.env.BASE_URL}devices/prince118/logo.webp`, width: '540', height: '255', alt: 'Prince 皇太子 118 in 1' })
          : h('div', { class: 'about__sticker' }, miniBrickMark('label', { class: 'minibrick-sticker' }));
    this.root.replaceChildren(h('h2', { class: 'visually-hidden', id: 'info-title' }, TOYS[toy].name), deviceCard({ toy, logo }), this.gamesSection());
  }

  private gamesSection(): HTMLElement {
    const lang = getLang();
    const list = h('div', { class: 'gtabs', role: 'tablist', 'aria-label': t('games.tabs') });
    const panel = h('div', { class: 'gpanel', role: 'region', id: 'gpanel' });
    const tabs = new Map<string, HTMLButtonElement>();
    this.tabs = tabs;
    const select = (id: string, focus = false): void => {
      this.selected = id;
      for (const [gameId, tab] of tabs) {
        tab.setAttribute('aria-selected', String(gameId === id));
        tab.tabIndex = gameId === id ? 0 : -1;
      }
      const game = this.games.find((item) => item.id === id)!;
      panel.dataset['game'] = id;
      panel.setAttribute('aria-labelledby', `gtab-${id}`);
      panel.replaceChildren(
        h('header', { class: 'gpanel__head' }, h('span', { class: 'gkey', 'aria-hidden': 'true' }, game.key), h('h4', { class: 'gpanel__name' }, game.name[lang])),
        ...compactGuide(game.guide, lang),
        h('p', { class: 'side__text' }, game.note[lang]),
      );
      if (focus) tabs.get(id)?.focus();
    };
    for (const game of this.games) {
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
      const ids = this.games.map((game) => game.id);
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
