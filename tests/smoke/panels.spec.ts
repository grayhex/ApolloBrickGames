import { expect, test, type Page } from '@playwright/test';

/**
 * Панели вокруг игрушки: слева справка по упаковке и схема управления, справа «пульт» — кнопки звука, сегментов,
 * вида экрана и фона, цвет текущей игры, выбор уровней (оригинальные 1–9 и карты из редактора), значок устройства.
 */

// Смена маршрута перезагружает страницу: пока идёт перезагрузка, значение читать нельзя — это просто «ещё нет».
const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const level = (page: Page) => (): Promise<string> => area(page, 'level');

async function ready(page: Page): Promise<void> {
  await page.goto('./');
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
  for (const text of ['MARIO', 'TETRIS', 'SHOOTING', 'Сердце', 'Малый чёрт', 'Большой чёрт', '+100', '+200', '+400']) {
    await expect(info.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await expect(info.locator('.facts li')).toHaveCount(3);
  await expect(info.locator('.hazard')).toHaveCount(5); // река, чёрт, огненный дракон, ракета, железные ворота
  // «Figure introduction» с упаковки: 12 фигур, нарисованных теми же LCD-ячейками, что и игра.
  await expect(info.locator('#figures .fig')).toHaveCount(12);
  await expect(info.locator('#figures .fig__name')).toHaveText([
    'Марио', 'Сердце', 'Малый чёрт', 'Большой чёрт', 'Ракета', 'Огненный дракон', 'Пуля', 'Железные ворота', 'Выдвижной мост', 'Колодец', 'Вулкан', 'Тетрис',
  ]);
  await expect(info.locator('#figures .spr').first()).toBeVisible();
  await expect(info.locator('.score__fig .spr').first()).toBeVisible();
  // Справка — фон: приглушена и без картинок кнопок корпуса.
  expect(Number(await info.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(0.8);
  await expect(info.locator('.kk, .kmap')).toHaveCount(0);
  await expect(page.locator('#side-ctl').getByRole('heading', { name: 'Цвет игрушки' })).toBeVisible();
  await expect(page.locator('#side-ctl').getByRole('heading', { name: 'Уровни' })).toBeVisible();
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

test('кнопки пульта: звук следует за SOUND, сегменты, вид экрана, светлый и тёмный фон — всё запоминается', async ({ page }) => {
  await ready(page);
  const toggle = (id: string) => page.locator(`#tgl-${id}`);
  await expect(toggle('sound')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-key="sound"]').click(); // кнопка на корпусе
  await expect(toggle('sound')).toHaveAttribute('aria-pressed', 'false');
  await toggle('sound').click();
  await expect(toggle('sound')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#game-area')).toBeFocused(); // после клика мышью клавиатура вернулась игре

  await expect(toggle('ghost')).toHaveAttribute('aria-pressed', 'true');
  await toggle('ghost').click();
  await expect(toggle('ghost')).toHaveAttribute('aria-pressed', 'false');

  await toggle('compact').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-compact', '');
  await expect(page.locator('#arena')).toHaveAttribute('data-compact', '');
  await expect(page.locator('#side-ctl')).toBeVisible(); // пульт остаётся, чтобы вернуть игрушку целиком

  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  await toggle('theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).not.toBe(dark);

  await page.reload();
  await expect.poll(phase(page)).toBe('ready');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // фон, вид экрана, сегменты и звук запомнены
  await expect(page.locator('#toy')).toHaveAttribute('data-compact', '');
  await expect(toggle('ghost')).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle('sound')).toHaveAttribute('aria-pressed', 'true');
  await toggle('theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('технические страницы остаются тёмными, даже если на игрушке выбран светлый фон', async ({ page }) => {
  await ready(page);
  await page.locator('#tgl-theme').click();
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

  // Пустой список карт редактора — подсказка и ссылка на редактор.
  await expect(page.locator('#user-levels')).toContainText('Нарисуйте уровень в редакторе');
  await expect(page.locator('#open-editor')).toHaveAttribute('href', '#/editor');
});

test('?level=N открывает уровень N сразу; неверное значение — уровень 1', async ({ page }) => {
  await page.goto('./?level=7');
  await expect.poll(phase(page)).toBe('ready');
  expect(await level(page)()).toBe('mario-7');
  await expect(page.locator('#original-levels .lv').nth(6)).toHaveAttribute('aria-current', 'true');
  await page.goto('./?level=42');
  await expect.poll(phase(page)).toBe('ready');
  expect(await level(page)()).toBe('mario-1');
});

test('карты из редактора: появляются в «Пользовательских», запускаются, открываются в редакторе; сломанные названы', async ({ page }) => {
  // 1. Создаём карту в самом редакторе (копия demo-room) и возвращаемся к игре.
  await page.goto('./#/editor');
  await page.waitForSelector('#editor-root[data-ready="true"]');
  await page.click('#editor-projects');
  await page.getByRole('button', { name: 'Новая карта…' }).click();
  await page.getByRole('button', { name: /Копия demo-room/ }).click();
  await expect(page.locator('#editor-project')).toContainText('demo-room');
  await expect(page.locator('#editor-save')).toContainText('Сохранено');
  await putDraft(page, {
    meta: { projectId: 'broken-1', name: 'Сломанная карта', levelId: 'broken', width: 3, height: 3, savedAt: 1 },
    doc: { мусор: true },
  });
  await page.goto('./#/');
  await expect.poll(phase(page)).toBe('ready');

  const list = page.locator('#user-levels');
  const copy = list.locator('.uv__item', { hasText: 'demo-room' });
  await expect(copy).toBeVisible();
  await expect(copy.locator('.uv__size')).toHaveText('13×6');
  const broken = list.locator('.uv__item', { hasText: 'Сломанная карта' });
  await expect(broken.locator('.uv__go')).toHaveAttribute('aria-disabled', 'true');
  await expect(broken.locator('.uv__why')).not.toBeEmpty(); // причина названа

  // 2. Запуск: уровень меняется, игра готова к старту и проходится как обычно.
  await broken.locator('.uv__go').click({ force: true });
  expect(await level(page)()).toBe('mario-1'); // сломанная карта не запускается
  await copy.locator('.uv__go').click();
  await expect.poll(level(page)).toBe('demo-room');
  await expect.poll(phase(page)).toBe('ready');
  await expect(copy.locator('.uv__go')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#original-levels .lv[aria-current="true"]')).toHaveCount(0);
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

  // 4. «Карандаш» открывает именно эту карту в редакторе.
  await copy.locator('.uv__edit').click();
  await page.waitForSelector('#editor-root[data-ready="true"]');
  await expect(page.locator('#editor-project')).toContainText('demo-room');
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
  await expect(page.locator('#side-ctl')).toHaveAttribute('data-input', 'gamepad');
  await expect(gamepad).toHaveAttribute('title', /Panel Pad/);
  await setPad([]);

  await page.keyboard.press('ArrowRight'); // снова играют с клавиатуры
  await expect(keyboard).toHaveAttribute('data-state', 'on');
  await expect(gamepad).toHaveAttribute('data-state', 'ready');

  await page.evaluate(() => ((window as unknown as { __pads: unknown[] }).__pads = [])); // отключили
  await expect(gamepad).toBeHidden();
});

test('узкий экран: игрушка целиком сверху, панели под ней, горизонтальной прокрутки нет', async ({ page }) => {
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
  expect(m.toy.bottom).toBeLessThanOrEqual(m.innerH + 1); // игрушка по-прежнему целиком в окне
  expect(m.ctl.top).toBeGreaterThanOrEqual(m.toy.bottom - 1);
  expect(m.info.top).toBeGreaterThanOrEqual(m.ctl.bottom - 1);
  expect(m.ctl.right).toBeLessThanOrEqual(m.vw + 1);
  expect(m.scrollW).toBeLessThanOrEqual(m.vw + 1);
  // Панель доступна прокруткой: цвет игрушки выбирается и здесь.
  await page.locator('#shell-picker [data-shell="yellow"]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'yellow');
});
