import { expect, test, type Page } from '@playwright/test';
import { openPicker } from './picker';

const heights = (page: Page, selector: string): Promise<number[]> => page.locator(selector).evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
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
  const panel = await heights(page, '#gpanel .gpanel__head .game-origin, #gpanel .gpanel__head .gpanel__stage, #gpanel .gpanel__head .game-rarity');
  expect(panel.length).toBe(3);
  expect(new Set(panel).size, `высоты значков в левой панели: ${panel}`).toBe(1);
  await page.goto('./encyclopedia?game=snake');
  const article = await heights(page, '.enc-article__head .game-origin, .enc-article__head .gpanel__stage, .enc-article__head .game-rarity');
  expect(article.length).toBe(3);
  expect(new Set(article).size, `высоты значков в статье: ${article}`).toBe(1);
  const list = await heights(page, '.enc-item[data-game="snake"] .game-origin, .enc-item[data-game="snake"] .gpanel__stage, .enc-item[data-game="snake"] .game-rarity');
  expect(list.length).toBe(3);
  expect(new Set(list).size, `высоты значков в списке: ${list}`).toBe(1);
});

test('энциклопедия компактна: вводный блок в две колонки, варианты в несколько колонок одной строкой, страница заметно короче', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, './encyclopedia?game=tetris');
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
