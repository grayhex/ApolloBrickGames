import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Основной маршрут: игрушка, по умолчанию с уровнем `mario-1`; ходьба и рендер проверяются на тестовом уровне `tunnel-run` (`?level=tunnel-run`), один герой.
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

const FLOOR_Y = 4;
const phase = (page: Page) => async () => (await snap(page)).phase;
const entry = (page: Page) => (): Promise<string> => page.evaluate(() => document.getElementById('game-area')?.dataset['entry'] ?? '');

/** Страница на тестовом уровне по видео (`tunnel-run`): на его геометрии выверены тесты ходьбы и рендера; по умолчанию страница начинается с `mario-1`. */
async function ready(page: Page, query = '?level=tunnel-run&power=on'): Promise<void> {
  await page.goto(`./${query}`);
  await expect.poll(phase(page)).toBe('ready');
}

/** Старт и конец сценария входа: герой вышел из ямы и стоит на верхушке правой стойки (2, 2). */
async function start(page: Page): Promise<void> {
  await ready(page);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(entry(page), { timeout: 6000 }).toBe('off');
}

/** То же, но герой сходит на пол (y = 4) и стоит правее колонны. */
async function startOnFloor(page: Page): Promise<void> {
  await start(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snap(page)).heroY).toBe(FLOOR_Y);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(250);
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

test('по умолчанию открывается уровень 1 (mario-1) в игрушке; технического текста на странице нет', async ({ page }) => {
  await ready(page, '?power=on');
  expect((await snap(page)).level).toBe('mario-1');
  // Ни плашки DEMO, ни подсказок, ни статусов, ни отладки: игрушка, две панели по бокам и системное меню в уголке.
  for (const id of ['#badge', '#subtitle', '#debug-toggle', '#row-timer', '#controls-hint', '#status-keyboard', '#status-gamepad', '#overlay', '#focus-hint', '.shell__footer']) {
    await expect(page.locator(id)).toBeHidden();
  }
  const text = await page.locator('body').innerText();
  for (const word of ['DEMO', 'демо', 'Готов к старту', 'Кликните', 'Клавиатура:', 'тестовая комната', 'Таймер']) {
    expect(text, word).not.toContain(word);
  }
  await expect(page.locator('#corner button, #corner a')).toHaveCount(3); // фон, язык, справка
  await expect(page.locator('#devices')).toBeVisible();
  await expect(page.locator('#corner-theme')).toBeVisible();
  await expect(page.locator('#corner-lang')).toBeVisible();
  await expect(page.locator('#corner-settings')).toBeVisible();
  await expect(page.locator('#corner-help')).toBeVisible();
  await expect(page.locator('#corner-editor')).toHaveCount(0);
  await expect(page.locator('#side-info')).toBeVisible();
  await expect(page.locator('#side-ctl')).toBeVisible();
});

test('клавиатура: ходьба до уступа, прыжок и приземление, один прыжок на одно нажатие', async ({ page }) => {
  await startOnFloor(page);
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
      if (y < w.__lastY && w.__lastY === 4) w.__takeoffs += 1;
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

test('границы: влево герой падает обратно в яму и упирается в левую стойку, за карту не выходит', async ({ page }) => {
  await start(page);
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snap(page)).heroY).toBe(5); // яма в x = 1: крышки больше нет
  await page.waitForTimeout(400);
  expect(await snap(page)).toMatchObject({ heroX: 1, heroY: 5 }); // слева стойка (x = 0)
  await page.keyboard.up('ArrowLeft');
  // Из ямы можно выбраться тем же прыжком: на три клетки вверх, и вправо на верхушку стойки.
  await page.keyboard.press('Space');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snap(page)).heroX, { timeout: 3000 }).toBeGreaterThanOrEqual(2);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await snap(page)).heroY).toBeLessThanOrEqual(4);
});

test('пауза замораживает сцену; ON/OFF возвращает героя на старт, и сценарий входа идёт заново', async ({ page }) => {
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

  // Сброса на корпусе нет: как на устройстве — выключить и включить заново (ON/OFF).
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect.poll(phase(page)).toBe('ready');
  expect(await snap(page)).toMatchObject({ heroX: 1, heroY: 5 }); // в яме под крышкой
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(entry(page), { timeout: 6000 }).toBe('on');
  await expect.poll(entry(page), { timeout: 6000 }).toBe('off');
  expect(await snap(page)).toMatchObject({ heroX: 2, heroY: 2 }); // снова вышел на стойку
});

test('переназначение прыжка из настроек действует в комнате', async ({ page }) => {
  await ready(page);
  await page.locator('#corner-settings').click();
  const row = page.locator('tr', { hasText: 'Прыжок' }).first();
  await row.getByRole('button', { name: 'Назначить' }).click();
  await page.keyboard.press('KeyJ');
  await expect(row).toContainText('J');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('#game-area')).toBeFocused(); // после закрытия настроек управление вернулось игре
  // Справка показывает актуальные клавиши.
  await page.locator('#corner-help').click();
  await expect(page.locator('#help tr', { hasText: 'JUMP' })).toContainText('J');
  await page.keyboard.press('Escape');
  await expect(page.locator('#help')).toBeHidden();

  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(entry(page), { timeout: 6000 }).toBe('off');
  await page.keyboard.press('KeyJ');
  await expect.poll(async () => (await snap(page)).heroY).toBeLessThan(2); // прыжок со стойки (2, 2)
});

test('геймпад (подставной) управляет той же игрой: ходьба и прыжок', async ({ page }) => {
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
  await expect.poll(entry(page), { timeout: 6000 }).toBe('off'); // герой вышел из ямы

  await setPad([15]); // крестовина вправо: сходит со стойки на пол и идёт дальше
  await expect.poll(async () => (await snap(page)).heroX).toBeGreaterThan(4);
  await setPad([]);
  await expect.poll(async () => (await snap(page)).heroY, { timeout: 3000 }).toBe(FLOOR_Y);
  await setPad([14]); // и влево
  await expect.poll(async () => (await snap(page)).heroX).toBeLessThan(4);
  await setPad([]);
  await setPad([0]); // прыжок
  await expect.poll(async () => (await snap(page)).heroY).toBeLessThan(FLOOR_Y);
  await setPad([]);
  await expect.poll(async () => (await snap(page)).heroY, { timeout: 5000 }).toBe(FLOOR_Y);
});

test('рендер игры: цвета LCD-профиля владельца, препятствия и фигурка на своих клетках', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 }); // экран в корпусе мелкий: в 720 px по высоте клетки сглаживаются и порог доли чернил не держится
  await ready(page);
  await expect.poll(() => page.evaluate(() => document.getElementById('game-area')?.dataset['intro'] ?? ''), { timeout: 8000 }).toBe('off');
  const result = await page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const { width, height } = canvas;
    const scale = width / 1728; // логический холст 1728 × 864
    const data = ctx.getImageData(0, 0, width, height).data;
    const near = (i: number, c: number[]): boolean => [0, 1, 2].every((k) => Math.abs((data[i + k] ?? 0) - (c[k] ?? 0)) < 10);
    const BG = [173, 179, 140]; // #adb38c
    const INK = [48, 58, 48]; // #303a30
    const inkShare = (col: number, row: number): number => {
      // клетка поля 128 × 112, поле начинается в (32, 154)
      const x0 = Math.round((32 + col * 128) * scale);
      const y0 = Math.round((154 + row * 112) * scale);
      let ink = 0;
      let total = 0;
      for (let y = y0 + 2; y < Math.round((154 + (row + 1) * 112) * scale) - 2; y++) {
        for (let x = x0 + 2; x < Math.round((32 + (col + 1) * 128) * scale) - 2; x++) {
          total += 1;
          if (near((y * width + x) * 4, INK)) ink += 1;
        }
      }
      return ink / total;
    };
    let bg = 0;
    for (let i = 0; i < data.length; i += 4) if (near(i, BG)) bg += 1;
    return {
      bgShare: bg / (width * height),
      ground: inkShare(6, 5), // нижний ряд — препятствие
      step: inkShare(9, 4), // уступ
      hero: inkShare(1, 5), // клетка героя на старте (1, 5): яма под крышкой арки
      empty: inkShare(11, 1), // воздух (виден только слой неактивных сегментов)
    };
  });
  expect(result.bgShare).toBeGreaterThan(0.4); // подложка и слабый слой неактивных сегментов преобладают
  expect(result.ground).toBeGreaterThan(0.2); // тёмный прямоугольник со светлыми контурами фигурки (на мелком экране светлые линии размываются, доля «чернил» ≈ 0,3)
  expect(result.ground).toBeLessThan(0.9); // а не сплошной квадрат
  expect(result.step).toBeGreaterThan(0.2);
  expect(result.hero).toBeGreaterThan(0.05);
  expect(result.hero).toBeLessThan(result.ground);
  expect(result.empty).toBe(0);
});

// Снимки сцен `reference_*_obstacle.png` пересняты со страницы после перерисовки спрайтов по макрофото (tools/sprites): это регрессия
// размещения и слоёв, а не исторически точный эталон; прежние экраны владельца (с блоком «фигурка выключена») больше не сверяются.
for (const n of [1, 2]) {
  test(`сверка со снимком: сцена ${n} с фотографии рендерится так же, как tests/fixtures/reference/reference_${n}_obstacle.png`, async ({ page }) => {
    await page.goto('./#/sheet');
    await page.waitForSelector(`#ref-scene-${n}`);
    const reference = readFileSync(`tests/fixtures/reference/reference_${n}_obstacle.png`).toString('base64');
    const diff = await page.evaluate(
      async ({ n, reference }) => {
        const canvas = document.getElementById(`ref-scene-${n}`) as HTMLCanvasElement;
        const img = new Image();
        img.src = `data:image/png;base64,${reference}`;
        await img.decode();
        if (img.width !== canvas.width || img.height !== canvas.height) {
          return { size: `${canvas.width}×${canvas.height} против ${img.width}×${img.height}`, board: -1, hud: null };
        }
        const mine = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height).data;
        const scratch = document.createElement('canvas');
        scratch.width = img.width;
        scratch.height = img.height;
        const sctx = scratch.getContext('2d') as CanvasRenderingContext2D;
        sctx.drawImage(img, 0, 0);
        const theirs = sctx.getImageData(0, 0, img.width, img.height).data;
        let board = 0;
        for (let i = 0; i < mine.length; i += 4) {
          if (Math.floor(i / 4 / canvas.width) < 154) continue; // строка HUD — отдельно, ниже
          const d = Math.max(
            Math.abs((mine[i] ?? 0) - (theirs[i] ?? 0)),
            Math.abs((mine[i + 1] ?? 0) - (theirs[i + 1] ?? 0)),
            Math.abs((mine[i + 2] ?? 0) - (theirs[i + 2] ?? 0)),
          );
          if (d > 40) board += 1;
        }
        // Счёт в строке HUD: рамка тёмных пикселей правее середины экрана (подпись и значки жизни — левее).
        let minX = canvas.width;
        let maxX = 0;
        let minY = 154;
        let maxY = 0;
        for (let y = 0; y < 154; y++) {
          for (let x = Math.floor(canvas.width * 0.55); x < canvas.width; x++) {
            const at = (y * canvas.width + x) * 4;
            if ((mine[at] ?? 255) < 100) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        }
        return { size: '', board, hud: { width: maxX - minX + 1, height: maxY - minY + 1, right: canvas.width - maxX - 1, width1: canvas.width } };
      },
      { n, reference },
    );
    expect(diff.size).toBe(''); // размеры холста совпадают со снимком (1728 × 864 / 1088)
    expect(diff.board).toBe(0); // игровое поле совпадает попиксельно
    // Строка HUD подогнана не по эталонам, а по фото оригинала и записи со звуком (docs/video-observations.md §8): цифры крупнее,
    // чем на эталонах (58 × 94). Счёт — пять цифр ≈ 36 % ширины экрана, цифра ≈ 14 % высоты; правый край — у правого поля.
    expect(diff.hud).not.toBeNull();
    const hud = diff.hud as { width: number; height: number; right: number; width1: number };
    expect(hud.width / hud.width1).toBeGreaterThan(0.33);
    expect(hud.width / hud.width1).toBeLessThan(0.39);
    expect(hud.height).toBeGreaterThan(105); // эталонная цифра — 94
    expect(hud.height).toBeLessThan(130);
    expect(hud.right).toBeGreaterThan(20);
    expect(hud.right).toBeLessThan(80);
  });
}

test('корпус вокруг экрана: три светодиода; цвет текущей игры — на странице, цвет по умолчанию — из конфигурации', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#lid .led')).toHaveCount(3);
  await expect(page.locator('#lid .lid__screw')).toHaveCount(4);
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'blue');
  // Цвет текущей игры: четыре миниатюры справа от игрушки; на следующую игру (перезагрузку) выбор не переносится.
  await expect(page.locator('#shell-picker [role="radio"]')).toHaveCount(4);
  await expect(page.locator('#shell-picker [data-shell="blue"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#shell-picker [data-shell="red"]').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'red');
  await expect(page.locator('#shell-picker [data-shell="red"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#game-area')).toBeFocused(); // клавиатура осталась у игры
  await page.reload();
  await expect(page.locator('#toy')).toHaveAttribute('data-shell', 'blue');
  // Настройки управления больше не меняют назначенный администратором цвет.
  await page.locator('#corner-settings').click();
  await expect(page.locator('#settings-shell')).toHaveCount(0);
  await expect(page.locator('#settings-title')).toHaveText('Настройки управления');
  await page.keyboard.press('Escape');
  // Окно LCD сохраняет пропорции холста, Canvas целиком помещается в нём.
  const fits = await page.evaluate(() => {
    const win = (document.getElementById('lcd-window') as HTMLElement).getBoundingClientRect();
    const canvas = (document.getElementById('screen') as HTMLElement).getBoundingClientRect();
    return canvas.width <= win.width + 1 && canvas.height <= win.height + 1 && Math.abs(win.width / win.height - 2) < 0.02;
  });
  expect(fits).toBe(true);
});

test('слой неактивных сегментов переключается и запоминается', async ({ page }) => {
  await ready(page);
  await expect.poll(() => page.evaluate(() => document.getElementById('game-area')?.dataset['intro'] ?? ''), { timeout: 8000 }).toBe('off');
  const emptyCellInk = (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.getElementById('screen') as HTMLCanvasElement;
      const scale = canvas.width / 1728;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const x = Math.round((32 + 11 * 128 + 64) * scale);
      const y = Math.round((154 + 1 * 112 + 56) * scale);
      const [r = 0, g = 0, b = 0] = ctx.getImageData(x, y, 1, 1).data;
      return Math.abs(r - 173) + Math.abs(g - 179) + Math.abs(b - 140);
    });
  await expect(page.locator('#segments-on')).toBeChecked();
  const withGhost = await emptyCellInk();
  await page.locator('#segments-off').click();
  await expect(page.locator('#segments-off')).toBeChecked();
  await expect.poll(emptyCellInk).toBe(0); // чистая подложка
  expect(withGhost).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#segments-off')).toBeChecked(); // выбор запомнен
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

test('контрольный лист ресурсов открывается: сцены с фотографий, все ресурсы атласа со статусами', async ({ page }) => {
  await page.goto('./#/sheet');
  await expect(page.getByRole('heading', { name: 'Контрольный лист ресурсов' })).toBeVisible();
  for (const id of ['cell.player', 'cell.obstacle', 'cell.heart', 'cell.ghost', 'hud.life', 'hud.digit.0', 'hud.digit.ghost']) {
    await expect(page.locator('#sheet code', { hasText: new RegExp(`^${id.replace('.', '\\.')}$`) })).toBeVisible();
  }
  await expect(page.locator('.sheet__status--draft').first()).toBeVisible();
  await expect(page.locator('.sheet__scene')).toHaveCount(2);
  await expect(page.locator('.sheet__asset')).toHaveCount(25); // весь атлас владельца, сердечко-снаряд, слово TIME (SVG по видео) и кадр чёрта
  await expect(page.locator('.sheet__status--confirmed')).toHaveCount(0); // подтверждённых пока нет
});
