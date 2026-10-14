import { expect, test, type Page } from '@playwright/test';

/**
 * Таймер игры по видео геймплея: до старта на HUD подпись уровня, с первого S./P. — слово TIME и три цифры (400 единиц по ≈ 0,77 с);
 * на паузе таймер стоит.
 */

const area = (page: Page, key: string): Promise<string> =>
  page.evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key);
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');

/** Сколько «чернильных» пикселей в прямоугольнике логического холста 1728 × 864 (цвет ячеек LCD #303a30). */
const inkIn = (page: Page, x: number, y: number, w: number, h: number): Promise<number> =>
  page.evaluate(
    ([lx, ly, lw, lh]) => {
      const canvas = document.getElementById('screen') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const k = canvas.width / 1728;
      const data = ctx.getImageData(Math.round((lx as number) * k), Math.round((ly as number) * k), Math.round((lw as number) * k), Math.round((lh as number) * k)).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs((data[i] ?? 0) - 48) < 14 && Math.abs((data[i + 1] ?? 0) - 58) < 14 && Math.abs((data[i + 2] ?? 0) - 48) < 14) ink += 1;
      }
      return ink;
    },
    [x, y, w, h] as const,
  );

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

test('таймер: до старта подпись, после S./P. слово TIME и число, убывающее по ≈ 1,3 единицы в секунду; на паузе стоит', async ({ page }) => {
  await page.goto('./?power=on');
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(() => area(page, 'intro'), { timeout: 9000 }).toBe('off');
  expect(await area(page, 'time')).toBe(''); // таймера на экране нет
  expect(await inkIn(page, 232, 41, 160, 100)).toBe(0); // слева от подписи пусто
  expect(await inkIn(page, 397, 32, 400, 118)).toBeGreaterThan(5); // подпись `1-01` (холст в окне теста мелкий — порог невелик)

  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');
  const first = Number(await area(page, 'time'));
  expect(first).toBeGreaterThanOrEqual(394); // сценарий выхода из колодца (≈ 2,65 с) съел ≈ 3 единицы, как на видео
  expect(first).toBeLessThanOrEqual(398);
  expect(await inkIn(page, 232, 41, 160, 100)).toBeGreaterThan(10); // слово TIME нарисовано
  expect(await inkIn(page, 397, 32, 400, 118)).toBeGreaterThan(5); // три цифры

  await page.waitForTimeout(3100);
  const later = Number(await area(page, 'time'));
  expect(first - later).toBeGreaterThanOrEqual(3); // ≈ 4 единицы за 3 с
  expect(first - later).toBeLessThanOrEqual(5);

  // Пауза: время стоит; продолжение — идёт дальше.
  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('paused');
  const paused = await area(page, 'time');
  await page.waitForTimeout(1600);
  expect(await area(page, 'time')).toBe(paused);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(async () => Number(await area(page, 'time')), { timeout: 4000 }).toBeLessThan(Number(paused));
});
