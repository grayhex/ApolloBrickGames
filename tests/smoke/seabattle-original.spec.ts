import { expect, test, type Page } from '@playwright/test';
import { mockReadOnlyLeaderboard } from './url';

/**
 * «Морской бой» по фото и видео оригинала: заставка при включении (панель пуста), главное меню (буква, номер, рисунок), анимация пункта C,
 * анимация игры A перед партией, корпус нижней половины (кнопки, дуги подписей, стрелки, динамик). Матрицу читаем из `window.__brick`.
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

test('S./P. на игре A: анимация с NEXT, любая кнопка начинает партию', async ({ page }) => {
  await key(page, 'jump').click();
  await expect.poll(() => area(page, 'stage')).toBe('menu');
  await key(page, 'sp').click();
  await expect.poll(() => area(page, 'stage')).toBe('attract');
  expect(await area(page, 'phase')).toBe('ready');
  expect(await brick(page, (b) => b.preview() !== null)).toBe(true);
  await key(page, 'left').click();
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  expect(await area(page, 'stage')).toBe('game');
  await key(page, 'fire').click(); // RESET — в меню, заставки больше нет
  await expect.poll(() => area(page, 'stage')).toBe('menu');
});

test('корпус по фото: кнопки меньше и в лунках, подписи дугами, клавиши-стрелки, динамик из трёх рядов', async ({ page }) => {
  const base = page.locator('#base');
  await expect(base).toHaveAttribute('data-body', 'sea');
  // Подписи идут по путям (дуги), а не плоским текстом.
  const arcs = await page.locator('.base__art text textPath').evaluateAll((items) => items.map((item) => [item.textContent, item.getAttribute('href')]));
  expect(arcs.map(([text]) => text)).toEqual(['ON/OFF', 'S./P.', 'MUTE', 'RESET', 'UP/MODE', 'LEFT/LEVEL', 'RIGHT/SPEED', 'DOWN', 'ROTATE']);
  for (const [, href] of arcs) expect(await page.locator(`path${href}`).count()).toBe(1);
  // Круглые кнопки: уже, чем у «Часов+99» (ширина 39), с лунками глубже кнопки.
  const width = await page.locator('.key--round').first().evaluate((el) => (el as HTMLElement).style.getPropertyValue('--w'));
  expect(Number(width)).toBeLessThan(39);
  expect(await page.locator('.base__dimples .base__rim-deep').count()).toBe(5);
  // Клавиши направлений — пятиугольные стрелки остриём по направлению хода.
  const tips = await page.locator('.key--pad .key__shape').evaluateAll((items) => items.map((item) => item.getAttribute('d')?.slice(0, 7)));
  expect(tips).toEqual(['M20 2.5', 'M2.5 20', 'M37.5 2', 'M20 37.']); // вверх, влево, вправо, вниз
  // Динамик: три ряда 9 + 7 + 5, симметрично относительно оси корпуса, бледные края.
  const rowsOfHoles = await page.locator('.base__speaker circle').evaluateAll((items) => {
    const out = new Map<string, number[]>();
    for (const item of items) out.set(item.getAttribute('cy')!, [...(out.get(item.getAttribute('cy')!) ?? []), Number(item.getAttribute('cx'))]);
    return [...out.values()].map((xs) => xs.sort((p, q) => p - q));
  });
  expect(rowsOfHoles.map((xs) => xs.length)).toEqual([9, 7, 5]);
  for (const xs of rowsOfHoles) expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(400, 1);
  expect(await page.locator('.base__hole--faint').count()).toBe(4 + 4 + 2);
});
