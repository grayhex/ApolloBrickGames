import { expect, test, type Page } from '@playwright/test';

/** Подставной AudioContext: считает, какие частоты были запущены (1-битный звук — прямоугольные сигналы). */
async function fakeAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __beeps: { freq: number; type: string }[] };
    w.__beeps = [];
    class FakeAudioContext {
      state = 'running';
      destination = {};
      get currentTime(): number {
        return performance.now() / 1000;
      }
      createGain() {
        return { gain: { value: 1 }, connect() {} };
      }
      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { value: 0 },
          connect() {},
          start() {
            w.__beeps.push({ freq: osc.frequency.value, type: osc.type });
          },
          stop() {},
        };
        return osc;
      }
      resume(): Promise<void> {
        return Promise.resolve();
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });
}

const beeps = (page: Page): Promise<{ freq: number; type: string }[]> =>
  page.evaluate(() => (window as unknown as { __beeps: { freq: number; type: string }[] }).__beeps.slice());

const led = (page: Page, name: 'Red' | 'Yellow' | 'Green'): Promise<string | undefined> =>
  page.locator('#lid').evaluate((element, key) => (element as HTMLElement).dataset[key], `led${name}`);

async function ready(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForSelector('#game-area[data-phase="ready"]');
}

test('светодиоды: готов и игра — горят все три (как на видео), пауза — жёлтый мигает', async ({ page }) => {
  await ready(page);
  await expect.poll(() => led(page, 'Red')).toBe('on');
  expect([await led(page, 'Yellow'), await led(page, 'Green')]).toEqual(['on', 'on']);
  await expect(page.locator('#lid .led--lit')).toHaveCount(3);

  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  await expect.poll(() => led(page, 'Red')).toBe('on');
  expect([await led(page, 'Yellow'), await led(page, 'Green')]).toEqual(['on', 'on']);
  await expect(page.locator('#lid .led--lit')).toHaveCount(3);

  await page.keyboard.press('Escape');
  await page.waitForSelector('#game-area[data-phase="paused"]');
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    seen.add((await led(page, 'Yellow')) ?? '');
    await page.waitForTimeout(60);
  }
  expect([...seen].sort()).toEqual(['off', 'on']);
  expect(await led(page, 'Green')).toBe('off');
  expect(await led(page, 'Red')).toBe('off');
});

test('звук: 1-битные сигналы на старт и прыжок, переключатель «Звук» глушит и запоминается', async ({ page }) => {
  await fakeAudio(page);
  await ready(page);

  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  await expect.poll(async () => (await beeps(page)).some((b) => b.freq === 1047)).toBe(true); // старт
  expect((await beeps(page)).every((b) => b.type === 'square')).toBe(true);

  await page.waitForTimeout(250); // сигнал старта звучит ~0,1 с и мелкими сигналами не прерывается
  await page.keyboard.press('Space');
  await expect.poll(async () => (await beeps(page)).some((b) => b.freq === 880)).toBe(true); // прыжок

  // Выключили звук кнопкой SOUND на корпусе: новые прыжки молчат.
  await page.locator('[data-key="sound"]').click();
  await page.waitForTimeout(700); // приземление
  const before = (await beeps(page)).length;
  await page.locator('#game-area').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  expect((await beeps(page)).length).toBe(before);

  // Выбор сохраняется между перезагрузками.
  await page.reload();
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await page.locator('#corner-settings').click();
  await expect(page.locator('#settings-sound')).not.toBeChecked(); // выбор запомнен
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-area')).toBeFocused(); // диалог закрыт, управление вернулось игре
  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  await page.waitForTimeout(300);
  expect((await beeps(page)).length).toBe(0);

  // Включили обратно — короткий сигнал-подтверждение.
  await page.locator('[data-key="sound"]').click();
  await expect.poll(async () => (await beeps(page)).length).toBeGreaterThan(0);
});
