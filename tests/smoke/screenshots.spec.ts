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

test('клип по видео: заливка, растворение, построение, отскок перекладины', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.goto('./#/clip');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  const shot = (name: string): Promise<Buffer> => page.locator('#stage').screenshot({ path: `${dir}/clip-${name}.png` });
  await page.waitForTimeout(750);
  await shot('intro-fill');
  await page.waitForTimeout(800);
  await shot('intro-dissolve');
  await page.waitForTimeout(1650);
  await shot('build');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(190);
  await shot('bump');
  await page.waitForTimeout(1200);
  await shot('room');
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

test.describe('редактор уровней', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  test('подложка, калибровка и тестовый запуск (искусственный референс)', async ({ page }) => {
    mkdirSync(dir, { recursive: true });
    await page.goto('./#/editor');
    await page.waitForSelector('#editor-root[data-ready="true"]');
    await page.setInputFiles('#editor-import', 'docs/editor-demo/artificial-room.crocodile-project.zip');
    await page.waitForFunction(() => document.querySelector('#editor-map')?.getAttribute('data-refs') === '1');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/editor-overlay.png` });

    await page.click('[data-mode="side"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/editor-side-by-side.png` });
    await page.click('[data-mode="overlay"]');

    await page.getByRole('button', { name: 'Калибровать углы…' }).click();
    await page.waitForSelector('.calib');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/editor-calibration.png` });
    await page.getByRole('button', { name: 'Отмена' }).click();

    await page.click('#editor-test-run');
    await page.waitForSelector('#test-area[data-phase="playing"]');
    await page.locator('#test-area').focus();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(450);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${dir}/editor-test.png` });
  });
});

