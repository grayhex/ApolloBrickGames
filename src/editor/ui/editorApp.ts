import { InputHub } from '../../app/hub';
import { WebAudioPort } from '../../audio/beeper';
import { loadContentPack } from '../../app/loadContent';
import { browserGamepadProvider } from '../../input/gamepad';
import { browserStorage } from '../../input/settings';
import { DEMO_BEHAVIORS, describeObjectTypes, validationEnv } from '../../core';
import { AssetStore } from '../../render/assets';
import { GLYPH_NAMES } from '../../render/glyphs';
import type { ContentPack } from '../../content/schema';
import { ContentError, validateLevel } from '../../content/validate';
import { diagnose, diagnoseForTest, errorsOf, gameLevelJson, type DiagnoseEnv, type Problem } from '../diagnose';
import { openIndexedDbStore, MemoryDraftStore, type DraftStore } from '../drafts';
import { planResize, resizeDoc, validSize } from '../grid';
import { ARCHIVE_LIMITS } from '../archive';
import { ImportError, parseDoc } from '../project';
import { EditorSession, SaveFailedError, type SaveState } from '../session';
import { EditorStore } from '../store';
import { docFromLevel, newRoomDoc, slugify } from '../templates';
import { ToolController } from '../tools';
import type { EditorDoc, Pt, ToolName } from '../types';
import { updateRef } from '../ops';
import { CalibrationView } from './calibrationView';
import { TOOL_LABELS, type EditorContext } from './context';
import { confirmDialog, modalOpen, showDialog, showMessage } from './dialogs';
import { button, el, isTextEntry } from './el';
import { buildInspector } from './inspector';
import { MapView } from './mapView';
import { PhotoCache } from './photos';
import { TestRunner } from './testRun';
import { buildModeSwitch, buildToolbox } from './toolbox';

const PACKS: { name: string; label: string }[] = [
  { name: 'room', label: 'Однокомнатное демо (room): ячейка 128 × 112, LCD-графика' },
  { name: 'demo', label: 'Техническое демо (demo): ячейка 8 × 8, заглушки' },
];

interface Bundle {
  pack: ContentPack;
  assets: AssetStore;
  warnings: string[];
}

const TOOL_KEYS: Record<string, ToolName> = {
  KeyB: 'brush',
  KeyE: 'eraser',
  KeyR: 'rect',
  KeyF: 'fill',
  KeyI: 'eyedropper',
  KeyV: 'select',
  KeyS: 'start',
  KeyO: 'object',
  KeyM: 'mark',
  KeyP: 'photo',
  KeyH: 'pan',
};

function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('ru-RU');
}

/** Встроенный редактор уровней: маршрут `#/editor`. */
export async function startEditor(): Promise<void> {
  // Пока редактор не запущен, корневой элемент скрыт, а в оболочке виден только блок ошибки #fatal:
  // сбой загрузки данных показывается как у игры, а не пустой страницей.
  document.body.classList.add('route-editor');
  document.title = 'Crocodile Mario — редактор уровней';
  const root = document.getElementById('editor-root');
  const settingsDialog = document.getElementById('settings');
  if (!root || !(settingsDialog instanceof HTMLDialogElement)) throw new Error('В index.html нет #editor-root или #settings');

  const behaviors = DEMO_BEHAVIORS;
  const validation = validationEnv(behaviors, GLYPH_NAMES);
  const objectTypes = describeObjectTypes(behaviors);

  // ── Пакеты данных (профиль экрана, правила, ресурсы) ─────────────────────
  const bundles = new Map<string, Bundle>();
  const loadBundle = async (name: string): Promise<Bundle> => {
    const cached = bundles.get(name);
    if (cached) return cached;
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Недопустимое имя пакета «${name}».`);
    const manifestUrl = new URL(`${import.meta.env.BASE_URL}content/${name}/pack.json`, window.location.href).href;
    const { pack, assetsUrl } = await loadContentPack(manifestUrl, validation);
    const assets = new AssetStore(pack.assets, assetsUrl, pack.screen.colors.ink);
    const warnings = await assets.load();
    const bundle = { pack, assets, warnings };
    bundles.set(name, bundle);
    return bundle;
  };
  let bundle = await loadBundle('room');

  // ── Хранилище черновиков ─────────────────────────────────────────────────
  let drafts: DraftStore;
  let storageNote = '';
  try {
    drafts = await openIndexedDbStore();
  } catch (error) {
    drafts = new MemoryDraftStore();
    storageNote = `Локальное хранилище (IndexedDB) недоступно: ${error instanceof Error ? error.message : String(error)}. Черновики живут только до перезагрузки — выгружайте архив проекта.`;
  }

  // ── Начальный документ ───────────────────────────────────────────────────
  const photos = new PhotoCache();
  let initial: EditorDoc | null = null;
  let initialImages = new Map<string, { mime: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: Uint8Array }>();
  let restoreNote = '';
  try {
    const [latest] = await drafts.list();
    if (latest) {
      const loaded = await drafts.load(latest.projectId);
      if (loaded) {
        initial = parseDoc(loaded.record.doc, 'черновик');
        initialImages = loaded.images;
        restoreNote = `Восстановлен черновик «${initial.name}».`;
      }
    }
  } catch (error) {
    restoreNote = `Черновик не удалось восстановить: ${error instanceof ContentError ? error.issues.join('; ') : error instanceof Error ? error.message : String(error)}`;
  }
  if (initial) bundle = await loadBundle(initial.pack).catch(() => bundle);
  const projectId = (): string => crypto.randomUUID();
  const startDoc = initial ?? newRoomDoc(bundle.pack, { projectId: projectId(), name: 'Новая комната', pack: 'room', id: 'new-room' });

  const store = new EditorStore(startDoc);
  const session = new EditorSession(store, drafts, photos);
  const tools = new ToolController(store);

  // ── Диагностика ──────────────────────────────────────────────────────────
  const env = (): DiagnoseEnv => ({ assets: bundle.pack.assets, validation });
  let problems: Problem[] = [];
  let problemsTimer = 0;
  const recomputeProblems = (): void => {
    problems = diagnose(store.doc, env());
    map.request();
    refreshPanels();
  };
  const scheduleProblems = (): void => {
    window.clearTimeout(problemsTimer);
    problemsTimer = window.setTimeout(() => {
      if (tools.dragging) scheduleProblems();
      else recomputeProblems();
    }, 250);
  };

  // ── Каркас интерфейса ────────────────────────────────────────────────────
  const saveStatus = el('span', { class: 'editor__save', id: 'editor-save', role: 'status' }, 'Сохранено');
  const projectName = el('button', { type: 'button', class: 'editor__project', id: 'editor-project', title: 'Проекты: создать, открыть, дублировать' });
  const undoButton = button('↶ Отменить', () => store.undo(), { id: 'editor-undo', title: 'Ctrl+Z' });
  const redoButton = button('↷ Повторить', () => store.redo(), { id: 'editor-redo', title: 'Ctrl+Shift+Z' });
  const testButton = button('▶ Тестировать', () => runTest(null), { id: 'editor-test-run', class: 'btn btn--primary', title: 'Запуск копии карты из памяти, включая несохранённые правки' });
  const testFromButton = button('▶ Тест отсюда', () => {
    const rect = store.selectionRect();
    runTest(rect ? { x: rect.x, y: rect.y } : null);
  }, { id: 'editor-test-from', title: 'Выделите одну свободную клетку' });
  const importInput = el('input', { type: 'file', accept: '.zip,.json,application/zip,application/json', class: 'visually-hidden', id: 'editor-import', 'aria-label': 'Импорт проекта или уровня' });
  const statusLine = el('p', { class: 'editor__status', id: 'editor-message', role: 'status' });
  const hoverLine = el('span', { class: 'editor__hover', id: 'editor-hover' });
  const banner = el('p', { class: 'editor__banner', hidden: true, role: 'alert' });

  const top = el(
    'header',
    { class: 'editor__top' },
    el('a', { class: 'editor__back', href: '#/' }, '← К игре'),
    el('h1', { class: 'editor__title' }, 'Редактор уровней'),
    projectName,
    button('Создать / открыть…', () => void openProjects(), { id: 'editor-projects' }),
    undoButton,
    redoButton,
    button('Импорт…', () => importInput.click(), { id: 'editor-import-btn', title: 'Архив проекта (.zip) или игровой JSON уровня' }),
    importInput,
    button('Экспорт проекта (.zip)', () => exportProject(), { id: 'editor-export-project', title: 'Карта, пометки, калибровки и копии референсов — можно продолжить в другом браузере' }),
    button('Экспорт для игры (.json)', () => exportGame(), { id: 'editor-export-game', title: 'Игровой JSON общего формата без фотографий' }),
    testButton,
    testFromButton,
    saveStatus,
  );

  const mapHost = el('div', { class: 'map', id: 'editor-map' });
  const stage = el('div', { class: 'editor__stage' }, mapHost);
  const modeHolder = el('div', { class: 'editor__modes' });
  const zoomBar = el(
    'div',
    { class: 'editor__zoom' },
    button('−', () => map.zoomBy(1 / 1.25), { title: 'Уменьшить (-)', 'aria-label': 'Уменьшить' }),
    button('+', () => map.zoomBy(1.25), { title: 'Увеличить (+)', 'aria-label': 'Увеличить' }),
    button('Вписать', () => map.fit(), { title: 'Вписать карту (0)' }),
  );
  const toolboxAside = el('aside', { class: 'editor__left', 'aria-label': 'Инструменты и палитра' });
  const inspectorAside = el('aside', { class: 'editor__right', 'aria-label': 'Свойства' });
  const collapse = (aside: HTMLElement, label: string, side: 'left' | 'right'): HTMLButtonElement => {
    const toggle = el('button', { type: 'button', class: 'btn btn--ghost editor__collapse', 'aria-expanded': 'true', title: `Свернуть или развернуть панель «${label}»` }, side === 'left' ? '◀' : '▶');
    toggle.addEventListener('click', () => {
      const closed = aside.classList.toggle('editor__aside--closed');
      toggle.setAttribute('aria-expanded', closed ? 'false' : 'true');
      toggle.textContent = closed ? (side === 'left' ? '▶' : '◀') : side === 'left' ? '◀' : '▶';
      window.setTimeout(() => map.resize(), 0);
    });
    return toggle;
  };

  const center = el(
    'section',
    { class: 'editor__center', 'aria-label': 'Рабочая область' },
    el('div', { class: 'editor__tools-bar' }, modeHolder, zoomBar),
    banner,
    stage,
    el('div', { class: 'editor__bar' }, statusLine, hoverLine),
  );
  const body = el('div', { class: 'editor__body' }, toolboxAside, center, inspectorAside);
  const editorView = el('div', { class: 'editor__view', id: 'editor-view' }, top, body);
  root.replaceChildren(editorView);

  // ── Тестовый запуск: тот же ввод, что и в игре ───────────────────────────
  const runnerRef: { current: TestRunner | null } = { current: null };
  const hub = new InputHub({
    keyboardTarget: window,
    provider: browserGamepadProvider(),
    storage: browserStorage(),
    isKeyboardActive: () => runnerRef.current?.keyboardActive() ?? false,
    onGamepadStatus: (status) => runnerRef.current?.onGamepadStatus(status),
    onGamepadDisconnect: () => runnerRef.current?.onGamepadDisconnect(),
  });
  const audio = new WebAudioPort({ muted: !hub.settings.display.sound });
  window.addEventListener('keydown', () => audio.unlock());
  window.addEventListener('pointerdown', () => audio.unlock());
  const runner = new TestRunner(hub, settingsDialog, audio);
  runnerRef.current = runner;
  hub.attach();
  window.addEventListener('gamepadconnected', () => hub.poll());
  window.addEventListener('gamepaddisconnected', () => hub.poll());
  root.append(runner.root);

  // ── Контекст панелей ─────────────────────────────────────────────────────
  let calibrating: CalibrationView | null = null;
  const say = (message: string, tone: 'info' | 'warn' | 'error' = 'info'): void => {
    statusLine.textContent = message;
    statusLine.className = `editor__status editor__status--${tone}`;
  };

  const ctx: EditorContext = {
    store,
    session,
    get map() {
      return map;
    },
    photos,
    pack: () => bundle.pack,
    assets: () => bundle.assets,
    env,
    objectTypes,
    problems: () => problems,
    say,
    startCalibration: (refId) => void startCalibration(refId),
    runTest: (from) => runTest(from),
    resizeMap: (w, h) => resizeMap(w, h),
    addPhotos: (files) => addPhotos(files),
    gotoProblem: (problem) => gotoProblem(problem),
    objectDefaults: (type) => {
      const info = objectTypes.find((t) => t.type === type);
      const catalog = bundle.pack.assets.assets;
      const asset = [`obj.${type}`, `object.${type}`].find((id) => id in catalog) ?? null;
      return { params: Object.fromEntries((info?.params ?? []).map((p) => [p.key, p.default])), asset };
    },
  };
  store.objectDefaults = ctx.objectDefaults;

  const map: MapView = new MapView(mapHost, {
    store,
    tools,
    pack: () => bundle.pack,
    assets: () => bundle.assets,
    photos,
    problems: () => problems,
    knownTypes: () => new Set(Object.keys(behaviors)),
    blocked: () => calibrating !== null || runner.active,
  });
  photos.onChange = () => map.request();

  const toolbox = buildToolbox(ctx);
  const modes = buildModeSwitch(ctx, () => map.relayout());
  const inspector = buildInspector(ctx);
  toolboxAside.append(collapse(toolboxAside, 'Инструменты', 'left'), toolbox.root);
  inspectorAside.append(collapse(inspectorAside, 'Свойства', 'right'), inspector.root);
  modeHolder.append(modes.root);

  const refreshPanels = (): void => {
    toolbox.update();
    modes.update();
    inspector.update();
    projectName.textContent = `${store.doc.name} · ${store.doc.id}`;
    mapHost.dataset['rows'] = store.doc.rows.join('|');
    mapHost.dataset['start'] = store.doc.start ? `${store.doc.start.x},${store.doc.start.y}` : '';
    mapHost.dataset['tool'] = store.tool.tool;
    mapHost.dataset['refs'] = String(store.doc.refs.length);
    mapHost.dataset['problems'] = String(problems.filter((p) => p.severity === 'error').length);
    undoButton.disabled = !store.canUndo;
    redoButton.disabled = !store.canRedo;
    const rect = store.selectionRect();
    const free = rect !== null && rect.w === 1 && rect.h === 1 && store.isFreeCell(rect.x, rect.y);
    testFromButton.disabled = !free;
    if (tools.hint) say(tools.hint, 'warn');
  };
  let panelsRaf = 0;
  store.subscribe(() => {
    if (panelsRaf === 0) {
      panelsRaf = requestAnimationFrame(() => {
        panelsRaf = 0;
        refreshPanels();
      });
    }
    scheduleProblems();
  });

  // ── Состояние сохранения ─────────────────────────────────────────────────
  const showSave = (state: SaveState): void => {
    saveStatus.className = `editor__save editor__save--${state.kind}`;
    saveStatus.textContent =
      state.kind === 'saved' ? (state.at > 0 ? `Сохранено в браузере ${formatTime(state.at)}` : 'Сохранено') : state.kind === 'saving' ? 'Сохранение…' : state.kind === 'dirty' ? 'Есть несохранённые правки…' : `⚠ ${state.message}`;
    if (state.kind === 'error') {
      banner.hidden = false;
      banner.textContent = `${state.message} Автосохранение не считается резервной копией.`;
    } else if (storageNote === '') banner.hidden = true;
  };
  session.onState = showSave;
  if (storageNote) {
    banner.hidden = false;
    banner.textContent = storageNote;
  }

  // ── Действия ─────────────────────────────────────────────────────────────

  async function useBundle(name: string): Promise<boolean> {
    try {
      bundle = await loadBundle(name);
      return true;
    } catch (error) {
      await showMessage('Профиль недоступен', [error instanceof Error ? error.message : String(error)], `Не удалось загрузить пакет данных «${name}».`);
      return false;
    }
  }

  /** Открыть документ вместо текущего. Если текущий проект сохранить не удалось, переключение отменяется. */
  async function adopt(doc: EditorDoc, images: Map<string, { mime: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: Uint8Array }>, note: string): Promise<void> {
    const previous = bundle;
    if (!(await useBundle(doc.pack))) return;
    try {
      await session.openDoc(doc, images);
    } catch (error) {
      bundle = previous;
      if (error instanceof SaveFailedError) {
        await showMessage('Переключение отменено', [error.message], 'Текущий проект не сохранён и остаётся открытым. Выгрузите архив проекта («Экспорт проекта (.zip)») или освободите место, затем повторите.');
        return;
      }
      throw error;
    }
    map.fit();
    recomputeProblems();
    say(note);
  }

  async function newProjectDialog(): Promise<void> {
    const name = el('input', { type: 'text', value: `Комната ${new Date().toLocaleDateString('ru-RU')}`, maxlength: '120', id: 'new-name', 'aria-label': 'Название' });
    const packSelect = el('select', { id: 'new-pack', 'aria-label': 'Профиль' }, ...PACKS.map((p) => el('option', { value: p.name }, p.label)));
    const floor = el('input', { type: 'checkbox', id: 'new-floor', checked: true });
    floor.checked = true;
    const choice = await showDialog(
      'Новая карта',
      [
        el('label', { class: 'field' }, el('span', { class: 'field__label' }, 'Название'), name),
        el('label', { class: 'field' }, el('span', { class: 'field__label' }, 'Профиль экрана и правил'), packSelect),
        el('label', { class: 'check' }, floor, 'Добавить ряд земли внизу и старт над ним'),
        el('p', { class: 'muted' }, 'Размер берётся из видимого поля выбранного профиля. Это шаблон редактора, а не оригинальный уровень.'),
      ],
      [{ label: 'Создать пустую комнату', primary: true }, { label: 'Копия demo-room из профиля «room»' }, { label: 'Отмена' }],
    );
    if (choice === 0) {
      const packName = packSelect.value;
      if (!(await useBundle(packName))) return;
      const title = name.value.trim() || 'Новая комната';
      const doc = newRoomDoc(bundle.pack, { projectId: projectId(), name: title, pack: packName, id: slugify(title, 'room'), floor: floor.checked });
      await adopt(doc, new Map(), `Создана карта «${title}».`);
    } else if (choice === 1) {
      if (!(await useBundle('room'))) return;
      const level = bundle.pack.levels.find((l) => l.id === bundle.pack.manifest.firstLevel) ?? bundle.pack.levels[0];
      if (!level) return;
      const doc = docFromLevel(level, { projectId: projectId(), name: `${level.id} (копия для редактирования)`, pack: 'room', id: level.id });
      await adopt(doc, new Map(), `Открыта копия «${level.id}».`);
    }
  }

  async function openProjects(): Promise<void> {
    const list = await session.list();
    await showDialog(
      'Проекты',
      (close) => {
        const items = list.map((meta) => {
          const row = el(
            'li',
            { class: 'projects__item' },
            el('div', {}, el('strong', {}, meta.name), el('small', {}, ` ${meta.levelId} · ${meta.width}×${meta.height} · ${new Date(meta.savedAt).toLocaleString('ru-RU')}${meta.projectId === store.doc.projectId ? ' · открыт' : ''}`)),
          );
          row.append(
            button('Открыть', () => {
              close();
              void (async () => {
                try {
                  const loaded = await drafts.load(meta.projectId);
                  if (!loaded) throw new ImportError('format', 'Черновик не найден.');
                  const doc = parseDoc(loaded.record.doc, 'черновик');
                  await adopt(doc, loaded.images, `Открыт проект «${doc.name}».`);
                } catch (error) {
                  await reportImportError('Не удалось открыть проект', error);
                }
              })();
            }, { disabled: meta.projectId === store.doc.projectId }),
            button('Удалить', () => {
              void (async () => {
                if (meta.projectId === store.doc.projectId) {
                  await showMessage('Нельзя удалить открытый проект', ['Сначала откройте другой проект или создайте новый.']);
                  return;
                }
                if (await confirmDialog('Удалить проект?', [el('p', {}, `Черновик «${meta.name}» и его фотографии будут удалены из этого браузера. Если нужен — сначала выгрузите архив.`)], 'Удалить')) {
                  await session.removeDraft(meta.projectId);
                  row.remove();
                }
              })();
            }, { class: 'btn btn--danger' }),
          );
          return row;
        });
        return [
          el('div', { class: 'row row--wrap' }, button('Новая карта…', () => { close(); void newProjectDialog(); }, { class: 'btn btn--primary' }), button('Дублировать текущую', () => {
            close();
            void session
              .duplicate()
              .then(() => {
                map.fit();
                recomputeProblems();
                say('Создана копия проекта.');
              })
              .catch((error: unknown) => reportImportError('Копия не создана', error));
          }), button('Импорт файла…', () => { close(); importInput.click(); })),
          list.length === 0 ? el('p', { class: 'muted' }, 'Сохранённых проектов пока нет.') : el('ul', { class: 'projects' }, ...items),
          el('p', { class: 'muted' }, 'Черновики хранятся только в этом браузере (IndexedDB). Для переноса на другой компьютер используйте «Экспорт проекта».'),
        ];
      },
      [{ label: 'Закрыть', primary: true }],
      { wide: true },
    );
  }

  async function reportImportError(title: string, error: unknown): Promise<void> {
    if (error instanceof ContentError) await showMessage(title, error.issues, `Рабочий документ не изменён. Проблемы в файле (${error.source}):`);
    else if (error instanceof ImportError) await showMessage(title, [error.message], 'Рабочий документ не изменён.');
    else await showMessage(title, [error instanceof Error ? error.message : String(error)], 'Рабочий документ не изменён.');
  }

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    void (async () => {
      if (file.size > ARCHIVE_LIMITS.maxTotalBytes) {
        await showMessage('Файл слишком большой', [`${(file.size / 1048576).toFixed(0)} МБ при пределе ${ARCHIVE_LIMITS.maxTotalBytes / 1048576} МБ.`], 'Рабочий документ не изменён.');
        return;
      }
      try {
        const parsed = await session.parseImport(new Uint8Array(await file.arrayBuffer()), file.name);
        await adopt(parsed.doc, parsed.images, `Импортирован ${parsed.kind === 'project' ? 'проект' : 'уровень'} «${parsed.doc.name}» как новый проект; предыдущий проект сохранён в черновиках.`);
      } catch (error) {
        await reportImportError('Не удалось импортировать файл', error);
      }
    })();
  });

  function exportProject(): void {
    try {
      const bytes = session.exportArchive();
      download(`${store.doc.id}.crocodile-project.zip`, bytes as BlobPart, 'application/zip');
      say(`Архив проекта выгружен: ${store.doc.id}.crocodile-project.zip (${(bytes.length / 1024).toFixed(0)} КБ).`);
    } catch (error) {
      void showMessage('Не удалось выгрузить архив', [error instanceof Error ? error.message : String(error)]);
    }
  }

  function exportGame(): void {
    const errors = errorsOf(diagnose(store.doc, env()));
    if (errors.length > 0) {
      void showMessage('Игровой JSON не выгружен', errors.map((p) => `${p.path}: ${p.message}`), 'Карта не проходит общий валидатор игры. Исправьте проблемы (они подсвечены на карте и перечислены в разделе «Проблемы»):');
      inspector.showProblems();
      return;
    }
    const unknown = store.doc.marks.filter((m) => m.status === 'unknown').length;
    download(`${store.doc.id}.json`, session.exportGameJson(), 'application/json');
    say(`Игровой JSON выгружен: ${store.doc.id}.json.${unknown > 0 ? ` В нём сохранены пометки наблюдений (неизвестных областей: ${unknown}).` : ''} Положите файл в public/content/<пакет>/levels/ и добавьте в pack.json.`);
  }

  async function resizeMap(width: number, height: number): Promise<void> {
    if (!validSize(width, height)) {
      say('Размер карты — целые числа от 1 до 256.', 'warn');
      signatureReset();
      return;
    }
    const { doc } = store;
    if (width === doc.width && height === doc.height) return;
    const plan = planResize(doc, width, height);
    if (plan.lossy) {
      map.setShrinkPreview(plan);
      const lines: string[] = [];
      if (plan.cutCells.length > 0) lines.push(`непустых клеток карты: ${plan.cutCells.length}`);
      if (plan.cutObjects.length > 0) lines.push(`объектов (будут удалены целиком, вместе с их переходами): ${plan.cutObjects.join(', ')}`);
      if (plan.cutMarks.length > 0) lines.push(`пометок (будут удалены): ${plan.cutMarks.join(', ')}`);
      if (plan.clippedMarks.length > 0) lines.push(`пометок (останется часть): ${plan.clippedMarks.join(', ')}`);
      if (plan.startCut) lines.push('точка старта окажется снаружи и будет сброшена');
      const ok = await confirmDialog(
        'Карта уменьшается: данные будут обрезаны',
        [el('p', {}, 'Красным на карте показано то, что исчезнет. Изменение можно отменить (Ctrl+Z).'), el('ul', { class: 'editor-dialog__list' }, ...lines.map((l) => el('li', {}, l)))],
        'Обрезать',
      );
      map.setShrinkPreview(null);
      if (!ok) {
        signatureReset();
        return;
      }
    }
    try {
      store.commit((d) => resizeDoc(d, width, height));
      say(`Размер карты: ${width}×${height}.${plan.lossy ? ' Обрезанное можно вернуть отменой.' : ''}`);
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), 'error');
    }
  }
  const signatureReset = (): void => {
    store.notify();
    refreshPanels();
  };

  async function addPhotos(files: readonly File[]): Promise<void> {
    const failures: string[] = [];
    let added: string | null = null;
    for (const file of files) {
      const result = await session.addPhoto(new Uint8Array(await file.arrayBuffer()), file.name);
      if (result.ok) added = result.ref.id;
      else failures.push(`${file.name}: ${result.message}`);
    }
    if (failures.length > 0) await showMessage('Не все фотографии добавлены', failures, 'Карта и остальные референсы не изменились.');
    if (added !== null) {
      if (store.ui.mode === 'map') store.patchUi({ mode: 'overlay' });
      say('Фото добавлено. Отметьте четыре угла игровой области, чтобы выпрямить перспективу.');
      if (files.length === 1) await startCalibration(added);
    }
  }

  async function startCalibration(refId: string): Promise<void> {
    const ref = store.doc.refs.find((r) => r.id === refId);
    const bitmap = photos.bitmapOf(refId);
    if (!ref || !bitmap) {
      say('Изображение референса не загружено: калибровка недоступна.', 'error');
      return;
    }
    calibrating?.destroy();
    const { columns, rows } = bundle.pack.screen.viewport;
    const view = new CalibrationView({
      ref,
      bitmap,
      photos,
      columns,
      rows,
      cellRatio: map.cellRatio,
      onDone: (quad) => {
        store.commit((d) => updateRef(d, refId, { quad }));
        closeCalibration();
        say('Калибровка сохранена. Подложка выпрямлена по четырём углам.');
      },
      onCancel: () => closeCalibration(),
    });
    calibrating = view;
    mapHost.hidden = true;
    stage.append(view.root);
    say('Калибровка: рабочая карта временно скрыта, рисовать нельзя.');
    map.request();
  }

  function closeCalibration(): void {
    calibrating?.destroy();
    calibrating?.root.remove();
    calibrating = null;
    mapHost.hidden = false;
    map.resize();
    map.request();
    refreshPanels();
  }

  function gotoProblem(problem: Problem): void {
    if (problem.objectId) store.select({ kind: 'object', id: problem.objectId });
    else if (problem.markId) store.select({ kind: 'mark', id: problem.markId });
    else if (problem.path.startsWith('$.start') && store.doc.start) store.select({ kind: 'start' });
    else if (problem.cell) store.select({ kind: 'cells', rect: { x: problem.cell.x, y: problem.cell.y, w: 1, h: 1 } });
    if (problem.cell) map.centerOn(problem.cell);
    say(`${problem.path}: ${problem.message}`, problem.severity === 'error' ? 'error' : 'warn');
  }

  function runTest(from: Pt | null): void {
    if (runner.active || calibrating) return;
    const doc = store.doc;
    const found = diagnoseForTest(doc, env());
    const errors = errorsOf(found);
    if (errors.length > 0) {
      problems = found;
      map.request();
      refreshPanels();
      inspector.showProblems();
      const first = errors[0];
      if (first) gotoProblem(first);
      void showMessage('Тест не запущен', errors.map((p) => `${p.path}: ${p.message}`), 'Карта не проходит общий валидатор игры, ничего не исправлено молча. Проблемы подсвечены на карте и перечислены в разделе «Проблемы»:');
      return;
    }
    if (from !== null && !store.isFreeCell(from.x, from.y)) {
      say('«Тест отсюда» доступен только для свободной клетки внутри карты.', 'warn');
      return;
    }
    // Копия карты из памяти: игровой уровень строится общим валидатором, документ не затрагивается.
    const level = structuredClone(validateLevel(gameLevelJson(doc), bundle.pack.assets, validation, doc.id));
    if (from !== null) level.start = { x: from.x, y: from.y };
    document.body.classList.add('editor--testing');
    editorView.hidden = true;
    runner.begin({
      pack: bundle.pack,
      assets: bundle.assets,
      level,
      startNote: from === null ? `Старт — из карты (${level.start.x}, ${level.start.y}).` : `«Тест отсюда»: старт (${from.x}, ${from.y}); сохранённая точка старта в карте не менялась.`,
      ghost: store.ui.showGhost,
      onExit: () => {
        document.body.classList.remove('editor--testing');
        editorView.hidden = false;
        map.resize();
        map.request();
        refreshPanels();
        map.canvas.focus({ preventScroll: true });
        say('Возврат из теста: карта, подложки, выделение и история не изменились.');
      },
    });
  }

  // ── Перетаскивание файлов на рабочую область ─────────────────────────────
  stage.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      stage.classList.add('editor__stage--drop');
    }
  });
  stage.addEventListener('dragleave', () => stage.classList.remove('editor__stage--drop'));
  stage.addEventListener('drop', (event) => {
    event.preventDefault();
    stage.classList.remove('editor__stage--drop');
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) void addPhotos(files);
  });

  // ── Подсказки под курсором ───────────────────────────────────────────────
  map.onHover = (cell) => {
    if (!cell) {
      hoverLine.textContent = '';
      return;
    }
    const { doc } = store;
    const char = doc.rows[cell.y]?.[cell.x];
    hoverLine.textContent = char === undefined ? `x: ${cell.x}, y: ${cell.y} · вне карты` : `x: ${cell.x}, y: ${cell.y} · «${char}»${doc.legend[char]?.collision === 'solid' ? ' · занято' : ''} · ${Math.round(map.view.scale)} px/клетка`;
  };

  // ── Горячие клавиши (отключены в тесте, диалогах и полях ввода) ───────────
  window.addEventListener('keydown', (event) => {
    if (runner.active || calibrating || modalOpen()) return;
    if (isTextEntry(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    const plain = event.target === document.body || event.target === map.canvas;
    if (event.code === 'Space' && plain) {
      event.preventDefault();
      if (!event.repeat) map.setSpace(true);
      return;
    }
    if (mod) {
      switch (event.code) {
        case 'KeyZ':
          event.preventDefault();
          if (event.shiftKey) store.redo();
          else store.undo();
          return;
        case 'KeyY':
          event.preventDefault();
          store.redo();
          return;
        case 'KeyC':
          event.preventDefault();
          if (!store.copy()) say('Выделите клетки инструментом «Выделение», чтобы скопировать.', 'warn');
          return;
        case 'KeyX':
          event.preventDefault();
          if (store.copy()) store.deleteSelection();
          return;
        case 'KeyV':
          event.preventDefault();
          if (!store.paste()) say('Буфер пуст: сначала скопируйте участок.', 'warn');
          return;
        case 'KeyD':
          event.preventDefault();
          if (!store.duplicate()) say('Выделите клетки, чтобы дублировать участок.', 'warn');
          return;
        case 'KeyA':
          event.preventDefault();
          store.selectAll();
          return;
        default:
          return;
      }
    }
    if (event.altKey) return;
    if (event.code === 'Delete' || event.code === 'Backspace') {
      if (!plain) return;
      event.preventDefault();
      store.deleteSelection();
      return;
    }
    if (event.code === 'Escape') {
      if (tools.dragging) tools.cancel();
      else store.select(null);
      return;
    }
    if (!plain) return;
    const tool = TOOL_KEYS[event.code];
    if (tool && !event.shiftKey) {
      event.preventDefault();
      store.setTool(tool);
      say(`${TOOL_LABELS[tool]?.label ?? tool}: ${TOOL_LABELS[tool]?.hint ?? ''}`);
      return;
    }
    if (event.key === '+' || event.key === '=') map.zoomBy(1.25);
    else if (event.key === '-') map.zoomBy(1 / 1.25);
    else if (event.key === '0') map.fit();
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') map.setSpace(false);
  });

  // ── Несохранённое не теряется при закрытии вкладки ───────────────────────
  window.addEventListener('beforeunload', (event) => {
    if (session.dirty) {
      void session.flush();
      event.preventDefault();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void session.flush();
  });
  window.addEventListener('pagehide', () => void session.flush());

  // ── Запуск ───────────────────────────────────────────────────────────────
  try {
    await session.openDoc(startDoc, initialImages, { alreadySaved: initial !== null });
  } catch (error) {
    // Первое сохранение не удалось (например, нет места): работаем в памяти, предупреждение уже показано.
    say(error instanceof Error ? error.message : String(error), 'error');
  }
  // Редактор готов: показываем его и скрываем страницу игры.
  root.hidden = false;
  document.body.classList.add('route-editor--ready');
  recomputeProblems();
  refreshPanels();
  map.resize();
  map.fit();
  const photoFailures = bundle.warnings;
  say([restoreNote, photoFailures.length > 0 ? photoFailures.join(' ') : '', 'Выберите инструмент слева и рисуйте на карте; Space + перетаскивание — перемещение, колесо — масштаб.'].filter((s) => s !== '').join(' '));
  root.dataset['ready'] = 'true';
}
