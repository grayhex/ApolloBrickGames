import { expect, test, type Page } from '@playwright/test';

/** Prince 皇太子 (118 in 1): цельный корпус (не раскладушка), заставка, автоплей игр, выбор и партия. Консоль доступна на странице как `window.__prince118` (режим `?debug`). */
const read = <T>(page: Page, expression: string): Promise<T> =>
  page.evaluate((code) => new Function('p', `return ${code}`)((window as unknown as { __prince118: unknown }).__prince118) as never, expression) as Promise<T>;

async function open(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`./?toy=prince118&power=on&debug&seed=7${extra}`);
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'prince118');
  await expect.poll(() => read<string>(page, 'p.screenStage')).toBe('intro');
  return errors;
}

const key = (page: Page, id: string) => page.locator(`#base [data-key="${id}"]`);
/** Нажать кнопку корпуса мышью (одно нажатие игровой кнопки доходит до консоли в следующем такте). */
async function tap(page: Page, id: string): Promise<void> {
  await key(page, id).click();
  await page.waitForTimeout(120);
}
/** Пропустить заставку любой кнопкой: дальше идёт автоплей. */
async function toDemo(page: Page): Promise<void> {
  await tap(page, 'down');
  await expect.poll(() => read<string>(page, 'p.screenStage')).toBe('menu');
}

test('Prince: цельный «кирпич» с девятью кнопками, без раскладушки и без шкалы фруктов', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#toy')).toHaveAttribute('data-chassis', 'native');
  await expect(page.locator('#base [data-key]')).toHaveCount(9);
  await expect(page.locator('#view-state button')).toHaveCount(2); // «полная» и «только экран»: «свёрнутой» у кирпича нет
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  await expect(page.locator('.minibrick-lcd--live [data-icon]')).toHaveCount(0);
  await expect(page.locator('.minibrick-lcd--live .lcd-cell')).toHaveCount(200 + 16);
  // каждая кнопка — отдельный спрайт с обычной и нажатой копией; область нажатия — по форме
  await expect(page.locator('.pr__art')).toHaveCount(9);
  await expect(page.locator('.pr__art img')).toHaveCount(18);
  expect(await key(page, 'up').evaluate((node) => getComputedStyle(node).clipPath)).toMatch(/^polygon\(/);
  // иероглифы на корпусе: рисунок корпуса загрузился
  expect(await page.evaluate(() => new Promise<boolean>((resolve) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth > 600); image.onerror = () => resolve(false); image.src = getComputedStyle(document.getElementById('toy')!, '::before').backgroundImage.replace(/^url\("?|"?\)$/g, ''); }))).toBe(true);
  expect(errors).toEqual([]);
});

test('Prince: заставка — цифры 9 9 9 9 in 1 поднимаются по одной, потом сама идёт автоплей', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  // в заставке нарисована матрица заставки: цифры только прибавляются, пока не встанут все пять элементов (74 клетки)
  const lit = (): Promise<number> => page.locator('.minibrick-lcd--live .lcd-cell[data-on]').count();
  await expect.poll(lit).toBeGreaterThan(0);
  const first = await lit();
  await expect.poll(lit, { timeout: 20_000 }).toBe(74);
  expect(first).toBeLessThan(74);
  // мелодия «Финала» кончилась: без нажатий включается автоплей
  await expect.poll(() => read<string>(page, 'p.screenStage'), { timeout: 20_000 }).toBe('menu');
  expect(await read<string>(page, 'p.game.phase')).toBe('playing');
});

test('Prince: любая кнопка пропускает заставку; автоплей — игра идёт сама; большая кнопка листает игры', async ({ page }) => {
  await open(page);
  await toDemo(page);
  expect(await read<boolean>(page, 'p.inMenu')).toBe(true);
  expect(await read<string>(page, 'p.game.phase')).toBe('playing');
  const seen = [await read<string>(page, 'p.gameId')];
  for (let i = 0; i < 5; i++) {
    await tap(page, 'jump');
    seen.push(await read<string>(page, 'p.gameId'));
  }
  expect(seen).toEqual(['tetris', 'racing', 'tank', 'frog', 'arkanoid', 'tetris']);
  // вкладка слева следует за игрой под курсором
  await expect(page.locator('.gtab[data-playing]')).toHaveAttribute('data-game', 'tetris');
  await tap(page, 'jump');
  await expect(page.locator('.gtab[data-playing]')).toHaveAttribute('data-game', 'racing');
});

test('Prince: DOWN — вариация, LEFT — уровень, RIGHT — скорость, START — партия, RESET — назад в автоплей', async ({ page }) => {
  await open(page);
  await toDemo(page);
  await tap(page, 'down');
  await tap(page, 'down');
  expect(await read<number>(page, 'p.gameNumber')).toBe(2);
  await tap(page, 'left');
  await tap(page, 'right');
  await tap(page, 'right');
  expect(await read<number[]>(page, '[p.displayLevel, p.displaySpeed]')).toEqual([1, 2]);
  await tap(page, 'sp');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  expect(await read<string>(page, 'p.screenStage')).toBe('game');
  expect(await read<number[]>(page, '[p.displayLevel, p.displaySpeed]')).toEqual([1, 2]);
  await tap(page, 'fire'); // RESET
  await expect.poll(() => read<string>(page, 'p.screenStage')).toBe('menu');
  expect(await read<number>(page, 'p.gameNumber')).toBe(2);
});

test('Prince: левая панель — карточка с наклейкой, пять игр, вариации 118; английский язык', async ({ page }) => {
  await open(page);
  const card = page.locator('.dcard');
  await expect(card).toContainText('Prince');
  await expect(card.locator('.dcard__fvalue').nth(3)).toContainText('118');
  await expect(page.locator('.gtab')).toHaveCount(5);
  await expect(page.locator('.gtab').first()).toHaveText('1–61');
  await expect(card.locator('img.prince-logo')).toBeVisible();
  await page.locator('#corner-lang').click();
  await expect(page.locator('.gpanel .side__text').last()).toContainText('variations');
});

test('Prince: «только экран» — одна рамка без кнопок, ЖК крупно', async ({ page }) => {
  await open(page, '&view=screen');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.pr__art')].every((art) => getComputedStyle(art).visibility === 'hidden'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('toy')!, '::before').backgroundImage)).toContain('lid.webp');
  const window_ = (await page.locator('.lid__window').boundingBox())!;
  const toy = (await page.locator('#toy').boundingBox())!;
  expect(window_.width / toy.width).toBeGreaterThan(0.38);
  expect(toy.height).toBeLessThan(800);
  // касание экрана в автоплее начинает партию
  await page.locator('#game-area').click();
  await expect.poll(() => read<string>(page, 'p.screenStage')).toBe('menu');
});

test('Prince: переключатель «Сегменты экрана» скрывает и возвращает призрак погашенных сегментов, рамка стакана остаётся', async ({ page }) => {
  await open(page);
  await expect(page.locator('#segments-options')).toBeVisible();
  const lcd = page.locator('.minibrick-lcd--live');
  const unlit = lcd.locator('.lcd-cell:not([data-on])').first();
  await expect.poll(() => unlit.evaluate((node) => +getComputedStyle(node).opacity)).toBeGreaterThan(0);
  await page.locator('#segments-options label:has(input[value=off])').click();
  await expect(lcd).toHaveAttribute('data-ghost', 'off');
  await expect.poll(() => unlit.evaluate((node) => +getComputedStyle(node).opacity)).toBe(0);
  expect(await lcd.locator('.lcd-frame').evaluate((node) => +getComputedStyle(node).opacity)).toBeGreaterThan(0.5); // рамка стакана видна всегда
  await page.locator('#segments-options label:has(input[value=on])').click();
  await expect(lcd).not.toHaveAttribute('data-ghost', 'off');
  await expect.poll(() => unlit.evaluate((node) => +getComputedStyle(node).opacity)).toBeGreaterThan(0);
});

test('Prince: справка по кнопкам корпуса в левой панели — иероглифы, перевод, клавиши; раскрытое состояние и язык сохраняются', async ({ page }) => {
  await open(page);
  const help = page.locator('#prince-buttons');
  await expect(help.locator('summary')).toHaveText('Кнопки корпуса');
  if (!(await help.evaluate((node) => (node as HTMLDetailsElement).open))) await help.locator('summary').click();
  const items = help.locator('.pctl__item');
  await expect(items).toHaveCount(9);
  await expect(items.first().locator('.pctl__glyph')).toHaveText('旋转');
  await expect(items.first()).toContainText('ROTATE');
  await expect(items.first()).toContainText('следующая игра');
  await expect(items.first().locator('kbd')).toHaveText('Space · Z');
  await expect(help.locator('.pctl__glyph')).toHaveText(['旋转', '上', '下', '左', '右', '开始\n暂停', '复位', '声音', '开关']);
  // язык: текст переводится, блок остаётся раскрытым
  await page.locator('#corner-lang').click();
  await expect(page.locator('#prince-buttons summary')).toHaveText('Body buttons');
  await expect(page.locator('#prince-buttons')).toHaveJSProperty('open', true);
  await expect(page.locator('#prince-buttons .pctl__item').first()).toContainText('the next game');
});
