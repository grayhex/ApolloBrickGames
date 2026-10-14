import { expect, test, type Page } from '@playwright/test';

/**
 * Игрушка целиком: корпус из двух половин, девять кнопок, логотип на нижней части, уголок с настройками, справкой и редактором.
 * Кнопки нажимаются мышью и касанием и подсвечиваются от клавиатуры; питание и звук — кнопками ON/OFF и SOUND.
 */

const area = (page: Page, key: string): Promise<string> =>
  page.evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key);
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const heroX = (page: Page) => async (): Promise<number> => Number(await area(page, 'heroX'));
const heroY = (page: Page) => async (): Promise<number> => Number(await area(page, 'heroY'));
const entry = (page: Page) => (): Promise<string> => area(page, 'entry');
const key = (page: Page, id: string) => page.locator(`[data-key="${id}"]`);
const pressed = (page: Page, id: string) => expect(key(page, id)).toHaveAttribute('data-pressed', '');
const released = (page: Page, id: string) => expect(key(page, id)).not.toHaveAttribute('data-pressed', '');

async function ready(page: Page): Promise<void> {
  await page.goto('./');
  await expect.poll(phase(page)).toBe('ready');
}

async function center(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await key(page, id).boundingBox();
  if (!box) throw new Error(`Нет кнопки ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`игрушка целиком помещается в окно ${size.width}×${size.height} без прокрутки; логотип крупно по центру нижней части`, async ({ page }) => {
    await page.setViewportSize(size);
    await ready(page);
    const m = await page.evaluate(() => {
      const rect = (selector: string): DOMRect => (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
      const toy = rect('#toy');
      const base = rect('#base');
      const logo = rect('.base__logo--white');
      const corner = rect('#corner');
      const logoImg = document.querySelector('.base__logo--white') as HTMLImageElement;
      return {
        scrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
        toy: { top: toy.top, bottom: toy.bottom, left: toy.left, right: toy.right },
        base: { top: base.top, bottom: base.bottom, left: base.left, width: base.width },
        logo: { left: logo.left, width: logo.width, top: logo.top, bottom: logo.bottom },
        corner: { left: corner.left, bottom: corner.bottom },
        loaded: logoImg.complete && logoImg.naturalWidth > 0,
        vw: window.innerWidth,
        scrollW: document.documentElement.scrollWidth,
      };
    });
    // Рядом с игрушкой (окно от 900 px) стоят панели и страница не прокручивается; на узком экране панели уходят под игрушку.
    if (size.width >= 900) expect(m.scrollH).toBeLessThanOrEqual(m.innerH + 1);
    expect(m.scrollW).toBeLessThanOrEqual(m.vw + 1); // горизонтальной прокрутки нет нигде
    expect(m.toy.top).toBeGreaterThanOrEqual(-1);
    expect(m.toy.bottom).toBeLessThanOrEqual(m.innerH + 1);
    expect(m.toy.left).toBeGreaterThanOrEqual(0);
    expect(m.toy.right).toBeLessThanOrEqual(m.vw);
    // Логотип (на синем корпусе — белая печать) — внутри нижней половины, занимает почти всю её ширину, по центру.
    expect(m.loaded).toBe(true);
    expect(m.logo.width / m.base.width).toBeGreaterThan(0.7);
    expect(Math.abs(m.logo.left + m.logo.width / 2 - (m.base.left + m.base.width / 2)) / m.base.width).toBeLessThan(0.02);
    expect(m.logo.top).toBeGreaterThan(m.base.top + (m.base.bottom - m.base.top) * 0.7); // в нижней части
    expect(m.logo.bottom).toBeLessThanOrEqual(m.base.bottom);
    // Уголок не наезжает на игрушку на узком экране.
    if (size.width < 640) expect(m.corner.bottom).toBeLessThanOrEqual(m.toy.top + 1);
  });
}

test('логотип: на синем и красном корпусе — белая печать, на жёлтом и белом — цветная', async ({ page }) => {
  await ready(page);
  const visible = (selector: string): Promise<boolean> =>
    page.evaluate((s) => getComputedStyle(document.querySelector(s) as HTMLElement).display !== 'none', selector);
  for (const [shell, white] of [['blue', true], ['red', true], ['yellow', false], ['white', false]] as const) {
    await page.evaluate((s) => ((document.getElementById('toy') as HTMLElement).dataset['shell'] = s), shell);
    expect(await visible('.base__logo--white'), shell).toBe(white);
    expect(await visible('.base__logo--color'), shell).toBe(!white);
  }
});

test('динамик: ровная симметричная решётка отверстий относительно оси корпуса', async ({ page }) => {
  await ready(page);
  const holes = await page.evaluate(() =>
    [...document.querySelectorAll('.base__speaker circle')].map((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy')), Number(c.getAttribute('r'))]),
  );
  expect(holes.length).toBeGreaterThanOrEqual(40);
  expect(new Set(holes.map(([, , r]) => r)).size).toBe(1); // одинаковый размер
  const rows = new Map<number, number[]>();
  for (const [x, y] of holes) rows.set(y as number, [...(rows.get(y as number) ?? []), x as number]);
  for (const xs of rows.values()) {
    const sorted = [...xs].sort((a, b) => a - b);
    expect(sorted[0]! + sorted[sorted.length - 1]!).toBeCloseTo(400, 5); // симметрия: центр ряда — ось корпуса (x = 200)
    const steps = new Set(sorted.slice(1).map((x, i) => +(x - sorted[i]!).toFixed(3)));
    expect(steps.size).toBe(1); // равный шаг
  }
});

test('крестовина: клавиши и надписи стоят ровно — симметрично, без наклона', async ({ page }) => {
  await ready(page);
  const c = async (id: string): Promise<{ x: number; y: number }> => center(page, id);
  const [up, down, left, right] = [await c('up'), await c('down'), await c('left'), await c('right')];
  expect(Math.abs(up.x - down.x)).toBeLessThan(0.6); // вверх и вниз — на одной вертикали
  expect(Math.abs(left.y - right.y)).toBeLessThan(0.6); // влево и вправо — на одной горизонтали
  expect(Math.abs((left.x + right.x) / 2 - up.x)).toBeLessThan(0.6); // и обе оси пересекаются в центре
  expect(Math.abs((up.y + down.y) / 2 - left.y)).toBeLessThan(0.6);
  // Надписи: UP и DOWN — строго горизонтально, LEFT и RIGHT — строго вертикально (±90°), без «кривизны».
  const turns = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.base__art text')].map((t) => [t.textContent, t.getAttribute('transform') ?? '']),
    ),
  );
  expect(turns['UP']).toBe('');
  expect(turns['DOWN']).toBe('');
  expect(turns['LEFT']).toMatch(/^rotate\(-90 /);
  expect(turns['RIGHT']).toMatch(/^rotate\(90 /);
});

test('кнопки подсвечиваются от клавиатуры: направления, прыжок, огонь, старт и пауза', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');

  await page.keyboard.down('ArrowRight');
  await pressed(page, 'right');
  await page.keyboard.up('ArrowRight');
  await released(page, 'right');

  await page.keyboard.down('KeyA');
  await pressed(page, 'left');
  await page.keyboard.up('KeyA');
  await released(page, 'left');

  await page.keyboard.down('ArrowUp');
  await pressed(page, 'up');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await pressed(page, 'down');
  await page.keyboard.up('ArrowDown');

  await page.keyboard.down('Space');
  await pressed(page, 'jump');
  await page.keyboard.up('Space');
  await released(page, 'jump');

  await page.keyboard.down('KeyX');
  await pressed(page, 'fire');
  await page.keyboard.up('KeyX');
  await released(page, 'fire');

  await page.keyboard.down('Escape'); // пауза — та же кнопка S./P.
  await pressed(page, 'sp');
  await page.keyboard.up('Escape');
  await expect.poll(phase(page)).toBe('paused');
  await released(page, 'sp');
});

test('кнопки нажимаются мышью: ходьба и прыжок удерживаются, S./P. — старт, пауза, продолжение', async ({ page }) => {
  await ready(page);
  await key(page, 'sp').click();
  await expect.poll(phase(page)).toBe('playing');
  await key(page, 'sp').click();
  await expect.poll(phase(page)).toBe('paused');
  await key(page, 'sp').click();
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(entry(page), { timeout: 6000 }).toBe('off'); // сценарий входа идёт и после паузы; потом управляет игрок

  // Прыжок со стойки (над героем свободно): кнопка JUMP подсвечивается, пока удерживается.
  const floor = await heroY(page)();
  const jump = await center(page, 'jump');
  await page.mouse.move(jump.x, jump.y);
  await page.mouse.down();
  await pressed(page, 'jump');
  await expect.poll(heroY(page)).toBeLessThan(floor);
  await page.mouse.up();
  await released(page, 'jump');
  await expect.poll(heroY(page), { timeout: 3000 }).toBe(floor); // приземлился

  const x0 = await heroX(page)();
  const { x, y } = await center(page, 'right');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await pressed(page, 'right');
  await expect.poll(heroX(page)).toBeGreaterThan(x0 + 1); // удержание — ходьба
  await page.mouse.up();
  await released(page, 'right');
  const stopped = await heroX(page)();
  await page.waitForTimeout(400);
  expect(await heroX(page)()).toBe(stopped);

  // Фокус остался у игры: клавиатура работает без клика, кнопки не стали активным элементом.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('game-area');
  await page.keyboard.down('ArrowLeft');
  await expect.poll(heroX(page)).toBeLessThan(stopped);
  await page.keyboard.up('ArrowLeft');
});

test('клавиатура работает и после клика по пустому месту страницы (без подсказки «кликните»)', async ({ page }) => {
  await ready(page);
  await page.mouse.click(40, 400);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect(page.locator('#focus-hint')).toBeHidden();
});

test('ON/OFF: экран гаснет, светодиоды гаснут, кнопки игры молчат; при включении — заново', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  const ledRed = (): Promise<string | undefined> => page.locator('#lid').evaluate((e) => (e as HTMLElement).dataset['ledRed']);

  await key(page, 'onoff').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  await expect.poll(ledRed).toBe('off');
  expect(await page.locator('#lid .led--lit').count()).toBe(0);
  // Пустой экран: ни блоков, ни слоя неактивных сегментов — один цвет подложки.
  const flat = await page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const data = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height).data;
    const first = [data[0], data[1], data[2]];
    for (let i = 0; i < data.length; i += 4) if (data[i] !== first[0] || data[i + 1] !== first[1] || data[i + 2] !== first[2]) return false;
    return true;
  });
  expect(flat).toBe(true);
  // Выключенная игрушка не слушает кнопки игры.
  const before = await heroX(page)();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect(await heroX(page)()).toBe(before);

  await key(page, 'onoff').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(ledRed).toBe('off'); // со звуком светодиоды оживают вместе с мелодией (leds-sound.spec.ts); в тишине погашены
  expect(await heroX(page)()).toBe(1);
});

test('горячие клавиши O и M работают как кнопки ON/OFF и SOUND и подсвечивают их', async ({ page }) => {
  await ready(page);
  await page.keyboard.down('KeyO');
  await pressed(page, 'onoff');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  await page.keyboard.up('KeyO');
  await released(page, 'onoff');
  await page.keyboard.press('KeyO');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'on');

  await page.keyboard.down('KeyM');
  await pressed(page, 'sound');
  await page.keyboard.up('KeyM');
  await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'false'); // кнопка звука на странице следует за SOUND
});

test('настройки — управление и цвет по умолчанию; справка: кнопки и клавиши; игра на паузе, пока окна открыты', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');

  await page.locator('#corner-settings').click();
  await expect(page.locator('dialog#settings')).toBeVisible();
  await expect.poll(phase(page)).toBe('paused');
  // В настройках — цвет по умолчанию и управление; звук, сегменты и вид экрана вынесены на кнопки страницы.
  await expect(page.locator('#settings-shell')).toBeVisible();
  await expect(page.locator('dialog#settings h3', { hasText: 'Клавиатура' })).toBeVisible();
  await expect(page.locator('dialog#settings h3', { hasText: 'Геймпад' })).toBeVisible();
  await expect(page.locator('#settings-sound, #settings-ghost')).toHaveCount(0);
  await page.locator('#settings-shell [data-shell="yellow"]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'yellow');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#settings')).toBeHidden();

  await page.locator('#corner-help').click();
  const help = page.locator('dialog#help');
  await expect(help).toBeVisible();
  for (const label of ['ON/OFF', 'S./P.', 'SOUND', 'FIRE', 'LEFT', 'RIGHT', 'UP', 'DOWN', 'JUMP']) {
    await expect(help.locator('th', { hasText: label }).first()).toBeVisible();
  }
  await expect(help.locator('tr', { hasText: 'S./P.' })).toContainText('Enter');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(page.locator('#game-area')).toBeFocused();
  expect(await phase(page)()).toBe('paused'); // продолжение — только явным нажатием S./P.
  await key(page, 'sp').click();
  await expect.poll(phase(page)).toBe('playing');
});

test('редактор — в уголке; технические страницы лежат внутри редактора', async ({ page }) => {
  await ready(page);
  await page.locator('#corner-editor').click();
  await expect(page.locator('#editor-root')).toBeVisible();
  await page.locator('#editor-pages summary').click();
  await expect(page.locator('#editor-link-tech')).toHaveAttribute('href', '#/tech');
  await expect(page.locator('#editor-link-sheet')).toHaveAttribute('href', '#/sheet');
  await page.locator('#editor-link-tech').click();
  await expect(page.locator('#badge')).toHaveText('ENGINE DEMO');
  await expect(page.locator('#corner')).toBeHidden(); // на технической странице игрушки нет
});

test('«только экран»: нижняя половина скрывается, крышка с экраном показана крупно; выбор запоминается', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  const toy = page.locator('#toy');
  const size = async (): Promise<{ lidW: number; lidH: number; screenW: number }> =>
    page.evaluate(() => {
      const lid = (document.getElementById('lid') as HTMLElement).getBoundingClientRect();
      const screen = (document.getElementById('screen') as HTMLElement).getBoundingClientRect();
      return { lidW: lid.width, lidH: lid.height, screenW: screen.width };
    });
  const whole = await size();
  await expect(page.locator('#base')).toBeVisible();
  await expect(page.locator('#tgl-compact')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#tgl-compact').click();
  await expect(toy).toHaveAttribute('data-compact', '');
  await expect(page.locator('#base')).toBeHidden();
  await expect(page.locator('.toy__hinge')).toBeHidden();
  await expect(page.locator('#tgl-compact')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tgl-compact')).toHaveAttribute('title', 'Показать всю игрушку');
  await expect(page.locator('#game-area')).toBeFocused(); // клавиатура осталась у игры
  // Холст подгоняется под окно LCD на следующем кадре (ResizeObserver), поэтому ждём, а не меряем сразу.
  await expect.poll(async () => (await size()).screenW).toBeGreaterThan(whole.screenW * 1.6); // экран заметно крупнее
  const fit = await page.evaluate(() => {
    const rect = (document.getElementById('toy') as HTMLElement).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, innerH: window.innerHeight, scrollH: document.documentElement.scrollHeight };
  });
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.bottom).toBeLessThanOrEqual(fit.innerH);
  expect(fit.scrollH).toBeLessThanOrEqual(fit.innerH + 1); // без прокрутки

  // Игра идёт и без кнопок корпуса: клавиатура работает.
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(entry(page), { timeout: 6000 }).toBe('off');
  const x0 = await heroX(page)();
  await page.keyboard.down('ArrowRight');
  await expect.poll(heroX(page)).toBeGreaterThan(x0 + 1);
  await page.keyboard.up('ArrowRight');

  // Выбор запоминается после перезагрузки; повторное нажатие возвращает игрушку целиком.
  await page.reload();
  await expect(toy).toHaveAttribute('data-compact', '');
  await expect(page.locator('#base')).toBeHidden();
  await page.locator('#tgl-compact').click();
  await expect(toy).not.toHaveAttribute('data-compact', '');
  await expect(page.locator('#base')).toBeVisible();
  await expect(page.locator('#tgl-compact')).toHaveAttribute('title', 'Только экран');
  const back = await size();
  expect(Math.abs(back.lidW - whole.lidW)).toBeLessThan(2);
});

test('«только экран»: касание экрана заменяет S./P. — старт и продолжение', async ({ page }) => {
  await ready(page);
  await page.locator('#tgl-compact').click();
  await page.locator('#game-area').click();
  await expect.poll(phase(page)).toBe('playing');
  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('paused');
  await page.locator('#game-area').click();
  await expect.poll(phase(page)).toBe('playing');
  await page.locator('#game-area').click(); // во время игры касание ничего не делает (случайно не поставить на паузу)
  await page.waitForTimeout(200);
  expect(await phase(page)()).toBe('playing');
});

test.describe('касание', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('касание кнопок корпуса: старт и прыжок', async ({ page }) => {
    await ready(page);
    const tap = async (id: string): Promise<void> => {
      const { x, y } = await center(page, id);
      await page.touchscreen.tap(x, y);
    };
    await tap('sp');
    await expect.poll(phase(page)).toBe('playing');
    await expect.poll(entry(page), { timeout: 6000 }).toBe('off');
    const floor = await heroY(page)();
    await tap('jump');
    await expect.poll(heroY(page)).toBeLessThan(floor);
  });
});
