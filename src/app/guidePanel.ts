import type { GameGuideData, GuideButton, GuideControl, GuideScheme } from '../brick/guide';
import type { BrickGameDef } from '../brick/types';
import type { Lang } from '../input/lang';
import { h } from './dom';
import { t } from './i18n';

/**
 * Описание игры во вкладке левой панели «по факту реализации» (`src/brick/guides`): цель, факты, правила, кнопки, очки, схемы клетками, варианты и допущения.
 * Правила открыты, остальное — под заголовками-раскрывашками, чтобы вкладка помещалась в панель без прокрутки всей панели (внутри вкладки прокрутка есть).
 * Только построение DOM из данных: тексты берутся по языку, числа и правила — те, что написал код игры.
 */

/** Подписи кнопок корпуса, как на устройстве. */
export const BUTTON_CAPS: Readonly<Record<GuideButton, string>> = {
  left: 'LEFT',
  right: 'RIGHT',
  up: 'UP',
  down: 'DOWN',
  rotate: 'ROTATE',
  fire: 'FIRE',
  start: 'S./P.',
  arrows: '← ↑ ↓ →',
  sides: '← →',
  vertical: '↑ ↓',
};

/** Подпись строки управления: кнопки через «+», затем пометки «удержание» и «клавиатура» (у кнопок, которых на корпусе нет). */
export function controlCap(control: GuideControl): string {
  const caps = [control.button, ...(control.with ?? [])].map((button) => BUTTON_CAPS[button]).join(' + ');
  const marks = [control.hold ? t('games.ctl.hold') : '', control.keyboardOnly ? t('games.ctl.keys') : ''].filter(Boolean);
  return marks.length > 0 ? `${caps} · ${marks.join(', ')}` : caps;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Схема из клеток: `#` горит, `*` мигает, `.` пусто. */
export function schemeEl(scheme: GuideScheme, lang: Lang): HTMLElement {
  const width = scheme.cells[0]?.length ?? 0;
  const grid = h('div', { class: 'gscheme__grid', style: `--cols:${width}`, role: 'img', 'aria-label': scheme.caption[lang] });
  for (const row of scheme.cells) {
    for (const value of row) grid.append(h('i', { 'data-v': value }));
  }
  return h('figure', { class: 'gscheme' }, grid, h('figcaption', { class: 'gscheme__cap' }, scheme.caption[lang]));
}

/**
 * Названия вариантов, которые показывает консоль: `modes` — индексы в списке игры (без них — все реализованные); номер на экране консоли — позиция + 1.
 */
export function modeLabels(def: BrickGameDef, modes: readonly number[] | undefined, lang: Lang): { number: string; name: string; note: string }[] {
  const indices = modes ?? def.modes.map((_, index) => index);
  return indices.map((index, position) => {
    const mode = def.modes[index];
    return { number: pad2(position + 1), name: mode?.name[lang] ?? '', note: mode?.note ?? '' };
  });
}

/** Always-visible essentials, with small LCD illustrations; development notes live in Help. */
export function compactGuide(guide: GameGuideData, lang: Lang): HTMLElement[] {
  const schemes = guide.schemes.slice(0, 1).map((scheme) => schemeEl(scheme, lang));
  return [
    h('p', { class: 'gtext gpanel__goal' }, guide.goal[lang]),
    h('div', { class: 'gquick__schemes' }, ...schemes),
    h('ul', { class: 'grules' }, ...guide.rules.slice(0, 3).map((rule) => h('li', {}, rule[lang]))),
    h('dl', { class: 'gctl' }, ...guide.controls.filter((control) => control.button !== 'start').flatMap((control) => [h('dt', {}, h('kbd', { class: 'kbd' }, controlCap(control))), h('dd', {}, control.text[lang])])),
  ];
}
