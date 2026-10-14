import { h } from './dom';
import { icon } from './icons';
import { onLangChange, rich, t, type MsgKey } from './i18n';
import { keyCaps, POWER_KEY, SOUND_KEY } from './help';
import type { InputHub } from './hub';

/**
 * Спрайты LCD-ячеек — те самые, что рисует игра (public/graphics/lcd): на упаковке в разделе «Figure introduction»
 * фигурки нарисованы этими же ячейками, отдельных картинок «чертей» и «драконов» там нет. Координаты — из assets.json.
 */
type SpriteName = 'hero' | 'heart' | 'block' | 'allOn';

const SPRITES: Record<SpriteName, { file: string; x: number; y: number; w: number; h: number; sheet: [number, number] }> = {
  hero: { file: 'lcd_atlas.png', x: 4, y: 4, w: 128, h: 112, sheet: [1024, 256] },
  heart: { file: 'lcd_heart.png', x: 0, y: 0, w: 128, h: 112, sheet: [128, 112] },
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
const FIGURES: readonly { name: MsgKey; picture: Picture | 'dot' }[] = [
  { name: 'info.fig.mario', picture: [[H]] },
  { name: 'info.fig.heart', picture: [['heart']] },
  { name: 'info.fig.smallDevil', picture: [[B]] },
  { name: 'info.fig.bigDevil', picture: [[B, B], [B, B]] },
  { name: 'info.fig.missile', picture: [['allOn']] },
  { name: 'info.fig.dragon', picture: [[H, H, H]] },
  { name: 'info.fig.bullet', picture: 'dot' },
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

/** Строка очков: фигурка, название и способы набрать очки (каждый — отдельной строкой «как — сколько»). */
function scoreRow(fig: HTMLElement, name: string, ways: readonly (readonly [string, number])[]): HTMLElement {
  return h(
    'li',
    { class: 'score__row' },
    fig,
    h(
      'div',
      { class: 'score__what' },
      h('b', { class: 'score__name' }, name),
      ...ways.map(([how, points]) => h('span', { class: 'score__way' }, h('span', {}, how), h('b', {}, `+${points}`))),
    ),
  );
}

/**
 * Левая панель: коротко об игре по упаковке оригинала (фигуры и враги, очки, правила, особые функции) и клавиши
 * управления. Клавиши берутся из текущих привязок — после переназначения в настройках список обновляется (`render`);
 * язык меняется на лету. Панель намеренно тусклая и без картинок кнопок корпуса, чтобы не читаться как часть игрушки.
 */
export class InfoPanel {
  private readonly root: HTMLElement;
  private readonly hub: InputHub;

  constructor(root: HTMLElement, hub: InputHub) {
    this.root = root;
    this.hub = hub;
    this.render();
    onLangChange(() => this.render());
  }

  render(): void {
    const { keyboard } = this.hub.settings;
    const keys = (...actions: Parameters<typeof keyCaps>[1][]): string[] => keyCaps(keyboard, ...actions);

    const head = h(
      'header',
      { class: 'side__top side__top--logo' },
      h('h2', { class: 'visually-hidden', id: 'info-title' }, t('info.title')),
      h(
        'div',
        { class: 'about__sticker' },
        h('img', {
          class: 'about__logo',
          src: `${import.meta.env.BASE_URL}brand/crocodile-mario-logo.png`,
          width: '1000',
          height: '443',
          alt: 'Crocodile Mario',
        }),
      ),
    );

    const about = h(
      'section',
      { class: 'side__sec', 'aria-labelledby': 'about-title' },
      h('h3', { class: 'side__h', id: 'about-title' }, t('info.journey.h')),
      h('p', { class: 'side__text' }, ...rich(t('info.journey.p'))),
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
      h('p', { class: 'side__pad' }, icon('gamepad'), h('span', {}, t('info.pad'))),
    );

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
            picture === 'dot' ? h('span', { class: 'fig__box' }, h('i', { class: 'fig__dot', 'aria-hidden': 'true' })) : figure(picture, 'fig__box'),
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
        scoreRow(figure([['heart']]), t('info.fig.heart'), [[way.eat, 100]]),
        scoreRow(figure([[B]]), t('info.fig.smallDevil'), [[way.trample, 200], [way.shoot, 20]]),
        scoreRow(figure([[B, B], [B, B]]), t('info.fig.bigDevil'), [[way.shoot, 400]]),
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

    const original = h(
      'details',
      { class: 'orig', id: 'original-device' },
      h('summary', { class: 'orig__sum' }, t('info.orig.h')),
      ...(['info.orig.pick', 'info.orig.tetris', 'info.orig.shooting', 'info.orig.special', 'info.orig.cheat'] as const).map((key) =>
        h('p', { class: 'orig__p' }, ...rich(t(key))),
      ),
    );

    const note = h('p', { class: 'side__note' }, t('info.note'));

    const open = (this.root.querySelector<HTMLDetailsElement>('#original-device')?.open ?? false) === true;
    this.root.replaceChildren(head, about, controls, figures, score, original, note);
    if (open) original.open = true;
  }
}
