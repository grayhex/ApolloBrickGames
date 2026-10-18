import { expect, test, type Page } from '@playwright/test';

async function exhibit(page: Page, query = '&view=full'): Promise<void> {
  await page.goto(`./?toy=alibaba${query}`);
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'unavailable');
  await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
}

test('прокрутка карусели сохраняет игру, ссылки переключают корпус и работают с историей браузера', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?toy=clock99&power=on');
  await expect(page.locator('#game-area')).toHaveAttribute('data-boot', 'off');
  await expect(page.locator('#real-models .toysw__item')).toHaveCount(8);
  await page.getByRole('button',{name:'Следующие модели'}).click();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'clock99');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  await expect(page.locator('#real-models .toysw__item')).toHaveCount(8);
  await page.locator('.toysw__item[data-toy=alibaba]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'unavailable');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  await expect(page.locator('.alibaba-key')).toHaveCount(8);
  await page.goBack();
  await expect(page.locator('.toysw__item[data-toy=clock99]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'clock99');
  await expect(page.locator('.alibaba-key')).toHaveCount(0);
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  await page.goForward();
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'alibaba');
  await expect(page.locator('.toysw__item[data-toy=alibaba]')).toHaveAttribute('aria-current', 'page');
  await page.locator('.toysw__item[data-toy=alibaba]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.toysw__item[data-toy=minibrick]')).toBeFocused();
  await page.keyboard.press('Home');
  await page.locator('.toysw__item[data-toy=mario]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('#lid-cover .lid__logo--red')).toHaveAttribute('src', /apollo-logo/);
  await expect(page.locator('#lid-cover image')).toHaveCount(0);
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  expect(errors).toEqual([]);
});

test('ON/OFF показывает статус, включая клавиатуру и вид экрана; игры не запускаются', async ({ page }) => {
  await exhibit(page, '&power=on&debug');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  expect(await page.evaluate(() => '__brick' in window || '__tetris' in window)).toBe(false);
  await expect(page.locator('#segments-off')).toBeHidden();
  await expect(page.locator('#corner-editor')).toBeHidden();
  await page.locator('[data-key=onoff]').click();
  await expect(page.locator('#alibaba-notice')).toBeVisible();
  await expect(page.locator('#alibaba-notice h2')).toHaveText('Игра пока в разработке');
  await page.keyboard.press('Escape');
  await page.keyboard.press('o');
  await expect(page.locator('#alibaba-notice')).toBeVisible();
  await page.locator('#alibaba-notice button').click();
  await page.locator('#corner-lang').click();
  await page.locator('#view-screen').click();
  await page.locator('#game-area').click();
  await expect(page.locator('#alibaba-notice h2')).toHaveText('Game in development');
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await expect(page.locator('#screen')).toBeHidden();
});

test('справка имеет доступное имя, настройки не предлагают неподдерживаемые цвета', async ({ page }) => {
  await exhibit(page);
  await expect(page.locator('#side-info')).toHaveAccessibleName('Alibaba Dance 99 in 1');
  const saved = await page.evaluate(() => JSON.stringify(localStorage));
  await page.locator('#corner-settings').click();
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#settings .settings__table')).toHaveCount(1);
  await expect(page.locator('#settings-shell')).toHaveCount(0);
  await expect(page.locator('#settings .shellpick')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeHidden();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(saved);
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'white');
  await page.locator('#corner-lang').click();
  await expect(page.locator('#side-info')).toHaveAccessibleName('Alibaba Dance 99 in 1');
});

test('на узких экранах оба семейства помещаются, кнопки Alibaba доступны без прокрутки', async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await exhibit(page);
    await page.addStyleTag({ content: "*{font-family:'DejaVu Sans',sans-serif !important}" });
    for (const direction of ['Следующие модели', 'Предыдущие модели']) {
      await page.getByRole('button',{name:direction}).click();
      const menu = (await page.locator('#toy-switch').boundingBox())!;
      expect(menu.x).toBeGreaterThanOrEqual(0);
      expect(menu.x + menu.width).toBeLessThanOrEqual(width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const keys = await page.locator('.alibaba-key').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().bottom));
    expect(Math.max(...keys)).toBeLessThan(740 - 80);
    const ratios = await page.evaluate(() => {
      const lid = document.getElementById('lid-front')!,
        base = document.getElementById('base')!;
      return [lid.offsetHeight / lid.offsetWidth, base.offsetHeight / base.offsetWidth];
    });
    expect(ratios[0]).toBeCloseTo(1.1, 2);
    expect(ratios[1]).toBeCloseTo(1.65, 2);
  }
});

for (const id of ['alibaba', 'minibrick']) test(`геометрия ${id} сохраняет ось крышки и неподвижный шарнир во время открытия`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`./?toy=${id}`);
  await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
  await expect(page.locator('body')).not.toHaveAttribute('data-motion', 'off');
  const rows = await page.evaluate(
    () =>
      new Promise<{ gap: number; height: number; slot: number; knuckle: number; band: number; transform: string }[]>((resolve) => {
        const lid = document.getElementById('lid')!,
          base = document.getElementById('base')!,
          toy = document.getElementById('toy')!;
        const slot = document.getElementById('lid-slot')!,
          knuckle = document.querySelector('.toy__knuckle')!,
          band = document.querySelector('.toy__band')!;
        const samples: { gap: number; height: number; slot: number; knuckle: number; band: number; transform: string }[] = [],
          start = performance.now();
        document.getElementById('lid-cover')!.click();
        const sample = (): void => {
          const transform = getComputedStyle(lid).transform,
            matrix = new DOMMatrix(transform),
            width = toy.getBoundingClientRect().width;
          const slotHeight = slot.getBoundingClientRect().height,
            baseTop = base.getBoundingClientRect().top;
          samples.push({
            gap: Math.abs(lid.offsetHeight + matrix.m42 - slotHeight),
            height: lid.offsetHeight,
            slot: slotHeight,
            knuckle: (knuckle.getBoundingClientRect().top - baseTop) / width,
            band: (band.getBoundingClientRect().top - baseTop) / width,
            transform,
          });
          if (performance.now() - start < 1800) requestAnimationFrame(sample);
          else resolve(samples);
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(new Set(rows.map((row) => row.transform)).size).toBeGreaterThan(4);
  expect(rows.some((row) => row.slot > 30 && row.slot < row.height - 30)).toBe(true);
  for (const row of rows) expect(row.gap).toBeLessThan(row.height * 0.045 + 3);
  for (const key of ['knuckle', 'band'] as const)
    expect(Math.max(...rows.map((row) => row[key])) - Math.min(...rows.map((row) => row[key]))).toBeLessThan(0.004);
  await page.locator('#view-closed').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
  await expect(page.locator('#lid-cover')).toBeVisible();
});
