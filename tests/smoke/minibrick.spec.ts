import { expect, test, type Page } from '@playwright/test';
import { marioUrl } from './url';

/** Консоль игрушки (`?debug`): только простые значения, которые можно передать из страницы. */
const debug = (page: Page): Promise<{ introDone: boolean; gameId: string; gameNumber: number }> =>
  page.evaluate(() => {
    const m = (window as unknown as { __minibrick: { introDone: boolean; gameId: string; gameNumber: number } }).__minibrick;
    return { introDone: m.introDone, gameId: m.gameId, gameNumber: m.gameNumber };
  });
/** Клавиша держится дольше такта и отпускается до следующего нажатия: два нажатия подряд внутри одного кадра слились бы в одно. */
const tap = async (page: Page, key: string): Promise<void> => {
  await page.keyboard.press(key, { delay: 40 });
  await page.waitForTimeout(40);
};
const litCells = (page: Page): Promise<number> => page.locator('#game-area .minibrick-lcd .lcd-cell[data-on]').count();

test('Mini Brick Game: рамка стакана видна на выключенном экране, включение — заставка с рожицей, затем «96»', async ({ page }) => {
  await page.goto('./?toy=minibrick&view=full&debug');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'red');
  await expect(page.locator('#side-info')).toHaveAccessibleName('Mini Brick Game B-S96');
  await expect(page.locator('.minibrick-key')).toHaveCount(8);
  await expect(page.locator('#game-area .minibrick-lcd')).toHaveCount(1);
  // Выключено: рамка стакана чётко видна, сегменты — только слабый призрак, ни одна клетка не горит.
  const frame = page.locator('#game-area .minibrick-lcd .lcd-frame');
  await expect(frame).toBeVisible();
  expect(await frame.evaluate((node) => Number(getComputedStyle(node).opacity))).toBe(1);
  expect(await litCells(page)).toBe(0);
  expect(await page.locator('#game-area .minibrick-lcd .lcd-cell').count()).toBe(200 + 16);
  expect(await page.locator('#game-area .minibrick-lcd .lcd-icon').count()).toBe(13);
  const ghost = await page.locator('#game-area .minibrick-lcd .lcd-icon').first().evaluate((node) => Number(getComputedStyle(node).opacity));
  expect(ghost).toBeGreaterThan(0.03);
  expect(ghost).toBeLessThan(0.15);

  const rotation = (await page.locator('.minibrick-key[data-key=jump]').boundingBox())!;
  expect(rotation.height / rotation.width).toBeGreaterThan(1.4);

  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  await expect(page.locator('#game-area')).toHaveAttribute('data-stage', 'intro');
  await expect.poll(() => litCells(page), { timeout: 4000 }).toBeGreaterThan(10); // рожица
  await expect.poll(async () => (await debug(page)).introDone, { timeout: 8000 }).toBe(true); // дальше неподвижное «96»
  const intro = await litCells(page);
  expect(intro).toBeGreaterThan(20);
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  await expect.poll(() => litCells(page)).toBe(0);
  await expect(frame).toBeVisible();
});

test('Mini Brick Game: любая кнопка открывает меню, DOWN листает номера, LEFT/RIGHT — уровень и скорость, анимация шкалы независима от уровня', async ({ page }) => {
  await page.goto('./?toy=minibrick&view=full&power=on&debug');
  await expect(page.locator('#game-area')).toHaveAttribute('data-stage', 'intro');
  await page.locator('[data-key=down]').dispatchEvent('pointerdown', { pointerId: 1, button: 0, pointerType: 'mouse' });
  await page.locator('[data-key=down]').dispatchEvent('pointerup', { pointerId: 1, button: 0, pointerType: 'mouse' });
  await expect(page.locator('#game-area')).toHaveAttribute('data-stage', 'menu');
  expect((await debug(page)).gameNumber).toBe(0);
  const lit = await litCells(page);
  expect(lit).toBeGreaterThan(20); // крупное «00»
  expect(await page.locator('#game-area .minibrick-lcd [data-lcd=hi][data-on]').count()).toBe(1);
  await page.evaluate('window.__minibrick.powerTicks=0');
  await expect(page.locator('#game-area .minibrick-lcd .lcd-icon[data-on]')).toHaveCount(1);
  await expect(page.locator('#game-area .minibrick-lcd .lcd-icon[data-on]')).toHaveAttribute('data-icon', 'cherries');

  await tap(page, 'ArrowDown');
  await expect(page.locator('#game-area')).toHaveAttribute('data-game', '1');
  await tap(page, 'ArrowDown');
  await expect(page.locator('#game-area')).toHaveAttribute('data-game', '2');
  await tap(page, 'ArrowUp'); // ↑ — то же, что ROTATE: номер назад
  await expect(page.locator('#game-area')).toHaveAttribute('data-game', '1');
  await tap(page, 'ArrowLeft');
  await tap(page, 'ArrowLeft');
  await expect(page.locator('#game-area')).toHaveAttribute('data-level', '2');
  // The idle fruit animation is independent of the menu level setting.
  await tap(page, 'ArrowRight');
  await expect(page.locator('#game-area')).toHaveAttribute('data-speed', '1');
  // Ни названий игр, ни превью: на экране остаётся только число на матрице.
  await expect(page.locator('#game-area')).not.toContainText(/racing|tetris|гонк|тетрис/i);
});

test('Mini Brick Game: 00 и 01 — гонки, 02 и дальше — тетрис; партия, пауза, RESET в меню и звук', async ({ page }) => {
  await page.goto('./?toy=minibrick&view=full&power=on&debug&seed=5');
  await expect(page.locator('#game-area')).toHaveAttribute('data-stage', 'intro');
  await tap(page, 'ArrowDown'); // заставка → меню, номер 00
  await expect(page.locator('#game-area')).toHaveAttribute('data-stage', 'menu');
  await tap(page, 'Enter');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  expect((await debug(page)).gameId).toBe('racing');
  await expect(page.locator('#game-area .minibrick-lcd [data-lcd=score][data-on]')).toHaveCount(1);
  await page.locator('[data-key=fire]').click(); // RESET
  await expect(page.locator('#game-area')).toHaveAttribute('data-stage', 'menu');
  await tap(page, 'ArrowDown');
  await tap(page, 'ArrowDown');
  await expect(page.locator('#game-area')).toHaveAttribute('data-game', '2');
  await tap(page, 'Enter');
  expect((await debug(page)).gameId).toBe('tetris');
  await expect.poll(() => page.locator('#game-area .minibrick-lcd .lcd-cell[data-on]').count()).toBeGreaterThan(0);
  await tap(page, 'ArrowLeft');
  await tap(page, 'ArrowDown');
  await tap(page, 'Space');
  await tap(page, 'p');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'paused');
  await expect(page.locator('#game-area .minibrick-lcd [data-lcd=cup][data-on]')).toHaveCount(1); // чашка паузы
  await tap(page, 'p');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  await page.locator('[data-key=sound]').click();
  await expect(page.locator('#game-area .minibrick-lcd [data-lcd=note][data-on]')).toHaveCount(0);
  await page.locator('[data-key=sound]').click();
  await expect(page.locator('#game-area .minibrick-lcd [data-lcd=note][data-on]')).toHaveCount(1);
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
});

test('переключение Mini → Alibaba → Apollo восстанавливает экран, кнопки и справку', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?toy=minibrick&view=full');
  await expect(page.locator('#game-area .minibrick-lcd')).toHaveCount(1);
  await page.locator('.toysw__item[data-toy=alibaba]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'alibaba');
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'white');
  await expect(page.locator('#game-area .minibrick-lcd')).toHaveCount(0);
  await expect(page.locator('.minibrick-key')).toHaveCount(0);
  await expect(page.locator('#alibaba-notice')).toHaveCount(1);
  await expect(page.locator('#side-info')).toHaveAccessibleName('Alibaba Dance 99 in 1');
  await page.goBack();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'minibrick');
  await expect(page.locator('#game-area .minibrick-lcd')).toHaveCount(1);
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  await page.locator('.toysw__item[data-toy=seabattle]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'seabattle');
  await expect(page.locator('#game-area .minibrick-lcd')).toHaveCount(0);
  await expect(page.locator('#lid-cover image')).toHaveCount(0);
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on'); // питание переходит на следующую игрушку
  expect(errors).toEqual([]);
});

test('две модели в «Другие» доступны на телефоне, LCD и кнопка питания остаются в границах', async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('./?toy=minibrick&view=full');
    await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
    await page.addStyleTag({ content: "*{font-family:'DejaVu Sans',sans-serif !important}" });
    const links = page.locator('#real-models .toysw__item[data-toy=alibaba], #real-models .toysw__item[data-toy=minibrick]');
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      await link.scrollIntoViewIfNeeded();
      const box = (await link.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.width).toBeGreaterThan(50);
    }
    const onoff = (await page.locator('[data-key=onoff]').boundingBox())!;
    expect(onoff.y + onoff.height).toBeLessThan(660);
    const lcd = (await page.locator('#game-area .minibrick-lcd').boundingBox())!;
    const window = (await page.locator('.lid__window').boundingBox())!;
    expect(lcd.x).toBeGreaterThanOrEqual(window.x - 1);
    expect(lcd.x + lcd.width).toBeLessThanOrEqual(window.x + window.width + 1);
    expect(Math.abs(lcd.width / lcd.height - 219 / 304)).toBeLessThan(0.05); // ЖК вписан без полей: стекло по его пропорциям
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('[data-key=onoff]').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
    await page.locator('[data-key=onoff]').click();
  }
});

test('Mini Brick Game: «только экран» — касание включает игрушку, открывает меню и запускает партию', async ({ page }) => {
  await page.goto('./?toy=minibrick&view=screen&debug');
  await page.locator('#game-area').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  await page.locator('#game-area').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-stage', 'menu');
  await page.locator('#game-area').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
});

test('группа «Другие» не перекрывает системное меню запущенной Apollo', async ({ page }) => {
  for (const width of [900, 1024, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(marioUrl('?power=on'));
    await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
    await page.getByRole('button',{name:'Следующие модели'}).click();
    const menu = (await page.locator('#toy-switch').boundingBox())!;
    const corner = (await page.locator('.corner').boundingBox())!;
    expect(menu.y >= corner.y + corner.height || menu.x >= corner.x + corner.width).toBe(true);
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  }
});


test('Mini menu cycles fruit rods and alternates HI-SCORE/LINES on a single eight-digit display',async({page})=>{
 await page.goto('./?toy=minibrick&power=on&view=full&debug');
 await expect(page.locator('#game-area')).toHaveAttribute('data-stage','intro');
 const root=page.locator('#game-area .minibrick-lcd');
 const at=async(tick:number)=>{await page.evaluate(t=>{(window as unknown as {__minibrick:{powerTicks:number}}).__minibrick.powerTicks=t;},tick);};
 await at(0);await expect(root.locator('.lcd-icon[data-on]')).toHaveCount(1);
 await expect(root.locator('[data-lcd=hi][data-on]')).toHaveCount(1);
 await at(30);await expect(root.locator('.lcd-icon[data-on]')).toHaveCount(2);
 await expect(root.locator('[data-lcd=lines][data-on]')).toHaveCount(1);
 await expect(root.locator('[data-lcd=hi][data-on]')).toHaveCount(0);
 await at(360);await expect(root.locator('.lcd-icon[data-on]')).toHaveCount(13);
 await at(390);await expect(root.locator('.lcd-icon[data-on]')).toHaveCount(12);
 await expect(root.locator('[data-icon=crown][data-on]')).toHaveCount(0);
 await at(750);await expect(root.locator('.lcd-icon[data-on]')).toHaveCount(0);
 expect(await root.locator('text').allTextContents()).not.toContain('HI-SCORE'); // one shared HI- / SCORE legend, not duplicate SCORE text
 expect(await root.locator('text').allTextContents()).toContain('HI-');
 expect(await root.locator('text:text-is("SCORE")').count()).toBe(1);
});


test('Mini racing waits for the single verse, waves the flag and opens its barrier before automatic acceleration',async({page})=>{
 await page.goto('./?toy=minibrick&power=on&view=full&debug&seed=7');
 await expect(page.locator('#game-area')).toHaveAttribute('data-stage','intro');
 await tap(page,'ArrowDown');await tap(page,'Enter');
 const state=()=>page.evaluate(()=>{const m=(window as unknown as {__minibrick:{game:{score:number;tick:number;cells():Uint8Array};displaySpeed:number}}).__minibrick;return{score:m.game.score,tick:m.game.tick,speed:m.displaySpeed,barrier:[...m.game.cells().slice(100,110)].reduce((a,b)=>a+b,0)}});
 const first=await state();expect(first.score).toBe(0);expect(first.speed).toBe(0);expect(first.barrier).toBe(10);
 await expect.poll(async()=> (await state()).speed,{timeout:16000}).toBeGreaterThanOrEqual(1);
 await expect.poll(async()=> (await state()).score,{timeout:3000}).toBeGreaterThanOrEqual(10);
 expect(await page.evaluate(()=>Number(localStorage.getItem('crocodile-mario:minibrick:00:r2:hi')))).toBeGreaterThanOrEqual(10);
 await expect(page.locator('#game-area .minibrick-lcd [data-lcd=next][data-on]')).toHaveCount(1);
 await expect(page.locator('#game-area .minibrick-lcd [data-lcd=level][data-on]')).toHaveCount(0);
 await tap(page,'p');const paused=await state();await page.waitForTimeout(700);expect((await state()).score).toBe(paused.score);
});
