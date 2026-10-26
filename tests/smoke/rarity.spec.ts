import { test, expect } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { universalGames, validateConfig } from '../../src/config/schema';
import { ENTRIES } from '../../src/encyclopedia/catalog';
import { GAMES } from '../../src/games/catalog';
import { RARITY_LABEL, RARITY_ORDER, rarityOf } from '../../src/games/rarity';

test.use({ viewport: { width: 1440, height: 900 } });

test('энциклопедия: игры идут по возрастанию редкости, у каждой ступени свой значок', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./encyclopedia?game=tetris');
  await expect(page.locator('.enc-list .enc-item')).toHaveCount(ENTRIES.length);
  const items = await page.locator('.enc-list .enc-item').evaluateAll((nodes) =>
    nodes.map((node) => ({ id: (node as HTMLElement).dataset['game']!, rarity: node.querySelector<HTMLElement>('.game-rarity')?.dataset['rarity'] ?? null })),
  );
  expect(items.map((item) => item.id)).toEqual(ENTRIES.map((entry) => entry.id));
  const rank = (rarity: string | null): number => (rarity === null ? RARITY_ORDER.length : RARITY_ORDER.indexOf(rarity as never));
  const ranks = items.map((item) => rank(item.rarity));
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  for (const item of items) expect(item.rarity).toBe(rarityOf(item.id as never));
  expect(items[0]).toEqual({ id: 'tetris', rarity: 'common' });
  // Значок редкости виден в заголовке статьи, а у вариаций игры (список режимов) своей редкости нет.
  await page.locator('.enc-item[data-game="dance"]').click();
  await expect(page.locator('.enc-article__head .game-rarity')).toHaveText('Редкая');
  await expect(page.locator('.enc-article__head .game-rarity')).toHaveAttribute('title', /Retro Consoles Wiki/);
  await expect(page.locator('.enc-modes .game-rarity')).toHaveCount(0);
  await page.locator('.enc-item[data-game="mario"]').click();
  await expect(page.locator('.enc-article__head .game-rarity')).toHaveCount(0);
  await page.locator('#enc-lang').click();
  await page.locator('.enc-item[data-game="2048"]').click();
  await expect(page.locator('.enc-article__head .game-rarity')).toHaveText('Mobile');
  expect(errors).toEqual([]);
});

test('универсальная консоль: слева игры сгруппированы по редкости, у открытой игры виден значок', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const config = validateConfig(defaults);
  config.toys.brickgame.games = [{ id: 'sea-battle' }, { id: 'tetris' }, { id: 'dance' }, { id: 'simon' }, { id: '2048' }, { id: 'snake' }];
  config.toys.brickgame.defaultGame = 'tetris';
  const expected = universalGames(config).map((g) => g.id);
  await page.route('**/api/config', (route) => route.fulfill({ json: { config, revision: 1 } }));
  await page.goto('./?toy=brickgame&view=full');
  await expect(page.locator('#guide-game')).toBeVisible();
  const groups = await page.locator('#guide-game optgroup').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptGroupElement).label));
  expect(groups).toEqual(RARITY_ORDER.map((rarity) => RARITY_LABEL[rarity].ru));
  const options = await page.locator('#guide-game option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  expect(options).toEqual(expected);
  // Номер игры в списке совпадает с номером в меню консоли.
  const labels = await page.locator('#guide-game option').allTextContents();
  labels.forEach((label, index) => expect(label.startsWith(`${index + 1}: `)).toBe(true));
  await page.locator('#guide-game').selectOption('dance');
  await expect(page.locator('#gpanel .gpanel__head .game-rarity')).toHaveText('Редкая');
  await page.locator('#guide-game').selectOption(GAMES['sea-battle'].id);
  await expect(page.locator('#gpanel .gpanel__head .game-rarity')).toHaveText('Сверхредкая');
  expect(errors).toEqual([]);
});

test('значка редкости нет у приставки со своим набором игр', async ({ page }) => {
  await page.goto('./?toy=tank168&view=full');
  await expect(page.locator('#gpanel .gpanel__head')).toBeVisible();
  await expect(page.locator('#gpanel .game-rarity')).toHaveCount(0);
});
