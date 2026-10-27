import { expect, test } from '@playwright/test';

for (const toy of ['clock99', 'tank168', 'seabattle'])
  test(`${toy}: только кнопки корпуса в меню, справке и настройках`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`./?toy=${toy}&power=on&debug&seed=7`);
    const area = page.locator('#game-area');
    await expect(area).toHaveAttribute('data-boot', 'off');
    await expect(area).toHaveAttribute('data-menu', 'menu');
    if (toy === 'seabattle') {
      // Заставка «Морского боя» уходит по первой кнопке; игра в меню остаётся прежней.
      await expect(area).toHaveAttribute('data-stage', 'intro');
      await page.keyboard.press('Space');
      await expect(area).toHaveAttribute('data-stage', 'menu');
    }
    await expect(page.locator('#keymap')).toHaveCount(0); // схемы клавиш в левой панели нет
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

    await expect(page.locator('#help')).toHaveCount(0);

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
    if (toy === 'seabattle') {
      await pad([]);
      await page.waitForTimeout(100);
      await pad([2]); // первое нажатие только будит геймпад (как в остальном тесте), FIRE корпусу не нужна
      await page.waitForTimeout(100);
      await pad([]);
      await page.waitForTimeout(100);
      await pad([0]); // A: заставка уходит в меню, игра прежняя
      await expect(area).toHaveAttribute('data-stage', 'menu');
      await pad([]);
      await page.waitForTimeout(100);
    }
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
