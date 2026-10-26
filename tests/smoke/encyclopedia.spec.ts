import { test, expect } from '@playwright/test';
import raw from '../../src/config/default.json' with {type:'json'};
import { validateConfig } from '../../src/config/schema';
import { ENTRIES } from '../../src/encyclopedia/catalog';
import { GAMES } from '../../src/games/catalog';

for(const width of [1200,1366,1440])test(`corner controls fit ${width}px with all controller indicators`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('./?toy=brickgame');
  await page.locator('body:not([data-booting])').waitFor();
  await page.locator('[data-device=gamepad]').evaluate(node=>node.removeAttribute('hidden'));
  const boxes=await page.locator('#devices,#corner-settings,#corner-theme,#corner-lang,#corner-help').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
  const dock=(await page.locator('#topleft').boundingBox())!;
  for(let i=0;i<boxes.length;i++){
    expect(boxes[i]!.left).toBeGreaterThanOrEqual(dock.x);
    expect(boxes[i]!.right).toBeLessThanOrEqual(dock.x+dock.width);
    if(i)expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i-1]!.right);
  }
});

test('deep-linked encyclopedia covers the complete catalog, links its evidence and omits control setup and old status phrases',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./encyclopedia?game=tetris');
  await expect(page.locator('.enc-list .enc-item')).toHaveCount(ENTRIES.length);
  await expect(page.locator('.enc-accuracy strong')).toHaveText('100%');
  for(const entry of ENTRIES){
    await page.locator(`.enc-item[data-game="${entry.id}"]`).click();
    await expect(page.locator('.enc-article h2')).toHaveText(GAMES[entry.id].names.ru);
    await expect(page.locator('#sources .enc-sources a')).toHaveCount(entry.sources.length);
    await expect(page.locator('#rules')).not.toBeEmpty();
  }
  await expect(page.locator('.help__table,.gctl,#settings')).toHaveCount(0);
  await expect(page.locator('.enc-article')).not.toContainText('есть (приближённо)');
  expect(errors).toEqual([]);
});

test('search, categories, language, theme and browser history work without losing the selected article',async({page})=>{
  await page.goto('./encyclopedia?game=tetris');
  await page.locator('#enc-search').fill('snake');
  await expect(page.locator('.enc-item')).toHaveCount(1);
  await page.locator('.enc-item').click();
  await expect(page).toHaveURL(/game=snake/);
  await expect(page.locator('.enc-accuracy strong')).toHaveText('90%');
  await page.locator('#enc-lang').click();
  await expect(page.locator('h1')).toHaveText('Game encyclopedia');
  await expect(page.locator('.enc-article h2')).toHaveText('Snake');
  await page.locator('#enc-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Game encyclopedia');
  await expect(page.locator('.enc-article h2')).toHaveText('Snake');
  await page.goBack();
  await expect(page.locator('.enc-article h2')).toHaveText('Tetris');
  await page.goForward();
  await expect(page.locator('.enc-article h2')).toHaveText('Snake');
  await page.locator('#enc-search').fill('not-a-game');
  await expect(page.locator('.enc-empty')).toBeVisible();
  await page.locator('#enc-search').fill('');
  await page.locator('.enc-filters button').filter({hasText:'Puzzles'}).click();
  await expect(page.locator('.enc-item[data-game=sokoban]')).toBeVisible();
  await expect(page.locator('.enc-item[data-game=tank]')).toHaveCount(0);
});

test('Back restores the default article when the initial URL has no game parameter',async({page})=>{
  await page.goto('./encyclopedia');
  await expect(page.locator('.enc-article h2')).toHaveText('Тетрис');
  await page.locator('.enc-item[data-game=snake]').click();
  await expect(page.locator('.enc-article h2')).toHaveText('Змейка');
  await page.goBack();
  expect(new URL(page.url()).search).toBe('');
  await expect(page.locator('.enc-article h2')).toHaveText('Тетрис');
  await page.goForward();
  await expect(page.locator('.enc-article h2')).toHaveText('Змейка');
});

test('large real-gameplay recording supports pause and respects reduced motion',async({browser})=>{
  const context=await browser.newContext({reducedMotion:'no-preference',viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  await page.goto('./encyclopedia?game=tetris');
  const canvas=page.locator('.enc-demo canvas');await canvas.scrollIntoViewIfNeeded();
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(180);
  const first=await canvas.getAttribute('data-frame');
  await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(first);
  await page.locator('.enc-play').click();
  const paused=await canvas.getAttribute('data-frame');await page.waitForTimeout(250);
  expect(await canvas.getAttribute('data-frame')).toBe(paused);
  await page.locator('.enc-play').click();
  await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(paused);
  const beforeRestore=await canvas.getAttribute('data-frame');
  await page.evaluate(()=>{
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(beforeRestore);
  await context.close();
});

test('reduced motion starts stopped and original images degrade gracefully',async({page})=>{
  const config=validateConfig(raw);config.encyclopedia={tetris:{imageUrl:'https://images.example/broken.png'}};
  await page.route('**/api/config',route=>route.fulfill({json:{config,revision:2}}));
  await page.route('https://images.example/broken.png',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('./encyclopedia?game=tetris');
  await expect(page.locator('.enc-play')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.enc-image-error')).toBeVisible();
  await expect(page.locator('#rules')).not.toBeEmpty();
});

for(const width of [320,390,900,1440]) test(`encyclopedia fits ${width}px in both themes`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('./encyclopedia?game=tetris-pentix');
  for(const theme of ['dark','light']){
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('.enc-demo').scrollIntoViewIfNeeded();
    expect((await page.locator('.enc-demo canvas').boundingBox())!.width).toBeGreaterThan(180);
    if(theme==='dark')await page.locator('#enc-theme').click();
  }
});

test('admin saves image URLs in the common configuration, rejects executable URLs and keeps draft until publication',async({page})=>{
  let config=validateConfig(raw), revision=0;
  await page.route('**/api/config',r=>r.fulfill({json:{config,revision}}));
  await page.route('**/api/admin/config',async route=>{const payload=route.request().postDataJSON();config=validateConfig(payload.config);revision++;await route.fulfill({json:{config,revision}});});
  await page.goto('./admin');
  const card=page.locator('#admin-encyclopedia');
  await card.getByLabel('Игра для оригинальной иллюстрации').selectOption('snake');
  const input=card.getByLabel('Ссылка на оригинальную иллюстрацию');
  await input.fill('javascript:alert(1)');await card.getByRole('button',{name:'Сохранить ссылку в черновик'}).click();
  await expect(card.locator('[role=status]')).toContainText('HTTPS');
  await input.fill('https://images.example/snake.png');await card.getByRole('button',{name:'Сохранить ссылку в черновик'}).click();
  expect(config.encyclopedia).toBeUndefined();
  await page.getByPlaceholder('ADMIN_TOKEN').fill('test-only-admin-token-with-32-characters');
  await page.getByRole('button',{name:'Опубликовать',exact:true}).click();
  expect(config.encyclopedia?.snake?.imageUrl).toBe('https://images.example/snake.png');
  await page.reload();await card.getByLabel('Игра для оригинальной иллюстрации').selectOption('snake');
  await expect(input).toHaveValue('https://images.example/snake.png');
});


test('catalog stays ordered by rarity, then by descending accuracy, after filtering and changing language',async({page})=>{
  await page.goto('./encyclopedia');
  const order=['common','uncommon','rare','ultra-rare','mobile'];
  const rows=()=>page.locator('.enc-item').evaluateAll(nodes=>nodes.map(node=>({rarity:node.querySelector<HTMLElement>('.game-rarity')?.dataset['rarity']??'',score:Number(node.querySelector('.enc-item__accuracy')?.textContent?.replace('%',''))||0})));
  const sorted=async()=>{
    const values=await rows();expect(values.length).toBeGreaterThan(0);
    const rank=(rarity:string)=>rarity===''?order.length:order.indexOf(rarity);
    const expected=[...values].sort((a,b)=>rank(a.rarity)-rank(b.rarity)||b.score-a.score);
    expect(values).toEqual(expected);
  };
  await expect(page.locator('.enc-item')).toHaveCount(57);await sorted();
  await page.locator('.enc-filters button').nth(2).click();await sorted();
  await page.locator('#enc-lang').click();await sorted();
});

test('provenance is mode-specific and independent of evidence percentage and readiness',async({page})=>{
  await page.goto('./encyclopedia?game=honeybee');
  await expect(page.locator('#modes .game-origin')).toHaveCount(8);
  await expect(page.locator('#modes .game-origin').first()).toHaveAttribute('data-origin','rom');
  await expect(page.locator('#modes [data-origin=ai]')).toHaveCount(7);
  await expect(page.locator('.enc-accuracy strong')).toHaveText('90%');
  await page.goto('./encyclopedia?game=maze');
  await expect(page.locator('.enc-article__head .game-origin')).toHaveAttribute('data-origin','ai');
  await expect(page.locator('.enc-article__head .gpanel__stage')).toHaveAttribute('data-stage','beta');
  await expect(page.locator('.enc-accuracy strong')).toHaveText('30%');
  await expect(page.locator('#rules')).toContainText('15 секунд');
  await page.locator('#enc-lang').click();await page.locator('#enc-theme').click();
  await expect(page.locator('#rules')).toContainText('15 seconds');
  await expect(page.locator('.enc-article__head .gpanel__stage')).toHaveAttribute('title',/complete game loop/);
});
