import { test, expect } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { marioUrl } from './url';

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
  await page.goto(marioUrl(''));
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
    await page.goto(marioUrl('?view=full'));
    await expect(page.locator('.site-brand img')).toBeVisible();
    await expect(page.locator('#topleft img')).toHaveCount(0);
    await expect(page.locator('.toysw__item[data-shell=white]')).toHaveCount(7);
    for (const direction of ['Следующие модели','Предыдущие модели']) {
      await page.getByRole('button',{name:direction}).click();
      for (const label of await page.locator('.toysw__carousel .toysw__name').all()) await expect(label).toBeVisible();
      const fits = await page
        .locator('.toysw__carousel .toysw__name')
        .evaluateAll((nodes) => nodes.every((n) => n.scrollWidth <= n.clientWidth + 1));
      expect(fits).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}

for (const toy of ['clock99', 'seabattle', 'tank168']) {
  test(`${toy}: physical START/PAUSE mapping also pauses and resumes with Enter`, async ({ page }) => {
    await page.goto(`./?toy=${toy}&power=on`);
    const area = page.locator('#game-area');
    await expect(area).toHaveAttribute('data-boot', 'off');
    await area.focus();
    for (const phase of ['playing', 'paused', 'playing']) {
      await page.keyboard.press('Enter');
      await expect(area).toHaveAttribute('data-phase', phase);
    }
  });
}

for (const game of ['simon', 'dance']) {
  test(`${game}: gameplay pad tones reach Web Audio through the cabinet`, async ({ page, context }) => {
    const config = structuredClone(defaults);
    config.toys.clock99.games = [{ id: game }];
    config.toys.clock99.defaultGame = game;
    await context.route('**/api/config', (route) => route.fulfill({ json: { config, revision: 1 } }));
    await page.addInitScript(() => {
      const original = AudioContext.prototype.createOscillator;
      Object.assign(window, { frequencies: [] });
      AudioContext.prototype.createOscillator = function () {
        const oscillator = original.call(this);
        const set = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (value, time) => {
          (window as unknown as { frequencies: number[] }).frequencies.push(value);
          return set(value, time);
        };
        return oscillator;
      };
    });
    await page.goto('./?toy=clock99&power=on&debug');
    await expect(page.locator('#game-area')).toHaveAttribute('data-boot', 'off');
    await page.locator('#game-area').focus();
    await page.keyboard.press('Enter');
    if (game === 'dance') {
      // Wait for an actual falling note to enter the hit window; do not invent a tone event.
      const note = await page.waitForFunction(() => {
        const game = (window as unknown as { __brick?: { game?: { notes?: { direction: number; y: number }[] } } }).__brick?.game;
        return game?.notes?.find((note) => note.y >= 16 && note.y <= 18);
      });
      const direction = (await note.jsonValue())!.direction;
      await page.keyboard.press(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][direction]!);
    }
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { frequencies: number[] }).frequencies.some((hz) => [523, 659, 392, 330].includes(hz))))
      .toBe(true);
  });
}
