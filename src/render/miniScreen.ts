import { svg } from '../app/dom';
import { BRICK_COLS, BRICK_ROWS, CELL_BLINK, PREVIEW_COLS, PREVIEW_ROWS } from '../brick/types';
import { MINI_ICONS } from './miniIcons';
import { SEA_CUP_OUTLINE } from './seaCup';

/**
 * ЖК-экран Mini Brick Game B-S96 (SVG): матрица 10 × 20 в тонкой чёрной рамке стакана, NEXT 4 × 4 (клетки того же размера, что у поля), восемь цифр сверху,
 * двузначные SPEED и LEVEL, подписи и значки (нота, GAME OVER, GAME A/B, ROTATE, PAUSE с чашкой) и справа шкала из 13 значков. Размеры сняты с крупного фото
 * владельца (заставка «96»): единица — 1/13 шага клетки матрицы. Рамка стакана — тонкая линия вплотную к клеткам, справа и снизу толще (тень), как на фото;
 * она видна всегда, даже при выключенном устройстве; остальное — «призрак» отключённых сегментов, включённые сегменты тёмные. Что не видно на фото (LEVEL,
 * GAME A/B, ROTATE, PAUSE), размещено по допущению. Поля вокруг рисунка такие же узкие, как на фото: рамка стакана почти касается левого края стекла.
 */
export const MINI_LCD_VIEW = { x: 5, y: 19, width: 219, height: 304 } as const;

const CELL = 13;
const FIELD = { x: 11, y: 56 } as const;
/** Толщина рамки стакана по сторонам: слева и сверху тонкая, справа и снизу толще (по фото) — и зазор до клеток. */
const FRAME = { left: 0.9, top: 0.8, right: 2.4, bottom: 1.9, gap: 1 } as const;
const PREVIEW = { x: 148, y: 84, cell: CELL } as const;
const SCORE_DIGITS = 8;
/** Одна группа из восьми цифр, попеременно очки или линии. */
const SCORE_GROUP = SCORE_DIGITS;
const SCORE_BOX = { x: 112.2, y: 25, pitch: 12.2, w: 10.5, h: 23.5, t: 2.5 } as const;
const SIDE_DIGIT = { x: 151, pitch: 14.4, w: 11.5, h: 15.7, t: 2.1 } as const;
const SPEED_Y = 152.5;
const LEVEL_Y = 196;
/** Центры значков шкалы сверху вниз (по фото): колонка у правого края, один масштаб для всех. */
const SCALE = { x: 210.8, size: 0.13, centers: [98.4, 114.1, 128.1, 149, 173.5, 188.3, 204.9, 218, 234.6, 250.3, 268.6, 287.8, 304.4] } as const;
/** Наклон цифр: на фото они слегка скошены. */
const SLANT = -6;
const LABEL_SIZE = 11.7;

/** Сегменты цифры: a — верх, b — верхний правый, c — нижний правый, d — низ, e — нижний левый, f — верхний левый, g — середина. */
const DIGIT_SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

/** Что показывает экран. */
export interface MiniLcdState {
  variant?: 'A' | 'B';
  /** Питание включено: иначе виден только «призрак» сегментов и рамка стакана. */
  powered: boolean;
  /** Проверка экрана: все сегменты включены (как на фото полностью включённого экрана). */
  all?: boolean;
  /** Поле 10 × 20: 0 — погашена, 1 — горит, 2 — мигает (в фазе `blink`). */
  cells: Uint8Array | null;
  preview: Uint8Array | null;
  /** Очки в общей восьмизначной группе (справа выровнены); `null` — пусто. */
  score: number | null;
  /** Число рядов в той же группе; выбирается при linesLabel. */
  lines: number | null;
  /** Какая подпись горит у счёта: рекорд в меню, счёт в партии. */
  label: 'hi' | 'score' | null;
  /** Горит подпись LINES (на заставке она горит и без цифр). */
  linesLabel: boolean;
  /** Горит подпись NEXT. */
  next: boolean;
  speed: number | null;
  level: number | null;
  /** Сколько значков шкалы горит, снизу вверх. */
  scale: number;
  note: boolean;
  pause: boolean;
  gameOver: boolean;
  /** Фаза мигания: мигающие клетки горят, пока она истинна. */
  blink: boolean;
}

export const MINI_LCD_OFF: MiniLcdState = {
  powered: false,
  cells: null,
  preview: null,
  score: null,
  lines: null,
  label: null,
  linesLabel: false,
  next: false,
  speed: null,
  level: null,
  scale: 0,
  note: false,
  pause: false,
  gameOver: false,
  blink: false,
};

type Part = SVGElement;

/** Шестиугольный сегмент: горизонтальный или вертикальный, с заострёнными концами. */
function bar(cx: number, cy: number, length: number, thick: number, vertical: boolean): SVGPolygonElement {
  const l = length / 2;
  const t = thick / 2;
  const points = vertical
    ? [[cx, cy - l], [cx + t, cy - l + t], [cx + t, cy + l - t], [cx, cy + l], [cx - t, cy + l - t], [cx - t, cy - l + t]]
    : [[cx - l, cy], [cx - l + t, cy - t], [cx + l - t, cy - t], [cx + l, cy], [cx + l - t, cy + t], [cx - l + t, cy + t]];
  return svg('polygon', { class: 'lcd-seg', points: points.map(([x, y]) => `${x!.toFixed(2)},${y!.toFixed(2)}`).join(' ') });
}

/** Одна семисегментная цифра. */
class Digit {
  private readonly segments = new Map<string, Part>();
  private shown = '';
  constructor(parent: Element, x: number, y: number, w: number, h: number, t: number) {
    const gap = 0.7;
    const mid = y + h / 2;
    const top = y + t / 2;
    const bottom = y + h - t / 2;
    const horizontal = w - t - gap;
    const vertical = h / 2 - t / 2 - gap;
    const left = x + t / 2;
    const right = x + w - t / 2;
    const place: Record<string, SVGElement> = {
      a: bar(x + w / 2, top, horizontal, t, false),
      g: bar(x + w / 2, mid, horizontal, t, false),
      d: bar(x + w / 2, bottom, horizontal, t, false),
      f: bar(left, (top + mid) / 2, vertical, t, true),
      b: bar(right, (top + mid) / 2, vertical, t, true),
      e: bar(left, (mid + bottom) / 2, vertical, t, true),
      c: bar(right, (mid + bottom) / 2, vertical, t, true),
    };
    for (const [name, segment] of Object.entries(place)) {
      segment.dataset['seg'] = name;
      this.segments.set(name, segment);
      parent.append(segment);
    }
  }

  /** `all` включает все семь сегментов; иначе показывается цифра `ch` (пусто — погашена). */
  show(ch: string, all: boolean): void {
    const key = all ? '8' : ch;
    if (key === this.shown) return;
    this.shown = key;
    const lit = DIGIT_SEGMENTS[key] ?? '';
    for (const [name, segment] of this.segments) setOn(segment, lit.includes(name));
  }
}

function setOn(element: Element, on: boolean): void {
  if (on) element.setAttribute('data-on', '');
  else element.removeAttribute('data-on');
}

/** Подпись: узкий шрифт, ширина строки задана по фото (`textLength`), поэтому не зависит от шрифта на устройстве. */
function text(label: string, x: number, y: number, width: number, segment = true): SVGTextElement {
  return svg(
    'text',
    { class: segment ? 'lcd-seg lcd-label' : 'lcd-label', x: String(x), y: String(y), 'font-size': String(LABEL_SIZE), textLength: String(width), lengthAdjust: 'spacingAndGlyphs' },
    label,
  );
}

/** Ячейка матрицы: рамка почти во весь шаг и квадрат внутри, как у настоящего ЖК. */
function cell(x: number, y: number, size: number): SVGGElement {
  const inset = size * 0.06;
  const inner = size * 0.38;
  return svg(
    'g',
    { class: 'lcd-seg lcd-cell' },
    svg('rect', { x: (x + inset).toFixed(2), y: (y + inset).toFixed(2), width: (size - inset * 2).toFixed(2), height: (size - inset * 2).toFixed(2), 'stroke-width': '0.9', fill: 'none' }),
    svg('rect', { x: (x + (size - inner) / 2).toFixed(2), y: (y + (size - inner) / 2).toFixed(2), width: inner.toFixed(2), height: inner.toFixed(2), stroke: 'none' }),
  );
}

/** Нота «звук включён»: по фото — ножка с флажком. */
const NOTE_PATH = 'M-3.2 3.4C-4.6 3.4 -5.6 4.1 -5.6 5C-5.6 5.9 -4.7 6.6 -3.4 6.6C-2.1 6.6 -1.2 5.9 -1.2 4.9V-4.8L4.8 -3.2V-6.4L-3.2 -8.6Z';

/** Круговая стрелка ROTATE: две дуги с наконечниками. */
const ROTATE_PATH = 'M-6.4 -1A6.8 6.8 0 0 1 5 -4.8M2.8 -6.1L5.9 -5.1L5.1 -2M6.4 1A6.8 6.8 0 0 1 -5 4.8M-2.8 6.1L-5.9 5.1L-5.1 2';

export class MiniLcd {
  readonly element: SVGSVGElement;
  private readonly cells: SVGGElement[] = [];
  private readonly preview: SVGGElement[] = [];
  private readonly score: Digit[] = [];
  private readonly speed: Digit[] = [];
  private readonly level: Digit[] = [];
  private readonly icons: SVGElement[] = [];
  private readonly labels = new Map<string, Part>();
  private last = '';

  constructor() {
    const root = svg('svg', {
      viewBox: `${MINI_LCD_VIEW.x} ${MINI_LCD_VIEW.y} ${MINI_LCD_VIEW.width} ${MINI_LCD_VIEW.height}`,
      class: 'minibrick-lcd',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    this.element = root;
    const label = (name: string, node: SVGElement): void => {
      node.dataset['lcd'] = name;
      this.labels.set(name, node);
      root.append(node);
    };
    /** Цифры ЖК чуть скошены: группа наклоняется вокруг своей середины. */
    const digitsBox = (y: number, h: number): SVGGElement => {
      const box = svg('g', { class: 'lcd-digits', transform: `translate(0 ${y + h / 2}) skewX(${SLANT}) translate(0 ${-(y + h / 2)})` });
      root.append(box);
      return box;
    };

    // Рамка стакана видна всегда, даже при выключенном устройстве: тонкая линия вплотную к клеткам, справа и снизу толще.
    const innerLeft = FIELD.x - FRAME.gap;
    const innerTop = FIELD.y - FRAME.gap;
    const innerRight = FIELD.x + BRICK_COLS * CELL + FRAME.gap;
    const innerBottom = FIELD.y + BRICK_ROWS * CELL + FRAME.gap;
    root.append(
      svg('path', {
        class: 'lcd-frame',
        'fill-rule': 'evenodd',
        d:
          `M${innerLeft - FRAME.left} ${innerTop - FRAME.top}H${innerRight + FRAME.right}V${innerBottom + FRAME.bottom}H${innerLeft - FRAME.left}Z` +
          `M${innerLeft} ${innerTop}H${innerRight}V${innerBottom}H${innerLeft}Z`,
      }),
    );

    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        const node = cell(FIELD.x + col * CELL, FIELD.y + row * CELL, CELL);
        this.cells.push(node);
        root.append(node);
      }
    }

    // Верх: общая надпись HI-SCORE (SCORE используется отдельно), LINES, нота и восемь общих цифр.
    // One physical HI-SCORE legend: HI- is independently addressable; SCORE is shared.
    label('hi', text('HI-', 32, 29.5, 14));
    label('score', text('SCORE', 46, 29.5, 31));
    label('note', svg('path', { class: 'lcd-seg', d: NOTE_PATH, transform: 'translate(49.5 44.5) scale(0.62)' }));
    label('lines', text('LINES', 63.4, 49, 25.8));
    const scoreBox = digitsBox(SCORE_BOX.y, SCORE_BOX.h);
    for (let i = 0; i < SCORE_DIGITS; i++) this.score.push(new Digit(scoreBox, SCORE_BOX.x + i * SCORE_BOX.pitch, SCORE_BOX.y, SCORE_BOX.w, SCORE_BOX.h, SCORE_BOX.t));

    // Правая панель: NEXT и GAME OVER, превью, SPEED и LEVEL, GAME A/B, ROTATE, PAUSE.
    label('next', text('NEXT', 152, 74.5, 24.4));
    label('gameOver', svg('g', { class: 'lcd-seg' }, text('GAME', 186, 60.5, 25.8, false), text('OVER', 186.5, 73.5, 24.4, false)));
    for (let row = 0; row < PREVIEW_ROWS; row++) {
      for (let col = 0; col < PREVIEW_COLS; col++) {
        const node = cell(PREVIEW.x + col * PREVIEW.cell, PREVIEW.y + row * PREVIEW.cell, PREVIEW.cell);
        this.preview.push(node);
        root.append(node);
      }
    }
    label('speed', text('SPEED', 150, 146.5, 31));
    const speedBox = digitsBox(SPEED_Y, SIDE_DIGIT.h);
    for (let i = 0; i < 2; i++) this.speed.push(new Digit(speedBox, SIDE_DIGIT.x + i * SIDE_DIGIT.pitch, SPEED_Y, SIDE_DIGIT.w, SIDE_DIGIT.h, SIDE_DIGIT.t));
    label('level', text('LEVEL', 150, 190.5, 30));
    const levelBox = digitsBox(LEVEL_Y, SIDE_DIGIT.h);
    for (let i = 0; i < 2; i++) this.level.push(new Digit(levelBox, SIDE_DIGIT.x + i * SIDE_DIGIT.pitch, LEVEL_Y, SIDE_DIGIT.w, SIDE_DIGIT.h, SIDE_DIGIT.t));
    label('gameA', text('GAME A', 150, 232, 36));
    label('gameB', text('GAME B', 150, 244, 36));
    label('rotate', svg('path', { class: 'lcd-seg lcd-line', d: ROTATE_PATH, transform: 'translate(160 262)' }));
    label('rotateText', text('ROTATE', 150, 282, 38));
    label('pauseText', text('PAUSE', 150, 296, 33));
    label('cup', svg('path', { class: 'lcd-seg', d: SEA_CUP_OUTLINE, 'fill-rule': 'evenodd', transform: 'translate(166 308) scale(0.5)' }));

    // Шкала из 13 значков (сверху вниз: корона … вишни), положение каждого — по фото.
    MINI_ICONS.forEach((icon, index) => {
      const node = svg('path', {
        class: 'lcd-seg lcd-icon',
        d: icon.d,
        'fill-rule': 'evenodd',
        transform: `translate(${SCALE.x} ${SCALE.centers[index]}) scale(${SCALE.size})`,
      });
      node.dataset['icon'] = icon.name;
      this.icons.push(node);
      root.append(node);
    });
  }

  /** Показать состояние; меняются только изменившиеся сегменты. */
  render(state: MiniLcdState): void {
    const key = [
      state.powered, state.all ?? false, state.variant, state.score, state.lines, state.label, state.linesLabel, state.next, state.speed, state.level, state.scale, state.note,
      state.pause, state.gameOver, state.blink,
      state.cells ? state.cells.join('') : '-',
      state.preview ? state.preview.join('') : '-',
    ].join('|');
    if (key === this.last) return;
    this.last = key;
    const all = state.powered && (state.all ?? false);
    const on = state.powered;
    this.element.dataset['power'] = on ? 'on' : 'off';

    const field = state.cells;
    this.cells.forEach((node, index) => setOn(node, all || (on && field !== null && lit(field[index] ?? 0, state.blink))));
    const next = state.preview;
    this.preview.forEach((node, index) => setOn(node, all || (on && next !== null && lit(next[index] ?? 0, state.blink))));

    // The same eight digits show points or lines; no separate two-digit lines group.
    const value=state.linesLabel && state.lines!==null ? state.lines : state.score;
    const digits=on&&value!==null?String(Math.max(0,Math.min(99_999_999,Math.trunc(value)))):'';
    this.score.forEach((digit,index)=>{
      const place=SCORE_GROUP-1-index;
      digit.show(digits.length>place?digits[digits.length-1-place]!:'',all);
    });
    const pair = (digits: Digit[], value: number | null): void => {
      const shown = on && value !== null ? Math.max(0, Math.min(19, Math.trunc(value))) : null;
      digits[0]!.show(shown !== null && shown >= 10 ? String(Math.floor(shown / 10)) : '', all);
      digits[1]!.show(shown !== null ? String(shown % 10) : '', all);
    };
    pair(this.speed, state.speed);
    pair(this.level, state.level);

    const flags: Record<string, boolean> = {
      hi: on && state.label === 'hi' && !state.linesLabel,
      score: on && state.label !== null && !state.linesLabel,
      lines: on && state.linesLabel,
      note: on && state.note,
      next: on && state.next,
      gameOver: on && state.gameOver,
      speed: on && state.speed !== null,
      level: on && state.level !== null,
      gameA: on && state.variant==='A',
      gameB: on && state.variant==='B',
      rotate: false,
      rotateText: false,
      pauseText: on && state.pause,
      cup: on && state.pause,
    };
    for (const [name, node] of this.labels) setOn(node, all || (flags[name] ?? false));
    this.icons.forEach((node, index) => setOn(node, all || (on && index >= MINI_ICONS.length - state.scale)));
  }
}

const lit = (value: number, blink: boolean): boolean => value === 1 || (value === CELL_BLINK && blink);

/** Выключенный экран: рамка стакана и призрак сегментов (миниатюры карусели и выключенная игрушка). */
export function miniLcdIdle(): SVGSVGElement {
  const lcd = new MiniLcd();
  lcd.render(MINI_LCD_OFF);
  return lcd.element;
}
