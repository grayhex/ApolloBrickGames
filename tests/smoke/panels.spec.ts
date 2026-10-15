import { expect, test, type Page } from '@playwright/test';

/**
 * Панели вокруг игрушки: слева справка по упаковке и схема управления (вся помещается в окне без прокрутки), справа «пульт» —
 * мини-блок «Звук» с музыкой, блок «Вид» (цвет текущей игры, свёрнута / полная / только экран, сегменты), выбор уровней
 * (оригинальные 1–9 плитками, пользовательские — выпадающим списком) и спидран-HUD; в уголке — фон и значок устройства.
 */

// Смена маршрута перезагружает страницу: пока идёт перезагрузка, значение читать нельзя — это просто «ещё нет».
const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const level = (page: Page) => (): Promise<string> => area(page, 'level');

async function ready(page: Page): Promise<void> {
  await page.goto('./?power=on');
  await expect.poll(phase(page)).toBe('ready');
}

/** Кладёт запись черновика прямо в IndexedDB редактора (как если бы её сохранил редактор). */
async function putDraft(page: Page, record: { meta: Record<string, unknown>; doc: unknown }): Promise<void> {
  await page.evaluate(
    (rec) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('crocodile-mario-editor', 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          db.createObjectStore('projects', { keyPath: 'meta.projectId' });
          db.createObjectStore('images', { keyPath: 'key' }).createIndex('byProject', 'projectId');
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('projects', 'readwrite');
          tx.objectStore('projects').put(rec);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    record,
  );
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

test('слева справка, справа пульт; панели отодвинуты от игрушки, страница не прокручивается', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); // достаточно высокое окно: в невысоких вводный абзац справки скрывается
  await ready(page);
  const m = await page.evaluate(() => {
    const rect = (selector: string): DOMRect => (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
    const info = rect('#side-info');
    const ctl = rect('#side-ctl');
    const toy = rect('#toy');
    return {
      info: { left: info.left, right: info.right },
      ctl: { left: ctl.left, right: ctl.right },
      toy: { left: toy.left, right: toy.right },
      vw: window.innerWidth,
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
    };
  });
  expect(m.info.right).toBeLessThanOrEqual(m.toy.left - 40); // панели отодвинуты от игры
  expect(m.ctl.left).toBeGreaterThanOrEqual(m.toy.right + 40);
  // и прижаты к краям окна: до края ближе, чем до игрушки
  expect(m.info.left).toBeLessThan(m.toy.left - m.info.right);
  expect(m.vw - m.ctl.right).toBeLessThan(m.ctl.left - m.toy.right);
  expect(m.info.left).toBeGreaterThanOrEqual(0);
  expect(m.ctl.right).toBeLessThanOrEqual(m.vw);
  expect(m.scrollH).toBeLessThanOrEqual(m.innerH + 1);

  const info = page.locator('#side-info');
  await expect(info.getByRole('heading', { name: 'Путешествие Марио' })).toBeVisible();
  await expect(info.getByRole('heading', { name: 'Управление' })).toBeVisible();
  await expect(info.getByRole('heading', { name: 'Очки' })).toBeVisible();
  await expect(info.getByRole('heading', { name: 'Фигуры и враги' })).toBeVisible();
  for (const text of ['Heart', 'Small devil', 'Big devil', '+100', '+200', '+400']) {
    await expect(info.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await expect(info.locator('.facts li')).toHaveCount(3);
  await expect(info.locator('.hazard')).toHaveCount(5); // река, чёрт, огненный дракон, ракета, железные ворота
  // «Figure introduction» с упаковки: 11 фигур (Heart и Bullet — одна: выстрел рисуется тем же сердечком), нарисованных теми же LCD-ячейками, что и игра.
  await expect(info.locator('#figures .fig')).toHaveCount(11);
  await expect(info.locator('#figures .fig__dot')).toHaveCount(0);
  // Названия фигур — по-английски, как на упаковке, и при русском интерфейсе.
  await expect(info.locator('#figures .fig__name')).toHaveText([
    'Mario', 'Heart / Bullet', 'Small devil', 'Big devil', 'Missile', 'Fiery dragon', 'Iron gate', 'Extension bridge', 'Sewer', 'Volcano', 'Tetris',
  ]);
  await expect(info.locator('#figures .spr').first()).toBeVisible();
  await expect(info.locator('.score__row')).toHaveText([/Heart.*100/, /Small devil.*200.*20/, /Big devil.*400/]);
  // «Оригинальное устройство» и примечание про приблизительные правила в левой панели больше нет (сведения — в справке).
  await expect(info.locator('#original-device, .orig, .side__note, .side__pad')).toHaveCount(0);
  await expect(info).not.toContainText('приблизительные');
  // Справка — фон: приглушена и без картинок кнопок корпуса.
  expect(Number(await info.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(0.8);
  await expect(info.locator('.kk, .kmap')).toHaveCount(0);
  const ctl = page.locator('#side-ctl');
  for (const name of ['Звук', 'Вид', 'Уровни']) await expect(ctl.getByRole('heading', { name, exact: true })).toBeVisible();
  // Спидран — последний блок; индикатор устройства и фон переехали в угловое меню.
  expect(await ctl.evaluate((e) => (e.lastElementChild as HTMLElement).id)).toBe('run');
  await expect(ctl.locator('#devices, #tgl-theme, #open-editor')).toHaveCount(0);
  await expect(page.locator('#devices')).toBeVisible();
  await expect(page.locator('#corner #corner-theme')).toBeVisible();
});

test('левая справка помещается в окне без прокрутки — и в невысоких окнах', async ({ page }) => {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
  ] as const) {
    await page.setViewportSize({ width, height });
    await ready(page);
    const fit = await page.locator('#side-info').evaluate((e) => ({ scroll: e.scrollHeight, client: e.clientHeight }));
    expect(fit.scroll, `${width}×${height}: справка без прокрутки`).toBeLessThanOrEqual(fit.client + 1);
  }
});

test('схема управления слева следует за переназначением клавиш', async ({ page }) => {
  await ready(page);
  const keymap = page.locator('#keymap');
  await expect(keymap).toContainText('Пробел');
  const fire = keymap.locator('.keys__row', { hasText: 'Огонь' });
  await expect(fire).toContainText('X');
  await page.locator('#corner-settings').click();
  await page.locator('[data-key="kb:fire"]').click(); // «Назначить» у «Огонь»
  await page.keyboard.press('KeyV');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#settings')).toBeHidden();
  await expect(fire).toContainText('V');
  await expect(fire).not.toContainText('X');
});

test('пульт: звук следует за SOUND, музыка, сегменты, состояние вида, фон в уголке — выбор запоминается', async ({ page }) => {
  await ready(page);
  const toggle = (id: string) => page.locator(`#tgl-${id}`);
  await expect(toggle('sound')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-key="sound"]').click(); // кнопка на корпусе
  await expect(toggle('sound')).toHaveAttribute('aria-pressed', 'false');
  await toggle('sound').click();
  await expect(toggle('sound')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#game-area')).toBeFocused(); // после клика мышью клавиатура вернулась игре

  // Музыка: «Оригинал» по умолчанию, «Ремастер» запоминается (нет записи public/audio/remaster.m4a — звучит оригинал, об этом подсказка).
  const music = (id: string) => page.locator(`#music [data-music="${id}"]`);
  await expect(music('original')).toHaveAttribute('aria-pressed', 'true');
  await expect(music('remaster')).toHaveAttribute('aria-pressed', 'false');
  await expect(music('remaster')).toHaveAttribute('title', /звучит оригинальная мелодия/);
  await music('remaster').click();
  await expect(music('remaster')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#game-area')).toHaveAttribute('data-music', 'remaster');

  await expect(toggle('ghost')).toHaveAttribute('aria-pressed', 'true');
  await toggle('ghost').click();
  await expect(toggle('ghost')).toHaveAttribute('aria-pressed', 'false');

  // Состояние игрушки: «Только экран» и «Свёрнута».
  const state = (id: string) => page.locator(`#view-${id}`);
  await expect(state('full')).toHaveAttribute('aria-pressed', 'true');
  await state('screen').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-compact', '');
  await expect(page.locator('#arena')).toHaveAttribute('data-compact', '');
  await expect(state('screen')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#side-ctl')).toBeVisible(); // пульт остаётся, чтобы вернуть игрушку целиком
  await state('full').click();
  // Включённую игрушку не закрыть — «Свёрнута» доступна, только когда игра выключена кнопкой ON/OFF.
  await expect(state('closed')).toHaveAttribute('aria-disabled', 'true');
  await page.locator('[data-key="onoff"]').click();
  await expect(state('closed')).not.toHaveAttribute('aria-disabled', 'true');
  await state('closed').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-closed', '');
  await expect(page.locator('#toy')).not.toHaveAttribute('data-compact', '');
  await state('full').click();
  await expect(page.locator('#toy')).not.toHaveAttribute('data-closed', '');

  // Фон — в угловом меню рядом с языком.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  await page.locator('#corner-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).not.toBe(dark);

  await page.reload();
  await expect.poll(phase(page)).toBe('ready');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // фон, музыка, сегменты и звук запомнены
  await expect(music('remaster')).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle('ghost')).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle('sound')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#corner-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('вид игрушки не запоминается: после перезагрузки она закрыта', async ({ page }) => {
  await page.goto('./?view=screen');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready'); // не уходить со страницы, пока грузится пакет: оборванный запрос — лишняя ошибка в консоли
  await page.goto('./');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
  await expect(page.locator('#view-closed')).toHaveAttribute('aria-pressed', 'true');
});

test('технические страницы остаются тёмными, даже если на игрушке выбран светлый фон', async ({ page }) => {
  await ready(page);
  await page.locator('#corner-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('./#/tech');
  await expect(page.locator('#badge')).toHaveText('ENGINE DEMO');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#side-info')).toBeHidden(); // панелей на технической странице нет
  await expect(page.locator('#side-ctl')).toBeHidden();
});

test('уровни: девять оригинальных открыты (геймплейное приближение); выбор запускает выбранный уровень и перезапускает игру', async ({ page }) => {
  await ready(page);
  const tiles = page.locator('#original-levels .lv');
  await expect(tiles).toHaveCount(9);
  await expect(tiles.nth(0)).toHaveAttribute('aria-current', 'true');
  for (let i = 0; i < 9; i++) await expect(tiles.nth(i)).not.toHaveAttribute('aria-disabled', 'true');
  expect(await level(page)()).toBe('mario-1');
  expect(await area(page, 'hud')).toBe('1-01');

  // Выбор другого уровня: игра начинается заново на нём, подпись HUD меняется, плитка подсвечена, клавиатура у игры.
  await tiles.nth(4).click();
  await expect.poll(level(page)).toBe('mario-5');
  await expect.poll(phase(page)).toBe('ready');
  await expect(tiles.nth(4)).toHaveAttribute('aria-current', 'true');
  await expect(tiles.nth(0)).not.toHaveAttribute('aria-current', 'true');
  expect(await area(page, 'hud')).toBe('1-05');
  await expect(page.locator('#game-area')).toBeFocused();

  // Игра идёт, выбор уровня начинает её заново; у каждого уровня — тот же старт: яма и сценарий выхода.
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');
  expect(await area(page, 'heroX')).toBe('2');
  expect(await area(page, 'heroY')).toBe('2');
  await tiles.nth(8).click();
  await expect.poll(phase(page)).toBe('ready');
  expect(await level(page)()).toBe('mario-9');
  expect(await area(page, 'hud')).toBe('1-09');
  await expect(page.locator('#game-area')).toBeFocused();

  // Пользовательские уровни — выпадающий список: готовый «Генерация 1» и (пока пустая) группа карт из редактора; ссылки на редактор в пульте нет.
  const select = page.locator('#user-level');
  await expect(select.locator('option')).toHaveText(['Выберите уровень…', 'Генерация 1', 'Карт из редактора пока нет']);
  await expect(select.locator('optgroup')).toHaveCount(2);
  await expect(page.locator('#side-ctl a[href^="#/editor"]')).toHaveCount(0);

  await select.selectOption('bundled:custom-1');
  await expect.poll(level(page)).toBe('custom-1');
  await expect.poll(phase(page)).toBe('ready');
  expect(await area(page, 'hud')).toBe('U-01');
  await expect(page.locator('#original-levels .lv[aria-current="true"]')).toHaveCount(0);
  await expect(page.locator('#game-area')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off'); // тот же старт из ямы, что у оригинальных
  await tiles.nth(0).click(); // назад к оригинальному уровню 1: список возвращается к подсказке
  await expect.poll(level(page)).toBe('mario-1');
  await expect(select).toHaveValue('');
});

test('?level=custom-1 открывает готовый пользовательский уровень сразу', async ({ page }) => {
  await page.goto('./?level=custom-1&power=on');
  await expect.poll(phase(page)).toBe('ready');
  expect(await level(page)()).toBe('custom-1');
  await expect(page.locator('#user-level')).toHaveValue('bundled:custom-1');
});

test('?level=N открывает уровень N сразу; неверное значение — уровень 1', async ({ page }) => {
  await page.goto('./?level=7&power=on');
  await expect.poll(phase(page)).toBe('ready');
  expect(await level(page)()).toBe('mario-7');
  await expect(page.locator('#original-levels .lv').nth(6)).toHaveAttribute('aria-current', 'true');
  await page.goto('./?level=42&power=on');
  await expect.poll(phase(page)).toBe('ready');
  expect(await level(page)()).toBe('mario-1');
});

test('карты из редактора: попадают в выпадающий список «Пользовательские», запускаются; сломанные названы и недоступны', async ({ page }) => {
  // 1. Создаём карту в самом редакторе (пустая комната) и возвращаемся к игре.
  await page.goto('./#/editor');
  await page.waitForSelector('#editor-root[data-ready="true"]');
  await page.click('#editor-projects');
  await page.getByRole('button', { name: 'Новая карта…' }).click();
  await page.locator('#new-name').fill('Моя карта');
  await page.getByRole('button', { name: 'Создать пустую комнату' }).click();
  await expect(page.locator('#editor-project')).toContainText('Моя карта');
  await expect(page.locator('#editor-save')).toContainText('Сохранено');
  await putDraft(page, {
    meta: { projectId: 'broken-1', name: 'Сломанная карта', levelId: 'broken', width: 3, height: 3, savedAt: 1 },
    doc: { мусор: true },
  });
  await page.goto('./?power=on#/');
  await expect.poll(phase(page)).toBe('ready');

  const select = page.locator('#user-level');
  const mine = select.locator('option', { hasText: 'Моя карта' });
  await expect(mine).toHaveText('Моя карта (13×6)');
  const broken = select.locator('option', { hasText: 'Сломанная карта' });
  await expect(broken).toBeDisabled();
  expect(await broken.getAttribute('title')).toMatch(/Не запускается/); // причина названа
  expect(await select.locator('option').allTextContents()).toEqual(['Выберите уровень…', 'Генерация 1', 'Моя карта (13×6)', '⚠ Сломанная карта']);

  // 2. Запуск: уровень меняется, игра готова к старту и проходится как обычно.
  const value = await mine.getAttribute('value');
  expect(value).toMatch(/^user:/);
  await select.selectOption(value ?? '');
  await expect.poll(level(page)).toBe('room');
  await expect.poll(phase(page)).toBe('ready');
  await expect(select).toHaveValue(value ?? '');
  await expect(page.locator('#original-levels .lv[aria-current="true"]')).toHaveCount(0);
  await expect(page.locator('#game-area')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  expect(await area(page, 'heroX')).toBe('1'); // старт карты из редактора
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => Number(await area(page, 'heroX'))).toBeGreaterThan(2);
  await page.keyboard.up('ArrowRight');

  // 3. Назад к оригинальному уровню 1.
  await page.locator('#original-levels .lv').nth(0).click();
  await expect.poll(level(page)).toBe('mario-1');
  await expect(page.locator('#original-levels .lv').nth(0)).toHaveAttribute('aria-current', 'true');

  // 4. Редактор открывается кнопкой в уголке (в пульте дубля нет) — на последней сохранённой карте.
  await page.locator('#corner-editor').click();
  await page.waitForSelector('#editor-root[data-ready="true"]');
  await expect(page.locator('#editor-project')).toContainText('Моя карта');
});

test('спидран-HUD: скрыт под переключателем и выезжает по щелчку; время идущего уровня растёт, рестарт обнуляет', async ({ page }) => {
  await ready(page);
  const toggle = page.locator('#run-toggle');
  const panel = page.locator('#run-panel');
  const total = page.locator('#run-total');
  const timeOf = async (): Promise<number> => {
    const [m, rest = ''] = ((await total.textContent()) ?? '0:00.0').split(':');
    return Number(m) * 60 + Number(rest);
  };
  // По умолчанию скрыт: переключатель есть, самого блока на экране нет.
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(page.locator('#run-rows .run__row')).toHaveCount(9);
  await expect(page.locator('#run-rows .run__row[data-state="current"]')).toHaveCount(1);
  await expect(page.locator('#run-rows .run__row[data-level="mario-1"]')).toHaveAttribute('data-state', 'current');
  await expect(page.locator('#run-progress')).toHaveText('0 / 9');

  // До старта время стоит, после старта идёт.
  expect(await timeOf()).toBe(0);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(timeOf, { timeout: 8000 }).toBeGreaterThan(1.5);
  await expect(page.locator('#run-rows .run__row[data-level="mario-1"] .run__time')).not.toHaveText('—');
  await expect(page.locator('#run-rows .run__row[data-level="mario-2"] .run__time')).toHaveText('—');

  // Пауза останавливает счёт.
  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('paused');
  const frozen = await timeOf();
  await page.waitForTimeout(700);
  expect(await timeOf()).toBe(frozen);

  // Рестарт (выключить и включить) обнуляет забег.
  await page.locator('[data-key="onoff"]').click();
  await page.locator('[data-key="onoff"]').click();
  await expect.poll(timeOf, { timeout: 3000 }).toBeLessThan(frozen);
  await expect(total).toHaveText('0:00.0');

  // Выбор другого уровня начинает забег с него.
  await page.locator('#original-levels .lv').nth(2).click();
  await expect(page.locator('#run-rows .run__row[data-level="mario-3"]')).toHaveAttribute('data-state', 'current');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
});

test('значок устройства: клавиатура всегда, геймпад появляется при подключении и подсвечивается, когда им играют', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __pads: unknown[] };
    w.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { value: () => w.__pads, configurable: true });
  });
  const setPad = (pressed: number[]): Promise<void> =>
    page.evaluate((pressed) => {
      const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
      (window as unknown as { __pads: unknown[] }).__pads = [
        { id: 'Panel Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] },
      ];
    }, pressed);
  await ready(page);
  const keyboard = page.locator('#devices [data-device="keyboard"]');
  const gamepad = page.locator('#devices [data-device="gamepad"]');
  await expect(keyboard).toBeVisible();
  await expect(keyboard).toHaveAttribute('data-state', 'on');
  await expect(gamepad).toBeHidden(); // геймпада нет — значка нет

  await setPad([]); // подключён, но ещё не нажимался
  await expect(gamepad).toBeVisible();
  await expect(gamepad).toHaveAttribute('data-state', 'ready');
  await expect(keyboard).toHaveAttribute('data-state', 'on');

  await setPad([0]); // активация нажатием кнопки
  await expect(gamepad).toHaveAttribute('data-state', 'on');
  await expect(keyboard).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#devices')).toHaveAttribute('data-input', 'gamepad');
  await expect(gamepad).toHaveAttribute('title', /Panel Pad/);
  await setPad([]);

  await page.keyboard.press('ArrowRight'); // снова играют с клавиатуры
  await expect(keyboard).toHaveAttribute('data-state', 'on');
  await expect(gamepad).toHaveAttribute('data-state', 'ready');

  await page.evaluate(() => ((window as unknown as { __pads: unknown[] }).__pads = [])); // отключили
  await expect(gamepad).toBeHidden();
});

test('узкий экран: игрушка сверху во всю ширину, панели под ней, горизонтальной прокрутки нет', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const m = await page.evaluate(() => {
    const rect = (selector: string): DOMRect => (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
    return {
      toy: rect('#toy'),
      ctl: rect('#side-ctl'),
      info: rect('#side-info'),
      innerH: window.innerHeight,
      vw: window.innerWidth,
      scrollW: document.documentElement.scrollWidth,
    };
  });
  expect(m.toy.width).toBeGreaterThanOrEqual(m.vw * 0.94); // оригинальная игрушка масштабируется на всю ширину экрана; подбородок ниже окна
  expect(m.ctl.top).toBeGreaterThanOrEqual(m.toy.bottom - 1);
  expect(m.info.top).toBeGreaterThanOrEqual(m.ctl.bottom - 1);
  expect(m.ctl.right).toBeLessThanOrEqual(m.vw + 1);
  expect(m.scrollW).toBeLessThanOrEqual(m.vw + 1);
  // Панель доступна прокруткой: цвет игрушки выбирается и здесь.
  await page.locator('#shell-picker [data-shell="yellow"]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'yellow');
});

test('сегменты — пиктограмма в системном меню рядом с фоном и языком', async ({ page }) => {
  await ready(page);
  const box = async (selector: string) => (await page.locator(selector).boundingBox()) ?? { width: 0, height: 0 };
  const ghost = await box('#tgl-ghost');
  const panel = await box('#side-ctl');
  expect(ghost.height).toBeLessThanOrEqual(40);
  expect(ghost.width).toBeLessThan(panel.width * 0.6);
  await expect(page.locator('#corner #tgl-ghost')).toHaveAccessibleName('Сегменты');
  await expect(page.locator('#tgl-ghost svg')).toBeVisible();
  await expect(page.locator('#side-ctl #tgl-ghost')).toHaveCount(0);
});

test('список пользовательских уровней оформлен как остальные элементы пульта, в обеих темах', async ({ page }) => {
  await ready(page);
  const style = (): Promise<{ appearance: string; radius: string; option: string; group: string; panel: string; font: string; border: string }> =>
    page.evaluate(() => {
      const select = document.getElementById('user-level') as HTMLSelectElement;
      const option = select.querySelector('option') as HTMLElement;
      const group = select.querySelector('optgroup') as HTMLElement;
      const seg = getComputedStyle(document.querySelector('.seg') as HTMLElement);
      const own = getComputedStyle(select);
      return {
        appearance: own.appearance,
        radius: own.borderRadius,
        option: getComputedStyle(option).backgroundColor,
        group: getComputedStyle(group).color,
        panel: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(),
        font: own.fontFamily,
        border: `${own.borderTopColor}|${seg.borderTopColor}`,
      };
    });
  const dark = await style();
  expect(dark.appearance).toBe('none'); // своя стрелка и рамка, а не системный список
  expect(dark.option).toBe('rgb(29, 34, 38)'); // фон строк списка — цвет панели (#1d2226), не системный белый
  const [own, seg] = dark.border.split('|');
  expect(own).toBe(seg); // рамка — как у соседних сегментных переключателей
  await page.locator('#corner-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const light = await style();
  expect(light.option).toBe('rgb(255, 255, 255)'); // светлая тема: белая панель
  expect(light.group).not.toBe(dark.group);
});

test('индикатор паузы слева рядом с клавиатурой: горит, пока игра на паузе', async ({ page }) => {
  await ready(page);
  const pause = page.locator('#devices [data-device="pause"]');
  const keyboard = page.locator('#devices [data-device="keyboard"]');
  await expect(pause).toBeVisible();
  const [p, k] = await Promise.all([pause.boundingBox(), keyboard.boundingBox()]);
  expect(Math.abs((p?.y ?? 0) - (k?.y ?? 99))).toBeLessThan(2); // в одном ряду с клавиатурой
  expect(Math.abs((p?.x ?? 0) - ((k?.x ?? 0) + (k?.width ?? 0)))).toBeLessThan(12); // и вплотную к ней
  await expect(pause).toHaveAttribute('data-state', 'off');
  await expect(pause).toHaveAttribute('title', 'Игра не на паузе');
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect(pause).toHaveAttribute('data-state', 'off');
  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('paused');
  await expect(pause).toHaveAttribute('data-state', 'on');
  await expect(pause).toHaveAttribute('title', 'Игра на паузе');
  await expect(pause).toHaveCSS('color', 'rgb(185, 211, 122)'); // акцентный значок в общем стиле меню
  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('playing');
  await expect(pause).toHaveAttribute('data-state', 'off');
  // Выключенная игра не «на паузе»: индикатор гаснет.
  await page.keyboard.press('Escape');
  await expect(pause).toHaveAttribute('data-state', 'on');
  await page.locator('[data-key="onoff"]').click();
  await expect(pause).toHaveAttribute('data-state', 'off');
  await page.locator('#corner-lang').click();
  await expect(pause).toHaveAttribute('title', 'Game is not paused');
});

