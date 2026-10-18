import {test,expect} from '@playwright/test';
import {validateConfig} from '../../src/config/schema';
import defaults from '../../src/config/default.json' with {type:'json'};

for(const toy of ['e88','apollo-b0202'] as const){
  test(`${toy}: native LCD, real controls, profiles and clean lifecycle`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const external:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://localhost:')&&!r.url().startsWith('data:'))external.push(r.url());});
    await page.goto(`./?toy=${toy}&power=on&debug`);
    const area=page.locator('#game-area');await expect(area).toHaveAttribute('data-boot','off');
    await expect(page.locator('.native__lcd')).toHaveCount(1);
    // The original cherry segment is not a sound indicator. Ghosts never become lit on mute.
    const cherries=page.locator('.native__lcd [id="181_2"]');
    if(toy==='e88'){
      await expect(cherries).not.toHaveCSS('opacity','1');
      await page.locator('#base [data-key=sound]').click();
      await expect(cherries).not.toHaveCSS('opacity','1');
    }
    await expect(page.locator('#view-closed')).toHaveCount(0);await expect(page.locator('.toy__hinge')).toBeHidden();
    await expect(page.locator('#base [data-key=up]')).toHaveCount(0);
    await expect(page.locator('.native__key')).toHaveCount(toy==='e88'?7:8);
    if(toy==='e88')await expect(page.locator('#side-ctl [data-action=reset]')).toHaveCount(0);
    const entry=toy==='e88'?'e88.2':'apollo-b0202.H02';
    await page.locator('#guide-game').selectOption(entry);await expect(area).toHaveAttribute('data-entry',entry);
    await page.locator('.gnav__btn--launch').click();await expect(area).toHaveAttribute('data-phase','playing');
    await expect(page.locator('#guide-game')).toHaveValue(entry);
    await page.locator('#base [data-key=sp]').click();await expect(area).toHaveAttribute('data-phase','paused');
    const tick=await area.getAttribute('data-tick');await page.waitForTimeout(120);expect(await area.getAttribute('data-tick')).toBe(tick);
    await page.locator('#view-screen').click();await expect(page.locator('#toy')).toHaveAttribute('data-view','screen');
    await expect(page.locator('#lower')).toBeHidden();
    const lcd=await page.locator('.native__lcd').boundingBox(),window=await page.locator('.lid__window').boundingBox();
    expect(lcd!.width).toBeCloseTo(window!.width,0);expect(lcd!.height).toBeCloseTo(window!.height,0);
    await page.locator('.toysw__item[data-toy=clock99]').click();await expect(page.locator('#toy')).toHaveAttribute('data-model','clock99');
    await expect(page.locator('.native__lcd')).toHaveCount(0);await expect(page.locator('#screen')).toBeVisible();
    expect(errors).toEqual([]);expect(external).toEqual([]);
  });
  for(const width of [360,1440])test(`${toy}: both views at ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:1000});await page.goto(`./?toy=${toy}&power=on`);
    await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
    const box=await page.locator('#toy').boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
    for(const button of await page.locator('.native__key').all()){
      const bounds=await button.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(box!.x-1);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(box!.x+box!.width+1);
      expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(box!.y+box!.height+1);
    }
    await page.screenshot({path:testInfo.outputPath(`${toy}-${width}-menu.png`),fullPage:true});
    await page.locator('.gnav__btn--launch').click();await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
    await page.screenshot({path:testInfo.outputPath(`${toy}-${width}-play.png`),fullPage:true});
    await page.locator('#view-screen').click();await page.screenshot({path:testInfo.outputPath(`${toy}-${width}-screen.png`),fullPage:true});
    const bounds=await page.locator('.native__lcd').boundingBox(),carousel=await page.locator('.toysw').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(carousel!.y+carousel!.height-1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
test('native admin preserves repeated engine IDs and start entry through JSON export',async({page})=>{
  const config=validateConfig(defaults);
  await page.route('**/api/config',route=>route.fulfill({json:{config,revision:8}}));await page.goto('./admin');
  await page.getByRole('button',{name:'Brick Game E-88 · 8 in 1',exact:true}).click();
  await expect(page.locator('.admin__content')).toContainText('Оригинальный набор');
  await page.getByLabel('Выбрана при включении').selectOption('e88.4');
  await page.locator('[data-entry="e88.4"]').getByRole('button',{name:'↑',exact:true}).click();
  await expect(page.locator('.admin__content')).toContainText('Изменённый набор');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать JSON'}).click();
  const file=await download;expect(file.suggestedFilename()).toBe('default.json');
  const stream=await file.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
  const exported=validateConfig(JSON.parse(Buffer.concat(chunks).toString()));
  expect(exported.toys.e88.defaultEntry).toBe('e88.4');expect(exported.toys.e88.games[2]!.entryId).toBe('e88.4');
});
