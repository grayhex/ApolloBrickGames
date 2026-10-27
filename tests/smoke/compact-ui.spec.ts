import { expect, test, type Page } from '@playwright/test';
import { openPicker } from './picker';

const heights = (page: Page, selector: string): Promise<number[]> => page.locator(selector).evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
/** Высоты отрисованных значков: сначала ждём, пока страница (энциклопедия рисует статью и список уже после загрузки) выведет все `count` значков. */
const badgeHeights = async (page: Page, selector: string, count: number): Promise<number[]> => {
  await expect(page.locator(selector)).toHaveCount(count);
  return heights(page, selector);
};
const visit = async (page: Page, url: string): Promise<void> => {
  await page.goto(url);
  await page.locator('body:not([data-booting])').waitFor();
};

test('каталог устройств широкий и компактный: две строки карточек, названия не рвутся посреди слова, консоль закрыта лишь сверху', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, './?toy=brickgame&view=full');
  await openPicker(page);
  const panel = await page.locator('.devpick__panel').boundingBox();
  expect(panel!.width, 'каталог шире прежних 760px').toBeGreaterThan(1000);
  expect(panel!.height, 'и ниже: две строки карточек').toBeLessThan(260);
  const rows = await page.locator('.devpick__card').evaluateAll((nodes) => new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().top))).size);
  expect(rows).toBeLessThanOrEqual(3);
  // Каждое слово названия умещается в строку: ни одно название не переносится на середине слова (высота строки одна и та же у всех карточек одной строки).
  const wide = await page.locator('.devpick__card .devpick__model').evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length);
  expect(wide).toBe(0);
  // Консоль остаётся видна: нижняя половина игрушки (кнопки) не закрыта каталогом.
  const toy = await page.locator('#toy').boundingBox();
  expect(panel!.y + panel!.height).toBeLessThan(toy!.y + toy!.height * 0.5);
});

test('значки ROM/AI, α/β и редкости — одной формы и одного размера', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, './?toy=brickgame&view=full');
  await page.locator('#guide-game').selectOption('snake'); // у Snake есть и ROM, и бета, и редкость
  const panel = await badgeHeights(page, '#gpanel .gpanel__head .game-origin, #gpanel .gpanel__head .gpanel__stage, #gpanel .gpanel__head .game-rarity', 3);
  expect(new Set(panel).size, `высоты значков в левой панели: ${panel}`).toBe(1);
  await page.goto('./encyclopedia?game=snake');
  const article = await badgeHeights(page, '.enc-article__head .game-origin, .enc-article__head .gpanel__stage, .enc-article__head .game-rarity', 3);
  expect(new Set(article).size, `высоты значков в статье: ${article}`).toBe(1);
  const list = await badgeHeights(page, '.enc-item[data-game="snake"] .game-origin, .enc-item[data-game="snake"] .gpanel__stage, .enc-item[data-game="snake"] .game-rarity', 3);
  expect(new Set(list).size, `высоты значков в списке: ${list}`).toBe(1);
});

test('энциклопедия компактна: вводный блок в две колонки, варианты в несколько колонок одной строкой, страница заметно короче', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, './encyclopedia?game=tetris');
  await expect(page.locator('.enc-modes li').first()).toBeVisible();
  const intro = await page.locator('.enc-intro').boundingBox();
  expect(intro!.height, 'вводный блок ниже 110px').toBeLessThan(110);
  const layout = await page.locator('.enc-layout').boundingBox();
  expect(layout!.width, 'контент шире прежних 1440 − полей').toBeGreaterThan(1300);
  const modes = await page.locator('.enc-modes li').evaluateAll((nodes) => new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().left))).size);
  expect(modes, 'вариантов в строке').toBeGreaterThanOrEqual(3);
  const itemHeights = await heights(page, '.enc-modes li');
  expect(Math.max(...itemHeights), 'бейдж варианта стоит в той же строке, что и название').toBeLessThanOrEqual(66);
  expect(await page.evaluate(() => document.documentElement.scrollHeight), 'Tetris (51 вариант) — не длиннее 3200px при 1440×900').toBeLessThan(3200);
});

test('ложбина под три служебные кнопки у Mini Brick B-S96 той же формы, что у TAKSUN TS-995', async ({ page }) => {
  const shape = async (toy: string): Promise<{ d: string; count: number; transforms: string[] }> => {
    await visit(page, `./?toy=${toy}&view=full`);
    const paths = page.locator('.base__art path[d="M86 262Q84 322 122 368"]');
    return { d: 'M86 262Q84 322 122 368', count: await paths.count(), transforms: await paths.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform') ?? '')) };
  };
  const taksun = await shape('taksun');
  const mini = await shape('minibrick');
  expect(taksun.count).toBeGreaterThanOrEqual(3);
  expect(mini.count).toBe(taksun.count); // три слоя выемки: кромка, тень, дно — по одной кривой
  // У TAKSUN кривая стоит как есть, у Mini — тот же путь, сдвинутый и увеличенный так, чтобы пройти через центры его кнопок.
  expect(mini.transforms.some((t) => t.includes('scale(1.08)'))).toBe(true);
});

test('стрелки по бокам панели листают устройства по кругу в порядке каталога; панель остаётся по центру', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, './?toy=brickgame&view=full');
  const prev = page.locator('.devpick__step--prev');
  const next = page.locator('.devpick__step--next');
  await expect(prev).toBeVisible();
  await expect(next).toBeVisible();
  // Имена соседей — в подписи и подсказке; универсальный стоит первым, перед ним по кругу — последняя модель, за ним — Crocodile Mario.
  await expect(next).toHaveAttribute('aria-label', /Crocodile Mario/);
  await expect(next).toHaveAttribute('title', /Crocodile Mario/);
  await expect(prev).toHaveAttribute('aria-label', /E-23/);
  const barBox = await page.locator('.devpick__trigger').boundingBox();
  const prevBox = (await prev.boundingBox())!;
  const nextBox = (await next.boundingBox())!;
  expect(prevBox.x + prevBox.width, 'левая стрелка слева от панели').toBeLessThanOrEqual(barBox!.x);
  expect(nextBox.x, 'правая стрелка справа от панели').toBeGreaterThanOrEqual(barBox!.x + barBox!.width);
  const toyBox = (await page.locator('#toy').boundingBox())!;
  expect(Math.abs(barBox!.x + barBox!.width / 2 - (toyBox.x + toyBox.width / 2)), 'панель по-прежнему над серединой консоли').toBeLessThan(2);
  expect(Math.round(prevBox.height)).toBe(Math.round(barBox!.height));
  const current = page.locator('.devpick__trigger');
  await next.click();
  await expect(current).toHaveAttribute('data-toy', 'mario');
  await expect(page).toHaveURL(/toy=mario/);
  await expect(prev).toHaveAttribute('aria-label', /Brick Game/);
  await prev.click();
  await expect(current).toHaveAttribute('data-toy', 'brickgame');
  await prev.click(); // с первой модели — на последнюю
  await expect(current).toHaveAttribute('data-toy', 'e23');
  await next.click(); // и обратно по кругу — на первую
  await expect(current).toHaveAttribute('data-toy', 'brickgame');
});

test('стрелки выбора устройства на телефоне: страница не шире окна, обе стрелки видны и работают с открытым каталогом', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, './?toy=brickgame&view=full');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('.devpick__step--prev')).toBeVisible();
  await expect(page.locator('.devpick__step--next')).toBeVisible();
  await openPicker(page);
  await page.locator('.devpick__step--next').click(); // стрелка при открытом каталоге закрывает его и переключает устройство
  await expect(page.locator('.devpick__panel')).toBeHidden();
  await expect(page.locator('.devpick__trigger')).toHaveAttribute('data-toy', 'mario');
});
