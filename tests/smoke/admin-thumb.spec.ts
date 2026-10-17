import { test, expect } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { validateConfig } from '../../src/config/schema';

test('admin: цвет миниатюры в карусели выбирается из палитры игрушки, публикуется и виден в новой странице', async ({ page, context }) => {
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
  const thumb = page.getByLabel('Цвет миниатюры в карусели', { exact: true });
  await expect(thumb).toHaveValue('white');
  expect(await thumb.locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value))).toEqual(['blue', 'red', 'yellow', 'white']);
  await thumb.selectOption('red');
  await page.getByRole('button', { name: 'Brick Game', exact: true }).click();
  const universal = page.getByLabel('Цвет миниатюры в карусели', { exact: true });
  expect(await universal.locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value))).toEqual(['white', 'gray', 'black']);
  await universal.selectOption('black');
  await page.getByPlaceholder('ADMIN_TOKEN').fill('browser-test-key');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.admin__status')).toContainText('Опубликовано для всех игроков');
  expect([config.toys.mario.thumbShell, config.toys.brickgame.thumbShell]).toEqual(['red', 'black']);
  const game = await context.newPage();
  await game.goto('./?toy=clock99');
  await expect(game.locator('.toysw__item[data-toy=mario]')).toHaveAttribute('data-shell', 'red');
  await expect(game.locator('.toysw__universal')).toHaveAttribute('data-shell', 'black');
  await expect(game.locator('.toysw__item[data-toy=clock99]')).toHaveAttribute('data-shell', 'white');
  await game.close();
});
