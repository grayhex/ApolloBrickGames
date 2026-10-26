import { expect, test, type Page } from '@playwright/test';
import { openPicker, pickerCard, pickerTrigger } from './picker';

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  (page as Page & { __errors?: string[] }).__errors = errors;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
});

const open = async (page: Page, query = 'view=full'): Promise<void> => {
  await page.goto(`./?toy=taksun&${query}`);
  await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'taksun');
};

test('TAKSUN TS-995: синий складной корпус, девять розовых кнопок с подписями как на корпусе, заголовок и каталог', async ({ page }) => {
  await open(page);
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'blue');
  await expect(page).toHaveTitle(/TAKSUN TS-995/);
  await expect(page.locator('h1')).toHaveText('TAKSUN TS-995 · 9999 in 1');
  await expect(page.locator('#side-info')).toHaveAccessibleName('TAKSUN TS-995 · 9999 in 1');
  const keys = page.locator('.taksun-key');
  await expect(keys).toHaveCount(9);
  expect(await keys.evaluateAll((nodes) => nodes.map((node) => (node.getAttribute('aria-label') ?? '').replace(/ — .*/, '')).sort())).toEqual(
    ['DIR/ROTATE', 'DOWN/GAME', 'LEFT/LEVEL', 'ON/OFF', 'PAUSE/START', 'RESET', 'RIGHT/SPEED', 'UP', 'VOLUME'].sort(),
  );
  // Четыре служебные кнопки (а не три, как у B-S96): PAUSE/START, VOLUME, ON/OFF и RESET.
  await expect(page.locator('.taksun-key[data-key=sp], .taksun-key[data-key=sound], .taksun-key[data-key=onoff], .taksun-key[data-key=fire]')).toHaveCount(4);
  // Кнопки розовые, корпус синий.
  const key = page.locator('.taksun-key[data-key=up]');
  const [r, g, b] = (await key.evaluate((node) => getComputedStyle(node).backgroundImage.match(/rgb\((\d+), (\d+), (\d+)\)/)?.slice(1, 4).map(Number) ?? [])) as number[];
  expect(r!).toBeGreaterThan(200);
  expect(r!).toBeGreaterThan(b!);
  expect(b!).toBeGreaterThan(g!);
  expect(await page.locator('.taksun-key[data-key=jump]').evaluate((node) => (node as HTMLElement).offsetHeight / (node as HTMLElement).offsetWidth)).toBeGreaterThan(1.4); // вытянутая DIR/ROTATE (до наклона)
  // Каталог: бренд TAKSUN, значок «Только корпус».
  await expect(pickerTrigger(page).locator('.devpick__maker')).toHaveText('TAKSUN');
  await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('TS-995 · 9999 in 1');
  await expect(pickerTrigger(page).locator('.devpick__ready')).toHaveAttribute('aria-label', 'Только корпус');
  await openPicker(page);
  await expect(pickerCard(page, 'taksun')).toHaveAttribute('aria-current', 'page');
});

test('TAKSUN: обводка стакана с пунктиром внизу и разделителем справа напечатана на стекле и видна всегда', async ({ page }) => {
  await open(page);
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  const solid = page.locator('.taksun-lcd .lcd-line:not(.lcd-line--dash)');
  const dashed = page.locator('.taksun-lcd .lcd-line--dash');
  await expect(solid).toBeVisible();
  await expect(dashed).toBeAttached(); // горизонтальная линия без высоты: Playwright считает такой элемент невидимым, поэтому проверяем штрих и длину
  expect(await dashed.evaluate((node) => getComputedStyle(node).strokeDasharray)).not.toBe('none');
  expect(await dashed.evaluate((node) => (node as SVGGeometryElement).getBBox().width)).toBeGreaterThan(200);
  expect(await dashed.evaluate((node) => getComputedStyle(node).stroke)).not.toBe('none');
  const lcd = (await page.locator('.taksun-lcd').boundingBox())!;
  const window = (await page.locator('.lid__window').boundingBox())!;
  expect(Math.abs(lcd.width - window.width)).toBeLessThan(2); // экран занимает всё стекло
  expect(Math.abs(lcd.height / lcd.width - 324 / 228)).toBeLessThan(0.08); // пропорции стекла по фото
  // Нажатие ON/OFF ничего не включает: игр пока нет, показывается статус разработки; обводка остаётся.
  await page.locator('.taksun-key[data-key=onoff]').click();
  await expect(page.locator('#taksun-notice')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#taksun-notice')).toBeHidden();
  await expect(dashed).toBeAttached();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
});

test('TAKSUN: вид закрытой крышки (лучник) и «только экран»; крышка открывается щелчком', async ({ page }) => {
  await open(page, 'view=closed');
  await expect(page.locator('#toy')).toHaveAttribute('data-closed', '');
  await expect(page.locator('#lid-cover image')).toHaveAttribute('href', /taksun-upper-logo-stencil\.svg$/);
  await page.locator('#lid-cover').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  await page.locator('#view-screen').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
  await expect(page.locator('.taksun-lcd')).toBeVisible();
  await page.locator('#view-closed').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
});

test('TAKSUN: подложка надписи внизу едва заметна — вытравленная выемка, золотые буквы без плашки', async ({ page }) => {
  await open(page);
  const base = page.locator('#base .base__art');
  await expect(base.locator('image[href$="taksun-wordmark.svg"]')).toHaveCount(1);
  await expect(base.locator('image[href*="plaque"]')).toHaveCount(0);
  const recess = base.locator('rect[x="100"][y="508"]');
  await expect(recess).toHaveCount(1);
  expect(Number(await recess.getAttribute('fill-opacity'))).toBeLessThan(0.25);
});

test('TAKSUN: 3D-коробка TS-995 по развёртке открывается: шесть граней с рисунками, все файлы отдаются; бока, верх и низ розовые, оборот — инструкция', async ({ page }) => {
  await open(page);
  const button = page.locator('#side-info [data-box-open=taksun]');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-label', 'Рассмотреть коробку 3D');
  await button.click();
  const dialog = page.locator('#box-dialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(dialog.locator('h2')).toHaveText('Коробка TAKSUN TS-995');
  await expect(dialog.locator('.box3d__face')).toHaveCount(6);
  const urls = await dialog.locator('.box3d__face').evaluateAll((faces) =>
    faces.map((face) => /url\("?([^")]+)"?\)/.exec((face as HTMLElement).style.backgroundImage)?.[1] ?? ''),
  );
  expect(urls.every((url) => /box-taksun\/(front|back|left|right|top|bottom)\.webp$/.test(url))).toBe(true);
  expect(new Set(urls).size).toBe(6);
  const statuses = await page.evaluate(async (list) => Promise.all(list.map(async (url) => (await fetch(url)).status)), urls);
  expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
  // Пропорции лица по развёртке (1300 × 2160) и глубина около четверти ширины.
  const front = (await dialog.locator('.box3d__face--front').evaluate((node) => ({ w: (node as HTMLElement).offsetWidth, h: (node as HTMLElement).offsetHeight })));
  expect(Math.abs(front.h / front.w - 2160 / 1300)).toBeLessThan(0.02);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open', '');
});

test('TAKSUN: переключение на модель и обратно без перезагрузки; в каталоге виден бренд TAKSUN', async ({ page }) => {
  await page.goto('./?toy=mario&view=full');
  await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
  await page.evaluate(() => ((window as unknown as { __alive?: number }).__alive = 1));
  await openPicker(page);
  await pickerCard(page, 'taksun').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'taksun');
  await expect(page).toHaveURL(/toy=taksun/);
  await page.goBack();
  await expect(page.locator('#toy')).not.toHaveAttribute('data-model', 'taksun');
  await page.goForward();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'taksun');
  expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive)).toBe(1);
});

test('TAKSUN на телефоне: горизонтальной прокрутки нет, все кнопки в границах корпуса', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const toy = (await page.locator('#toy').boundingBox())!;
    for (const key of await page.locator('.taksun-key').all()) {
      const box = (await key.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(toy.x - 2);
      expect(box.x + box.width).toBeLessThanOrEqual(toy.x + toy.width + 2);
    }
  }
});
