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
  await expect(section.locator('.admin__catalog-row')).toHaveCount(10);
  const brand = (id: string) => page.locator(`.admin__catalog-row[data-toy=${id}]`).getByLabel(/: бренд$/);
  const ready = (id: string) => page.locator(`.admin__catalog-row[data-toy=${id}]`).getByLabel(/: готовность$/);
  // Значения по умолчанию.
  await expect(brand('taksun')).toHaveValue('taksun');
  await expect(brand('alibaba')).toHaveValue('brickgame');
  await expect(ready('minibrick')).toHaveValue('reconstructing');
  await expect(ready('mario')).toHaveValue('playable');
  expect(await brand('mario').locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).textContent))).toEqual(['Apollo', 'TAKSUN', 'Brick Game']);
  expect(await ready('mario').locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value))).toEqual(['playable', 'reconstructing', 'shell']);
  // Изменения.
  await brand('taksun').selectOption('brickgame');
  await ready('minibrick').selectOption('playable');
  await brand('alibaba').selectOption('apollo');
  await brand('mario').selectOption('apollo'); // как по умолчанию — записи не будет
  await page.getByPlaceholder('ADMIN_TOKEN').fill('browser-test-key');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.admin__status')).toContainText('Опубликовано для всех игроков');
  expect(config.catalog).toEqual({ taksun: { brand: 'brickgame' }, minibrick: { readiness: 'playable' }, alibaba: { brand: 'apollo' } });
  // Новая страница видит настройки.
  const game = await context.newPage();
  await game.goto('./?toy=clock99');
  await game.locator('.devpick__trigger').click();
  await expect(game.locator('.devpick__card[data-toy=taksun] .devpick__maker')).toHaveText('Brick Game');
  await expect(game.locator('.devpick__card[data-toy=alibaba] .devpick__maker')).toHaveText('Apollo');
  await expect(game.locator('.devpick__card[data-toy=minibrick]')).toHaveAttribute('data-ready', 'playable');
  await game.close();
  // Возврат к значениям по умолчанию снимает записи.
  await brand('taksun').selectOption('taksun');
  await ready('minibrick').selectOption('reconstructing');
  await brand('alibaba').selectOption('brickgame');
  await page.getByPlaceholder('ADMIN_TOKEN').fill('browser-test-key');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.admin__status')).toContainText('ревизия 2');
  expect(config.catalog).toBeUndefined();
});
