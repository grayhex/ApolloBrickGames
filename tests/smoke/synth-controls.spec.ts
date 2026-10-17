import { test, expect } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };

for (const toy of ['clock99', 'seabattle', 'tank168']) {
  test(`${toy}: synthesized sound starts on input, without sample requests`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/audio/')) requests.push(request.url());
    });
    await page.addInitScript(() => {
      const original = AudioContext.prototype.createOscillator;
      Object.assign(window, { tones: [] });
      AudioContext.prototype.createOscillator = function () {
        const oscillator = original.call(this);
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (when) => {
          (window as unknown as { tones: string[] }).tones.push(oscillator.type);
          start(when);
        };
        return oscillator;
      };
    });
    await page.goto(`./?toy=${toy}&power=on`);
    await expect(page.locator('#game-area')).toHaveAttribute('data-boot', 'off');
    await page.locator('#game-area').focus();
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => (window as unknown as { tones: string[] }).tones.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { tones: string[] }).tones.every((t) => t === 'square'))).toBe(true);
    expect(requests).toEqual([]);
  });
}
for (const toy of ['mario', 'clock99', 'seabattle', 'tank168']) {
  test(`${toy}: pause indicator toggles gameplay; control settings are on the left`, async ({ page }) => {
    await page.goto(`./?toy=${toy}&power=on`);
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    if (toy !== 'mario') await expect(page.locator('#game-area')).toHaveAttribute('data-boot', 'off');
    await page.locator('#game-area').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
    const pause = page.locator('button[data-device=pause]');
    await pause.click();
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'paused');
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await pause.click();
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#topleft #corner-settings').click();
    await expect(page.getByRole('heading', { name: 'Настройки управления' })).toBeVisible();
    await expect(page.locator('#settings-shell')).toHaveCount(0);
    await expect(page.locator('#corner-editor')).toHaveCount(0);
  });
}
test('admin: Mario editor link and published default colour override old local preferences', async ({ page, context }) => {
  const config = structuredClone(defaults);
  config.toys.mario.defaultShell = 'white';
  await context.route('**/api/config', (route) => route.fulfill({ json: { config, revision: 1 } }));
  await page.addInitScript(() => localStorage.setItem('crocodile-mario:settings:v1', JSON.stringify({ display: { shell: 'red' } })));
  await page.goto('./');
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'white');
  await page.goto('./admin');
  const editor = page.getByRole('link', { name: 'Открыть редактор уровней Mario ↗' });
  await expect(editor).toBeVisible();
  for (const name of ['Часы+99', 'Морской бой', '168 в 1 танк']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(editor).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Crocodile Mario', exact: true }).click();
  await editor.click();
  await expect(page.locator('#editor-root')).toBeVisible();
});
for (const width of [360, 900, 1440]) {
  test(`chooser at ${width}px: titles fit, white miniatures and Apollo category logo`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./?view=full');
    await expect(page.locator('#toy-family-apollo img')).toBeVisible();
    await expect(page.locator('#topleft img')).toHaveCount(0);
    await expect(page.locator('.toysw__item[data-shell=white]')).toHaveCount(6);
    for (const group of ['apollo', 'other']) {
      await page.locator(`#toy-family-${group}`).click();
      for (const label of await page.locator('.toysw__items:not([hidden]) .toysw__name').all()) await expect(label).toBeVisible();
      const fits = await page
        .locator('.toysw__items:not([hidden]) .toysw__name')
        .evaluateAll((nodes) => nodes.every((n) => n.scrollWidth <= n.clientWidth + 1));
      expect(fits).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}
