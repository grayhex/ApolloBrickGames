import { keyCaps, POWER_KEY, SOUND_KEY } from './help';
import { h } from './dom';
import { icon } from './icons';
import type { InputHub } from './hub';

/**
 * Спрайты LCD-ячеек — те самые, что рисует игра (public/graphics/lcd): на упаковке в разделе «Figure introduction»
 * фигурки нарисованы этими же ячейками, отдельных картинок «чертей» и «драконов» там нет. Координаты — из assets.json.
 */
type SpriteName = 'heart' | 'block';

const SPRITES: Record<SpriteName, { file: string; x: number; y: number; w: number; h: number; sheet: [number, number] }> = {
  heart: { file: 'lcd_heart.png', x: 0, y: 0, w: 128, h: 112, sheet: [128, 112] },
  block: { file: 'lcd_atlas.png', x: 136, y: 4, w: 128, h: 112, sheet: [1024, 256] },
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

/** Фигурка в плитке: одна ячейка или группа ячеек (как на упаковке — большой враг нарисован четырьмя блоками). */
function figure(name: SpriteName, columns: number, rows: number): HTMLElement {
  const scale = 0.26 / Math.max(columns, rows);
  const box = h('span', { class: 'score__fig', style: `--fig-cols:${columns}` });
  for (let i = 0; i < columns * rows; i++) box.append(sprite(name, scale));
  return box;
}

const cap = (label: string): HTMLElement => h('kbd', { class: 'kbd' }, label);

/** Строка схемы управления: что делает и какие клавиши (по текущим привязкам; одно действие — одна или несколько клавиш). */
function keyRow(label: string, ...groups: string[][]): HTMLElement {
  const caps = groups.flatMap((group, index) => [...(index > 0 ? [h('span', { class: 'keys__sep' }, '·')] : []), ...group.map(cap)]);
  return h('li', { class: 'keys__row' }, h('span', { class: 'keys__what' }, label), h('span', { class: 'keys__caps' }, ...(caps.length === 0 ? [h('span', { class: 'keys__none' }, 'не назначено')] : caps)));
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
 * Левая панель: коротко об игре по упаковке оригинала и клавиши управления. Клавиши берутся из текущих привязок —
 * после переназначения в настройках список обновляется (`render`). Панель намеренно тусклая и без картинок кнопок
 * корпуса, чтобы не читаться как часть игрушки.
 */
export class InfoPanel {
  private readonly root: HTMLElement;
  private readonly hub: InputHub;

  constructor(root: HTMLElement, hub: InputHub) {
    this.root = root;
    this.hub = hub;
    this.render();
  }

  render(): void {
    const { keyboard } = this.hub.settings;
    const keys = (...actions: Parameters<typeof keyCaps>[1][]): string[] => keyCaps(keyboard, ...actions);

    const head = h(
      'header',
      { class: 'side__top side__top--logo' },
      h('h2', { class: 'visually-hidden', id: 'info-title' }, 'Об игре'),
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
      h('h3', { class: 'side__h', id: 'about-title' }, 'Путешествие Марио'),
      h(
        'p',
        { class: 'side__text' },
        'Электронная LCD-игра Apollo: на одном устройстве ',
        h('b', {}, 'MARIO'),
        ' (9 уровней), ',
        h('b', {}, 'TETRIS'),
        ' (99) и ',
        h('b', {}, 'SHOOTING'),
        ' (1). Здесь — режим MARIO.',
      ),
      h(
        'ul',
        { class: 'facts', 'aria-label': 'Правила по упаковке' },
        h('li', {}, h('b', {}, '4'), h('span', {}, 'жизни')),
        h('li', {}, h('b', {}, '400'), h('span', {}, 'секунд')),
        h('li', {}, h('b', {}, '9'), h('span', {}, 'уровней')),
      ),
    );

    const controls = h(
      'section',
      { class: 'side__sec', 'aria-labelledby': 'keys-title' },
      h('h3', { class: 'side__h', id: 'keys-title' }, 'Управление'),
      h(
        'ul',
        { class: 'keys', id: 'keymap' },
        keyRow('Ходьба', keys('left'), keys('right')),
        keyRow('Прыжок', keys('jump')),
        keyRow('Огонь', keys('fire')),
        keyRow('Старт и пауза', keys('start', 'pause')),
        keyRow('Питание', [POWER_KEY]),
        keyRow('Звук', [SOUND_KEY]),
      ),
      h(
        'p',
        { class: 'side__pad' },
        icon('gamepad'),
        h('span', {}, 'Геймпад: крестовина или стик — шаги, нижняя кнопка — прыжок, левая — огонь, Start — пауза.'),
      ),
    );

    const score = h(
      'section',
      { class: 'side__sec', 'aria-labelledby': 'score-title' },
      h('h3', { class: 'side__h', id: 'score-title' }, 'Очки'),
      h(
        'ul',
        { class: 'score' },
        scoreRow(figure('heart', 1, 1), 'Сердце', [['съесть', 100]]),
        scoreRow(figure('block', 1, 1), 'Малый враг', [['растоптать', 200], ['застрелить', 20]]),
        scoreRow(figure('block', 2, 2), 'Большой враг', [['застрелить', 400]]),
      ),
      h('p', { class: 'side__cap' }, 'Жизнь теряется'),
      h(
        'ul',
        { class: 'hazards', 'aria-label': 'Опасности' },
        ...['падение в реку', 'враг', 'ракета', 'железные ворота'].map((name) => h('li', { class: 'hazard' }, name)),
      ),
    );

    const note = h(
      'p',
      { class: 'side__note' },
      'Данные — с упаковки оригинала. Правила в этой версии приблизительные и уточняются; TETRIS и SHOOTING в проект не входят.',
    );

    this.root.replaceChildren(head, about, controls, score, note);
  }
}
