import { expect, test, type Page } from '@playwright/test';
import { marioUrl, mockReadOnlyLeaderboard } from './url';

/**
 * Детали игрушки: язык интерфейса RU/EN, справка по упаковке, шутка со шлейфом, плавный переход «только экран».
 * Состояние — из data-* игровой области.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');

async function ready(page: Page): Promise<void> {
  await page.goto(marioUrl('?power=on'));
  await expect.poll(phase(page)).toBe('ready');
}

/** Доля пикселей холста, цвет которых не равен цвету подложки LCD (#adb38c): 0 — пустой экран. */
function litShare(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const data = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs((data[i] ?? 0) - 48) < 30 && Math.abs((data[i + 1] ?? 0) - 58) < 30) lit += 1; // «чернила» сегментов #303a30
    }
    return lit / (data.length / 4);
  });
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

test('RU/EN: кнопка в уголке переключает язык панелей, диалогов и подписей; выбор запоминается', async ({ page }) => {
  await ready(page);
  const lang = page.locator('#corner-lang');
  await expect(lang).toBeVisible();
  await expect(lang).toHaveAttribute('data-lang', 'ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('#side-info').getByRole('heading', { name: 'Очки' })).toBeVisible();

  await lang.click();
  await expect(lang).toHaveAttribute('data-lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const info = page.locator('#side-info');
  await expect(info.getByRole('heading', { name: 'Score' })).toBeVisible();
  await expect(info.locator('.dcard__flabel').first()).toHaveText('Year'); // карточка устройства переведена; раздела «Controls» слева нет
  await expect(info.getByRole('heading', { name: 'Controls' })).toHaveCount(0);
  await expect(info.getByRole('heading', { name: 'Figures and enemies' })).toBeVisible();
  await expect(info.locator('#figures .fig__name').first()).toHaveText('Mario');
  await expect(info.locator('.hazard').first()).toHaveText('you fall into the river');
  const ctl = page.locator('#side-ctl');
  await expect(ctl.getByRole('heading', { name: 'Control panel' })).toBeVisible();
  await expect(ctl.getByRole('heading', { name: 'Sound', exact: true })).toBeVisible();
  await expect(ctl.getByRole('heading', { name: 'Colour', exact: true })).toBeVisible();
  await expect(ctl.getByRole('heading', { name: 'Levels' })).toBeVisible();
  await expect(page.locator('#view-screen')).toHaveAccessibleName('Screen only');
  await expect(page.locator('#view-closed')).toHaveAccessibleName('Closed');
  await expect(page.locator('#music [data-music="original"]')).toHaveText('Original');
  await expect(page.locator('#music [data-music="remaster"]')).toHaveText('Remaster');
  await expect(page.locator('#run-toggle')).toContainText('Speedrun HUD');
  await expect(page.locator('#user-level option').first()).toHaveText('Pick a level…');
  await expect(page.locator('#corner-theme')).toHaveAttribute('aria-label', 'Light theme');
  await expect(page.locator('#shell-picker [data-shell="red"]')).toHaveAccessibleName('red');
  await expect(page.locator('#corner-settings')).toHaveAttribute('title', 'Control settings');
  await expect(page.locator('#corner-help')).toHaveAttribute('aria-label', 'Game encyclopedia');
  await expect(page.locator('[data-key="up"]')).toHaveAttribute('aria-label', 'UP — jump');
  await expect(page.locator('#stage')).toHaveAttribute('aria-label', 'Crocodile Mario toy');

  // The encyclopedia is a separate page and follows the chosen language.
  await page.locator('#corner-help').click();
  await expect(page).toHaveURL(/encyclopedia/);
  await expect(page.getByRole('heading', {name:'Game encyclopedia',exact:true})).toBeVisible();
  await expect(page.locator('.gctl, .help__table')).toHaveCount(0);
  await page.goBack();
  await page.locator('#corner-settings').click();
  const settings = page.locator('#settings');
  await expect(settings.getByRole('heading', { name: 'Control settings' })).toBeVisible();
  await expect(settings.getByRole('heading', { name: 'Keyboard' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Reset controls' })).toBeVisible();
  await expect(settings.locator('tr', { hasText: 'Jump' }).first()).toContainText('Space');
  await page.keyboard.press('Escape');

  // Выбор запоминается; обратно на русский.
  await page.reload();
  await expect(page.locator('#corner-lang')).toHaveAttribute('data-lang', 'en');
  await expect(page.locator('#side-info').getByRole('heading', { name: 'Score' })).toBeVisible();
  await page.locator('#corner-lang').click();
  await expect(page.locator('#side-info').getByRole('heading', { name: 'Очки' })).toBeVisible();
  await expect(page.locator('#corner-lang')).toHaveAttribute('data-lang', 'ru');
});

test('справка слева по упаковке: фигуры, очки, чем теряется жизнь, особые функции; громкость по умолчанию 25 %', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const info = page.locator('#side-info');
  // Очки — как на упаковке: сердце 100; малый — растоптать 200, застрелить 20; большой — застрелить 400.
  // Названия врагов — по-английски даже при русском интерфейсе, как на упаковке.
  await expect(info.locator('.score__row', { hasText: 'Heart' })).toContainText('+100');
  const small = info.locator('.score__row', { hasText: 'Small devil' });
  await expect(small).toContainText('+200');
  await expect(small).toContainText('+20');
  await expect(info.locator('.score__row', { hasText: 'Big devil' })).toContainText('+400');
  // Жизнь теряется: река, чёрт, огненный дракон, ракета, железные ворота; конец игры — 4 жизни или 400 секунд.
  await expect(info.locator('.hazard')).toHaveText(['падение в реку', 'Devil съедает', 'Fiery dragon', 'Missile', 'Iron gate']);
  await expect(info).toContainText('потеряны 4 жизни или вышло время (400 секунд)');
  await expect(info.locator('.facts')).toContainText('400');
  // Схемы управления в левой панели нет: привязки — в настройках.
  await expect(info.locator('.keys__row')).toHaveCount(0);
  await page.locator('#corner-help').click();
  await expect(page.locator('#sources')).toContainText('видео');
  await expect(page.locator('.enc-article h2')).toHaveText('Crocodile Mario');
  await page.goBack();
  // Громкость по умолчанию — 25 %.
  await expect(page.locator('#volume')).toHaveValue('25');
  await expect(page.locator('#volume-row .vol__value')).toHaveText('25%');
});

test('UP — тоже прыжок (по упаковке)', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');
  const heroY = async (): Promise<number> => Number(await area(page, 'heroY'));
  const y0 = await heroY();
  await page.keyboard.press('ArrowUp');
  await expect.poll(heroY).toBeLessThan(y0);
});

test('шарнир: по две втулки с каждой стороны, на каждой одна вертикальная линия, шлейф потёрт; у винтов разные прорези', async ({ page }) => {
  await ready(page);
  const m = await page.evaluate(() => {
    const knuckles = [...document.querySelectorAll<HTMLElement>('.toy__knuckle')];
    const seam = (el: Element): { width: string; height: string; left: string } => {
      const s = getComputedStyle(el, '::before');
      return { width: s.width, height: s.height, left: s.left };
    };
    const band = document.querySelector('.toy__band') as HTMLElement;
    const wear = getComputedStyle(band, '::before').backgroundImage;
    const rots = [...document.querySelectorAll('.lid__screw')].map((s) => getComputedStyle(s).getPropertyValue('--rot').trim());
    return {
      knuckles: knuckles.length,
      seams: knuckles.map(seam),
      knuckleHeights: knuckles.map((k) => k.getBoundingClientRect().height),
      wear: wear.startsWith('url('),
      rots,
    };
  });
  expect(m.knuckles).toBe(2);
  for (const seam of m.seams) {
    // Шов — тонкая вертикальная полоса: высота многократно больше ширины. Горизонтального шва (креста) нет.
    expect(parseFloat(seam.height)).toBeGreaterThan(parseFloat(seam.width) * 8);
  }
  const crossSeam = await page.evaluate(() => getComputedStyle(document.querySelector('.toy__knuckle') as Element, '::after').backgroundImage);
  expect(crossSeam).not.toMatch(/linear-gradient\(.*rgba\(0, 0, 0, 0\.34\)/); // у «::after» только мелкие потёртости, не шов
  expect(m.wear).toBe(true);
  expect(new Set(m.rots).size).toBe(4); // прорези винтов повёрнуты по-разному
});

test('шутка со шлейфом: пока держишь — экран сначала рассыпается, потом гаснет; отпустил — всё возвращается', async ({ page }) => {
  await ready(page);
  await expect.poll(() => area(page, 'intro'), { timeout: 8000 }).toBe('off');
  await page.keyboard.press('Enter');
  await expect.poll(phase(page)).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 6000 }).toBe('off');
  const level = async (): Promise<number> => Number(await area(page, 'glitch'));
  expect(await level()).toBe(0);
  const before = await litShare(page);
  expect(before).toBeGreaterThan(0.03);

  const band = await page.locator('.toy__band').boundingBox();
  if (!band) throw new Error('Нет шлейфа');
  await page.mouse.move(band.x + band.width / 2, band.y + band.height / 2);
  await page.mouse.down();
  await expect(page.locator('.toy__band')).toHaveAttribute('data-held', '');
  await expect(page.locator('#toy')).toHaveAttribute('data-glitch', '', { timeout: 3000 });

  // Сначала частично: уровень между 0 и 1, часть картинки ещё видна.
  await expect.poll(level, { timeout: 4000 }).toBeGreaterThan(0.25);
  expect(await level()).toBeLessThan(1);
  const partial = await litShare(page);
  expect(partial).toBeLessThan(before);

  // Потом совсем: экран пуст.
  await expect.poll(level, { timeout: 5000 }).toBe(1);
  await expect.poll(() => litShare(page), { timeout: 2000 }).toBe(0);
  expect(await area(page, 'phase')).toBe('playing'); // игра идёт своим ходом, гаснет только изображение

  // Отпустил — всё восстанавливается.
  await page.mouse.up();
  await expect(page.locator('.toy__band')).not.toHaveAttribute('data-held', '');
  await expect.poll(level, { timeout: 2000 }).toBe(0);
  await expect(page.locator('#toy')).not.toHaveAttribute('data-glitch', '');
  await expect.poll(() => litShare(page), { timeout: 2000 }).toBeGreaterThan(0.03);
});

test('шутка со шлейфом: короткое касание ничего не ломает', async ({ page }) => {
  await ready(page);
  await expect.poll(() => area(page, 'intro'), { timeout: 8000 }).toBe('off');
  const band = await page.locator('.toy__band').boundingBox();
  if (!band) throw new Error('Нет шлейфа');
  await page.mouse.move(band.x + band.width / 2, band.y + band.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(Number(await area(page, 'glitch'))).toBe(0);
  expect(await litShare(page)).toBeGreaterThan(0.03);
});

test.describe('плавный переход «только экран»', () => {
  test.use({ reducedMotion: 'no-preference', viewport: { width: 1440, height: 900 } });

  test('игрушка не прыгает: ширина растёт ступенчато, нижняя половина сворачивается; обратно — так же; при загрузке без анимации', async ({ page }) => {
    await ready(page);
    const size = (): Promise<{ w: number; base: number; lid: number }> =>
      page.evaluate(() => ({
        w: (document.getElementById('toy') as HTMLElement).getBoundingClientRect().width,
        base: (document.getElementById('lower') ?? (document.querySelector('.toy__lower') as HTMLElement)).getBoundingClientRect().height,
        lid: (document.getElementById('lid') as HTMLElement).getBoundingClientRect().height,
      }));
    const whole = await size();
    await page.locator('#view-screen').click();
    // Сразу после нажатия размеры ещё почти прежние, затем меняются плавно, а не одним скачком.
    const samples: number[] = [];
    for (let i = 0; i < 14; i++) {
      samples.push((await size()).w);
      await page.waitForTimeout(60);
    }
    expect(samples[0]!).toBeLessThan(whole.w * 1.25);
    const mid = samples.filter((w) => w > whole.w * 1.15 && w < samples[samples.length - 1]! * 0.9);
    expect(mid.length).toBeGreaterThan(0); // были промежуточные кадры
    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]! - 1); // ширина не убывает
    await expect.poll(async () => (await size()).base, { timeout: 3000 }).toBeLessThan(whole.base * 0.06); // нижняя половина свернулась (остаётся запас под торец)
    await expect(page.locator('#base')).toBeHidden();
    const compact = await size();
    expect(compact.w).toBeGreaterThan(whole.w * 1.8);

    // Обратно: развёртывание тоже плавное, в конце — исходные размеры.
    await page.locator('#view-full').click();
    await expect.poll(async () => (await size()).base, { timeout: 3000 }).toBeGreaterThan(whole.base * 0.98);
    await expect.poll(async () => Math.abs((await size()).w - whole.w), { timeout: 3000 }).toBeLessThan(2);
    await expect(page.locator('#base')).toBeVisible();

    // Вид, заданный адресом, при загрузке показывается сразу, без «выезда».
    await page.goto(marioUrl('?view=screen&power=on'));
    await expect(page.locator('#toy')).toHaveAttribute('data-compact', '');
    expect((await size()).w).toBeGreaterThan(whole.w * 1.8);
    await expect.poll(() => page.evaluate(() => document.body.dataset['motion'] ?? 'on')).toBe('on'); // после первого кадра переходы включены
  });
});
