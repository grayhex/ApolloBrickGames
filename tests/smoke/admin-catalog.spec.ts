import { expect, test } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { validateConfig } from '../../src/config/schema';

test('admin: бренд и готовность каждой модели настраиваются, публикуются и видны в каталоге новой страницы; значения по умолчанию в конфигурацию не пишутся', async ({ page, context }) => {
  let config = validateConfig(defaults),
    revision = 0;
  await context.route('**/api/config', (route) => route.fulfill({ json: { config, revision } }));
  await context.route('**/api/admin/config', async (route) => {
    const data = route.request().postDataJSON() as { config: unknown; revision: number };
    config = validateConfig(data.config);
    revision++;
    await route.fulfill({ json: { revision, config } });
  });
  await page.goto('./admin');
  const section = page.locator('.admin__catalog');
  await expect(section.locator('.admin__catalog-row')).toHaveCount(14);
  const brand = (id: string) => page.locator(`.admin__catalog-row[data-toy=${id}]`).getByLabel(/: бренд$/);
  const ready = (id: string) => page.locator(`.admin__catalog-row[data-toy=${id}]`).getByLabel(/: готовность$/);
  const year = (id: string) => page.locator(`.admin__catalog-row[data-toy=${id}]`).getByLabel(/: год выпуска$/);
  const power = (id: string) => page.locator(`.admin__catalog-row[data-toy=${id}]`).getByLabel(/: питание$/);
  // Значения по умолчанию.
  await expect(brand('taksun')).toHaveValue('taksun');
  await expect(brand('alibaba')).toHaveValue('brickgame');
  await expect(brand('e23')).toHaveValue('brickgame');
  await expect(brand('apollo-b0302')).toHaveValue('apollo');
  await expect(ready('minibrick')).toHaveValue('reconstructing');
  await expect(ready('mario')).toHaveValue('playable');
  expect(await brand('mario').locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).textContent))).toEqual(['Apollo', 'TAKSUN', 'Brick Game']);
  expect(await ready('mario').locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value))).toEqual(['playable', 'reconstructing', 'shell']);
  // Изменения.
  await brand('taksun').selectOption('brickgame');
  await ready('minibrick').selectOption('playable');
  await brand('alibaba').selectOption('apollo');
  await brand('mario').selectOption('apollo'); // как по умолчанию — записи не будет
  await year('e88').fill('2009');
  await power('e88').fill('2×AA');
  await power('taksun').fill('3×AAA');
  await year('e23').fill('20x9'); // неверный год не принимается: поле возвращается к прежнему значению
  await year('e23').blur(); // значение вносится при уходе из поля или по Enter
  await expect(page.locator('.admin__status')).toContainText('четыре цифры');
  await expect(year('e23')).toHaveValue('');
  await page.getByPlaceholder('ADMIN_TOKEN').fill('browser-test-key');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.admin__status')).toContainText('Опубликовано для всех игроков');
  expect(config.catalog).toEqual({ taksun: { brand: 'brickgame', power: '3×AAA' }, minibrick: { readiness: 'playable' }, alibaba: { brand: 'apollo' }, e88: { year: '2009', power: '2×AA' } });
  // Новая страница видит настройки.
  const game = await context.newPage();
  await game.goto('./?toy=clock99');
  await game.locator('.devpick__trigger').click();
  await expect(game.locator('.devpick__card[data-toy=taksun] .devpick__maker')).toHaveText('Brick Game');
  await expect(game.locator('.devpick__card[data-toy=alibaba] .devpick__maker')).toHaveText('Apollo');
  await expect(game.locator('.devpick__card[data-toy=minibrick]')).toHaveAttribute('data-ready', 'playable');
  // Год и питание из админки видны в карточке устройства слева.
  await game.goto('./?toy=e88&view=full');
  await expect(game.locator('#side-info .dcard__fact').nth(0)).toContainText('2009');
  await expect(game.locator('#side-info .dcard__fact').nth(1)).toContainText('2×AA');
  await game.close();
  // Возврат к значениям по умолчанию снимает записи.
  await brand('taksun').selectOption('taksun');
  await ready('minibrick').selectOption('reconstructing');
  await brand('alibaba').selectOption('brickgame');
  await year('e88').fill('');
  await power('e88').fill('');
  await power('taksun').fill('');
  await page.getByPlaceholder('ADMIN_TOKEN').fill('browser-test-key');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.admin__status')).toContainText('ревизия 2');
  expect(config.catalog).toBeUndefined();
});
