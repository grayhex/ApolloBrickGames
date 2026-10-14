import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * Снимки для PR и согласования с владельцем. Обычный прогон их пропускает:
 *   SCREENSHOTS=1 npm run test:smoke -- screenshots
 * Файлы пишутся в docs/screenshots/ и коммитятся вручную после просмотра.
 */
test.skip(!process.env['SCREENSHOTS'], 'Снимки делаются только по SCREENSHOTS=1');
test.use({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });

const dir = 'docs/screenshots';

test('игрушка: интро, выход из туннеля, стрельба, нажатые кнопки, режим «только экран»', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.goto('./');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  const stage = (name: string): Promise<Buffer> => page.locator('#stage').screenshot({ path: `${dir}/${name}.png` });
  await page.waitForTimeout(750);
  await stage('tunnel-intro-fill');
  await page.waitForTimeout(2450);
  await stage('tunnel-intro-build');
  await page.waitForSelector('#game-area[data-intro="off"]', { timeout: 8000 });

  // Старт: герой выпрыгивает из туннеля — удар головой о крышку арки.
  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  await page.waitForTimeout(250);
  await stage('tunnel-bump');
  await page.waitForSelector('#game-area[data-entry="off"]', { timeout: 6000 });

  // «Сердечко» вылетает из центра ячейки героя.
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${dir}/toy-page.png` });

  // Нажатые кнопки: вправо, прыжок и огонь удерживаются; мир прокручивается.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(900);
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyX');
  await page.waitForTimeout(260);
  await stage('toy-pressed');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyX');

  await page.locator('#corner-compact').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/toy-compact.png` });
});

test('игрушка: четыре цвета корпуса', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.goto('./');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await page.waitForSelector('#game-area[data-intro="off"]', { timeout: 8000 });
  for (const shell of ['blue', 'red', 'yellow', 'white']) {
    await page.locator('#corner-settings').click();
    await page.selectOption('#settings-shell', shell);
    await page.keyboard.press('Escape');
    await page.locator('#game-area').waitFor();
    await page.waitForTimeout(150);
    await page.locator('#stage').screenshot({ path: `${dir}/toy-${shell}.png` });
  }
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

