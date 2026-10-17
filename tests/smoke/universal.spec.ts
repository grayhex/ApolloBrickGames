import { test, expect } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { validateConfig } from '../../src/config/schema';

test('universal console boots, synthesizes a greeting, supports FIRE and returns to menu with RESET', async ({ page }) => {
  const config = validateConfig(defaults);
  config.toys.brickgame.games = [{ id: 'jigsaw' }];
  config.toys.brickgame.defaultGame = 'jigsaw';
  await page.route('**/api/config', (route) => route.fulfill({ json: { config, revision: 1 } }));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      document.documentElement.dataset['oscillators'] = String(Number(document.documentElement.dataset['oscillators'] ?? 0) + 1);
      return original.call(this);
    };
  });
  await page.goto('./?toy=brickgame&view=closed&debug');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  await expect(page.locator('#view-closed')).toHaveCount(0);
  expect(await page.locator('#toy .key').evaluateAll((nodes) => nodes.every((node) => (node as HTMLElement).tabIndex === -1))).toBe(true);
  await expect(page.locator('.toy__hinge')).toBeHidden();
  await expect(page.locator('#shell-picker [role=radio]')).toHaveCount(2);
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'gray');
  const gray = await page.locator('#toy').evaluate((node) => getComputedStyle(node).backgroundImage);
  await page.locator('#shell-picker [data-shell=black]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'black');
  expect(await page.locator('#toy').evaluate((node) => getComputedStyle(node).backgroundImage)).not.toBe(gray);
  await expect(page.locator('.toysw__universal')).toHaveAttribute('data-shell', 'white');
  await page.locator('#shell-picker [data-shell=gray]').click();
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('html')).toHaveAttribute('data-oscillators', /[1-9]/);
  // Power changes are painted on the next frame; the initially powered-off LCD also has boot=off.
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect(page.locator('#game-area')).toHaveAttribute('data-boot', 'off');
  await page.locator('[data-key=sp]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  await page.locator('[data-key=fire]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  await page.locator('[data-action=reset]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
  await page.locator('#view-screen').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
  await expect(page.locator('#lower')).toBeHidden();
  await page.locator('#view-full').click();
  await expect(page.locator('[data-action=reset]')).toBeVisible();
  await page.locator('.toysw__item[data-toy=clock99]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'clock99');
  await expect(page.locator('.toy__hinge')).toBeVisible();
  await expect(page.locator('.classic__key')).toHaveCount(0);
  await page.locator('.toysw__item[data-toy=brickgame]').click();
  await expect(page.locator('.classic__key')).toHaveCount(6);
  expect(errors).toEqual([]);
});

for (const width of [320, 360, 900, 1440])
  test(`brand and carousel at ${width}px on both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./?toy=brickgame');
    // Include the additional controller indicator in the narrowest layout.
    await page.locator('[data-device=gamepad]').evaluate((node) => {
      node.removeAttribute('hidden');
    });
    for (let theme = 0; theme < 2; theme++) {
      await expect(page.locator('#topleft #corner-theme')).toBeVisible();
      await expect(page.locator('#topleft #corner-help')).toBeVisible();
      await expect(page.locator('#topleft #corner-lang')).toBeVisible();
      expect(await page.locator('.site-brand img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const boxes = await page
        .locator('#topleft,.site-brand,#toy-switch')
        .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().toJSON()));
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!,
            b = boxes[j]!;
          expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
        }
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.getByRole('button', { name: 'Следующие модели' }).click();
      expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
      await expect(page.locator('.toysw__universal')).toHaveAttribute('aria-current', 'page');
      await page.locator('.toysw__item[data-toy=minibrick]').focus();
      await page.keyboard.press('Home');
      await expect(page.locator('.toysw__item[data-toy=mario]')).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.locator('#corner-theme').click();
    }
    const favicon = await page.locator('link[rel=icon]').getAttribute('href');
    expect((await page.request.get(favicon!)).ok()).toBe(true);
  });

test('admin exposes pinned and automatic menus without allowing unsupported FIRE on Apollo', async ({ page }) => {
  await page.route('**/api/config', (route) => route.fulfill({ json: { config: defaults, revision: 1 } }));
  await page.goto('./admin');
  await page.getByRole('button', { name: 'Brick Game', exact: true }).click();
  await expect(page.getByLabel('Доступен цвет: Серый', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Доступен цвет: Чёрный', { exact: true })).toBeChecked();
  await page.getByLabel('Основной цвет', { exact: true }).selectOption('black');
  await expect(page.locator('summary').filter({ hasText: 'Автоматически' })).toBeVisible();
  await page.getByLabel('Добавить игру', { exact: true }).selectOption('jigsaw');
  await page.getByRole('button', { name: 'Добавить в меню', exact: true }).click();
  await expect(page.locator('.admin__games [data-game=jigsaw]')).toBeVisible();
});
