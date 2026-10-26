import { applyNativeModel } from './nativeModel';
import { applyBrickGame } from './brickGameModel';
import { applySeaBody } from './seaBody';
import { h, svg } from './dom';
import { t } from './i18n';
import { keyLabel, type ToyModel } from './toys';
import type { ToyKeyId } from './toy';

/**
 * «Аппаратная часть» игрушек 2 и 3. Корпус у всех трёх один — раскладушка с шарниром, четырьмя круглыми кнопками, крестовиной,
 * большой кнопкой и динамиком, — поэтому страница строится из той же разметки (index.html), а здесь она подгоняется под модель:
 * подписи и назначение кнопок, наклейка вместо логотипа Crocodile Mario, рамка и орнамент вокруг экрана, светодиоды.
 * Форма, цвета и расположение задаются CSS по `data-model` (см. styles.css). У Crocodile Mario разметка остаётся как есть.
 */

/** Позиции круглых кнопок слева направо в `base__art`: от них зависят и подписи, и `data-key` кнопок. */
const ROUND_ARCS = ['arc-onoff', 'arc-sp', 'arc-sound', 'arc-fire'] as const;
const ROUND_X = [68, 152, 240, 324] as const;
/** Исходный порядок кнопок в разметке (как у Crocodile Mario). */
const ROUND_DEFAULT: readonly ToyKeyId[] = ['onoff', 'sp', 'sound', 'fire'];

function labelText(source: Element | null, text: string): void {
  if (source) source.textContent = text;
}

/** Вторая подпись под кнопкой (`GAME`, `PAUSE`, `ALARM ON/OFF`) — отдельным текстом поверх рисунка корпуса. */
function extraLabel(x: number, y: number, text: string): SVGTextElement {
  return svg('text', { class: 'base__label', 'data-extra': '', x: String(x), y: String(y), 'text-anchor': 'middle' }, text);
}

/** Завиток орнамента (по фото: волна с петелькой на конце), вертикальный; на правой стороне зеркалится CSS. */
function flourish(): SVGSVGElement {
  return svg(
    'svg',
    { class: 'deco__flourish', viewBox: '0 0 14 56', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M7 1C2 7 3 15 7 21C11 27 12 34 7 39C4 43 2 47 5 50C8 53 12 51 11 48C10 46 7 47 8 49', fill: 'none' }),
  );
}

/** Рамка и орнамент на лицевой панели крышки. `Часы+99`: тонкая рамка у края панели, завитки и ромбик; `Морской бой`: линия вокруг экрана. */
function deco(model: ToyModel): HTMLElement {
  const root = h('div', { class: 'lid__deco', 'aria-hidden': 'true' });
  if (model.deco === 'flourish') {
    // Линия-рамка — не сплошной прямоугольник, а как на фото: угловые скобки сверху (не доходят до светодиодов) и «ковш» снизу; по бокам линия
    // прерывается завитками и ромбиком. Размеры в cqw крышки (ширина 100, высота 97,7): ниже винтов и светодиодов, левее и правее экрана.
    root.append(
      svg(
        'svg',
        { class: 'deco__frame', viewBox: '0 0 100 97.7', 'aria-hidden': 'true', focusable: 'false' },
        svg('path', { d: 'M32 14.6H15.4V25M68 14.6H84.6V25M15.4 72.5V91H84.6V72.5', fill: 'none' }),
      ),
    );
    for (const side of ['l', 'r'] as const) {
      root.append(
        h('div', { class: 'deco__side', 'data-side': side }, flourish(), h('i', { class: 'deco__gem' }), flourish()),
      );
    }
  }
  return root;
}

export interface ToyModelRefs {
  body: HTMLElement;
  toy: HTMLElement;
  arena: HTMLElement;
  lid: HTMLElement;
  base: HTMLElement;
}

/** Применить модель игрушки к странице (до первой отрисовки: страница скрыта, пока не загрузится). Вызывается один раз при запуске. */
export function applyToyModel(model: ToyModel, refs: ToyModelRefs): void {
  const { body, toy, arena, lid, base } = refs;
  body.dataset['toy'] = model.id;
  toy.dataset['model'] = model.id;
  toy.dataset['deco'] = model.deco;
  arena.dataset['model'] = model.id;
  document.title = `${model.name} — Brick Game Online`;
  if (model.nativeDevice) { applyNativeModel(refs,model); relabelKeys(model,base); return; }
  if (model.universal) { applyBrickGame(refs, model); relabelKeys(model, base); return; }

  // ── Нижняя половина: подписи и порядок кнопок ──────────────────────────
  const art = base.querySelector('.base__art');
  const { labels } = model;
  labels.round.forEach((button, index) => {
    const arc = ROUND_ARCS[index];
    if (!arc) return;
    labelText(base.querySelector(`textPath[href="#${arc}"]`), button.top);
    if (button.bottom && model.cast !== 'sea') art?.append(extraLabel(ROUND_X[index] ?? 0, 116, button.bottom));
  });
  // Круглые кнопки лежат в разметке в порядке Crocodile Mario; у этой игрушки порядок свой — `data-key` переставляется по месту.
  const rounds = ROUND_DEFAULT.map((key) => base.querySelector<HTMLElement>(`.key--round[data-key="${key}"]`));
  rounds.forEach((button, index) => {
    const key = labels.round[index]?.key;
    if (button && key) button.dataset['key'] = key;
  });
  labelText(base.querySelector('[data-lbl="up"]'), labels.up);
  labelText(base.querySelector('[data-lbl="left"]'), labels.left);
  labelText(base.querySelector('[data-lbl="right"]'), labels.right);
  labelText(base.querySelector('[data-lbl="down"]'), labels.down);
  labelText(base.querySelector('[data-lbl="big"]'), labels.big);
  if (labels.bigBottom && model.cast !== 'sea') art?.append(extraLabel(292, 268, labels.bigBottom));
  // Доступные названия кнопок — как напечатано на корпусе и что они делают; подпись зависит от игрушки и языка, поэтому ставится отсюда, а не из словаря страницы.
  for (const button of base.querySelectorAll<HTMLElement>('.key[data-key]')) button.removeAttribute('data-i18n-attrs');
  relabelKeys(model, base);
  if (model.cast === 'sea') applySeaBody(base, model); // отливка «Морского боя» (по фото оригинала): у него же, у «168 в 1 танк» и у «Часов+99»

  // ── Подбородок: наклейка вместо логотипа Crocodile Mario ───────────────
  for (const logo of base.querySelectorAll('.base__logo')) logo.remove();
  base.append(h('img', { class: 'base__sticker', src: `${import.meta.env.BASE_URL}brand/sticker-${model.id}.webp`, width: '760', height: '420', alt: model.name }));

  // ── Крышка: рамка и орнамент, светодиоды ────────────────────────────────
  lid.querySelector('.lid__art')?.remove();
  lid.querySelector('.lid__face')?.append(deco(model));
  const leds = lid.querySelector<HTMLElement>('.lid__leds');
  if (leds) leds.hidden = !model.leds;
}

/** Подписи кнопок на текущем языке (после смены языка). */
export function relabelKeys(model: ToyModel, base: HTMLElement): void {
  for (const button of base.querySelectorAll<HTMLElement>('.key[data-key]')) {
    const id = button.dataset['key'] as ToyKeyId;
    const what = model.keyWhat[id];
    button.setAttribute('aria-label', what ? `${keyLabel(model, id)} — ${t(what)}` : keyLabel(model, id));
  }
}
