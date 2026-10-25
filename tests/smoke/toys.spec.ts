import { expect, test, type Page } from '@playwright/test';
import { marioUrl, mockReadOnlyLeaderboard } from './url';

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

type TetrisDebug = Window & { __brick: { game: { piece: { angle: number; shape: number } | null; pieceX: number; pieceY: number; board: Uint8Array } } };

test.beforeEach(async ({ page }) => {
  await mockReadOnlyLeaderboard(page);
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
  test('логотип Apollo внутри категории, слева управление; четыре белые миниатюры и текущая игрушка', async ({ page }) => {
    await page.goto(marioUrl(''));
    await expect(page.locator('#arena')).toHaveAttribute('data-view', 'closed');
    const logo = page.locator('.site-brand img');
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const items = page.locator('#real-models .toysw__item');
    await expect(items).toHaveCount(8);
    await expect(items.locator('.toysw__name')).toHaveText(['Crocodile Mario', 'Часы+99', 'Морской бой', '168 в 1 танк', 'Alibaba Dance 99 in 1', 'Mini Brick Game B-S96', 'Brick Game E-88 · 8 in 1', 'Apollo B0202 · 126 in 1']);
    await expect(items.locator('svg.toysw__icon')).toHaveCount(8);
    await expect(items.locator('svg.toysw__icon image[href*="devices/"]')).toHaveCount(2); // моноблоки используют оригинальные векторы
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'mario');
    // Индикаторы — отдельные цветные значки (клавиатура, пауза; геймпад скрыт, пока не подключён), логотип правее них.
    const dots = page.locator('#devices .dev:visible');
    await expect(dots).toHaveCount(2);
    const colors = await dots.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).getPropertyValue('--dev-c').trim()));
    expect(new Set(colors).size).toBe(2);
    const devicesBox = await page.locator('#devices').boundingBox();
    const logoBox = await logo.boundingBox();
    const switchBox = await page.locator('#toy-switch').boundingBox();
    const toy = await page.locator('#toy').boundingBox();
    if (!devicesBox || !logoBox || !switchBox || !toy) throw new Error('нет размеров');
    expect(devicesBox.x + devicesBox.width).toBeLessThanOrEqual(logoBox.x + 1);
    expect(logoBox.x).toBeGreaterThan(switchBox.x); // логотип внутри категории Apollo
    // Переключатель по центру игрушки и над ней.
    expect(Math.abs(switchBox.x + switchBox.width / 2 - (toy.x + toy.width / 2))).toBeLessThan(2);
    expect(switchBox.y + switchBox.height).toBeLessThanOrEqual(toy.y + 1);
    // Страница по высоте не вылезает за окно (шапка вычтена из размера игрушки).
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  });

  test('переключатель — ссылки: «Часы+99» и «Морской бой» открывают свою игрушку, Crocodile Mario — ?toy=mario, универсальный Brick Game — страницу без параметра', async ({ page }) => {
    // Каждый переход ждёт готовности страницы: уйти, пока грузится пакет, значило бы оборвать запрос и получить ошибку в консоли.
    const loaded = (): Promise<void> => expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await page.goto(marioUrl(''));
    await loaded();
    await page.locator('.toysw__item[data-toy="clock99"]').click();
    await expect(page).toHaveURL(/\?toy=clock99$/);
    await loaded();
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'clock99');
    await expect(page).toHaveTitle('Часы+99 — Brick Game Online');
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'clock99');
    await page.locator('.toysw__item[data-toy="seabattle"]').click();
    await expect(page).toHaveURL(/\?toy=seabattle$/);
    await loaded();
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'seabattle');
    await page.locator('.toysw__item[data-toy="mario"]').click();
    await expect(page).toHaveURL(/\?toy=mario$/);
    await loaded();
    await expect(page.locator('body')).not.toHaveAttribute('data-toy', /.+/);
    await expect(page).toHaveTitle('Crocodile Mario');
    await page.locator('.toysw__universal').click();
    await expect(page).not.toHaveURL(/toy=/);
    await loaded();
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'brickgame');
    // Неизвестное значение — универсальный Brick Game.
    await page.goto('./?toy=nope');
    await loaded();
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'brickgame');
  });

  for (const toy of ['mario', 'tank168']) {
    test(`${toy}: на телефоне (320–390 px) шапка не даёт горизонтальной прокрутки даже с широким запасным шрифтом`, async ({ page }) => {
      await page.goto(`./?toy=${toy}`);
      await page.waitForSelector('.toysw__item');
      // Шрифт CI-раннера (DejaVu Sans) шире локального: проверяем «худший» случай независимо от машины.
      await page.addStyleTag({ content: "*{font-family:'DejaVu Sans', sans-serif !important}" });
      for (const width of [320, 360, 390]) {
        await page.setViewportSize({ width, height: 740 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${toy} @${width}`).toBeLessThanOrEqual(width);
        const sw = await page.locator('.toysw').boundingBox();
        expect(sw!.x + sw!.width, `${toy} @${width}: переключатель в окне`).toBeLessThanOrEqual(width);
        await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('aria-label', /.+/); // имя текущей остаётся доступным и без подписи
      }
    });
  }

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
    expect(await picks.evaluateAll(buttons=>buttons.map(b=>b.getAttribute('data-shell')))).toEqual(['yellow','red','white']);
    await expect(page.locator('#shell-picker [data-shell="blue"]')).toHaveCount(0);
    await page.locator('#shell-picker [data-shell="red"]').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'red');
    await page.locator('#shell-picker [data-shell="white"]').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'white');
  });

  test('слева справка по тетрису, справа — звук и вид; блока уровней, музыки и спидрана нет', async ({ page }) => {
    await open(page, 'clock99');
    await expect(page.locator('#side-info')).toBeVisible();
    await expect(page.locator('#side-info .grules li')).toHaveCount(3);
    await expect(page.locator('#side-info #keymap')).toContainText('ROTATE');
    await expect(page.locator('#side-info .about__logo')).toHaveAttribute('src', /sticker-clock99/);
    await expect(page.locator('#tgl-sound')).toBeVisible();
    await expect(page.locator('#volume')).toBeVisible();
    await expect(page.locator('#music')).toHaveCount(0);
    await expect(page.locator('#run')).toHaveCount(0);
    await expect(page.locator('#segments-off')).toBeVisible();
    await expect(page.locator('#blk-levels,#original-levels,#user-level')).toHaveCount(0);
    expect(await area(page, 'phase')).toBe('ready');
  });

  test('игра — тетрис: старт, сдвиг, поворот, ускорение вниз без скрытого броска, пауза и продолжение', async ({ page }) => {
    await open(page, 'clock99');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    const piece = () => page.evaluate(() => { const game = (window as unknown as TetrisDebug).__brick.game; return game.piece ? { x: game.pieceX, y: game.pieceY } : null; });
    await expect.poll(piece).not.toBeNull();
    const x0 = (await piece())?.x ?? -99;
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await piece())?.x).toBe(x0 - 1);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await piece())?.x).toBe(x0);
    expect(Number(await area(page, 'score'))).toBe(0);
    // Отдельной FIRE на корпусе нет: X не бросает фигуру. Вниз ускоряет до посадки.
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => [...(window as unknown as TetrisDebug).__brick.game.board].filter(Boolean).length)).toBe(0);
    await page.keyboard.down('ArrowDown');
    await expect.poll(() => page.evaluate(() => [...(window as unknown as TetrisDebug).__brick.game.board].filter(Boolean).length)).toBeGreaterThan(0);
    await page.keyboard.up('ArrowDown');
    // Пауза: P; продолжение — Enter.
    await page.keyboard.press('KeyP');
    await expect.poll(phase(page)).toBe('paused');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
  });

  test('кнопки корпуса мышью: START/PAUSE запускает и ставит на паузу, ROTATE поворачивает, TIME/GAME возвращает в меню, MUTE выключает звук', async ({ page }) => {
    await open(page, 'clock99');
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('playing');
    const rotation = () => page.evaluate(() => JSON.stringify((window as unknown as TetrisDebug).__brick.game.piece));
    const before = await rotation();
    await key(page, 'jump').click();
    await expect.poll(rotation).not.toBe(before);
    await key(page, 'fire').click(); // TIME/GAME
    await expect.poll(() => area(page, 'menu')).toBe('menu');
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('playing');
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('paused');
    await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'true');
    await key(page, 'sound').click(); // MUTE
    await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'false');
  });

  test('рекорд хранится у каждой игрушки отдельно, у консолей с меню — у каждой игры и варианта; виден на экране ожидания', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('seeded')) {
        localStorage.setItem('seeded', '1');
        localStorage.setItem('crocodile-mario:brick:clock99:tetris:0:hi', '4321');
        localStorage.setItem('crocodile-mario:brick:seabattle:tetris:0:hi', '777');
      }
    });
    await open(page, 'clock99');
    expect(await area(page, 'hiscore')).toBe('4321');
    await page.goto('./?toy=seabattle&power=on&debug&seed=7');
    await expect.poll(phase(page)).toBe('ready');
    await expect.poll(() => area(page, 'boot')).toBe('off');
    const hi = (): Promise<string> => area(page, 'hiscore');
    expect(await hi()).toBe('0'); // у «Морского боя» свой рекорд (игра A не играется)
    await page.locator('[data-key="jump"]').click(); // первая кнопка уводит заставку в меню, игра не меняется
    await expect.poll(() => area(page, 'stage')).toBe('menu');
    for (let i = 0; i < 4; i++) await page.locator('[data-key="jump"]').click(); // ROTATE: A → E
    await expect.poll(() => area(page, 'game')).toBe('tetris');
    await expect.poll(hi).toBe('777'); // рекорд игры E (обычный тетрис, вариант 01)
    await page.locator('[data-key="jump"]').click(); // F — арканоид
    await expect.poll(() => area(page, 'game')).toBe('arkanoid');
    await expect.poll(hi).toBe('0'); // у каждой игры свой
    await page.goto('./?toy=tank168&power=on&debug&seed=7');
    await expect.poll(phase(page)).toBe('ready');
    expect(await hi()).toBe('0'); // у «168 в 1 танк» — свой
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
  test('аппаратная часть: подписи, без светодиодов, линия цвета корпуса вокруг экрана; начальный цвет берётся из общей конфигурации', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('crocodile-mario:settings:v1', JSON.stringify({ version: 1, display: { shell: 'blue' } })));
    await open(page, 'seabattle');
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'seabattle');
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'red'); // устаревший локальный цвет больше не перекрывает опубликованный
    const labels = await page.locator('.base__art text').allTextContents();
    for (const text of ['ON/OFF', 'S./P.', 'MUTE', 'RESET', 'UP/MODE', 'LEFT/LEVEL', 'RIGHT/SPEED', 'DOWN', 'ROTATE']) expect(labels, text).toContain(text);
    expect(labels).not.toContain('SOUND');
    await expect(page.locator('.lid__leds')).toBeHidden();
    await expect(page.locator('.deco__flourish')).toHaveCount(0); // орнамент — у «Часов+99»
    const border = await page.locator('.lid__bezel').evaluate((el) => getComputedStyle(el, '::before').borderTopWidth);
    expect(parseFloat(border)).toBeGreaterThan(1);
    const picks = page.locator('#shell-picker .shellpick__btn');
    expect(await picks.evaluateAll(buttons=>buttons.map(b=>b.getAttribute('data-shell')))).toEqual(['red','blue']);
    await expect(page.locator('#shell-picker [data-shell="yellow"]')).toHaveCount(0);
    await page.locator('#shell-picker [data-shell=blue]').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'blue');
  });

  test('меню: RESET возвращает в меню; S./P. запускает выбранную игру; игра A запускается и возвращается в меню', async ({ page }) => {
    await open(page, 'seabattle');
    expect(await area(page, 'menu')).toBe('menu');
    expect(await area(page, 'symbol')).toBe('A');
    expect(await area(page, 'playable')).toBe('yes');
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('playing');
    await key(page, 'fire').click();
    await expect.poll(phase(page)).toBe('ready');
    await key(page, 'jump').click(); // ROTATE — следующая игра: B (танки)
    await expect.poll(() => area(page, 'symbol')).toBe('B');
    expect(await area(page, 'playable')).toBe('yes');
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('playing');
    expect(await area(page, 'menu')).toBe('game');
    await key(page, 'fire').click(); // RESET
    await expect.poll(phase(page)).toBe('ready');
    expect(await area(page, 'menu')).toBe('menu');
    expect(await area(page, 'symbol')).toBe('B'); // выбор в меню сохранился
    expect(await area(page, 'score')).toBe('0');
    await page.keyboard.press('Enter'); // Enter запускает так же, как S./P.
    await expect.poll(phase(page)).toBe('playing');
  });

  test('энциклопедия открывает статью выбранной игры без таблицы управления', async ({ page }) => {
    await open(page, 'seabattle');
    await page.locator('#corner-help').click();
    await expect(page).toHaveURL(/encyclopedia\?game=sea-battle&toy=seabattle/);
    await expect(page.locator('.enc-article h2')).toHaveText('Морской бой');
    await expect(page.locator('.help__table, .gctl')).toHaveCount(0);
  });
});

test('Crocodile Mario не изменился: свои подписи, логотип, левая панель и уровни; цвет жёлтый — тусклый, кремовый', async ({ page }) => {
  await page.goto(marioUrl('?power=on'));
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

for (const toy of ['mario', 'clock99', 'seabattle', 'tank168']) {
  test(`${toy}: общие меню, миниатюры и справка на двух языках`, async ({ page }) => {
    await page.goto(`./?toy=${toy}&view=full`);
    await expect(page.locator('body')).not.toHaveAttribute('data-booting');
    await expect(page.locator('#side-info .about__logo')).toHaveAttribute('alt', ({ mario: 'Crocodile Mario', clock99: 'Часы+99', seabattle: 'Морской бой', tank168: '168 в 1 танк' } as Record<string, string>)[toy] ?? '');
    await expect(page.locator('#shell-picker .shellpick__name')).toHaveCount(0);
    await expect(page.locator('#view-state .view-mini')).toHaveCount(3);
    await expect(page.locator('#view-full')).toHaveAccessibleName('Полная');
    await expect(page.locator('#side-ctl #segments-off')).toBeVisible();
    await page.locator('#segments-off').click();
    await expect(page.locator('#segments-off')).toBeChecked();
    await page.locator('#corner-lang').click();
    await expect(page.locator('#side-info #keys-title')).toHaveText('Controls');
    if (toy !== 'mario') await expect(page.locator('#side-info .grules li')).toHaveCount(3);
    // Both docks (toy switcher and service menu) use the same surface, and the left indicators do not overlap the right menu.
    const docks = await page.locator('.chrome-dock').evaluateAll(nodes => nodes.map(n => {
      const rect = n.getBoundingClientRect();
      return { id: n.id, left: rect.left, right: rect.right, radius: getComputedStyle(n).borderRadius, animation: getComputedStyle(n).animationName };
    }));
    expect(docks.length).toBeGreaterThanOrEqual(2);
    expect(docks.every(d => parseFloat(d.radius) >= 12)).toBe(true);
    await expect(page.locator('#topleft #corner')).toBeVisible();
    expect(docks.every(d => d.animation === 'none')).toBe(true); // reducedMotion from the shared Playwright config
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const left = await page.locator('#devices').boundingBox();
    const right = await page.locator('#corner').boundingBox();
    expect(left!.x + left!.width).toBeLessThan(right!.x);
  });
}
