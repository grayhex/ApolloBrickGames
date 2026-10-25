import { expect, test, type Page } from '@playwright/test';
import { mockReadOnlyLeaderboard } from './url';

/**
 * «Морской бой» по фото и видео оригинала: заставка при включении (панель пуста), главное меню (буква, номер, рисунок), анимация пункта C,
 * сцена хода игры A, корпус нижней половины (кнопки, почти прямые подписи, стрелки, динамик). Матрицу читаем из `window.__brick`.
 */
type Brick = { cells(): Uint8Array; preview(): Uint8Array | null; screenStage: string; intro: boolean };
const brick = <T>(page: Page, read: (brick: Brick) => T): Promise<T> => page.evaluate(`(${read.toString()})(window.__brick)`) as Promise<T>;
const area = (page: Page, name: string): Promise<string> => page.evaluate((key) => document.getElementById('game-area')?.dataset[key] ?? '', name);
const key = (page: Page, id: string) => page.locator(`[data-key="${id}"]`);
const rows = (page: Page): Promise<string[]> =>
  brick(page, (b) => {
    const cells = b.cells();
    return Array.from({ length: 20 }, (_, y) => Array.from({ length: 10 }, (_, x) => (cells[y * 10 + x] ? '#' : '.')).join(''));
  });

test.beforeEach(async ({ page }) => {
  await mockReadOnlyLeaderboard(page);
  await page.goto('./?toy=seabattle&power=on&seed=7&debug');
  await expect.poll(() => area(page, 'phase')).toBe('ready');
});

test('включение: заставка без проверки экрана, панель пуста, кадры идут; кнопка ведёт в меню на игре A', async ({ page }) => {
  expect(await area(page, 'boot')).toBe('off');
  expect(await area(page, 'stage')).toBe('intro');
  expect(await brick(page, (b) => b.intro)).toBe(true);
  await expect.poll(async () => (await rows(page)).join('').includes('#'), { timeout: 3000 }).toBe(true); // после семи пустых кадров идёт анимация
  const first = await rows(page);
  await page.waitForTimeout(700);
  expect(await rows(page)).not.toEqual(first);
  await key(page, 'jump').click();
  await expect.poll(() => area(page, 'stage')).toBe('menu');
  expect(await area(page, 'symbol')).toBe('A');
  expect(await brick(page, (b) => b.intro)).toBe(false);
});

test('меню A 01: буква, номер и рисунок как на фото; C движется, остальные неподвижны', async ({ page }) => {
  await key(page, 'jump').click();
  await expect.poll(() => area(page, 'stage')).toBe('menu');
  expect((await rows(page)).slice(0, 13)).toEqual([
    '..........',
    '....###...',
    '...#...#..',
    '...#...#..',
    '...#####..',
    '...#...#..',
    '..........',
    '..........',
    '..###..#..',
    '..#.#.##..',
    '..#.#..#..',
    '..#.#..#..',
    '..###..#..',
  ]);
  const a = await rows(page);
  await page.waitForTimeout(500);
  expect(await rows(page)).toEqual(a); // у A рисунок неподвижен
  await key(page, 'jump').click();
  await key(page, 'jump').click();
  await expect.poll(() => area(page, 'symbol')).toBe('C');
  const c1 = await rows(page);
  await expect.poll(async () => (await rows(page)).slice(13).join('')).not.toBe(c1.slice(13).join('')); // лестница строится
  expect((await rows(page)).slice(0, 13)).toEqual(c1.slice(0, 13)); // буква и номер на месте
});

test('S./P. на игре A сразу начинает партию; ход — сцена с кораблём и падающей миной, результат в конце сцены', async ({ page }) => {
  await key(page, 'jump').click();
  await expect.poll(() => area(page, 'stage')).toBe('menu');
  await key(page, 'sp').click();
  await expect.poll(() => area(page, 'phase')).toBe('playing'); // заставки игры A нет: ролик game-a.MOV — геймплей
  expect(await area(page, 'stage')).toBe('game');
  const shots = (): Promise<number> => page.evaluate(`[...window.__brick.game.ownShots].filter(Boolean).length`) as Promise<number>;
  expect(await shots()).toBe(0);
  await key(page, 'jump').click(); // ROTATE — выстрел
  // Сцена по записи: корабль с мачтой в строках 11–12 и мина над ним; поле возвращается после сцены вместе с результатом выстрела.
  await expect.poll(async () => { const r = await rows(page); return r[11] === '....#.....' && r[12] === '...###....'; }, { timeout: 4000 }).toBe(true);
  expect(await shots()).toBe(0);
  await expect.poll(shots, { timeout: 6000 }).toBe(1);
  await key(page, 'fire').click(); // RESET — в меню, заставки больше нет
  await expect.poll(() => area(page, 'stage')).toBe('menu');
});

test('корпус по фото: кнопки меньше и в лунках, почти прямые подписи, клавиши-стрелки, динамик из трёх рядов', async ({ page }) => {
  const base = page.locator('#base');
  await expect(base).toHaveAttribute('data-body', 'sea');
  // Подписи идут по путям, а не плоским текстом, и почти прямые: сверху и у UP, DOWN, ROTATE — почти горизонтальны, у LEFT и RIGHT — почти вертикальны.
  const arcs = await page.locator('#base .base__art text textPath').evaluateAll((items) => items.map((item) => [item.textContent, item.getAttribute('href')]));
  expect(arcs.map(([text]) => text)).toEqual(['ON/OFF', 'S./P.', 'MUTE', 'RESET', 'UP/MODE', 'LEFT/LEVEL', 'RIGHT/SPEED', 'DOWN', 'ROTATE']);
  for (const [text, href] of arcs) {
    expect(await page.locator(`#base path${href}`).count()).toBe(1);
    const [x0, y0, , , x1, y1] = ((await page.locator(`#base path${href}`).getAttribute('d')) ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number) as [number, number, number, number, number, number];
    const vertical = text === 'LEFT/LEVEL' || text === 'RIGHT/SPEED';
    if (vertical) expect(Math.abs(x1 - x0) / Math.abs(y1 - y0), text!).toBeLessThan(0.35);
    else expect(Math.abs(y1 - y0) / Math.abs(x1 - x0), text!).toBeLessThan(0.2);
  }
  // Круглые кнопки: уже, чем у «Часов+99» (ширина 39), с лунками глубже кнопки.
  const width = await page.locator('#base .key--round').first().evaluate((el) => (el as HTMLElement).style.getPropertyValue('--w'));
  expect(Number(width)).toBeLessThan(39);
  expect(await page.locator('#base .base__dimples .base__rim-deep').count()).toBe(5);
  // Клавиши направлений — стрелки (пятиугольник острием по ходу), внутри круглая выемка без светлой обводки; объёма нет.
  const tips = await page.locator('#base .key--pad .key__shape').evaluateAll((items) => items.map((item) => item.getAttribute('d')?.slice(0, 8)));
  expect(tips).toEqual(['M20 2.5 ', 'M2.5 20 ', 'M37.5 20', 'M20 37.5']); // вверх, влево, вправо, вниз
  expect(await page.locator('#base .key--pad .key__dish').count()).toBe(4);
  expect(await page.locator('#base .key--pad .key__dish').first().evaluate((el) => getComputedStyle(el).stroke)).toBe('none');
  expect(await page.locator('#base .key--pad .key__wall').count()).toBe(0);
  expect(await page.locator('#base .key--jump .key__dish').evaluate((el) => getComputedStyle(el).stroke)).toBe('none'); // и у ROTATE выемка без белой обводки
  // Динамик: три ряда 9 + 7 + 5, симметрично относительно оси корпуса, бледные края.
  const rowsOfHoles = await page.locator('#base .base__speaker circle').evaluateAll((items) => {
    const out = new Map<string, number[]>();
    for (const item of items) out.set(item.getAttribute('cy')!, [...(out.get(item.getAttribute('cy')!) ?? []), Number(item.getAttribute('cx'))]);
    return [...out.values()].map((xs) => xs.sort((p, q) => p - q));
  });
  expect(rowsOfHoles.map((xs) => xs.length)).toEqual([9, 7, 5]);
  for (const xs of rowsOfHoles) expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(400, 1);
  expect(await page.locator('#base .base__hole--faint').count()).toBe(4 + 4 + 2);
});
