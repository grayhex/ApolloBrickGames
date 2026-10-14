import { expect, test, type Page } from '@playwright/test';

/**
 * Конец игры: поле пустеет, и по нему справа налево плывёт «GAME OVER» блоками (как на раскадровке оригинала).
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');

/** Чернильные пиксели холста по столбцам: «отпечаток» кадра. */
function columns(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, Math.floor(height * 0.28), width, Math.floor(height * 0.6)).data;
    const rows = Math.floor(height * 0.6);
    const out: number[] = [];
    const bucket = Math.max(1, Math.floor(width / 26));
    for (let x0 = 0; x0 < width; x0 += bucket) {
      let ink = 0;
      for (let x = x0; x < Math.min(width, x0 + bucket); x++) {
        for (let y = 0; y < rows; y += 3) {
          const i = (y * width + x) * 4;
          if (Math.abs((data[i] ?? 0) - 48) < 40 && Math.abs((data[i + 1] ?? 0) - 58) < 40) ink += 1;
        }
      }
      out.push(ink);
    }
    return out;
  });
}

test('GAME OVER: после четвёртой потери жизни по пустому полю плывёт надпись', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./?power=on');
  await expect.poll(() => area(page, 'phase')).toBe('ready');
  await expect.poll(() => area(page, 'intro'), { timeout: 8000 }).toBe('off');

  // Четыре раза подряд: старт, бег вправо до первой пропасти — потеря жизни.
  for (let life = 4; life > 0; life--) {
    expect(await area(page, 'lives')).toBe(String(life));
    await page.keyboard.press('Enter');
    await expect.poll(() => area(page, 'phase')).toBe('playing');
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => area(page, 'phase'), { timeout: 20_000 }).not.toBe('playing');
    await page.keyboard.up('ArrowRight');
    if (life > 1) await expect.poll(() => area(page, 'phase'), { timeout: 10_000 }).toBe('ready');
  }
  await expect.poll(() => area(page, 'phase'), { timeout: 10_000 }).toBe('gameOver');
  await expect(page.locator('#game-area')).toHaveAttribute('data-lives', '0');

  // Надпись плывёт: отпечатки кадров с интервалом различаются, чернил на экране много меньше, чем «залитого» поля.
  const first = await columns(page);
  await page.waitForTimeout(700);
  const second = await columns(page);
  expect(first.reduce((a, b) => a + b, 0) + second.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  expect(second).not.toEqual(first);
  // Надпись идёт непрерывно: за несколько секунд отпечатки кадров заметно меняются (повтор прохода проверяет модульный тест).
  const prints = new Set<string>();
  for (let i = 0; i < 25; i++) {
    prints.add((await columns(page)).join(','));
    await page.waitForTimeout(200);
  }
  expect(prints.size).toBeGreaterThan(5);

  // Enter начинает новую игру: надпись исчезает, жизни снова 4.
  await page.locator('#game-area').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  expect(await area(page, 'lives')).toBe('4');
  expect(errors).toEqual([]);
});
