import { svg } from '../app/dom';
import { BRICK_COLS, BRICK_ROWS, PREVIEW_COLS, PREVIEW_ROWS } from '../brick/types';
import { MINI_ICONS } from './miniIcons';
import { SEA_CUP_OUTLINE } from './seaCup';
import { cell, Digit, lit, setOn, text, type LcdView, type MiniLcdState } from './miniScreen';

/**
 * ЖК-экран FM-38 (SVG) — раскладка снята с фото владельца (511 × 688): координаты ниже — пиксели этого фото, один ход клетки поля — 28,4 (см. `docs/devices/fm38.md`).
 *
 * Что видно на фото и воспроизведено: матрица 10 × 20 в рамке стакана (сверху и слева тонкая линия, справа толстая, снизу тонкая — все линии одинарные), NEXT 4 × 4 с клетками
 * того же размера, подпись LINES слева от ряда из восьми цифр, где горят две средние (счёт рядов), «GAME OVER» двумя строками справа вверху, SPEED с одной цифрой под
 * подписью, затем цифра LEVEL и подпись LEVEL **под** ней, GAME B, ROTATE и значок звука под ними, справа шкала из 13 значков. Чего на фото не видно (погашенные сегменты:
 * GAME A, PAUSE и чашка) — размещено по допущению рядом с видимыми подписями.
 */
/** Стекло: левый и нижний края совпадают с линиями рамки стакана, как на фото, где они лежат на краю стекла. */
export const FM38_LCD_VIEW = { x: 18, y: 17, width: 501, height: 660.5 } as const;

const CELL = 28.4;
const FIELD = { x: 27.3, y: 103 } as const;
const PREVIEW = { x: 326.8, y: 166.3 } as const;
/** Рамка стакана: внешняя и внутренняя границы (линии одинарные: слева 2,5, сверху 3, справа 4,5, снизу 3,5). */
const FRAME = { left: 18, top: 98.5, right: 316, bottom: 677.5, thin: 2.5, topThick: 3, rightThick: 4.5, bottomThick: 3.5 } as const;
/** Восемь цифр верхнего ряда: горят средние две (рядов не больше 99). */
const ROW = { x: 212, pitch: 31.5, y: 32, w: 24, h: 52, t: 5.6, lit: [4, 5] } as const;
/** Цифры сбоку: одна «единицы» и «десятки» слева от неё (на фото горит только единица). */
const SIDE = { w: 20.5, h: 39, t: 4.4, pitch: 29 } as const;
const SPEED = { x: 376, y: 334 } as const;
const LEVEL = { x: 371, y: 385.5 } as const;
const SLANT = -7;
const FONT = 30;
/** Центры значков шкалы сверху вниз (по фото): колонка у правого края. */
const SCALE = { x: 463, size: 0.34, centers: [202.5, 240, 287.5, 327, 362, 402, 440, 474, 509, 547, 587, 627, 663] } as const;
/** Значок звука на фото — косой мазок с утолщением слева внизу (нота, лежащая на боку). */
const NOTE_SWOOSH = 'M-15 4C-15 -1 -8 -3 -3 -1.2L13 -8L16 -5.8L2 4.2C-2 8 -11 9 -15 4Z';

export class Fm38Lcd implements LcdView {
  readonly element: SVGSVGElement;
  private readonly cells: SVGGElement[] = [];
  private readonly preview: SVGGElement[] = [];
  private readonly row: Digit[] = [];
  private readonly speed: Digit[] = [];
  private readonly level: Digit[] = [];
  private readonly icons: SVGElement[] = [];
  private readonly labels = new Map<string, SVGElement>();
  private last = '';

  constructor() {
    const root = svg('svg', {
      viewBox: `${FM38_LCD_VIEW.x} ${FM38_LCD_VIEW.y} ${FM38_LCD_VIEW.width} ${FM38_LCD_VIEW.height}`,
      class: 'minibrick-lcd fm38-lcd',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    this.element = root;
    const label = (name: string, node: SVGElement): void => {
      node.dataset['lcd'] = name;
      this.labels.set(name, node);
      root.append(node);
    };
    /** Цифры ЖК слегка скошены: группа наклоняется вокруг своей середины. */
    const digitsBox = (y: number, h: number): SVGGElement => {
      const box = svg('g', { class: 'lcd-digits', transform: `translate(0 ${y + h / 2}) skewX(${SLANT}) translate(0 ${-(y + h / 2)})` });
      root.append(box);
      return box;
    };

    // Рамка стакана видна всегда, даже при выключенном устройстве; все четыре линии — части одного контура, двойной обводки нет.
    root.append(
      svg('path', {
        class: 'lcd-frame',
        'fill-rule': 'evenodd',
        d:
          `M${FRAME.left} ${FRAME.top}H${FRAME.right}V${FRAME.bottom}H${FRAME.left}Z` +
          `M${FRAME.left + FRAME.thin} ${FRAME.top + FRAME.topThick}H${FRAME.right - FRAME.rightThick}V${FRAME.bottom - FRAME.bottomThick}H${FRAME.left + FRAME.thin}Z`,
      }),
    );
    for (let y = 0; y < BRICK_ROWS; y++) {
      for (let x = 0; x < BRICK_COLS; x++) {
        const node = cell(FIELD.x + x * CELL, FIELD.y + y * CELL, CELL);
        this.cells.push(node);
        root.append(node);
      }
    }

    // Верх: LINES и восемь цифр.
    label('lines', text('LINES', 142, 81, 66, true, FONT));
    const rowBox = digitsBox(ROW.y, ROW.h);
    for (let i = 0; i < 8; i++) this.row.push(new Digit(rowBox, ROW.x + i * ROW.pitch, ROW.y, ROW.w, ROW.h, ROW.t, 1.5));

    // Правая панель: NEXT и GAME OVER, превью 4 × 4, SPEED, LEVEL, GAME A/B, ROTATE, звук, PAUSE.
    label('next', text('NEXT', 334, 153, 58, true, FONT));
    label('gameOver', svg('g', { class: 'lcd-seg' }, text('GAME', 409, 122, 70, false, FONT), text('OVER', 410, 151, 65, false, FONT)));
    for (let y = 0; y < PREVIEW_ROWS; y++) {
      for (let x = 0; x < PREVIEW_COLS; x++) {
        const node = cell(PREVIEW.x + x * CELL, PREVIEW.y + y * CELL, CELL);
        this.preview.push(node);
        root.append(node);
      }
    }
    label('speed', text('SPEED', 337, 319, 82, true, FONT));
    const speedBox = digitsBox(SPEED.y, SIDE.h);
    for (let i = 0; i < 2; i++) this.speed.push(new Digit(speedBox, SPEED.x - SIDE.pitch + i * SIDE.pitch, SPEED.y, SIDE.w, SIDE.h, SIDE.t, 1.3));
    const levelBox = digitsBox(LEVEL.y, SIDE.h);
    for (let i = 0; i < 2; i++) this.level.push(new Digit(levelBox, LEVEL.x - SIDE.pitch + i * SIDE.pitch, LEVEL.y, SIDE.w, SIDE.h, SIDE.t, 1.3));
    label('level', text('LEVEL', 335, 456, 77, true, FONT));
    label('gameA', text('GAME A', 332, 487, 93, true, FONT));
    label('gameB', text('GAME B', 332, 517, 93, true, FONT));
    label('rotateText', text('ROTATE', 331, 547, 91, true, FONT));
    label('note', svg('path', { class: 'lcd-seg', d: NOTE_SWOOSH, transform: 'translate(388 578)' }));
    label('pauseText', text('PAUSE', 336, 622, 78, true, FONT));
    label('cup', svg('path', { class: 'lcd-seg', d: SEA_CUP_OUTLINE, 'fill-rule': 'evenodd', transform: 'translate(376 656) scale(1.05)' }));

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
    root.dataset['ghost'] = 'on';
  }

  /** Призрак погашенных сегментов (настройка «Сегменты экрана»). */
  setGhost(on: boolean): void {
    this.element.dataset['ghost'] = on ? 'on' : 'off';
  }

  render(state: MiniLcdState): void {
    const key = [
      state.powered, state.all ?? false, state.variant, state.lines, state.linesLabel, state.next, state.speed, state.level, state.scale, state.note, state.pause, state.gameOver,
      state.rotate ?? false, state.blink, state.cells ? state.cells.join('') : '-', state.preview ? state.preview.join('') : '-',
    ].join('|');
    if (key === this.last) return;
    this.last = key;
    const on = state.powered;
    const all = on && (state.all ?? false);
    this.element.dataset['power'] = on ? 'on' : 'off';

    const field = state.cells;
    this.cells.forEach((node, index) => setOn(node, all || (on && field !== null && lit(field[index] ?? 0, state.blink))));
    const next = state.preview;
    this.preview.forEach((node, index) => setOn(node, all || (on && next !== null && lit(next[index] ?? 0, state.blink))));

    // Счёт рядов — в двух средних цифрах ряда; остальные цифры погашены (у FM-38 очков на экране нет).
    const lines = on && state.linesLabel && state.lines !== null ? String(Math.max(0, Math.trunc(state.lines)) % 100).padStart(2, '0') : '';
    this.row.forEach((digit, index) => {
      const slot = ROW.lit.indexOf(index as 4 | 5);
      digit.show(slot >= 0 && lines !== '' ? lines[slot]! : '', all);
    });
    const pair = (digits: Digit[], value: number | null): void => {
      const shown = on && value !== null ? Math.max(0, Math.min(19, Math.trunc(value))) : null;
      digits[0]!.show(shown !== null && shown >= 10 ? String(Math.floor(shown / 10)) : '', all);
      digits[1]!.show(shown !== null ? String(shown % 10) : '', all);
    };
    pair(this.speed, state.speed);
    pair(this.level, state.level);

    const flags: Record<string, boolean> = {
      lines: on && state.linesLabel,
      note: on && state.note,
      next: on && state.next,
      gameOver: on && state.gameOver,
      speed: on && state.speed !== null,
      level: on && state.level !== null,
      gameA: on && state.variant === 'A',
      gameB: on && state.variant === 'B',
      rotateText: on && (state.rotate ?? false),
      pauseText: on && state.pause,
      cup: on && state.pause,
    };
    for (const [name, node] of this.labels) setOn(node, all || (flags[name] ?? false));
    this.icons.forEach((node, index) => setOn(node, all || (on && index >= MINI_ICONS.length - state.scale)));
  }
}
