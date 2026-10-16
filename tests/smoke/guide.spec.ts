import { expect, test, type Page } from '@playwright/test';

/**
 * Левая панель игрушек: у «168 в 1 танк» (игры 1–9), «Морского боя» (режимы A–F) и «Часов+99» — вкладки с описанием игр консоли; у Mario логотип по центру;
 * у «168 в 1 танк» рядом с наклейкой миниатюра 3D-коробки, по щелчку — диалог, где коробку можно покрутить.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');

type TetrisDebug = Window & { __tetris: { piece: { x: number; y: number; kind: string } | null; phase: string } };

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`./?${query}&view=full&power=on&debug&seed=7`);
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(() => area(page, 'boot')).toBe('off');
}

const tabs = (page: Page) => page.locator('#side-info .gtab');
const selected = (page: Page) => page.locator('#side-info .gtab[aria-selected="true"]');

test.describe('вкладки игр', () => {
  test('«168 в 1 танк»: девять игр 1–9 по списку владельца; открыт тетрис (8), играющий сейчас помечен', async ({ page }) => {
    await open(page, 'toy=tank168');
    await expect(tabs(page)).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(await tabs(page).evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['game']))).toEqual([
      'tank', 'frog', 'racing', 'racing-shooting', 'shooting-array', 'shooting-figures', 'construction', 'tetris', 'tetris-pentix',
    ]);
    await expect(selected(page)).toHaveText('8');
    await expect(page.locator('#side-info .gtab[data-playing]')).toHaveText('8');
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Тетрис');
    await expect(page.locator('#gpanel .chip').first()).toHaveText('пока обычный тетрис');
    await expect(page.locator('#gpanel .chip').nth(1)).toHaveText('Вариантов: 51');
    await expect(page.locator('#gpanel #rules-title')).toHaveText('Как играть'); // у тетриса — правила и очки
    await expect(page.locator('#side-info #keymap')).toContainText('Поворот'); // управление остаётся
  });

  test('щелчок по вкладке открывает описание игры: что за игра, что известно, что не установлено, откуда сведения', async ({ page }) => {
    await open(page, 'toy=tank168');
    await tabs(page).nth(4).click();
    await expect(selected(page)).toHaveText('5');
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Стрельба по массиву и точкам');
    await expect(page.locator('#gpanel .chip').first()).toHaveText('ещё не восстановлена');
    await expect(page.locator('#gpanel')).toContainText('отделяются'); // про отделяющиеся точки-враги
    await expect(page.locator('#gpanel .gpanel__open')).toContainText('Не установлено');
    await expect(page.locator('#gpanel .gpanel__src')).toContainText('Источник');
    await expect(page.locator('#gpanel .gpanel__src')).toContainText('не прошивка Apollo');
    await expect(page.locator('#gpanel #rules-title')).toHaveCount(0); // правил тетриса здесь нет
    await tabs(page).nth(0).click();
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Танки');
    await expect(page.locator('#gpanel .chip').nth(1)).toHaveText('Вариантов: 5');
    // Роль и связи для скринридеров.
    await expect(page.locator('#side-info [role="tablist"]')).toHaveCount(1);
    await expect(page.locator('#gpanel')).toHaveAttribute('role', 'tabpanel');
    await expect(page.locator('#gpanel')).toHaveAttribute('aria-labelledby', 'gtab-tank');
  });

  test('стрелки, Home и End перебирают вкладки; выбранная вкладка и фокус совпадают', async ({ page }) => {
    await open(page, 'toy=tank168');
    await tabs(page).nth(7).focus();
    await page.keyboard.press('ArrowRight');
    await expect(selected(page)).toHaveText('9');
    await page.keyboard.press('ArrowRight'); // по кругу
    await expect(selected(page)).toHaveText('1');
    await page.keyboard.press('End');
    await expect(selected(page)).toHaveText('9');
    await page.keyboard.press('Home');
    await expect(selected(page)).toHaveText('1');
    await page.keyboard.press('ArrowLeft');
    await expect(selected(page)).toHaveText('9');
    await expect(page.locator('#side-info .gtab[aria-selected="true"]')).toBeFocused();
    // Из вкладок остаётся один пункт в порядке табуляции.
    expect(await tabs(page).evaluateAll((items) => items.filter((item) => (item as HTMLElement).tabIndex === 0).length)).toBe(1);
  });

  test('«Морской бой»: режимы A–F по списку владельца, открыт E (обычный тетрис); арканоид с оговоркой про «теннис»; коробки нет', async ({ page }) => {
    await open(page, 'toy=seabattle');
    await expect(tabs(page)).toHaveText(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(await tabs(page).evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['game']))).toEqual([
      'sea-battle', 'tank', 'romeo-juliet', 'tetris-big', 'tetris', 'arkanoid',
    ]);
    await expect(selected(page)).toHaveText('E');
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Тетрис');
    await tabs(page).nth(5).click();
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Арканоид');
    await expect(page.locator('#gpanel .gpanel__open')).toContainText('теннис');
    await tabs(page).nth(2).click();
    await expect(page.locator('#gpanel')).toContainText('лесенку');
    await expect(page.locator('[data-box-open]')).toHaveCount(0);
  });

  test('«Часы+99»: четыре игры по наклейке, открыт тетрис (2); в примечании сказано, что список уточняется', async ({ page }) => {
    await open(page, 'toy=clock99');
    await expect(tabs(page)).toHaveText(['1', '2', '3', '4']);
    await expect(selected(page)).toHaveText('2');
    await expect(page.locator('#side-info .games__note')).toContainText('уточняется');
    await tabs(page).nth(0).click();
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Часы');
    await expect(page.locator('[data-box-open]')).toHaveCount(0);
  });

  test('выбранная вкладка не сбрасывается при смене языка; текст и подписи переводятся', async ({ page }) => {
    await open(page, 'toy=tank168');
    await tabs(page).nth(5).click();
    await page.locator('#corner-lang').click();
    await expect(selected(page)).toHaveText('6');
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Shooting: shapes');
    await expect(page.locator('#gpanel .gpanel__open')).toContainText('Not established');
    await expect(page.locator('#side-info [role="tablist"]')).toHaveAttribute('aria-label', 'Console games');
    await expect(page.locator('[data-box-open]')).toHaveAttribute('aria-label', 'Examine the box in 3D');
  });

  test('переключение игрушек на месте: вкладки соответствуют игрушке, выбор начинается с играющей игры', async ({ page }) => {
    await open(page, 'toy=tank168');
    await tabs(page).nth(0).click();
    await page.locator('.toysw__item[data-toy="seabattle"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'seabattle');
    await expect(tabs(page)).toHaveText(['A', 'B', 'C', 'D', 'E', 'F']);
    await expect(selected(page)).toHaveText('E');
    await expect(page.locator('[data-box-open]')).toHaveCount(0);
    await page.locator('.toysw__item[data-toy="tank168"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'tank168');
    await expect(tabs(page)).toHaveCount(9);
    await expect(page.locator('[data-box-open]')).toBeVisible();
  });
});

test.describe('логотип Mario в левой панели', () => {
  for (const [width, height] of [
    [1920, 1080], // выше 960 px логотип раньше прижимался к левому краю панели
    [1366, 1000],
    [1440, 900],
  ] as const) {
    test(`по центру панели при окне ${width} × ${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('./?view=full');
      await expect(page.locator('#side-info .about__logo')).toBeVisible();
      const panel = (await page.locator('#side-info').boundingBox())!;
      const logo = (await page.locator('#side-info .about__logo').boundingBox())!;
      const logoCenter = logo.x + logo.width / 2;
      const panelCenter = panel.x + panel.width / 2;
      expect(Math.abs(logoCenter - panelCenter), `логотип ${logoCenter}, панель ${panelCenter}`).toBeLessThanOrEqual(2);
      await expect(page.locator('#side-info .gtab')).toHaveCount(0); // у Mario панель по упаковке, без вкладок
    });
  }
});

test.describe('3D-коробка «168 в 1 танк»', () => {
  const dialog = (page: Page) => page.locator('#box-dialog');
  const viewer = (page: Page) => page.locator('#box-dialog .box3d');
  const yaw = async (page: Page): Promise<number> => Number(await viewer(page).getAttribute('data-yaw'));
  const pitch = async (page: Page): Promise<number> => Number(await viewer(page).getAttribute('data-pitch'));

  test('миниатюра стоит рядом с наклейкой справа, внутри панели, с пометкой «3D» и доступным названием', async ({ page }) => {
    await open(page, 'toy=tank168');
    const button = page.locator('#side-info [data-box-open]');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-label', 'Рассмотреть коробку 3D');
    await expect(button.locator('.boxbtn__cap')).toHaveText('3D');
    const sticker = (await page.locator('#side-info .about__sticker').boundingBox())!;
    const box = (await button.boundingBox())!;
    const panel = (await page.locator('#side-info').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(sticker.x + sticker.width - 2); // правее наклейки
    expect(Math.abs(box.y + box.height / 2 - (sticker.y + sticker.height / 2))).toBeLessThan(40); // на одной линии
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
    // Шесть граней миниатюры с картинками, коробка не выходит за кнопку.
    await expect(button.locator('.box3d__face')).toHaveCount(6);
    const inside = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>('.box3d__face')].every((face) => {
        const r = face.getBoundingClientRect();
        return r.left >= rect.left - 4 && r.right <= rect.right + 4 && r.top >= rect.top - 4 && r.bottom <= rect.bottom + 4;
      });
    });
    expect(inside).toBe(true);
  });

  test('щелчок открывает диалог: шесть граней с картинками, все файлы граней отдаются; Esc закрывает', async ({ page }) => {
    await open(page, 'toy=tank168');
    await page.locator('[data-box-open]').click();
    await expect(dialog(page)).toHaveAttribute('open', '');
    await expect(dialog(page).locator('h2')).toHaveText('Коробка «168 в 1 танк»');
    await expect(viewer(page).locator('.box3d__face')).toHaveCount(6);
    const urls = await viewer(page).locator('.box3d__face').evaluateAll((faces) =>
      faces.map((face) => /url\("?([^")]+)"?\)/.exec((face as HTMLElement).style.backgroundImage)?.[1] ?? ''),
    );
    expect(urls.every((url) => /box-tank168\/(front|back|left|right|top|bottom)\.webp$/.test(url))).toBe(true);
    expect(new Set(urls).size).toBe(6);
    const sizes = await page.evaluate(async (list) => Promise.all(list.map(async (url) => (await fetch(url)).status)), urls);
    expect(sizes).toEqual([200, 200, 200, 200, 200, 200]);
    await expect(viewer(page)).toBeFocused();
    // Модель занимает стол диалога и не выходит из него.
    const stage = (await page.locator('#box-dialog .box__stage').boundingBox())!;
    const box = (await viewer(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(300);
    expect(box.x).toBeGreaterThanOrEqual(stage.x - 1);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).not.toHaveAttribute('open', '');
  });

  test('вращение: мышью, стрелками, кнопками видов и «Сброс»; колесо меняет масштаб', async ({ page }) => {
    await open(page, 'toy=tank168');
    await page.locator('[data-box-open]').click();
    await expect(viewer(page)).toBeFocused();
    expect([await yaw(page), await pitch(page)]).toEqual([-28, -14]);

    const rect = (await viewer(page).boundingBox())!;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy, { steps: 8 });
    await page.mouse.up();
    expect(await yaw(page)).toBeGreaterThan(-28 + 30); // вправо — поворот вправо (≈ +40°)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 40, { steps: 6 });
    await page.mouse.up();
    expect(await pitch(page)).toBeLessThan(-14 - 10); // вниз — верх к зрителю

    const before = await yaw(page);
    await page.keyboard.press('ArrowRight');
    expect(await yaw(page)).toBe(before + 12);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await yaw(page)).toBe(before - 12);

    await page.locator('#box-dialog [data-view="back"]').click();
    expect([await yaw(page), await pitch(page)]).toEqual([180, 0]);
    await page.locator('#box-dialog [data-view="side"]').click();
    expect([await yaw(page), await pitch(page)]).toEqual([90, 0]);
    await page.locator('#box-dialog [data-view="front"]').click();
    expect([await yaw(page), await pitch(page)]).toEqual([0, 0]);
    await page.locator('#box-dialog [data-view="top"]').click();
    expect(await pitch(page)).toBeLessThan(-60);

    const zoom = Number(await viewer(page).getAttribute('data-zoom'));
    await viewer(page).hover();
    await page.mouse.wheel(0, -300);
    expect(Number(await viewer(page).getAttribute('data-zoom'))).toBeGreaterThan(zoom);
    await page.mouse.wheel(0, 3000);
    expect(Number(await viewer(page).getAttribute('data-zoom'))).toBeLessThan(zoom);

    await page.locator('#box-dialog [data-view="home"]').click();
    expect([await yaw(page), await pitch(page)]).toEqual([-28, -14]);
    expect(Number(await viewer(page).getAttribute('data-zoom'))).toBe(1);
  });

  test('освещение пересчитывается при повороте: у граней разная непрозрачность тёмного слоя, к зрителю обращены нужные грани', async ({ page }) => {
    await open(page, 'toy=tank168');
    await page.locator('[data-box-open]').click();
    const dims = (): Promise<Record<string, number>> =>
      viewer(page).locator('.box3d__face').evaluateAll((faces) =>
        Object.fromEntries(faces.map((face) => [(face as HTMLElement).dataset['face'], Number((face as HTMLElement).style.getPropertyValue('--dim'))])),
      );
    const home = await dims();
    expect(Object.keys(home).sort()).toEqual(['back', 'bottom', 'front', 'left', 'right', 'top']);
    expect(new Set(Object.values(home)).size).toBeGreaterThan(2);
    await page.locator('#box-dialog [data-view="back"]').click();
    const back = await dims();
    expect(back['back']).toBeLessThan(back['front'] ?? 0); // обращённая к зрителю грань светлее той, что смотрит от него
  });

  test('пока диалог открыт, игра на паузе, а клавиши не уходят в игру; после закрытия игра продолжается по паузе', async ({ page }) => {
    await open(page, 'toy=tank168');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    const x = await page.evaluate(() => (window as unknown as TetrisDebug).__tetris.piece?.x ?? -1);
    await page.locator('[data-box-open]').click();
    await expect.poll(phase(page)).toBe('paused');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => (window as unknown as TetrisDebug).__tetris.piece?.x ?? -1)).toBe(x);
    expect(await phase(page)()).toBe('paused');
    await page.locator('#box-dialog .btn--primary').click(); // «Закрыть»
    await expect(dialog(page)).not.toHaveAttribute('open', '');
    expect(await phase(page)()).toBe('paused'); // игра остаётся на паузе — продолжает игрок
  });

  test('при смене языка диалог переписывается, а вид коробки сохраняется', async ({ page }) => {
    await open(page, 'toy=tank168');
    await page.locator('[data-box-open]').click();
    await page.locator('#box-dialog [data-view="back"]').click();
    await page.evaluate(() => document.getElementById('corner-lang')?.click()); // кнопка за модальным окном: нажимаем программно
    await expect(dialog(page).locator('h2')).toHaveText('The “168 in 1 Tank” box');
    await expect(page.locator('#box-dialog [data-view="back"]')).toHaveText('Back');
    expect(await yaw(page)).toBe(180);
  });
});
