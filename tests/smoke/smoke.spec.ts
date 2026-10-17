import { mockReadOnlyLeaderboard } from './url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Браузерный smoke-тест технического демо (#1, маршрут #/tech): загрузка → старт → движение/прыжок/огонь →
 * пауза/продолжение → рестарт. Основная комната (#2) проверяется в room.spec.ts.
 * Геймпад проверяется подставным navigator.getGamepads(); физический контроллер здесь не используется.
 * Состояние читается из data-* игровой области (стабильный контракт оболочки), а не из пикселей.
 */

interface Snapshot {
  phase: string;
  level: string;
  tick: number;
  worldTick: number;
  heroX: number;
  heroY: number;
  score: number;
  lives: number;
  projectiles: number;
  gamepad: string;
  context: string;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const d = document.getElementById('game-area')?.dataset ?? {};
    return {
      phase: d['phase'] ?? '',
      level: d['level'] ?? '',
      tick: Number(d['tick']),
      worldTick: Number(d['worldTick']),
      heroX: Number(d['heroX']),
      heroY: Number(d['heroY']),
      score: Number(d['score']),
      lives: Number(d['lives']),
      projectiles: Number(d['projectiles']),
      gamepad: d['gamepad'] ?? '',
      context: d['context'] ?? '',
    };
  });
}

const phase = (page: Page) => async () => (await snapshot(page)).phase;

async function startGame(page: Page): Promise<void> {
  await expect.poll(phase(page)).toBe('ready'); // контент загружается асинхронно
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
}

/** Подставной Gamepad API до загрузки страницы. */
async function installFakeGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __pads: unknown[] };
    w.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { value: () => w.__pads, configurable: true });
  });
}

async function setPad(page: Page, pressed: number[], axes: number[] = [0, 0, 0, 0]): Promise<void> {
  await page.evaluate(
    ({ pressed, axes }) => {
      const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
      (window as unknown as { __pads: unknown[] }).__pads = [
        { id: 'Smoke Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', buttons, axes },
      ];
    },
    { pressed, axes },
  );
}

async function removePad(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __pads: unknown[] }).__pads = [];
  });
}

test.beforeEach(async ({ page }) => {
  await mockReadOnlyLeaderboard(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

test('техническое демо загружается под /CrocodileMario/: ENGINE DEMO, готов к старту, Canvas нарисован', async ({ page }) => {
  await page.goto('./#/tech');
  await expect(page.locator('#badge')).toHaveText('ENGINE DEMO');
  // Техническая страница без корпуса: заголовок страницы есть, игрушки (кнопок, углового меню) нет.
  await expect(page.getByRole('heading', { name: 'Crocodile Mario' })).toHaveCount(1);
  await expect(page.locator('#base')).toBeHidden();
  await expect(page.locator('#corner')).toBeHidden();
  await expect.poll(phase(page)).toBe('ready');
  await expect(page.locator('#overlay-title')).toHaveText('Готов к старту');

  const painted = await page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!data) return 0;
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) colors.add((data[i] ?? 0) * 65536 + (data[i + 1] ?? 0) * 256 + (data[i + 2] ?? 0));
    return colors.size;
  });
  expect(painted).toBeGreaterThanOrEqual(2); // фон и «чернила»
});

test('старт → движение, прыжок, выстрел → пауза/продолжение → рестарт', async ({ page }) => {
  await page.goto('./#/tech');
  await expect.poll(phase(page)).toBe('ready');
  const start = await snapshot(page);
  await startGame(page);

  // Движение вправо.
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).heroX).toBeGreaterThan(start.heroX + 1);
  await page.keyboard.up('ArrowRight');

  // Прыжок: герой поднимается и затем приземляется на ту же высоту.
  const floorY = (await snapshot(page)).heroY;
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).heroY).toBeLessThan(floorY);
  await expect.poll(async () => (await snapshot(page)).heroY, { timeout: 5000 }).toBe(floorY);

  // Выстрел: считаем максимум одновременных снарядов через MutationObserver (снаряд живёт недолго).
  await page.evaluate(() => {
    const el = document.getElementById('game-area');
    const w = window as unknown as { __maxProjectiles: number };
    w.__maxProjectiles = 0;
    new MutationObserver(() => {
      w.__maxProjectiles = Math.max(w.__maxProjectiles, Number(el?.dataset['projectiles']));
    }).observe(el as Element, { attributes: true, attributeFilter: ['data-projectiles'] });
  });
  await page.keyboard.press('KeyX');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __maxProjectiles: number }).__maxProjectiles)).toBeGreaterThan(0);

  // Пауза: мир замирает, продолжение — явное.
  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('paused');
  await expect(page.locator('#overlay-title')).toHaveText('Пауза');
  const frozen = await snapshot(page);
  await page.waitForTimeout(500);
  const later = await snapshot(page);
  expect(later.worldTick).toBe(frozen.worldTick);
  expect(later.heroX).toBe(frozen.heroX);
  expect(later.tick).toBeGreaterThan(frozen.tick); // ввод на паузе опрашивается
  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('playing');

  // Рестарт возвращает героя на старт.
  await page.getByRole('button', { name: 'Рестарт' }).click();
  await expect.poll(phase(page)).toBe('ready');
  const restarted = await snapshot(page);
  expect(restarted.heroX).toBe(start.heroX);
  expect(restarted.heroY).toBe(start.heroY);
  expect(restarted.score).toBe(0);
});

test('потеря фокуса окна: пауза; зажатые клавиши не дают прыжка и скачка после явного продолжения', async ({ page }) => {
  await page.goto('./#/tech');
  await startGame(page);
  const floorY = (await snapshot(page)).heroY;

  // Прыжок уже состоялся и закончился, а Пробел всё ещё зажат (повтор ОС игра игнорирует).
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snapshot(page)).heroY).toBeLessThan(floorY);
  await expect.poll(async () => (await snapshot(page)).heroY, { timeout: 5000 }).toBe(floorY);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(100);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(phase(page)).toBe('paused');
  await expect(page.locator('#overlay-hint')).toContainText('потеряло фокус');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');

  const before = await snapshot(page);
  await page.waitForTimeout(600); // «вкладка была скрыта»: время не копится
  await page.keyboard.press('Escape'); // явное продолжение
  await expect.poll(phase(page)).toBe('playing');
  await page.waitForTimeout(500);
  const after = await snapshot(page);
  expect(after.heroX).toBe(before.heroX);
  expect(after.heroY).toBe(floorY);
});

test('геймпад (подставной провайдер): активация, старт, ходьба, прыжок, отключение → пауза', async ({ page }) => {
  await installFakeGamepad(page);
  await page.goto('./#/tech');
  await expect.poll(phase(page)).toBe('ready');

  // Подсказка «нажмите кнопку», затем активация нажатием.
  await setPad(page, []);
  await expect(page.locator('#status-gamepad')).toContainText('Нажмите кнопку на геймпаде');
  await setPad(page, [0]);
  await expect.poll(async () => (await snapshot(page)).gamepad).toBe('active');
  expect((await snapshot(page)).phase).toBe('ready'); // сама активация игру не запускает
  await setPad(page, []);

  // Start на геймпаде — старт игры.
  await setPad(page, [9]);
  await expect.poll(phase(page)).toBe('playing');
  await setPad(page, []);

  // Крестовина вправо.
  const x0 = (await snapshot(page)).heroX;
  await setPad(page, [15]);
  await expect.poll(async () => (await snapshot(page)).heroX).toBeGreaterThan(x0 + 1);
  await setPad(page, []);

  // Левый стик влево.
  const x1 = (await snapshot(page)).heroX;
  await setPad(page, [], [-0.9, 0, 0, 0]);
  await expect.poll(async () => (await snapshot(page)).heroX).toBeLessThan(x1);
  await setPad(page, []);

  // Прыжок нижней лицевой кнопкой.
  const floorY = (await snapshot(page)).heroY;
  await setPad(page, [0]);
  await expect.poll(async () => (await snapshot(page)).heroY).toBeLessThan(floorY);
  await setPad(page, []);
  await expect.poll(async () => (await snapshot(page)).heroY, { timeout: 5000 }).toBe(floorY);

  // Отключение активного геймпада во время игры: пауза и подсказка.
  await setPad(page, [15]);
  await removePad(page);
  await expect.poll(phase(page)).toBe('paused');
  await expect(page.locator('#overlay-hint')).toContainText('Геймпад отключён');
  const frozen = await snapshot(page);
  await page.waitForTimeout(400);
  expect((await snapshot(page)).heroX).toBe(frozen.heroX);

  // Подключение с зажатой кнопкой прыжка: никакого случайного прыжка после явного продолжения.
  await setPad(page, [0]);
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Продолжить' }).first().click();
  await expect.poll(phase(page)).toBe('playing');
  await page.waitForTimeout(500);
  expect((await snapshot(page)).heroY).toBe(frozen.heroY);
});

test('настройки: диалог ставит игру на паузу и не пропускает клавиши в мир', async ({ page }) => {
  await page.goto('./#/tech');
  await startGame(page);
  await page.getByRole('button', { name: 'Настройки…' }).click();
  await expect(page.locator('dialog#settings')).toBeVisible();
  await expect.poll(phase(page)).toBe('paused');
  await expect.poll(async () => (await snapshot(page)).context).toBe('menu');

  const x = (await snapshot(page)).heroX;
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect((await snapshot(page)).heroX).toBe(x);

  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#settings')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).context).toBe('game');
  await expect(page.locator('#overlay-hint')).toContainText('настройки');
});

test('Canvas сохраняет пропорции и не растягивается при изменении окна', async ({ page }) => {
  await page.goto('./#/tech');
  const ratio = async (): Promise<number> => {
    const box = await page.locator('#screen').boundingBox();
    return (box?.width ?? 0) / (box?.height ?? 1);
  };
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect.poll(ratio).toBeGreaterThan(0);
  const wide = await ratio();
  await page.setViewportSize({ width: 600, height: 700 });
  await page.waitForTimeout(300);
  expect(Math.abs((await ratio()) - wide)).toBeLessThan(0.05);
});
