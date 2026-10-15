import type { UserLevel } from '../editor/library';
import type { Music, Shell } from '../input/settings';
import { h } from './dom';
import { icon, type IconName } from './icons';
import { onLangChange, t, type MsgKey } from './i18n';
import { sameLevel, slotTitle, type BundledLevel, type LevelRef, type OriginalSlot } from './levels';
import { ShellPicker } from './shellPicker';
import { formatRunTime, type RunView } from './speedrun';
import { VIEWS, type View } from './view';

export interface ControlPanelActions {
  pickShell(shell: Shell): void;
  toggleSound(): void;
  /** Громкость звука 0…1 от ползунка. `commit = false` — ползунок ещё тянут (звук меняется, сохранять рано); `true` — отпустили. */
  setVolume(volume: number, commit: boolean): void;
  /** То же для ползунка музыки; под «Оригинал» оба ползунка связаны — приложение двигает обе громкости вместе. */
  setMusicVolume(volume: number, commit: boolean): void;
  setMusic(music: Music): void;
  toggleGhost(): void;
  setView(view: View): void;
  pickOriginal(number: number): void;
  pickBundled(levelId: string): void;
  pickUser(projectId: string): void;
}

/** Всё, что панель показывает о странице. `ghost: null` — у экрана нет слоя неактивных сегментов. */
export interface ControlPanelView {
  shell: Shell;
  sound: boolean;
  /** Громкость звука 0…1. */
  volume: number;
  /** Громкость музыки 0…1 (под «Оригинал» равна громкости звука: ползунки связаны). */
  musicVolume: number;
  music: Music;
  ghost: boolean | null;
  view: View;
  /** Игрушка включена: пока игра идёт, «Свёрнута» недоступна — сначала выключить (ON/OFF). */
  powered: boolean;
  level: LevelRef | null;
}

export interface ControlPanelOptions {
  slots: readonly OriginalSlot[];
  /** Готовые пользовательские уровни пакета (их названия — из словаря). */
  bundled: readonly BundledLevel[];
  actions: ControlPanelActions;
  /** Темп игры (тактов в секунду): по нему такты спидрана переводятся в секунды. */
  tickRateHz: number;
  /** Клик мышью или касанием: вернуть клавиатуру игре. С клавиатуры фокус остаётся на кнопке панели. */
  onPointerUse(): void;
}

/** Состояние записи «Ремастера» (см. `AudioPort.remasterStatus`): по нему на кнопке видно, грузится ли запись и удалось ли её загрузить. */
export type RemasterStatus = 'idle' | 'loading' | 'ready' | 'failed';

const MUSICS: readonly { id: Music; label: MsgKey }[] = [
  { id: 'original', label: 'music.original' },
  { id: 'remaster', label: 'music.remaster' },
];

const VIEW_LABELS: Record<View, { label: MsgKey; title: MsgKey }> = {
  closed: { label: 'view.closed', title: 'view.closedTitle' },
  full: { label: 'view.full', title: 'view.fullTitle' },
  screen: { label: 'view.screen', title: 'view.screenTitle' },
};

/** Ряд громкости: значок, ползунок 0…100 и подпись процента. Только разметка и показ значения — действия вешает панель. */
class VolumeSlider {
  readonly row: HTMLElement;
  readonly range: HTMLInputElement;
  readonly icon: HTMLElement;
  private readonly output: HTMLOutputElement;

  constructor(id: string, name: IconName) {
    this.range = h('input', { type: 'range', class: 'vol__range', id, min: '0', max: '100', step: '5', value: '25' });
    this.output = h('output', { class: 'vol__value', for: id }, '25%');
    this.icon = h('span', { class: 'vol__icon' }, icon(name));
    this.row = h('div', { class: 'vol', id: `${id}-row`, 'data-muted': 'false' }, this.icon, this.range, this.output);
  }

  /** Громкость 0…1 по положению ползунка. */
  read(): number {
    return Number(this.range.value) / 100;
  }

  /** Подпись и заливка ползунка (без побочных действий). */
  show(volume: number): void {
    const percent = Math.round(volume * 100);
    this.output.textContent = `${percent}%`;
    this.range.style.setProperty('--pct', `${percent}%`);
    this.range.setAttribute('aria-valuetext', `${percent}%`);
  }

  /** Установить громкость; `move` — двигать ли сам ползунок (пока его тянут, он остаётся под рукой пользователя). */
  set(volume: number, move: boolean): void {
    const value = String(Math.round(volume * 100));
    if (move || this.range.value !== value) this.range.value = value;
    this.show(volume);
  }
}

/**
 * Правая панель страницы («Пульт»): мини-блок «Звук» (вкл/выкл, громкость, музыка «Оригинал»/«Ремастер»), блок «Вид» (цвет игрушки,
 * состояние «свёрнута / полная / только экран», слой сегментов), уровни (оригинальные 1–9 плитками, пользовательские — выпадающим
 * списком) и выезжающий спидран-HUD. Индикатор устройства и смена фона живут в угловом меню (`CornerNav`). DOM строится один раз,
 * дальше меняются только атрибуты и тексты, поэтому фокус и прокрутка при переключениях не сбиваются.
 */
export class ControlPanel {
  private readonly root: HTMLElement;
  private readonly options: ControlPanelOptions;
  private readonly picker: ShellPicker;
  private readonly soundToggle: { button: HTMLButtonElement; icon: HTMLElement; label: HTMLElement };
  private readonly ghostToggle: HTMLButtonElement;
  private soundBlock: HTMLElement | null = null;
  /** Ползунки связаны (музыка «Оригинал»): их двигает один и тот же уровень. */
  private linked = true;
  private readonly musicButtons = new Map<Music, HTMLButtonElement>();
  private musicRoot: HTMLElement | null = null;
  private remasterStatus: RemasterStatus = 'idle';
  private readonly viewButtons = new Map<View, HTMLButtonElement>();
  private readonly tiles = new Map<number, HTMLButtonElement>();
  private readonly tiles2: { tile: HTMLButtonElement; slot: OriginalSlot }[] = [];
  private readonly userSelect = h('select', { class: 'pick', id: 'user-level' });
  private readonly volume: VolumeSlider;
  private readonly musicVolume: VolumeSlider;
  private readonly runToggle = h('button', { type: 'button', class: 'run__toggle', id: 'run-toggle', 'aria-expanded': 'false', 'aria-controls': 'run-panel' });
  private readonly runBox = h('div', { class: 'run', id: 'run', 'data-open': 'false' });
  private readonly runRows = h('ol', { class: 'run__rows', id: 'run-rows' });
  private readonly runTotal = h('output', { class: 'run__time', id: 'run-total' }, '0:00.0');
  private readonly runProgress = h('span', { class: 'run__progress', id: 'run-progress' });
  private runSignature = '';
  private runCells = new Map<string, HTMLElement>();
  private lastRun: RunView | null = null;
  private users: readonly UserLevel[] = [];
  private userNote: MsgKey | null = null;
  private level: LevelRef | null = null;
  private lastView: ControlPanelView | null = null;
  /** Элементы с подписями: после смены языка тексты ставятся заново. */
  private readonly labels: { element: HTMLElement; key: MsgKey; attr?: string }[] = [];

  constructor(root: HTMLElement, options: ControlPanelOptions) {
    this.root = root;
    this.options = options;
    const { actions } = options;
    const pointerUse = (event: MouseEvent): void => {
      if (event.detail !== 0) options.onPointerUse(); // с клавиатуры (detail 0) фокус остаётся на кнопке
    };

    const top = h('header', { class: 'side__top' }, this.label(h('h2', { class: 'side__title', id: 'ctl-title' }), 'ctl.title'));

    // ── Звук: вкл/выкл и громкость в одном ряду, ниже — музыка ───────────
    const soundIcon = h('span', { class: 'tgl__icon' }, icon('sound'));
    const soundLabel = h('span', { class: 'tgl__label' });
    const soundButton = h('button', { type: 'button', class: 'tgl', id: 'tgl-sound', 'data-tgl': 'sound', 'aria-pressed': 'false' }, soundIcon, soundLabel);
    soundButton.addEventListener('click', (event) => {
      actions.toggleSound();
      pointerUse(event);
    });
    this.soundToggle = { button: soundButton, icon: soundIcon, label: soundLabel };
    // Два ползунка: «Звук» (эффекты) и «Музыка» (запись «Ремастера»). Под «Оригинал» они связаны — тянешь один, едет и другой.
    const slider = (id: string, name: IconName, key: MsgKey, set: (volume: number, commit: boolean) => void, other: () => VolumeSlider): VolumeSlider => {
      const control = new VolumeSlider(id, name);
      this.label(control.range, key, 'aria-label');
      control.range.addEventListener('input', () => {
        const value = control.read();
        control.show(value);
        if (this.linked) other().set(value, true); // связанный ползунок едет следом сразу, а не после того, как отпустили
        set(value, false);
      });
      control.range.addEventListener('change', () => set(control.read(), true));
      // Мышь и касание возвращают клавиатуру игре; со стрелок фокус остаётся на ползунке.
      control.range.addEventListener('pointerup', () => options.onPointerUse());
      return control;
    };
    this.volume = slider('volume', 'sound', 'vol.sound', actions.setVolume, () => this.musicVolume);
    this.musicVolume = slider('music-volume', 'music', 'vol.music', actions.setMusicVolume, () => this.volume);

    const music = this.label(h('div', { class: 'seg', id: 'music', role: 'group', 'data-remaster': 'idle' }), 'music.aria', 'aria-label');
    this.musicRoot = music;
    for (const { id, label } of MUSICS) {
      const button = h('button', { type: 'button', class: 'seg__btn', 'data-music': id, 'aria-pressed': 'false' });
      this.label(button, label);
      if (id === 'remaster') this.label(button, 'music.remasterNote', 'title');
      button.addEventListener('click', (event) => {
        actions.setMusic(id);
        pointerUse(event);
      });
      this.musicButtons.set(id, button);
      music.append(button);
    }
    const sound = h(
      'section',
      { class: 'side__sec side__sec--mini', id: 'blk-sound', 'aria-labelledby': 'snd-title' },
      this.label(h('h3', { class: 'side__h', id: 'snd-title' }), 'snd.h'),
      h('div', { class: 'snd' }, soundButton, this.volume.row),
      h('div', { class: 'side__cap side__cap--row' }, this.label(h('span', {}), 'music.h'), music),
      this.musicVolume.row,
    );
    this.soundBlock = sound;

    // ── Вид: цвет, состояние игрушки, сегменты ───────────────────────────
    this.picker = new ShellPicker({
      id: 'shell-picker',
      label: t('clr.h'),
      value: 'blue',
      onPick: (shell, byPointer) => {
        actions.pickShell(shell);
        if (byPointer) options.onPointerUse();
      },
    });
    const state = this.label(h('div', { class: 'seg seg--3', id: 'view-state', role: 'group' }), 'view.aria', 'aria-label');
    for (const view of VIEWS) {
      const button = h('button', { type: 'button', class: 'seg__btn', id: `view-${view}`, 'data-view': view, 'aria-pressed': 'false' });
      this.label(button, VIEW_LABELS[view].label);
      this.label(button, VIEW_LABELS[view].title, 'title');
      button.addEventListener('click', (event) => {
        if (button.getAttribute('aria-disabled') !== 'true') actions.setView(view);
        pointerUse(event);
      });
      this.viewButtons.set(view, button);
      state.append(button);
    }
    const ghostIcon = h('span', { class: 'tgl__icon' }, icon('segments'));
    this.ghostToggle = h('button', { type: 'button', class: 'tgl tgl--sm', id: 'tgl-ghost', 'data-tgl': 'ghost', 'aria-pressed': 'false' }, ghostIcon, this.label(h('span', { class: 'tgl__label' }), 'tgl.ghost'));
    this.ghostToggle.addEventListener('click', (event) => {
      actions.toggleGhost();
      pointerUse(event);
    });
    const view = h(
      'section',
      { class: 'side__sec', id: 'blk-view', 'aria-labelledby': 'view-title' },
      this.label(h('h3', { class: 'side__h', id: 'view-title' }), 'view.h'),
      this.label(h('p', { class: 'side__cap' }), 'clr.h'),
      this.picker.root,
      state,
      this.ghostToggle,
    );

    // ── Уровни ───────────────────────────────────────────────────────────
    const grid = this.label(h('div', { class: 'lvgrid', id: 'original-levels', role: 'group' }), 'lv.originalAria', 'aria-label');
    for (const slot of options.slots) {
      const open = slot.levelId !== null;
      const tile = h(
        'button',
        { type: 'button', class: 'lv', 'data-level': String(slot.number), ...(open ? {} : { 'aria-disabled': 'true' }) },
        h('span', { class: 'lv__num' }, String(slot.number)),
        ...(open ? [] : [icon('lock')]),
      );
      tile.addEventListener('click', (event) => {
        if (open) actions.pickOriginal(slot.number);
        pointerUse(event); // и закрытый уровень не уводит клавиатуру от игры
      });
      this.tiles.set(slot.number, tile);
      this.tiles2.push({ tile, slot });
      grid.append(tile);
    }
    this.label(this.userSelect, 'lv.customAria', 'aria-label');
    this.userSelect.addEventListener('change', () => {
      const [kind, id = ''] = this.userSelect.value.split(':', 2);
      if (kind === 'bundled') actions.pickBundled(id);
      else if (kind === 'user') actions.pickUser(this.userSelect.value.slice('user:'.length));
      options.onPointerUse();
    });
    const levels = h(
      'section',
      { class: 'side__sec', id: 'blk-levels', 'aria-labelledby': 'lv-title' },
      this.label(h('h3', { class: 'side__h', id: 'lv-title' }), 'lv.h'),
      this.label(h('p', { class: 'side__cap' }), 'lv.original'),
      grid,
      this.label(h('p', { class: 'side__cap' }), 'lv.custom'),
      this.userSelect,
    );

    // ── Спидран: скрыт под переключателем, по щелчку выезжает ────────────
    this.runToggle.append(icon('timer'), this.label(h('span', { class: 'run__title' }), 'run.toggle'), icon('chevron'));
    this.label(this.runToggle, 'run.hint', 'title');
    this.runToggle.addEventListener('click', (event) => {
      const open = this.runBox.dataset['open'] !== 'true';
      this.runBox.dataset['open'] = String(open);
      this.runToggle.setAttribute('aria-expanded', String(open));
      pointerUse(event);
    });
    const runPanel = h(
      'div',
      { class: 'run__panel', id: 'run-panel', role: 'region' },
      h(
        'div',
        { class: 'run__in' },
        this.runRows,
        h('div', { class: 'run__sum' }, h('b', { class: 'run__sum-h' }, ''), this.runProgress, this.runTotal),
      ),
    );
    this.label(runPanel, 'run.aria', 'aria-label');
    this.runBox.append(this.runToggle, runPanel);

    this.root.replaceChildren(top, sound, view, levels, this.runBox);
    this.setUserLevels([], null);
    this.relabel();
    onLangChange(() => this.relabel());
  }

  /** Запоминает элемент, чья подпись (текст или атрибут) берётся из словаря; возвращает его же. */
  private label<E extends HTMLElement>(element: E, key: MsgKey, attr?: string): E {
    this.labels.push(attr ? { element, key, attr } : { element, key });
    return element;
  }

  /** Все подписи — на текущем языке (при создании и после смены языка). */
  private relabel(): void {
    for (const { element, key, attr } of this.labels) {
      if (attr) element.setAttribute(attr, t(key));
      else element.textContent = t(key);
    }
    for (const { tile, slot } of this.tiles2) tile.title = slotTitle(slot);
    this.picker.relabel(t('clr.h'));
    this.titleRemaster();
    const sumHead = this.runBox.querySelector('.run__sum-h');
    if (sumHead) sumHead.textContent = t('run.total');
    if (this.lastView) this.update(this.lastView);
    this.setUserLevels(this.users, this.userNote);
    this.runSignature = '';
    if (this.lastRun) this.setRun(this.lastRun);
  }

  /**
   * Статус записи «Ремастера» на кнопке: пока грузится — мерцает, не загрузилась или не декодируется (Opus в MP4 не везде играет) — значок ⚠
   * и пояснение в подсказке; иначе молча звучал бы прежний оригинал, и казалось бы, что кнопка ничего не делает. Видно, только когда «Ремастер» выбран.
   */
  setRemasterStatus(status: RemasterStatus): void {
    if (status === this.remasterStatus) return;
    this.remasterStatus = status;
    this.musicRoot?.setAttribute('data-remaster', status);
    this.titleRemaster();
  }

  private titleRemaster(): void {
    const button = this.musicButtons.get('remaster');
    if (!button) return;
    const key: MsgKey = this.remasterStatus === 'loading' ? 'music.remasterLoading' : this.remasterStatus === 'failed' ? 'music.remasterFailed' : 'music.remasterNote';
    button.title = t(key);
  }

  private setIcon(holder: HTMLElement, name: IconName): void {
    if (holder.dataset['icon'] === name) return;
    holder.dataset['icon'] = name;
    holder.replaceChildren(icon(name));
  }

  /** Состояние страницы изменилось: обновить кнопки, цвет и подсветку выбранного уровня. */
  update(view: ControlPanelView): void {
    this.lastView = view;
    this.root.dataset['shell'] = view.shell;
    this.picker.set(view.shell);

    const sound = this.soundToggle;
    sound.button.setAttribute('aria-pressed', String(view.sound));
    sound.button.title = t(view.sound ? 'tgl.soundOn' : 'tgl.soundOff');
    sound.label.textContent = t('tgl.sound');
    this.setIcon(sound.icon, view.sound ? 'sound' : 'soundOff');
    // Пока ползунок тянут, значение не трогаем: его двигает сам пользователь.
    this.linked = view.music === 'original';
    this.volume.set(view.volume, document.activeElement !== this.volume.range);
    this.musicVolume.set(view.musicVolume, document.activeElement !== this.musicVolume.range);
    for (const control of [this.volume, this.musicVolume]) control.row.dataset['muted'] = String(!view.sound);
    this.setIcon(this.volume.icon, view.sound ? 'sound' : 'soundOff');
    this.musicVolume.row.dataset['linked'] = String(this.linked);
    this.musicVolume.row.title = this.linked ? t('vol.linked') : '';
    if (this.soundBlock) this.soundBlock.dataset['linked'] = String(this.linked);
    for (const [id, button] of this.musicButtons) button.setAttribute('aria-pressed', String(view.music === id));

    for (const [id, button] of this.viewButtons) {
      button.setAttribute('aria-pressed', String(view.view === id));
      // Включённую игрушку не закрыть: кнопка «Свёрнута» недоступна и объясняет почему (aria-disabled — чтобы оставаться в порядке фокуса).
      const blocked = id === 'closed' && view.powered && view.view !== 'closed';
      if (blocked) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
      button.title = t(blocked ? 'view.closedBlocked' : VIEW_LABELS[id].title);
    }
    this.ghostToggle.hidden = view.ghost === null;
    this.ghostToggle.setAttribute('aria-pressed', String(view.ghost === true));
    this.ghostToggle.title = t(view.ghost ? 'tgl.ghostOn' : 'tgl.ghostOff');

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
    const value = current?.kind === 'bundled' ? `bundled:${current.levelId}` : current?.kind === 'user' ? `user:${current.projectId}` : '';
    if (this.userSelect.value !== value && [...this.userSelect.options].some((option) => option.value === value)) this.userSelect.value = value;
    else if (value === '') this.userSelect.value = '';
  }

  /** Готовые уровни и карты из редактора — выпадающим списком. `note` — почему список карт недоступен (например, нет хранилища браузера). */
  setUserLevels(levels: readonly UserLevel[], note: MsgKey | null): void {
    this.users = levels;
    this.userNote = note;
    const select = this.userSelect;
    const options: HTMLElement[] = [h('option', { value: '' }, t('lv.pick'))];

    const bundled = this.options.bundled;
    if (bundled.length > 0) {
      options.push(
        h(
          'optgroup',
          { label: t('lv.group.built') },
          ...bundled.map((level) => h('option', { value: `bundled:${level.levelId}`, title: t(level.title) }, t(level.name))),
        ),
      );
    }
    const maps = levels.map((user) => {
      const playable = user.problem === null;
      const option = h(
        'option',
        { value: `user:${user.projectId}`, title: playable ? t('lv.play', { name: user.name, w: user.width, h: user.height }) : t('lv.bad', { why: user.problem ?? '' }), ...(playable ? {} : { disabled: '' }) },
        playable ? `${user.name} (${user.width}×${user.height})` : `⚠ ${user.name}`,
      );
      return option;
    });
    options.push(h('optgroup', { label: t('lv.group.maps') }, ...(maps.length > 0 ? maps : [h('option', { value: '', disabled: '' }, t(note ?? 'lv.noMaps'))])));
    select.replaceChildren(...options);
    this.markLevel();
  }

  /** Найденные сейчас карты (для проверок и повторной подсветки). */
  get userLevels(): readonly UserLevel[] {
    return this.users;
  }

  /** Спидран-HUD: время каждого уровня и общее время. Вызывается каждый кадр; DOM меняется, только если текст изменился. */
  setRun(view: RunView): void {
    this.lastRun = view;
    const rate = this.options.tickRateHz;
    const signature = view.rows.map((row) => row.levelId).join('|');
    if (signature !== this.runSignature) {
      this.runSignature = signature;
      this.runCells.clear();
      const rows = view.rows.map((row) => {
        const slot = this.options.slots.find((s) => s.levelId === row.levelId);
        const full = slot ? t('run.level', { n: slot.number }) : t('run.custom', { name: row.levelId });
        const time = h('b', { class: 'run__time' });
        this.runCells.set(row.levelId, time);
        return h('li', { class: 'run__row', 'data-level': row.levelId, title: full }, h('span', { class: 'run__name' }, slot ? String(slot.number) : row.levelId), time);
      });
      this.runRows.replaceChildren(...rows);
    }
    for (const row of view.rows) {
      const cell = this.runCells.get(row.levelId);
      const item = cell?.parentElement;
      if (!cell || !item) continue;
      const text = row.ticks === null ? '—' : formatRunTime(row.ticks, rate);
      if (cell.textContent !== text) cell.textContent = text;
      if (item.dataset['state'] !== row.state) item.dataset['state'] = row.state;
    }
    const total = formatRunTime(view.totalTicks, rate);
    if (this.runTotal.textContent !== total) this.runTotal.textContent = total;
    this.runBox.dataset['finished'] = String(view.finished);
    const progress = t('run.progress', { done: view.done, count: view.count });
    if (this.runProgress.textContent !== progress) this.runProgress.textContent = progress;
  }
}
