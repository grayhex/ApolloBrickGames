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
    await page.locator('#guide-game').selectOption(toy==='e88'?entry:'apollo-b0202.H01');
    if(toy==='apollo-b0202')await page.locator('#base [data-key=down]').click();
    await expect(area).toHaveAttribute('data-entry',entry);
    await page.locator('.gnav__btn--launch').click();await expect(area).toHaveAttribute('data-phase','playing');
    await expect(page.locator('#guide-game')).toHaveValue(toy==='e88'?entry:'apollo-b0202.H01');
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
    // Resizing must reveal the whole selected card, including a long native model name.
    if(width===1440){
      await page.setViewportSize({width:320,height:1000});
      await expect.poll(async()=>{
        const card=await page.locator(`#real-models [data-toy="${toy}"]`).boundingBox();
        const shelf=await page.locator('#real-models').boundingBox();
        return !!card&&!!shelf&&card.x>=shelf.x-1&&card.x+card.width<=shelf.x+shelf.width+1;
      }).toBe(true);
    }
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

test('B0202 lists games once and hides unfinished modes; H02 stays on the physical menu',async({page})=>{
 await page.goto('./?toy=apollo-b0202&power=on');await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
 await expect(page.locator('#guide-game option')).toHaveText(['A: Лягушка','D: Жуки','E: Кости','H: Тетрис']);
 await expect(page.locator('#side-info')).not.toContainText('исследуется');
 await page.locator('#guide-game').selectOption('apollo-b0202.H01');
 await page.locator('#base [data-key=down]').click();await expect(page.locator('#game-area')).toHaveAttribute('data-entry','apollo-b0202.H02');
 await expect(page.locator('#guide-game')).toHaveValue('apollo-b0202.H01');
 await page.locator('#base [data-key=down]').click();await expect(page.locator('#game-area')).toHaveAttribute('data-entry','apollo-b0202.H01');
});
for(const entry of ['6','7','8'])test(`E88 ${entry}: labelled library adaptation starts and accepts ROTATE`,async({page})=>{
 await page.goto('./?toy=e88&power=on');await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
 await page.locator('#guide-game').selectOption('e88.'+entry);
 await expect(page.locator('#gpanel')).toContainText('Приближённый вариант');
 await page.locator('.gnav__btn--launch').click();await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
 await page.locator('#base [data-key=jump]').click();
});
test('carousel shows Apollo brands and mouse wheel/drag scroll without selecting a toy',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('./?toy=mario');
 await expect(page.locator('#real-models .toysw__maker')).toHaveText(['Apollo','Apollo','Apollo','Apollo']);
 const shelf=page.locator('#real-models');await shelf.hover();
 const start=await shelf.evaluate(e=>e.scrollLeft);await page.mouse.wheel(0,160);
 await expect.poll(()=>shelf.evaluate(e=>e.scrollLeft)).toBeGreaterThan(start+30);
 await expect(page.locator('.toysw__item[aria-current=page]')).toHaveAttribute('data-toy','mario');
 const box=(await shelf.boundingBox())!,before=await shelf.evaluate(e=>e.scrollLeft);
 await page.mouse.move(box.x+box.width*.7,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width*.2,box.y+box.height/2,{steps:10});await page.mouse.up();
 await expect.poll(()=>shelf.evaluate(e=>e.scrollLeft)).toBeGreaterThan(before+30);
 await expect(page.locator('.toysw__item[aria-current=page]')).toHaveAttribute('data-toy','mario');
 // A normal click after dragging remains functional.
 await page.locator('#real-models [data-toy=e88]').click();await expect(page.locator('#toy')).toHaveAttribute('data-model','e88');
});
