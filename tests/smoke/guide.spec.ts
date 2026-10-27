import { expect, test, type Page } from '@playwright/test';
import { marioUrl, mockReadOnlyLeaderboard } from './url';
import { chooseToy } from './picker';

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
    await expect(page.locator('#side-info .dcard')).toContainText('168 в 1 танк'); // вверху панели — карточка устройства, схемы клавиш в панели нет
    await expect(page.locator('#side-info #keymap')).toHaveCount(0);
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
    // Следующая клавиша идёт после того, как выбранная вкладка получила фокус: стрелки действуют только внутри списка вкладок.
    const step = async (key: string, text: string): Promise<void> => {
      await page.keyboard.press(key);
      await expect(selected(page)).toHaveText(text);
      await expect(selected(page)).toBeFocused();
    };
    await step('ArrowRight', '9');
    await step('ArrowRight', '1'); // по кругу
    await step('End', '9');
    await step('Home', '1');
    await step('ArrowLeft', '9');
    // Из вкладок остаётся один пункт в порядке табуляции.
    expect(await tabs(page).evaluateAll((items) => items.filter((item) => (item as HTMLElement).tabIndex === 0).length)).toBe(1);
  });

  test('стрелки по вкладкам переключают и меню консоли, как щелчок по вкладке', async ({ page }) => {
    await open(page, 'toy=tank168');
    await selected(page).focus();
    await page.keyboard.press('ArrowRight');
    const game = await selected(page).getAttribute('data-game');
    expect(game).toBeTruthy();
    await expect.poll(() => area(page, 'game')).toBe(game);
    await page.keyboard.press('End');
    const last = await selected(page).getAttribute('data-game');
    await expect.poll(() => area(page, 'game')).toBe(last);
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
    await chooseToy(page, 'seabattle');
    await expect(page.locator('body')).toHaveAttribute('data-toy', 'seabattle');
    await expect(tabs(page)).toHaveText(['A', 'B', 'C', 'D', 'E', 'F']);
    await expect(selected(page)).toHaveText('A'); // открыта игра, выбранная в меню консоли
    await expect(page.locator('[data-box-open]')).toHaveCount(0);
    await chooseToy(page, 'tank168');
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
    test(`логотип в карточке устройства внутри панели при окне ${width} × ${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(marioUrl('?view=full'));
      await expect(page.locator('#side-info .dcard .about__logo')).toBeVisible();
      const panel = (await page.locator('#side-info').boundingBox())!;
      const card = (await page.locator('#side-info .dcard').boundingBox())!;
      const logo = (await page.locator('#side-info .dcard .about__logo').boundingBox())!;
      expect(logo.x, 'логотип внутри карточки').toBeGreaterThanOrEqual(card.x);
      expect(logo.x + logo.width, 'логотип внутри карточки').toBeLessThanOrEqual(card.x + card.width + 1);
      expect(card.x, 'карточка внутри панели').toBeGreaterThanOrEqual(panel.x);
      expect(card.x + card.width, 'карточка внутри панели').toBeLessThanOrEqual(panel.x + panel.width + 1);
      await expect(page.locator('#side-info .gtab')).toHaveCount(0); // у Mario панель по упаковке, без вкладок
    });
  }
});

test.describe('3D-коробка «168 в 1 танк»', () => {
  const dialog = (page: Page) => page.locator('#box-dialog');
  const viewer = (page: Page) => page.locator('#box-dialog .box3d');
  const yaw = async (page: Page): Promise<number> => Number(await viewer(page).getAttribute('data-yaw'));
  const pitch = async (page: Page): Promise<number> => Number(await viewer(page).getAttribute('data-pitch'));

  test('3D-коробка открывается ссылкой в карточке устройства: без миниатюры, с доступным названием, внутри панели', async ({ page }) => {
    await open(page, 'toy=tank168');
    const link = page.locator('#side-info .dcard [data-box-open]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('aria-label', 'Рассмотреть коробку 3D');
    await expect(link).toContainText('3D-коробка');
    await expect(page.locator('#side-info .box3d'), 'миниатюры коробки в панели нет').toHaveCount(0);
    const box = (await link.boundingBox())!;
    const panel = (await page.locator('#side-info').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(panel.x);
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
    await link.click();
    await expect(page.locator('#box-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('#box-dialog .box3d__face')).toHaveCount(6);
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
    test(`у Mario нет ссылки на 3D-коробку, логотип в карточке устройства, справка помещается без прокрутки (${width} × ${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(marioUrl('?view=full&power=on'));
      await expect.poll(phase(page)).toBe('ready');
      await expect(page.locator('#side-info [data-box-open]')).toHaveCount(0);
      await expect(page.locator('#side-info .box3d')).toHaveCount(0);
      await expect(page.locator('#box-dialog')).not.toHaveAttribute('open', '');
      await expect(page.locator('#side-info .dcard .about__logo')).toBeVisible(); // логотип остаётся в карточке устройства
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

test('энциклопедия содержит варианты и источники; слева одна статичная схема', async ({ page }) => {
  await open(page, 'toy=seabattle');
  await expect(page.locator('#gpanel .gscheme')).toHaveCount(1);
  await expect(page.locator('#gpanel canvas')).toHaveCount(0);
  await expect(page.locator('#gpanel .grules li')).toHaveCount(3);
  await page.locator('#corner-help').click();
  await expect(page.locator('.enc-article h2')).toHaveText('Морской бой');
  await expect(page.locator('#rules')).toContainText('Затем стреляет соперник');
  await page.locator('.enc-item[data-game=tank]').click();
  await expect(page.locator('#modes li')).toHaveCount(5);
  await expect(page.locator('#sources')).toContainText('MIT');
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
