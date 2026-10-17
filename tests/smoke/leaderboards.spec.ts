import { test, expect, type Page } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { validateConfig } from '../../src/config/schema';
import { categoryFor, RULESET_VERSION, STANDARD_START } from '../../src/leaderboards/category';
const category = categoryFor({ gameId: 'dance', mode: 0, toyId: 'brickgame', rulesetVersion: RULESET_VERSION, startProfile: STANDARD_START });
const RUN = '12345678-1234-4123-8123-123456789abc';
async function setup(page: Page, options: { offline?: boolean; finishFail?: boolean; publishFail?: boolean } = {}) {
  const config = validateConfig(defaults);
  config.toys.brickgame.games = [{ id: 'dance' }];
  config.toys.brickgame.defaultGame = 'dance';
  await page.route('**/api/config', (r) => r.fulfill({ json: { revision: 1, config } }));
  const requests: { path: string; data: Record<string, unknown> }[] = [];
  let finishFailures = options.finishFail ? 1 : 0;
  let publishFailures = options.publishFail ? 1 : 0;
  await page.route('**/api/leaderboards/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.split('/').at(-1)!;
    const data = request.method() === 'POST' ? (request.postDataJSON() as Record<string, unknown>) : {};
    requests.push({ path, data });
    if (options.offline) {
      await route.abort('failed');
      return;
    }
    if (path === 'top') {
      await route.fulfill({
        json: {
          category: url.searchParams.get('category'),
          entries: Array.from({ length: 20 }, (_, i) => ({
            rank: i + 1,
            nickname: i === 0 ? '<svg/onload=x>' : `Player ${i}`,
            score: 1000 - i,
            toyId: ['brickgame', 'clock99', 'seabattle', 'tank168'][i % 4],
          })),
        },
      });
      return;
    }
    if (path === 'session') {
      await route.fulfill({ json: { enabled: true, siteKey: 'test-site-key' } });
      return;
    }
    if (path === 'runs') {
      await route.fulfill({ status: 201, json: { runId: RUN, category: categoryFor(data), expiresAt: Date.now() + 86400000 } });
      return;
    }
    if (path === 'finish' && finishFailures-- > 0) {
      await route.abort('failed');
      return;
    }
    if (path === 'publish' && publishFailures-- > 0) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ json: path === 'publish' ? { ok: true, best: true } : { ok: true } });
  });
  // A fresh token is minted only by execute(), using the run's cData.
  await page.addInitScript(() => {
    const callbacks = new Map<string, Record<string, unknown>>();
    let sequence = 0;
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: (_container: HTMLElement, options: Record<string, unknown>) => {
        const id = String(++sequence);
        callbacks.set(id, options);
        return id;
      },
      execute: (id: string) => {
        const o = callbacks.get(id)!;
        (o['callback'] as (token: string) => void)(`fresh-${id}-${o['cData']}`);
      },
      remove: (id: string) => callbacks.delete(id),
    };
  });
  return requests;
}
async function boot(page: Page, query = '?toy=brickgame&power=on'): Promise<void> {
  await page.goto(`./${query}`);
  await expect(page.locator('#game-area')).toHaveAttribute('data-boot', 'off');
}
async function playAndLose(page: Page): Promise<void> {
  await page.locator('[data-key=sp]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  // Four intentionally incorrect early dance inputs; no debug/state mutation or manual seed.
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-key=up]').click();
    if (i < 3) await page.waitForTimeout(1100);
  }
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'over');
}
test('TOP-5 expands to 20, keeps nicknames as text, and shows model SVG tooltips in both languages/themes', async ({ page }) => {
  await setup(page);
  await boot(page);
  await expect(page.locator('#leaderboard tbody tr')).toHaveCount(5);
  await expect(page.locator('#leaderboard tbody svg')).toHaveCount(5);
  await expect(page.locator('#leaderboard .leaderboard__nick').first()).toHaveText('<svg/onload=x>');
  await expect(page.locator('#leaderboard .leaderboard__nick svg')).toHaveCount(0);
  await expect(page.locator('.leaderboard__toy').first()).toHaveAttribute('title', 'Brick Game');
  await page.getByRole('button', { name: 'Показать TOP-20', exact: true }).click();
  await expect(page.locator('#leaderboard tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Свернуть до 5', exact: true }).click();
  await page.locator('#corner-theme').click();
  await expect(page.locator('#leaderboard-title')).toHaveText('Рекорды');
  await page.locator('#corner-lang').click();
  await expect(page.locator('#leaderboard-title')).toHaveText('High scores');
  await expect(page.locator('#leaderboard .leaderboard__caption')).toContainText('Variant 1');
});
test('standard run registers canonical parameters, freezes score, publishes voluntarily with a fresh token, remembers only nickname', async ({
  page,
}) => {
  const requests = await setup(page);
  await boot(page);
  expect(requests.filter((r) => r.path === 'runs')).toHaveLength(0);
  await playAndLose(page);
  await expect(page.locator('#leaderboard-nickname')).toBeVisible();
  expect(requests.filter((r) => r.path === 'publish')).toHaveLength(0);
  expect(requests.find((r) => r.path === 'runs')!.data).toMatchObject({
    gameId: 'dance',
    toyId: 'brickgame',
    mode: 0,
    startProfile: STANDARD_START,
    rulesetVersion: RULESET_VERSION,
  });
  expect(requests.find((r) => r.path === 'finish')!.data).toMatchObject({ runId: RUN, category, score: 0 });
  await page.locator('#leaderboard-nickname').fill('Игрок_42');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('#leaderboard')).toContainText('Результат опубликован');
  const published = requests.find((r) => r.path === 'publish')!.data;
  expect(published).toEqual({ category, runId: RUN, nickname: 'Игрок_42', token: `fresh-1-${RUN}` });
  const values = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.includes('leaderboard'))));
  expect(values).toEqual({ 'brick-game:leaderboard-nickname': 'Игрок_42' });
});
test('failed finish can retry without changing score, and failed network never blocks gameplay', async ({ page }) => {
  const requests = await setup(page, { finishFail: true });
  await boot(page);
  await playAndLose(page);
  await expect(page.locator('#leaderboard')).toContainText('Не удалось отправить');
  await page.locator('#leaderboard').getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.locator('#leaderboard-nickname')).toBeVisible();
  expect(requests.filter((r) => r.path === 'finish').map((r) => r.data['score'])).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Не сейчас', exact: true }).click();
  await expect(page.locator('#leaderboard-nickname')).toHaveCount(0);
  expect(requests.filter((r) => r.path === 'publish')).toHaveLength(0);
});
for (const extra of ['&debug', '&seed=7'])
  test(`${extra}: practice game never starts a ranked run`, async ({ page }) => {
    const requests = await setup(page);
    await boot(page, `?toy=brickgame&power=on${extra}`);
    await page.locator('[data-key=sp]').click();
    await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
    await expect(page.locator('#leaderboard')).toContainText('Вне рейтинга');
    expect(requests.filter((r) => r.path === 'runs' || r.path === 'session')).toHaveLength(0);
  });
test('offline rating stays below the game on mobile and does not intercept cabinet controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { offline: true });
  await boot(page);
  await expect(page.locator('#leaderboard')).toContainText('Рейтинг временно недоступен');
  const bounds = await page.locator('#stage,#leaderboard').evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().toJSON()));
  expect(bounds[1]!.top).toBeGreaterThanOrEqual(bounds[0]!.bottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('[data-key=sp]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  await page.locator('[data-key=sp]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'paused');
});
test('menu subsets use canonical mode in the displayed board and registration', async ({ page }) => {
  const requests = await setup(page);
  const config = validateConfig(defaults);
  config.toys.clock99.games = [{ id: 'tetris', modes: [5, 2] }];
  config.toys.clock99.defaultGame = 'tetris';
  await page.route('**/api/config', (r) => r.fulfill({ json: { config, revision: 1 } }));
  await boot(page, '?toy=clock99&power=on');
  await expect(page.locator('#leaderboard .leaderboard__caption')).toContainText('Вариант 6');
  await page.locator('[data-key=sp]').click();
  await expect.poll(() => requests.find((r) => r.path === 'runs')?.data['mode']).toBe(5);
});

test('admin moderates and exports records separately with the existing key, safely displays names', async ({ page }) => {
  await setup(page);
  let hidden = 0;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/admin/leaderboards/**', async (route) => {
    expect(route.request().headers()['authorization']).toBe('Bearer test-admin-key');
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/hide')) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      writes.push(body);
      hidden = body['hidden'] ? 1 : 0;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json: {
        category: 'test',
        entries: [{ entryId: RUN, nickname: '<svg/onload=x>', score: 123, toyId: 'brickgame', acceptedAt: Date.now(), sequence: 1, hidden }],
        next: null,
      },
    });
  });
  await page.goto('./admin');
  await page.getByLabel('Ключ администратора', { exact: true }).fill('test-admin-key');
  const admin = page.locator('.admin__leaderboards');
  await admin.getByRole('button', { name: 'Загрузить записи', exact: true }).click();
  await expect(admin.locator('.admin__record')).toHaveCount(1);
  await expect(admin.locator('.admin__record svg')).toHaveCount(0);
  await admin.getByRole('button', { name: 'Скрыть', exact: true }).click();
  await expect(admin.getByRole('button', { name: 'Показать', exact: true })).toBeVisible();
  expect(writes[0]).toMatchObject({ entryId: RUN, hidden: true });
  const download = page.waitForEvent('download');
  await admin.getByRole('button', { name: 'Экспорт JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('leaderboard.json');
  await expect(admin).toContainText('Экспортировано 1 записей');
});

test('nonstandard menu level keeps play local and does not register a run', async ({ page }) => {
  const requests = await setup(page);
  await boot(page);
  await page.locator('[data-key=left]').click();
  await page.locator('[data-key=sp]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#leaderboard')).toContainText('Вне рейтинга');
  expect(requests.filter((r) => r.path === 'runs')).toHaveLength(0);
});

test('publication retries use a new challenge token with the same immutable run', async ({ page }) => {
  const requests = await setup(page, { publishFail: true });
  await boot(page);
  await playAndLose(page);
  await page.locator('#leaderboard-nickname').fill('Retry');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('#leaderboard')).toContainText('Не удалось отправить');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('#leaderboard')).toContainText('Результат опубликован');
  const sent = requests.filter((r) => r.path === 'publish').map((r) => r.data);
  expect(sent).toHaveLength(2);
  expect(sent[0]!['runId']).toBe(sent[1]!['runId']);
  expect(sent[0]!['token']).not.toBe(sent[1]!['token']);
});

test('Mario registers a standard full game without importing a local record', async ({ page }) => {
  const requests = await setup(page);
  await page.goto('./?toy=mario&power=on');
  await page.locator('body:not([data-booting])').waitFor();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','ready');
  await page.locator('[data-key=sp]').click();
  await expect.poll(() => requests.find((r) => r.path === 'runs')?.data['gameId']).toBe('mario');
  expect(requests.find((r) => r.path === 'runs')!.data).toMatchObject({ gameId: 'mario', toyId: 'mario', mode: 0, startProfile: STANDARD_START });
  expect(requests.filter((r) => r.path === 'finish' || r.path === 'publish')).toHaveLength(0);
});

test('Mario bonus-lives secret keeps gameplay intact but opts the run out of global scores', async ({ page }) => {
  const requests = await setup(page);
  await page.goto('./?toy=mario&power=on');
  await page.locator('body:not([data-booting])').waitFor();
  await page.locator('#game-area').focus();
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowDown');
  await expect(page.locator('#game-area')).toHaveAttribute('data-lives', '200');
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowLeft');
  await page.locator('[data-key=sp]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#leaderboard')).toContainText('Вне рейтинга');
  expect(requests.filter((r) => r.path === 'runs')).toHaveLength(0);
});

test('Mario keeps one ranked run through pause and all four lives, then registers a new party', async ({ page }) => {
  test.setTimeout(90000);
  const requests = await setup(page);
  await page.goto('./?toy=mario&power=on');
  await page.locator('body:not([data-booting])').waitFor();
  const area = page.locator('#game-area');
  await area.focus();
  for (let lives = 4; lives > 0; lives--) {
    await expect(area).toHaveAttribute('data-lives', String(lives));
    await page.keyboard.press('Enter');
    await expect(area).toHaveAttribute('data-phase', 'playing');
    await expect.poll(() => requests.filter((r) => r.path === 'runs').length).toBe(1);
    if (lives === 4) {
      await page.keyboard.press('Escape');
      await expect(area).toHaveAttribute('data-phase', 'paused');
      await page.keyboard.press('Escape');
      await expect(area).toHaveAttribute('data-phase', 'playing');
    }
    await page.keyboard.down('ArrowRight');
    await expect(area).not.toHaveAttribute('data-phase', 'playing', { timeout: 20000 });
    await page.keyboard.up('ArrowRight');
    if (lives > 1) await expect(area).toHaveAttribute('data-phase', 'ready', { timeout: 10000 });
  }
  await expect(area).toHaveAttribute('data-phase', 'gameOver');
  await expect(page.locator('#leaderboard-nickname')).toBeVisible();
  expect(requests.filter((r) => r.path === 'runs')).toHaveLength(1);
  expect(requests.filter((r) => r.path === 'finish')).toHaveLength(1);
  expect(requests.find((r) => r.path === 'finish')!.data['runId']).toBe(RUN);
  await area.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => requests.filter((r) => r.path === 'runs').length).toBe(2);
  await expect(page.locator('#leaderboard-nickname')).toHaveCount(0);
});

test('Frogger restart melodies after lost lives do not create new ranked parties', async ({ page }) => {
  test.setTimeout(60000);
  const requests = await setup(page);
  const config = validateConfig(defaults);
  config.toys.brickgame.games = [{ id: 'frog' }];
  config.toys.brickgame.defaultGame = 'frog';
  await page.route('**/api/config', (route) => route.fulfill({ json: { config, revision: 1 } }));
  await boot(page);
  await page.locator('[data-key=sp]').click();
  await expect.poll(() => requests.filter((r) => r.path === 'runs').length).toBe(1);
  await page.locator('#game-area').focus();
  // Walking past the edge loses a life; holding left repeats after each natural respawn.
  await page.keyboard.down('ArrowLeft');
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'over', { timeout: 45000 });
  await page.keyboard.up('ArrowLeft');
  await expect(page.locator('#leaderboard-nickname')).toBeVisible();
  expect(requests.filter((r) => r.path === 'runs')).toHaveLength(1);
  expect(requests.filter((r) => r.path === 'finish')).toHaveLength(1);
});
