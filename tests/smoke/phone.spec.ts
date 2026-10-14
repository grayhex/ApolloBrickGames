import { expect, test, type Page } from '@playwright/test';

/**
 * Пульт для телефона: на узком экране в виде «только экран» кнопок корпуса нет, поэтому под экраном рисуются свои — четыре верхние
 * кнопки, крестовина, JUMP и FIRE. Касания — настоящие (CDP `Input.dispatchTouchEvent`, мультитач), чтобы проверить и захват пальца,
 * и «палец ведут по крестовине».
 */

const area = (page: Page, key: string): Promise<string> =>
  page.evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key);
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const num = (page: Page, key: string) => async (): Promise<number> => Number(await area(page, key));

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const savedPad = (page: Page): Promise<boolean | null | undefined> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('crocodile-mario:settings:v1') ?? '{}').display?.pad);

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`Нет элемента ${selector}`);
  return b;
}

/** Пальцы: настоящие касания через CDP; каждый палец — свой id, одновременно можно держать несколько. */
async function fingers(page: Page): Promise<{
  down(id: number, x: number, y: number): Promise<void>;
  move(id: number, x: number, y: number): Promise<void>;
  up(id: number): Promise<void>;
}> {
  const cdp = await page.context().newCDPSession(page);
  const points = new Map<number, { x: number; y: number }>();
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd'): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...points].map(([id, p]) => ({ id, x: p.x, y: p.y })) });
  return {
    down: async (id, x, y) => {
      points.set(id, { x, y });
      await send('touchStart');
    },
    move: async (id, x, y) => {
      points.set(id, { x, y });
      await send('touchMove');
    },
    up: async (id) => {
      points.delete(id);
      await send(points.size > 0 ? 'touchMove' : 'touchEnd');
    },
  };
}

/** Точка на крестовине: доли от её ширины и высоты (0,5 / 0,5 — центр). */
async function dpad(page: Page, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const b = await box(page, '#deck [data-pad-zone="dpad"]');
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const b = await box(page, selector);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Телефон в портрете: раскрыли крышку касанием, включили игру кнопкой ON/OFF на пульте, запустили S./P., дождались выхода героя. */
async function startOnPhone(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
  const cover = await center(page, '#lid-cover');
  await page.touchscreen.tap(cover.x, cover.y);
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen'); // на узком экране крышка раскрывается сразу в «только экран»
  const power = await center(page, '#deck [data-pad="onoff"]');
  await page.touchscreen.tap(power.x, power.y);
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect.poll(phase(page)).toBe('ready');
  const start = await center(page, '#deck [data-pad="sp"]');
  await page.touchscreen.tap(start.x, start.y);
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off');
}

test.describe('телефон в портрете', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('закрытая игрушка раскрывается касанием сразу в «только экран»: под экраном появляется пульт', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('#deck')).toBeHidden(); // пока крышка закрыта, пульта нет
    const cover = await center(page, '#lid-cover');
    await page.touchscreen.tap(cover.x, cover.y);
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
    await expect(page.locator('#deck')).toBeVisible();
    await expect(page.locator('#deck')).toHaveAttribute('aria-label', 'Кнопки для телефона');
    // «Полная» остаётся доступной, а в ней пульта нет (там настоящие кнопки корпуса).
    await page.locator('#view-full').scrollIntoViewIfNeeded();
    await page.locator('#view-full').tap();
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
    await expect(page.locator('#deck')).toBeHidden();
  });

  test('раскладка: пульт сразу под экраном, целиком в окне выше нижней панели браузера, кнопки крупные, горизонтальной прокрутки нет', async ({ page }) => {
    await page.goto('./?view=screen');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    const stage = await box(page, '#stage');
    const deck = await box(page, '#deck');
    expect(deck.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1); // не налезает на экран
    expect(deck.y).toBeLessThan(stage.y + stage.height + 30); // и стоит прямо под ним
    expect(deck.x).toBeGreaterThanOrEqual(0);
    expect(deck.x + deck.width).toBeLessThanOrEqual(390);
    expect(deck.y + deck.height).toBeLessThanOrEqual(844 - 60); // внизу браузер рисует свою панель — пульт заканчивается выше неё
    expect(deck.height).toBeGreaterThan(260);
    // Все управляющие элементы — не меньше 44 px (рекомендация для касаний).
    for (const selector of ['onoff', 'sp', 'sound', 'fire', 'jump'].map((id) => `#deck [data-pad="${id}"]`).concat(['#deck .pad--fire', '#deck [data-pad-zone="dpad"]'])) {
      const b = await box(page, selector);
      expect(b.width, selector).toBeGreaterThanOrEqual(44);
      expect(b.height, selector).toBeGreaterThanOrEqual(44);
    }
    // Расположение: верхний ряд из четырёх кнопок, под ним слева крестовина, справа JUMP и FIRE выше и левее JUMP.
    const top = await Promise.all(['onoff', 'sp', 'sound', 'fire'].map((id) => box(page, `#deck .deck__top [data-pad="${id}"]`)));
    for (let i = 1; i < top.length; i++) expect(top[i]?.x ?? 0).toBeGreaterThan((top[i - 1]?.x ?? 0) + 40);
    const pad = await box(page, '#deck [data-pad-zone="dpad"]');
    const jump = await box(page, '#deck .pad--jump');
    const fire = await box(page, '#deck .pad--fire');
    expect(pad.x + pad.width).toBeLessThan(jump.x);
    expect(pad.y).toBeGreaterThan((top[0]?.y ?? 0) + (top[0]?.height ?? 0));
    expect(fire.y + fire.height / 2).toBeLessThan(jump.y + jump.height / 2);
    expect(fire.x + fire.width / 2).toBeLessThan(jump.x + jump.width / 2);
    expect(jump.width).toBeGreaterThan(fire.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Цвет пульта — цвет игрушки.
    await page.locator('#shell-picker [data-shell="red"]').scrollIntoViewIfNeeded();
    await page.locator('#shell-picker [data-shell="red"]').tap();
    await expect(page.locator('#deck')).toHaveCSS('background-image', /rgb\(201, 45, 64\)/);
  });

  test('пока игрушка выключена, мерцает ON/OFF, остальные кнопки приглушены; ON/OFF включает, S./P. запускает игру', async ({ page }) => {
    await page.goto('./?view=screen');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
    await expect(page.locator('#deck .pad--jump')).toHaveCSS('opacity', '0.55');
    // ON/OFF привлекает внимание: мерцает ореолом (при «уменьшении движения», как в этих тестах, — ореол неподвижный).
    await expect(page.locator('#deck [data-pad="onoff"] .pad__dome')).toHaveCSS('filter', /drop-shadow/);
    const power = await center(page, '#deck [data-pad="onoff"]');
    await page.touchscreen.tap(power.x, power.y);
    await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
    await expect(page.locator('#deck .pad--jump')).toHaveCSS('opacity', '1');
    await expect(page.locator('#deck [data-pad="onoff"]')).not.toHaveAttribute('data-pressed', '');
    // SOUND на пульте — как на корпусе.
    await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'true');
    const sound = await center(page, '#deck [data-pad="sound"]');
    await page.touchscreen.tap(sound.x, sound.y);
    await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'false');
    await page.touchscreen.tap(sound.x, sound.y);
    await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'true');
    // S./P.: старт, пауза, продолжение.
    const sp = await center(page, '#deck [data-pad="sp"]');
    await page.touchscreen.tap(sp.x, sp.y);
    await expect.poll(phase(page)).toBe('playing');
    await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off');
    await page.touchscreen.tap(sp.x, sp.y);
    await expect.poll(phase(page)).toBe('paused');
    await expect(page.locator('#devices [data-device="pause"]')).toHaveAttribute('data-state', 'on'); // и индикатор паузы горит
    await page.touchscreen.tap(sp.x, sp.y);
    await expect.poll(phase(page)).toBe('playing');
    // Выключили — игра остановлена, кнопки снова приглушены.
    await page.touchscreen.tap(power.x, power.y);
    await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
    await expect(page.locator('#deck .pad--jump')).toHaveCSS('opacity', '0.55');
  });

  test('крестовина: палец вправо — идём вправо; не отрывая палец, влево — идём влево; отпустили — стоим; стрелки подсвечиваются', async ({ page }) => {
    await startOnPhone(page);
    const touch = await fingers(page);
    const arrow = (dir: string) => page.locator(`#deck [data-pad-dir="${dir}"]`);

    const x0 = await num(page, 'heroX')();
    const right = await dpad(page, 0.85, 0.5);
    await touch.down(1, right.x, right.y);
    await expect(arrow('right')).toHaveAttribute('data-pressed', '');
    await expect(arrow('left')).not.toHaveAttribute('data-pressed', '');
    await expect.poll(num(page, 'heroX'), { timeout: 4000 }).toBeGreaterThan(x0 + 1);

    // Палец скользит влево, не отрываясь: направление меняется.
    const x1 = await num(page, 'heroX')();
    const left = await dpad(page, 0.15, 0.5);
    await touch.move(1, left.x, left.y);
    await expect(arrow('left')).toHaveAttribute('data-pressed', '');
    await expect(arrow('right')).not.toHaveAttribute('data-pressed', '');
    await expect.poll(num(page, 'heroX'), { timeout: 4000 }).toBeLessThan(x1 - 1);

    // Центр — мёртвая зона: ничего не нажато.
    const centre = await dpad(page, 0.5, 0.5);
    await touch.move(1, centre.x, centre.y);
    await expect(arrow('left')).not.toHaveAttribute('data-pressed', '');
    // Диагональ «вправо + вверх» нажимает две стрелки сразу (прыжок вправо).
    const diagonal = await dpad(page, 0.85, 0.15);
    await touch.move(1, diagonal.x, diagonal.y);
    await expect(arrow('right')).toHaveAttribute('data-pressed', '');
    await expect(arrow('up')).toHaveAttribute('data-pressed', '');

    await touch.up(1);
    await expect(arrow('right')).not.toHaveAttribute('data-pressed', '');
    await expect(arrow('up')).not.toHaveAttribute('data-pressed', '');
    await page.waitForTimeout(400);
    const stopped = await num(page, 'heroX')();
    await page.waitForTimeout(500);
    expect(await num(page, 'heroX')()).toBe(stopped); // отпустили — герой стоит
  });

  test('JUMP и FIRE; мультитач: идём по крестовине и одновременно прыгаем и стреляем', async ({ page }) => {
    await startOnPhone(page);
    const touch = await fingers(page);
    // После выхода из колодца герой стоит на стойке; сходим с неё вправо на землю — дальше «пол» один и тот же.
    const onPost = await num(page, 'heroY')();
    const step = await dpad(page, 0.85, 0.5);
    await touch.down(9, step.x, step.y);
    await expect.poll(num(page, 'heroY'), { timeout: 4000 }).toBeGreaterThan(onPost);
    await touch.up(9);
    await page.waitForTimeout(700);
    const floor = await num(page, 'heroY')();

    // JUMP: касание — герой взлетает.
    const jump = await center(page, '#deck .pad--jump');
    await touch.down(1, jump.x, jump.y);
    await expect(page.locator('#deck .pad--jump')).toHaveAttribute('data-pressed', '');
    await expect.poll(num(page, 'heroY'), { timeout: 2000 }).toBeLessThan(floor);
    await touch.up(1);
    await expect(page.locator('#deck .pad--jump')).not.toHaveAttribute('data-pressed', '');
    await expect.poll(num(page, 'heroY'), { timeout: 4000 }).toBe(floor); // приземлился

    // FIRE (большая и верхняя): выстрел.
    const shots = async (): Promise<number> => Number(await area(page, 'projectiles'));
    const fire = await center(page, '#deck .pad--fire');
    await touch.down(1, fire.x, fire.y);
    await expect.poll(shots, { timeout: 2000 }).toBeGreaterThan(0);
    await touch.up(1);
    await expect.poll(shots, { timeout: 6000 }).toBe(0);
    const small = await center(page, '#deck .deck__top [data-pad="fire"]');
    await touch.down(1, small.x, small.y); // верхняя FIRE — то же действие
    await expect.poll(shots, { timeout: 2000 }).toBeGreaterThan(0);
    await touch.up(1);
    await expect.poll(shots, { timeout: 6000 }).toBe(0);

    // Два пальца: левый ведёт по крестовине вправо, правый нажимает JUMP — герой идёт и прыгает одновременно.
    const x0 = await num(page, 'heroX')();
    const right = await dpad(page, 0.85, 0.5);
    await touch.down(1, right.x, right.y);
    await touch.down(2, jump.x, jump.y);
    await expect(page.locator('#deck .pad--jump')).toHaveAttribute('data-pressed', '');
    await expect(page.locator('#deck [data-pad-dir="right"]')).toHaveAttribute('data-pressed', '');
    await expect.poll(num(page, 'heroY'), { timeout: 2000 }).toBeLessThan(floor);
    await expect.poll(num(page, 'heroX'), { timeout: 3000 }).toBeGreaterThan(x0);
    await touch.up(2); // JUMP отпущен — стрелка по-прежнему держится
    await expect(page.locator('#deck [data-pad-dir="right"]')).toHaveAttribute('data-pressed', '');
    await touch.up(1);
    await expect(page.locator('#deck [data-pad-dir="right"]')).not.toHaveAttribute('data-pressed', '');
  });

  test('пульт не прокручивает страницу и не выделяет текст; игра на паузе при выключенной кнопке не принимает стрелки', async ({ page }) => {
    await page.goto('./?view=screen');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    const touchAction = await page.evaluate(() => ({
      deck: getComputedStyle(document.getElementById('deck') as HTMLElement).touchAction,
      jump: getComputedStyle(document.querySelector('#deck .pad--jump') as HTMLElement).touchAction,
      zone: getComputedStyle(document.querySelector('#deck [data-pad-zone="dpad"]') as HTMLElement).touchAction,
      select: getComputedStyle(document.getElementById('deck') as HTMLElement).userSelect,
    }));
    expect(touchAction).toEqual({ deck: 'none', jump: 'none', zone: 'none', select: 'none' });
    // Игрушка выключена: стрелки ничего не нажимают (как кнопки корпуса).
    const touch = await fingers(page);
    const right = await dpad(page, 0.85, 0.5);
    await touch.down(1, right.x, right.y);
    await page.waitForTimeout(200);
    await expect(page.locator('#deck [data-pad-dir="right"]')).not.toHaveAttribute('data-pressed', '');
    await touch.up(1);
  });
});

test.describe('пульт необязателен: переключатель «Для телефона»', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('в «только экран» пульт есть сам; выключили — пропал, и крышка теперь открывается целиком; выбор сохраняется', async ({ page }) => {
    await page.goto('./?view=screen');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    const toggle = page.locator('#tgl-pad');
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Для телефона');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true'); // по умолчанию в «только экран» пульт показан
    await expect(page.locator('#deck')).toBeVisible();
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#deck')).toBeHidden();
    expect(await savedPad(page)).toBe(false);

    // Выключен явно: после перезагрузки его нет, а касание закрытой крышки открывает игрушку целиком — с настоящими кнопками корпуса.
    await page.goto('./');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    const cover = await center(page, '#lid-cover');
    await page.touchscreen.tap(cover.x, cover.y);
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
    await expect(page.locator('#deck')).toBeHidden();
    await expect(page.locator('#base')).toBeVisible();
    // Вернули пульт в «только экран».
    await page.locator('#view-screen').scrollIntoViewIfNeeded();
    await page.locator('#view-screen').tap();
    await expect(page.locator('#deck')).toBeHidden(); // выбор «нет» действует во всех видах
    await page.locator('#tgl-pad').scrollIntoViewIfNeeded();
    await page.locator('#tgl-pad').tap();
    await expect(page.locator('#deck')).toBeVisible();
    expect(await savedPad(page)).toBe(true);
  });

  test('в «Полной» пульт включается тем же переключателем и заменяет нижнюю половину игрушки: лампы, шарнир и шлейф остаются', async ({ page }) => {
    await page.goto('./?power=on');
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
    await expect(page.locator('#deck')).toBeHidden(); // по умолчанию в «Полной» кнопки корпуса
    await expect(page.locator('#base')).toBeVisible();
    const toggle = page.locator('#tgl-pad');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.scrollIntoViewIfNeeded();
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#deck')).toBeVisible();
    await expect(page.locator('#base')).toBeHidden(); // кнопки корпуса заменены пультом
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full'); // вид тот же: крышка открыта, шарнир на месте
    expect(await savedPad(page)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));

    // Раскладка: пульт стоит прямо под шарниром, целиком в окне выше нижней панели браузера, шарнир и шлейф видны.
    const stage = await box(page, '#stage');
    const deck = await box(page, '#deck');
    expect(deck.y).toBeGreaterThan(stage.y + stage.height - 40);
    expect(deck.y).toBeLessThan(stage.y + stage.height + 30);
    expect(deck.y + deck.height).toBeLessThanOrEqual(844 - 60);
    expect(deck.x).toBeGreaterThanOrEqual(0);
    expect(deck.x + deck.width).toBeLessThanOrEqual(390);
    await expect(page.locator('.toy__knuckle').first()).toBeVisible();
    await expect(page.locator('.toy__band')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // И он работает: S./P. на пульте запускает игру, крестовина двигает героя.
    const sp = await center(page, '#deck [data-pad="sp"]');
    await page.touchscreen.tap(sp.x, sp.y);
    await expect.poll(phase(page)).toBe('playing');
    await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off');
    const touch = await fingers(page);
    const x0 = await num(page, 'heroX')();
    const right = await dpad(page, 0.85, 0.5);
    await touch.down(1, right.x, right.y);
    await expect.poll(num(page, 'heroX'), { timeout: 4000 }).toBeGreaterThan(x0 + 1);
    await touch.up(1);

    // Выключили переключатель — нижняя половина на месте.
    await page.locator('#tgl-pad').scrollIntoViewIfNeeded();
    await page.locator('#tgl-pad').tap();
    await expect(page.locator('#deck')).toBeHidden();
    await expect(page.locator('#base')).toBeVisible();
  });

  test('включённый в «Полной» пульт запоминается: после перезагрузки он на месте; у закрытой игрушки пульта нет', async ({ page }) => {
    await page.goto('./?view=full');
    await page.locator('#tgl-pad').scrollIntoViewIfNeeded();
    await page.locator('#tgl-pad').tap();
    await expect(page.locator('#deck')).toBeVisible();
    await page.goto('./?view=full');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('#deck')).toBeVisible();
    await expect(page.locator('#tgl-pad')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('./'); // при загрузке игрушка закрыта
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
    await expect(page.locator('#deck')).toBeHidden();
    await expect(page.locator('#tgl-pad')).toHaveAttribute('aria-pressed', 'false');
  });

  test('на широком экране переключателя «Для телефона» нет', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./?view=full');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('#tgl-ghost')).toBeVisible();
    await expect(page.locator('#tgl-pad')).toBeHidden();
    await expect(page.locator('#deck')).toBeHidden();
  });
});

test.describe('телефон в альбомной ориентации', () => {
  test.use({ hasTouch: true, viewport: { width: 844, height: 390 } });

  test('кнопки стоят по бокам экрана и не закрывают LCD; слева крестовина и ON/OFF, S./P., справа JUMP, FIRE и SOUND', async ({ page }) => {
    await page.goto('./?view=screen');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('#deck')).toBeVisible();
    const lcd = await box(page, '#lcd-window');
    const centreX = lcd.x + lcd.width / 2;
    const selectors = ['[data-pad="onoff"]', '[data-pad="sp"]', '[data-pad="sound"]', '.deck__top [data-pad="fire"]', '.pad--fire', '.pad--jump', '[data-pad-zone="dpad"]'].map((s) => `#deck ${s}`);
    for (const selector of selectors) {
      const b = await box(page, selector);
      expect(b.x, selector).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, selector).toBeLessThanOrEqual(844);
      expect(b.y + b.height, selector).toBeLessThanOrEqual(390);
      expect(b.width, selector).toBeGreaterThanOrEqual(44);
      expect(b.height, selector).toBeGreaterThanOrEqual(44);
      const overlapsLcd = b.x < lcd.x + lcd.width && b.x + b.width > lcd.x && b.y < lcd.y + lcd.height && b.y + b.height > lcd.y;
      expect(overlapsLcd, `${selector} не закрывает экран`).toBe(false);
    }
    for (const selector of ['[data-pad="onoff"]', '[data-pad="sp"]', '[data-pad-zone="dpad"]'].map((s) => `#deck ${s}`)) {
      const b = await box(page, selector);
      expect(b.x + b.width / 2, `${selector} слева`).toBeLessThan(centreX);
    }
    for (const selector of ['[data-pad="sound"]', '.deck__top [data-pad="fire"]', '.pad--fire', '.pad--jump'].map((s) => `#deck ${s}`)) {
      const b = await box(page, selector);
      expect(b.x + b.width / 2, `${selector} справа`).toBeGreaterThan(centreX);
    }
    // Нижние кластеры оставляют запас под плавающую панель браузера.
    const jump = await box(page, '#deck .pad--jump');
    expect(jump.y + jump.height).toBeLessThanOrEqual(390 - 10);
    // Работает и здесь: включить и прыгнуть.
    const power = await center(page, '#deck [data-pad="onoff"]');
    await page.touchscreen.tap(power.x, power.y);
    await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  });
});

test.describe('телефон в альбомной ориентации: «Полная»', () => {
  test.use({ hasTouch: true, viewport: { width: 844, height: 390 } });

  test('с включённым пультом «Полная» остаётся целой игрушкой, кнопки лежат по бокам', async ({ page }) => {
    await page.goto('./?view=full');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await page.locator('#tgl-pad').scrollIntoViewIfNeeded();
    await page.locator('#tgl-pad').tap();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('#deck')).toBeVisible();
    await expect(page.locator('#base')).toBeVisible(); // нижняя половина на месте
    const jump = await box(page, '#deck .pad--jump');
    const dpadBox = await box(page, '#deck [data-pad-zone="dpad"]');
    expect(jump.x).toBeGreaterThan(844 / 2);
    expect(dpadBox.x + dpadBox.width).toBeLessThan(844 / 2);
    expect(jump.y + jump.height).toBeLessThanOrEqual(390);
  });
});

test.describe('широкий экран и вид «Полная»', () => {
  test('на компьютере (1440 px) пульта для телефона нет, даже в «только экран»', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./?view=screen');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('#deck')).toBeHidden();
  });

  test('на узком окне в виде «Полная» пульта нет — там настоящие кнопки корпуса; крышка по Enter открывается в «только экран»', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./?power=on');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
    await expect(page.locator('#deck')).toBeHidden();
    await page.goto('./');
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
    await page.keyboard.press('Enter');
    await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
    await expect(page.locator('#deck')).toBeVisible();
  });
});
