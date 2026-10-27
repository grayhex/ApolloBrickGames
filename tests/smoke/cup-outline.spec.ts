import { expect, test, type Page } from '@playwright/test';
import { marioUrl } from './url';

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  (page as Page & { __errors?: string[] }).__errors = errors;
  page.on('pageerror', (error) => errors.push(error.message));
});

/** Сколько пикселей холста экрана непрозрачны и есть ли они у левого края поля (линия обводки стакана). */
const canvasInk = (page: Page): Promise<{ total: number; leftEdge: number; bottomEdge: number }> =>
  page.locator('#screen').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const { width, height } = canvas;
    const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const alpha = (x: number, y: number): number => data[(y * width + x) * 4 + 3]!;
    let total = 0;
    let leftEdge = 0;
    let bottomEdge = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (alpha(x, y) > 0) total++;
    for (let y = 0; y < height; y++) for (let x = 0; x < 4; x++) if (alpha(x, y) > 0) leftEdge++;
    for (let x = 0; x < width * 0.5; x++) for (let y = height - 4; y < height; y++) if (alpha(x, y) > 0) bottomEdge++;
    return { total, leftEdge, bottomEdge };
  });

for (const toy of ['clock99', 'tank168', 'brickgame']) {
  test(`${toy}: разделитель виден без лишних линий на выключенном экране`, async ({ page }) => {
    await page.goto(toy === 'clock99' || toy === 'tank168' ? `./?toy=${toy}&view=full` : './?view=full');
    await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
    const off = await canvasInk(page);
    expect(off.total, 'на выключенном экране нарисован разделитель').toBeGreaterThan(100);
    expect(off.leftEdge, 'лишней левой линии нет').toBe(0);
    expect(off.bottomEdge, 'лишней нижней линии нет').toBe(0);
    await page.locator('#base [data-key=onoff]').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
    // `data-power` ставится сразу в обработчике кнопки, а `data-boot` и холст обновляются лишь со следующим кадром: сразу после щелчка `data-boot` ещё «off» от выключенной игрушки, а холст пуст.
    // Поэтому сперва ждём, пока включённый экран нарисует хоть что-то сверх разделителя (кадр прошёл, атрибуты свежие), и лишь потом конец проверки экрана.
    await expect.poll(async () => (await canvasInk(page)).total, 'после включения на экране появляется больше, чем разделитель').toBeGreaterThan(off.total);
    await expect(page.locator('#game-area')).toHaveAttribute('data-boot', 'off');
    const on = await canvasInk(page);
    expect(on.total).toBeGreaterThan(off.total);
  });
}

test('Морской бой: на выключенном экране по-прежнему только разделитель справа от поля', async ({ page }) => {
  await page.goto('./?toy=seabattle&view=full');
  await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
  const ink = await canvasInk(page);
  expect(ink.leftEdge).toBe(0);
  expect(ink.total).toBeGreaterThan(100);
});

for (const toy of ['e88', 'apollo-b0202', 'e23', 'apollo-b0302']) {
  test(`${toy}: рамка стакана (#frame) видна на выключенной игрушке, сегменты скрыты`, async ({ page }) => {
    await page.goto(`./?toy=${toy}&view=full`);
    await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
    await expect(page.locator('.native__lcd #frame')).toBeVisible();
    await expect(page.locator('.native__lcd #display')).toBeHidden();
    await page.locator('#toy').evaluate(() => undefined);
    await page.keyboard.press('KeyO');
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
    await expect(page.locator('.native__lcd #frame')).toBeVisible();
    await page.keyboard.press('KeyO');
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
    await expect(page.locator('.native__lcd #frame')).toBeVisible();
  });
}

test('Mario не затронут: обводка стакана — только у матричных игрушек', async ({ page }) => {
  await page.goto(marioUrl('?view=full'));
  await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  await expect(page.locator('.taksun-lcd, .native__lcd')).toHaveCount(0);
});
