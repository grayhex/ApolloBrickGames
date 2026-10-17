import { expect, test, type Page } from '@playwright/test';
import { marioUrl } from './url';

/**
 * Закрытая раскладушка: игрушка при каждой загрузке закрыта, на крышке логотип Apollo; щелчок по крышке (или Enter / пробел)
 * раскрывает её с анимацией; вид выбирается в блоке «Вид» пульта и не запоминается.
 */

const area = (page: Page, key: string): Promise<string> =>
  page
    .evaluate((name) => document.getElementById('game-area')?.dataset[name] ?? '', key)
    .catch(() => '');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});

test.use({ viewport: { width: 1440, height: 900 } });

/** Страница загружена и приложение запущено (обработчики клавиш вешаются после загрузки данных). */
async function load(page: Page, query = ''): Promise<void> {
  await page.goto(marioUrl(query));
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
}

test('по умолчанию игрушка закрыта: на крышке логотип Apollo, экран и кнопки недоступны, место крышки схлопнуто', async ({ page }) => {
  await load(page);
  const toy = page.locator('#toy');
  await expect(toy).toHaveAttribute('data-view', 'closed');
  await expect(toy).toHaveAttribute('data-closed', '');
  await expect(page.locator('#view-closed')).toHaveAttribute('aria-pressed', 'true');

  const cover = page.locator('#lid-cover');
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAccessibleName('Открыть игрушку');
  // Логотип — картинка из присланных файлов; на синем корпусе — вариант с белой надписью.
  const logo = cover.locator('.lid__logo--white');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', /apollo-logo-white-caption\.svg$/);
  await expect(cover.locator('.lid__logo--red')).toBeHidden();
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // Под закрытой крышкой экран и кнопки не получают ни фокус, ни клавиши.
  await expect(page.locator('#lid-front')).toHaveJSProperty('inert', true);
  await expect(page.locator('#lower')).toHaveJSProperty('inert', true);
  await expect(cover).toHaveJSProperty('inert', false);

  // Закрытая игрушка занимает ровно нижнюю половину: она ниже открытой и целиком в окне, без прокрутки.
  const fit = await page.evaluate(() => {
    const rect = (document.getElementById('toy') as HTMLElement).getBoundingClientRect();
    const cover = (document.getElementById('lid-cover') as HTMLElement).getBoundingClientRect();
    const base = (document.getElementById('base') as HTMLElement).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, innerH: window.innerHeight, scrollH: document.documentElement.scrollHeight, coverTop: cover.top, coverBottom: cover.bottom, coverH: cover.height, coverW: cover.width, baseTop: base.top, baseBottom: base.bottom };
  });
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.bottom).toBeLessThanOrEqual(fit.innerH);
  expect(fit.scrollH).toBeLessThanOrEqual(fit.innerH + 1);
  // По фото закрытой игрушки: две втулки шарнира слева и справа выглядывают над верхней кромкой, посередине ничего нет (шлейф скрыт).
  const hinge = await page.evaluate(() => {
    const top = (selector: string): DOMRect[] => [...document.querySelectorAll<HTMLElement>(selector)].map((e) => e.getBoundingClientRect());
    const cover = (document.getElementById('lid-cover') as HTMLElement).getBoundingClientRect();
    const band = document.querySelector<HTMLElement>('.toy__band') as HTMLElement;
    return { knuckles: top('.toy__knuckle'), coverTop: cover.top, coverLeft: cover.left, coverRight: cover.right, bandOpacity: Number(getComputedStyle(band).opacity) };
  });
  expect(hinge.knuckles).toHaveLength(2);
  const [left, right] = hinge.knuckles as [DOMRect, DOMRect];
  expect(left.top).toBeLessThan(hinge.coverTop - 8); // выступают над кромкой крышки
  expect(right.top).toBeLessThan(hinge.coverTop - 8);
  expect(left.right).toBeLessThan(right.left - 40); // между ними — пустой промежуток
  expect(left.left).toBeGreaterThan(hinge.coverLeft);
  expect(right.right).toBeLessThan(hinge.coverRight);
  expect(hinge.bandOpacity).toBe(0); // посередине ничего нет
  // Оборот лежит поверх верхней части нижней половины (крышка почти квадратная), снизу виден «подбородок».
  expect(fit.coverTop).toBeGreaterThanOrEqual(fit.baseTop - 14); // чуть выше нижней половины: накрывает шарнир
  expect(fit.coverBottom).toBeLessThan(fit.baseBottom - 40);
  expect(fit.coverH / fit.coverW).toBeGreaterThan(0.85);
  expect(fit.coverH / fit.coverW).toBeLessThan(1.1);
});

test('логотип подбирается под корпус: красная надпись на жёлтом и белом, белая на синем и красном', async ({ page }) => {
  await load(page);
  for (const [shell, caption] of [
    ['blue', 'white'],
    ['red', 'white'],
    ['yellow', 'red'],
    ['white', 'red'],
  ] as const) {
    await page.locator(`#shell-picker [data-shell="${shell}"]`).click();
    await expect(page.locator('#toy')).toHaveAttribute('data-shell', shell);
    await expect(page.locator(`#lid-cover .lid__logo--${caption}`)).toBeVisible();
    await expect(page.locator(`#lid-cover .lid__logo--${caption === 'white' ? 'red' : 'white'}`)).toBeHidden();
  }
});

test('щелчок по крышке раскрывает игрушку: видны экран и кнопки, вид «Полная»', async ({ page }) => {
  await load(page);
  await page.locator('#lid-cover').click();
  const toy = page.locator('#toy');
  await expect(toy).toHaveAttribute('data-view', 'full');
  await expect(toy).not.toHaveAttribute('data-closed', '');
  await expect(page.locator('#view-full')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#lid-front')).toHaveJSProperty('inert', false);
  await expect(page.locator('#lid-cover')).toHaveJSProperty('inert', true);
  await expect(page.locator('#lcd-window')).toBeVisible();
  await expect(page.locator('#base')).toBeVisible();
  await expect(page.locator('#game-area')).toBeFocused(); // клавиатура у игры
  // Игрушка выключена, как и раньше: включает ON/OFF.
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
});

test('Enter и пробел раскрывают закрытую игрушку; пока она закрыта, клавиши игре не принадлежат', async ({ page }) => {
  await load(page);
  await page.keyboard.press('KeyO'); // питание под закрытой крышкой не включается
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');

  await load(page);
  await page.keyboard.press('Space');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
});

test('с клавиатуры: Tab доходит до крышки, Enter на ней раскрывает игрушку', async ({ page }) => {
  await load(page);
  await page.locator('#lid-cover').focus();
  await expect(page.locator('#lid-cover')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
});

test('«Свёрнута» из пульта закрывает крышку выключенной игрушки; из закрытого можно сразу в «только экран»', async ({ page }) => {
  await load(page);
  await page.locator('#lid-cover').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  await expect(page.locator('#view-closed')).not.toHaveAttribute('aria-disabled', 'true'); // игрушка выключена — закрыть можно
  await page.locator('#view-closed').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-closed', '');
  await page.locator('#view-screen').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-compact', '');
  await expect(page.locator('#toy')).not.toHaveAttribute('data-closed', '');
  await expect(page.locator('#base')).toBeHidden();
});

test('включённую игрушку закрыть нельзя: «Свёрнута» недоступна, пока игра не выключена кнопкой ON/OFF', async ({ page }) => {
  await load(page, '?power=on');
  await expect.poll(() => area(page, 'phase')).toBe('ready');
  const closed = page.locator('#view-closed');
  // Игра включена (даже на экране «Старт») — крышку закрыть нельзя, кнопка объясняет почему.
  await expect(closed).toHaveAttribute('aria-disabled', 'true');
  await expect(closed).toHaveAttribute('title', /сначала выключите/i);
  await closed.click({ force: true }); // aria-disabled: Playwright иначе ждёт «доступности» кнопки, а нам нужен сам щелчок
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  await page.keyboard.press('Enter');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await closed.click({ force: true });
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  await expect.poll(() => area(page, 'phase')).toBe('playing'); // игра не прервана
  // Другие виды доступны и при включённой игре.
  await page.locator('#view-screen').click();
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
  await expect(closed).toHaveAttribute('aria-disabled', 'true');
  await page.locator('#view-full').click();

  // Явно выключили — крышку закрыть можно.
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await expect(closed).not.toHaveAttribute('aria-disabled', 'true');
  await closed.click();
  await expect(page.locator('#toy')).toHaveAttribute('data-closed', '');
  // Включение при закрытой крышке невозможно (кнопки под ней недоступны), а выбор уровня на пульте раскрывает игрушку.
  await page.locator('#original-levels [data-level="2"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  await expect(closed).toHaveAttribute('aria-disabled', 'true');
});

test('?view=closed и ?view=screen задают вид явно; включённая игрушка (?power=on) не бывает закрытой', async ({ page }) => {
  await load(page, '?view=closed');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'closed');
  await load(page, '?power=on&view=closed');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
  await load(page, '?view=screen');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'screen');
  await load(page, '?power=on');
  await expect(page.locator('#toy')).toHaveAttribute('data-view', 'full');
});

test.describe('загрузка страницы', () => {
  // Пока данные грузятся, страница спрятана; первый показанный кадр — сразу финишный вид, а не промежуточный (открытая игрушка,
  // пустые панели, потом закрытая): раньше на секунду была видна полная игра.
  for (const [query, view] of [
    ['', 'closed'],
    ['?view=screen&power=on', 'screen'],
    ['?view=full', 'full'],
  ] as const) {
    test(`с первого показанного кадра виден финишный вид «${view}» (${query || 'по умолчанию'})`, async ({ page }) => {
      await page.route('**/content/room/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      });
      await page.addInitScript(() => {
        interface Row {
          view: string | undefined;
          closed: boolean;
          infoKids: number;
          ctlKids: number;
        }
        const shown: Row[] = [];
        (window as unknown as { __shown: Row[] }).__shown = shown;
        const sample = (): void => {
          const shell = document.querySelector('.shell');
          const toy = document.getElementById('toy');
          if (shell && toy && getComputedStyle(shell).visibility !== 'hidden') {
            shown.push({
              view: toy.dataset['view'],
              closed: toy.hasAttribute('data-closed'),
              infoKids: document.getElementById('side-info')?.childElementCount ?? 0,
              ctlKids: document.getElementById('side-ctl')?.childElementCount ?? 0,
            });
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.goto(marioUrl(query), { waitUntil: 'commit' });
      await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
      await page.waitForTimeout(300);
      const shown = await page.evaluate(() => (window as unknown as { __shown: { view: string; closed: boolean; infoKids: number; ctlKids: number }[] }).__shown);
      expect(shown.length).toBeGreaterThan(2); // кадров немного: в безголовом Chromium крупный экран рисуется ≈ 20 раз в секунду — важно, что каждый показанный кадр уже финишный
      for (const row of shown) {
        expect(row.view).toBe(view);
        expect(row.closed).toBe(view === 'closed');
        expect(row.infoKids).toBeGreaterThan(0); // панели уже заполнены
        expect(row.ctlKids).toBeGreaterThan(0);
      }
      await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
    });
  }

  test('сбой запуска показывает страницу с блоком ошибки, а не пустой экран', async ({ page }) => {
    await page.route('**/content/room/pack.json', (route) => route.fulfill({ status: 404, body: 'нет' }));
    await page.goto(marioUrl(''));
    await expect(page.locator('#fatal')).toBeVisible();
    await expect(page.locator('body')).not.toHaveAttribute('data-booting', /.*/);
    (page as Page & { __errors?: string[] }).__errors?.splice(0); // ошибки загрузки здесь ожидаемы
  });
});

test.describe('раскрытие с анимацией', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('крышка поворачивается плавно (промежуточные положения), игрушка при этом меняет размер; при загрузке — без анимации', async ({ page }) => {
    await load(page);
    await expect.poll(() => page.evaluate(() => document.body.dataset['motion'] ?? 'on')).toBe('on');
    const frame = (): Promise<{ matrix: string; w: number; slot: number }> =>
      page.evaluate(() => ({
        matrix: getComputedStyle(document.getElementById('lid') as HTMLElement).transform,
        w: (document.getElementById('toy') as HTMLElement).getBoundingClientRect().width,
        slot: (document.getElementById('lid-slot') as HTMLElement).getBoundingClientRect().height,
      }));
    const closed = await frame();
    expect(closed.matrix).not.toBe('none');
    expect(closed.slot).toBeLessThan(4); // место крышки схлопнуто

    await page.locator('#lid-cover').click();
    const samples: { matrix: string; w: number; slot: number }[] = [];
    for (let i = 0; i < 22; i++) {
      samples.push(await frame());
      await page.waitForTimeout(60);
    }
    const distinct = new Set(samples.map((s) => s.matrix));
    expect(distinct.size).toBeGreaterThan(4); // поворот шёл по кадрам, а не одним скачком
    // Место крышки раскрывается постепенно и в конце равно её высоте; ширина игрушки уменьшается (открытая выше закрытой).
    expect(samples.some((s) => s.slot > 20 && s.slot < samples[samples.length - 1]!.slot * 0.9)).toBe(true);
    await expect.poll(async () => (await frame()).slot, { timeout: 3000 }).toBeGreaterThan(200);
    const open = await frame();
    expect(open.w).toBeLessThan(closed.w);
    expect(open.matrix === 'none' || /^matrix(3d)?\(/.test(open.matrix)).toBe(true);

    // Геометрия: ось поворота крышки (её нижняя кромка) всё время совпадает с шарниром — нижней кромкой схлопывающегося места крышки.
    // Раньше конечное значение transform «уплывало» вместе с размером игрушки, переход перезапускался и крышка отрывалась от шарнира.
    await page.locator('#view-closed').click();
    await expect.poll(async () => (await frame()).slot, { timeout: 3000 }).toBeLessThan(4);
    await page.waitForTimeout(300);
    await page.locator('#lid-cover').click();
    const pivot = (): Promise<{ gap: number; transforms: number; slot: number; height: number }> =>
      page.evaluate(() => {
        const lid = document.getElementById('lid') as HTMLElement;
        const m = new DOMMatrix(getComputedStyle(lid).transform);
        const slot = (document.getElementById('lid-slot') as HTMLElement).getBoundingClientRect().height;
        const height = lid.offsetHeight;
        // Нижняя кромка крышки в слое слота: высота − сдвиг вверх; она должна лежать ровно на нижней границе слота.
        return {
          gap: Math.abs(height + m.m42 - slot),
          // Menu hover transitions are independent; only the lid must have a single rotation transition.
          transforms: document.getAnimations().filter((a) =>
            (a.effect as KeyframeEffect | null)?.target === lid &&
            (a as CSSTransition).transitionProperty === 'transform').length,
          slot,
          height,
        };
      });
    const pivots: { gap: number; transforms: number; slot: number; height: number }[] = [];
    for (let i = 0; i < 16; i++) {
      pivots.push(await pivot());
      await page.waitForTimeout(55);
    }
    for (const p of pivots) {
      // Сложенная крышка лежит чуть ниже линии шарнира (на 4,3 % своей высоты, чтобы втулки выглядывали из-за её кромки, а стояли на месте):
      // это расстояние сходит на нет к концу поворота; ось поворота не должна уходить дальше.
      expect(p.gap).toBeLessThan(p.height * 0.045 + 3);
      expect(p.transforms).toBeLessThanOrEqual(1); // один переход, а не цепочка перезапусков
    }
    expect(pivots.some((p) => p.slot > 30 && p.slot < p.height - 30)).toBe(true); // проверены и промежуточные кадры
    await expect.poll(async () => (await pivot()).slot, { timeout: 3000 }).toBeGreaterThan(200);

    // Втулки шарнира на месте всегда; шлейф проявляется, как только крышка прошла зону шарнира (встала ребром), а не после полной
    // остановки: раньше шарнир и шлейф «выскакивали» в самом конце, когда крышка давно стояла.
    await page.locator('#view-closed').click();
    await expect.poll(async () => (await frame()).slot, { timeout: 3000 }).toBeLessThan(4);
    await page.waitForTimeout(600); // поворот закончился
    await page.locator('#lid-cover').click();
    const hingeOpacity = (): Promise<{ knuckle: number; band: number; slot: number; z: string }> =>
      page.evaluate(() => ({
        knuckle: Number(getComputedStyle(document.querySelector('.toy__knuckle') as HTMLElement).opacity),
        band: Number(getComputedStyle(document.querySelector('.toy__band') as HTMLElement).opacity),
        slot: (document.getElementById('lid-slot') as HTMLElement).getBoundingClientRect().height,
        z: getComputedStyle(document.getElementById('lid-slot') as HTMLElement).zIndex,
      }));
    const opening: { knuckle: number; band: number; slot: number; z: string }[] = [];
    for (let i = 0; i < 16; i++) {
      opening.push(await hingeOpacity());
      await page.waitForTimeout(45);
    }
    for (const o of opening) expect(o.knuckle).toBe(1); // втулки не мигают и не прячутся
    // Пока крышка ещё лежит на корпусе (место крышки меньше трети), шлейфа нет; когда она уже поднялась больше чем наполовину, он виден.
    expect(opening.some((o) => o.slot < open.slot * 0.3 && o.band === 0)).toBe(true);
    expect(opening.some((o) => o.slot > open.slot * 0.6 && o.slot < open.slot * 0.97 && o.band >= 0.9)).toBe(true);
    // Слой «крышка / шарнир» меняется после прохода ребром, а не в самом конце.
    expect(opening.some((o) => o.slot > open.slot * 0.6 && o.slot < open.slot * 0.97 && o.z === '1')).toBe(true);
    await expect.poll(async () => (await hingeOpacity()).band, { timeout: 3000 }).toBe(1);

    // Обратно: тоже плавно.
    await page.locator('#view-closed').click();
    const back: number[] = [];
    for (let i = 0; i < 22; i++) {
      back.push((await frame()).slot);
      await page.waitForTimeout(60);
    }
    expect(back.some((v) => v > 20 && v < open.slot * 0.9)).toBe(true);
    await expect.poll(async () => (await frame()).slot, { timeout: 3000 }).toBeLessThan(4);
  });

  test('шарнир и шлейф не двигаются сами по себе: стоят на месте и появляются сразу, а не вырастают и не доезжают', async ({ page }) => {
    await load(page);
    interface Row {
      knuckle: number;
      band: number;
      hinge: number;
      opacity: number;
      visibility: string;
    }
    // По кадрам перехода: положение втулки и шлейфа относительно верха нижней половины и высота шарнира — в долях ширины игрушки
    // (она меняется по ходу перехода), прозрачность шлейфа и видимость шарнира.
    const sample = (selector: string): Promise<Row[]> =>
      page.evaluate(
        (click) =>
          new Promise<Row[]>((resolve) => {
            const toy = document.getElementById('toy') as HTMLElement;
            const base = document.getElementById('base') as HTMLElement;
            const hinge = toy.querySelector('.toy__hinge') as HTMLElement;
            const knuckle = toy.querySelector('.toy__knuckle') as HTMLElement;
            const band = toy.querySelector('.toy__band') as HTMLElement;
            const rows: Row[] = [];
            const start = performance.now();
            (document.querySelector(click) as HTMLElement).click();
            const tick = (): void => {
              const w = toy.getBoundingClientRect().width;
              const baseTop = base.getBoundingClientRect().top;
              rows.push({
                knuckle: (knuckle.getBoundingClientRect().top - baseTop) / w,
                band: (band.getBoundingClientRect().top - baseTop) / w,
                hinge: hinge.getBoundingClientRect().height / w,
                opacity: Number(getComputedStyle(band).opacity),
                visibility: getComputedStyle(hinge).visibility,
              });
              if (performance.now() - start < 1900) requestAnimationFrame(tick);
              else resolve(rows);
            };
            requestAnimationFrame(tick);
          }),
        selector,
      );
    const spread = (rows: Row[], key: 'knuckle' | 'band' | 'hinge'): number => Math.max(...rows.map((r) => r[key])) - Math.min(...rows.map((r) => r[key]));
    for (const selector of ['#lid-cover', '#view-screen', '#view-full', '#view-closed']) {
      const rows = await sample(selector);
      expect(rows.length).toBeGreaterThan(20);
      // Втулка, шлейф и сам шарнир не сдвигаются и не меняют размер относительно корпуса ни на кадр (допуск — округление).
      expect(spread(rows, 'knuckle'), `втулка при ${selector}`).toBeLessThan(0.004);
      expect(spread(rows, 'band'), `шлейф при ${selector}`).toBeLessThan(0.004);
      expect(spread(rows, 'hinge'), `шарнир при ${selector}`).toBeLessThan(0.004);
      // Шлейф не проявляется плавно: за переход он либо включается, либо выключается сразу.
      for (const row of rows) expect([0, 1], `прозрачность шлейфа при ${selector}`).toContain(row.opacity);
      // Видимость шарнира меняется не больше одного раза за переход.
      let switches = 0;
      rows.forEach((row, i) => {
        if (i > 0 && row.visibility !== rows[i - 1]!.visibility) switches += 1;
      });
      expect(switches).toBeLessThanOrEqual(1);
      await page.waitForTimeout(200);
    }
  });

  test('при смене вида боковые панели стоят на месте, страница не прокручивается и не меняет ширину', async ({ page }) => {
    await load(page);
    interface Row {
      ctl: number;
      info: number;
      scrollable: boolean;
      width: number;
    }
    const sample = (selector: string): Promise<Row[]> =>
      page.evaluate(
        (click) =>
          new Promise<Row[]>((resolve) => {
            const ctl = document.getElementById('side-ctl') as HTMLElement;
            const info = document.getElementById('side-info') as HTMLElement;
            const rows: Row[] = [];
            const start = performance.now();
            (document.querySelector(click) as HTMLElement).click();
            const tick = (): void => {
              const root = document.documentElement;
              rows.push({
                ctl: ctl.getBoundingClientRect().top,
                info: info.getBoundingClientRect().top,
                scrollable: root.scrollHeight > root.clientHeight + 1,
                width: root.clientWidth,
              });
              if (performance.now() - start < 2100) requestAnimationFrame(tick);
              else resolve(rows);
            };
            requestAnimationFrame(tick);
          }),
        selector,
      );
    for (const selector of ['#lid-cover', '#view-screen', '#view-full', '#view-closed', '#view-screen', '#view-closed']) {
      const rows = await sample(selector);
      const first = rows[0];
      expect(first).toBeDefined();
      for (const row of rows) {
        expect(row.ctl, `${selector}: пульт не ездит по вертикали`).toBeCloseTo(first?.ctl ?? 0, 1);
        expect(row.info, `${selector}: справка не ездит по вертикали`).toBeCloseTo(first?.info ?? 0, 1);
        expect(row.scrollable, `${selector}: страница не прокручивается`).toBe(false);
        expect(row.width).toBe(first?.width);
      }
    }
  });
});
