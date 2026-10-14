import { describe, expect, it } from 'vitest';
import { ContentError } from '../../src/content/validate';
import { ContentLoadError, loadContentPack, type FetchJson } from '../../src/app/loadContent';
import { deviceView, gamepadStatusText, keyboardStatusText, overlayView, timerText } from '../../src/app/viewModel';
import { validationEnv } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { Game, type GameState } from '../../src/core';
import { demoContext, readJson } from '../helpers/content';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const state = (patch: Partial<GameState> = {}): GameState => ({ ...new Game(demoContext()).state, ...patch });

describe('оверлей поверх игры', () => {
  it('во время игры оверлея нет', () => {
    expect(overlayView(state({ phase: 'playing' }), null)).toBeNull();
  });

  it('ready: старт; после смерти — причина и число жизней', () => {
    expect(overlayView(state(), null)).toMatchObject({ title: 'Готов к старту', action: 'Старт' });
    const afterDeath = overlayView(state({ deathCause: 'pit', lives: 2 }), null);
    expect(afterDeath?.title).toMatch(/падение в провал/);
    expect(afterDeath?.hint).toMatch(/осталось: 2/);
  });

  it('paused: подсказка зависит от причины, продолжение всегда явное', () => {
    const paused = state({ phase: 'paused' });
    expect(overlayView(paused, 'hidden')?.hint).toMatch(/потеряло фокус/);
    expect(overlayView(paused, 'blur')?.hint).toMatch(/потеряло фокус/);
    expect(overlayView(paused, 'gamepad')?.hint).toMatch(/Геймпад отключён/);
    expect(overlayView(paused, 'settings')?.hint).toMatch(/настройки/);
    expect(overlayView(paused, null)?.action).toBe('Продолжить');
    expect(overlayView(paused, 'hidden')?.hint).toMatch(/Esc, P, Start/);
  });

  it('dead — без кнопки; gameOver/completed — новая игра со счётом', () => {
    expect(overlayView(state({ phase: 'dead', deathCause: 'enemy' }), null)?.action).toBeNull();
    expect(overlayView(state({ phase: 'gameOver', score: 300 }), null)).toMatchObject({ action: 'Новая игра' });
    expect(overlayView(state({ phase: 'completed', score: 2000 }), null)?.hint).toMatch(/2000/);
  });
});

describe('статусы устройств и таймер', () => {
  it('тексты геймпада: нет, ждёт нажатия, активен, нестандартный, недоступен', () => {
    expect(gamepadStatusText({ kind: 'none' }, false)).toMatch(/не обнаружен/);
    const pad = { index: 0, id: 'Pad X', mapping: 'standard' };
    expect(gamepadStatusText({ kind: 'idle', pads: [pad] }, false)).toMatch(/Нажмите кнопку на геймпаде/);
    expect(gamepadStatusText({ kind: 'active', pad }, false)).toMatch(/активен: Pad X \(standard\)/);
    expect(gamepadStatusText({ kind: 'active', pad: { ...pad, mapping: '' } }, true)).toMatch(/назначьте кнопки/);
    expect(gamepadStatusText({ kind: 'unavailable', reason: 'SecurityError' }, false)).toMatch(/HTTPS или localhost/);
  });

  it('клавиатура и таймер', () => {
    expect(keyboardStatusText(true)).toBe('активна');
    expect(keyboardStatusText(false)).toMatch(/кликните/);
    expect(timerText(state({ timerTicks: 1800 }), 20, 1800)).toBe('90 с');
    expect(timerText(state({ timerTicks: 21 }), 20, 1800)).toBe('2 с');
    expect(timerText(state({ timerTicks: 0 }), 20, 0)).toBe('выкл.');
  });
});

describe('loadContentPack', () => {
  const dir = fileURLToPath(new URL('../../public/content/demo/', import.meta.url));
  const base = 'https://example.test/CrocodileMario/content/demo/';
  const env = validationEnv(undefined, GLYPH_NAMES);

  /** Подставной fetch: URL → файл из public/content/demo. */
  const diskFetch = (overrides: Record<string, unknown> = {}, requested: string[] = []): FetchJson => async (url) => {
    requested.push(url);
    if (url in overrides) return overrides[url];
    if (!url.startsWith(base)) throw new ContentLoadError(url, 'HTTP 404');
    return readJson(join(dir, url.slice(base.length)));
  };

  it('загружает и проверяет пакет; пути считаются от манифеста (в том числе при базовом пути /CrocodileMario/)', async () => {
    const requested: string[] = [];
    const loaded = await loadContentPack(`${base}pack.json`, env, diskFetch({}, requested));
    expect(loaded.pack.levels).toHaveLength(2);
    expect(loaded.assetsUrl).toBe(`${base}assets.json`);
    expect(requested).toContain(`${base}levels/demo-2.json`);
  });

  it('недоступный файл — понятная ошибка с адресом', async () => {
    const fetchMissing: FetchJson = async (url) => {
      if (url.endsWith('rules.json')) throw new ContentLoadError(url, 'HTTP 404');
      return diskFetch()(url);
    };
    await expect(loadContentPack(`${base}pack.json`, env, fetchMissing)).rejects.toThrow(/rules\.json.*HTTP 404/);
  });

  it('ошибка в данных не даёт частично собранную сцену', async () => {
    const broken = readJson(join(dir, 'levels/demo-1.json')) as { rows: string[] };
    broken.rows[0] = 'коротко';
    await expect(
      loadContentPack(`${base}pack.json`, env, diskFetch({ [`${base}levels/demo-1.json`]: broken })),
    ).rejects.toBeInstanceOf(ContentError);
  });

  it('манифест без путей к файлам', async () => {
    await expect(loadContentPack(`${base}pack.json`, env, async () => ({}))).rejects.toThrow(/levels/);
  });
});

import { parseRoute, GAME_ROUTES } from '../../src/app/routes';
import { controlsHint } from '../../src/app/viewModel';
import { DEFAULT_KEYBOARD_BINDINGS, cloneBindings } from '../../src/input/bindings';

describe('маршруты', () => {
  it('по умолчанию — однокомнатное демо; техническое демо и контрольный лист — отдельные маршруты', () => {
    for (const hash of ['', '#', '#/', '#/room', '#/что-то-неизвестное']) expect(parseRoute(hash), hash).toBe('room');
    expect(parseRoute('#/tech')).toBe('tech');
    expect(parseRoute('#/sheet')).toBe('sheet');
    expect(parseRoute('#/tech?debug=1')).toBe('tech');
    expect(parseRoute('#/clip')).toBe('room'); // отдельной страницы клипа больше нет: тестовый уровень — основная игра
  });

  it('основной маршрут не ведёт на технические участки #1', () => {
    expect(GAME_ROUTES.room.manifest).toBe('content/room/pack.json');
    expect(GAME_ROUTES.tech.manifest).toBe('content/demo/pack.json');
    expect(GAME_ROUTES.room.fireHint).toBe(true);
  });
});

describe('подсказка по клавишам', () => {
  it('строится из привязок; огонь — только если он есть в сцене', () => {
    const room = controlsHint(DEFAULT_KEYBOARD_BINDINGS, false);
    expect(room).toContain('Ходьба: ← · A · → · D');
    expect(room).toContain('Прыжок: Пробел · Z');
    expect(room).toContain('Старт: Enter');
    expect(room).toContain('Пауза: Esc · P');
    expect(room).not.toContain('Огонь');
    expect(controlsHint(DEFAULT_KEYBOARD_BINDINGS, true)).toContain('Огонь: X');
  });

  it('после переназначения подсказка меняется', () => {
    const custom = cloneBindings(DEFAULT_KEYBOARD_BINDINGS);
    custom.jump = ['k:KeyJ'];
    custom.pause = [];
    const text = controlsHint(custom, false);
    expect(text).toContain('Прыжок: J');
    expect(text).toContain('Пауза: не назначено');
  });
});

describe('значки устройств в панели справа', () => {
  const pad = { index: 0, id: 'Pad 1', mapping: 'standard' };

  it('без геймпада — только клавиатура', () => {
    expect(deviceView({ kind: 'none' }, 'keyboard')).toEqual({ keyboard: 'on', gamepad: 'hidden', padName: null });
    expect(deviceView({ kind: 'unavailable', reason: 'нет API' }, 'gamepad')).toEqual({ keyboard: 'on', gamepad: 'hidden', padName: null });
  });

  it('геймпад подключён, но не нажимался — значок появляется, но ведёт клавиатура', () => {
    expect(deviceView({ kind: 'idle', pads: [pad] }, 'keyboard')).toEqual({ keyboard: 'on', gamepad: 'ready', padName: 'Pad 1' });
  });

  it('активный геймпад: ведёт тот, с которого нажимали последним', () => {
    expect(deviceView({ kind: 'active', pad }, 'gamepad')).toEqual({ keyboard: 'ready', gamepad: 'on', padName: 'Pad 1' });
    expect(deviceView({ kind: 'active', pad }, 'keyboard')).toEqual({ keyboard: 'on', gamepad: 'ready', padName: 'Pad 1' });
  });
});
