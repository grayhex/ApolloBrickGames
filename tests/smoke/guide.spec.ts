import { expect, test, type Page } from '@playwright/test';
import { marioUrl, mockReadOnlyLeaderboard } from './url';

/**
 * Левая панель игрушек: у «168 в 1 танк» (игры 1–9), «Морского боя» (режимы A–F) и «Часов+99» — вкладки с описанием игр консоли; у Mario логотип по центру;
 * у «168 в 1 танк» рядом с наклейкой миниатюра 3D-коробки, по щелчку — диалог, где коробку можно покрутить.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');

test.beforeEach(async ({ page }) => {
  await mockReadOnlyLeaderboard(page);
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
  test('«168 в 1 танк»: девять игр 1–9 по списку владельца; открыта игра, выбранная в меню консоли (1, танки), она же помечена', async ({ page }) => {
    await open(page, 'toy=tank168');
    await expect(tabs(page)).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(await tabs(page).evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['game']))).toEqual([
      'tank', 'frog', 'racing', 'racing-shooting', 'shooting-array', 'shooting-figures', 'construction', 'tetris', 'tetris-pentix',
    ]);
    await expect(selected(page)).toHaveText('1');
    await expect(page.locator('#side-info .gtab[data-playing]')).toHaveText('1');
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Танки');
    await expect(page.locator('#side-info #keymap')).toContainText('ROTATE'); // управление — кнопки консоли с меню
    // Тетрис (8) — 51 вариант; правил и очков заглушки у консоли с меню нет.
    await tabs(page).nth(7).click();
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Тетрис');
    await expect(page.locator('#gpanel #rules-title')).toHaveCount(0);
  });

  test('щелчок по вкладке открывает описание игры: что за игра, что известно, что не установлено, откуда сведения', async ({ page }) => {
    await open(page, 'toy=tank168');
    await tabs(page).nth(4).click();
    await expect(selected(page)).toHaveText('5');
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Стрельба по массиву и точкам');
    // Описание «по факту реализации» (src/brick/guides): цель, факты, правила (раскрыты), остальное — под заголовками.
    await expect(page.locator('#gpanel .grules li')).toHaveCount(3); // про отделяющиеся точки-враги
    await expect(page.locator('#gpanel .gpanel__goal')).not.toBeEmpty();
    await expect(page.locator('#gpanel .gscheme').first()).toBeVisible();
    await expect(page.locator('#gpanel .gpanel__open')).toHaveCount(0); // общих «не установлено» у описанных игр нет: допущения — в своём разделе
    await expect(page.locator('#gpanel #rules-title')).toHaveCount(0); // правил тетриса здесь нет
    await tabs(page).nth(0).click();
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Танки');
    // Роль и связи для скринридеров.
    await expect(page.locator('#side-info [role="tablist"]')).toHaveCount(1);
    await expect(page.locator('#gpanel')).toHaveAttribute('role', 'tabpanel');
    await expect(page.locator('#gpanel')).toHaveAttribute('aria-labelledby', 'gtab-tank');
  });

  test('стрелки, Home и End перебирают вкладки; выбранная вкладка и фокус совпадают', async ({ page }) => {
    await open(page, 'toy=tank168');
    await tabs(page).nth(7).focus();
    await page.keyboard.press('Enter'); // выбранная вкладка — по Enter; стрелки идут от неё
    await expect(selected(page)).toHaveText('8');
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

  test('«Морской бой»: режимы A–F по списку владельца, открыта игра, выбранная в меню консоли (A); арканоид с оговоркой про «теннис»; коробки нет', async ({ page }) => {
    await open(page, 'toy=seabattle');
    await expect(tabs(page)).toHaveText(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(await tabs(page).evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['game']))).toEqual([
      'sea-battle', 'tank', 'romeo-juliet', 'tetris-big', 'tetris', 'arkanoid',
    ]);
    await expect(selected(page)).toHaveText('A');
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Морской бой');
    await tabs(page).nth(4).click();
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Тетрис');
    await tabs(page).nth(5).click();
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Арканоид');
    await tabs(page).nth(2).click();
    await expect(page.locator('#gpanel')).toContainText('лестницу');
    await expect(page.locator('[data-box-open]')).toHaveCount(0);
  });

  test('«Часы+99»: десять игр, открыт тетрис (1)', async ({ page }) => {
    await open(page, 'toy=clock99');
    await expect(tabs(page)).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    await expect(selected(page)).toHaveText('1');
    await tabs(page).nth(0).click();
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Тетрис');
    await expect(page.locator('[data-box-open]')).toHaveCount(0);
  });

  test('щелчок мышью по вкладке во время игры возвращает клавиатуру консоли; с клавиатуры (Enter) фокус остаётся на вкладке', async ({ page }) => {
    await open(page, 'toy=tank168');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    await tabs(page).nth(2).click();
    await expect(selected(page)).toHaveText('3');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('game-area'); // клавиши снова идут консоли
    await page.keyboard.press('p');
    await expect.poll(phase(page)).toBe('paused'); // клавиша P дошла до консоли
    // С клавиатуры фокус остаётся на вкладке: по стрелкам перебираются вкладки (консолью управлять с неё нельзя, пока фокус на вкладке).
    await tabs(page).nth(2).focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['game'])).toBe('racing');
    await page.keyboard.press('ArrowRight');
    await expect(selected(page)).toHaveText('4');
  });

  test('выбранная вкладка не сбрасывается при смене языка; текст и подписи переводятся', async ({ page }) => {
    await open(page, 'toy=tank168');
    await tabs(page).nth(5).click();
    await page.locator('#corner-lang').click();
    await expect(selected(page)).toHaveText('6');
    await expect(page.locator('#gpanel .gpanel__name')).toHaveText('Shooting: shapes');
    await expect(page.locator('#gpanel .gpanel__goal')).not.toBeEmpty();
    await expect(page.locator('#side-info [role="tablist"]')).toHaveAttribute('aria-label', 'Console games');
    await expect(page.locator('[data-box-open]')).toHaveAttribute('aria-label', 'Examine the box in 3D');
  });

  test('переключение игрушек на месте: вкладки соответствуют игрушке, выбор начинается с играющей игры', async ({ page }) => {
    await open(page, 'toy=tank168');
    await tabs(page).nth(0).click();
    await page.locator('.toysw__item[data-toy="seabattle"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'seabattle');
    await expect(tabs(page)).toHaveText(['A', 'B', 'C', 'D', 'E', 'F']);
    await expect(selected(page)).toHaveText('A'); // открыта игра, выбранная в меню консоли
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
      await page.goto(marioUrl('?view=full'));
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
    const state = (): Promise<string> => page.evaluate(() => JSON.stringify({ ...document.getElementById('game-area')?.dataset }));
    await page.locator('[data-box-open]').click();
    await expect.poll(phase(page)).toBe('paused');
    const before = JSON.parse(await state()) as Record<string, string>;
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    const after = JSON.parse(await state()) as Record<string, string>;
    for (const key of ['game', 'mode', 'level', 'speed', 'score', 'tick']) expect(after[key], key).toBe(before[key]); // клавиши в консоль не ушли
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

test.describe('3D-коробка Crocodile Mario: вывод выключен', () => {
  // Модель готова (`PACKS.mario`), но кнопки и диалога у Mario нет: коробка выпирала за границы блока панели. Включение — см. комментарий у `pack` в `src/app/toys.ts`.
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1280, 720],
  ] as const) {
    test(`у Mario нет кнопки 3D, логотип по центру панели, справка помещается без прокрутки (${width} × ${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(marioUrl('?view=full&power=on'));
      await expect.poll(phase(page)).toBe('ready');
      await expect(page.locator('#side-info [data-box-open]')).toHaveCount(0);
      await expect(page.locator('#side-info .box3d')).toHaveCount(0);
      await expect(page.locator('#box-dialog')).not.toHaveAttribute('open', '');
      const logo = await page.locator('#side-info .about__logo').boundingBox(); // в низком окне (1280 × 720) логотип скрыт
      const panel = (await page.locator('#side-info').boundingBox())!;
      if (logo) expect(Math.abs(logo.x + logo.width / 2 - (panel.x + panel.width / 2))).toBeLessThanOrEqual(2);
      const fit = await page.locator('#side-info').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
      expect(fit.scroll, `${width}×${height}: справка без прокрутки`).toBeLessThanOrEqual(fit.client + 1);
    });
  }

  test('у «168 в 1 танк» кнопка 3D остаётся', async ({ page }) => {
    await page.goto('./?toy=tank168&power=on');
    await expect.poll(phase(page)).toBe('ready');
    await expect(page.locator('#side-info [data-box-open="tank168"]')).toBeVisible();
  });
});

test('подробная справка содержит варианты и допущения, левая панель — краткие правила и схемы', async ({ page }) => {
  await open(page, 'toy=seabattle');
  await expect(page.locator('#gpanel .gsec, #gpanel .chip')).toHaveCount(0);
  await expect(page.locator('#gpanel .gscheme')).toBeVisible();
  await expect(page.locator('#gpanel .grules li')).toHaveCount(3);
  await page.locator('#corner-help').click();
  const help = page.locator('#help');
  await expect(help).toBeVisible();
  const sea = help.locator('.help__game[data-game="sea-battle"]');
  await sea.locator(':scope > summary').click();
  await expect(sea).toContainText('Поочерёдные выстрелы');
  const tanks = help.locator('.help__game[data-game="tank"]');
  await tanks.locator(':scope > summary').click();
  await tanks.locator('[data-sec="modes"] summary').click();
  await expect(tanks.locator('.gmodes li')).toHaveCount(2);
  await expect(help).toContainText('MIT');
  await page.keyboard.press('Escape');
  await expect(help).not.toBeVisible();
});
test('фигуры Mario сохраняют квадратные рамки в невысоком окне', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(marioUrl('?view=full'));
  await expect(page.locator('#side-info .fig__box')).toHaveCount(11);
  const sizes = await page.locator('#side-info .fig__box').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect(); return [r.width, r.height];
  }));
  expect(sizes.length).toBeGreaterThan(5);
  for (const [w, h] of sizes) expect(Math.abs(w! - h!)).toBeLessThan(1);
});
