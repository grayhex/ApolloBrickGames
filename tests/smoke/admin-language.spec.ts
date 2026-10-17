import { test, expect } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { validateConfig } from '../../src/config/schema';

test('admin: язык по умолчанию выбирается, публикуется и применяется тем, кто сам язык не выбирал', async ({ page, context }) => {
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
  const language = page.getByLabel('Язык по умолчанию', { exact: true });
  await expect(language).toHaveValue('ru');
  await language.selectOption('en');
  await page.getByPlaceholder('ADMIN_TOKEN').fill('browser-test-key');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.admin__status')).toContainText('Опубликовано для всех игроков');
  expect(config.language).toBe('en');
  // Новый посетитель видит английский интерфейс.
  const visitor = await context.newPage();
  await visitor.goto('./?toy=brickgame');
  await expect(visitor.locator('html')).toHaveAttribute('lang', 'en');
  await expect(visitor.locator('#leaderboard-title')).toHaveText('High scores');
  await visitor.close();
  // Тот, кто сам выбрал русский (кнопка RU / EN), его и сохраняет.
  const chooser = await context.newPage();
  await chooser.addInitScript(() => localStorage.setItem('crocodile-mario:settings:v1', JSON.stringify({ version: 1, display: { lang: 'ru', langSet: true } })));
  await chooser.goto('./?toy=brickgame');
  await expect(chooser.locator('html')).toHaveAttribute('lang', 'ru');
  await chooser.close();
});
