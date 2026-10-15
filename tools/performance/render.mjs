// Run against an already started Vite server. Counts work; this is not an FPS benchmark.
import { chromium } from '@playwright/test';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5173/');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const toy of ['mario', 'clock99', 'seabattle']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.renderMetrics = { canvas: 0, mutations: 0 };
      for (const name of ['fillRect', 'clearRect', 'drawImage']) {
        const original = CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name] = function (...args) {
          if (this.canvas.id === 'screen') window.renderMetrics.canvas++;
          return original.apply(this, args);
        };
      }
      new MutationObserver(records => { window.renderMetrics.mutations += records.length; })
        .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    const url = new URL(base);
    url.search = new URLSearchParams({ toy, view: 'full', seed: '7' }).toString();
    await page.goto(url.href);
    await page.waitForSelector('body:not([data-booting])');
    for (const mode of ['off', 'playing']) {
      if (mode === 'playing') {
        await page.keyboard.press('KeyO');
        await page.waitForTimeout(6000); // wait for the LCD self-test and Mario intro
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.getElementById('game-area')?.dataset.phase === 'playing');
        await page.waitForTimeout(500);
      }
      await page.evaluate(() => { window.renderMetrics = { canvas: 0, mutations: 0 }; });
      await page.waitForTimeout(2000);
      console.log(JSON.stringify({ toy, mode, sampleMs: 2000, ...await page.evaluate(() => window.renderMetrics) }));
    }
    await page.close();
  }
} finally {
  await browser.close();
}
