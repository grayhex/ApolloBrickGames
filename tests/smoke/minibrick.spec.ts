import { expect, test } from '@playwright/test';

test('Mini Brick Game: выключенный LCD, собственное управление и уведомление вместо запуска игры', async ({ page }) => {
  await page.goto('./?toy=minibrick&view=full&power=on&debug');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'unavailable');
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'red');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  await expect(page.locator('#side-info')).toHaveAccessibleName('Mini Brick Game B-S96');
  await expect(page.locator('.minibrick-key')).toHaveCount(8);
  await expect(page.locator('.minibrick-lcd')).toHaveCount(1);
  const rotation = (await page.locator('.minibrick-key[data-key=jump]').boundingBox())!;
  expect(rotation.height / rotation.width).toBeGreaterThan(1.4);
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#minibrick-notice h2')).toHaveText('Игра пока в разработке');
  await page.keyboard.press('Escape');
  await page.keyboard.press('o');
  await expect(page.locator('#minibrick-notice')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#corner-lang').click();
  await page.locator('#corner-help').click();
  await expect(page.locator('#help')).toContainText('Red and blue folding shell');
  await page.keyboard.press('Escape');
  await page.locator('#corner-settings').click();
  await expect(page.locator('#settings .shellpick')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('#view-screen').click();
  await page.locator('#game-area').click();
  await expect(page.locator('#minibrick-notice h2')).toHaveText('Game in development');
  expect(await page.evaluate(() => '__brick' in window || '__tetris' in window)).toBe(false);
});

test('переключение Mini → Alibaba → Apollo восстанавливает экран, кнопки и справку', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?toy=minibrick&view=full');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'unavailable');
  await page.locator('.toysw__item[data-toy=alibaba]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'alibaba');
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'white');
  await expect(page.locator('.minibrick-lcd')).toHaveCount(0);
  await expect(page.locator('.minibrick-key')).toHaveCount(0);
  await expect(page.locator('#minibrick-notice')).toHaveCount(0);
  await expect(page.locator('#side-info')).toHaveAccessibleName('Alibaba Dance 99 in 1');
  await page.goBack();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'minibrick');
  await expect(page.locator('.minibrick-lcd')).toHaveCount(1);
  await page.locator('#toy-family-apollo').click();
  await page.locator('.toysw__item[data-toy=seabattle]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'seabattle');
  await expect(page.locator('.minibrick-lcd')).toHaveCount(0);
  await expect(page.locator('#lid-cover image')).toHaveCount(0);
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  expect(errors).toEqual([]);
});

test('две модели в «Другие» доступны на телефоне, LCD и кнопка питания остаются в границах', async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('./?toy=minibrick&view=full');
    await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
    await page.addStyleTag({ content: "*{font-family:'DejaVu Sans',sans-serif !important}" });
    const links = page.locator('[data-family=other] .toysw__item');
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      const box = (await link.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.width).toBeGreaterThan(50);
    }
    const onoff = (await page.locator('[data-key=onoff]').boundingBox())!;
    expect(onoff.y + onoff.height).toBeLessThan(660);
    const lcd = (await page.locator('.minibrick-lcd').boundingBox())!;
    const window = (await page.locator('.lid__window').boundingBox())!;
    expect(lcd.x).toBeGreaterThanOrEqual(window.x - 1);
    expect(lcd.x + lcd.width).toBeLessThanOrEqual(window.x + window.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('[data-key=onoff]').click();
    await expect(page.locator('#minibrick-notice')).toBeVisible();
    await page.keyboard.press('Escape');
  }
});


test('группа «Другие» не перекрывает системное меню запущенной Apollo', async ({ page }) => {
  for (const width of [900, 1024, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./?power=on');
    await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
    await page.locator('#toy-family-other').click();
    const menu = (await page.locator('#toy-switch').boundingBox())!;
    const corner = (await page.locator('.corner').boundingBox())!;
    expect(menu.x + menu.width).toBeLessThan(corner.x);
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  }
});
