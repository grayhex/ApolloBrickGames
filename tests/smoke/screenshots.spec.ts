import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * Снимки для PR и согласования с владельцем. Обычный прогон их пропускает:
 *   SCREENSHOTS=1 npm run test:smoke -- screenshots
 * Файлы пишутся в docs/screenshots/ и коммитятся вручную после просмотра.
 */
test.skip(!process.env['SCREENSHOTS'], 'Снимки делаются только по SCREENSHOTS=1');
test.use({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });

const dir = 'docs/screenshots';

test('комната: старт и прыжок', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.goto('./');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await page.locator('.stage').screenshot({ path: `${dir}/demo-room-ready.png` });
  await page.keyboard.press('Enter');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await page.waitForTimeout(330);
  await page.screenshot({ path: `${dir}/demo-room-page.png` });
});

test('контрольный лист ресурсов', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.goto('./#/sheet');
  await page.waitForSelector('#sheet table');
  await page.screenshot({ path: `${dir}/asset-sheet.png`, fullPage: true });
});
