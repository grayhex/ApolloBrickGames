import { test, expect } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { validateConfig } from '../../src/config/schema';
import { LIBRARY_IDS } from '../../src/games/library';
import { BRICK_GAMES } from '../../src/brick/games';
import { TOYS } from '../../src/app/toys';
import { canAssign } from '../../src/app/bodyButtons';

test('admin: edits, validates, publishes and loads a shared menu in a fresh page', async ({ page, context }) => {
  let config = validateConfig(defaults), revision = 0;
  await context.route('**/api/config',route => route.fulfill({json:{config,revision}}));
  await context.route('**/api/admin/config',async route => {
    const data = route.request().postDataJSON() as {config:unknown;revision:number};
    expect(route.request().headers()['authorization']).toBe('Bearer browser-test-key');
    expect(data.revision).toBe(revision); config = validateConfig(data.config); revision++; await route.fulfill({json:{revision,config}});
  });
  await page.goto('./admin'); await expect(page.getByRole('heading',{name:'Ваша коллекция. Ваши игры.'})).toBeVisible();
  await expect(page.getByText('TETRIS (99) — ожидает реализации')).toBeVisible();
  await page.getByRole('button',{name:'Часы+99',exact:true}).click();
  await page.getByLabel('Добавить игру',{exact:true}).selectOption('snake'); await page.getByRole('button',{name:'Добавить в меню',exact:true}).click();
  await page.getByLabel('Выбрана при включении',{exact:true}).selectOption('snake'); await page.getByLabel('Основной цвет',{exact:true}).selectOption('white');
  await page.getByPlaceholder('ADMIN_TOKEN').fill('browser-test-key'); await page.getByRole('button',{name:'Опубликовать',exact:true}).click();
  await expect(page.locator('.admin__status')).toContainText('Опубликовано для всех игроков');
  expect(config.toys.clock99.games.at(-1)?.id).toBe('snake');
  const game = await context.newPage(); await game.goto('./?toy=clock99&power=on&debug');
  await expect(game.locator('#toy')).toHaveAttribute('data-shell','white');
  await expect.poll(() => game.evaluate(() => (window as unknown as {__brick:{gameId:string}}).__brick?.gameId)).toBe('snake');
  await expect(game.locator('#game-area')).toHaveAttribute('data-boot','off');
  await game.keyboard.press('Enter'); await expect(game.locator('#game-area')).toHaveAttribute('data-phase','playing');
  await expect(game.locator('a[href$="/admin"]')).toHaveCount(0);
  await game.close();
  await page.setViewportSize({width:390,height:844}); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/** Игре нужна кнопка, которой нет на корпусе (Jigsaw: отдельный «огонь»), — её нельзя назначить игрушке: админка её не предлагает, схема отклоняет. */
const ASSIGNABLE = LIBRARY_IDS.filter((id) => canAssign(BRICK_GAMES[id]!, TOYS.clock99));
const BLOCKED = LIBRARY_IDS.filter((id) => !ASSIGNABLE.includes(id));

test('admin: игры, которым нужна отсутствующая на корпусе кнопка, не предлагаются и не принимаются', async ({ page }) => {
  expect(BLOCKED).toEqual(['jigsaw']);
  const config = validateConfig(defaults);
  await page.route('**/api/config', (route) => route.fulfill({ json: { config, revision: 1 } }));
  await page.goto('./admin');
  await page.getByRole('button', { name: 'Часы+99', exact: true }).click();
  const options = await page.getByLabel('Добавить игру', { exact: true }).locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  expect(options).toContain('snake');
  for (const id of BLOCKED) expect(options, id).not.toContain(id);
  const bad = validateConfig(defaults);
  bad.toys.clock99.games = [{ id: 'jigsaw' }];
  bad.toys.clock99.defaultGame = 'jigsaw';
  expect(() => validateConfig(bad)).toThrow(/нужна кнопка/);
});

for (const id of ASSIGNABLE) test(`library: ${id} starts from a published menu, pauses and resets`,async ({page}) => {
  const config = validateConfig(defaults); config.toys.clock99.games = [{id}]; config.toys.clock99.defaultGame = id;
  await page.route('**/api/config',route => route.fulfill({json:{revision:1,config}}));
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./?toy=clock99&power=on&debug&seed=7');
  await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
  await page.keyboard.press('Enter'); await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
  const game = await page.evaluate(() => { const g = (window as unknown as {__brick:{game:{id:string;cells():Uint8Array}}}).__brick.game; return {id:g.id,cells:Array.from(g.cells())}; });
  expect(game.id).toBe(id); expect(game.cells).toHaveLength(200); expect(game.cells.every((v)=>v>=0&&v<=2)).toBe(true);
  await page.keyboard.press('ArrowLeft'); await page.locator('[data-key="sp"]').click(); await expect(page.locator('#game-area')).toHaveAttribute('data-phase','paused');
  await page.locator('[data-key="fire"]').click(); await expect(page.locator('#game-area')).toHaveAttribute('data-menu','menu');
  expect(errors).toEqual([]);
});
