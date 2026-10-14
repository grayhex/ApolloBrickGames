import { expect, test, type Page } from '@playwright/test';

/**
 * Музыка «Ремастер»: запись public/audio/remaster.m4a подменяет мелодию-пищалку; нет файла или он битый — звучит оригинал.
 * Вместо настоящего m4a тест отдаёт по этому адресу короткий WAV: браузер определяет формат по содержимому, а проверяется логика
 * загрузки, декодирования и переключения (декодирование m4a / AAC — дело браузера).
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');

/** Одна секунда тишины-«тона» (моно, 8 кГц, 16 бит) в формате WAV. */
function wav(): Buffer {
  const rate = 8000;
  const samples = rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function startGame(page: Page): Promise<void> {
  await page.goto('./?power=on');
  await expect.poll(() => area(page, 'phase')).toBe('ready');
}

test('«Ремастер»: запись из public/audio/remaster.m4a играет вместо пищалки, «Оригинал» возвращает мелодию', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let requests = 0;
  await page.route('**/audio/remaster.m4a', async (route) => {
    requests += 1;
    await route.fulfill({ status: 200, contentType: 'audio/mp4', body: wav() });
  });
  await startGame(page);
  expect(await area(page, 'musicSource')).toBe('original');

  await page.locator('#music [data-music="remaster"]').click();
  await expect.poll(() => requests).toBe(1); // запись грузится при выборе, один раз
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off'); // мелодия стартует, когда игрок получил управление
  await expect.poll(() => area(page, 'musicSource'), { timeout: 5000 }).toBe('remaster');

  // Переключение на лету: оригинал возвращается, запись — снова по выбору.
  await page.locator('#music [data-music="original"]').click();
  await expect.poll(() => area(page, 'musicSource')).toBe('original');
  await page.locator('#music [data-music="remaster"]').click();
  await expect.poll(() => area(page, 'musicSource'), { timeout: 5000 }).toBe('remaster');
  expect(requests).toBe(1); // повторно запись не грузится

  // Пауза останавливает запись, продолжение возвращает.
  await page.locator('#game-area').focus();
  await page.keyboard.press('Escape');
  await expect.poll(() => area(page, 'phase')).toBe('paused');
  await expect.poll(() => area(page, 'musicSource')).toBe('original');
  await page.keyboard.press('Escape');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await expect.poll(() => area(page, 'musicSource'), { timeout: 5000 }).toBe('remaster');
  expect(errors).toEqual([]);
});

test('«Ремастер» без файла или с битым файлом: тихо звучит оригинальная мелодия', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/audio/remaster.m4a', (route) => route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('это не аудио') }));
  await startGame(page);
  await page.locator('#music [data-music="remaster"]').click();
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off');
  await page.waitForTimeout(1500);
  expect(await area(page, 'musicSource')).toBe('original');
  expect(await area(page, 'music')).toBe('remaster'); // выбор сохранён, просто записи нет
  expect(errors).toEqual([]);
});
