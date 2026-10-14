import { expect, test, type Page } from '@playwright/test';

/**
 * Девять уровней MARIO («геймплейное приближение», docs/video-observations.md §9) в браузере: каждый открывается по `?level=N`,
 * у каждого та же «яма» со сценарием выхода, подпись HUD `1-0N`, мир шире экрана, герой бежит вправо с прокруткой.
 * Проходимость целиком проверяет юнит-тест `tests/core/mario-levels.test.ts` (решатель на настоящем движке).
 */

const area = (page: Page, key: string): Promise<string> =>
  page.evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key);
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

for (let n = 1; n <= 9; n++) {
  test(`уровень ${n}: открывается по ?level=${n}, яма и выход из неё, бег вправо с прокруткой, подпись 1-0${n}`, async ({ page }) => {
    await page.goto(`./?level=${n}&power=on`);
    await expect.poll(phase(page)).toBe('ready');
    expect(await area(page, 'level')).toBe(`mario-${n}`);
    expect(await area(page, 'hud')).toBe(`1-0${n}`);
    expect(await area(page, 'heroX')).toBe('1'); // старт в яме
    expect(await area(page, 'heroY')).toBe('5');
    await expect(page.locator('#original-levels .lv').nth(n - 1)).toHaveAttribute('aria-current', 'true');

    await page.keyboard.press('Enter'); // пропускает интро и запускает игру
    await expect.poll(phase(page)).toBe('playing');
    await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off'); // сценарий выхода из ямы одинаков у всех уровней
    expect(await area(page, 'heroX')).toBe('2');
    expect(await area(page, 'heroY')).toBe('2');

    // Бег вправо: герой сходит на пол, мир прокручивается, герой остаётся в середине экрана; до первой стенки врагов нет.
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => Number(await area(page, 'heroX')), { timeout: 5000 }).toBeGreaterThanOrEqual(8);
    await page.keyboard.up('ArrowRight');
    expect(Number(await area(page, 'cameraX'))).toBeGreaterThan(0);
    expect(await area(page, 'phase')).toBe('playing');
  });
}
