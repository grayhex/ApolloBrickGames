import { expect, test, type Page } from '@playwright/test';
import { marioUrl, mockReadOnlyLeaderboard } from './url';

/**
 * Основной маршрут: тестовый уровень по видео «tunnel-run». Интро строит участок следом героя, S./P. запускает сценарий выхода
 * из туннеля (три удара головой о крышку, прыжок и шаг вправо), дальше герой бежит вправо с прокруткой и стреляет «сердечками».
 * Состояние — из data-* игровой области; эффекты и снаряды проверяются по пикселям Canvas.
 */

/** Тестовый уровень по видео открывается явно: страница по умолчанию начинается с `mario-1`. */
const TUNNEL = marioUrl('?level=tunnel-run&power=on');

const area = (page: Page, key: string): Promise<string> =>
  page.evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key);
const num = (page: Page, key: string) => async (): Promise<number> => Number(await area(page, key));
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');

/** Доля «чернильных» пикселей клетки экрана (логический холст 1728 × 864, клетка 128 × 112, поле с (32, 154)). */
function inkShare(page: Page, col: number, row: number): Promise<number> {
  return page.evaluate(
    ([c, r]) => {
      const canvas = document.getElementById('screen') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const scale = canvas.width / 1728;
      const x0 = Math.round((32 + (c as number) * 128) * scale) + 2;
      const y0 = Math.round((154 + (r as number) * 112) * scale) + 2;
      const w = Math.round(128 * scale) - 4;
      const h = Math.round(112 * scale) - 4;
      const data = ctx.getImageData(x0, y0, w, h).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs((data[i] ?? 0) - 48) < 24 && Math.abs((data[i + 1] ?? 0) - 58) < 24) ink += 1;
      }
      return ink / (data.length / 4);
    },
    [col, row] as const,
  );
}

/** Следит за клетками экрана `cols` в ряду `row` в течение `ms` и возвращает наибольшую долю «чернил» и число кадров выше порога. */
function watchInk(page: Page, cols: number[], row: number, ms: number, threshold: number): Promise<{ max: number; frames: number }> {
  return page.evaluate(
    async ({ cols, row, ms, threshold }) => {
      const canvas = document.getElementById('screen') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const scale = canvas.width / 1728;
      const w = Math.round(128 * scale) - 4;
      const h = Math.round(112 * scale) - 4;
      let max = 0;
      let frames = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        let frameMax = 0;
        for (const col of cols) {
          const data = ctx.getImageData(Math.round((32 + col * 128) * scale) + 2, Math.round((154 + row * 112) * scale) + 2, w, h).data;
          let ink = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (Math.abs((data[i] ?? 0) - 48) < 24 && Math.abs((data[i + 1] ?? 0) - 58) < 24) ink += 1;
          }
          frameMax = Math.max(frameMax, ink / (data.length / 4));
        }
        if (frameMax > threshold) frames += 1;
        max = Math.max(max, frameMax);
      }
      return { max, frames };
    },
    { cols, row, ms, threshold },
  );
}

/** Нажать S./P. и дождаться конца сценария входа: герой стоит на верхушке правой стойки, управление у игрока. */
async function startAndEnter(page: Page): Promise<void> {
  await page.goto(TUNNEL);
  await expect.poll(phase(page)).toBe('ready');
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');
}

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

test('интро: поле не закрыто текстом, герой идёт по маршруту, потом уровень построен и игра ждёт S./P.', async ({ page }) => {
  await page.goto(TUNNEL);
  await expect.poll(() => area(page, 'level')).toBe('tunnel-run');
  await expect.poll(phase(page)).toBe('ready');
  await expect(page.locator('#overlay')).toBeHidden(); // текстовых подсказок на экране нет вовсе
  await expect.poll(() => area(page, 'intro')).toBe('on');

  // Через ≈ 3 с герой уже на пути (построение началось), часть пола построена.
  await expect.poll(() => inkShare(page, 11, 5), { timeout: 6000 }).toBeGreaterThan(0.2);

  // Интро кончилось: уровень построен целиком, крышка арки на месте, игра ждёт S./P.
  await expect.poll(() => area(page, 'intro'), { timeout: 8000 }).toBe('off');
  expect(await area(page, 'phase')).toBe('ready');
  expect(await inkShare(page, 6, 5)).toBeGreaterThan(0.2); // пол
  expect(await inkShare(page, 1, 3)).toBeGreaterThan(0.2); // крышка (объект brick)
  expect(await inkShare(page, 0, 3)).toBeGreaterThan(0.2); // верх левой стойки
  expect(await inkShare(page, 9, 4)).toBeGreaterThan(0.2); // первый блок на пути
  expect(await area(page, 'heroX')).toBe('1');
  expect(await area(page, 'heroY')).toBe('5');
});

test('Enter во время интро пропускает его и сразу запускает игру', async ({ page }) => {
  await page.goto(TUNNEL);
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(() => area(page, 'intro')).toBe('on');
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  // Уровень нарисован целиком без ожидания интро.
  await expect.poll(() => inkShare(page, 6, 5)).toBeGreaterThan(0.2);
  await expect.poll(() => inkShare(page, 1, 3)).toBeGreaterThan(0.2);
});

test('старт: герой сам выходит из туннеля — копия перекладины мигает ≈ 0,25 с, на третий удар крышка исчезает, герой на стойке', async ({
  page,
}) => {
  await page.goto(TUNNEL);
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(() => area(page, 'intro'), { timeout: 8000 }).toBe('off');
  expect(await inkShare(page, 1, 2)).toBe(0);

  // Первый прыжок сценария: на 3-м такте голова упирается в крышку и над ней вспыхивает копия перекладины.
  const flash = watchInk(page, [1], 2, 700, 0.2);
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'entry')).toBe('on');
  const seen = await flash;
  expect(seen.max).toBeGreaterThan(0.2); // копия перекладины появилась
  expect(seen.frames).toBeGreaterThan(2); // и продержалась несколько кадров…
  expect(seen.frames).toBeLessThan(40); // …но не навсегда (5 тактов ≈ 0,25 с ≈ 15 кадров)

  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');

  // Конец сценария: крышка (1, 3) исчезла, стойки целы, герой на верхушке правой стойки (2, 2).
  await expect.poll(() => inkShare(page, 1, 3), { timeout: 3000 }).toBeLessThan(0.05);
  expect(await inkShare(page, 0, 3)).toBeGreaterThan(0.2);
  expect(await inkShare(page, 2, 3)).toBeGreaterThan(0.2);
  expect(await area(page, 'heroX')).toBe('2');
  expect(await area(page, 'heroY')).toBe('2');
  expect(await area(page, 'phase')).toBe('playing');
});

test('бег вправо: мир прокручивается клетками, герой остаётся в середине экрана', async ({ page }) => {
  await startAndEnter(page);
  expect(await area(page, 'cameraX')).toBe('0'); // у левого края прокрутки нет
  await page.keyboard.down('ArrowRight');
  await expect.poll(num(page, 'heroX')).toBe(8); // дальше блок в x = 9, 10
  await page.keyboard.up('ArrowRight');
  expect(await num(page, 'heroY')()).toBe(4);
  expect(await num(page, 'cameraX')()).toBe(2); // герой в столбце 6 экрана
  expect((await num(page, 'heroX')()) - (await num(page, 'cameraX')())).toBe(6);
  // Блоки на экране сдвинулись: первый блок (x = 9, 10) теперь в столбцах 7–8; на краю экрана — правая стойка (x = 2), левая (x = 0) ушла за край.
  expect(await inkShare(page, 7, 4)).toBeGreaterThan(0.2);
  expect(await inkShare(page, 8, 4)).toBeGreaterThan(0.2);
  expect(await inkShare(page, 0, 3)).toBeGreaterThan(0.2);
  expect(await inkShare(page, 1, 3)).toBeLessThan(0.05);

  // Прыжок через препятствие и бег дальше: камера идёт за героем.
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(num(page, 'heroX'), { timeout: 5000 }).toBeGreaterThan(12);
  await page.keyboard.up('ArrowRight');
  const x = await num(page, 'heroX')();
  expect(x - (await num(page, 'cameraX')())).toBe(6);
});

test('стрельба: из центра ячейки вылетает «сердечко» — до двух одновременно, летит по экрану', async ({ page }) => {
  await startAndEnter(page); // герой на верхушке стойки (2, 2), смотрит вправо; впереди ряд 2 свободен
  await page.evaluate(() => {
    const el = document.getElementById('game-area') as HTMLElement;
    const w = window as unknown as { __maxProj: number };
    w.__maxProj = 0;
    new MutationObserver(() => (w.__maxProj = Math.max(w.__maxProj, Number(el.dataset['projectiles'])))).observe(el, {
      attributes: true,
      attributeFilter: ['data-projectiles'],
    });
  });
  const flight = watchInk(page, [3, 4, 5, 6, 7, 8, 9, 10], 2, 900, 0.03);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(60);
  }
  const seen = await flight;
  expect(seen.max).toBeGreaterThan(0.03); // сердечко нарисовано в клетках справа от героя
  expect(seen.frames).toBeGreaterThan(3);
  const maxProjectiles = await page.evaluate(() => (window as unknown as { __maxProj: number }).__maxProj);
  expect(maxProjectiles).toBeGreaterThanOrEqual(1);
  expect(maxProjectiles).toBeLessThanOrEqual(2);
  await expect.poll(num(page, 'projectiles'), { timeout: 4000 }).toBe(0); // долетели до предела дальности и исчезли
});
