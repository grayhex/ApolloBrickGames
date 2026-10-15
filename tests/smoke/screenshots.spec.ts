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
  await page.goto('./?power=on');
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

  await page.locator('#view-screen').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/toy-compact.png` });
});

test('страница целиком: панели по бокам игрушки, светлый фон', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./?power=on');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await page.waitForSelector('#game-area[data-intro="off"]', { timeout: 8000 });
  await page.screenshot({ path: `${dir}/toy-panels.png` });
  await page.locator('#shell-picker [data-shell="red"]').click();
  await page.locator('#corner-theme').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/toy-light.png` });
});

test('английский интерфейс и «сбой шлейфа»: экран рассыпается, пока держат шлейф', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./?power=on');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await page.waitForSelector('#game-area[data-intro="off"]', { timeout: 8000 });
  await page.locator('#corner-lang').click();
  await page.locator('#run-toggle').click(); // спидран-HUD выезжает
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${dir}/toy-panels-en.png` });

  await page.locator('#game-area').focus(); // фокус был на кнопке пульта: Enter должен идти игре
  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  await page.waitForSelector('#game-area[data-entry="off"]', { timeout: 6000 });
  const band = await page.locator('.toy__band').boundingBox();
  if (!band) throw new Error('Нет шлейфа');
  await page.mouse.move(band.x + band.width / 2, band.y + band.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => Number(document.getElementById('game-area')?.dataset['glitch']) > 0.6, null, { timeout: 5000 });
  const box = await page.locator('#stage').boundingBox();
  if (!box) throw new Error('Нет игрушки');
  await page.screenshot({ path: `${dir}/toy-glitch.png`, clip: { x: box.x - 10, y: Math.max(0, box.y - 10), width: box.width + 20, height: box.height * 0.5 } });
  await page.mouse.up();
});

test('закрытая игрушка с логотипом Apollo на крышке (четыре цвета)', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.waitForSelector('#toy[data-view="closed"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/toy-closed-page.png` });
  for (const shell of ['blue', 'red', 'yellow', 'white']) {
    await page.locator(`#shell-picker [data-shell="${shell}"]`).click();
    await page.waitForTimeout(150);
    await page.locator('#stage').screenshot({ path: `${dir}/toy-closed-${shell}.png` });
  }
});

test('GAME OVER: бегущая надпись из блоков (три кадра подряд)', async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.goto('./?power=on');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await page.waitForSelector('#game-area[data-intro="off"]', { timeout: 8000 });
  // Четыре раза: старт и бег вправо до первой пропасти.
  for (let life = 0; life < 4; life++) {
    await page.keyboard.press('Enter');
    await page.waitForSelector('#game-area[data-phase="playing"]');
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => document.getElementById('game-area')?.dataset['phase'] !== 'playing', null, { timeout: 20_000 });
    await page.keyboard.up('ArrowRight');
    if (life < 3) await page.waitForSelector('#game-area[data-phase="ready"]', { timeout: 10_000 });
  }
  await page.waitForSelector('#game-area[data-phase="gameOver"]', { timeout: 10_000 });
  const window = page.locator('#lcd-window');
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(i === 0 ? 1200 : 900);
    await window.screenshot({ path: `${dir}/game-over-${i + 1}.png` });
  }
});

test('игрушка: четыре цвета корпуса', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.goto('./?power=on');
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await page.waitForSelector('#game-area[data-intro="off"]', { timeout: 8000 });
  for (const shell of ['blue', 'red', 'yellow', 'white']) {
    await page.locator(`#shell-picker [data-shell="${shell}"]`).click();
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

test.describe('телефон: игрушка во всю ширину экрана', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });

  test('phone-toy: игра идёт, экран и все кнопки в окне', async ({ page }) => {
    mkdirSync(dir, { recursive: true });
    await page.goto('./?power=on');
    await page.waitForSelector('#game-area[data-phase="ready"]');
    await page.waitForSelector('#game-area[data-intro="off"]', { timeout: 8000 });
    await page.keyboard.press('Enter');
    await page.waitForSelector('#game-area[data-entry="off"]', { timeout: 8000 });
    await page.screenshot({ path: `${dir}/phone-toy.png` });
  });
});


test('три игрушки: шапка с переключателем, «Часы+99» и «Морской бой» (снимки для docs/toys.md)', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const open = async (query: string): Promise<void> => {
    await page.goto(`./${query}`);
    await page.waitForSelector('#game-area[data-phase="ready"]');
    await page.waitForSelector('#game-area[data-boot="off"]', { state: 'attached' }).catch(() => undefined); // у Mario вспышки нет
    await page.waitForTimeout(900);
  };
  await open('?toy=clock99&power=on&seed=7');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowDown');
  await page.screenshot({ path: `${dir}/toys-clock99.png` });
  await open('?toy=seabattle&power=on&seed=7');
  await page.screenshot({ path: `${dir}/toys-seabattle.png` });
  await open('?toy=clock99');
  await page.screenshot({ path: `${dir}/toys-closed.png` });
  await open('?toy=tank168&power=on&seed=7');
  await page.locator('#shell-picker [data-shell="yellow"]').click();
  await page.screenshot({ path: `${dir}/toys-tank168.png` });
});
