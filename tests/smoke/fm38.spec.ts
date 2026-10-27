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
 await page.evaluate(()=>window.scrollTo(0,0));
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
 const failed:string[]=[];
 page.on('response',response=>{if(response.status()>=400&&response.url().includes('fm38'))failed.push(response.url());});
 await page.goto('./?toy=fm38&power=on');
 for(const toy of ['minibrick','fm38']){
  await page.locator('.devpick__trigger').click();
  await page.locator(`.devpick__card[data-toy="${toy}"]`).click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model',toy);
  await expect(page.locator('.minibrick-lcd--live')).toHaveCount(1);
 }
 await expect(page.locator('#base [data-key]')).toHaveCount(7);
 expect(failed).toEqual([]);
});

test('MELODY cycles clean synthesized tunes without muting or restarting the game',async({page})=>{
 const requests:string[]=[];
 page.on('request',request=>{if(/\.(mp3|wav|ogg|m4a)(\?|$)/.test(request.url()))requests.push(request.url());});
 await page.addInitScript(()=>{
  Object.assign(window,{fmTones:[]});
  const create=AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator=function(){
   const voice=create.call(this),set=voice.frequency.setValueAtTime.bind(voice.frequency);
   voice.frequency.setValueAtTime=(value,time)=>{(window as unknown as {fmTones:number[]}).fmTones.push(value);return set(value,time);};
   return voice;
  };
 });
 await page.goto('./?toy=fm38&power=on');
 await page.locator('#base [data-key=sp]').click();
 await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
 for(const [index,notes]of [[1,[76,76,77]],[0,[76,71,72]]] as const){
  await page.evaluate(()=>{(window as unknown as {fmTones:number[]}).fmTones=[];});
  await page.locator('#base [data-key=sound]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-melody',String(index));
  await expect(page.locator('[data-lcd=note][data-on]')).toHaveCount(1);
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
  expect(await page.evaluate(()=>(window as unknown as {fmTones:number[]}).fmTones.slice(0,3))).toEqual(notes.map(midi=>440*2**((midi-69)/12)));
 }
 expect(requests).toEqual([]);
});

test('FM-38 keys are separate objects shaped like the buttons: sprite + silhouette hit area, the body is drawn without them',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('./?toy=fm38&power=on&view=full');
 await expect(page.locator('#base [data-key]')).toHaveCount(7);
 expect(await page.evaluate(()=>getComputedStyle(document.getElementById('toy')!,'::before').backgroundImage)).toContain('body-plain.png');
 for(const key of ['left','right','down','sp','sound','onoff','jump']){
  const art=page.locator(`#base [data-key=${key}] + .fm__art img`);
  await expect(art,`${key}: спрайт кнопки следует за областью нажатия`).toHaveCount(1);
  await expect.poll(()=>art.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>40),`${key}: спрайт загружен`).toBe(true);
 }
 // Нажатие уводит спрайт вглубь (сжатие со сдвигом), отпускание возвращает его на место.
 const left=page.locator('#base [data-key=left]'),art=page.locator('#base [data-key=left] + .fm__art img');
 const box=(await left.boundingBox())!;
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55);await page.mouse.down();
 await expect(left).toHaveAttribute('data-pressed','');
 await expect.poll(()=>art.evaluate((image)=>getComputedStyle(image).transform)).not.toBe('none');
 await page.mouse.up();
 await expect(page.locator('#game-area')).toHaveAttribute('data-level','1'); // LEVEL / LEFT сработала один раз
 await expect.poll(()=>art.evaluate((image)=>getComputedStyle(image).transform)).toBe('none');
 // Область нажатия — силуэт треугольника: угол рамки спрайта кнопкой не является.
 await page.mouse.move(box.x+2,box.y+2);await page.mouse.down();
 await expect(left).not.toHaveAttribute('data-pressed','');
 await page.mouse.up();
 await expect(page.locator('#game-area')).toHaveAttribute('data-level','1'); // угол рамки не нажал кнопку
});

test('FM-38 LCD follows the photographed layout: single cup outline, LEVEL label under its digit, two lit LINES digits in the middle of eight',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('./?toy=fm38&power=on&view=full');
 await expect(page.locator('.fm38-lcd .lcd-frame')).toHaveCount(1);
 const boxes=await page.evaluate(()=>{
  const rect=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return{top:r.top,bottom:r.bottom};};
  const groups=[...document.querySelectorAll('.fm38-lcd .lcd-digits')].map(g=>g.getBoundingClientRect());
  return{speedLabel:rect('.fm38-lcd [data-lcd=speed]'),levelLabel:rect('.fm38-lcd [data-lcd=level]'),gameB:rect('.fm38-lcd [data-lcd=gameB]'),rotate:rect('.fm38-lcd [data-lcd=rotateText]'),row:groups[0]!,speed:groups[1]!,level:groups[2]!};
 });
 expect(boxes.speedLabel.bottom,'SPEED стоит над своей цифрой').toBeLessThanOrEqual(boxes.speed.top+2);
 expect(boxes.levelLabel.top,'LEVEL стоит под своей цифрой').toBeGreaterThanOrEqual(boxes.level.bottom-2);
 expect(boxes.speed.bottom,'цифры SPEED и LEVEL идут одна за другой').toBeLessThanOrEqual(boxes.level.top+2);
 expect(boxes.rotate.top,'ROTATE под GAME A/B').toBeGreaterThan(boxes.gameB.top);
 // Первая группа — восемь цифр по семь сегментов; горят только пятая и шестая (индексы 28–41).
 const lit=await page.evaluate(()=>[...document.querySelector('.fm38-lcd .lcd-digits')!.children].flatMap((segment,index)=>segment.hasAttribute('data-on')?[index]:[]));
 expect(lit.length).toBeGreaterThan(0);
 expect(lit.every(index=>index>=28&&index<42),`горят сегменты ${lit}`).toBe(true);
});

test('FM-38 has the segment ghost switch like the other toys',async({page})=>{
 await page.goto('./?toy=fm38&power=on&view=full');
 await expect(page.locator('#segments-options')).toBeVisible();
 const unlit=page.locator('.fm38-lcd .lcd-cell:not([data-on])').first();
 await expect.poll(()=>unlit.evaluate((node)=>+getComputedStyle(node).opacity)).toBeGreaterThan(0);
 await page.locator('#segments-options label:has(input[value=off])').click();
 await expect(page.locator('.fm38-lcd')).toHaveAttribute('data-ghost','off');
 await expect.poll(()=>unlit.evaluate((node)=>+getComputedStyle(node).opacity)).toBe(0);
 await expect.poll(()=>page.locator('.fm38-lcd .lcd-cell[data-on]').first().evaluate((node)=>+getComputedStyle(node).opacity)).toBeGreaterThan(.5);
});

test('FM-38 screen-only view: the screen is as large as on the other bricks and the housing is cut along the screen frame',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 const windowOf=async(toy:string)=>{
  await page.goto(`./?toy=${toy}&view=screen`);
  await expect(page.locator('#toy')).toHaveAttribute('data-view','screen');
  return {window:(await page.locator('.lid__window').boundingBox())!,front:(await page.locator('#lid-front').boundingBox())!};
 };
 const mini=await windowOf('minibrick');
 const fm=await windowOf('fm38');
 expect(Math.abs(fm.window.width/mini.window.width-1),'ширина экрана как у Mini Brick (±8 %)').toBeLessThan(.08);
 expect(fm.front.height,'вид помещается в окно без прокрутки').toBeLessThan(800);
 expect(await page.evaluate(()=>getComputedStyle(document.getElementById('toy')!,'::before').backgroundImage),'корпус вырезан по рамке экрана').toContain('screen-frame.png');
 const lcd=(await page.locator('.minibrick-lcd--live').boundingBox())!;
 expect(lcd.x).toBeGreaterThan(fm.front.x+fm.front.width*.1);
 expect(lcd.x+lcd.width).toBeLessThan(fm.front.x+fm.front.width*.9);
});
