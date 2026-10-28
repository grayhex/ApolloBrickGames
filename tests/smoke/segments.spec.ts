import { expect, test } from '@playwright/test';

/** «Сегменты экрана» — переключатель призрака погашенных сегментов в пульте: есть у каждой игрушки с живым ЖК; у экспонатов-картинок (TAKSUN, Alibaba) экрана нет, переключатель скрыт. */
const WITH_SWITCH = ['mario', 'clock99', 'seabattle', 'tank168', 'brickgame', 'e88', 'apollo-b0202', 'e23', 'apollo-b0302', 'minibrick', 'fm38', 'prince118'];
const WITHOUT_SWITCH = ['taksun', 'alibaba'];

for (const toy of WITH_SWITCH) {
  test(`${toy}: переключатель «Сегменты экрана» виден в пульте`, async ({ page }) => {
    await page.goto(`./?toy=${toy}&power=on`);
    await expect(page.locator('#segments-options')).toBeVisible();
    await expect(page.locator('#segments-options input')).toHaveCount(2);
  });
}

for (const toy of WITHOUT_SWITCH) {
  test(`${toy}: у экспоната без живого экрана переключателя нет`, async ({ page }) => {
    await page.goto(`./?toy=${toy}&power=on`);
    await expect(page.locator('#toy')).toHaveAttribute('data-model', /.+/);
    await expect(page.locator('#segments-options')).toBeHidden();
  });
}

test('minibrick: «Выкл» прячет призрак погашенных сегментов, рамка стакана остаётся, «Вкл» возвращает', async ({ page }) => {
  await page.goto('./?toy=minibrick&power=on');
  const lcd = page.locator('.minibrick-lcd').first();
  const unlit = lcd.locator('.lcd-seg:not([data-on])').first();
  await expect.poll(() => unlit.evaluate((node) => +getComputedStyle(node).opacity)).toBeGreaterThan(0);
  await page.locator('#segments-options label:has(input[value=off])').click();
  await expect(lcd).toHaveAttribute('data-ghost', 'off');
  await expect.poll(() => unlit.evaluate((node) => +getComputedStyle(node).opacity)).toBe(0);
  expect(await lcd.locator('.lcd-frame').evaluate((node) => +getComputedStyle(node).opacity)).toBeGreaterThan(0.5);
  await page.locator('#segments-options label:has(input[value=on])').click();
  await expect(lcd).not.toHaveAttribute('data-ghost', 'off');
  await expect.poll(() => unlit.evaluate((node) => +getComputedStyle(node).opacity)).toBeGreaterThan(0);
});
