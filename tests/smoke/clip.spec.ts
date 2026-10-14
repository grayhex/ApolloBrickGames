import { expect, test, type Page } from '@playwright/test';

/**
 * Маршрут #/clip: тестовый уровень по фрагменту видео (интро участка, отскок перекладины, пробиваемая крышка арки).
 * Состояние — из data-* игровой области; эффекты проверяются по пикселям Canvas.
 */

const area = (page: Page, key: string): Promise<string> =>
  page.evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key);
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const heroY = (page: Page) => async (): Promise<number> => Number(await area(page, 'heroY'));

/** Доля «чернильных» пикселей клетки поля (логический холст 1728 × 864, клетка 128 × 112, поле с (32, 154)). */
function inkShare(page: Page, col: number, row: number): Promise<number> {
  return page.evaluate(
    ([c, r]) => {
      const canvas = document.getElementById('screen') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const scale = canvas.width / 1728;
      const x0 = Math.round((32 + (c as number) * 128) * scale) + 2;
      const y0 = Math.round((154 + (r as number) * 112) * scale) + 2;
      const w = Math.round(128 * scale) - 4;
      const h = Math.round(112 * scale) - 4;
      const data = ctx.getImageData(x0, y0, w, h).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs((data[i] ?? 0) - 48) < 24 && Math.abs((data[i + 1] ?? 0) - 58) < 24) ink += 1;
      }
      return ink / (data.length / 4);
    },
    [col, row] as const,
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

test('интро: оверлей «Старт» не закрывает поле, герой идёт по маршруту, потом готов к старту', async ({ page }) => {
  await page.goto('./#/clip');
  await expect(page.locator('#badge')).toContainText('по видео');
  await expect.poll(phase(page)).toBe('ready');
  await expect(page.locator('#overlay')).toBeHidden(); // идёт интро (≈ 4,7 с)

  // Через ≈ 3 с герой уже на пути (построение началось), часть пола построена.
  await expect.poll(() => inkShare(page, 11, 5), { timeout: 6000 }).toBeGreaterThan(0.3);

  // Интро кончилось: оверлей «Старт», комната построена целиком, крышка арки на месте.
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#overlay-action')).toHaveText('Старт');
  expect(await inkShare(page, 6, 5)).toBeGreaterThan(0.3); // пол
  expect(await inkShare(page, 1, 3)).toBeGreaterThan(0.3); // крышка (объект brick)
  expect(await inkShare(page, 0, 3)).toBeGreaterThan(0.3); // верх левой стойки
  expect(await area(page, 'heroX')).toBe('1');
  expect(await area(page, 'heroY')).toBe('5');
});

test('Enter во время интро пропускает его и сразу запускает игру', async ({ page }) => {
  await page.goto('./#/clip');
  await expect.poll(phase(page)).toBe('ready');
  await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  // Комната нарисована целиком без ожидания интро.
  await expect.poll(() => inkShare(page, 6, 5)).toBeGreaterThan(0.3);
  await expect.poll(() => inkShare(page, 1, 3)).toBeGreaterThan(0.3);
});

test('удар головой: копия перекладины над крышкой мигает ≈ 0,25 с, на третий удар крышка исчезает, герой выходит на стойку', async ({
  page,
}) => {
  await page.goto('./#/clip');
  await expect.poll(phase(page)).toBe('ready');
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  expect(await inkShare(page, 1, 2)).toBe(0);

  // Прыжок: на 0,15 с — подъём на клетку, на 0,3 с (3-й такт) голова упирается в крышку и над ней вспыхивает копия.
  const seenFlash = page.evaluate(async () => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const scale = canvas.width / 1728;
    const x0 = Math.round((32 + 128) * scale) + 2;
    const y0 = Math.round((154 + 2 * 112) * scale) + 2;
    const w = Math.round(128 * scale) - 4;
    const h = Math.round(112 * scale) - 4;
    let max = 0;
    let frames = 0;
    const end = performance.now() + 1100;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const data = ctx.getImageData(x0, y0, w, h).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs((data[i] ?? 0) - 48) < 24 && Math.abs((data[i + 1] ?? 0) - 58) < 24) ink += 1;
      }
      const share = ink / (data.length / 4);
      if (share > 0.3) frames += 1;
      max = Math.max(max, share);
    }
    return { max, frames };
  });
  await page.keyboard.press('Space');
  const flash = await seenFlash;
  expect(flash.max).toBeGreaterThan(0.3); // копия перекладины появилась
  expect(flash.frames).toBeGreaterThan(2); // и продержалась несколько кадров…
  expect(flash.frames).toBeLessThan(40); // …но не навсегда (5 тактов ≈ 0,25 с ≈ 15 кадров)
  expect(await inkShare(page, 1, 2)).toBe(0);

  // Ещё два удара (по ≈ 0,8 с на прыжок): на третий крышка (1, 3) исчезает.
  for (let i = 0; i < 2; i++) {
    await expect.poll(heroY(page), { timeout: 3000 }).toBe(5);
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  await expect.poll(heroY(page), { timeout: 3000 }).toBe(5);
  await expect.poll(() => inkShare(page, 1, 3), { timeout: 3000 }).toBeLessThan(0.05);
  expect(await inkShare(page, 0, 3)).toBeGreaterThan(0.3); // стойки целы

  // Четвёртый прыжок — на три клетки; вправо удерживается: герой проходит над правой стойкой и сходит на пол.
  // (Точное положение на верхушке стойки проверяют юнит-тесты по тактам.)
  await page.keyboard.press('Space');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => Number(await area(page, 'heroX')), { timeout: 3000 }).toBeGreaterThanOrEqual(3);
  await expect.poll(heroY(page), { timeout: 3000 }).toBe(4);
});

test('основная комната: отскок перекладины есть и там (платформа над героем), интро — нет', async ({ page }) => {
  await page.goto('./');
  await expect.poll(phase(page)).toBe('ready');
  await expect(page.locator('#overlay')).toBeVisible(); // у комнаты интро не включено: оверлей сразу
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight'); // x = 4 под платформой (x = 3…5, y = 3)
  await expect.poll(async () => Number(await area(page, 'heroX'))).toBe(4);
  const flashed = page.evaluate(async () => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const scale = canvas.width / 1728;
    const x0 = Math.round((32 + 4 * 128) * scale) + 2;
    const y0 = Math.round((154 + 2 * 112) * scale) + 2; // ряд над платформой
    const w = Math.round(128 * scale) - 4;
    const h = Math.round(112 * scale) - 4;
    let max = 0;
    const end = performance.now() + 1000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const data = ctx.getImageData(x0, y0, w, h).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs((data[i] ?? 0) - 48) < 24 && Math.abs((data[i + 1] ?? 0) - 58) < 24) ink += 1;
      }
      max = Math.max(max, ink / (data.length / 4));
    }
    return max;
  });
  await page.keyboard.press('Space');
  expect(await flashed).toBeGreaterThan(0.3);
});
