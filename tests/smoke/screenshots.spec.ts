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
  await page.keyboard.press('Enter');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await page.waitForTimeout(330);
  await page.screenshot({ path: `${dir}/demo-room-page.png` });
});

test('комната: красный и белый корпус', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.goto('./');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  for (const shell of ['red', 'white']) {
    await page.selectOption('#sel-shell', shell);
    await page.locator('#stage').screenshot({ path: `${dir}/demo-room-${shell}.png` });
  }
});

test.describe('контрольный лист', () => {
  test.use({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });

  test('сцены с фотографий в рендере игры', async ({ page }) => {
    mkdirSync(dir, { recursive: true });
    await page.goto('./#/sheet');
    await page.waitForSelector('#ref-scene-2');
    await page.locator('.sheet__scenes').screenshot({ path: `${dir}/asset-sheet.png` });
  });
});
