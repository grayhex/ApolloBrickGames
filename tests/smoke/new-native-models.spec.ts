import { expect, test } from '@playwright/test';

for(const [id, count, codes] of [
  ['e23',99,['01','02','03','04','05','06','07','08','93','94','95','96','97','98','99']],
  ['apollo-b0302',18,['01','02','03','09','10','13','14','15','16']],
] as const) {
  test(`${id}: observed menu entries can be selected and started`,async({page})=>{
    test.setTimeout(120_000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    for(const code of codes){
      await page.goto(`./?toy=${id}&power=on`);
      await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
      await expect(page.locator('#guide-game option')).toHaveCount(count);
      await page.locator('#guide-game').selectOption(`${id}.${code}`);
      await expect(page.locator('#game-area')).toHaveAttribute('data-entry',`${id}.${code}`);
      await page.locator('.gnav__btn--launch').click();
      await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
      await page.locator('#base [data-key=left]').click();
      await page.locator('#base [data-key=jump]').click();
    }
    expect(errors).toEqual([]);
  });
  for(const width of [360,1440])test(`${id}: LCD and physical keys fit the viewport at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    await page.goto(`./?toy=${id}&power=on`);
    await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
    await expect(page.locator('.native__lcd #frame')).toBeVisible();
    await expect(page.locator('.native__key')).toHaveCount(id==='e23'?7:8);
    const screen=await page.locator('.lid__window').boundingBox();
    expect(screen!.x).toBeGreaterThanOrEqual(0);
    expect(screen!.x+screen!.width).toBeLessThanOrEqual(width+1);
  });
}
