import { mockReadOnlyLeaderboard } from './url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Сами игры консолей с меню в браузере: «168 в 1 танк» — девять игр (цифры 1–9), «Морской бой» — режимы A–F. Для каждой игры: выбор в меню (ROTATE листает), запуск S./P.,
 * игра идёт (такты растут, картинка живая), клавиатура действует, на паузе горит чашка на экране, RESET возвращает в меню; слева открыта вкладка этой игры.
 * Матрицу читаем из `window.__brick` (параметр `?debug`), экран — из канвы.
 */

type Brick = { game: { cells(): Uint8Array; lives: number | null; id: string } | null; phase: string; gameId: string };
type BrickWindow = Window & { __brick: Brick };

const area = (page: Page, name: string): Promise<string> =>
  page.evaluate((key) => document.getElementById('game-area')?.dataset[key] ?? '', name).catch(() => '');
const key = (page: Page, id: string) => page.locator(`[data-key="${id}"]`);
const phase = (page: Page) => (): Promise<string> => area(page, 'phase');
const ticks = (page: Page) => async (): Promise<number> => Number(await area(page, 'tick'));

/** Матрица игры 10 × 20 (значения 0, 1, 2); пустая, пока игра не выбрана. */
const cells = (page: Page): Promise<number[]> => page.evaluate(() => Array.from((window as unknown as BrickWindow).__brick.game?.cells() ?? []));
const lit = (matrix: readonly number[], rows?: readonly [number, number]): number => {
  let count = 0;
  for (let y = rows?.[0] ?? 0; y < (rows?.[1] ?? 20); y++) for (let x = 0; x < 10; x++) if ((matrix[y * 10 + x] ?? 0) !== 0) count++;
  return count;
};
const lives = (page: Page): Promise<number | null> => page.evaluate(() => (window as unknown as BrickWindow).__brick.game?.lives ?? null);

/** Средняя непрозрачность канвы под чашкой (логические координаты 264 × 320, чашка с центром (216, 296)): на паузе чашка горит чернилами, иначе — бледный призрак. */
async function cupInk(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement;
    const k = canvas.width / 264;
    const data = canvas.getContext('2d')?.getImageData(Math.round(196 * k), Math.round(280 * k), Math.round(40 * k), Math.round(32 * k)).data;
    if (!data) return 0;
    let alpha = 0;
    for (let i = 3; i < data.length; i += 4) alpha += data[i] ?? 0;
    return alpha / (data.length / 4);
  });
}

async function hold(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
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

/** Консоль включена и ждёт выбора игры. */
async function openConsole(page: Page, toy: string): Promise<void> {
  await page.goto(`./?toy=${toy}&power=on&seed=7&debug`);
  await expect.poll(phase(page)).toBe('ready');
  await expect.poll(() => area(page, 'boot').then((boot) => boot !== 'on')).toBe(true);
  await expect.poll(() => area(page, 'menu')).toBe('menu');
  if (toy === 'seabattle') {
    // После включения идёт заставка с мелодией (панель пуста): первая кнопка ведёт в меню на той же игре.
    await expect.poll(() => area(page, 'stage')).toBe('intro');
    await key(page, 'jump').click();
    await expect.poll(() => area(page, 'stage')).toBe('menu');
    expect(await area(page, 'symbol')).toBe('A');
  }
}

/** Выбрать в меню игру с порядковым номером `index` (с 0): ROTATE листает по кругу. */
async function pick(page: Page, index: number, id: string): Promise<void> {
  for (let i = 0; i < index; i++) await key(page, 'jump').click();
  await expect.poll(() => area(page, 'game')).toBe(id);
  await expect(page.locator('#gpanel')).toHaveAttribute('data-game', id); // слева — вкладка выбранной игры
}

/** Запустить выбранную игру и дождаться, пока пройдёт «мелодия» перед уровнем. */
async function launch(page: Page): Promise<void> {
  await key(page, 'sp').click();
  await expect.poll(phase(page)).toBe('playing');
  expect(await area(page, 'menu')).toBe('game');
  await expect.poll(ticks(page)).toBeGreaterThan(130);
}

/**
 * Пауза: игра стоит; у «168 в 1 танк» чашка на экране горит только на паузе (значок паузы), у «Морского боя» — только на экране ожидания (на паузе не горит);
 * RESET возвращает в меню.
 */
async function pauseAndReset(page: Page, cup: 'pause' | 'ready'): Promise<void> {
  const playing = await cupInk(page);
  await key(page, 'sp').click();
  await expect.poll(phase(page)).toBe('paused');
  const frozen = await ticks(page)();
  await page.waitForTimeout(200);
  expect(await ticks(page)()).toBe(frozen);
  const paused = await cupInk(page);
  if (cup === 'pause') {
    expect(paused).toBeGreaterThan(playing + 20); // чашка загорелась
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('playing');
    await expect.poll(() => cupInk(page)).toBeLessThan(paused - 20); // и погасла
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('paused');
  } else {
    expect(paused).toBeLessThan(playing + 20); // на паузе чашки нет
  }
  await key(page, 'fire').click(); // RESET
  await expect.poll(() => area(page, 'menu')).toBe('menu');
  await expect.poll(phase(page)).toBe('ready');
  if (cup === 'ready') expect(await cupInk(page)).toBeGreaterThan(playing + 20); // на экране ожидания чашка горит
}

/** Игра по номеру: идентификатор, и что делать с клавиатурой, чтобы убедиться, что она отзывается. */
interface Case {
  index: number;
  id: string;
  name: string;
  play(page: Page): Promise<void>;
}

/** Кнопка огня зажата — на поле появляется мигающая клетка пули. */
async function shoots(page: Page): Promise<void> {
  const flying = page.keyboard.down('Space');
  await flying;
  await expect.poll(async () => (await cells(page)).includes(2), { timeout: 3000 }).toBe(true);
  await page.keyboard.up('Space');
}

const CASES: readonly Case[] = [
  {
    index: 0,
    id: 'tank',
    name: 'Танки',
    async play(page) {
      const before = await cells(page);
      await hold(page, 'ArrowRight', 400);
      expect(await cells(page)).not.toEqual(before); // танк повернулся и поехал
      await page.keyboard.press('Space'); // ROTATE — огонь (снаряд танка — обычная горящая клетка, отличить её от врагов по картинке нельзя)
    },
  },
  {
    index: 1,
    id: 'frog',
    name: 'Лягушка',
    async play(page) {
      const frogRow = async (): Promise<number> => {
        const matrix = await cells(page);
        for (let y = 19; y >= 0; y--) for (let x = 0; x < 10; x++) if (matrix[y * 10 + x] === 2) return y;
        return -1;
      };
      expect(await frogRow()).toBe(19); // лягушка мигает в нижней строке
      const livesBefore = await lives(page);
      await page.keyboard.press('ArrowUp');
      await expect.poll(async () => (await frogRow()) < 19 || (await lives(page)) !== livesBefore, { timeout: 3000 }).toBe(true);
    },
  },
  {
    index: 2,
    id: 'racing',
    name: 'Гонки',
    async play(page) {
      const bottom = async (): Promise<string> => (await cells(page)).slice(160).join('');
      const before = await bottom();
      await page.keyboard.press('ArrowLeft');
      await expect.poll(bottom).not.toBe(before); // машина сменила полосу
    },
  },
  {
    index: 3,
    id: 'racing-shooting',
    name: 'Гонки со стрельбой',
    async play(page) {
      const bottom = async (): Promise<string> => (await cells(page)).slice(160).join('');
      const before = await bottom();
      await page.keyboard.press('ArrowLeft');
      await expect.poll(bottom).not.toBe(before);
    },
  },
  {
    index: 4,
    id: 'shooting-array',
    name: 'Стрельба по массиву и точкам',
    async play(page) {
      expect(lit(await cells(page), [0, 10])).toBeGreaterThan(10); // стена кирпичей наверху
      const before = (await cells(page)).slice(180).join('');
      await hold(page, 'ArrowLeft', 200);
      expect((await cells(page)).slice(180).join('')).not.toBe(before); // орудие сдвинулось
      await shoots(page);
    },
  },
  {
    index: 5,
    id: 'shooting-figures',
    name: 'Стрельба по фигурам',
    async play(page) {
      expect(lit(await cells(page), [0, 8])).toBeGreaterThan(2); // фигура сверху
      await shoots(page);
    },
  },
  {
    index: 6,
    id: 'construction',
    name: 'Строитель',
    async play(page) {
      expect(lit(await cells(page), [0, 10])).toBeGreaterThan(0); // стена сверху
      await shoots(page);
    },
  },
  {
    index: 7,
    id: 'tetris',
    name: 'Тетрис',
    async play(page) {
      const before = await cells(page);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Space'); // ROTATE
      await page.waitForTimeout(100);
      expect(await cells(page)).not.toEqual(before);
      await hold(page, 'ArrowDown', 1400); // посадка удержанием DOWN
      await expect.poll(async () => lit(await cells(page), [16, 20]), { timeout: 3000 }).toBeGreaterThan(0); // фигура легла на дно
    },
  },
  {
    index: 8,
    id: 'tetris-pentix',
    name: 'Тетрис Pentix',
    async play(page) {
      await page.keyboard.press('ArrowRight');
      await hold(page, 'ArrowDown', 1400);
      await expect.poll(async () => lit(await cells(page), [16, 20]), { timeout: 3000 }).toBeGreaterThanOrEqual(3);
    },
  },
];

test.describe('«168 в 1 танк»: девять игр играют в браузере', () => {
  for (const item of CASES) {
    test(`${item.index + 1} — ${item.name}: выбор в меню, запуск, управление, чашка на паузе, RESET`, async ({ page }) => {
      await openConsole(page, 'tank168');
      await pick(page, item.index, item.id);
      await launch(page);
      expect(await lives(page)).toBe(item.id === 'tetris' || item.id === 'tetris-pentix' ? null : 4);
      expect(lit(await cells(page))).toBeGreaterThan(0);
      await item.play(page);
      expect(await area(page, 'phase')).toBe('playing');
      await pauseAndReset(page, 'pause');
    });
  }
});

test.describe('«Морской бой»: режимы A–F', () => {
  const SEA: readonly { index: number; letter: string; id: string }[] = [
    { index: 1, letter: 'B', id: 'tank' },
    { index: 3, letter: 'D', id: 'tetris-big' },
    { index: 4, letter: 'E', id: 'tetris' },
    { index: 5, letter: 'F', id: 'arkanoid' },
  ];
  for (const item of SEA) {
    test(`${item.letter} — ${item.id}: играет, пауза с чашкой, RESET`, async ({ page }) => {
      await openConsole(page, 'seabattle');
      await pick(page, item.index, item.id);
      expect(await area(page, 'symbol')).toBe(item.letter);
      await launch(page);
      expect(lit(await cells(page))).toBeGreaterThan(0);
      const before = await cells(page);
      await hold(page, 'ArrowRight', 300);
      await hold(page, 'ArrowDown', 1400);
      await page.waitForTimeout(150);
      expect(await cells(page)).not.toEqual(before);
      await pauseAndReset(page, 'pause');
    });
  }

  test('A и C запускаются: корабли и лестница; RESET возвращает в меню', async ({ page }) => {
    await openConsole(page, 'seabattle');
    await expect.poll(() => area(page, 'game')).toBe('sea-battle');
    await key(page, 'sp').click();
    await expect.poll(() => area(page, 'stage')).toBe('attract'); // анимация игры A, партия начнётся по следующей кнопке
    expect(await area(page, 'phase')).toBe('ready');
    await key(page, 'sp').click();
    await expect.poll(() => area(page, 'phase')).toBe('playing');
    await page.keyboard.press('KeyZ');
    await expect.poll(() => page.evaluate(() => {
      const game = (window as unknown as { __brick: { game: { ownShots: Uint8Array } } }).__brick.game;
      return [...game.ownShots].filter(Boolean).length;
    })).toBe(1);
    await key(page, 'fire').click();
    await key(page, 'jump').click(); await key(page, 'jump').click();
    await expect.poll(() => area(page, 'game')).toBe('romeo-juliet');
    await key(page, 'sp').click();
    await expect.poll(() => area(page, 'phase')).toBe('playing');
    await hold(page, 'ArrowDown', 1400);
    await expect.poll(() => page.evaluate(() => {
      const game = (window as unknown as { __brick: { game: { board: Uint8Array } } }).__brick.game;
      return [...game.board].filter(Boolean).length;
    })).toBeGreaterThan(7);
  });
});

test.describe('игры помнят настройки меню', () => {
  test('скорость и уровень из меню доходят до игры; после конца игры S./P. начинает ту же игру', async ({ page }) => {
    await openConsole(page, 'tank168');
    await pick(page, 7, 'tetris');
    for (let i = 0; i < 3; i++) await key(page, 'right').click(); // SPEED 3 на экране, в игре — 4
    await key(page, 'left').click(); // LEVEL 1, в игре — 2
    await launch(page);
    expect(await area(page, 'speed')).toBe('3');
    expect(await area(page, 'level')).toBe('1');
    const inGame = await page.evaluate(() => {
      const game = (window as unknown as { __brick: { game: { speed: number; level: number } | null } }).__brick.game;
      return [game?.speed, game?.level];
    });
    expect(inGame).toEqual([4, 2]);
    await key(page, 'fire').click();
    await expect.poll(() => area(page, 'menu')).toBe('menu');
    expect(await area(page, 'game')).toBe('tetris');
  });
});

test('«Часы+99»: все десять игр запускаются, включая двузначный пункт, TIME/GAME возвращает в меню', async ({ page }) => {
  await page.goto('./?toy=clock99&view=full&power=on&debug&seed=7');
  await expect.poll(() => area(page, 'boot')).toBe('off');
  const ids = ['tetris', 'racing', 'shooting', 'tank', 'frog', 'racing-shooting', 'shooting-figures', 'construction', 'tetris-pentix', 'arkanoid'];
  for (let i = 0; i < ids.length; i++) {
    await expect.poll(() => area(page, 'game')).toBe(ids[i]);
    await expect.poll(() => area(page, 'symbol')).toBe(String(i + 1));
    await key(page, 'sp').click();
    await expect.poll(phase(page)).toBe('playing');
    expect((await cells(page)).length).toBe(200);
    await key(page, 'fire').click();
    await expect.poll(() => area(page, 'menu')).toBe('menu');
    await key(page, 'jump').click();
  }
  await expect.poll(() => area(page, 'symbol')).toBe('1');
});
