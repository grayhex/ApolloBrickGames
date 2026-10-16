/**
 * Описание игры для левой панели («вкладка» игры консоли): что реализовано на самом деле — цель, правила, кнопки, очки, схемы. Пишется по коду игры,
 * а не по памяти: числа и правила должны совпадать с тем, что делает игра. Допущения (то, чего нет у донора или о чём у Apollo ничего не известно)
 * вынесены в отдельный список `assumptions` и должны быть короткими и честными. Названия и пометки вариантов берутся из `BrickGameDef.modes`.
 * Чистые данные без DOM: панель рисует схемы клетками, тексты берёт по языку интерфейса.
 */

/** Строка на двух языках интерфейса. */
export interface GuideText {
  ru: string;
  en: string;
}

/**
 * Схема-иллюстрация из клеток: строки одинаковой длины, `#` — клетка горит, `*` — мигает, `.` — пусто (в схеме есть и фрагмент поля, и целое поле 10 × 20).
 * Рисуется теми же ячейками, что и экран игрушки; подпись — одна короткая фраза о том, что на схеме.
 */
export interface GuideScheme {
  cells: readonly string[];
  caption: GuideText;
}

/** Кнопка корпуса, о которой говорит строка управления. */
export type GuideButton = 'left' | 'right' | 'up' | 'down' | 'rotate' | 'start';

export interface GuideControl {
  button: GuideButton;
  /** Что кнопка делает в этой игре (в игре, не в меню). */
  text: GuideText;
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

/** Проверка описания: что схемы прямоугольные, из допустимых символов, а тексты не пустые. Возвращает список проблем (пустой — всё хорошо). */
export function guideProblems(guide: GameGuideData): string[] {
  const problems: string[] = [];
  const text = (name: string, value: GuideText | null): void => {
    if (value === null) return;
    if (value.ru.trim() === '') problems.push(`${name}: пустой русский текст`);
    if (value.en.trim() === '') problems.push(`${name}: пустой английский текст`);
  };
  text('summary', guide.summary);
  text('goal', guide.goal);
  text('progression', guide.progression);
  text('lives', guide.lives);
  guide.rules.forEach((rule, i) => text(`rules[${i}]`, rule));
  guide.controls.forEach((control, i) => text(`controls[${i}]`, control.text));
  guide.scoring.forEach((score, i) => {
    text(`scoring[${i}]`, score.what);
    if (score.points.trim() === '') problems.push(`scoring[${i}]: пустые очки`);
  });
  guide.facts.forEach((fact, i) => {
    text(`facts[${i}]`, fact.label);
    if (fact.value.trim() === '') problems.push(`facts[${i}]: пустое значение`);
  });
  guide.assumptions.forEach((assumption, i) => text(`assumptions[${i}]`, assumption));
  if (guide.rules.length < 3) problems.push('rules: меньше трёх пунктов');
  if (guide.facts.length < 2 || guide.facts.length > 4) problems.push('facts: должно быть от двух до четырёх');
  if (guide.schemes.length < 1 || guide.schemes.length > 3) problems.push('schemes: должно быть от одной до трёх');
  guide.schemes.forEach((scheme, i) => {
    text(`schemes[${i}]`, scheme.caption);
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
