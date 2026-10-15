import { expect, test, type Page } from '@playwright/test';

interface Beep {
  freq: number;
  type: string;
  at: number;
  glideTo: number | null;
}

/** Подставной AudioContext: записывает каждый запущенный голос (прямоугольная волна, частота, время) и уровни усилителей. */
async function fakeAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __beeps: Beep[]; __gains: { gain: { value: number } }[] };
    w.__beeps = [];
    w.__gains = [];
    class FakeAudioContext {
      state = 'running';
      destination = {};
      get currentTime(): number {
        return performance.now() / 1000;
      }
      createGain() {
        const gain = { gain: { value: 1 }, connect() {} };
        w.__gains.push(gain);
        return gain;
      }
      createOscillator() {
        const ramps: number[] = [];
        const osc = {
          type: 'sine',
          frequency: {
            value: 0,
            setValueAtTime() {},
            exponentialRampToValueAtTime(value: number) {
              ramps.push(value);
            },
          },
          connect() {},
          start(when = 0) {
            w.__beeps.push({ freq: osc.frequency.value, type: osc.type, at: when, glideTo: ramps[0] ?? null });
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

const beeps = (page: Page): Promise<Beep[]> => page.evaluate(() => (window as unknown as { __beeps: Beep[] }).__beeps.slice());
const hz = (st: number): number => Math.round(762 * 2 ** (st / 12));
const rounded = async (page: Page): Promise<number[]> => (await beeps(page)).map((b) => Math.round(b.freq));

/** Какие светодиоды горят сейчас: подмножество «RYG». */
const lit = (page: Page): Promise<string> =>
  page.locator('#lid').evaluate((element) => {
    const d = (element as HTMLElement).dataset;
    return `${d['ledRed'] === 'on' ? 'R' : ''}${d['ledYellow'] === 'on' ? 'Y' : ''}${d['ledGreen'] === 'on' ? 'G' : ''}`;
  });

async function ready(page: Page): Promise<void> {
  await page.goto('./?power=on');
  await page.waitForSelector('#game-area[data-phase="ready"]');
}

/** Игра началась и сценарий входа закончился: игрок получил управление. */
async function control(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await page.waitForSelector('#game-area[data-phase="playing"]');
  await page.waitForSelector('#game-area[data-entry="off"]', { timeout: 10_000 });
}

test('светодиоды не зависят от кнопки «Звук»: при заглушённом звуке они всё равно бегут в такт мелодии', async ({ page }) => {
  await ready(page);
  await page.locator('[data-key="sound"]').click(); // звук выключен
  await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'false');
  expect(await lit(page)).toBe(''); // комната строится в тишине: все погашены

  await control(page);
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    seen.add(await lit(page));
    await page.waitForTimeout(40);
  }
  expect(seen.has('R') && seen.has('Y') && seen.has('G')).toBe(true);
  expect([...seen].every((state) => state.length <= 1)).toBe(true);
});

test('светодиоды со звуком: в тишине (построение комнаты) погашены, под мелодию бегут по одному красный → жёлтый → зелёный', async ({ page }) => {
  await fakeAudio(page);
  await ready(page);
  await page.keyboard.press('Shift'); // жест пользователя: «разбудить» звук (клавиша не игровая)
  expect(await lit(page)).toBe('');
  await expect(page.locator('#lid .led--lit')).toHaveCount(0);

  await control(page);
  // Фанфара и мелодия: за пару секунд побывали все три светодиода, и никогда не горят двое сразу.
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    seen.add(await lit(page));
    await page.waitForTimeout(40);
  }
  expect(seen.has('R') && seen.has('Y') && seen.has('G')).toBe(true);
  expect([...seen].every((state) => state.length <= 1)).toBe(true);

  // Пауза замораживает мелодию: светодиоды переходят на условное мигание паузы (жёлтый).
  await page.keyboard.press('Escape');
  await page.waitForSelector('#game-area[data-phase="paused"]');
  const paused = new Set<string>();
  for (let i = 0; i < 24; i++) {
    paused.add(await lit(page));
    await page.waitForTimeout(60);
  }
  expect([...paused].sort()).toEqual(['', 'Y']);
});

test('звук: шаги построения, фанфара и мелодия по кругу, эффекты прыжка; мелодия не прерывается эффектами', async ({ page }) => {
  await fakeAudio(page);
  await ready(page);
  await page.keyboard.press('Shift');

  // Построение комнаты в готовности: щелчки шагов (падающий свип 3000 → 1550 Гц), мелодии ещё нет.
  await expect.poll(async () => (await beeps(page)).some((b) => b.glideTo === 1550)).toBe(true);
  expect((await beeps(page)).every((b) => b.type === 'square' || b.type === 'sine')).toBe(true);

  await control(page);
  // Фанфара запуска: ми ре ми ре до ре ми ре ми ля си до.
  const fanfare = [4, 2, 4, 2, 0, 2, 4, 2, 4, 9, 11, 12].map(hz);
  await expect
    .poll(async () => {
      const list = await rounded(page);
      for (let i = 0; i + fanfare.length <= list.length; i++) {
        if (fanfare.every((f, k) => Math.abs((list[i + k] ?? 0) - f) <= 1)) return true;
      }
      return false;
    })
    .toBe(true);

  // Дальше — мелодия: нота «ми» + «до» (аккорд) и «ре».
  await expect.poll(async () => (await rounded(page)).filter((f) => f === hz(0)).length).toBeGreaterThan(8);
  await page.waitForTimeout(800); // герой допрыгал и стоит на земле
  const countBefore = (await rounded(page)).filter((f) => f === hz(7)).length;
  await page.keyboard.press('Space'); // прыжок: «лесенка» до-ре-ми-фа-соль-фа-ми (соль есть только в прыжке)
  await expect.poll(async () => (await rounded(page)).filter((f) => f === hz(7)).length).toBeGreaterThan(countBefore);
});

test('звук: переключатель «Звук» глушит, выбор запоминается; ползунок громкости меняет уровень и сохраняется', async ({ page }) => {
  await fakeAudio(page);
  await ready(page);
  await page.keyboard.press('Shift');

  // Ползунок громкости в правом блоке: по умолчанию 25 %.
  const slider = page.locator('#volume');
  await expect(slider).toHaveValue('25');
  await expect(page.locator('#volume-row .vol__value')).toHaveText('25%');
  const master = (): Promise<number> => page.evaluate(() => (window as unknown as { __gains: { gain: { value: number } }[] }).__gains[0]?.gain.value ?? -1);
  await expect.poll(master).toBeCloseTo(0.035, 3); // 25 % × MASTER_GAIN
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('100');
  await expect.poll(master).toBeCloseTo(0.14, 3);
  await page.keyboard.press('Home');
  await expect.poll(master).toBe(0);
  await page.keyboard.press('End');
  await expect.poll(master).toBeCloseTo(0.14, 3);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('crocodile-mario:settings:v1') ?? '{}').display.volume);
  expect(saved).toBe(1);
  await page.reload();
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await expect(page.locator('#volume')).toHaveValue('100');

  // Выключили звук кнопкой «Звук»: новые голоса не создаются.
  await page.locator('#game-area').focus();
  await page.keyboard.press('Shift');
  await page.locator('[data-key="sound"]').click();
  await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#volume-row')).toHaveAttribute('data-muted', 'true');
  const before = (await beeps(page)).length;
  await page.locator('#game-area').focus();
  await control(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  expect((await beeps(page)).length).toBe(before);

  // Выбор сохраняется между перезагрузками.
  await page.reload();
  await page.waitForSelector('#game-area[data-phase="ready"]');
  await expect(page.locator('#tgl-sound')).toHaveAttribute('aria-pressed', 'false');

  // Включили обратно — короткий сигнал-подтверждение.
  const quiet = (await beeps(page)).length;
  await page.locator('[data-key="sound"]').click();
  await expect.poll(async () => (await beeps(page)).length).toBeGreaterThan(quiet);
});

test('выбор музыки откликается коротким сигналом, повторное нажатие на выбранную кнопку — нет', async ({ page }) => {
  await fakeAudio(page);
  await ready(page);
  await page.keyboard.press('Shift'); // жест пользователя: «разбудить» звук
  const count = async (): Promise<number> => (await beeps(page)).length;
  const base = await count();
  await page.locator('#music [data-music="remaster"]').click();
  await expect.poll(count).toBeGreaterThan(base); // услышать, что касание дошло: игра не идёт, смена музыки иначе на слух незаметна
  const afterRemaster = await count();
  await page.waitForTimeout(400);
  await page.locator('#music [data-music="remaster"]').click(); // уже выбрана — ничего не меняется
  await page.waitForTimeout(300);
  expect(await count()).toBe(afterRemaster);
  await page.locator('#music [data-music="original"]').click();
  await expect.poll(count).toBeGreaterThan(afterRemaster);
});

