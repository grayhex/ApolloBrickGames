import { expect, test, type Page } from '@playwright/test';

/**
 * Музыка «Ремастер»: запись public/audio/remaster.m4a подменяет мелодию-пищалку; нет файла или он битый — звучит оригинал.
 * Вместо настоящего m4a тест отдаёт по этому адресу короткий WAV: браузер определяет формат по содержимому, а проверяется логика
 * загрузки, декодирования и переключения; последний тест берёт настоящий файл из public/audio и проверяет, что браузер его декодирует.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');

/** `seconds` секунд «тона» (моно, 8 кГц, 16 бит) в формате WAV (по умолчанию секунда). */
function wav(seconds = 1): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
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

test('«Ремастер» без файла или с битыми файлами (основным и запасным): тихо звучит оригинальная мелодия', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Запасной AAC настоящий и в браузере, который его декодирует, спас бы положение (см. тест про запасной файл), поэтому ломаем оба.
  await page.route('**/audio/remaster.m4a', (route) => route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('это не аудио') }));
  await page.route('**/audio/remaster-aac.m4a', (route) => route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('и это не аудио') }));
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

test('«Ремастер»: настоящий файл public/audio/remaster.m4a отдаётся и декодируется браузером', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sizes: number[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/audio/remaster.m4a')) sizes.push((await response.body()).length);
  });
  await startGame(page);
  await page.locator('#music [data-music="remaster"]').click();
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off');
  await expect.poll(() => area(page, 'musicSource'), { timeout: 15000 }).toBe('remaster'); // 3 МБ Opus в m4a декодируются целиком
  expect(sizes).toHaveLength(1);
  expect(sizes[0]).toBeGreaterThan(1_000_000);
  expect(errors).toEqual([]);
});

/**
 * Подсчёт запусков записи в настоящем браузере: каждый `AudioBufferSourceNode.start` пишется со смещением (позицией в записи, с),
 * усилители создаются в том же порядке, что в src/audio/beeper.ts: 0 общий, 1 мелодия, 2 эффекты, 3 запись.
 */
async function spyAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __trackStarts: number[]; __gains: GainNode[] };
    w.__trackStarts = [];
    w.__gains = [];
    const proto = AudioContext.prototype;
    const createBufferSource = proto.createBufferSource;
    proto.createBufferSource = function (this: AudioContext) {
      const source = createBufferSource.call(this);
      const start = source.start.bind(source);
      source.start = (when?: number, offset?: number, duration?: number) => {
        w.__trackStarts.push(offset ?? 0);
        start(when, offset, duration);
      };
      return source;
    };
    const createGain = proto.createGain;
    proto.createGain = function (this: AudioContext) {
      const gain = createGain.call(this);
      w.__gains.push(gain);
      return gain;
    };
  });
}

const trackStarts = (page: Page): Promise<number[]> => page.evaluate(() => (window as unknown as { __trackStarts: number[] }).__trackStarts.slice());
const gain = (page: Page, index: number): Promise<number> =>
  page.evaluate((i) => (window as unknown as { __gains: GainNode[] }).__gains[i]?.gain.value ?? -1, index);

async function playRemaster(page: Page, seconds = 90): Promise<void> {
  await page.route('**/audio/remaster.m4a', (route) => route.fulfill({ status: 200, contentType: 'audio/mp4', body: wav(seconds) }));
  await startGame(page);
  await page.locator('#music [data-music="remaster"]').click();
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off');
  await expect.poll(() => area(page, 'musicSource'), { timeout: 5000 }).toBe('remaster');
}

test('включение сегментов и возврат на вкладку не перезапускают музыку', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await spyAudio(page);
  await playRemaster(page);
  expect(await trackStarts(page)).toHaveLength(1);

  // Сегменты: каждое переключение перерисовывает вид, но запись продолжает идти — без нового запуска.
  for (let i = 0; i < 4; i++) {
    await page.locator(i % 2 ? '#segments-on' : '#segments-off').check();
    await page.waitForTimeout(120);
  }
  // Возврат на вкладку обновляет список карт (и вид) — запись по-прежнему не перезапускается.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(800);
  expect(await trackStarts(page)).toHaveLength(1);
  expect(await area(page, 'musicSource')).toBe('remaster');

  // То же и под «Оригинал»: пищалка не обрывается переключением сегментов.
  await page.locator('#music [data-music="original"]').click();
  await expect.poll(() => area(page, 'musicSource')).toBe('original');
  await page.locator('#segments-off').click();
  await page.waitForTimeout(200);
  expect(await trackStarts(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('музыка переключается на лету и с того же места: запись вступает не с начала', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await spyAudio(page);
  await playRemaster(page);
  const first = await trackStarts(page);
  expect(first).toHaveLength(1);
  expect(first[0]).toBeLessThan(2); // запись пошла с начала мелодии

  await page.locator('#music [data-music="original"]').click();
  await expect.poll(() => area(page, 'musicSource')).toBe('original');
  await page.waitForTimeout(2600); // пищалка играет, часы мелодии идут
  await page.locator('#music [data-music="remaster"]').click();
  await expect.poll(() => area(page, 'musicSource'), { timeout: 5000 }).toBe('remaster');
  const starts = await trackStarts(page);
  expect(starts).toHaveLength(2);
  expect(starts[1]).toBeGreaterThan(2.5); // запись вступила с места, где шла мелодия (≈ с 3-й секунды), а не с нуля
  expect(starts[1]).toBeLessThan(30);
  expect(errors).toEqual([]);
});

test('ползунки «Звук» и «Музыка»: под «Оригинал» связаны, под «Ремастер» независимы; эффекты при «Ремастере» тише', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await spyAudio(page);
  await playRemaster(page);
  const sound = page.locator('#volume');
  const music = page.locator('#music-volume');
  const saved = (): Promise<{ volume: number; musicVolume: number; music: string }> =>
    page.evaluate(() => JSON.parse(localStorage.getItem('crocodile-mario:settings:v1') ?? '{}').display);

  // «Ремастер»: ползунки независимы. Громкость записи = «Музыка» × TRACK_GAIN, эффекты идут от «Звука» и тише (SFX_REMASTER_GAIN).
  await expect(sound).toHaveValue('25');
  await expect(music).toHaveValue('25');
  await expect.poll(() => gain(page, 2)).toBeCloseTo(0.5, 3); // усилитель эффектов при «Ремастере» вдвое тише
  await music.focus();
  await page.keyboard.press('End');
  await expect(music).toHaveValue('100');
  await expect(sound).toHaveValue('25'); // «Звук» не сдвинулся
  await expect.poll(() => gain(page, 3)).toBeCloseTo(0.38, 3); // запись: 100 % × TRACK_GAIN
  await expect.poll(() => gain(page, 0)).toBeCloseTo(0.035, 3); // общий усилитель эффектов: 25 % × MASTER_GAIN
  await sound.focus();
  await page.keyboard.press('Home');
  await expect(sound).toHaveValue('0');
  await expect(music).toHaveValue('100'); // «Музыка» не сдвинулась
  await expect.poll(() => gain(page, 0)).toBe(0);
  await expect.poll(() => gain(page, 3)).toBeCloseTo(0.38, 3);
  await expect.poll(saved).toMatchObject({ volume: 0, musicVolume: 1, music: 'remaster' });
  await expect(page.locator('#blk-sound')).toHaveAttribute('data-linked', 'false');

  // «Оригинал»: ползунки связаны — оба показывают уровень «Звука», движение одного двигает и другой; эффекты — на полном усилителе.
  await page.locator('#music [data-music="original"]').click();
  await expect(page.locator('#blk-sound')).toHaveAttribute('data-linked', 'true');
  await expect(sound).toHaveValue('0');
  await expect(music).toHaveValue('0');
  await expect.poll(() => gain(page, 2)).toBe(1);
  await music.focus();
  await page.keyboard.press('ArrowRight');
  await expect(music).toHaveValue('5');
  await expect(sound).toHaveValue('5');
  await expect.poll(() => gain(page, 0)).toBeCloseTo(0.007, 3);
  // Связанный ползунок едет следом уже во время перетаскивания (событие input), а не после того, как отпустили (change).
  await music.evaluate((element: HTMLInputElement) => {
    element.value = '60';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(sound).toHaveValue('60');
  await expect(page.locator('#volume-row .vol__value')).toHaveText('60%');
  await music.evaluate((element: HTMLInputElement) => element.dispatchEvent(new Event('change', { bubbles: true })));
  await sound.focus();
  await page.keyboard.press('End');
  await expect(music).toHaveValue('100');
  await expect.poll(saved).toMatchObject({ volume: 1, musicVolume: 1, music: 'original' });

  await page.reload();
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await expect(sound).toHaveValue('100');
  await expect(music).toHaveValue('100');
  expect(errors).toEqual([]);
});

test('Opus не декодируется (как в Safari) — запись берётся из запасного AAC: «Ремастер» всё равно звучит', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const urls: string[] = [];
  await page.route('**/audio/remaster.m4a', (route) => {
    urls.push('opus');
    return route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('не декодируется') });
  });
  await page.route('**/audio/remaster-aac.m4a', (route) => {
    urls.push('aac');
    return route.fulfill({ status: 200, contentType: 'audio/mp4', body: wav(90) });
  });
  await startGame(page);
  await page.locator('#music [data-music="remaster"]').click();
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off');
  await expect.poll(() => area(page, 'musicSource'), { timeout: 8000 }).toBe('remaster');
  expect(await area(page, 'remaster')).toBe('ready');
  expect(urls).toEqual(['opus', 'aac']); // сначала основной, затем запасной
  await expect(page.locator('#music')).toHaveAttribute('data-remaster', 'ready');
  expect(errors).toEqual([]);
});

test('кнопка «Ремастер» показывает статус записи: пока грузится — пояснение, не загрузилась — значок ⚠ и подсказка', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/audio/remaster.m4a', async (route) => {
    await gate; // запись «грузится», пока тест не отпустит
    await route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('не декодируется') });
  });
  await page.route('**/audio/remaster-aac.m4a', (route) => route.fulfill({ status: 404, body: 'нет' }));
  await startGame(page);
  const button = page.locator('#music [data-music="remaster"]');
  const mark = (): Promise<string> => button.evaluate((element) => getComputedStyle(element, '::after').content);
  expect(await mark()).toBe('none'); // пока «Ремастер» не выбран, на кнопке ничего нет
  await button.click();
  await expect(page.locator('#music')).toHaveAttribute('data-remaster', 'loading');
  await expect(button).toHaveAttribute('title', /загружается/);
  expect(await mark()).toContain('…'); // в тестах «уменьшение движения»: вместо мерцания — многоточие
  release();
  await expect(page.locator('#music')).toHaveAttribute('data-remaster', 'failed'); // ни Opus, ни AAC
  await expect(button).toHaveAttribute('title', /не загрузилась или не поддерживается/);
  expect(await mark()).toContain('⚠');
  expect(await area(page, 'musicSource')).toBe('original'); // звучит оригинал, выбор сохранён
  expect(await area(page, 'music')).toBe('remaster');
  // Выбрали «Оригинал» — предупреждения на «Ремастере» нет (оно только у выбранной кнопки).
  await page.locator('#music [data-music="original"]').click();
  expect(await mark()).toBe('none');
  expect(errors).toEqual([]);
});

test('запасной файл public/audio/remaster-aac.m4a настоящий: отдаётся как MP4 и, если браузер умеет AAC, декодируется, когда основного нет', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const served: { type: string; size: number; head: string }[] = [];
  page.on('response', async (response) => {
    if (!response.url().endsWith('/audio/remaster-aac.m4a')) return;
    const body = await response.body();
    served.push({ type: response.headers()['content-type'] ?? '', size: body.length, head: body.subarray(4, 8).toString('latin1') });
  });
  await page.route('**/audio/remaster.m4a', (route) => route.fulfill({ status: 404, body: 'нет' }));
  await startGame(page);
  await page.locator('#music [data-music="remaster"]').click();
  await expect.poll(() => served.length, { timeout: 8000 }).toBe(1); // основного нет — запасной запрошен
  expect(served[0]?.head).toBe('ftyp'); // это MP4
  expect(served[0]?.size).toBeGreaterThan(1_000_000);
  expect(served[0]?.type).toMatch(/audio\/(mp4|x-m4a|aac)/);
  // Chromium, который ставит Playwright, собран без AAC (как и открытые сборки): декодирование проверяем там, где оно возможно (Chrome, Edge, Firefox, Safari).
  const aac = await page.evaluate(() => new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"'));
  if (aac !== '') {
    await page.keyboard.press('Enter');
    await expect.poll(() => area(page, 'phase')).toBe('playing');
    await expect.poll(() => area(page, 'entry'), { timeout: 8000 }).toBe('off');
    await expect.poll(() => area(page, 'musicSource'), { timeout: 15000 }).toBe('remaster');
  }
  expect(errors).toEqual([]);
});
