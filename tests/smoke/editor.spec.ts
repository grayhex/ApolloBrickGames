import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Клетка карты → клиентские координаты центра клетки по текущему виду (масштаб, сдвиг, пропорция клетки). */
async function cellPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ([cx, cy]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('.map__canvas--main');
      if (!canvas) throw new Error('нет холста карты');
      const rect = canvas.getBoundingClientRect();
      const d = canvas.dataset;
      const scale = Number(d['scale']);
      return {
        x: rect.left + Number(d['tx']) + ((cx ?? 0) + 0.5) * scale,
        y: rect.top + Number(d['ty']) + ((cy ?? 0) + 0.5) * scale * Number(d['ratio']),
      };
    },
    [x, y],
  );
  return point;
}

async function rows(page: Page): Promise<string[]> {
  // Панели обновляются в следующем кадре: ждём два кадра, чтобы data-атрибуты отразили правку.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const value = await page.locator('#editor-map').getAttribute('data-rows');
  return (value ?? '').split('|');
}

async function click(page: Page, x: number, y: number): Promise<void> {
  const p = await cellPoint(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}

/** Искусственный референс (не фотография оригинала): картинка и проект лежат в docs/editor-demo. */
const ARTIFICIAL_PNG = readFileSync('docs/editor-demo/artificial-reference.png');

test.use({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });

test('редактор: демо → платформа → тест → возврат → экспорт и импорт в чистом браузере', async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./#/editor');
  await page.waitForSelector('#editor-root[data-ready="true"]');

  // 1. Открыть demo-room как редактируемую копию.
  await page.click('#editor-projects');
  await page.getByRole('button', { name: 'Новая карта…' }).click();
  await page.getByRole('button', { name: /Копия demo-room/ }).click();
  await expect(page.locator('#editor-project')).toContainText('demo-room');
  const initial = await rows(page);
  expect(initial).toHaveLength(6);
  expect(initial[5]).toBe('#############');
  expect(initial[3]).toBe('...###.......');

  // 2. Изменить платформу кистью: один мазок — одна операция отмены.
  await page.keyboard.press('b');
  const from = await cellPoint(page, 6, 2);
  const to = await cellPoint(page, 9, 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  expect((await rows(page))[2]).toBe('......####...');
  await page.click('#editor-undo');
  expect((await rows(page))[2]).toBe('.............');
  await page.click('#editor-redo');
  expect((await rows(page))[2]).toBe('......####...');

  // Ластик стирает только клетки карты.
  await page.keyboard.press('e');
  await click(page, 9, 2);
  expect((await rows(page))[2]).toBe('......###....');

  // 3. Масштаб колесом и перемещение: правка попадает в клетку под курсором.
  await page.keyboard.press('b');
  const canvasBox = await page.locator('.map__canvas--main').boundingBox();
  if (!canvasBox) throw new Error('нет холста');
  await page.mouse.move(canvasBox.x + 400, canvasBox.y + 200);
  await page.mouse.wheel(0, -300);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 380, canvasBox.y + 215);
  await page.mouse.up();
  await page.keyboard.up('Space');
  // После увеличения левые столбцы вышли за край: берём клетку, которая точно на экране.
  await click(page, 4, 1);
  expect((await rows(page))[1]).toBe('....#........');
  await page.click('#editor-undo');
  await page.getByRole('button', { name: 'Вписать' }).click();

  const edited = await rows(page);
  expect(edited[2]).toBe('......###....');

  // 4. Тестировать несохранённую карту: герой идёт по клавиатуре; карта и история не меняются.
  await page.click('#editor-test-run');
  await expect(page.locator('#test-area')).toHaveAttribute('data-phase', 'playing');
  const heroX = Number(await page.locator('#test-area').getAttribute('data-hero-x'));
  await page.locator('#test-area').focus();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  expect(Number(await page.locator('#test-area').getAttribute('data-hero-x'))).toBeGreaterThan(heroX);
  await expect(page.locator('.test__banner')).toContainText('Тестовые правила (demo)');
  await page.click('#test-back');
  await expect(page.locator('#editor-view')).toBeVisible();
  expect(await rows(page)).toEqual(edited);
  await expect(page.locator('#editor-undo')).toBeEnabled();

  // 5. Референс: искусственное фото → калибровка четырёх углов → подложка.
  await page.setInputFiles('#ref-file', { name: 'искусственный-кадр.png', mimeType: 'image/png', buffer: ARTIFICIAL_PNG });
  await expect(page.locator('.calib')).toBeVisible();
  await expect(page.locator('.calib__message')).toContainText('корректно');
  await page.screenshot({ path: testInfo.outputPath('calibration.png') });
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.locator('.calib')).toHaveCount(0);
  await expect(page.locator('#editor-map')).toHaveAttribute('data-refs', '1');
  await expect(page.locator('.refs__pick')).toContainText('откалибровано');

  // 6. Экспорт игрового JSON и проекта.
  const gameDownload = page.waitForEvent('download');
  await page.click('#editor-export-game');
  const gameFile = await (await gameDownload).path();
  const levelJson = JSON.parse(readFileSync(gameFile, 'utf-8')) as { rows: string[]; id: string };
  expect(levelJson.rows).toEqual(edited);
  expect(levelJson.id).toBe('demo-room');

  const projectDownload = page.waitForEvent('download');
  await page.click('#editor-export-project');
  const projectPath = await (await projectDownload).path();

  // 7. Черновик восстанавливается после перезагрузки.
  await page.waitForFunction(() => document.querySelector('#editor-save')?.textContent?.includes('Сохранено в браузере'));
  await page.reload();
  await page.waitForSelector('#editor-root[data-ready="true"]');
  expect(await rows(page)).toEqual(edited);
  await expect(page.locator('#editor-map')).toHaveAttribute('data-refs', '1');

  // 8. Архив восстанавливает карту и подложку в чистом хранилище другого браузера.
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const other = await fresh.newPage();
  await other.goto(page.url());
  await other.waitForSelector('#editor-root[data-ready="true"]');
  await other.setInputFiles('#editor-import', projectPath);
  await expect(other.locator('#editor-map')).toHaveAttribute('data-refs', '1');
  expect(await rows(other)).toEqual(edited);
  await expect(other.locator('.refs__pick')).toContainText('откалибровано');
  await other.screenshot({ path: testInfo.outputPath('imported.png') });
  await fresh.close();

  // 9. Повреждённый файл не заменяет рабочий документ и объясняет причину.
  await page.setInputFiles('#editor-import', { name: 'сломанный.zip', mimeType: 'application/zip', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) });
  await expect(page.locator('dialog.editor-dialog[open]')).toContainText('Рабочий документ не изменён');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  expect(await rows(page)).toEqual(edited);

  expect(errors).toEqual([]);
});

test('редактор: проблемы не дают запустить тест и указывают на клетку', async ({ page }) => {
  await page.goto('./#/editor');
  await page.waitForSelector('#editor-root[data-ready="true"]');
  // Земля поверх старта: ошибка валидатора, тест не запускается, документ не исправляется молча.
  const start = (await page.locator('#editor-map').getAttribute('data-start')) ?? '';
  const [sx, sy] = start.split(',').map(Number);
  await page.keyboard.press('b');
  await click(page, sx ?? 1, sy ?? 4);
  await expect(page.locator('#editor-map')).toHaveAttribute('data-problems', '1');
  await page.click('#editor-test-run');
  await expect(page.locator('dialog.editor-dialog[open]')).toContainText('Тест не запущен');
  await expect(page.locator('dialog.editor-dialog[open]')).toContainText('занят');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('#editor-test')).toBeHidden();
  expect(await page.locator('#editor-map').getAttribute('data-start')).toBe(start);
});

test('редактор: расширение карты вправо и второй кадр со смещением в клетках; нарисованное не теряется', async ({ page }) => {
  await page.goto('./#/editor');
  await page.waitForSelector('#editor-root[data-ready="true"]');
  const before = await rows(page);
  await page.getByRole('button', { name: /экран \(13\) вправо/ }).click();
  const wide = await rows(page);
  expect(wide.every((r) => r.length === 26)).toBe(true);
  expect(wide.map((r) => r.slice(0, 13))).toEqual(before);
  await page.getByRole('button', { name: 'Вписать' }).click();

  await page.keyboard.press('b');
  await click(page, 20, 2);
  expect((await rows(page))[2]?.[20]).toBe('#');

  // Два кадра: каждый калибруется отдельно; второй привязывается со смещением (в клетках, дробным).
  for (const name of ['кадр-1.png', 'кадр-2.png']) {
    await page.setInputFiles('#ref-file', { name, mimeType: 'image/png', buffer: ARTIFICIAL_PNG });
    await page.getByRole('button', { name: 'Готово' }).click();
  }
  await expect(page.locator('#editor-map')).toHaveAttribute('data-refs', '2');
  await expect(page.locator('.refs__pick')).toHaveCount(2);
  await page.locator('[data-field="ref-ox"]').fill('6.5');
  await page.locator('[data-field="ref-ox"]').press('Enter');
  await expect(page.locator('[data-field="ref-ox"]')).toHaveValue('6.5');
  await page.screenshot({ path: 'test-results/two-frames.png' });
  const after = await rows(page);
  expect(after[2]?.[20]).toBe('#');
  expect(after.map((r) => r.slice(0, 13))).toEqual(before);

  // Блокировка подложки: инструмент «Подложка» её не двигает, а рисование не затрагивает фото.
  await page.locator('[data-field="ref-locked"]').check();
  await page.click('[data-tool="photo"]');
  const from = await cellPoint(page, 8, 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 20);
  await page.mouse.up();
  await expect(page.locator('[data-field="ref-ox"]')).toHaveValue('6.5');
  expect(await rows(page)).toEqual(after);
});

test('редактор: тест управляется геймпадом через общий слой ввода', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __pads: unknown[] };
    w.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { value: () => w.__pads, configurable: true });
  });
  const setPad = (pressed: number[]): Promise<void> =>
    page.evaluate((pressed) => {
      const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
      (window as unknown as { __pads: unknown[] }).__pads = [
        { id: 'Editor Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] },
      ];
    }, pressed);
  const hero = async (): Promise<{ x: number; y: number }> => ({
    x: Number(await page.locator('#test-area').getAttribute('data-hero-x')),
    y: Number(await page.locator('#test-area').getAttribute('data-hero-y')),
  });

  await page.goto('./#/editor');
  await page.waitForSelector('#editor-root[data-ready="true"]');
  await page.click('#editor-test-run');
  await expect(page.locator('#test-area')).toHaveAttribute('data-phase', 'playing');
  const start = await hero();
  await setPad([1]); // активация геймпада нажатием (кнопка без действий в игре)
  await expect(page.locator('#test-area')).toHaveAttribute('data-gamepad', 'active');
  await setPad([]);
  await setPad([15]);
  await expect.poll(async () => (await hero()).x).toBeGreaterThan(start.x);
  await setPad([]);
  await setPad([0]);
  await expect.poll(async () => (await hero()).y).toBeLessThan(start.y);
  await setPad([]);
  await expect.poll(async () => (await hero()).y, { timeout: 5000 }).toBe(start.y);
  await page.click('#test-back');
  await expect(page.locator('#editor-view')).toBeVisible();
});

