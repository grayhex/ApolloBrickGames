/* global process, document, console */
// Compare LCD segment geometry in the original CC0 vectors. Output is an
// observation aid; inspect ambiguous matches before using them as a mapping.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/research/match_native_lcd.mjs /path/to/BrickEmuPy');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const page = await browser.newPage();
const faces = ['Apollo126in1B0202','Apollo18in1B0302'];
const boxes = [];
for (const name of faces) {
  const svg = readFileSync(`${source}/assets/${name}.svg`, 'utf8');
  await page.setContent(svg);
  boxes.push(await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#display [id]')]
    .filter(e=>/^\d+_\d+$/.test(e.id)).map(e=>{
      const b=(e).getBBox();
      return [e.id,[b.x,b.y,b.width,b.height]];
    }))));
}
const mapping=JSON.parse(readFileSync('src/devices/lcd-mapping.json','utf8'))['apollo-b0202'].segments;
if (process.argv[3] === '--boxes') {
  console.log(JSON.stringify(boxes[1],null,2));
  await browser.close();
  process.exit(0);
}
if (process.argv[3] === '--screenshot') {
  const svg=readFileSync(`${source}/assets/${process.argv[4] || 'Apollo18in1B0302'}.svg`, 'utf8');
  await page.setViewportSize({width:800,height:1950});
  await page.setContent(`<style>body{margin:0;background:white} svg{width:800px;height:auto}</style>${svg}`);
  await page.screenshot({path:'/tmp/b0302-original-lcd.png'});
  await browser.close();
  process.exit(0);
}
if (process.argv[3] === '--body-groups') {
  const svg=readFileSync(`${source}/assets/${process.argv[4] || 'Apollo18in1B0302'}.svg`, 'utf8');
  await page.setContent(svg);
  console.log(JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('#body > [id]')].map(e=>{
    const b=e.getBBox();return {id:e.id,box:[b.x,b.y,b.width,b.height]};
  })),null,2));
  await browser.close();
  process.exit(0);
}
const match={};
for (const [canonical, id] of Object.entries(mapping)) {
  const a=boxes[0][id];
  if (!a) continue;
  const candidates=Object.entries(boxes[1]).map(([key,b])=>[key,Math.hypot(...a.map((v,i)=>(v-b[i])))])
    .sort((x,y)=>x[1]-y[1]);
  match[canonical]={source:id,best:candidates.slice(0,3)};
}
console.log(JSON.stringify(match,null,2));
await browser.close();
