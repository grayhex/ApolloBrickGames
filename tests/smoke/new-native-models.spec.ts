import { expect, test } from '@playwright/test';
import lcdMapping from '../../src/devices/lcd-mapping.json' with { type: 'json' };

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

test('B0302 shows the ROM-style digit 9 without a lower horizontal segment',async({page})=>{
  await page.goto('./?toy=apollo-b0302&power=on');
  await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
  await page.locator('#game-area').focus();
  for(let i=0;i<9;i++){await page.keyboard.press('ArrowRight');await page.waitForTimeout(70);}
  for(const id of ['14_5','15_0','21_0','14_6','20_5'])
    await expect(page.locator(`.native__lcd [id="${id}"]`)).toHaveCSS('opacity','1');
  for(const id of ['26_5','20_6'])
    await expect(page.locator(`.native__lcd [id="${id}"]`)).not.toHaveCSS('opacity','1');
});

test('E-23 array opening reaches the real LCD segments',async({page})=>{
  await page.goto('./?toy=e23&power=on');
  await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
  await page.locator('#guide-game').selectOption('e23.06');
  await page.locator('.gnav__btn--launch').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
  const expected=['##########','##########','.########.','.########.','..######..'];
  await expect.poll(()=>page.evaluate((matrix)=>matrix.slice(0,5).map(row=>row.map(id=>
    (document.querySelector(`.native__lcd [id="${id}"]`) as SVGElement | null)?.style.opacity==='1'?'#':'.').join('')),lcdMapping.e88.matrix)).toEqual(expected);
  await expect(page.locator(`.native__lcd [id="${lcdMapping.e88.matrix[19]![4]}"]`)).toHaveCSS('opacity','1');
});
