/**
 * Описание игры для левой панели («вкладка» игры консоли): что реализовано на самом деле — цель, правила, кнопки, очки, схемы. Пишется по коду игры,
 * а не по памяти: числа и правила должны совпадать с тем, что делает игра. Допущения (то, чего нет у донора или о чём у Apollo ничего не известно)
 * вынесены в отдельный список `assumptions` и должны быть короткими и честными. Названия и пометки вариантов берутся из `BrickGameDef.modes`.
 * Чистые данные без DOM: панель рисует схемы клетками, тексты берёт по языку интерфейса.
 */
import { BRICK_TICK_HZ, type BrickAction } from './types';

/** Строка на двух языках интерфейса. */
export interface GuideText {
  ru: string;
  en: string;
}

/** Короткая запись строки на двух языках: `t('Цель', 'Goal')`. */
export const gt = (ru: string, en: string): GuideText => ({ ru, en });

/** Время в тактах как секунды для текста: «1,35 с» / «1.35 s» (запятая в русском тексте). */
export function secondsText(ticks: number, digits = 2): GuideText {
  const value = (ticks / BRICK_TICK_HZ).toFixed(digits);
  return gt(`${value.replace('.', ',')} с`, `${value} s`);
}

/** Пределы длины текстов (знаков на язык): описание должно помещаться во вкладку левой панели. */
export const GUIDE_LIMITS = {
  summary: 240,
  goal: 140,
  rule: 150,
  control: 90,
  scoreWhat: 70,
  scorePoints: 24,
  factLabel: 40,
  factValue: 12,
  progression: 200,
  lives: 200,
  caption: 80,
  assumption: 160,
  rulesMax: 8,
  controlsMax: 6,
  scoringMax: 8,
  assumptionsMax: 5,
} as const;

/**
 * Схема-иллюстрация из клеток: строки одинаковой длины, `#` — клетка горит, `*` — мигает, `.` — пусто (в схеме есть и фрагмент поля, и целое поле 10 × 20).
 * Рисуется теми же ячейками, что и экран игрушки; подпись — одна короткая фраза о том, что на схеме.
 */
export interface GuideScheme {
  cells: readonly string[];
  caption: GuideText;
}

/**
 * Кнопка (или группа кнопок), о которой говорит строка управления: четыре стрелки по отдельности и группами (`arrows` — все четыре, `sides` — влево и вправо,
 * `vertical` — вверх и вниз), ROTATE, клавиша «огонь» (`fire`: на корпусе её нет, действие доступно лишь напрямую в движке; оболочка фильтрует его; RESET — выход в меню) и S./P.
 */
export type GuideButton = 'left' | 'right' | 'up' | 'down' | 'rotate' | 'fire' | 'start' | 'arrows' | 'sides' | 'vertical';

/** Какие игровые действия покрывает строка управления с такой кнопкой (`start` — команда оболочки, игре не передаётся). */
export const BUTTON_ACTIONS: Readonly<Record<GuideButton, readonly BrickAction[]>> = {
  left: ['left'],
  right: ['right'],
  up: ['up'],
  down: ['down'],
  rotate: ['rotate'],
  fire: ['fire'],
  start: [],
  arrows: ['left', 'right', 'up', 'down'],
  sides: ['left', 'right'],
  vertical: ['up', 'down'],
};

export interface GuideControl {
  button: GuideButton;
  /** Что кнопка делает в этой игре (в игре, не в меню). */
  text: GuideText;
  /** Кнопки, которые нужно держать вместе с этой (сочетание, например ROTATE вместе с DOWN). */
  with?: readonly GuideButton[];
  /** Действие срабатывает при удержании кнопки, а не при нажатии. */
  hold?: boolean;
  /** Действие движка без кнопки на корпусе: оболочка не показывает его и не передаёт игре. */
  keyboardOnly?: boolean;
}

/** Действия игры, которые описывает хотя бы одна строка управления. */
export function guidedActions(controls: readonly GuideControl[]): Set<BrickAction> {
  const covered = new Set<BrickAction>();
  for (const control of controls) for (const button of [control.button, ...(control.with ?? [])]) for (const action of BUTTON_ACTIONS[button]) covered.add(action);
  return covered;
}

export interface GuideScore {
  what: GuideText;
  /** Очки как строка: `+100`, `+1 за кирпич`, `×2`. */
  points: string;
}

export interface GuideFact {
  /** Число или короткая величина: `10×20`, `4`, `0,3 с`. */
  value: string;
  label: GuideText;
}

export interface GameGuideData {
  /** Что за игра — одна-две фразы. */
  summary: GuideText;
  /** Цель игры — одна фраза. */
  goal: GuideText;
  /** Как устроена игра: 4–8 коротких пунктов, только то, что реализовано. */
  rules: readonly GuideText[];
  /** Что делают кнопки в игре. */
  controls: readonly GuideControl[];
  /** Очки — как в коде. Пустой список, если очков нет. */
  scoring: readonly GuideScore[];
  /** 2–4 числа: жизни, шаг, размер, добавочная жизнь и т. п. */
  facts: readonly GuideFact[];
  /** Как растут скорость и уровень. */
  progression: GuideText;
  /** Жизни и добавочные жизни; `null`, если жизней нет. */
  lives: GuideText | null;
  /** 1–3 схемы-иллюстрации. */
  schemes: readonly GuideScheme[];
  /** Допущения (чего нет у донора или не установлено у Apollo) — только они, коротко. */
  assumptions: readonly GuideText[];
}

/** Проверка описания: что схемы прямоугольные, из допустимых символов, тексты не пустые и не длиннее пределов `GUIDE_LIMITS`. Возвращает список проблем (пустой — всё хорошо). */
export function guideProblems(guide: GameGuideData): string[] {
  const problems: string[] = [];
  const text = (name: string, value: GuideText | null, limit?: number): void => {
    if (value === null) return;
    if (value.ru.trim() === '') problems.push(`${name}: пустой русский текст`);
    if (value.en.trim() === '') problems.push(`${name}: пустой английский текст`);
    if (limit !== undefined) {
      if (value.ru.length > limit) problems.push(`${name}: русский текст длиннее ${limit} знаков (${value.ru.length})`);
      if (value.en.length > limit) problems.push(`${name}: английский текст длиннее ${limit} знаков (${value.en.length})`);
    }
  };
  text('summary', guide.summary, GUIDE_LIMITS.summary);
  text('goal', guide.goal, GUIDE_LIMITS.goal);
  text('progression', guide.progression, GUIDE_LIMITS.progression);
  text('lives', guide.lives, GUIDE_LIMITS.lives);
  guide.rules.forEach((rule, i) => text(`rules[${i}]`, rule, GUIDE_LIMITS.rule));
  guide.controls.forEach((control, i) => text(`controls[${i}]`, control.text, GUIDE_LIMITS.control));
  guide.scoring.forEach((score, i) => {
    text(`scoring[${i}]`, score.what, GUIDE_LIMITS.scoreWhat);
    if (score.points.trim() === '') problems.push(`scoring[${i}]: пустые очки`);
    if (score.points.length > GUIDE_LIMITS.scorePoints) problems.push(`scoring[${i}]: очки длиннее ${GUIDE_LIMITS.scorePoints} знаков`);
  });
  guide.facts.forEach((fact, i) => {
    text(`facts[${i}]`, fact.label, GUIDE_LIMITS.factLabel);
    if (fact.value.trim() === '') problems.push(`facts[${i}]: пустое значение`);
    if (fact.value.length > GUIDE_LIMITS.factValue) problems.push(`facts[${i}]: значение длиннее ${GUIDE_LIMITS.factValue} знаков`);
  });
  guide.assumptions.forEach((assumption, i) => text(`assumptions[${i}]`, assumption, GUIDE_LIMITS.assumption));
  if (guide.rules.length < 3) problems.push('rules: меньше трёх пунктов');
  if (guide.rules.length > GUIDE_LIMITS.rulesMax) problems.push(`rules: больше ${GUIDE_LIMITS.rulesMax} пунктов`);
  if (guide.controls.length === 0) problems.push('controls: нет ни одной кнопки');
  if (guide.controls.length > GUIDE_LIMITS.controlsMax) problems.push(`controls: больше ${GUIDE_LIMITS.controlsMax} кнопок`);
  if (guide.scoring.length > GUIDE_LIMITS.scoringMax) problems.push(`scoring: больше ${GUIDE_LIMITS.scoringMax} строк`);
  if (guide.assumptions.length > GUIDE_LIMITS.assumptionsMax) problems.push(`assumptions: больше ${GUIDE_LIMITS.assumptionsMax} пунктов`);
  if (guide.facts.length < 2 || guide.facts.length > 4) problems.push('facts: должно быть от двух до четырёх');
  if (guide.schemes.length < 1 || guide.schemes.length > 3) problems.push('schemes: должно быть от одной до трёх');
  guide.schemes.forEach((scheme, i) => {
    text(`schemes[${i}]`, scheme.caption, GUIDE_LIMITS.caption);
    const width = scheme.cells[0]?.length ?? 0;
    if (scheme.cells.length === 0 || width === 0) problems.push(`schemes[${i}]: пустая схема`);
    scheme.cells.forEach((row, y) => {
      if (row.length !== width) problems.push(`schemes[${i}]: строка ${y} другой длины`);
      if (!/^[#*.]*$/.test(row)) problems.push(`schemes[${i}]: строка ${y} с недопустимым символом`);
    });
    if (scheme.cells.length > 20 || width > 10) problems.push(`schemes[${i}]: больше поля 10 × 20`);
  });
  return problems;
}
