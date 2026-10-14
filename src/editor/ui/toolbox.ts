import { TOOL_LABELS, type EditorContext } from './context';
import { checkbox, el, selectInput } from './el';
import type { ToolName, ViewMode } from '../types';

const TOOL_ORDER: ToolName[] = ['brush', 'eraser', 'rect', 'fill', 'eyedropper', 'select', 'start', 'object', 'mark', 'photo', 'pan'];

const MODES: { value: ViewMode; label: string; hint: string }[] = [
  { value: 'photo', label: 'Фото', hint: 'Только подложка' },
  { value: 'map', label: 'Карта', hint: 'Только карта' },
  { value: 'overlay', label: 'Наложение', hint: 'Подложка под полупрозрачной картой' },
  { value: 'side', label: 'Рядом', hint: 'Фото слева, карта справа, вид общий' },
];

function drawThumb(ctx: EditorContext, canvas: HTMLCanvasElement, assetId: string | null, solid: boolean): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const pack = ctx.pack();
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = pack.screen.colors.background;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (assetId !== null) {
    g.imageSmoothingEnabled = pack.screen.smoothing;
    ctx.assets().draw(g, assetId, 0, 0, 0, canvas.width, canvas.height, pack.screen.colors.ink);
  } else if (solid) {
    g.fillStyle = 'rgba(32, 42, 30, 0.55)';
    g.fillRect(2, 2, canvas.width - 4, canvas.height - 4);
  }
}

function tileLabel(char: string, collision: 'empty' | 'solid', asset: string | null): string {
  const name = collision === 'empty' && asset === null ? 'Пустая клетка' : asset !== null ? asset : 'Клетка без рисунка';
  return `«${char}» ${name}`;
}

/** Левая панель: инструменты, палитра клеток и объектов, параметры. Перестраивается, когда меняется то, что она показывает. */
export function buildToolbox(ctx: EditorContext): { root: HTMLElement; update(): void } {
  const root = el('div', { class: 'toolbox' });
  let signature = '';

  const render = (): void => {
    const { store } = ctx;
    const { doc, tool, ui } = store;
    const pack = ctx.pack();

    const tools = el('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Инструменты' });
    for (const name of TOOL_ORDER) {
      const info = TOOL_LABELS[name];
      if (!info) continue;
      const button = el(
        'button',
        { type: 'button', class: `tool${tool.tool === name ? ' tool--active' : ''}`, 'aria-pressed': tool.tool === name ? 'true' : 'false', title: `${info.hint} (${info.key})`, 'data-tool': name },
        el('span', { class: 'tool__name' }, info.label),
        el('kbd', {}, info.key),
      );
      button.addEventListener('click', () => store.setTool(name));
      tools.append(button);
    }

    const tiles = el('div', { class: 'palette', role: 'listbox', 'aria-label': 'Клетки карты' });
    for (const [char, entry] of Object.entries(doc.legend)) {
      const thumb = el('canvas', { width: '56', height: String(Math.round(56 * (pack.screen.cell.height / pack.screen.cell.width))), 'aria-hidden': 'true' });
      drawThumb(ctx, thumb, entry.asset, entry.collision === 'solid');
      const chosen = tool.char === char;
      const item = el(
        'button',
        {
          type: 'button',
          class: `palette__item${chosen ? ' palette__item--active' : ''}`,
          role: 'option',
          'aria-selected': chosen ? 'true' : 'false',
          title: `${tileLabel(char, entry.collision, entry.asset)} — ${entry.collision === 'solid' ? 'занятая (непроходимая)' : 'проходимая'}`,
          'data-char': char,
        },
        thumb,
        el('span', { class: 'palette__label' }, entry.collision === 'solid' ? 'Земля / занято' : entry.asset === null ? 'Пусто' : 'Проходимо'),
      );
      item.addEventListener('click', () => {
        store.setChar(char);
        if (!['brush', 'rect', 'fill'].includes(store.tool.tool)) store.setTool('brush');
      });
      tiles.append(item);
    }

    const objects = el('div', { class: 'palette palette--objects', role: 'listbox', 'aria-label': 'Типы объектов' });
    for (const info of ctx.objectTypes) {
      const chosen = tool.objectType === info.type && tool.tool === 'object';
      const item = el(
        'button',
        { type: 'button', class: `palette__item palette__item--text${chosen ? ' palette__item--active' : ''}`, role: 'option', 'aria-selected': chosen ? 'true' : 'false', 'data-object-type': info.type, title: `Тип «${info.type}»${info.solid ? ' (твёрдый)' : ''}` },
        el('span', { class: 'palette__label' }, info.label),
        el('small', {}, info.type),
      );
      item.addEventListener('click', () => {
        store.setObjectType(info.type);
        store.setTool('object');
      });
      objects.append(item);
    }

    const options = el(
      'div',
      { class: 'options' },
      checkbox('opt-transparent', tool.transparentPaste, 'Вставка не затирает пустыми клетками', (value) => store.setTransparentPaste(value)),
      el(
        'label',
        { class: 'field field--inline' },
        el('span', { class: 'field__label' }, 'Статус новой пометки'),
        selectInput(
          'opt-mark-status',
          tool.markStatus,
          [
            { value: 'unknown', label: '? не видно / неизвестно' },
            { value: 'assumed', label: '≈ предположение' },
            { value: 'confirmed', label: '✓ подтверждено' },
          ],
          (value) => {
            if (value === 'unknown' || value === 'assumed' || value === 'confirmed') store.setMarkStatus(value);
          },
        ),
      ),
    );

    const layers = el(
      'div',
      { class: 'options' },
      checkbox('layer-grid', ui.showGrid, 'Сетка', (value) => store.patchUi({ showGrid: value })),
      pack.screen.ghost ? checkbox('layer-ghost', ui.showGhost, 'Неактивные сегменты', (value) => store.patchUi({ showGhost: value })) : null,
      checkbox('layer-objects', ui.showObjects, 'Объекты и старт', (value) => store.patchUi({ showObjects: value })),
      checkbox('layer-marks', ui.showMarks, 'Пометки', (value) => store.patchUi({ showMarks: value })),
    );

    const restore = (() => {
      const active = document.activeElement;
      const key = active instanceof HTMLElement && root.contains(active) ? active.dataset['field'] : undefined;
      return () => {
        if (key) root.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
      };
    })();
    root.replaceChildren(
      el('h2', { class: 'panel__title' }, 'Инструменты'),
      tools,
      el('h3', { class: 'panel__sub' }, 'Клетки'),
      tiles,
      el('h3', { class: 'panel__sub' }, 'Объекты движка'),
      ctx.objectTypes.length === 0 ? el('p', { class: 'muted' }, 'В этом профиле нет зарегистрированных типов.') : objects,
      el('h3', { class: 'panel__sub' }, 'Параметры'),
      options,
      el('h3', { class: 'panel__sub' }, 'Слои'),
      layers,
    );
    restore();
  };

  return {
    root,
    update() {
      const { doc, tool, ui } = ctx.store;
      const next = JSON.stringify([tool, ui.showGrid, ui.showGhost, ui.showObjects, ui.showMarks, Object.entries(doc.legend), ctx.pack().manifest.id]);
      if (next === signature) return;
      signature = next;
      render();
    },
  };
}

/** Переключатель «Фото / Карта / Наложение / Рядом» над рабочей областью. */
export function buildModeSwitch(ctx: EditorContext, onChange: () => void): { root: HTMLElement; update(): void } {
  const root = el('div', { class: 'modes', role: 'radiogroup', 'aria-label': 'Режим показа' });
  const buttons = new Map<ViewMode, HTMLButtonElement>();
  for (const mode of MODES) {
    const button = el('button', { type: 'button', class: 'btn btn--mode', role: 'radio', title: mode.hint, 'data-mode': mode.value }, mode.label);
    button.addEventListener('click', () => {
      ctx.store.patchUi({ mode: mode.value });
      onChange();
    });
    buttons.set(mode.value, button);
    root.append(button);
  }
  return {
    root,
    update() {
      for (const [value, button] of buttons) {
        const on = ctx.store.ui.mode === value;
        button.setAttribute('aria-checked', on ? 'true' : 'false');
        button.classList.toggle('btn--active', on);
      }
    },
  };
}
