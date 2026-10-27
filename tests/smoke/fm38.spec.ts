import {test,expect} from '@playwright/test';
for(const width of [390,1440])for(const theme of ['dark','light'])test(`FM-38 demo, settings, play and screen view at ${width}, ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./?toy=fm38&power=on&debug');
 if(theme==='light')await page.locator('#corner-theme').click();
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 await expect(page.locator('#toy')).toHaveAttribute('data-model','fm38');
 await expect(page.locator('#game-area')).toHaveAttribute('data-phase','ready');
 await expect(page.locator('#base [data-key]')).toHaveCount(7);
 await page.locator('#base [data-key=down]').click();
 await expect(page.locator('#game-area')).toHaveAttribute('data-game','1');
 await expect(page.locator('[data-lcd=gameB][data-on]')).toHaveCount(1);
 await page.locator('#base [data-key=left]').click();
 await expect(page.locator('#game-area')).toHaveAttribute('data-level','1');
 await page.locator('#base [data-key=right]').click();
 await expect(page.locator('#game-area')).toHaveAttribute('data-speed','1');
 await page.locator('#base [data-key=sp]').click();
 await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
 await page.locator('#base [data-key=jump]').click();
 await page.locator('#base [data-key=sp]').click();
 await expect(page.locator('#game-area')).toHaveAttribute('data-phase','paused');
 await page.screenshot({path:`/tmp/fm38-${width}-${theme}.png`,fullPage:true});
 const before=await page.locator('.minibrick-lcd--live').boundingBox();
 await page.locator('#view-screen').click();
 await expect(page.locator('#toy')).toHaveAttribute('data-view','screen');
 await expect(page.locator('.minibrick-lcd--live')).toBeVisible();
 const after=await page.locator('.minibrick-lcd--live').boundingBox();
 expect(after!.width).toBeGreaterThan(before!.width);
 await page.screenshot({path:`/tmp/fm38-screen-${width}-${theme}.png`,fullPage:true});
 await page.locator('#view-full').click();
 await page.locator('#base [data-key=onoff]').click();
 await expect(page.locator('.minibrick-lcd .lcd-cell[data-on]')).toHaveCount(0);
 await expect(page.locator('.minibrick-lcd .lcd-frame')).toBeVisible();
 expect(errors).toEqual([]);
});

test('FM-38 switches to B-S96 and back without a stale shell or LCD',async({page})=>{
 await page.goto('./?toy=fm38&power=on');
 for(const toy of ['minibrick','fm38']){
  await page.locator('.devpick__trigger').click();
  await page.locator(`.devpick__card[data-toy="${toy}"]`).click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model',toy);
  await expect(page.locator('.minibrick-lcd--live')).toHaveCount(1);
 }
 await expect(page.locator('#base [data-key]')).toHaveCount(7);
});
