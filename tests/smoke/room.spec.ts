import { expect, test, type Page } from '@playwright/test';

/**
 * Основной маршрут (#2): одна неподвижная комната `demo-room`, один герой.
 * Состояние читается из data-* игровой области; для проверки рендера считаются пиксели Canvas.
 * Геймпад — подставной navigator.getGamepads().
 */

interface Snap {
  phase: string;
  level: string;
  heroX: number;
  heroY: number;
  projectiles: number;
  lives: number;
  score: number;
}

const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const d = document.getElementById('game-area')?.dataset ?? {};
    return {
      phase: d['phase'] ?? '',
      level: d['level'] ?? '',
      heroX: Number(d['heroX']),
      heroY: Number(d['heroY']),
      projectiles: Number(d['projectiles']),
      lives: Number(d['lives']),
      score: Number(d['score']),
    };
  });

const FLOOR_Y = 5;
const phase = (page: Page) => async () => (await snap(page)).phase;

async function ready(page: Page): Promise<void> {
  await page.goto('./');
  await expect.poll(phase(page)).toBe('ready');
}

async function start(page: Page): Promise<void> {
  await ready(page);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
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

test('по умолчанию открывается ровно одна комната; подпись «тестовая комната» вне LCD-поля', async ({ page }) => {
  await ready(page);
  expect((await snap(page)).level).toBe('demo-room');
  await expect(page.locator('#badge')).toHaveText('DEMO — тестовая комната');
  await expect(page.locator('#subtitle')).toContainText('не оригинальный уровень');
  // Отладка и технические подробности не выносятся на основной маршрут.
  await expect(page.locator('#debug-toggle')).toBeHidden();
  await expect(page.locator('#row-timer')).toBeHidden();
  await expect(page.locator('#controls-hint')).toContainText('Прыжок: Пробел · Z');
  await expect(page.getByRole('button', { name: 'Сброс' })).toBeVisible();
  // Подпись находится вне Canvas.
  expect(await page.locator('#screen').evaluate((canvas) => canvas.closest('.game-area')?.contains(document.getElementById('badge')))).toBe(false);
});

test('ввод: в комнате нет стрельбы — кнопка огня ничего не создаёт', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const el = document.getElementById('game-area') as HTMLElement;
    const w = window as unknown as { __maxProj: number };
    w.__maxProj = 0;
    new MutationObserver(() => (w.__maxProj = Math.max(w.__maxProj, Number(el.dataset['projectiles'])))).observe(el, {
      attributes: true,
      attributeFilter: ['data-projectiles'],
    });
  });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(60);
  }
  expect(await page.evaluate(() => (window as unknown as { __maxProj: number }).__maxProj)).toBe(0);
});

test('клавиатура: ходьба до уступа, прыжок и приземление, один прыжок на одно нажатие', async ({ page }) => {
  await start(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snap(page)).heroX).toBe(8); // дальше уступ (x = 9, 10)
  await page.waitForTimeout(400);
  expect((await snap(page)).heroX).toBe(8);
  await page.keyboard.up('ArrowRight');

  // Считаем взлёты: Пробел зажат на 1,5 с, но прыжок должен быть один.
  await page.evaluate(() => {
    const el = document.getElementById('game-area') as HTMLElement;
    const w = window as unknown as { __takeoffs: number; __lastY: number; __minY: number };
    w.__takeoffs = 0;
    w.__lastY = Number(el.dataset['heroY']);
    w.__minY = w.__lastY;
    new MutationObserver(() => {
      const y = Number(el.dataset['heroY']);
      if (y < w.__lastY && w.__lastY === 5) w.__takeoffs += 1;
      w.__lastY = y;
      w.__minY = Math.min(w.__minY, y);
    }).observe(el, { attributes: true, attributeFilter: ['data-hero-y'] });
  });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.up('Space');
  const result = await page.evaluate(() => {
    const w = window as unknown as { __takeoffs: number; __minY: number };
    return { takeoffs: w.__takeoffs, minY: w.__minY };
  });
  expect(result.takeoffs).toBe(1);
  expect(result.minY).toBeLessThan(FLOOR_Y);
  expect((await snap(page)).heroY).toBe(FLOOR_Y); // приземлился
});

test('границы: влево до края комнаты и не дальше', async ({ page }) => {
  await start(page);
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snap(page)).heroX).toBe(0);
  await page.waitForTimeout(400);
  expect((await snap(page)).heroX).toBe(0);
  await page.keyboard.up('ArrowLeft');
});

test('пауза замораживает сцену, сброс возвращает героя на старт', async ({ page }) => {
  await start(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snap(page)).heroX).toBeGreaterThan(3);
  await page.keyboard.up('ArrowRight');

  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('paused');
  const frozen = await snap(page);
  await page.waitForTimeout(400);
  expect(await snap(page)).toEqual(frozen);
  await page.keyboard.press('Escape');
  await expect.poll(phase(page)).toBe('playing');

  await page.getByRole('button', { name: 'Сброс' }).click();
  await expect.poll(phase(page)).toBe('ready');
  expect(await snap(page)).toMatchObject({ heroX: 1, heroY: FLOOR_Y });
});

test('переназначение прыжка из настроек действует в комнате', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Настройки…' }).click();
  const row = page.locator('tr', { hasText: 'Прыжок' }).first();
  await row.getByRole('button', { name: 'Назначить' }).click();
  await page.keyboard.press('KeyJ');
  await expect(row).toContainText('J');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('#controls-hint')).toContainText('Прыжок: J');
  await expect(page.locator('#game-area')).toBeFocused(); // после закрытия настроек управление вернулось игре

  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await page.keyboard.press('KeyJ');
  await expect.poll(async () => (await snap(page)).heroY).toBeLessThan(FLOOR_Y);
});

test('геймпад (подставной) управляет той же комнатой: ходьба и прыжок', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __pads: unknown[] };
    w.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { value: () => w.__pads, configurable: true });
  });
  const setPad = (pressed: number[]): Promise<void> =>
    page.evaluate((pressed) => {
      const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
      (window as unknown as { __pads: unknown[] }).__pads = [
        { id: 'Room Pad (STANDARD GAMEPAD)', index: 1, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] },
      ];
    }, pressed);

  await ready(page);
  await setPad([0]); // активация нажатием (на ней игра не стартует)
  await expect(page.locator('#status-gamepad')).toContainText('активен');
  await setPad([]);
  await setPad([9]); // Start
  await expect.poll(phase(page)).toBe('playing');
  await setPad([]);

  // Влево до границы: над героем свободно (платформа правее, x = 3..5).
  await setPad([14]);
  await expect.poll(async () => (await snap(page)).heroX).toBe(0);
  await setPad([]);
  await setPad([15]); // и крестовина вправо тоже работает
  await expect.poll(async () => (await snap(page)).heroX).toBeGreaterThan(0);
  await setPad([14]);
  await expect.poll(async () => (await snap(page)).heroX).toBe(0);
  await setPad([]);
  await setPad([0]);
  await expect.poll(async () => (await snap(page)).heroY).toBeLessThan(FLOOR_Y);
  await setPad([]);
  await expect.poll(async () => (await snap(page)).heroY, { timeout: 5000 }).toBe(FLOOR_Y);
});

test('рендер: фон и сегменты в цветах LCD-профиля, блоки на своих клетках, герой — в клетке героя', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const { width, height } = canvas;
    const cols = 13;
    const rows = 8; // строка HUD + 7 строк поля
    const cw = width / cols;
    const ch = height / rows;
    const data = ctx.getImageData(0, 0, width, height).data;
    const BG = [0xc3, 0xc5, 0xc2];
    const INK = [0x3d, 0x43, 0x4d];
    const near = (i: number, c: number[]): boolean => [0, 1, 2].every((k) => Math.abs((data[i + k] ?? 0) - (c[k] ?? 0)) < 12);
    const inkRatio = (col: number, row: number): number => {
      let ink = 0;
      let total = 0;
      for (let y = Math.floor(row * ch) + 1; y < Math.floor((row + 1) * ch) - 1; y++) {
        for (let x = Math.floor(col * cw) + 1; x < Math.floor((col + 1) * cw) - 1; x++) {
          total += 1;
          if (near((y * width + x) * 4, INK)) ink += 1;
        }
      }
      return ink / total;
    };
    let bg = 0;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (near(i, BG)) bg += 1;
      else if (near(i, INK)) ink += 1;
    }
    const total = width * height;
    return {
      bgShare: bg / total,
      inkShare: ink / total,
      ground: inkRatio(6, 7), // нижний ряд — блок земли
      hero: inkRatio(1, 6), // клетка героя на старте (1, 5) → строка 6 с учётом HUD
      empty: inkRatio(11, 3), // пустая клетка воздуха
      step: inkRatio(9, 6), // уступ (x = 9, y = 5)
    };
  });
  expect(result.bgShare).toBeGreaterThan(0.5);
  expect(result.inkShare).toBeGreaterThan(0.05);
  expect(result.ground).toBeGreaterThan(0.25);
  expect(result.ground).toBeLessThan(0.75); // не сплошной чёрный квадрат
  expect(result.step).toBeGreaterThan(0.25);
  expect(result.hero).toBeGreaterThan(0.1);
  expect(result.empty).toBe(0);
});

test('Canvas сохраняет пропорции при изменении окна', async ({ page }) => {
  await ready(page);
  const ratio = async (): Promise<number> => {
    const box = await page.locator('#screen').boundingBox();
    return (box?.width ?? 0) / (box?.height ?? 1);
  };
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect.poll(ratio).toBeGreaterThan(0);
  const wide = await ratio();
  await page.setViewportSize({ width: 640, height: 700 });
  await page.waitForTimeout(300);
  expect(Math.abs((await ratio()) - wide)).toBeLessThan(0.05);
});

test('контрольный лист ресурсов открывается и перечисляет ресурсы со статусами', async ({ page }) => {
  await page.goto('./#/sheet');
  await expect(page.getByRole('heading', { name: 'Контрольный лист ресурсов (комната demo-room)' })).toBeVisible();
  for (const id of ['tile.ground', 'hero', 'life', 'hud.digits']) await expect(page.locator('#sheet code', { hasText: id })).toBeVisible();
  await expect(page.locator('.sheet__status--blocked').first()).toBeVisible();
  await expect(page.locator('#sheet canvas')).toHaveCount(2);
});
