import { expect, test, type Page } from '@playwright/test';

/**
 * Четвёртая игрушка «168 в 1 танк», переключение игрушек на месте (без перезагрузки страницы: цвет, вид и питание сохраняются, шапка и каркас
 * не перерисовываются, обработчики прежней игрушки снимаются) и панель «Цвет» — четыре цвета всегда, неподтверждённые недоступны.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const key = (page: Page, id: string) => page.locator(`[data-key="${id}"]`);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

/** Страница игрушки загружена и ждёт старта (вспышка сегментов при включении у тетриса закончилась). */
async function ready(page: Page, query: string): Promise<void> {
  await page.goto(`./${query}`);
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(() => area(page, 'boot').then((boot) => boot !== 'on')).toBe(true);
}

/** Переход на игрушку через переключатель в шапке и ожидание, пока она запустилась. */
async function switchTo(page: Page, toy: string): Promise<void> {
  await page.locator(`.toysw__item[data-toy="${toy}"]`).click();
  if (toy === 'mario') await expect(page.locator('body')).not.toHaveAttribute('data-toy', /.+/);
  else await expect(page.locator('body')).toHaveAttribute('data-toy', toy);
  await expect(page.locator(`.toysw__item[data-toy="${toy}"]`)).toHaveAttribute('aria-current', 'page');
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(() => area(page, 'boot').then((boot) => boot !== 'on')).toBe(true);
  if (toy !== 'mario') await expect(page.locator('#toy')).toHaveAttribute('data-model', toy);
}

const shell = (page: Page): Promise<string | null> => page.locator('#toy').getAttribute('data-shell');
const pickerState = (page: Page): Promise<string[]> =>
  page.locator('#shell-picker .shellpick__btn').evaluateAll((buttons) => buttons.map((b) => `${b.getAttribute('data-shell')}${b.getAttribute('aria-disabled') === 'true' ? ':off' : ''}`));

test.describe('«168 в 1 танк»', () => {
  test('аппаратная часть: кнопки как у «Морского боя», рамка с завитками и светодиоды как у «Часов+99», наклейка, танк на панели; красный по умолчанию', async ({ page }) => {
    await ready(page, '?toy=tank168&power=on&seed=7');
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'tank168');
    await expect(page.locator('#toy')).toHaveAttribute('data-deco', 'flourish');
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'red'); // синего у игрушки нет: из настроек (синий) берётся её цвет по умолчанию
    await expect(page).toHaveTitle('168 в 1 танк — Apollo');
    const labels = await page.locator('.base__art text').allTextContents();
    for (const text of ['ON/OFF', 'S./P.', 'MUTE', 'RESET', 'UP/MODE', 'LEFT/LEVEL', 'RIGHT/SPEED', 'DOWN', 'ROTATE']) expect(labels, text).toContain(text);
    expect(labels).not.toContain('SOUND');
    await expect(page.locator('.lid__leds')).toBeVisible();
    await expect(page.locator('.deco__flourish')).toHaveCount(4);
    const sticker = page.locator('.base__sticker');
    await expect(sticker).toHaveAttribute('src', /sticker-tank168\.webp$/);
    expect(await sticker.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.base__logo')).toHaveCount(0);
    // Матрица 10 × 20 на портретном экране.
    const win = await page.locator('#lcd-window').boundingBox();
    if (!win) throw new Error('нет окна LCD');
    expect(win.width / win.height).toBeCloseTo(264 / 320, 1);
  });

  test('меню консоли: ROTATE листает игры, UP/DOWN — варианты, LEFT — уровень, RIGHT — скорость; S./P. запускает, RESET возвращает в меню; на экране рисуется матрица', async ({ page }) => {
    await ready(page, '?toy=tank168&power=on&seed=7');
    const menu = async (): Promise<string> => (await Promise.all(['menu', 'symbol', 'mode', 'speed', 'level', 'phase'].map((name) => area(page, name)))).join(' ');
    await expect.poll(menu).toBe('menu 1 1 0 0 ready'); // знак игры 1 (танки), вариант 01, скорость и уровень 0
    await key(page, 'jump').click(); // ROTATE — следующая игра
    await expect.poll(menu).toBe('menu 2 1 0 0 ready');
    await key(page, 'up').click(); // UP/MODE — следующий вариант
    await expect.poll(menu).toBe('menu 2 2 0 0 ready');
    await key(page, 'down').click(); // DOWN — предыдущий
    await expect.poll(menu).toBe('menu 2 1 0 0 ready');
    await key(page, 'left').click(); // LEFT/LEVEL
    await key(page, 'right').click(); // RIGHT/SPEED
    await key(page, 'right').click();
    await expect.poll(menu).toBe('menu 2 1 2 1 ready');
    expect(await area(page, 'game')).toBe('frog');
    const painted = async (): Promise<number> =>
      page.evaluate(() => {
        const canvas = document.getElementById('screen') as HTMLCanvasElement;
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        if (data) for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) count++;
        return count;
      });
    expect(await painted()).toBeGreaterThan(1000); // знак, номер варианта и картинка игры нарисованы на матрице
    await key(page, 'sp').click(); // S./P. запускает выбранную игру
    await expect.poll(phase(page)).toBe('playing');
    expect(await area(page, 'menu')).toBe('game');
    await key(page, 'sp').click(); // он же ставит на паузу
    await expect.poll(phase(page)).toBe('paused');
    await key(page, 'fire').click(); // RESET — в меню; выбор игры, варианта, скорости и уровня остаётся
    await expect.poll(menu).toBe('menu 2 1 2 1 ready');
    expect(await painted()).toBeGreaterThan(1000);
  });

  test('цвета: красный и жёлтый; на жёлтом надписи зелёные, на красном светлые (по фото)', async ({ page }) => {
    await ready(page, '?toy=tank168&power=on');
    await page.locator('#shell-picker [data-shell="yellow"]').click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'yellow');
    const label = (): Promise<string> => page.locator('#toy').evaluate((el) => getComputedStyle(el).getPropertyValue('--label').trim());
    expect(await label()).toBe('#2b8a4e');
    await page.locator('#shell-picker [data-shell="red"]').click();
    expect(await label()).not.toBe('#2b8a4e');
  });

  test('справка: набор игр «168 в 1 танк» по списку владельца (девять игр меню); восстановлены все девять, правила — по открытому симулятору', async ({ page }) => {
    await ready(page, '?toy=tank168&power=on');
    await page.locator('#corner-help').click();
    const games = page.locator('#help .games__row');
    await expect(games).toHaveCount(9);
    expect(await games.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset['game']))).toEqual([
      'tank', 'frog', 'racing', 'racing-shooting', 'shooting-array', 'shooting-figures', 'construction', 'tetris', 'tetris-pentix',
    ]);
    expect(await games.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset['status']))).toEqual(Array(9).fill('ready'));
    await expect(page.locator('#help .games__row[data-game="tetris"]')).toContainText('есть (приближённо)');
    await expect(page.locator('#help .games__row[data-game="tetris"] .games__name')).toHaveText('8. Тетрис (51)'); // знак игры в меню и число вариантов
    await expect(page.locator('#help .games__row[data-game="tank"] .games__name')).toHaveText('1. Танки (5)');
    await expect(page.locator('#help .games__row[data-game="racing"] .games__name')).toHaveText('3. Гонки');
    await expect(page.locator('#help #device-games')).toContainText('168');
    await expect(page.locator('#help')).toContainText('ROTATE выбирает игру'); // как листается меню
    await page.keyboard.press('Escape');
  });

  test('слева справка с наклейкой этой игрушки', async ({ page }) => {
    await ready(page, '?toy=tank168&power=on');
    await expect(page.locator('#side-info .about__logo')).toHaveAttribute('src', /sticker-tank168/);
    await expect(page.locator('#side-info #keymap')).toContainText('ROTATE');
    await expect(page.locator('#side-info')).toContainText('Игры на устройстве'); // набор игр консоли — вкладками
    await expect(page.locator('#side-info')).not.toContainText('заявлено 168'); // надпись про 168 убрана (на наклейке 168 и так напечатано)
  });
});

test.describe('панель «Цвет»', () => {
  const EXPECTED: Record<string, string[]> = {
    mario: ['blue', 'red', 'yellow', 'white'],
    clock99: ['blue:off', 'red', 'yellow', 'white'],
    seabattle: ['blue', 'red', 'yellow:off', 'white:off'],
    tank168: ['blue:off', 'red', 'yellow', 'white:off'],
  };

  test('называется «Цвет», кнопок всегда четыре в одном порядке, цвета без фото оригинала недоступны', async ({ page }) => {
    for (const toy of Object.keys(EXPECTED)) {
      await ready(page, toy === 'mario' ? '?power=on' : `?toy=${toy}&power=on`);
      await expect(page.locator('#side-ctl').getByRole('heading', { name: 'Цвет', exact: true })).toBeVisible();
      await expect(page.locator('#side-ctl').getByRole('heading', { name: 'Вид', exact: true })).toHaveCount(0);
      expect(await pickerState(page), toy).toEqual(EXPECTED[toy]);
    }
  });

  test('недоступный цвет не выбирается ни щелчком, ни стрелками; название и подсказка объясняют почему', async ({ page }) => {
    await ready(page, '?toy=tank168&power=on');
    const white = page.locator('#shell-picker [data-shell="white"]');
    await expect(white).toHaveAttribute('aria-disabled', 'true');
    await expect(white).toHaveAttribute('title', /такого цвета нет/);
    await white.click({ force: true });
    expect(await shell(page)).toBe('red');
    // Стрелки обходят только доступные цвета: красный → жёлтый → красный.
    await page.locator('#shell-picker [data-shell="red"]').focus();
    await page.keyboard.press('ArrowRight');
    expect(await shell(page)).toBe('yellow');
    await page.keyboard.press('ArrowRight');
    expect(await shell(page)).toBe('red');
  });

  test('панель цвета на английском: заголовок Colour', async ({ page }) => {
    await ready(page, '?power=on');
    await page.locator('#corner-lang').click();
    await expect(page.locator('#side-ctl').getByRole('heading', { name: 'Colour', exact: true })).toBeVisible();
  });
});

test.describe('переключение игрушек на месте', () => {
  test('страница не перезагружается: окно, шапка и каркас те же, адрес и заголовок меняются, «назад» возвращает прежнюю игрушку', async ({ page }) => {
    await ready(page, '?power=on&view=full');
    await page.evaluate(() => {
      (window as unknown as { __alive: string }).__alive = 'да';
      document.getElementById('brand')?.setAttribute('data-mark', 'тот же');
      document.getElementById('lid')?.setAttribute('data-mark', 'тот же');
    });
    const alive = () => page.evaluate(() => ({ alive: (window as unknown as { __alive?: string }).__alive, brand: document.getElementById('brand')?.dataset['mark'], lid: document.getElementById('lid')?.dataset['mark'], loads: performance.getEntriesByType('navigation').length }));
    await switchTo(page, 'clock99');
    await expect(page).toHaveURL(/\?toy=clock99$/);
    await expect(page).toHaveTitle('Часы+99 — Apollo');
    expect(await alive()).toEqual({ alive: 'да', brand: 'тот же', lid: 'тот же', loads: 1 });
    await switchTo(page, 'tank168');
    await switchTo(page, 'mario');
    await expect(page).not.toHaveURL(/toy=/);
    await expect(page).toHaveTitle('Crocodile Mario');
    expect(await alive()).toEqual({ alive: 'да', brand: 'тот же', lid: 'тот же', loads: 1 });
    // История: «назад» — к «168 в 1 танк», ещё раз — к «Часам+99», «вперёд» — снова к «168 в 1 танк»; всё без перезагрузки.
    await page.goBack();
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'tank168');
    await expect.poll(phase(page)).toBe('ready');
    await page.goBack();
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'clock99');
    await page.goForward();
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'tank168');
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'tank168');
    expect((await alive()).alive).toBe('да');
  });

  test('цвет, вид и питание сохраняются; цвета, которого нет у игрушки, выбор не теряет — следующая, где он есть, возвращает его', async ({ page }) => {
    await ready(page, '?power=on&view=screen');
    await page.locator('#shell-picker [data-shell="yellow"]').click();
    expect(await shell(page)).toBe('yellow');
    await switchTo(page, 'tank168');
    expect(await shell(page)).toBe('yellow');
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
    await switchTo(page, 'seabattle'); // жёлтого нет — игрушка открывается красной
    expect(await shell(page)).toBe('red');
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
    await switchTo(page, 'clock99'); // а здесь жёлтый снова есть — выбор игрока вернулся
    expect(await shell(page)).toBe('yellow');
    await page.locator('#shell-picker [data-shell="white"]').click(); // новый выбор на самой странице
    await switchTo(page, 'tank168'); // белого нет — красный
    expect(await shell(page)).toBe('red');
    await switchTo(page, 'mario'); // белый вернулся
    expect(await shell(page)).toBe('white');
  });

  test('закрытая выключенная игрушка остаётся закрытой и выключенной; сменилась наклейка на подбородке', async ({ page }) => {
    await page.goto('./');
    await expect.poll(phase(page)).toBe('ready');
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
    await switchTo(page, 'tank168');
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
    await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
    await expect(page.locator('#lid-cover')).toBeVisible();
    await expect(page.locator('.base__sticker')).toHaveAttribute('src', /sticker-tank168/);
    await switchTo(page, 'mario');
    await expect(page.locator('.base__sticker')).toHaveCount(0);
    await expect(page.locator('.base__logo--color, .base__logo--white').first()).toBeAttached();
  });

  test('игра у новой игрушки своя и свежая; управление не двоится: клавиша M, смена языка, фона и сегментов срабатывают по одному разу', async ({ page }) => {
    await ready(page, '?power=on&view=full');
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    await switchTo(page, 'clock99');
    await switchTo(page, 'seabattle');
    await switchTo(page, 'mario');
    await switchTo(page, 'tank168');
    expect(await area(page, 'score')).toBe('0'); // новая партия: ни счёта, ни фигуры от прежней игрушки
    await expect(page.locator('#game-area')).toHaveAttribute('data-toy', 'tank168');
    // M — звук: один раз (иначе обработчики четырёх прежних игрушек переключили бы его чётное число раз).
    const sound = page.locator('#tgl-sound');
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('KeyM');
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('KeyM');
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    // Фон, сегменты и язык — угловое меню, элементы которого не заменялись.
    const theme = (): Promise<string | null> => page.locator('html').getAttribute('data-theme');
    const before = await theme();
    await page.locator('#corner-theme').click();
    expect(await theme()).not.toBe(before);
    await page.locator('#corner-theme').click();
    expect(await theme()).toBe(before);
    await expect(page.locator('#tgl-ghost')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#tgl-ghost').click();
    await expect(page.locator('#tgl-ghost')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#corner-lang').click();
    await expect(page.locator('#corner-lang')).toHaveAttribute('data-lang', 'en');
    await page.locator('#corner-lang').click();
    await expect(page.locator('#corner-lang')).toHaveAttribute('data-lang', 'ru');
    // Старт — Enter, один раз; поворот и сдвиг — тоже по одному шагу.
    await page.keyboard.press('Enter');
    await expect.poll(phase(page)).toBe('playing');
    await page.keyboard.press('KeyP');
    await expect.poll(phase(page)).toBe('paused');
  });

  test('диалоги — настройки и справка — открываются один раз и принадлежат новой игрушке', async ({ page }) => {
    await ready(page, '?power=on&view=full&debug');
    await switchTo(page, 'clock99');
    await switchTo(page, 'seabattle');
    await page.locator('#corner-help').click();
    await expect(page.locator('#help')).toBeVisible();
    await expect(page.locator('#help .games__row')).toHaveCount(6); // набор «Морского боя» (режимы A–F), а не «Часов+99»
    await expect(page.locator('#help .help__table th').first()).toHaveText('ON/OFF');
    await page.keyboard.press('Escape');
    await expect(page.locator('#help')).toBeHidden();
    await page.locator('#corner-settings').click();
    await expect(page.locator('#settings')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings')).toBeHidden();
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.id)).toBe('game-area'); // клавиатура вернулась игре
  });

  test('щелчок с Ctrl или Shift и средняя кнопка не перехватываются (остаётся обычная навигация браузера); обычный — перехватывается', async ({ page }) => {
    await ready(page, '?power=on');
    const hrefs = await page.locator('.toysw__item').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(hrefs.map((href) => href?.replace(/^.*\//, ''))).toEqual(['', '?toy=clock99', '?toy=seabattle', '?toy=tank168', '?toy=alibaba', '?toy=minibrick']);
    // Щелчок посылается событием: после обработчика переключателя фиксируем, отменено ли действие по умолчанию (и отменяем сами, чтобы страница не ушла).
    const prevented = await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>('.toysw__item[data-toy="tank168"]');
      if (!link) throw new Error('нет ссылки');
      const result: Record<string, boolean> = {};
      const probe = (event: Event): void => {
        result[(event as MouseEvent & { __case?: string }).__case ?? ''] = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener('click', probe); // после переключателя (он ниже по дереву)
      const fire = (name: string, init: MouseEventInit): void => {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
        (event as MouseEvent & { __case?: string }).__case = name;
        link.dispatchEvent(event);
      };
      fire('ctrl', { ctrlKey: true });
      fire('shift', { shiftKey: true });
      fire('meta', { metaKey: true });
      fire('middle', { button: 1 });
      document.removeEventListener('click', probe);
      return result;
    });
    expect(prevented).toEqual({ ctrl: false, shift: false, meta: false, middle: false });
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'mario'); // ничего не переключилось
    await expect(page).not.toHaveURL(/toy=/);
    // Обычный щелчок переключатель перехватывает: игрушка меняется на месте.
    await switchTo(page, 'tank168');
  });

  test('быстрые переключения подряд не ломают страницу: побеждает последний выбор', async ({ page }) => {
    await ready(page, '?power=on&view=full');
    for (const toy of ['clock99', 'seabattle', 'tank168', 'mario', 'clock99']) await page.locator(`.toysw__item[data-toy="${toy}"]`).click();
    await expect(page.locator('.toysw__item[aria-current="page"]')).toHaveAttribute('data-toy', 'clock99');
    await expect(page.locator('#toy')).toHaveAttribute('data-model', 'clock99');
    await expect.poll(phase(page)).toBe('ready');
    await expect(page).toHaveURL(/\?toy=clock99$/);
  });
});
