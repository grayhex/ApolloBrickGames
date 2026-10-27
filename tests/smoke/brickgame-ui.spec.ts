import { test, expect, type Page } from '@playwright/test';
import defaults from '../../src/config/default.json' with { type: 'json' };
import { universalGames, validateConfig } from '../../src/config/schema';
import { chooseToy, closePicker, openPicker, pickerCard } from './picker';

const area = (page: Page, name: string) => page.locator('#game-area').getAttribute(`data-${name}`);

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors?: string[] }).__errors ?? []).toEqual([]);
});
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  (page as Page & { __errors?: string[] }).__errors = errors;
  page.on('pageerror', (error) => errors.push(error.message));
});
test.use({ viewport: { width: 1440, height: 900 } });

async function open(page: Page, query: string, edit?: (config: ReturnType<typeof validateConfig>) => void): Promise<void> {
  const config = validateConfig(defaults);
  edit?.(config);
  await page.route('**/api/config', (route) => route.fulfill({ json: { config, revision: 1 } }));
  await page.goto(`./${query}`);
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase', 'ready');
}

test('сайт без параметра открывает универсальный Brick Game, Crocodile Mario — по ?toy=mario', async ({ page }) => {
  await open(page, '');
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'brickgame');
  await expect(pickerCard(page, 'brickgame')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('h1')).toHaveText('Brick Game'); // заголовок страницы следует за открытой игрушкой
  await chooseToy(page, 'mario');
  await expect(page.locator('h1')).toHaveText('Crocodile Mario');
  await expect(page).toHaveURL(/\?toy=mario$/);
  await expect(pickerCard(page, 'mario')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#toy')).not.toHaveAttribute('data-model', 'brickgame');
  await chooseToy(page, 'brickgame');
  await expect(page.locator('#toy')).toHaveAttribute('data-model', 'brickgame');
  expect(new URL(page.url()).search).toBe('');
});

test('корпус универсального Brick Game: без винтов, рамка у стекла, узоры по бокам, подписи направлений, надпись «N IN 1»', async ({ page }) => {
  await open(page, '?toy=brickgame');
  await expect(page.locator('.lid__screw')).toHaveCount(0);
  // Узор: по восемнадцати ячеек (рамка и квадрат внутри) с каждой стороны, стороны разные.
  const sides = await page.locator('.classic__motif').evaluateAll((nodes) => nodes.map((node) => [node.querySelectorAll('rect').length, node.innerHTML]));
  expect(sides.map(([count]) => count)).toEqual([36, 36]);
  expect(sides[0]![1]).not.toBe(sides[1]![1]);
  // Желтая рамка прилегает к стеклу ровно: одинаковая толщина со всех сторон и скругление.
  const ring = await page.locator('.lid__bezel').evaluate((node) => {
    const style = getComputedStyle(node, '::after');
    return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth, style.borderTopColor];
  });
  expect(new Set(ring.slice(0, 4)).size).toBe(1);
  expect(ring[4]).toBe('rgb(239, 210, 60)');
  // Подписи кнопок — двустрочные и стоят рядом с кнопками, а не на них; на кнопках нет ни текста, ни треугольников.
  const captions = await page.locator('.classic__key').evaluateAll((keys) =>
    keys.map((key) => {
      const cap = key.querySelector('.classic__cap')!;
      const k = key.getBoundingClientRect(),
        c = cap.getBoundingClientRect();
      return { key: (key as HTMLElement).dataset['key'], lines: [...cap.children].map((line) => line.textContent), clear: (key as HTMLElement).dataset['key'] === 'up' ? c.bottom <= k.top + k.height * 0.15 : c.top >= k.top + k.height * 0.85, svg: key.querySelectorAll('svg').length };
    }),
  );
  expect(captions).toEqual([
    { key: 'up', lines: ['UP', 'MODE'], clear: true, svg: 0 },
    { key: 'left', lines: ['LEFT', 'LEVEL'], clear: true, svg: 0 },
    { key: 'right', lines: ['RIGHT', 'SPEED'], clear: true, svg: 0 },
    { key: 'down', lines: ['DOWN', 'MODE'], clear: true, svg: 0 },
    { key: 'jump', lines: ['ROTATE', 'DIRECTION'], clear: true, svg: 0 },
    { key: 'fire', lines: ['FIRE'], clear: true, svg: 0 },
  ]);
  await expect(page.locator('.classic__pad')).toBeVisible(); // крест из четырёх стрелок между кнопками
  // «DOT MATRIX» убрана; SUPER стоит в разрыве верхней линии жёлтой рамки тем же цветом, что и узор.
  await expect(page.locator('.classic__edition')).toHaveCount(0);
  await expect(page.locator('.classic__super')).toHaveText('SUPER');
  const colours = await page.evaluate(() => [getComputedStyle(document.querySelector('.classic__super')!).color, getComputedStyle(document.querySelector('.classic__motif')!).color]);
  expect(colours[0]).toBe(colours[1]);
  await expect(page.locator('.classic__speaker')).toHaveCount(0); // линий динамика на корпусе нет
  // Надпись двумя строками под углом и число игр, назначенных приставке сейчас.
  const games = universalGames(validateConfig(defaults)).length;
  await expect(page.locator('.classic__count')).toHaveText(`${games} IN 1`);
  await expect(page.locator('.classic__site-logo')).toHaveText('BRICKGAME.ONLINE');
  await expect(page.locator('.classic__site-logo')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(page.locator('.classic__face')).toHaveCount(0);
  await expect(page.locator('.classic__wordmark')).toHaveCSS('pointer-events', 'none'); // не перекрывает кнопки
});

test('число в «N IN 1» следует за настройкой: закреплённые в админке и оставшиеся без владельца игры', async ({ page }) => {
  // По умолчанию универсальной модели закреплены все игры; чтобы число следовало за пересчётом, закрепляем только Tetris.
  const reduce = (config: ReturnType<typeof validateConfig>): void => {
    config.toys.brickgame.games = [{ id: 'tetris' }];
    config.toys.brickgame.defaultGame = 'tetris';
  };
  const base = validateConfig(defaults);
  reduce(base);
  const edited = validateConfig(defaults);
  reduce(edited);
  edited.toys.clock99.games = [{ id: 'tetris' }];
  edited.toys.clock99.defaultGame = 'tetris';
  const expected = universalGames(edited).length;
  expect(expected).toBeGreaterThan(universalGames(base).length);
  await open(page, '?toy=brickgame', (config) => {
    reduce(config);
    config.toys.clock99.games = [{ id: 'tetris' }];
    config.toys.clock99.defaultGame = 'tetris';
  });
  await expect(page.locator('.classic__count')).toHaveText(`${expected} IN 1`);
});

test('FIRE нарисована только у игры, без которой не обойтись (Jig Saw); у Tetris и Snake её нет и в меню она следует за выбранной игрой', async ({ page }) => {
  await open(page, '?toy=brickgame&power=on&debug', (config) => {
    config.toys.brickgame.games = [{ id: 'snake' }, { id: 'jigsaw' }, { id: 'tetris' }];
    config.toys.brickgame.defaultGame = 'snake';
  });
  const fire = page.locator('[data-key=fire]');
  await expect.poll(() => area(page, 'boot')).toBe('off');
  await expect(page.locator('#toy')).toHaveAttribute('data-fire', 'off');
  await expect(fire).toBeHidden();
  // Меню идёт по возрастанию редкости (Snake и Tetris — Common, Jig Saw — Ultra Rare): в меню за Snake сразу идёт Tetris.
  await page.locator('[data-key=jump]').click(); // ROTATE в меню: следующая игра
  await expect.poll(() => area(page, 'game')).toBe('tetris');
  await expect(page.locator('#toy')).toHaveAttribute('data-fire', 'off');
  await expect(fire).toBeHidden();
  // В левой справке у Tetris FIRE не упомянута.
  await expect(page.locator('#gpanel .gctl')).not.toContainText('FIRE');
  await page.locator('#guide-game').selectOption('jigsaw'); // игры без владельца (Pong и др.) встают в свои ступени между ними — выбираем в списке слева
  await expect.poll(() => area(page, 'game')).toBe('jigsaw');
  await expect(page.locator('#toy')).toHaveAttribute('data-fire', 'on');
  await expect(fire).toBeVisible();
});

test('человечек: стоит, после конца игры огорчён, после RESET снова стоит', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '?toy=brickgame&power=on&debug&seed=7', (config) => {
    config.toys.brickgame.games = [{ id: 'tetris' }];
    config.toys.brickgame.defaultGame = 'tetris';
  });
  await expect.poll(() => area(page, 'boot')).toBe('off');
  await expect(page.locator('#game-area')).toHaveAttribute('data-mood', 'idle');
  await page.locator('[data-key=sp]').click();
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await page.keyboard.down('ArrowDown'); // ускоренное падение, пока стакан не заполнится
  await expect.poll(() => area(page, 'phase'), { timeout: 60_000 }).toBe('over');
  await page.keyboard.up('ArrowDown');
  await expect(page.locator('#game-area')).toHaveAttribute('data-mood', 'sad');
  await page.locator('[data-action=reset]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-mood', 'idle');
});

test('пульт: в виде «только экран» есть дубль ON/OFF, START / PAUSE и RESET, в полном виде его нет', async ({ page }) => {
  await open(page, '?toy=brickgame&view=screen');
  const remote = page.locator('#blk-remote');
  await expect(remote).toBeVisible();
  await expect(remote.locator('button')).toHaveText(['ON/OFF', 'START / PAUSE', 'RESET']);
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await remote.locator('[data-remote=onoff]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect.poll(() => area(page, 'boot')).toBe('off');
  await remote.locator('[data-remote=sp]').click();
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  await remote.locator('[data-remote=sp]').click();
  await expect.poll(() => area(page, 'phase')).toBe('paused');
  await remote.locator('[data-remote=reset]').click();
  await expect.poll(() => area(page, 'menu')).toBe('menu');
  await expect.poll(() => area(page, 'phase')).toBe('ready');
  await remote.locator('[data-remote=onoff]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.locator('#view-full').click();
  await expect(remote).toBeHidden();
});

test('пульт Mario: дубль ON/OFF и START / PAUSE (RESET у Mario нет) виден только при виде «только экран»', async ({ page }) => {
  await open(page, '?toy=mario&view=screen');
  const remote = page.locator('#blk-remote');
  await expect(remote.locator('button')).toHaveText(['ON/OFF', 'START / PAUSE']);
  await remote.locator('[data-remote=onoff]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await page.locator('#view-full').click();
  await expect(remote).toBeHidden();
});

test('каталог: «Alibaba Dance 99 in 1» помещается в карточку; цвет миниатюр берётся из настройки', async ({ page }) => {
  await open(page, '?toy=brickgame', (config) => {
    config.toys.tank168.thumbShell = 'red';
    config.toys.clock99.thumbShell = 'yellow';
  });
  await openPicker(page);
  const name = pickerCard(page, 'alibaba').locator('.devpick__model');
  await expect(name).toHaveText('Alibaba Dance 99 in 1');
  expect(await name.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true); // название не обрезается
  await expect(pickerCard(page, 'tank168')).toHaveAttribute('data-shell', 'red');
  await expect(pickerCard(page, 'clock99')).toHaveAttribute('data-shell', 'yellow');
  await expect(pickerCard(page, 'mario')).toHaveAttribute('data-shell', 'white');
  await closePicker(page);
});

test('«Сегменты экрана»: на кнопке «Вкл» яркие светящиеся сегменты, на «Выкл» — тусклые', async ({ page }) => {
  await open(page, '?toy=brickgame');
  const lit = page.locator('.segments__choice:has([value=on]) .icon');
  const dim = page.locator('.segments__choice:has([value=off]) .icon');
  expect(await lit.evaluate((node) => getComputedStyle(node).filter)).toContain('drop-shadow');
  expect(Number(await dim.evaluate((node) => getComputedStyle(node).opacity))).toBeLessThan(0.5);
  await page.locator('.segments__choice:has([value=off])').click();
  expect(await lit.evaluate((node) => getComputedStyle(node).filter)).toBe('none');
});

test('пульт: дубли кнопок подсвечиваются при нажатии с клавиатуры, пока видны только экран и пульт', async ({ page }) => {
  await open(page, '?toy=brickgame&view=screen&power=on');
  await expect.poll(() => area(page, 'boot')).toBe('off');
  const start = page.locator('[data-remote=sp]');
  await expect(start).not.toHaveAttribute('data-pressed', '');
  await page.keyboard.down('Enter'); // S./P.
  await expect(start).toHaveAttribute('data-pressed', '');
  await page.keyboard.up('Enter');
  await expect(start).not.toHaveAttribute('data-pressed', '');
});

for(const [width,height] of [[1280,720],[1440,900],[1920,1080],[2560,1440],[900,900],[390,844]])
  test(`Brick Game: enlarged screen stays below the device picker at ${width}×${height}`,async({page})=>{
    await page.setViewportSize({width:width!,height:height!});
    await open(page,'?toy=brickgame&view=screen');await page.locator('body:not([data-booting])').waitFor();
    const [navigation,toy]=await page.locator('#toy-switch,#toy').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
    expect(toy!.top).toBeGreaterThanOrEqual(navigation!.bottom+4);
    if(width!>=1200)expect(toy!.bottom).toBeLessThanOrEqual(height!+1);
    await chooseToy(page,'brickgame');await expect(page.locator('#toy')).toHaveAttribute('data-model','brickgame');
  });

test('левая справка оставляет одну статичную иллюстрацию и не запускает демонстрацию', async ({ page }) => {
  await open(page, '?toy=brickgame', (config) => {
    config.toys.brickgame.games = [{ id: 'tetris' }, { id: 'snake' }];
    config.toys.brickgame.defaultGame = 'tetris';
  });
  await expect(page.locator('.gquick__schemes .gscheme')).toHaveCount(1);
  await expect(page.locator('.gquick__schemes canvas')).toHaveCount(0);
});

test('«Игры на устройстве»: стрелки ‹ › листают игры (в меню — и на консоли), ▶ запускает выбранную', async ({ page }) => {
  const config = validateConfig(defaults);
  config.toys.brickgame.games = [{ id: 'tetris' }, { id: 'snake' }, { id: 'pong' }];
  config.toys.brickgame.defaultGame = 'tetris';
  const last = universalGames(config).at(-1)!.id; // остальные игры без владельца добавляются автоматически — в конец списка
  await open(page, '?toy=brickgame&power=on&debug', (c) => {
    c.toys.brickgame.games = [{ id: 'tetris' }, { id: 'snake' }, { id: 'pong' }];
    c.toys.brickgame.defaultGame = 'tetris';
  });
  await expect.poll(() => area(page, 'boot')).toBe('off');
  const select = page.locator('#guide-game');
  await expect(select).toHaveValue('tetris');
  await page.locator('.gnav__btn--next').click();
  await expect(select).toHaveValue('snake');
  await expect.poll(() => area(page, 'game')).toBe('snake'); // меню консоли за выбором в справке
  await page.locator('.gnav__btn--prev').click();
  await expect(select).toHaveValue('tetris');
  await page.locator('.gnav__btn--prev').click(); // по кругу: с первой игры на последнюю
  await expect(select).toHaveValue(last);
  await expect.poll(() => area(page, 'game')).toBe(last);
  await page.locator('.gnav__btn--launch').click();
  await expect.poll(() => area(page, 'phase')).toBe('playing');
  expect(await area(page, 'game')).toBe(last);
  // Во время партии выбрать другую игру и запустить: возврат в меню и новая партия.
  await page.locator('.gnav__btn--next').click(); // последняя → первая
  await expect(select).toHaveValue('tetris');
  await page.locator('.gnav__btn--launch').click();
  await expect.poll(() => area(page, 'game')).toBe('tetris');
  await expect.poll(() => area(page, 'phase')).toBe('playing');
});

test('«Игры на устройстве»: запуск включает выключенную игрушку и стартует выбранную игру', async ({ page }) => {
  await open(page, '?toy=brickgame', (config) => {
    config.toys.brickgame.games = [{ id: 'tetris' }, { id: 'snake' }];
    config.toys.brickgame.defaultGame = 'tetris';
  });
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.locator('#guide-game').selectOption('snake');
  await page.locator('.gnav__btn--launch').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect.poll(() => area(page, 'phase'), { timeout: 15_000 }).toBe('playing');
  expect(await area(page, 'game')).toBe('snake');
});

test('«Игры на устройстве»: запуск, отложенный на время проверки экрана, не срабатывает после выключения', async ({ page }) => {
  await open(page, '?toy=brickgame', (config) => {
    config.toys.brickgame.games = [{ id: 'tetris' }, { id: 'snake' }];
    config.toys.brickgame.defaultGame = 'tetris';
  });
  await page.locator('#guide-game').selectOption('snake');
  await page.locator('.gnav__btn--launch').click(); // включает игрушку; проверка экрана ещё идёт
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'off');
  await page.locator('[data-key="onoff"]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-power', 'on');
  await expect.poll(() => area(page, 'boot')).toBe('off');
  await page.waitForTimeout(500); // ошибочный запуск случился бы сразу после проверки экрана
  expect(await area(page, 'phase')).toBe('ready');
});

test('панель настроек — в правом столбце над картинкой сайта и пультом: тот же центр и та же ширина у всех трёх', async ({ page }) => {
  await open(page, '?toy=brickgame');
  const boxes = await page.evaluate(() => {
    const rect = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { left: r.left, top: r.top, bottom: r.bottom, width: r.width, centre: r.left + r.width / 2 };
    };
    return { dock: rect('#topleft'), brand: rect('.site-brand'), panel: rect('#side-ctl'), info: rect('#side-info') };
  });
  for (const other of [boxes.brand, boxes.panel]) {
    expect(Math.abs(boxes.dock.centre - other.centre), 'тот же центр').toBeLessThan(2);
    expect(Math.abs(boxes.dock.width - other.width), 'та же ширина').toBeLessThan(2);
  }
  expect(boxes.brand.top, 'картинка сайта под панелью настроек').toBeGreaterThanOrEqual(boxes.dock.bottom - 1);
  expect(boxes.panel.top, 'пульт под картинкой сайта').toBeGreaterThanOrEqual(boxes.brand.bottom - 1);
  expect(boxes.info.left, 'панель настроек больше не над левой панелью').toBeLessThan(boxes.dock.left - 200);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator('#topleft')).not.toHaveAttribute('data-aligned', ''); // на узком окне панель остаётся в левом углу
  const narrow = await page.evaluate(() => ({ dock: document.getElementById('topleft')!.getBoundingClientRect().left, brand: document.querySelector('.site-brand')!.getBoundingClientRect().left }));
  expect(narrow.dock).toBeLessThan(narrow.brand);
});

test('блок «Рекорды» не затемняется и всегда обведён', async ({ page }) => {
  await open(page, '?toy=brickgame');
  const card = page.locator('#leaderboard');
  await expect(card).toBeVisible();
  const style = async () =>
    card.evaluate((node) => {
      const column = node.parentElement!;
      const cs = getComputedStyle(node);
      return { column: getComputedStyle(column).opacity, card: cs.opacity, border: cs.borderTopWidth, style: cs.borderTopStyle };
    });
  expect(await style()).toEqual({ column: '1', card: '1', border: '1px', style: 'solid' });
  await page.mouse.move(2, 2); // курсор вне панелей: затемняется только карточка пульта, а не рекорды
  await page.waitForTimeout(400);
  expect(await style()).toEqual({ column: '1', card: '1', border: '1px', style: 'solid' });
});

for(const toy of ['brickgame','clock99','seabattle','tank168'] as const)test(`${toy}: Dice ROM START/P changes prediction; explicit Pause still freezes; ruleset 2 is selected`, async ({ page }) => {
  const categories: string[] = [];
  await page.route('**/api/leaderboards/top?**', route => {
    const category=new URL(route.request().url()).searchParams.get('category')!;
    categories.push(category);
    return route.fulfill({json:{category,entries:[]}});
  });
  await open(page, `?toy=${toy}&power=on`, config => {
    config.toys[toy].games=[{id:'dice'}];config.toys[toy].defaultGame='dice';
  });
  await expect.poll(()=>area(page,'boot')).toBe('off');
  if(toy==='seabattle'){await page.locator('[data-key=sp]').click();await expect.poll(()=>area(page,'stage')).toBe('menu');} // заставка уходит по первой кнопке
  await page.locator('[data-key=sp]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
  await expect(page.locator('#game-area')).toHaveAttribute('data-score','1000');
  await page.locator('[data-key=right]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-score','990');
  const image=()=>page.locator('#screen').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL());
  // Wait for input consumption: an immediate phase assertion can pass before PAUSE is processed.
  const before=await image();
  await page.locator('[data-key=sp]').click();
  await page.waitForTimeout(120);
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
  expect(await image()).not.toBe(before);
  await page.locator('[data-device=pause]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','paused');
  const paused=await image();await page.waitForTimeout(150);expect(await image()).toBe(paused);
  expect(paused).not.toBe(before);
  await page.locator('[data-device=pause]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
  await expect.poll(()=>categories.some(c=>c==='dice:0:r2:standard-v1:matrix')).toBe(true);
  await expect(page.locator('#gpanel')).toContainText('четырёх костей');
  await page.locator('#view-screen').click();
  await page.locator('[data-remote=sp]').click();await page.waitForTimeout(120);
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
  await page.locator('[data-remote=sp]').dispatchEvent('click',{detail:0});await page.waitForTimeout(120);
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
});

test('universal Brick Game descriptions separate ROM/AI provenance from alpha/beta readiness in both languages and themes',async({page})=>{
  await open(page,'?toy=brickgame',config=>{
    config.toys.brickgame.games=[{id:'maze'},{id:'tank'},{id:'snake'}];config.toys.brickgame.defaultGame='maze';
  });
  const select=page.locator('#side-info select');
  const badge=page.locator('#gpanel .gpanel__stage');
  await expect(badge).toHaveText('βБета');await expect(page.locator('#gpanel .game-origin')).toHaveAttribute('data-origin','ai');
  await select.selectOption('tank');await expect(badge).toHaveText('βБета');await expect(badge).toHaveAttribute('title',/Полный игровой цикл/);await expect(page.locator('#gpanel .game-origin')).toHaveAttribute('data-origin','rom');
  await select.selectOption('snake');await expect(badge).toHaveText('βБета');
  await select.selectOption('maze');await page.locator('#corner-lang').click();await expect(badge).toHaveText('βBeta');
  await page.locator('#corner-theme').click();await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('aria-label',/complete game loop/);
  await chooseToy(page,'tank168');await expect(page.locator('#gpanel .game-origin')).toBeVisible();
});

test('clear and smoke shells reveal decorative electronics, without covering controls',async({page})=>{
 await open(page,'?toy=brickgame&power=on');
 await expect(page.locator('.classic__pcb')).toHaveCSS('opacity','0');
 for(const shell of ['clear','smoke']){
  await page.locator(`#shell-picker [data-shell=${shell}]`).click();
  await expect(page.locator('.classic__pcb')).toHaveCSS('opacity','0.24');
  await expect(page.locator('.classic__glass')).toHaveCSS('pointer-events','none');
  await expect(page.locator('#game-area')).toHaveAttribute('data-boot','off');
  await page.locator('#base [data-key=sp]').click();
  await expect(page.locator('#game-area')).toHaveAttribute('data-phase','playing');
  await page.locator('#base [data-action=reset]').click();
 }
 await page.locator('#view-screen').click();await expect(page.locator('.classic__pcb')).toBeHidden();
 await expect(page.locator('.classic__count')).toBeHidden();
 for(let cycle=0;cycle<3;cycle++){
  await chooseToy(page, 'mario');
  await expect(pickerCard(page, 'mario')).toHaveAttribute('aria-current','page');
  await expect(page.locator('.classic__pcb,.classic__glass')).toHaveCount(0);
  await chooseToy(page, 'brickgame');
  await expect(page.locator('#toy')).toHaveAttribute('data-model','brickgame');
  await expect(page.locator('.classic__pcb')).toHaveCount(1);
  await expect(page.locator('.classic__glass')).toHaveCount(1);
 }
});
