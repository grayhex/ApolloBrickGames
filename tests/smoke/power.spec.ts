import { expect, test, type Page } from '@playwright/test';
import { marioUrl, mockReadOnlyLeaderboard } from './url';

/**
 * Питание и жизни по упаковке оригинала: игрушка при открытии страницы выключена и включается кнопкой ON/OFF;
 * после старта 4 жизни, а LEFT + DOWN вместе до того, как Марио выпрыгнет из колодца, дают 200.
 */

const area = (page: Page, key: string): Promise<string> =>
  page.evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key);
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const lit = (page: Page): Promise<string> =>
  page.locator('#lid').evaluate((element) => {
    const d = (element as HTMLElement).dataset;
    return `${d['ledRed'] === 'on' ? 'R' : ''}${d['ledYellow'] === 'on' ? 'Y' : ''}${d['ledGreen'] === 'on' ? 'G' : ''}`;
  });

/** Есть ли на экране хоть один «чернильный» пиксель (цвет ячеек LCD #303a30). */
const inkPixels = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs((data[i] ?? 0) - 48) < 12 && Math.abs((data[i + 1] ?? 0) - 58) < 12 && Math.abs((data[i + 2] ?? 0) - 48) < 12) ink += 1;
    }
    return ink;
  });

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

test('по умолчанию игрушка выключена: экран пуст, светодиоды погашены, время игры стоит; ON/OFF включает, Enter до этого ничего не запускает', async ({ page }) => {
  await page.goto(marioUrl('?view=full'));
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await expect(page.locator('#toy')).toHaveAttribute('data-power', 'off');
  expect(await area(page, 'phase')).toBe('ready');
  expect(await area(page, 'intro')).toBe('off');
  expect(await lit(page)).toBe('');
  expect(await inkPixels(page)).toBe(0); // пустой экран: ни блоков, ни подписи, ни значков жизни

  // Игра не идёт: время стоит; Enter (S./P.) выключенную игрушку не запускает.
  const tick = await area(page, 'tick');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  expect(await area(page, 'tick')).toBe(tick);
  expect(await area(page, 'phase')).toBe('ready');
  expect(await area(page, 'power')).toBe('off');

  // Кнопка ON/OFF: питание включилось, началось интро (построение комнаты), экран ожил.
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect.poll(() => area(page, 'intro')).toBe('on');
  await expect.poll(() => inkPixels(page), { timeout: 8000 }).toBeGreaterThan(100);
  expect(await area(page, 'level')).toBe('mario-1');
  expect(await area(page, 'lives')).toBe('4'); // по упаковке: после старта 4 жизни

  // Теперь старт работает; повторное нажатие ON/OFF снова гасит экран.
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await expect.poll(() => inkPixels(page)).toBe(0);
});

test('клавиша O включает и выключает питание так же, как кнопка ON/OFF', async ({ page }) => {
  await page.goto(marioUrl('?view=full'));
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.keyboard.press('KeyO');
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await page.keyboard.press('KeyO');
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
});

test('выбор уровня на пульте включает игрушку и запускает этот уровень', async ({ page }) => {
  await page.goto(marioUrl('?view=full'));
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.locator('#original-levels .lv').nth(2).click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect.poll(() => area(page, 'level')).toBe('mario-3');
  expect(await area(page, 'hud')).toBe('1-03');
});

test('в режиме «только экран» кнопок нет: выключенную игрушку включает касание экрана', async ({ page }) => {
  await page.goto(marioUrl('?view=full'));
  await page.locator('#view-screen').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.locator('#game-area').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await page.locator('#game-area').click(); // следующее касание — S./P.
  await expect.poll(phase(page)).toBe('playing');
});

test('технические страницы всегда включены (кнопок корпуса там нет)', async ({ page }) => {
  await page.goto('./#/tech');
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect.poll(phase(page)).toBe('ready');
});

test('секрет: LEFT + DOWN вместе до выхода из колодца — 200 жизней (значки жизни мигают); одной клавишей нельзя', async ({ page }) => {
  await page.goto(marioUrl('?power=on'));
  await expect.poll(phase(page)).toBe('ready');
  expect(await area(page, 'lives')).toBe('4');

  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(300);
  expect(await area(page, 'lives')).toBe('4'); // одна клавиша — ничего
  await page.keyboard.down('ArrowDown');
  await expect.poll(() => area(page, 'lives')).toBe('200');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowDown');

  // Игра с 200 жизнями идёт как обычно: старт, сценарий выхода из ямы, герой на правой стойке.
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');
  expect(await area(page, 'heroX')).toBe('2');
  expect(await area(page, 'heroY')).toBe('2');
  expect(await area(page, 'lives')).toBe('200');
});

test('секрет во время сценария входа (герой бьётся головой о крышку колодца): аккорд засчитывается и не мешает выходу', async ({ page }) => {
  await page.goto(marioUrl('?power=on'));
  await expect.poll(phase(page)).toBe('ready');
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'entry')).toBe('on');
  expect(await area(page, 'lives')).toBe('4');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowDown');
  await expect.poll(() => area(page, 'lives')).toBe('200');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowDown');
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');
  expect(await area(page, 'heroX')).toBe('2');
  expect(await area(page, 'heroY')).toBe('2');
});

test('после выхода из колодца аккорд ничего не даёт', async ({ page }) => {
  await page.goto(marioUrl('?power=on'));
  await expect.poll(phase(page)).toBe('ready');
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing'); // иначе «сценарий не идёт» увидится в тот такт, когда игра ещё не началась
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowDown');
  expect(await area(page, 'lives')).toBe('4');
});
