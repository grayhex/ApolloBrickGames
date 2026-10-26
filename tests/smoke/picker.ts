import { expect, type Locator, type Page } from '@playwright/test';

/** Каталог устройств (`.devpick`): панель над консолью и выпадающая сетка карточек. Хелперы для smoke-тестов вместо прежней карусели. */
export const pickerTrigger = (page: Page): Locator => page.locator('.devpick__trigger');
export const pickerPanel = (page: Page): Locator => page.locator('.devpick__panel');
export const pickerCard = (page: Page, id: string): Locator => page.locator(`.devpick__card[data-toy="${id}"]`);

export async function openPicker(page: Page): Promise<void> {
  if ((await pickerTrigger(page).getAttribute('aria-expanded')) !== 'true') await pickerTrigger(page).click();
  await expect(pickerPanel(page)).toBeVisible();
}

export async function closePicker(page: Page): Promise<void> {
  if ((await pickerTrigger(page).getAttribute('aria-expanded')) === 'true') await pickerTrigger(page).click();
  await expect(pickerPanel(page)).toBeHidden();
}

/** Выбрать устройство мышью: открыть каталог, нажать карточку (он закрывается сам). */
export async function chooseToy(page: Page, id: string): Promise<void> {
  await openPicker(page);
  await pickerCard(page, id).click();
  await expect(pickerPanel(page)).toBeHidden();
}
