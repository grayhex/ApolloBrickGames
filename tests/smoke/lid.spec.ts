import { expect, test, type Page } from '@playwright/test';

/**
 * Закрытая раскладушка: игрушка при каждой загрузке закрыта, на крышке логотип Apollo; щелчок по крышке (или Enter / пробел)
 * раскрывает её с анимацией; вид выбирается в блоке «Вид» пульта и не запоминается.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

test.use({ viewport: { width: 1440, height: 900 } });

/** Страница загружена и приложение запущено (обработчики клавиш вешаются после загрузки данных). */
async function load(page: Page, query = ''): Promise<void> {
  await page.goto(`./${query}`);
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
}

test('по умолчанию игрушка закрыта: на крышке логотип Apollo, экран и кнопки недоступны, место крышки схлопнуто', async ({ page }) => {
  await load(page);
  const toy = page.locator('#toy');
  await expect(toy).toHaveAttribute('data-view', 'closed');
  await expect(toy).toHaveAttribute('data-closed', '');
  await expect(page.locator('#view-closed')).toHaveAttribute('aria-pressed', 'true');

  const cover = page.locator('#lid-cover');
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAccessibleName('Открыть игрушку');
  // Логотип — картинка из присланных файлов; на синем корпусе — вариант с белой надписью.
  const logo = cover.locator('.lid__logo--white');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', /apollo-logo-white-caption\.svg$/);
  await expect(cover.locator('.lid__logo--red')).toBeHidden();
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // Под закрытой крышкой экран и кнопки не получают ни фокус, ни клавиши.
  await expect(page.locator('#lid-front')).toHaveJSProperty('inert', true);
  await expect(page.locator('#lower')).toHaveJSProperty('inert', true);
  await expect(cover).toHaveJSProperty('inert', false);

  // Закрытая игрушка занимает ровно нижнюю половину: она ниже открытой и целиком в окне, без прокрутки.
  const fit = await page.evaluate(() => {
    const rect = (document.getElementById('toy') as HTMLElement).getBoundingClientRect();
    const cover = (document.getElementById('lid-cover') as HTMLElement).getBoundingClientRect();
    const base = (document.getElementById('base') as HTMLElement).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, innerH: window.innerHeight, scrollH: document.documentElement.scrollHeight, coverTop: cover.top, coverBottom: cover.bottom, coverH: cover.height, coverW: cover.width, baseTop: base.top, baseBottom: base.bottom };
  });
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.bottom).toBeLessThanOrEqual(fit.innerH);
  expect(fit.scrollH).toBeLessThanOrEqual(fit.innerH + 1);
  // По фото закрытой игрушки: две втулки шарнира слева и справа выглядывают над верхней кромкой, посередине ничего нет (шлейф скрыт).
  const hinge = await page.evaluate(() => {
    const top = (selector: string): DOMRect[] => [...document.querySelectorAll<HTMLElement>(selector)].map((e) => e.getBoundingClientRect());
    const cover = (document.getElementById('lid-cover') as HTMLElement).getBoundingClientRect();
    const band = document.querySelector<HTMLElement>('.toy__band') as HTMLElement;
    return { knuckles: top('.toy__knuckle'), coverTop: cover.top, coverLeft: cover.left, coverRight: cover.right, bandOpacity: Number(getComputedStyle(band).opacity) };
  });
  expect(hinge.knuckles).toHaveLength(2);
  const [left, right] = hinge.knuckles as [DOMRect, DOMRect];
  expect(left.top).toBeLessThan(hinge.coverTop - 8); // выступают над кромкой крышки
  expect(right.top).toBeLessThan(hinge.coverTop - 8);
  expect(left.right).toBeLessThan(right.left - 40); // между ними — пустой промежуток
  expect(left.left).toBeGreaterThan(hinge.coverLeft);
  expect(right.right).toBeLessThan(hinge.coverRight);
  expect(hinge.bandOpacity).toBe(0); // посередине ничего нет
  // Оборот лежит поверх верхней части нижней половины (крышка почти квадратная), снизу виден «подбородок».
  expect(fit.coverTop).toBeGreaterThanOrEqual(fit.baseTop - 14); // чуть выше нижней половины: накрывает шарнир
  expect(fit.coverBottom).toBeLessThan(fit.baseBottom - 40);
  expect(fit.coverH / fit.coverW).toBeGreaterThan(0.85);
  expect(fit.coverH / fit.coverW).toBeLessThan(1.1);
});

test('логотип подбирается под корпус: красная надпись на жёлтом и белом, белая на синем и красном', async ({ page }) => {
  await load(page);
  for (const [shell, caption] of [
    ['blue', 'white'],
    ['red', 'white'],
    ['yellow', 'red'],
    ['white', 'red'],
  ] as const) {
    await page.locator(`#shell-picker [data-shell="${shell}"]`).click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', shell);
    await expect(page.locator(`#lid-cover .lid__logo--${caption}`)).toBeVisible();
    await expect(page.locator(`#lid-cover .lid__logo--${caption === 'white' ? 'red' : 'white'}`)).toBeHidden();
  }
});

test('щелчок по крышке раскрывает игрушку: видны экран и кнопки, вид «Полная»', async ({ page }) => {
  await load(page);
  await page.locator('#lid-cover').click();
  const toy = page.locator('#toy');
  await expect(toy).toHaveAttribute('data-view', 'full');
  await expect(toy).not.toHaveAttribute('data-closed', '');
  await expect(page.locator('#view-full')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#lid-front')).toHaveJSProperty('inert', false);
  await expect(page.locator('#lid-cover')).toHaveJSProperty('inert', true);
  await expect(page.locator('#lcd-window')).toBeVisible();
  await expect(page.locator('#base')).toBeVisible();
  await expect(page.locator('#game-area')).toBeFocused(); // клавиатура у игры
  // Игрушка выключена, как и раньше: включает ON/OFF.
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
});

test('Enter и пробел раскрывают закрытую игрушку; пока она закрыта, клавиши игре не принадлежат', async ({ page }) => {
  await load(page);
  await page.keyboard.press('KeyO'); // питание под закрытой крышкой не включается
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');

  await load(page);
  await page.keyboard.press('Space');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
});

test('с клавиатуры: Tab доходит до крышки, Enter на ней раскрывает игрушку', async ({ page }) => {
  await load(page);
  await page.locator('#lid-cover').focus();
  await expect(page.locator('#lid-cover')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
});

test('«Свёрнута» из пульта закрывает крышку; идущая игра встаёт на паузу; из закрытого можно сразу в «только экран»', async ({ page }) => {
  await load(page, '?power=on');
  await expect.poll(() => area(page, 'phase')).toBe('ready');
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await page.locator('#view-closed').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-closed', '');
  await expect.poll(() => area(page, 'phase')).toBe('paused');
  await page.locator('#view-screen').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-compact', '');
  await expect(page.locator('#toy')).not.toHaveAttribute('data-closed', '');
  await expect(page.locator('#base')).toBeHidden();
});

test('?view=closed и ?view=screen задают вид явно; ?power=on без ?view раскрывает игрушку', async ({ page }) => {
  await load(page, '?power=on&view=closed');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
  await load(page, '?view=screen');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
  await load(page, '?power=on');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
});

test.describe('раскрытие с анимацией', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('крышка поворачивается плавно (промежуточные положения), игрушка при этом меняет размер; при загрузке — без анимации', async ({ page }) => {
    await load(page);
    await expect.poll(() => page.evaluate(() => document.body.dataset['motion'] ?? 'on')).toBe('on');
    const frame = (): Promise<{ matrix: string; w: number; slot: number }> =>
      page.evaluate(() => ({
        matrix: getComputedStyle(document.getElementById('lid') as HTMLElement).transform,
        w: (document.getElementById('toy') as HTMLElement).getBoundingClientRect().width,
        slot: (document.getElementById('lid-slot') as HTMLElement).getBoundingClientRect().height,
      }));
    const closed = await frame();
    expect(closed.matrix).not.toBe('none');
    expect(closed.slot).toBeLessThan(4); // место крышки схлопнуто

    await page.locator('#lid-cover').click();
    const samples: { matrix: string; w: number; slot: number }[] = [];
    for (let i = 0; i < 22; i++) {
      samples.push(await frame());
      await page.waitForTimeout(60);
    }
    const distinct = new Set(samples.map((s) => s.matrix));
    expect(distinct.size).toBeGreaterThan(4); // поворот шёл по кадрам, а не одним скачком
    // Место крышки раскрывается постепенно и в конце равно её высоте; ширина игрушки уменьшается (открытая выше закрытой).
    expect(samples.some((s) => s.slot > 20 && s.slot < samples[samples.length - 1]!.slot * 0.9)).toBe(true);
    await expect.poll(async () => (await frame()).slot, { timeout: 3000 }).toBeGreaterThan(200);
    const open = await frame();
    expect(open.w).toBeLessThan(closed.w);
    expect(open.matrix === 'none' || /^matrix(3d)?\(/.test(open.matrix)).toBe(true);

    // Обратно: тоже плавно.
    await page.locator('#view-closed').click();
    const back: number[] = [];
    for (let i = 0; i < 22; i++) {
      back.push((await frame()).slot);
      await page.waitForTimeout(60);
    }
    expect(back.some((v) => v > 20 && v < open.slot * 0.9)).toBe(true);
    await expect.poll(async () => (await frame()).slot, { timeout: 3000 }).toBeLessThan(4);
  });
});
