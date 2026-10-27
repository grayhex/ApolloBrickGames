import { expect, test, type Page } from '@playwright/test';
import { chooseToy, closePicker, openPicker, pickerCard, pickerPanel, pickerTrigger } from './picker';
import defaults from '../../src/config/default.json' with { type: 'json' };
import type { SiteConfig } from '../../src/config/schema';
import { validateConfig } from '../../src/config/schema';
import { marioUrl } from './url';

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  (page as Page & { __errors?: string[] }).__errors = errors;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
});

/** Перейти на страницу и дождаться конца загрузочной вспышки: до неё фокус и клики по странице ещё не в силе. */
async function visit(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
  await expect(pickerTrigger(page)).toBeVisible();
}

/** Опубликованная конфигурация с настройками каталога из админки (`config.catalog`) вместо сетевого запроса. */
async function withCatalog(page: Page, catalog: NonNullable<SiteConfig['catalog']>): Promise<void> {
  const config = validateConfig({ ...(defaults as object), catalog });
  await page.route('**/api/config', (route) => route.fulfill({ json: { config, revision: 1 } }));
}

const rect = (page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> =>
  page.locator(selector).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });

test.describe('каталог устройств: закрытая панель', () => {
  test('миниатюра, производитель и модель, значок готовности и стрелка; каталог скрыт', async ({ page }) => {
    await visit(page, './?toy=seabattle');
    const bar = pickerTrigger(page);
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-expanded', 'false');
    await expect(bar.locator('svg.devpick__thumb')).toBeVisible();
    await expect(bar.locator('.devpick__maker')).toHaveText('Apollo');
    await expect(bar.locator('.devpick__model')).toHaveText('Морской бой');
    await expect(bar.locator('.devpick__ready')).toHaveAttribute('aria-label', 'Можно играть');
    await expect(bar.locator('svg.devpick__chevron')).toBeVisible();
    await expect(pickerPanel(page)).toBeHidden();
    await expect(page.locator('.devpick__scrim')).toBeHidden();
  });

  test('универсальный Brick Game — обычная модель с производителем «Brick Game»; страница без параметра открывает его', async ({ page }) => {
    await visit(page, './');
    await expect(pickerTrigger(page).locator('.devpick__maker')).toHaveText('Brick Game');
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Универсальный');
    await openPicker(page);
    await expect(pickerCard(page, 'brickgame')).toHaveAttribute('aria-current', 'page');
    // Нет закреплённого блока, разделителей и отдельной «универсальной» кнопки: все модели — карточки одной сетки.
    await expect(page.locator('.devpick__list > li')).toHaveCount(13);
    await expect(page.locator('.devpick__card')).toHaveCount(13);
  });

  test('панель стоит на месте карусели: центр над консолью, консоль не сдвигается и страница не прокручивается при открытии', async ({ page }) => {
    for (const [width, height] of [[1440, 820], [820, 1100], [390, 800]] as const) {
      await page.setViewportSize({ width, height });
      await visit(page, marioUrl('?view=full'));
      const scrollBefore = await page.evaluate(() => document.documentElement.scrollHeight);
      const toyBefore = await rect(page, '#toy');
      const barBefore = await rect(page, '.devpick__trigger');
      expect(Math.abs(barBefore.x + barBefore.width / 2 - (toyBefore.x + toyBefore.width / 2)), `${width}: центр панели над консолью`).toBeLessThan(width < 600 ? 40 : 2);
      expect(barBefore.y + barBefore.height).toBeLessThanOrEqual(toyBefore.y + 1);
      await openPicker(page);
      expect(await rect(page, '#toy')).toEqual(toyBefore);
      expect(await rect(page, '.devpick__trigger')).toEqual(barBefore);
      const panel = await rect(page, '.devpick__panel');
      expect(panel.y, `${width}: каталог выпадает вниз`).toBeGreaterThanOrEqual(barBefore.y + barBefore.height);
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(width);
      expect(panel.y + panel.height).toBeLessThanOrEqual(height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollHeight), `${width}: открытый каталог не удлиняет страницу`).toBe(scrollBefore);
      await closePicker(page);
      expect(await rect(page, '#toy')).toEqual(toyBefore);
    }
  });
});

test.describe('каталог устройств: содержимое', () => {
  test('заголовок, число моделей, закрытие, поиск и категории «Все | Apollo | TAKSUN | Brick Game» без фильтров по готовности', async ({ page }) => {
    await visit(page, marioUrl(''));
    await openPicker(page);
    const panel = pickerPanel(page);
    await expect(panel.getByRole('heading', { name: 'Коллекция устройств' })).toBeVisible();
    await expect(panel.locator('.devpick__count')).toHaveText('13 моделей');
    await expect(panel.locator('.devpick__close')).toBeVisible();
    await expect(panel.getByRole('searchbox')).toHaveCount(1);
    await expect(panel.getByRole('tab')).toHaveText(['Все', 'Apollo', 'TAKSUN', 'Brick Game']);
    await expect(panel.getByRole('tab', { name: 'Все' })).toHaveAttribute('aria-selected', 'true');
    await expect(panel).not.toContainText(/Играбельные|В разработке|Экспонаты/);
    await expect(page.locator('.devpick__card')).toHaveCount(13);
  });

  test('каждое устройство показывает производителя, модель, значок готовности и настоящую миниатюру', async ({ page }) => {
    await visit(page, marioUrl(''));
    await openPicker(page);
    const expected: Record<string, [string, string, string]> = {
      mario: ['Apollo', 'Crocodile Mario', 'playable'],
      clock99: ['Apollo', 'Часы+99', 'playable'],
      seabattle: ['Apollo', 'Морской бой', 'playable'],
      tank168: ['Apollo', '168 в 1 танк', 'playable'],
      'apollo-b0202': ['Apollo', 'B0202 · 126 in 1', 'reconstructing'],
      'apollo-b0302': ['Apollo', 'B0302 · 18 in 1', 'reconstructing'],
      taksun: ['TAKSUN', 'TS-995 · 9999 in 1', 'shell'],
      brickgame: ['Brick Game', 'Универсальный', 'playable'],
      e88: ['Brick Game', 'E-88 · 8 in 1', 'reconstructing'],
      e23: ['Brick Game', 'E-23 · 96 in 1', 'reconstructing'],
      // Если другой бренд не установлен, модель считается Brick Game: пометки «бренд не подтверждён» нет.
      alibaba: ['Brick Game', 'Alibaba Dance 99 in 1', 'shell'],
      minibrick: ['Brick Game', 'Mini Brick Game B‑S96', 'reconstructing'],
    };
    const label = { playable: 'Можно играть', reconstructing: 'Восстанавливается', shell: 'Только корпус' } as const;
    for (const [id, [maker, model, ready]] of Object.entries(expected)) {
      const card = pickerCard(page, id);
      await expect(card.locator('.devpick__maker')).toHaveText(maker);
      await expect(card.locator('.devpick__model')).toHaveText(model);
      await expect(card).toHaveAttribute('data-ready', ready);
      await expect(card.locator('.devpick__ready')).toHaveAttribute('aria-label', label[ready as keyof typeof label]);
      await expect(card.locator('.devpick__ready')).toHaveAttribute('title', new RegExp(`^${label[ready as keyof typeof label]}\\.`));
      await expect(card.locator('svg.devpick__icon')).toBeVisible();
      await expect(card.locator('.visually-hidden')).toHaveText(label[ready as keyof typeof label]);
    }
    await expect(page.locator('.devpick__legend li')).toHaveText(['Можно играть', 'Восстанавливается', 'Только корпус']);
  });

  test('поиск по производителю, названию и обозначению; пустая выдача и очистка', async ({ page }) => {
    await visit(page, marioUrl(''));
    await openPicker(page);
    const search = pickerPanel(page).getByRole('searchbox');
    const shown = page.locator('.devpick__item:not([hidden]) .devpick__card');
    await search.fill('apollo');
    await expect(shown).toHaveCount(6);
    await search.fill('B0202');
    await expect(shown).toHaveCount(1);
    await expect(shown.first()).toHaveAttribute('data-toy', 'apollo-b0202');
    await search.fill('e 88');
    await expect(shown.first()).toHaveAttribute('data-toy', 'e88');
    await search.fill('морской');
    await expect(shown.first()).toHaveAttribute('data-toy', 'seabattle');
    await search.fill('zzzz');
    await expect(shown).toHaveCount(0);
    await expect(page.locator('.devpick__empty')).toHaveText('Ничего не найдено');
    await search.fill('');
    await expect(shown).toHaveCount(13);
    await expect(page.locator('.devpick__empty')).toBeHidden();
  });

  test('категории: «Все» по умолчанию, Apollo — 6, TAKSUN — 1, Brick Game — 5; открытие всегда сбрасывает фильтр', async ({ page }) => {
    await visit(page, marioUrl(''));
    await openPicker(page);
    const shown = page.locator('.devpick__item:not([hidden]) .devpick__card');
    const ids = () => shown.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['toy']));
    const tab = (name: string) => pickerPanel(page).getByRole('tab', { name, exact: true });
    await tab('Apollo').click();
    await expect(tab('Apollo')).toHaveAttribute('aria-selected', 'true');
    await expect(shown).toHaveCount(6);
    await tab('TAKSUN').click();
    await expect(shown).toHaveCount(1);
    expect(await ids()).toEqual(['taksun']);
    await tab('Brick Game').click();
    await expect(shown).toHaveCount(6);
    expect(await ids()).toEqual(['brickgame', 'alibaba', 'minibrick', 'e88', 'e23', 'fm38']);
    await tab('Все').click();
    await expect(shown).toHaveCount(13);
    // Категория и поиск работают вместе; пустой поиск в категории — «Ничего не найдено».
    await tab('Apollo').click();
    await pickerPanel(page).getByRole('searchbox').fill('b0202');
    await expect(shown).toHaveCount(1);
    await pickerPanel(page).getByRole('searchbox').fill('taksun');
    await expect(shown).toHaveCount(0);
    await expect(page.locator('.devpick__empty')).toHaveText('Ничего не найдено');
    await closePicker(page);
    await openPicker(page);
    await expect(tab('Все')).toHaveAttribute('aria-selected', 'true');
    await expect(pickerPanel(page).getByRole('searchbox')).toHaveValue('');
    await expect(shown).toHaveCount(13);
  });

  test('бренд и готовность из админки применяются: пустая категория показывает пояснение, значок и порядок следуют настройкам', async ({ page }) => {
    await withCatalog(page, { taksun: { brand: 'brickgame' }, minibrick: { readiness: 'playable' }, alibaba: { brand: 'apollo' } });
    await visit(page, marioUrl(''));
    await openPicker(page);
    const shown = page.locator('.devpick__item:not([hidden]) .devpick__card');
    await pickerPanel(page).getByRole('tab', { name: 'TAKSUN', exact: true }).click();
    await expect(shown).toHaveCount(0);
    await expect(page.locator('.devpick__empty')).toHaveText('В этой категории пока нет моделей');
    await pickerPanel(page).getByRole('tab', { name: 'Apollo', exact: true }).click();
    await expect(shown).toHaveCount(7);
    await expect(pickerCard(page, 'alibaba').locator('.devpick__maker')).toHaveText('Apollo');
    await expect(pickerCard(page, 'taksun').locator('.devpick__maker')).toHaveText('Brick Game');
    await expect(pickerCard(page, 'minibrick')).toHaveAttribute('data-ready', 'playable');
    await expect(pickerCard(page, 'minibrick').locator('.devpick__ready')).toHaveAttribute('aria-label', 'Можно играть');
  });
});

test.describe('каталог устройств: открытие, закрытие и выбор', () => {
  test('Escape, повторное нажатие, кнопка закрытия и клик мимо закрывают каталог; выбранная модель остаётся', async ({ page }) => {
    await visit(page, marioUrl('?view=full'));
    for (const how of ['escape', 'trigger', 'close', 'outside'] as const) {
      await openPicker(page);
      await expect(pickerTrigger(page)).toHaveAttribute('aria-expanded', 'true');
      if (how === 'escape') await page.keyboard.press('Escape');
      else if (how === 'trigger') await pickerTrigger(page).click();
      else if (how === 'close') await pickerPanel(page).locator('.devpick__close').click();
      else await page.mouse.click(8, 600);
      await expect(pickerPanel(page)).toBeHidden();
      await expect(pickerTrigger(page)).toHaveAttribute('aria-expanded', 'false');
      await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Crocodile Mario');
      if (how !== 'outside') await expect(pickerTrigger(page)).toBeFocused();
    }
    await expect(page).toHaveURL(/toy=mario/);
  });

  test('клик мимо только закрывает каталог: кнопки игрушки под ним не нажимаются', async ({ page }) => {
    await visit(page, marioUrl('?view=full'));
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
    await openPicker(page);
    await pickerPanel(page).getByRole('searchbox').fill('zzzz'); // пустая выдача: панель короткая и открывает кнопки консоли под собой
    const panel = await rect(page, '.devpick__panel');
    const onoff = await rect(page, '#base [data-key=onoff]');
    const point = { x: onoff.x + onoff.width / 2, y: onoff.y + onoff.height / 2 };
    expect(point.y, 'кнопка ON/OFF видна под короткой панелью').toBeGreaterThan(panel.y + panel.height);
    await page.mouse.click(point.x, point.y);
    await expect(pickerPanel(page)).toBeHidden();
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
    await page.mouse.click(point.x, point.y); // второй клик — уже по кнопке
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  });

  test('колесо над открытым каталогом не прокручивает страницу под ним, список прокручивается сам', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await visit(page, marioUrl('?view=full'));
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
    await openPicker(page);
    await page.mouse.move(195, 10);
    await page.mouse.wheel(0, 400); // над шапкой панели и над затемнением
    const head = await rect(page, '.devpick__head');
    await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const scroll = await rect(page, '.devpick__scroll');
    await page.mouse.move(scroll.x + scroll.width / 2, scroll.y + scroll.height / 2);
    await page.mouse.wheel(0, 3000);
    await expect.poll(() => page.locator('.devpick__scroll').evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0); // даже на конце списка прокрутка не передаётся странице
  });

  test('выбор модели: каталог закрывается, игрушка меняется без перезагрузки, адрес, история и панель обновляются', async ({ page }) => {
    await visit(page, marioUrl('?view=full'));
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await page.evaluate(() => ((window as unknown as { __alive?: number }).__alive = 1));
    await chooseToy(page, 'clock99');
    await expect(page).toHaveURL(/\?toy=clock99/);
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'clock99');
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Часы+99');
    await expect(pickerTrigger(page).locator('.devpick__maker')).toHaveText('Apollo');
    expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive)).toBe(1); // страница не перезагружалась
    await chooseToy(page, 'minibrick');
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Mini Brick Game B‑S96');
    await expect(pickerTrigger(page).locator('.devpick__maker')).toHaveText('Brick Game');
    await expect(pickerTrigger(page).locator('.devpick__ready')).toHaveAttribute('aria-label', 'Восстанавливается');
    // «Назад» и «вперёд» возвращают модели и панель.
    await page.goBack();
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Часы+99');
    await page.goBack();
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Crocodile Mario');
    await page.goForward();
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Часы+99');
    expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive)).toBe(1);
  });

  test('«назад» браузера закрывает открытый каталог и показывает прежнюю модель', async ({ page }) => {
    await visit(page, marioUrl('?view=full'));
    await chooseToy(page, 'tank168');
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('168 в 1 танк');
    await openPicker(page);
    await page.goBack();
    await expect(pickerPanel(page)).toBeHidden();
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Crocodile Mario');
  });

  test('текущая модель выбирается повторно без ошибок: каталог закрывается, адрес не меняется', async ({ page }) => {
    await visit(page, './?toy=e88');
    await openPicker(page);
    await pickerCard(page, 'e88').click();
    await expect(pickerPanel(page)).toBeHidden();
    await expect(page).toHaveURL(/toy=e88/);
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'e88');
  });

  test('ссылки карточек — обычные: щелчок с модификатором не перехватывается и каталог остаётся', async ({ page }) => {
    await visit(page, marioUrl(''));
    await openPicker(page);
    const prevented = await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>('.devpick__card[data-toy="tank168"]')!;
      const probe = (event: Event): void => event.preventDefault(); // страница не должна уйти
      document.addEventListener('click', probe);
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
      link.dispatchEvent(event);
      document.removeEventListener('click', probe);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true); // отменил только пробник выше; обработчик каталога событие не трогал
    await expect(pickerPanel(page)).toBeVisible();
    await expect(pickerTrigger(page)).toHaveAttribute('data-toy', 'mario');
    await expect(page).toHaveURL(/toy=mario/);
  });
});

test.describe('каталог устройств: ввод', () => {
  test('пока каталог открыт, клавиши не доходят до игры; зажатое сбрасывается; после закрытия ввод возвращается', async ({ page }) => {
    await visit(page, './?toy=brickgame&power=on&view=full');
    await expect(page.locator('#game-area')).toHaveAttribute('data-boot', 'off');
    const pressed = page.locator('#base [data-pressed]');
    await page.locator('#game-area').focus();
    await page.keyboard.down('ArrowLeft');
    await expect(page.locator('#base [data-key=left]')).toHaveAttribute('data-pressed', '');
    await openPicker(page);
    await expect(pressed).toHaveCount(0); // зажатая клавиша сброшена при открытии
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowUp'); // стрелки здесь двигают фокус по карточкам, а не игру
    await expect(pressed).toHaveCount(0);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.press('Escape');
    await expect(pickerPanel(page)).toBeHidden();
    await expect(pressed).toHaveCount(0); // после закрытия ничего не удерживается
    await page.locator('#game-area').focus();
    await page.keyboard.down('ArrowRight');
    await expect(page.locator('#base [data-key=right]')).toHaveAttribute('data-pressed', '');
    await page.keyboard.up('ArrowRight');
  });

  test('клавиатура: стрелка вниз открывает каталог, фокус на текущей карточке, стрелки и Home/End двигают по сетке, Enter и пробел выбирают', async ({ page }) => {
    await visit(page, marioUrl('?view=full'));
    await pickerTrigger(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(pickerPanel(page)).toBeVisible();
    const focusedToy = (): Promise<string | undefined> => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['toy']);
    await expect.poll(focusedToy).toBe('mario');
    await page.keyboard.press('ArrowRight');
    await expect.poll(focusedToy).toBe('clock99');
    await page.keyboard.press('End');
    await expect.poll(focusedToy).toBe('fm38');
    await page.keyboard.press('Home');
    await expect.poll(focusedToy).toBe('brickgame'); // универсальный стоит в каталоге первым
    await page.keyboard.press('ArrowUp'); // из первой строки — в поле поиска
    await expect(pickerPanel(page).getByRole('searchbox')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect.poll(focusedToy).toBe('brickgame');
    await page.keyboard.press('ArrowRight');
    await expect.poll(focusedToy).toBe('mario');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(pickerPanel(page)).toBeHidden();
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'clock99');
    await openPicker(page);
    await expect.poll(focusedToy).toBe('clock99');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(pickerPanel(page)).toBeHidden();
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'seabattle');
  });

  test('категории переключаются стрелками, поиск по Enter передаёт фокус первой карточке', async ({ page }) => {
    await visit(page, marioUrl(''));
    await openPicker(page);
    const tabs = pickerPanel(page).getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    const search = pickerPanel(page).getByRole('searchbox');
    await search.fill('универс');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['toy'])).toBe('brickgame');
  });

  test('Tab с последней карточки уводит фокус из каталога и закрывает его; фокус вне каталога не остаётся «под» ним', async ({ page }) => {
    await visit(page, marioUrl('?view=full'));
    await openPicker(page);
    await page.keyboard.press('End');
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['toy'])).toBe('fm38');
    await page.keyboard.press('Tab');
    await expect(pickerPanel(page)).toBeHidden();
    await expect(page.locator('.devpick__scrim')).toBeHidden();
  });
});

test.describe('каталог устройств: язык и движение', () => {
  test('английский интерфейс: подписи, категории, счётчик и значки; названия брендов не переводятся', async ({ page }) => {
    await withCatalog(page, { taksun: { brand: 'brickgame' } }); // TAKSUN без моделей: показывается пояснение пустой категории
    await visit(page, './?toy=brickgame');
    await page.locator('#corner-lang').click();
    await expect(pickerTrigger(page).locator('.devpick__model')).toHaveText('Universal');
    await expect(pickerTrigger(page).locator('.devpick__maker')).toHaveText('Brick Game');
    await openPicker(page);
    const panel = pickerPanel(page);
    await expect(panel.getByRole('heading')).toHaveText('Device collection');
    await expect(panel.locator('.devpick__count')).toHaveText('13 models');
    await expect(panel.getByRole('tab')).toHaveText(['All', 'Apollo', 'TAKSUN', 'Brick Game']);
    await expect(pickerCard(page, 'alibaba').locator('.devpick__maker')).toHaveText('Brick Game');
    await expect(pickerCard(page, 'mario').locator('.devpick__ready')).toHaveAttribute('aria-label', 'Playable');
    await panel.getByRole('tab', { name: 'TAKSUN' }).click();
    await expect(page.locator('.devpick__empty')).toHaveText('No models in this category yet');
    await expect(pickerTrigger(page)).toHaveAttribute('aria-label', /^Device: Brick Game Universal/);
  });

  test('prefers-reduced-motion отключает анимацию; иначе каталог появляется коротким плавным переходом', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' }); // по умолчанию в smoke-тестах движение отключено
    await visit(page, './?toy=brickgame');
    await openPicker(page);
    const name = (): Promise<string> => pickerPanel(page).evaluate((node) => getComputedStyle(node).animationName);
    expect(await name()).not.toBe('none');
    await closePicker(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPicker(page);
    expect(await name()).toBe('none');
  });
});

// Каталог широкий и компактный: колонок столько, сколько помещается карточек не уже 176px; на телефоне — одна.
for (const [width, height, columns] of [[1440, 820, 6], [1024, 800, 5], [768, 1024, 3], [390, 664, 1], [320, 568, 1]] as const) {
  test(`${width}×${height}: 15 моделей помещаются без горизонтальной прокрутки, колонок: ${columns}, список прокручивается внутри каталога`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await visit(page, './?toy=brickgame');
    await page.addStyleTag({ content: "*{font-family:'DejaVu Sans',sans-serif !important}" }); // «худший» шрифт CI-раннера
    const scrollBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    await openPicker(page);
    // Каталог должен остаться управляемым при росте коллекции: достраиваем сетку до 15 карточек копиями существующих.
    await page.evaluate(() => {
      const list = document.querySelector('.devpick__list')!;
      const items = [...list.children];
      for (let i = 0; list.children.length < 15; i += 1) {
        const copy = items[i % items.length]!.cloneNode(true) as HTMLElement;
        copy.querySelector('.devpick__card')?.removeAttribute('data-toy');
        list.append(copy);
      }
    });
    const scroll = page.locator('.devpick__scroll');
    expect(await scroll.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight), 'страница не удлиняется').toBe(scrollBefore);
    const cards = await page.locator('.devpick__card').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON() as { x: number; right: number; width: number }));
    expect(new Set(cards.map((card) => Math.round(card.x))).size, 'число колонок').toBe(columns);
    const panel = await rect(page, '.devpick__panel');
    for (const card of cards) {
      expect(card.x).toBeGreaterThanOrEqual(panel.x - 1);
      expect(card.right).toBeLessThanOrEqual(panel.x + panel.width + 1);
    }
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(height);
    // Названия не вылезают из карточек (длинные уходят в многоточие или переносятся внутри).
    expect(await page.locator('.devpick__label').evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
    // На телефоне 15 карточек в одну колонку не помещаются в окно: список прокручивается внутри каталога, а не страница.
    if (width <= 390) {
      expect(await scroll.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      await scroll.evaluate((node) => (node.scrollTop = node.scrollHeight));
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
  });
}

test('на телефоне с экранной клавиатурой каталог укладывается в видимую часть окна', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await visit(page, './?toy=brickgame');
  await openPicker(page);
  // Клавиатура уменьшает видимую область: имитируем сжатием окна, как это делает visualViewport на Android.
  await page.setViewportSize({ width: 390, height: 460 });
  await expect.poll(async () => {
    const panel = await rect(page, '.devpick__panel');
    return panel.y + panel.height <= 460;
  }).toBe(true);
  await expect(pickerPanel(page).getByRole('searchbox')).toBeVisible();
  await expect(pickerPanel(page).locator('.devpick__close')).toBeVisible();
});
