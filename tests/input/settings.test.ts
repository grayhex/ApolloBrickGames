import { describe, expect, it } from 'vitest';
import { ACTIONS, actionBit } from '../../src/core';
import {
  compileBindings,
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_STANDARD_GAMEPAD_BINDINGS,
  describeSource,
  isGamepadSource,
  isKeyboardSource,
  maskOfSources,
} from '../../src/input/bindings';
import {
  defaultSettings,
  loadSettings,
  MAX_STICK_THRESHOLD,
  MIN_STICK_THRESHOLD,
  sanitizeSettings,
  saveSettings,
  SETTINGS_KEY,
  type StorageLike,
} from '../../src/input/settings';

function memoryStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SETTINGS_KEY, initial);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('раскладки по умолчанию', () => {
  it('у каждого логического действия есть привязка и на клавиатуре, и на геймпаде', () => {
    for (const action of ACTIONS) {
      expect(DEFAULT_KEYBOARD_BINDINGS[action].length, `клавиатура: ${action}`).toBeGreaterThan(0);
      expect(DEFAULT_STANDARD_GAMEPAD_BINDINGS[action].length, `геймпад: ${action}`).toBeGreaterThan(0);
    }
  });

  it('клавиатурные привязки — только k:, геймпадные — только b:/a:', () => {
    for (const action of ACTIONS) {
      expect(DEFAULT_KEYBOARD_BINDINGS[action].every(isKeyboardSource)).toBe(true);
      expect(DEFAULT_STANDARD_GAMEPAD_BINDINGS[action].every(isGamepadSource)).toBe(true);
    }
  });

  it('Enter даёт start и confirm, Esc — pause и back; up и jump разделены', () => {
    const kb = compileBindings(DEFAULT_KEYBOARD_BINDINGS);
    expect(maskOfSources(['k:Enter'], kb)).toBe(actionBit('start') | actionBit('confirm'));
    expect(maskOfSources(['k:Escape'], kb)).toBe(actionBit('pause') | actionBit('back'));
    expect(maskOfSources(['k:ArrowUp'], kb) & actionBit('jump')).toBe(0);
    expect(maskOfSources(['k:Space'], kb) & actionBit('up')).toBe(0);
  });

  it('стандартный геймпад: buttons[0] — прыжок/подтверждение, [2] — огонь, [9] — старт/пауза', () => {
    const pad = compileBindings(DEFAULT_STANDARD_GAMEPAD_BINDINGS);
    expect(maskOfSources(['b:0'], pad)).toBe(actionBit('jump') | actionBit('confirm'));
    expect(maskOfSources(['b:2'], pad)).toBe(actionBit('fire'));
    expect(maskOfSources(['b:9'], pad)).toBe(actionBit('start') | actionBit('pause'));
  });

  it('подписи источников для настроек', () => {
    expect(describeSource('k:KeyA')).toBe('A');
    expect(describeSource('k:ArrowLeft')).toBe('←');
    expect(describeSource('k:Space')).toBe('Пробел');
    expect(describeSource('b:0')).toBe('Кнопка 0');
    expect(describeSource('a:1:-')).toBe('Ось 1 −');
  });
});

describe('сохранение настроек', () => {
  it('круг сохранение → загрузка возвращает те же настройки', () => {
    const settings = defaultSettings();
    settings.keyboard.fire = ['k:KeyF'];
    settings.gamepad.stickThreshold = 0.7;
    settings.gamepad.preferredId = 'Pad';
    settings.gamepad.byId['Pad'] = { ...DEFAULT_STANDARD_GAMEPAD_BINDINGS, fire: ['b:5'] };
    const storage = memoryStorage();
    expect(saveSettings(storage, settings)).toBe(true);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('пустое хранилище, отсутствие хранилища и битый JSON — значения по умолчанию', () => {
    expect(loadSettings(memoryStorage())).toEqual(defaultSettings());
    expect(loadSettings(null)).toEqual(defaultSettings());
    expect(loadSettings(memoryStorage('{не json'))).toEqual(defaultSettings());
    expect(loadSettings(memoryStorage('[1,2,3]'))).toEqual(defaultSettings());
  });

  it('исключения хранилища (приватный режим, квота) не ломают приложение', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSettings(throwing)).toEqual(defaultSettings());
    expect(saveSettings(throwing, defaultSettings())).toBe(false);
    expect(saveSettings(null, defaultSettings())).toBe(false);
  });

  it('неизвестная версия настроек отбрасывается', () => {
    expect(sanitizeSettings({ ...defaultSettings(), version: 99 })).toEqual(defaultSettings());
  });

  it('мусор в привязках отфильтровывается; недостающие действия берутся по умолчанию', () => {
    const settings = sanitizeSettings({
      version: 1,
      keyboard: {
        left: ['k:KeyJ', 'b:3', 'k:<script>', 42, 'k:KeyJ'],
        fire: 'oops',
      },
      gamepad: { byId: { Pad: { jump: ['b:1', 'k:KeyA', 'a:0:*'] } }, stickThreshold: 'high', preferredId: 5 },
    });
    expect(settings.keyboard.left).toEqual(['k:KeyJ']); // чужой тип, мусор и дубликаты убраны
    expect(settings.keyboard.fire).toEqual(DEFAULT_KEYBOARD_BINDINGS.fire);
    expect(settings.keyboard.right).toEqual(DEFAULT_KEYBOARD_BINDINGS.right);
    expect(settings.gamepad.byId['Pad']?.jump).toEqual(['b:1']);
    expect(settings.gamepad.stickThreshold).toBe(0.5);
    expect(settings.gamepad.preferredId).toBeNull();
  });

  it('порог стика ограничен допустимым диапазоном', () => {
    const make = (value: number) => sanitizeSettings({ version: 1, gamepad: { stickThreshold: value } });
    expect(make(5).gamepad.stickThreshold).toBe(MAX_STICK_THRESHOLD);
    expect(make(-1).gamepad.stickThreshold).toBe(MIN_STICK_THRESHOLD);
    expect(make(0.3).gamepad.stickThreshold).toBe(0.3);
  });

  it('пользователь может оставить действие без привязки — это сохраняется', () => {
    const settings = defaultSettings();
    settings.keyboard.fire = [];
    const storage = memoryStorage();
    saveSettings(storage, settings);
    expect(loadSettings(storage).keyboard.fire).toEqual([]);
  });

  it('настройки отображения: слой неактивных сегментов и цвет корпуса; мусор заменяется значениями по умолчанию', () => {
    expect(defaultSettings().display).toEqual({ ghost: null, shell: 'blue', sound: true, compact: false });
    const saved = sanitizeSettings({ version: 1, display: { ghost: false, shell: 'red' } });
    expect(saved.display).toEqual({ ghost: false, shell: 'red', sound: true, compact: false });
    const junk = sanitizeSettings({ version: 1, display: { ghost: 'да', shell: 'green' } });
    expect(junk.display).toEqual({ ghost: null, shell: 'blue', sound: true, compact: false });
    expect(sanitizeSettings({ version: 1, display: { sound: false } }).display.sound).toBe(false);
    expect(sanitizeSettings({ version: 1, display: { sound: 'нет' } }).display.sound).toBe(true);
    expect(sanitizeSettings({ version: 1, display: { compact: true } }).display.compact).toBe(true);
    expect(sanitizeSettings({ version: 1, display: { compact: 'да' } }).display.compact).toBe(false);
    const storage = memoryStorage();
    const settings = defaultSettings();
    settings.display = { ghost: true, shell: 'white', sound: false, compact: true };
    saveSettings(storage, settings);
    expect(loadSettings(storage).display).toEqual({ ghost: true, shell: 'white', sound: false, compact: true });
  });
});
