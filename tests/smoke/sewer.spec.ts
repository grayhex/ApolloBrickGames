import { expect, test, type Page } from '@playwright/test';
import { marioUrl } from './url';

/**
 * Колодцы (видео геймплея 178–216 с): в уровнях 2–9 есть щель между двумя одиночными трубами с сердцем; провалившийся герой попадает в комнату —
 * с большим чёртом (нечётные уровни) или с бонусными сердцами (чётные); после победы (чёрт уничтожен / сердца собраны) его переносит в комнату выхода
 * из тоннеля, а оттуда правый край возвращает за правую трубу. Состояние — из data-* игровой области;
 * герой переносится к колодцу отладочным `window.__game` (страница с `?debug`): проход всего уровня до колодца в браузере — слишком долгий.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');

type DebugWindow = Window & {
  __game: {
    state: { hero: { x: number; y: number; airborne: boolean }; objects: { id: string; x: number; y: number; active: boolean }[] };
    level: { def: { objects: { id: string; type: string; x: number; params: Record<string, number> }[] } };
  };
};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

/** Игра на уровне n началась и сценарий входа отыгран: герой под управлением. */
async function play(page: Page, n: number): Promise<{ x: number; returnX: number }> {
  await page.goto(marioUrl(`?level=${n}&power=on&debug`));
  await expect.poll(() => area(page, 'phase')).toBe('ready');
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await expect.poll(() => area(page, 'entry')).toBe('off');
  return page.evaluate(() => {
    const well = (window as unknown as DebugWindow).__game.level.def.objects.find((o) => o.type === 'sewer');
    if (!well) throw new Error('в уровне нет колодца');
    return { x: well.x, returnX: well.params['returnX'] as number };
  });
}

/** Герой над щелью колодца (падает в него). */
async function dropIntoWell(page: Page, wellX: number): Promise<void> {
  await page.evaluate((x) => {
    const hero = (window as unknown as DebugWindow).__game.state.hero;
    hero.x = x;
    hero.y = 1;
    hero.airborne = false;
  }, wellX);
}

test('уровень 3: провалился в колодец — комната с большим чёртом; победа переносит в комнату выхода, правый край возвращает за правую трубу, колодец закрыт', async ({ page }) => {
  const well = await play(page, 3);
  expect(await area(page, 'level')).toBe('mario-3');
  await dropIntoWell(page, well.x);
  await expect.poll(() => area(page, 'level')).toBe('mario-3-boss');
  expect(await area(page, 'score')).toBe('100'); // сердце в щели
  expect(await area(page, 'phase')).toBe('playing');
  expect(await area(page, 'cameraX')).toBe('0'); // комната в один экран: камера не едет
  const boss = await page.evaluate(() => (window as unknown as DebugWindow).__game.state.objects.find((o) => o.id === 'boss'));
  expect(boss).toMatchObject({ active: true });

  // Победа: чёрт уничтожен — героя переносит в комнату выхода из тоннеля.
  await page.evaluate(() => {
    const devil = (window as unknown as DebugWindow).__game.state.objects.find((o) => o.id === 'boss');
    if (devil) devil.active = false;
  });
  await expect.poll(() => area(page, 'level')).toBe('sewer-exit');
  expect(await area(page, 'cameraX')).toBe('0');
  expect(await area(page, 'phase')).toBe('playing');
  // Правый край — выход на уровень.
  await page.evaluate(() => {
    const hero = (window as unknown as DebugWindow).__game.state.hero;
    hero.x = 10;
    hero.y = 4;
  });
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => area(page, 'level')).toBe('mario-3');
  await page.keyboard.up('ArrowRight');
  expect(Number(await area(page, 'heroX'))).toBeGreaterThanOrEqual(well.returnX);
  expect(await area(page, 'heroY')).toBe('4');
  expect(await area(page, 'score')).toBe('100');
  const closed = await page.evaluate(() => (window as unknown as DebugWindow).__game.state.objects.find((o) => o.id === 'well1')?.active);
  expect(closed).toBe(false);
});

test('уровень 2: колодец ведёт в комнату, заполненную бонусными сердцами; когда все собраны, переносит в комнату выхода из тоннеля', async ({ page }) => {
  const well = await play(page, 2);
  await dropIntoWell(page, well.x);
  await expect.poll(() => area(page, 'level')).toBe('mario-2-bonus');
  // Герой падает через ряды 1–4 по столбцу 2 и по дороге собирает сердца: +100 из щели колодца и ещё по сердцу на ряд.
  await expect.poll(async () => Number(await area(page, 'score'))).toBeGreaterThanOrEqual(300);
  const hearts = await page.evaluate(() => (window as unknown as DebugWindow).__game.state.objects.filter((o) => o.id.startsWith('h') && o.active).length);
  expect(hearts).toBeLessThan(52);
  expect(hearts).toBeGreaterThan(44);
  // Остальные сердца собраны — переносит в комнату выхода.
  await page.evaluate(() => {
    for (const o of (window as unknown as DebugWindow).__game.state.objects) if (o.id.startsWith('h')) o.active = false;
  });
  await expect.poll(() => area(page, 'level')).toBe('sewer-exit');
});

test('гибель в комнате колодца: уровень начинается заново с начала, сердце в щели снова на месте, колодец открыт', async ({ page }) => {
  const well = await play(page, 3);
  await dropIntoWell(page, well.x);
  await expect.poll(() => area(page, 'level')).toBe('mario-3-boss');
  // Чёрт прямо над героем у пола: пикирует и убивает.
  await page.evaluate(() => {
    const game = (window as unknown as DebugWindow).__game;
    const devil = game.state.objects.find((o) => o.id === 'boss');
    if (devil) {
      devil.x = 6;
      devil.y = 3;
    }
    game.state.hero.x = 6;
    game.state.hero.y = 4;
  });
  await expect.poll(() => area(page, 'phase'), { timeout: 5000 }).toBe('dead');
  await expect.poll(() => area(page, 'level'), { timeout: 8000 }).toBe('mario-3');
  expect(await area(page, 'lives')).toBe('3');
  const state = await page.evaluate(() => {
    const game = (window as unknown as DebugWindow).__game;
    return { heart: game.state.objects.find((o) => o.x === game.level.def.objects.find((d) => d.type === 'sewer')?.x && o.y === 3)?.active, well: game.state.objects.find((o) => o.id === 'well1')?.active };
  });
  expect(state).toEqual({ heart: true, well: true });
});
