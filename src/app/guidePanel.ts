import type { GameGuideData, GuideButton, GuideScheme, GuideText } from '../brick/guide';
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
  start: 'S./P.',
};

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

/** Раскрывающийся раздел вкладки. */
function section(title: string, open: boolean, name: string, ...body: HTMLElement[]): HTMLElement {
  const details = h('details', { class: 'gsec', 'data-sec': name }, h('summary', { class: 'gsec__sum' }, title), ...body);
  if (open) details.setAttribute('open', '');
  return details;
}

const line = (text: GuideText, lang: Lang, className = 'side__text'): HTMLElement => h('p', { class: className }, text[lang]);

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

/** Все блоки описания игры (после шапки с названием и значками). */
export function guideBlocks(guide: GameGuideData, def: BrickGameDef | undefined, modes: readonly number[] | undefined, lang: Lang): HTMLElement[] {
  const blocks: HTMLElement[] = [
    line(guide.summary, lang),
    h('p', { class: 'side__text gpanel__goal' }, h('b', {}, `${t('games.goal')}: `), guide.goal[lang]),
    h(
      'ul',
      { class: 'gfacts' },
      ...guide.facts.map((fact) => h('li', {}, h('b', {}, fact.value), h('span', {}, fact.label[lang]))),
    ),
    section(t('games.sec.rules'), true, 'rules', h('ol', { class: 'grules' }, ...guide.rules.map((rule) => h('li', {}, rule[lang])))),
    section(
      t('games.sec.controls'),
      false,
      'controls',
      h(
        'dl',
        { class: 'gctl' },
        ...guide.controls.flatMap((control) => [h('dt', {}, h('kbd', { class: 'kbd' }, BUTTON_CAPS[control.button])), h('dd', {}, control.text[lang])]),
      ),
    ),
  ];
  const scoring: HTMLElement[] = [];
  if (guide.scoring.length > 0) {
    scoring.push(
      h(
        'ul',
        { class: 'gscore' },
        ...guide.scoring.map((score) => h('li', {}, h('span', {}, score.what[lang]), h('b', {}, score.points))),
      ),
    );
  }
  scoring.push(
    h('p', { class: 'side__text' }, h('b', {}, `${t('games.progress.h')}: `), guide.progression[lang]),
    h('p', { class: 'side__text' }, h('b', {}, `${t('games.lives.h')}: `), guide.lives ? guide.lives[lang] : t('games.lives.none')),
  );
  blocks.push(section(t('games.sec.scoring'), false, 'scoring', ...scoring));
  blocks.push(section(t('games.sec.schemes'), false, 'schemes', ...guide.schemes.map((scheme) => schemeEl(scheme, lang))));
  if (def) {
    const labels = modeLabels(def, modes, lang);
    if (labels.length > 0) {
      blocks.push(
        section(
          t('games.sec.modes', { n: labels.length }),
          false,
          'modes',
          h(
            'ol',
            { class: 'gmodes' },
            ...labels.map((label) => h('li', { title: label.note }, h('span', { class: 'gmodes__n' }, label.number), label.name)),
          ),
        ),
      );
    }
  }
  if (guide.assumptions.length > 0) {
    blocks.push(
      section(t('games.sec.assumptions'), false, 'assumptions', h('ul', { class: 'gassume' }, ...guide.assumptions.map((item) => h('li', {}, item[lang])))),
    );
  }
  return blocks;
}
