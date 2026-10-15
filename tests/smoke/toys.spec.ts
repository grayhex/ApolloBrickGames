import { expect, test, type Page } from '@playwright/test';

/**
 * Три игрушки Apollo на одной странице: шапка с логотипом и переключателем, «Часы+99» и «Морской бой» (аппаратная часть, цвета, тетрис-заглушка).
 * Состояние игры — из data-* игровой области; тетрис выставляет `window.__tetris` при `?debug`.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const key = (page: Page, id: string) => page.locator(`[data-key="${id}"]`);

type TetrisDebug = Window & { __tetris: { piece: { x: number; y: number; kind: string } | null; score: number; hiScore: number; phase: string } };

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

/** Игрушка включена, экран прошёл проверку сегментов и ждёт старта. */
async function open(page: Page, toy: string, extra = ''): Promise<void> {
  await page.goto(`./?toy=${toy}&power=on&debug&seed=7${extra}`);
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(() => area(page, 'boot')).toBe('off'); // вспышка всех сегментов при включении (≈ 0,8 с) закончилась
}

test.describe('шапка и переключатель', () => {
  test('по центру сверху — рукописный логотип Apollo, рядом переключатель из трёх игрушек с миниатюрами; текущая отмечена', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#arena')).toHaveAttribute('data-view', 'closed');
    const logo = page.locator('.brand__logo');
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const items = page.locator('.toysw__item');
    await expect(items).toHaveCount(3);
    await expect(items.locator('.toysw__name')).toHaveText(['Crocodile Mario', 'Часы+99', 'Морской бой']);
    await expect(items.locator('svg.toysw__icon')).toHaveCount(3); // миниатюры закрытых игрушек
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'mario');
    // Шапка по центру игрушки (средняя колонка страницы) и над ней.
    const brand = await page.locator('#brand').boundingBox();
    const toy = await page.locator('#toy').boundingBox();
    const logoBox = await logo.boundingBox();
    const switchBox = await page.locator('#toy-switch').boundingBox();
    if (!brand || !toy || !logoBox || !switchBox) throw new Error('нет размеров');
    expect(Math.abs((logoBox.x + switchBox.x + switchBox.width) / 2 - (toy.x + toy.width / 2))).toBeLessThan(2);
    expect(brand.y + brand.height).toBeLessThanOrEqual(toy.y + 1);
    // Страница по высоте не вылезает за окно (шапка вычтена из размера игрушки).
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  });

  test('переключатель — ссылки: «Часы+99» и «Морской бой» открывают свою игрушку, Crocodile Mario — страницу без параметра', async ({ page }) => {
    // Каждый переход ждёт готовности страницы: уйти, пока грузится пакет, значило бы оборвать запрос и получить ошибку в консоли.
    const loaded = (): Promise<void> => expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await page.goto('./');
    await loaded();
    await page.locator('.toysw__item[data-toy="clock99"]').click();
    await expect(page).toHaveURL(/\?toy=clock99$/);
    await loaded();
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'clock99');
    await expect(page).toHaveTitle('Часы+99 — Apollo');
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'clock99');
    await page.locator('.toysw__item[data-toy="seabattle"]').click();
    await expect(page).toHaveURL(/\?toy=seabattle$/);
    await loaded();
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'seabattle');
    await page.locator('.toysw__item[data-toy="mario"]').click();
    await expect(page).not.toHaveURL(/toy=/);
    await loaded();
    await expect(page.locator('body')).not.toHaveAttribute('data-toy', /.+/);
    await expect(page).toHaveTitle('Crocodile Mario');
    // Неизвестное значение — Crocodile Mario.
    await page.goto('./?toy=nope');
    await loaded();
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'mario');
  });

  test('технические страницы шапки не показывают', async ({ page }) => {
    await page.goto('./#/tech');
    await expect(page.locator('#brand')).toBeHidden();
  });
});

test.describe('«Часы+99»', () => {
  test('аппаратная часть: подписи кнопок как на корпусе, светодиоды, наклейка, рамка с орнаментом; жёлтый по умолчанию', async ({ page }) => {
    await open(page, 'clock99');
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'clock99');
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'yellow');
    const labels = await page.locator('.base__art text').allTextContents();
    for (const text of ['ON/OFF', 'MUTE', 'TIME', 'GAME', 'START', 'PAUSE', '+ +', 'ALARM SET', 'TIME SET', '−', 'ROTATE', 'ALARM ON/OFF']) expect(labels, text).toContain(text);
    expect(labels).not.toContain('FIRE'); // подписи Crocodile Mario здесь не остались
    expect(labels).not.toContain('JUMP');
    await expect(page.locator('.lid__leds')).toBeVisible();
    const sticker = page.locator('.base__sticker');
    await expect(sticker).toBeVisible();
    expect(await sticker.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.base__logo')).toHaveCount(0); // логотипа Crocodile Mario нет
    await expect(page.locator('.lid__art')).toHaveCount(0); // горы и фигурки Mario — тоже
    await expect(page.locator('.deco__flourish')).toHaveCount(4); // завитки по бокам экрана
    // Окно LCD портретное: матрица 10 × 20 и боковая панель.
    const win = await page.locator('#lcd-window').boundingBox();
    if (!win) throw new Error('нет окна LCD');
    expect(win.height).toBeGreaterThan(win.width);
    expect(win.width / win.height).toBeCloseTo(264 / 320, 1);
  });

  test('цвета — только подтверждённые фото: жёлтый, красный, белый; сохранённый синий заменяется жёлтым', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('crocodile-mario:settings:v1', JSON.stringify({ version: 1, display: { shell: 'blue' } })));
    await open(page, 'clock99');
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'yellow');
    const picks = page.locator('#shell-picker .shellpick__btn');
    await expect(picks).toHaveCount(3);
    expect(await picks.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('data-shell')))).toEqual(['yellow', 'red', 'white']);
    await picks.nth(1).click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'red');
    await picks.nth(2).click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'white');
  });

  test('левая панель пуста, справа — звук, вид, уровни выключены; музыки и спидрана нет', async ({ page }) => {
    await open(page, 'clock99');
    await expect(page.locator('#side-info')).toBeEmpty();
    await expect(page.locator('#side-info')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#tgl-sound')).toBeVisible();
    await expect(page.locator('#volume')).toBeVisible();
    await expect(page.locator('#music')).toHaveCount(0);
    await expect(page.locator('#run')).toHaveCount(0);
    await expect(page.locator('#tgl-ghost')).toBeVisible();
    const tiles = page.locator('#original-levels .lv');
    await expect(tiles).toHaveCount(9);
    for (let i = 0; i < 9; i++) await expect(tiles.nth(i)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#user-level')).toBeDisabled();
    await tiles.nth(0).click({ force: true }); // aria-disabled: иначе Playwright ждал бы «доступности»
    expect(await area(page, 'phase')).toBe('ready'); // плитка уровня ничего не запускает
  });

  test('игра — тетрис: старт, сдвиг, поворот, ускорение вниз, бросок, пауза и продолжение', async ({ page }) => {
    await open(page, 'clock99');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    const piece = () => page.evaluate(() => (window as unknown as TetrisDebug).__tetris.piece);
    const x0 = (await piece())?.x ?? -99;
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await piece())?.x).toBe(x0 - 1);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await piece())?.x).toBe(x0);
    expect(Number(await area(page, 'score'))).toBe(0);
    // Бросок (X): фигура падает и фиксируется, счёт растёт.
    await page.keyboard.press('KeyX');
    await expect.poll(async () => Number(await area(page, 'score'))).toBeGreaterThan(0);
    // Пауза: P; продолжение — Enter.
    await page.keyboard.press('KeyP');
    await expect.poll(phase(page)).toBe('paused');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
  });

  test('кнопки корпуса мышью: START/PAUSE запускает и ставит на паузу, ROTATE поворачивает, TIME/GAME ничего не делает, MUTE выключает звук', async ({ page }) => {
    await open(page, 'clock99');
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('playing');
    const rotation = () => page.evaluate(() => JSON.stringify((window as unknown as TetrisDebug).__tetris.piece));
    const before = await rotation();
    await key(page, 'jump').click();
    await expect.poll(rotation).not.toBe(before);
    await key(page, 'fire').click(); // TIME/GAME
    expect(await area(page, 'phase')).toBe('playing');
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('paused');
    await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'true');
    await key(page, 'sound').click(); // MUTE
    await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'false');
  });

  test('рекорд хранится у каждой игрушки отдельно и виден на экране ожидания; конец игры сохраняет новый', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('seeded')) {
        localStorage.setItem('seeded', '1');
        localStorage.setItem('crocodile-mario:tetris:clock99:hi', '4321');
      }
    });
    await open(page, 'clock99');
    expect(await area(page, 'hiscore')).toBe('4321');
    await page.goto('./?toy=seabattle&power=on&debug&seed=7');
    await expect.poll(phase(page)).toBe('ready');
    expect(await area(page, 'hiscore')).toBe('0'); // у «Морского боя» свой рекорд
    // Играем до конца: фигуры бросаются в один столбец — стакан заполняется, игра заканчивается, рекорд сохраняется.
    await expect.poll(() => area(page, 'boot')).toBe('off');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    for (let i = 0; i < 40 && (await area(page, 'phase')) === 'playing'; i++) {
      await page.keyboard.press('KeyX');
      await page.waitForTimeout(40);
    }
    await expect.poll(phase(page), { timeout: 8000 }).toBe('over');
    const score = Number(await area(page, 'score'));
    expect(score).toBeGreaterThan(0);
    expect(Number(await area(page, 'hiscore'))).toBe(score);
    expect(await page.evaluate(() => localStorage.getItem('crocodile-mario:tetris:seabattle:hi'))).toBe(String(score));
    // Enter начинает новую игру, рекорд остаётся.
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    expect(Number(await area(page, 'hiscore'))).toBe(score);
  });

  test('экран рисует матрицу: включённая игрушка — чернила на холсте, выключенная — пустой холст; звёздочка не пропадает при слое сегментов', async ({ page }) => {
    await open(page, 'clock99');
    const painted = () =>
      page.evaluate(() => {
        const canvas = document.getElementById('screen') as HTMLCanvasElement;
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!data) return -1;
        let count = 0;
        for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) count++;
        return count;
      });
    expect(await painted()).toBeGreaterThan(1000);
    await key(page, 'onoff').click(); // выключить
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
    await expect.poll(painted).toBe(0);
    await key(page, 'onoff').click();
    await expect.poll(painted).toBeGreaterThan(1000);
  });

  test('складывание: вид «только экран» и «свёрнута» работают, включённую игрушку закрыть нельзя', async ({ page }) => {
    await open(page, 'clock99');
    await page.locator('#view-screen').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
    await page.locator('#view-full').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
    await page.locator('#view-closed').click({ force: true });
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full'); // игра включена — крышка не закрывается
    await key(page, 'onoff').click();
    await page.locator('#view-closed').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
    await expect(page.locator('#lid-cover')).toBeVisible();
    await page.locator('#lid-cover').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  });
});

test.describe('«Морской бой»', () => {
  test('аппаратная часть: подписи, без светодиодов, линия цвета корпуса вокруг экрана; цвет из настроек (синий) у «Морского боя» бывает', async ({ page }) => {
    await open(page, 'seabattle');
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'seabattle');
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'blue'); // цвет по умолчанию из настроек — синий, у «Морского боя» он есть
    const labels = await page.locator('.base__art text').allTextContents();
    for (const text of ['ON/OFF', 'S./P.', 'MUTE', 'RESET', 'UP/MODE', 'LEFT/LEVEL', 'RIGHT/SPEED', 'DOWN', 'ROTATE']) expect(labels, text).toContain(text);
    expect(labels).not.toContain('SOUND');
    await expect(page.locator('.lid__leds')).toBeHidden();
    await expect(page.locator('.deco__flourish')).toHaveCount(0); // орнамент — у «Часов+99»
    const border = await page.locator('.lid__bezel').evaluate((el) => getComputedStyle(el, '::before').borderTopWidth);
    expect(parseFloat(border)).toBeGreaterThan(1);
    const picks = page.locator('#shell-picker .shellpick__btn');
    expect(await picks.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('data-shell')))).toEqual(['red', 'blue']);
    await picks.nth(0).click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'red');
  });

  test('RESET начинает партию заново; S./P. запускает; поворот — ROTATE и стрелка вверх', async ({ page }) => {
    await open(page, 'seabattle');
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('playing');
    await page.keyboard.press('KeyX');
    await expect.poll(async () => Number(await area(page, 'score'))).toBeGreaterThan(0);
    await key(page, 'fire').click(); // RESET
    await expect.poll(phase(page)).toBe('ready');
    expect(await area(page, 'score')).toBe('0');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    const shape = () => page.evaluate(() => JSON.stringify((window as unknown as TetrisDebug).__tetris.piece));
    const before = await shape();
    await page.keyboard.press('ArrowUp');
    await expect.poll(shape).not.toBe(before);
  });

  test('справка — свои кнопки и свой текст, без раздела об оригинальном устройстве Crocodile Mario', async ({ page }) => {
    await open(page, 'seabattle');
    await page.locator('#corner-help').click();
    const dialog = page.locator('#help');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('обычный тетрис');
    await expect(dialog.locator('th')).toContainText(['ON/OFF', 'S./P.', 'MUTE', 'RESET', 'LEFT/LEVEL', 'RIGHT/SPEED', 'UP/MODE', 'DOWN', 'ROTATE']);
    await expect(dialog.locator('#original-device')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test('Crocodile Mario не изменился: свои подписи, логотип, левая панель и уровни; цвет жёлтый — тусклый, кремовый', async ({ page }) => {
  await page.goto('./?power=on');
  await expect.poll(phase(page)).toBe('ready');
  const labels = await page.locator('.base__art text').allTextContents();
  for (const text of ['ON/OFF', 'S./P.', 'SOUND', 'FIRE', 'UP', 'LEFT', 'RIGHT', 'DOWN', 'JUMP']) expect(labels, text).toContain(text);
  await expect(page.locator('.base__sticker')).toHaveCount(0);
  await expect(page.locator('#keymap')).toBeVisible(); // слева справка по упаковке и клавишам
  await expect(page.locator('#shell-picker .shellpick__btn')).toHaveCount(4);
  await expect(page.locator('#original-levels .lv[aria-disabled="true"]')).toHaveCount(0);
  await page.locator('#shell-picker [data-shell="yellow"]').click();
  const rim = await page.locator('#toy').evaluate((el) => getComputedStyle(el).getPropertyValue('--rim').trim());
  // Жёлтый по фото оригинала: бледный кремово-жёлтый, а не насыщенный лимонный (#f3dc3f): насыщенность заметно ниже.
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => Number.parseInt(rim.slice(i, i + 2), 16));
  const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
  expect(saturation).toBeLessThan(0.5);
  expect(saturation).toBeGreaterThan(0.2);
});
