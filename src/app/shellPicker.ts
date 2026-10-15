import { SHELLS, type Shell } from '../input/settings';
import { h, svg } from './dom';
import { t } from './i18n';
import type { ToyId } from './toys';

/** Подпись цвета корпуса на текущем языке. */
export const shellLabel = (shell: Shell): string => t(`shell.${shell}`);

let pickerSerial = 0;

/**
 * Миниатюра игрушки в закрытом виде — как на фотографии оригинала: скруглённый корпус, шов посередине, на верхней
 * половине эмблема Apollo (красная шляпа, крокодил), на нижней — логотип «Crocodile Mario» с фигуркой. Цвет корпуса и
 * печати берётся из палитры `[data-shell]` (CSS-переменные), поэтому совпадает с настоящей игрушкой.
 */
export function miniConsole(shell: Shell, serial: number, toy: ToyId = 'mario'): SVGSVGElement {
  const sheen = `sheen-${serial}-${shell}`;
  // Как на корпусе игрушки: на синем и красном — белая печать, на жёлтом и белом — красная.
  const logo = shell === 'blue' || shell === 'red' ? 'crocodile-mario-logo-white.png' : 'crocodile-mario-logo.png';
  // На подбородке — то, что наклеено на игрушку: у «Часов+99» и «Морского боя» это цветная наклейка, у Mario — логотип.
  const chin =
    toy === 'mario'
      ? svg('image', { href: `${import.meta.env.BASE_URL}brand/${logo}`, x: '5.5', y: '38.6', width: '33', height: '14.6', preserveAspectRatio: 'xMidYMid meet' })
      : svg('image', { href: `${import.meta.env.BASE_URL}brand/sticker-${toy}.webp`, x: '5', y: '39.4', width: '34', height: '19', preserveAspectRatio: 'xMidYMid meet' });
  const root = svg('svg', { viewBox: '0 0 44 62', class: 'mini', 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg(
      'defs',
      {},
      svg(
        'linearGradient',
        { id: sheen, x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.4' }),
        svg('stop', { offset: '.5', 'stop-color': '#fff', 'stop-opacity': '0' }),
        svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '.22' }),
      ),
    ),
    // петли на верхнем торце
    svg('rect', { class: 'mini__hinge', x: '9', y: '0', width: '7', height: '4', rx: '1.2' }),
    svg('rect', { class: 'mini__hinge', x: '26', y: '0', width: '9', height: '4', rx: '1.2' }),
    // корпус и блик
    svg('rect', { class: 'mini__rim', x: '2', y: '1.6', width: '40', height: '58.8', rx: '13.5' }),
    svg('rect', { x: '2', y: '1.6', width: '40', height: '58.8', rx: '13.5', fill: `url(#${sheen})` }),
    svg('ellipse', { cx: '13', cy: '9', rx: '6.5', ry: '3', fill: '#fff', 'fill-opacity': '.2', transform: 'rotate(-24 13 9)' }),
    // шов между крышкой и нижней половиной
    svg('path', { d: 'M2.4 30.4Q22 35 41.6 30.4', fill: 'none', stroke: 'rgba(0,0,0,.55)', 'stroke-width': '1' }),
    svg('path', { d: 'M2.8 31.6Q22 36.2 41.2 31.6', fill: 'none', stroke: 'rgba(255,255,255,.3)', 'stroke-width': '.6' }),
    // эмблема: белый круг, надпись по дуге, крокодил в красной шляпе, красная «подпись»
    svg('circle', { cx: '22', cy: '17', r: '9.4', fill: '#fbfaf4', stroke: 'rgba(30,30,30,.7)', 'stroke-width': '.55' }),
    svg('path', { class: 'mini__arc', d: 'M9.6 18A12.4 12.4 0 0 1 34.4 18', fill: 'none', 'stroke-width': '1', 'stroke-dasharray': '.9 .8' }),
    svg('path', { d: 'M15 16.4C14.8 20 18.2 22.6 22.6 22.2C25.6 21.9 27.6 20 27.4 17.6C27 15.8 25 15 22.7 15Z', fill: '#efe3a4', stroke: '#8a7d46', 'stroke-width': '.3' }),
    svg('path', { d: 'M15.4 15C16.2 10.8 19.4 9 22.6 9.2C25.4 9.4 27.2 11.2 27.8 14L30 14.6C29 16 26.6 15.4 25.6 15.2L16.8 15.8C16.2 15.8 15.6 15.6 15.4 15Z', fill: '#d63a30' }),
    svg('circle', { cx: '22.6', cy: '17.6', r: '.55', fill: '#2c2c2c' }),
    svg('path', { d: 'M16.4 19.6h2.4M17 20.5h1.8', fill: 'none', stroke: '#fff', 'stroke-width': '.5' }),
    svg('path', { d: 'M21.5 24.4Q26 22 31 24.8', fill: 'none', stroke: '#d63a30', 'stroke-width': '1.5', 'stroke-linecap': 'round' }),
    // логотип или наклейка на нижней половине
    chin,
  );
  return root;
}

export interface ShellPickerOptions {
  /** Идентификатор контейнера (для тестов и подписи). */
  id: string;
  /** Какие цвета предлагать (у «Часов+99» и «Морского боя» — только подтверждённые фото); по умолчанию все четыре. */
  shells?: readonly Shell[];
  /** Чья наклейка на миниатюрах (по умолчанию Crocodile Mario). */
  toy?: ToyId;
  /** Подпись группы для скринридеров. */
  label: string;
  value: Shell;
  onPick(shell: Shell, byPointer: boolean): void;
}

/**
 * Переключатель цвета: четыре миниатюрные консоли — радиогруппа с подписями. Стрелки двигают выбор,
 * Tab входит в группу одним остановом (выбранный цвет).
 */
export class ShellPicker {
  readonly root: HTMLElement;
  private readonly buttons = new Map<Shell, HTMLButtonElement>();
  private readonly options: ShellPickerOptions;
  private readonly shells: readonly Shell[];
  private value: Shell;

  constructor(options: ShellPickerOptions) {
    this.options = options;
    this.value = options.value;
    this.shells = options.shells ?? SHELLS;
    const serial = ++pickerSerial;
    this.root = h('div', { class: 'shellpick', id: options.id, role: 'radiogroup', 'aria-label': options.label });
    this.root.style.setProperty('--cols', String(this.shells.length));
    for (const shell of this.shells) {
      const button = h(
        'button',
        { type: 'button', class: 'shellpick__btn', role: 'radio', 'data-shell': shell },
        miniConsole(shell, serial, options.toy ?? 'mario'),
        h('span', { class: 'shellpick__name' }),
      );
      button.addEventListener('click', (event) => this.pick(shell, event.detail !== 0));
      button.addEventListener('keydown', (event) => this.onKey(event, shell));
      this.buttons.set(shell, button);
      this.root.append(button);
    }
    this.set(options.value);
    this.relabel(options.label);
  }

  /** Подписи на текущем языке (после смены языка); `label` — подпись всей группы. */
  relabel(label?: string): void {
    if (label !== undefined) this.root.setAttribute('aria-label', label);
    for (const [shell, button] of this.buttons) {
      const name = shellLabel(shell);
      button.title = t('shell.title', { name });
      button.setAttribute('aria-label', name);
      const caption = button.querySelector('.shellpick__name');
      if (caption) caption.textContent = name;
    }
  }

  /** Показать выбранный цвет (без вызова onPick). */
  set(shell: Shell): void {
    this.value = shell;
    for (const [id, button] of this.buttons) {
      const on = id === shell;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    }
  }

  private pick(shell: Shell, byPointer: boolean): void {
    this.set(shell);
    this.options.onPick(shell, byPointer);
  }

  private onKey(event: KeyboardEvent, from: Shell): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = this.shells[(this.shells.indexOf(from) + step + this.shells.length) % this.shells.length];
    if (!next) return;
    this.pick(next, false);
    this.buttons.get(next)?.focus();
  }

  get current(): Shell {
    return this.value;
  }
}
