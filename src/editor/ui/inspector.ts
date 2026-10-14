import type { ObservationStatus } from '../../content/schema';
import { MAX_MARK_NOTE } from '../../content/schema';
import {
  findMark,
  findObject,
  findRef,
  removeMark,
  removeObject,
  removeRef,
  renameObject,
  setLevelProps,
  setStart,
  setTransition,
  updateMark,
  updateObject,
  updateRef,
} from '../ops';
import { inBounds } from '../grid';
import type { Problem } from '../diagnose';
import type { EditorContext } from './context';
import { button, checkbox, el, field, keepFocus, numberInput, selectInput, textInput } from './el';

interface Section {
  root: HTMLDetailsElement;
  body: HTMLElement;
  summary: HTMLElement;
}

function section(title: string, open = true): Section {
  const summary = el('summary', {}, title);
  const body = el('div', { class: 'panel__body' });
  const root = el('details', { class: 'panel__section', ...(open ? { open: true } : {}) }, summary, body);
  return { root, body, summary };
}

const STATUS_OPTIONS = [
  { value: 'unknown', label: '? не видно / неизвестно' },
  { value: 'assumed', label: '≈ предположение' },
  { value: 'confirmed', label: '✓ подтверждено' },
] as const;

/** Правая панель: карта, выбранное, референсы, проблемы. Каждый раздел перестраивается только при изменении своих данных. */
export function buildInspector(ctx: EditorContext): { root: HTMLElement; update(): void; showProblems(): void } {
  const level = section('Карта');
  const selected = section('Выбранное');
  const refs = section('Референсы');
  const problems = section('Проблемы');
  const root = el('div', { class: 'inspector' }, level.root, selected.root, refs.root, problems.root);
  const signatures = { level: '', selected: '', refs: '', problems: '' };
  const { store } = ctx;

  const commitProps = (patch: Parameters<typeof setLevelProps>[1], label: string): void => {
    const next = setLevelProps(store.doc, patch);
    if (!next) {
      ctx.say(`Недопустимое значение: ${label}.`, 'warn');
      signatures.level = '';
      renderLevel();
      return;
    }
    store.commit(() => next);
  };

  // ── Карта ────────────────────────────────────────────────────────────────

  const renderLevel = (): void => {
    const { doc, ui } = store;
    const pack = ctx.pack();
    const restore = keepFocus(level.body);
    const width = numberInput('map-width', doc.width, { min: 1, max: 256, onCommit: () => {} });
    const height = numberInput('map-height', doc.height, { min: 1, max: 256, onCommit: () => {} });
    const applySize = (): void => void ctx.resizeMap(Number(width.value), Number(height.value));
    level.body.replaceChildren(
      field('Название', textInput('map-name', doc.name, { maxLength: 120, onCommit: (v) => commitProps({ name: v }, 'название') })),
      field('Идентификатор уровня', textInput('map-id', doc.id, { maxLength: 64, onCommit: (v) => commitProps({ id: v.trim() }, 'идентификатор (латиница, цифры, «.», «_», «-»)') }), 'Имя файла при экспорте и ссылка из pack.json.'),
      field(
        'Статус',
        selectInput('map-status', doc.status, [{ value: 'demo', label: 'demo — временные данные' }, { value: 'confirmed', label: 'confirmed — подтверждено владельцем' }], (v) =>
          commitProps({ status: v === 'confirmed' ? 'confirmed' : 'demo' }, 'статус'),
        ),
      ),
      field('Подпись HUD', textInput('map-hud', doc.hudLabel, { maxLength: 8, onCommit: (v) => commitProps({ hudLabel: v.trim() }, 'подпись HUD (до 8 знаков: латиница, цифры, пробел, дефис)') }), 'Буквальная подпись наблюдения, например «1-03». Не трактуется как «мир 1, уровень 3».'),
      field('Заметка', (() => {
        const area = el('textarea', { rows: '3', 'data-field': 'map-note', maxlength: '2000' }, doc.note);
        area.addEventListener('change', () => commitProps({ note: area.value }, 'заметка'));
        return area;
      })()),
      el('p', { class: 'muted' }, `Профиль экрана и правил: ${pack.manifest.title} (${doc.pack}). Размер видимого поля: ${pack.screen.viewport.columns}×${pack.screen.viewport.rows} клеток.`),
      el('div', { class: 'row' }, field('Ширина', width), field('Высота', height)),
      el(
        'div',
        { class: 'row' },
        button('Применить размер', applySize, { title: 'При уменьшении будет показано, что обрежется, и запрошено подтверждение' }),
        button('+ столбец справа', () => void ctx.resizeMap(doc.width + 1, doc.height)),
        button(`+ экран (${pack.screen.viewport.columns}) вправо`, () => void ctx.resizeMap(doc.width + pack.screen.viewport.columns, doc.height)),
      ),
      el('h4', {}, 'Окно просмотра'),
      el('p', { class: 'muted' }, 'Рамка размером с один экран игры: удобно совмещать с кадрами. Это возможность редактора, а не утверждение о прокрутке оригинала.'),
      el(
        'div',
        { class: 'row' },
        field('x', numberInput('win-x', ui.windowX, { step: 1, onCommit: (v) => store.patchUi({ windowX: Math.round(v) }) })),
        field('y', numberInput('win-y', ui.windowY, { step: 1, onCommit: (v) => store.patchUi({ windowY: Math.round(v) }) })),
        button('Показать', () => ctx.map.centerOn({ x: ui.windowX + Math.floor(pack.screen.viewport.columns / 2), y: ui.windowY + Math.floor(pack.screen.viewport.rows / 2) })),
      ),
    );
    restore();
  };

  // ── Выбранное ────────────────────────────────────────────────────────────

  const num = (key: string, value: number, onCommit: (v: number) => void, min = 0, max = 256, step = 1): HTMLInputElement =>
    numberInput(key, value, { min, max, step, onCommit });

  const renderSelected = (): void => {
    const { doc, selection } = store;
    const restore = keepFocus(selected.body);
    const body = selected.body;
    if (!selection) {
      body.replaceChildren(el('p', { class: 'muted' }, 'Ничего не выбрано. Выделите клетки инструментом «Выделение» либо щёлкните по объекту, пометке или старту соответствующим инструментом.'));
      restore();
      return;
    }
    if (selection.kind === 'cells') {
      const r = selection.rect;
      body.replaceChildren(
        el('p', {}, `Выделено ${r.w}×${r.h} клеток, левый верхний угол (${r.x}, ${r.y}).`),
        el(
          'div',
          { class: 'row row--wrap' },
          button('Копировать', () => store.copy(), { title: 'Ctrl+C' }),
          button('Вырезать', () => {
            if (store.copy()) store.deleteSelection();
          }, { title: 'Ctrl+X' }),
          button('Вставить', () => {
            if (!store.paste()) ctx.say('Буфер пуст: сначала скопируйте участок.', 'warn');
          }, { title: 'Ctrl+V' }),
          button('Дублировать', () => store.duplicate(), { title: 'Ctrl+D: копия рядом' }),
          button('Стереть', () => store.deleteSelection(), { title: 'Delete' }),
        ),
        el('div', { class: 'row row--wrap' }, button('Тест отсюда', () => ctx.runTest({ x: r.x, y: r.y }), { title: 'Запуск с этой клетки (сохранённый старт не меняется)', disabled: !(r.w === 1 && r.h === 1 && store.isFreeCell(r.x, r.y)) })),
        el('p', { class: 'muted' }, 'Переносятся только клетки карты; объекты и пометки переносятся отдельно. «Тест отсюда» доступен для одной свободной клетки.'),
      );
    } else if (selection.kind === 'object') {
      const object = findObject(doc, selection.id);
      if (!object) return;
      const info = ctx.objectTypes.find((t) => t.type === object.type);
      const catalog = ctx.pack().assets.assets;
      const assetOptions = [
        { value: '', label: '— без рисунка —' },
        ...(object.asset !== null && !(object.asset in catalog) ? [{ value: object.asset, label: `неизвестный ресурс: ${object.asset}` }] : []),
        ...Object.keys(catalog).map((id) => ({ value: id, label: id })),
      ];
      const move = (patch: { x?: number; y?: number; w?: number; h?: number }, label: string): void => {
        const next = { x: object.x, y: object.y, w: object.w, h: object.h, ...patch };
        if (![next.x, next.y, next.w, next.h].every(Number.isInteger) || next.w < 1 || next.h < 1 || next.x < 0 || next.y < 0 || next.x + next.w > doc.width || next.y + next.h > doc.height) {
          ctx.say(`Объект не помещается в карту: ${label}.`, 'warn');
          signatures.selected = '';
          renderSelected();
          return;
        }
        store.commit((d) => updateObject(d, object.id, patch));
      };
      const transition = doc.transitions.find((t) => t.from === object.id);
      const transitionKind = transition === undefined ? 'none' : transition.to === null ? 'end' : 'level';
      body.replaceChildren(
        field('Идентификатор', textInput('obj-id', object.id, {
          maxLength: 64,
          onCommit: (v) => {
            const next = renameObject(store.doc, object.id, v.trim());
            if (!next) {
              ctx.say('Идентификатор недопустим или уже занят.', 'warn');
              signatures.selected = '';
              renderSelected();
              return;
            }
            store.commit(() => next);
            store.select({ kind: 'object', id: v.trim() });
          },
        })),
        el('p', { class: info ? 'muted' : 'warn' }, info ? `Тип: ${info.label} («${object.type}»)` : `Тип «${object.type}» не поддержан движком: объект сохранён как есть, тест не запустится, пока тип не исправлен или объект не удалён.`),
        el('div', { class: 'row' }, field('x', num('obj-x', object.x, (v) => move({ x: v }, 'x'))), field('y', num('obj-y', object.y, (v) => move({ y: v }, 'y')))),
        el('div', { class: 'row' }, field('ширина', num('obj-w', object.w, (v) => move({ w: v }, 'ширина'), 1)), field('высота', num('obj-h', object.h, (v) => move({ h: v }, 'высота'), 1))),
        field('Рисунок', selectInput('obj-asset', object.asset ?? '', assetOptions, (v) => store.commit((d) => updateObject(d, object.id, { asset: v === '' ? null : v })))),
        ...(info?.params ?? []).map((spec) =>
          field(
            `${spec.label} (${spec.min}…${spec.max})`,
            numberInput(`obj-param-${spec.key}`, typeof object.params[spec.key] === 'number' ? (object.params[spec.key] as number) : spec.default, {
              min: spec.min,
              max: spec.max,
              onCommit: (v) => store.commit((d) => updateObject(d, object.id, { params: { ...object.params, [spec.key]: v } })),
            }),
          ),
        ),
        ...(object.type === 'finish'
          ? [
              field(
                'После финиша',
                selectInput('obj-transition', transitionKind, [{ value: 'none', label: 'нет перехода' }, { value: 'end', label: 'конец игры' }, { value: 'level', label: 'перейти на уровень…' }], (v) =>
                  store.commit((d) => setTransition(d, object.id, v === 'none' ? undefined : v === 'end' ? null : (transition?.to ?? 'next-level'))),
                ),
              ),
              transitionKind === 'level'
                ? field('id уровня', textInput('obj-transition-to', transition?.to ?? '', { onCommit: (v) => store.commit((d) => setTransition(d, object.id, v.trim() === '' ? undefined : v.trim())) }), 'В тестовом запуске доступна только эта карта.')
                : el('span'),
            ]
          : []),
        button('Удалить объект', () => store.commit((d) => removeObject(d, object.id)), { class: 'btn btn--danger' }),
      );
    } else if (selection.kind === 'mark') {
      const mark = findMark(doc, selection.id);
      if (!mark) return;
      const move = (patch: { x?: number; y?: number; w?: number; h?: number }): void => {
        const next = { x: mark.x, y: mark.y, w: mark.w, h: mark.h, ...patch };
        if (![next.x, next.y, next.w, next.h].every(Number.isInteger) || next.w < 1 || next.h < 1 || next.x < 0 || next.y < 0 || next.x + next.w > doc.width || next.y + next.h > doc.height) {
          ctx.say('Пометка не помещается в карту.', 'warn');
          signatures.selected = '';
          renderSelected();
          return;
        }
        store.commit((d) => updateMark(d, mark.id, patch));
      };
      const note = el('textarea', { rows: '4', 'data-field': 'mark-note', maxlength: String(MAX_MARK_NOTE), placeholder: 'Что видно или не видно на кадре, почему предположение' }, mark.note);
      note.addEventListener('change', () => store.commit((d) => updateMark(d, mark.id, { note: note.value })));
      body.replaceChildren(
        el('p', { class: 'muted' }, `Пометка «${mark.id}». Метаданные уровня: в симуляции не участвует.`),
        field('Статус', selectInput('mark-status', mark.status, STATUS_OPTIONS, (v) => {
          if (v === 'unknown' || v === 'assumed' || v === 'confirmed') store.commit((d) => updateMark(d, mark.id, { status: v as ObservationStatus }));
        })),
        el('div', { class: 'row' }, field('x', num('mark-x', mark.x, (v) => move({ x: v }))), field('y', num('mark-y', mark.y, (v) => move({ y: v })))),
        el('div', { class: 'row' }, field('ширина', num('mark-w', mark.w, (v) => move({ w: v }), 1)), field('высота', num('mark-h', mark.h, (v) => move({ h: v }), 1))),
        field('Заметка', note),
        field(
          'Референс',
          textInput('mark-ref', mark.ref, { maxLength: 80, list: 'ref-names', onCommit: (v) => store.commit((d) => updateMark(d, mark.id, { ref: v })) }),
          'Название кадра, по которому сделана пометка.',
        ),
        el('datalist', { id: 'ref-names' }, ...doc.refs.map((r) => el('option', { value: r.name }))),
        button('Удалить пометку', () => store.commit((d) => removeMark(d, mark.id)), { class: 'btn btn--danger' }),
      );
    } else if (selection.kind === 'start') {
      const start = doc.start;
      if (!start) return;
      const move = (patch: { x?: number; y?: number }): void => {
        const next = { x: start.x, y: start.y, ...patch };
        if (!inBounds(doc, next.x, next.y)) {
          ctx.say('Старт должен быть внутри карты.', 'warn');
          signatures.selected = '';
          renderSelected();
          return;
        }
        store.commit((d) => setStart(d, next));
      };
      body.replaceChildren(
        el('p', {}, 'Единственная точка старта героя.'),
        el('div', { class: 'row' }, field('x', num('start-x', start.x, (v) => move({ x: v }))), field('y', num('start-y', start.y, (v) => move({ y: v })))),
        el('div', { class: 'row row--wrap' }, button('Тест отсюда', () => ctx.runTest({ ...start }), { disabled: !store.isFreeCell(start.x, start.y) }), button('Убрать старт', () => store.commit((d) => setStart(d, null)), { class: 'btn btn--danger' })),
        el('p', { class: 'muted' }, 'Старт внутри занятой клетки или отсутствие старта не исправляются молча: они показаны в разделе «Проблемы».'),
      );
    } else {
      const ref = findRef(doc, selection.id);
      body.replaceChildren(el('p', { class: 'muted' }, ref ? `Референс «${ref.name}»: свойства — в разделе «Референсы».` : 'Референс не найден.'));
    }
    restore();
  };

  // ── Референсы ────────────────────────────────────────────────────────────

  const renderRefs = (): void => {
    const { doc, ui } = store;
    const restore = keepFocus(refs.body);
    const active = ui.activeRef === null ? null : findRef(doc, ui.activeRef);
    const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, class: 'visually-hidden', id: 'ref-file', 'aria-label': 'Добавить фотографии' });
    fileInput.addEventListener('change', () => {
      const files = [...(fileInput.files ?? [])];
      fileInput.value = '';
      void ctx.addPhotos(files);
    });
    const list = el('ul', { class: 'refs' });
    for (const ref of doc.refs) {
      const chosen = active?.id === ref.id;
      const item = el(
        'li',
        { class: chosen ? 'refs__item refs__item--active' : 'refs__item' },
        el(
          'button',
          { type: 'button', class: 'refs__pick', 'aria-pressed': chosen ? 'true' : 'false', 'data-ref': ref.id },
          el('strong', {}, ref.name),
          el('small', {}, `${ref.width}×${ref.height} · ${ref.quad === null ? 'не откалибровано' : 'откалибровано'}${ref.visible ? '' : ' · скрыто'}${ref.locked ? ' · 🔒' : ''}`),
        ),
      );
      (item.firstElementChild as HTMLElement).addEventListener('click', () => {
        store.patchUi({ activeRef: ref.id });
        store.select({ kind: 'ref', id: ref.id });
      });
      list.append(item);
    }
    const form: HTMLElement[] = [];
    if (active) {
      const patch = (p: Parameters<typeof updateRef>[2]): void => {
        store.commit((d) => updateRef(d, active.id, p));
      };
      const description = el('textarea', { rows: '2', 'data-field': 'ref-description', maxlength: '1000' }, active.description);
      description.addEventListener('change', () => patch({ description: description.value }));
      const opacity = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(active.opacity), 'data-field': 'ref-opacity' });
      opacity.addEventListener('change', () => patch({ opacity: Number(opacity.value) }));
      form.push(
        field('Название', textInput('ref-name', active.name, { maxLength: 120, onCommit: (v) => {
          if (v.trim() === '') ctx.say('Название не может быть пустым.', 'warn');
          else patch({ name: v });
        } })),
        field('Описание', description),
        field('Время в видео', textInput('ref-time', active.videoTime, { maxLength: 64, placeholder: '00:01:23', onCommit: (v) => patch({ videoTime: v }) })),
        field('Прозрачность', opacity),
        el(
          'div',
          { class: 'row' },
          checkbox('ref-visible', active.visible, 'Показывать', (v) => patch({ visible: v })),
          checkbox('ref-locked', active.locked, 'Заблокировать', (v) => patch({ locked: v })),
        ),
        el('p', { class: 'muted' }, 'Положение откалиброванной области на карте, в клетках (дробные значения допустимы; кадры не обязаны быть сдвинуты ровно на экран):'),
        el(
          'div',
          { class: 'row' },
          field('x', numberInput('ref-ox', active.origin.x, { step: 0.25, min: -10000, max: 10000, disabled: active.locked, onCommit: (v) => patch({ origin: { x: v, y: active.origin.y } }) })),
          field('y', numberInput('ref-oy', active.origin.y, { step: 0.25, min: -10000, max: 10000, disabled: active.locked, onCommit: (v) => patch({ origin: { x: active.origin.x, y: v } }) })),
        ),
        el(
          'div',
          { class: 'row row--wrap' },
          button('Калибровать углы…', () => ctx.startCalibration(active.id), { class: 'btn btn--primary' }),
          button('Сбросить калибровку', () => patch({ quad: null }), { disabled: active.quad === null }),
          button('Окно просмотра сюда', () => store.patchUi({ windowX: Math.round(active.origin.x), windowY: Math.round(active.origin.y) })),
          button('Удалить референс', () => {
            store.commit((d) => removeRef(d, active.id));
            ctx.session.forget(active.id);
          }, { class: 'btn btn--danger' }),
        ),
      );
    }
    refs.body.replaceChildren(
      el('div', { class: 'row row--wrap' }, el('label', { class: 'btn btn--primary', for: 'ref-file' }, 'Добавить фото…'), fileInput),
      el('p', { class: 'muted' }, 'JPG, PNG или WebP; можно перетащить файлы на рабочую область. Фото остаются в этом браузере и никуда не отправляются; исходный файл не меняется.'),
      doc.refs.length === 0 ? el('p', { class: 'muted' }, 'Референсов пока нет.') : list,
      ...form,
    );
    restore();
  };

  // ── Проблемы ─────────────────────────────────────────────────────────────

  const renderProblems = (): void => {
    const list = ctx.problems();
    const errors = list.filter((p) => p.severity === 'error').length;
    problems.summary.textContent = `Проблемы${list.length === 0 ? ' — нет' : ` (${errors} ошибок, ${list.length - errors} замечаний)`}`;
    if (list.length === 0) {
      problems.body.replaceChildren(el('p', { class: 'muted' }, 'Карта проходит проверку общим валидатором игры.'));
      return;
    }
    const items = list.map((problem: Problem) => {
      const item = el(
        'li',
        { class: `problem problem--${problem.severity}` },
        el('button', { type: 'button', class: 'problem__go', title: problem.path }, `${problem.severity === 'error' ? '✖' : '⚠'} ${problem.message}`),
        el('small', {}, problem.path + (problem.cell ? ` · клетка (${problem.cell.x}, ${problem.cell.y})` : '')),
      );
      item.querySelector('button')?.addEventListener('click', () => ctx.gotoProblem(problem));
      return item;
    });
    problems.body.replaceChildren(el('ul', { class: 'problems' }, ...items));
  };

  return {
    root,
    showProblems() {
      problems.root.open = true;
      problems.root.scrollIntoView({ block: 'nearest' });
    },
    update() {
      const { doc, selection, ui, clipboard, tool } = store;
      const levelSig = JSON.stringify([doc.name, doc.id, doc.status, doc.hudLabel, doc.note, doc.width, doc.height, doc.pack, ui.windowX, ui.windowY]);
      if (levelSig !== signatures.level) {
        signatures.level = levelSig;
        renderLevel();
      }
      let entity: unknown = null;
      if (selection?.kind === 'object') entity = [findObject(doc, selection.id), doc.transitions.find((t) => t.from === selection.id)];
      else if (selection?.kind === 'mark') entity = [findMark(doc, selection.id), doc.refs.map((r) => r.name)];
      else if (selection?.kind === 'start') entity = [doc.start, store.isFreeCell(doc.start?.x ?? -1, doc.start?.y ?? -1)];
      else if (selection?.kind === 'cells') entity = [store.isFreeCell(selection.rect.x, selection.rect.y), clipboard?.w ?? 0, tool.transparentPaste];
      const selSig = JSON.stringify([selection, entity, ctx.pack().manifest.id]);
      if (selSig !== signatures.selected) {
        signatures.selected = selSig;
        renderSelected();
      }
      const refsSig = JSON.stringify([doc.refs, ui.activeRef]);
      if (refsSig !== signatures.refs) {
        signatures.refs = refsSig;
        renderRefs();
      }
      const probSig = JSON.stringify(ctx.problems());
      if (probSig !== signatures.problems) {
        signatures.problems = probSig;
        renderProblems();
      }
    },
  };
}
