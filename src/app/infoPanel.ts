import { previewStage } from '../encyclopedia/catalog';
import { guideForBody } from './bodyButtons';
import { BRICK_GAMES } from '../brick/games';
import { BRICK_GUIDES } from '../brick/guides';
import { GAMES, type GameId } from '../games/catalog';
import { BoxDialog, BoxViewer } from './boxViewer';
import { PACKS, type PackModel } from './packs';
import { h } from './dom';
import { compactGuide } from './guidePanel';
import { getLang, onLangChange, t, type MsgKey } from './i18n';
import { keyCaps, POWER_KEY, SOUND_KEY } from './help';
import type { InputHub } from './hub';
import { engineOf, gameKey, TOYS, type ToyId, type ToyModel } from './toys';

/**
 * Спрайты LCD-ячеек — те самые, что рисует игра (public/graphics/lcd): на упаковке в разделе «Figure introduction»
 * фигурки нарисованы этими же ячейками, отдельных картинок «чертей» и «драконов» там нет. Координаты — из assets.json.
 */
type SpriteName = 'hero' | 'heart' | 'block' | 'allOn' | 'devil';

const SPRITES: Record<SpriteName, { file: string; x: number; y: number; w: number; h: number; sheet: [number, number] }> = {
  hero: { file: 'lcd_atlas.png', x: 4, y: 4, w: 128, h: 112, sheet: [1024, 256] },
  heart: { file: 'lcd_heart.png', x: 0, y: 0, w: 128, h: 112, sheet: [128, 112] },
  devil: { file: 'lcd_devil.png', x: 0, y: 0, w: 128, h: 112, sheet: [128, 112] },
  block: { file: 'lcd_atlas.png', x: 136, y: 4, w: 128, h: 112, sheet: [1024, 256] },
  allOn: { file: 'lcd_atlas.png', x: 268, y: 4, w: 128, h: 112, sheet: [1024, 256] },
};

/** Одна LCD-ячейка: кусок листа спрайтов, масштаб `scale` относительно исходных 128 × 112. */
function sprite(name: SpriteName, scale: number): HTMLElement {
  const def = SPRITES[name];
  const base = import.meta.env.BASE_URL;
  const cell = h('i', { class: 'spr', 'aria-hidden': 'true' });
  cell.style.setProperty('--spr-url', `url("${base}graphics/lcd/${def.file}")`);
  cell.style.setProperty('--spr-w', `${def.w * scale}px`);
  cell.style.setProperty('--spr-h', `${def.h * scale}px`);
  cell.style.setProperty('--spr-sheet', `${def.sheet[0] * scale}px ${def.sheet[1] * scale}px`);
  cell.style.setProperty('--spr-pos', `${-def.x * scale}px ${-def.y * scale}px`);
  return cell;
}

/** Рисунок из ячеек: строки сверху вниз, `null` — пустая ячейка. Размер подбирается так, чтобы рисунок помещался в плитку. */
type Picture = readonly (readonly (SpriteName | null)[])[];

function figure(picture: Picture, className = 'score__fig'): HTMLElement {
  const columns = Math.max(...picture.map((row) => row.length));
  const scale = Math.min(0.26, 0.26 / Math.max(columns, picture.length));
  const box = h('span', { class: className, style: `--fig-cols:${columns}` });
  for (const row of picture) {
    for (let x = 0; x < columns; x++) {
      const name = row[x] ?? null;
      box.append(name ? sprite(name, scale) : h('i', { class: 'spr spr--gap', style: `--spr-w:${128 * scale}px;--spr-h:${112 * scale}px` }));
    }
  }
  return box;
}

const B = 'block';
const H = 'hero';

/** «Figure introduction» с упаковки: фигуры, составленные из тех же ячеек (как их рисует упаковка), подписи — из словаря. */
const FIGURES: readonly { name: MsgKey; picture: Picture }[] = [
  { name: 'info.fig.mario', picture: [[H]] },
  // Пуля — не отдельная фигура: на экране LCD точки нет, выстрел — то же сердечко, центральный сегмент ячейки.
  { name: 'info.fig.heartBullet', picture: [['heart']] },
  // Чёрти — те же ячейки, что и в игре: «негатив» героя (сегменты фона); малый — одна клетка, большой — 2 × 2 таких же, без сердца внутри.
  { name: 'info.fig.smallDevil', picture: [['devil']] },
  { name: 'info.fig.bigDevil', picture: [['devil', 'devil'], ['devil', 'devil']] },
  { name: 'info.fig.missile', picture: [['allOn']] },
  { name: 'info.fig.dragon', picture: [[H, H, H]] },
  { name: 'info.fig.gate', picture: [[B, B], [B, B], [B, B]] },
  { name: 'info.fig.bridge', picture: [[B, B, B]] },
  { name: 'info.fig.sewer', picture: [[B, null, B], [B, null, B], [B, null, B]] },
  { name: 'info.fig.volcano', picture: [[null, H, null], [H, null, H], [H, H, H]] },
  { name: 'info.fig.tetris', picture: [[B, B, B], [null, B, null]] },
];

const cap = (label: string): HTMLElement => h('kbd', { class: 'kbd' }, label);

/** Строка схемы управления: что делает и какие клавиши (по текущим привязкам; одно действие — одна или несколько клавиш). */
function keyRow(label: string, ...groups: string[][]): HTMLElement {
  const caps = groups.flatMap((group, index) => [...(index > 0 ? [h('span', { class: 'keys__sep' }, '·')] : []), ...group.map(cap)]);
  return h(
    'li',
    { class: 'keys__row' },
    h('span', { class: 'keys__what' }, label),
    h('span', { class: 'keys__caps' }, ...(caps.length === 0 ? [h('span', { class: 'keys__none' }, t('common.unset'))] : caps)),
  );
}

/** Строка очков: название и способы набрать очки (каждый — «как — сколько»); фигура видна выше, в «Фигурах и врагах». */
function scoreRow(name: string, ways: readonly (readonly [string, number])[]): HTMLElement {
  return h(
    'li',
    { class: 'score__row' },
    h('b', { class: 'score__name' }, name),
    h('span', { class: 'score__ways' }, ...ways.map(([how, points]) => h('span', { class: 'score__way' }, h('span', {}, how), h('b', {}, `+${points}`)))),
  );
}

/**
 * Левая панель: коротко об игре по упаковке оригинала (фигуры и враги, очки, правила, особые функции) и клавиши
 * управления. Клавиши берутся из текущих привязок — после переназначения в настройках список обновляется (`render`);
 * язык меняется на лету. Панель намеренно тусклая и без картинок кнопок корпуса, чтобы не читаться как часть игрушки.
 */
/**
 * Связи левой панели с игрой: диалог 3D-упаковки (пока он открыт, игра на паузе, как у справки) и возврат клавиатуры игре после щелчка мышью
 * по вкладке (как у остальных панелей: с клавиатуры, `detail` = 0, фокус остаётся на вкладке, чтобы работали стрелки).
 */
export interface InfoPanelBox {
  dialog: HTMLDialogElement;
  onOpen(): void;
  onClose(): void;
  onPointerUse(): void;
  /** Игру выбрали в левой панели (список или стрелки): консоль в меню переключает выбор на неё. */
  onChoose?(id: GameId): void;
  /** Кнопка «запуск»: выбрать игру на консоли и начать партию. */
  onLaunch?(id: GameId): void;
}



export class InfoPanel {
  private readonly root: HTMLElement;
  private readonly hub: InputHub;
  private readonly toy: ToyId;
  private readonly signal: AbortSignal | undefined;
  private readonly onPointerUse: (() => void) | undefined;
  private readonly onChoose: ((id: GameId) => void) | undefined;
  private readonly onLaunch: ((id: GameId) => void) | undefined;
  /** Модель упаковки игрушки (если есть) и диалог, где её можно рассмотреть. */
  private readonly pack: PackModel | null;
  private readonly boxDialog: BoxDialog | null;
  /** Миниатюра коробки в шапке: пересоздаётся вместе с панелью. */
  private thumb: BoxViewer | null = null;
  /** Открытая вкладка игры (по умолчанию — играемая сейчас); при перерисовке и смене языка сохраняется. */
  private selected: GameId;
  /** Игра, которая выбрана в меню консоли или играет сейчас (вкладка с точкой); у консоли с меню вкладка следует за выбором в меню. */
  private active: GameId;
  private tabEls = new Map<GameId, HTMLButtonElement>();
  private showTab: ((id: GameId) => void) | null = null;

  constructor(root: HTMLElement, hub: InputHub, toy: ToyId = 'mario', signal?: AbortSignal, box?: InfoPanelBox) {
    this.toy = toy;
    this.root = root;
    this.hub = hub;
    this.signal = signal;
    this.onPointerUse = box?.onPointerUse;
    this.onChoose = box?.onChoose;
    this.onLaunch = box?.onLaunch;
    const first = TOYS[toy].defaultGame;
    if (first === null) throw new Error('A playable information panel requires a game.');
    this.selected = first;
    this.active = first;
    const packId = TOYS[toy].pack;
    this.pack = packId ? PACKS[packId] : null;
    this.boxDialog = box && this.pack ? new BoxDialog(box.dialog, this.pack, { onOpen: box.onOpen, onClose: box.onClose }, signal) : null;
    this.render();
    onLangChange(() => this.render(), signal);
  }

  /** Открыт ли диалог 3D-коробки (геймпад закрывает его кнопкой «назад»). */
  get boxOpen(): boolean {
    return this.boxDialog?.isOpen ?? false;
  }

  closeBox(): void {
    this.boxDialog?.close();
  }

  /**
   * Игра консоли изменилась (выбрана в меню или запущена): вкладка с точкой и открытое описание переходят к ней. Пока игра та же, вкладку,
   * которую читатель открыл сам, не трогаем.
   */
  setActive(id: GameId): void {
    if (id === this.active) return;
    this.active = id;
    for (const [gameId, tab] of this.tabEls) {
      if (gameId === id) tab.dataset['playing'] = '';
      else delete tab.dataset['playing'];
    }
    this.showTab?.(id);
  }

  render(): void {
    const { keyboard } = this.hub.settings;
    const keys = (...actions: Parameters<typeof keyCaps>[1][]): string[] => keyCaps(keyboard, ...actions);

    const model = TOYS[this.toy];
    const sticker = h(
      'div',
      { class: 'about__sticker' },
      h('img', {
        class: `about__logo${this.toy === 'seabattle' ? ' sticker--seabattle' : ''}`,
        src: `${import.meta.env.BASE_URL}brand/${this.toy === 'brickgame' ? 'brick-game-wordmark.svg' : this.toy === 'mario' ? 'crocodile-mario-logo.png' : `sticker-${this.toy}.webp`}`,
        width: '1000',
        height: '443',
        alt: model.name,
      }),
    );
    const boxButton = this.boxButton();
    const head = h(
      'header',
      { class: `side__top side__top--logo${boxButton ? ' side__top--box' : ''}` },
      h('h2', { class: 'visually-hidden', id: 'info-title' }, t('info.title')),
      sticker,
      ...(boxButton ? [boxButton] : []),
    );

    if (engineOf(model) === 'tetris') {
      this.root.dataset['toy'] = model.id;
      // Консоль с меню: кнопки работают и в меню (выбор игры, варианта, уровня и скорости), и в игре; у модели без меню — только тетрис.
      const rows = model.menu
        ? [
            keyRow(`${t('info.m.leftRight')} (${t('info.m.leftRight.menu')})`, keys('left'), keys('right')),
            keyRow(`${t('info.m.upDown')} (${t('info.m.upDown.menu')})`, keys('up'), keys('down')),
            keyRow(`${t('info.m.rotate')} (${t('info.m.rotate.menu')})`, keys('jump')),
          ]
        : [
            keyRow(t('info.t.move'), keys('left'), keys('right')),
            keyRow(t('info.t.rotate'), keys('jump', 'up')),
            keyRow(t('info.t.down'), keys('down')),
          ];
      const keyList = h(
        'ul',
        { class: 'keys', id: 'keymap' },
        ...rows,
        keyRow(t('info.keys.startPause'), keys('start', 'pause')),
        keyRow(t('info.keys.power'), [POWER_KEY]),
        keyRow(t('info.keys.sound'), [SOUND_KEY]),
      );
      // У консоли с меню описания игр важнее схемы клавиш: на невысоком окне схема свёрнута (раскрывается заголовком), чтобы описанию хватило места.
      const controls = model.menu
        ? h('details', { class: 'side__sec side__sec--keys' }, h('summary', { class: 'side__h', id: 'keys-title' }, t('info.controls.h')), keyList)
        : h('section', { class: 'side__sec', 'aria-labelledby': 'keys-title' }, h('h3', { class: 'side__h', id: 'keys-title' }, t('info.controls.h')), keyList);
      this.root.replaceChildren(head, controls, this.gamesSection(model));
      return;
    }

    delete this.root.dataset['toy']; // панель мог занимать тетрис другой игрушки: здесь снова справка по упаковке Mario
    const about = h(
      'section',
      { class: 'side__sec side__sec--facts', 'aria-labelledby': 'about-title' },
      h('h3', { class: 'side__h', id: 'about-title' }, t('info.journey.h')),
      h(
        'ul',
        { class: 'facts', 'aria-label': t('info.facts.aria') },
        h('li', {}, h('b', {}, '4'), h('span', {}, t('info.facts.lives'))),
        h('li', {}, h('b', {}, '400'), h('span', {}, t('info.facts.seconds'))),
        h('li', {}, h('b', {}, '9'), h('span', {}, t('info.facts.levels'))),
      ),
    );

    const controls = h(
      'section',
      { class: 'side__sec', 'aria-labelledby': 'keys-title' },
      h('h3', { class: 'side__h', id: 'keys-title' }, t('info.controls.h')),
      h(
        'ul',
        { class: 'keys', id: 'keymap' },
        keyRow(t('info.keys.move'), keys('left'), keys('right')),
        // По упаковке в режиме MARIO прыжок — и UP, и JUMP.
        keyRow(t('info.keys.jump'), keys('jump'), keys('up')),
        keyRow(t('info.keys.fire'), keys('fire')),
        keyRow(t('info.keys.startPause'), keys('start', 'pause')),
        keyRow(t('info.keys.power'), [POWER_KEY]),
        keyRow(t('info.keys.sound'), [SOUND_KEY]),
      ),
    );

    // Названия фигур — по упаковке, на английском на любом языке интерфейса.
    const figures = h(
      'section',
      { class: 'side__sec', 'aria-labelledby': 'figs-title' },
      h('h3', { class: 'side__h', id: 'figs-title' }, t('info.figs.h')),
      h(
        'ul',
        { class: 'figs', id: 'figures', 'aria-label': t('info.figs.aria') },
        ...FIGURES.map(({ name, picture }) =>
          h(
            'li',
            { class: 'fig' },
            figure(picture, 'fig__box'),
            h('span', { class: 'fig__name' }, t(name)),
          ),
        ),
      ),
    );

    const way = { eat: t('info.way.eat'), trample: t('info.way.trample'), shoot: t('info.way.shoot') };
    const score = h(
      'section',
      { class: 'side__sec', 'aria-labelledby': 'score-title' },
      h('h3', { class: 'side__h', id: 'score-title' }, t('info.score.h')),
      h(
        'ul',
        { class: 'score' },
        scoreRow(t('info.fig.heart'), [[way.eat, 100]]),
        scoreRow(t('info.fig.smallDevil'), [[way.trample, 200], [way.shoot, 20]]),
        scoreRow(t('info.fig.bigDevil'), [[way.shoot, 400]]),
      ),
      h('p', { class: 'side__cap' }, t('info.lose.h')),
      h(
        'ul',
        { class: 'hazards', 'aria-label': t('info.lose.aria') },
        ...(['info.lose.river', 'info.lose.devil', 'info.lose.dragon', 'info.lose.missile', 'info.lose.gate'] as const).map((key) =>
          h('li', { class: 'hazard' }, t(key)),
        ),
      ),
      h('p', { class: 'side__text side__text--over' }, t('info.over')),
    );

    this.root.replaceChildren(head, about, controls, figures, score);
  }

  /** Миниатюра 3D-упаковки рядом с наклейкой: щелчок открывает диалог, над ней (наведение, фокус) упаковка медленно поворачивается. */
  private boxButton(): HTMLElement | null {
    const dialog = this.boxDialog;
    const pack = this.pack;
    this.thumb?.dispose();
    this.thumb = null;
    if (!dialog || !pack) return null;
    const thumb = new BoxViewer({ model: pack, interactive: false, signal: this.signal });
    this.thumb = thumb;
    const button = h(
      'button',
      { type: 'button', class: 'boxbtn', 'data-box-open': pack.id, 'aria-label': t(pack.text.open), title: t(pack.text.open) },
      thumb.element,
      h('span', { class: 'boxbtn__cap', 'aria-hidden': 'true' }, t('box.cap')),
      h('span', { class: 'boxbtn__label', 'aria-hidden': 'true' }, t(pack.text.short)),
    );
    const options = { signal: this.signal };
    button.addEventListener('click', () => dialog.open(), options);
    button.addEventListener('pointerenter', () => thumb.setSpin(true), options);
    button.addEventListener('pointerleave', () => thumb.setSpin(false), options);
    button.addEventListener('focus', () => thumb.setSpin(true), options);
    button.addEventListener('blur', () => thumb.setSpin(false), options);
    return button;
  }

  /** Раздел «Игры на устройстве»: вкладки игр консоли (цифры или буквы, как в меню устройства) и описание открытой игры. */
  private gamesSection(model: ToyModel): HTMLElement {
    if (model.defaultGame === null) throw new Error('This console has no game catalog yet.');
    const lang = getLang();
    const list = h('div', { class: 'gtabs', role: 'tablist', 'aria-label': t('games.tabs') });
    const panel = h('div', { class: 'gpanel', role: 'tabpanel', id: 'gpanel' });
    const chooser = h('select', {class:'pick', id:'guide-game', 'aria-label':t('games.tabs')});
    const tabs = new Map<GameId, HTMLButtonElement>();
    this.tabEls = tabs;
    const ids = model.games.map((game) => game.id);
    const select = (id: GameId, focus = false): void => {
      this.selected = id;
      chooser.value = id;
      for (const [gameId, tab] of tabs) {
        const on = gameId === id;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      }
      panel.setAttribute('aria-labelledby', model.universal ? 'games-title' : `gtab-${id}`);
      panel.dataset['game'] = id;
      panel.replaceChildren(...this.gamePanel(model, id));
      if (focus) tabs.get(id)?.focus();
    };
    model.games.forEach((game, index) => {
      const key = gameKey(model, index);
      const name = GAMES[game.id].names[lang];
      chooser.append(h('option',{value:game.id},`${key}: ${name}`));
      const tab = h(
        'button',
        { type: 'button', role: 'tab', class: 'gtab', id: `gtab-${game.id}`, 'data-game': game.id, 'data-key': key, 'aria-controls': 'gpanel', title: name, 'aria-label': `${key}: ${name}` },
        key,
      );
      if (game.id === this.active) tab.dataset['playing'] = '';
      tab.addEventListener('click', (event) => {
        select(game.id);
        this.onChoose?.(game.id);
        if (event.detail !== 0) this.onPointerUse?.(); // мышью — клавиатура возвращается игре; со стрелок фокус остаётся на вкладке
      });
      tabs.set(game.id, tab);
      list.append(tab);
    });
    list.addEventListener('keydown', (event) => {
      const at = ids.indexOf(this.selected);
      const last = ids.length - 1;
      const next = { ArrowRight: at >= last ? 0 : at + 1, ArrowDown: at >= last ? 0 : at + 1, ArrowLeft: at <= 0 ? last : at - 1, ArrowUp: at <= 0 ? last : at - 1, Home: 0, End: last }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(ids[next] ?? this.selected, true);
      this.onChoose?.(this.selected); // как при щелчке: меню консоли следует за открытой вкладкой
    });
    chooser.addEventListener('change', () => {
      select(chooser.value as GameId);
      this.onChoose?.(this.selected);
    });
    // Стрелки и запуск рядом с заголовком: листать игры по кругу, не открывая список, и сразу запускать выбранную.
    const step = (delta: number): void => {
      const at = Math.max(0, ids.indexOf(this.selected));
      select(ids[(at + delta + ids.length) % ids.length] ?? this.selected);
      this.onChoose?.(this.selected);
    };
    const control = (kind: string, text: string, label: MsgKey, action: () => void): HTMLButtonElement => {
      const button = h('button', { type: 'button', class: `gnav__btn gnav__btn--${kind}`, 'aria-label': t(label), title: t(label) }, text);
      button.addEventListener('click', (event) => {
        action();
        if (event.detail !== 0) this.onPointerUse?.();
      });
      return button;
    };
    const nav = h(
      'div',
      { class: 'gnav', role: 'group', 'aria-label': t('games.tabs') },
      control('prev', '‹', 'games.prev', () => step(-1)),
      control('next', '›', 'games.next', () => step(1)),
      control('launch', '▶', 'games.launch', () => {
        this.onChoose?.(this.selected);
        this.onLaunch?.(this.selected);
      }),
    );
    if (model.universal) panel.setAttribute('role','region');
    this.showTab = (id) => select(id);
    select(ids.includes(this.selected) ? this.selected : model.defaultGame);
    return h(
      'section',
      { class: 'side__sec side__sec--games', 'aria-labelledby': 'games-title' },
      h('div', { class: 'side__hrow' }, h('h3', { class: 'side__h', id: 'games-title' }, t('help.games.h')), nav),
      model.universal ? chooser : list,
      panel,
    );
  }

  /** Краткая памятка игроку; происхождение правил и статусы находятся в справке. */
  private gamePanel(model: ToyModel, id: GameId): HTMLElement[] {
    const lang = getLang();
    const head = h('header', { class: 'gpanel__head' }, h('span', { class: 'gkey', 'aria-hidden': 'true' }, gameKey(model, model.games.findIndex((g) => g.id === id))), h('h4', { class: 'gpanel__name' }, GAMES[id].names[lang]));
    const stage=model.universal ? previewStage(id) : null;
    if(stage){
      const alpha=stage==='alpha', label=lang==='ru'?(alpha?'Альфа':'Бета'):(alpha?'Alpha':'Beta');
      const detail=lang==='ru'
        ? `${label}: точность реконструкции ${alpha?30:60}%. Подробнее об источниках — в энциклопедии игр.`
        : `${label}: reconstruction accuracy ${alpha?30:60}%. See the game encyclopedia for sources.`;
      head.append(h('span',{class:'gpanel__stage','data-stage':stage,title:detail,'aria-label':detail},h('b',{'aria-hidden':'true'},alpha?'α':'β'),label));
    }
    const data = BRICK_GUIDES[id];
    return [head, ...(data ? compactGuide(guideForBody(data, model, BRICK_GAMES[id]), lang) : [])];
  }
}
