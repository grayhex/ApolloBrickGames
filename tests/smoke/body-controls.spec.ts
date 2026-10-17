import { expect, test } from '@playwright/test';

for (const toy of ['clock99', 'tank168', 'seabattle'])
  test(`${toy}: только кнопки корпуса в меню, справке и настройках`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`./?toy=${toy}&power=on&debug&seed=7`);
    const area = page.locator('#game-area');
    await expect(area).toHaveAttribute('data-boot', 'off');
    await expect(area).toHaveAttribute('data-menu', 'menu');
    await expect(page.locator('#keymap')).not.toContainText('Бросок');
    await expect(page.locator('#keymap kbd').filter({ hasText: /^X$/ })).toHaveCount(0);
    const initial = await area.getAttribute('data-game');
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(100);
    await expect(area).toHaveAttribute('data-game', initial!);
    await page.keyboard.press('Space');
    await expect(area).not.toHaveAttribute('data-game', initial!);
    await page.keyboard.press('Enter');
    await expect(area).toHaveAttribute('data-phase', 'playing');
    await page.locator('[data-key="fire"]').click(); // физическая RESET
    await expect(area).toHaveAttribute('data-menu', 'menu');

    await page.locator('#corner-help').click();
    const help = page.locator('#help');
    await expect(help).toBeVisible();
    // У тетриса в подробной справке остались ROTATE и DOWN, скрытого броска нет.
    const tetris = help.locator('.help__game[data-game="tetris"]');
    await tetris.locator('summary').first().click();
    await expect(tetris.locator('.gctl')).not.toContainText('FIRE');
    await expect(tetris.locator('.gctl')).not.toContainText('Бросить');
    await expect(tetris.locator('.gctl')).toContainText('ROTATE');
    await expect(help).not.toContainText('левая — мгновенное падение');
    expect(await help.locator('.help__game[data-game] .gctl').allTextContents()).not.toEqual(
      expect.arrayContaining([expect.stringContaining('клавиша «огонь»')]),
    );
    await page.keyboard.press('Escape');

    await page.locator('#corner-settings').click();
    const settings = page.locator('#settings');
    await expect(settings).toBeVisible();
    await expect(settings.locator('[data-key="kb:fire"]')).toHaveCount(0);
    await expect(settings.locator('[data-key="pad:fire"]')).toHaveCount(0);
    await expect(settings.locator('[data-key="kb:jump"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

for (const toy of ['clock99', 'tank168', 'seabattle'])
  test(`${toy}: геймпад — ROTATE выбирает, Start запускает, FIRE не действует`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __pads: unknown[] };
      w.__pads = [];
      Object.defineProperty(navigator, 'getGamepads', { value: () => w.__pads, configurable: true });
    });
    const pad = async (pressed: number[]): Promise<void> => {
      await page.evaluate((pressed) => {
        (window as unknown as { __pads: unknown[] }).__pads = [
          {
            id: 'Body controls pad',
            index: 0,
            connected: true,
            mapping: 'standard',
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
          },
        ];
      }, pressed);
    };
    await page.goto(`./?toy=${toy}&power=on&debug&seed=7`);
    const area = page.locator('#game-area');
    await expect(area).toHaveAttribute('data-boot', 'off');
    const initial = await area.getAttribute('data-game');
    await pad([]);
    await page.waitForTimeout(100);
    await pad([2]);
    await page.waitForTimeout(100);
    await expect(area).toHaveAttribute('data-menu', 'menu');
    await expect(area).toHaveAttribute('data-game', initial!);
    await pad([]);
    await page.waitForTimeout(100);
    await pad([0]);
    await expect(area).not.toHaveAttribute('data-game', initial!);
    await expect(area).toHaveAttribute('data-menu', 'menu');
    await pad([]);
    await page.waitForTimeout(100);
    await pad([9]);
    await expect(area).toHaveAttribute('data-phase', 'playing');
    await pad([]);
  });
