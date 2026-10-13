import { describe, expect, it } from 'vitest';
import { ContentError } from '../../src/content/validate';
import { ContentLoadError, loadContentPack, type FetchJson } from '../../src/app/loadContent';
import { gamepadStatusText, keyboardStatusText, overlayView, timerText } from '../../src/app/viewModel';
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
