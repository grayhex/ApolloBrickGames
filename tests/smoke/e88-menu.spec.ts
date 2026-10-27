import { expect, test, type Page } from '@playwright/test';

/** Сегменты LCD E‑88 (id вида `<адрес>_<бит>`): HI-SCORE — 193_2 + 195_2, LINES — 193_0. Состояние меню сверено с ROM BrickEmuPy: надписи чередуются каждые ~1,05 с. */
const lit = (page: Page, id: string): Promise<boolean> => page.locator(`.native__lcd [id="${id}"]`).evaluate((node) => (node as SVGElement).style.opacity === '1');

test('E‑88: в меню рекорд очков и рекорд рядов чередуются (HI-SCORE ↔ LINES), как у оригинала', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // Рекорд пункта 1 (тетрис E‑88): 1230 очков и 45 рядов — по ключам оболочки.
    for (const [key, value] of Object.entries({
      'crocodile-mario:brick:e88:e88.1:0:native-r1': '1230',
      'crocodile-mario:brick:e88:e88.1:0:native-r1:lines': '45',
    })) localStorage.setItem(key, value);
  });
  await page.goto('./?toy=e88&power=on&debug&view=full');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.native__lcd')).toBeAttached();
  const seen = new Set<string>();
  const start = Date.now();
  while (Date.now() - start < 3600 && seen.size < 2) {
    seen.add((await lit(page, '193_0')) ? 'lines' : (await lit(page, '193_2')) ? 'hi' : 'none');
    await page.waitForTimeout(80);
  }
  expect([...seen].sort()).toEqual(['hi', 'lines']);
  expect(errors).toEqual([]);
});
