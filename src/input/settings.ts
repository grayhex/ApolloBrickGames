import {
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_STANDARD_GAMEPAD_BINDINGS,
  cloneBindings,
  emptyBindings,
  isGamepadSource,
  isKeyboardSource,
  sanitizeBindings,
  type Bindings,
} from './bindings';
import type { PadInfo } from './gamepad';
import { DEFAULT_LANG, isLang, type Lang } from './lang';

export const SETTINGS_KEY = 'crocodile-mario:settings:v1';
export const SETTINGS_VERSION = 1;

export const APOLLO_SHELLS = ['blue', 'red', 'yellow', 'white'] as const;
export const MONOBLOCK_SHELLS = ['gray', 'black'] as const;
export const SHELLS = [...APOLLO_SHELLS, ...MONOBLOCK_SHELLS] as const;
export type Shell = (typeof SHELLS)[number];

/** Фон страницы: тёмный (по умолчанию) или светлый. */
export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** Музыка: запись оригинала или «ремастер» (новая аранжировка; пока ремастера нет — звучит та же мелодия). */
export const MUSICS = ['original', 'remaster'] as const;
export type Music = (typeof MUSICS)[number];

export const MIN_STICK_THRESHOLD = 0.1;
export const MAX_STICK_THRESHOLD = 0.9;
export const DEFAULT_STICK_THRESHOLD = 0.5;
export const DEFAULT_VOLUME = 0.25;

export interface Settings {
  version: typeof SETTINGS_VERSION;
  keyboard: Bindings;
  gamepad: {
    /** Свои привязки устройства по его id (нестандартные и переназначенные). */
    byId: Record<string, Bindings>;
    stickThreshold: number;
    /** Выбранное устройство (id); null — автоматически. */
    preferredId: string | null;
  };
  display: {
    /** Слой неактивных сегментов: true/false — выбор пользователя, null — как задано профилем экрана. */
    ghost: boolean | null;
    /** Звук включён. */
    sound: boolean;
    /** Громкость 0…1 (ползунок «Звук» на странице): эффекты, а под «Оригинал» ещё и музыка; кнопка «Звук» заглушает независимо от неё. */
    volume: number;
    /** Громкость записи «Ремастер» 0…1 (ползунок «Музыка»); под «Оригинал» ползунки связаны и она равна `volume`. */
    musicVolume: number;
    /** Какая музыка звучит в игре. */
    music: Music;
    /** Фон страницы. */
    theme: Theme;
    /** Язык интерфейса игрушки: настройки, справка и панели. */
    lang: Lang;
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    keyboard: cloneBindings(DEFAULT_KEYBOARD_BINDINGS),
    gamepad: { byId: {}, stickThreshold: DEFAULT_STICK_THRESHOLD, preferredId: null },
    display: { ghost: null, sound: true, volume: DEFAULT_VOLUME, musicVolume: DEFAULT_VOLUME, music: 'original', theme: 'dark', lang: DEFAULT_LANG },
  };
}

/** Громкость музыки с учётом связи ползунков: под «Оригинал» музыка и звук — одна пищалка и один уровень, под «Ремастер» — раздельно. */
export function musicVolumeOf(display: Pick<Settings['display'], 'music' | 'volume' | 'musicVolume'>): number {
  return display.music === 'original' ? display.volume : display.musicVolume;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Приводит произвольные данные к корректным настройкам: мусор заменяется значениями по умолчанию. */
export function sanitizeSettings(raw: unknown): Settings {
  const defaults = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return defaults;
  const record = raw as Record<string, unknown>;
  if (record['version'] !== SETTINGS_VERSION) return defaults;

  const gamepad =
    typeof record['gamepad'] === 'object' && record['gamepad'] !== null
      ? (record['gamepad'] as Record<string, unknown>)
      : {};

  const byId: Record<string, Bindings> = {};
  const rawById = gamepad['byId'];
  if (typeof rawById === 'object' && rawById !== null) {
    for (const [id, bindings] of Object.entries(rawById).slice(0, 16)) {
      byId[id] = sanitizeBindings(bindings, emptyBindings(), isGamepadSource);
    }
  }
  const threshold = gamepad['stickThreshold'];
  const preferred = gamepad['preferredId'];
  const display =
    typeof record['display'] === 'object' && record['display'] !== null ? (record['display'] as Record<string, unknown>) : {};
  const level = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
  const volume = level(display['volume'], DEFAULT_VOLUME);

  return {
    version: SETTINGS_VERSION,
    keyboard: sanitizeBindings(record['keyboard'], DEFAULT_KEYBOARD_BINDINGS, isKeyboardSource),
    gamepad: {
      byId,
      stickThreshold:
        typeof threshold === 'number' && Number.isFinite(threshold)
          ? clamp(threshold, MIN_STICK_THRESHOLD, MAX_STICK_THRESHOLD)
          : DEFAULT_STICK_THRESHOLD,
      preferredId: typeof preferred === 'string' && preferred !== '' ? preferred : null,
    },
    display: {
      ghost: typeof display['ghost'] === 'boolean' ? display['ghost'] : null,
      sound: typeof display['sound'] === 'boolean' ? display['sound'] : true,
      volume,
      musicVolume: level(display['musicVolume'], volume), // старые сохранения без музыки: связана со «Звуком»
      music: MUSICS.find((music) => music === display['music']) ?? 'original',
      theme: THEMES.find((theme) => theme === display['theme']) ?? 'dark',
      lang: isLang(display['lang']) ? display['lang'] : DEFAULT_LANG,
    },
  };
}

/** Читает настройки. При отсутствии хранилища, пустом или повреждённом значении — значения по умолчанию. */
export function loadSettings(storage: StorageLike | null): Settings {
  if (!storage) return defaultSettings();
  try {
    const text = storage.getItem(SETTINGS_KEY);
    if (!text) return defaultSettings();
    return sanitizeSettings(JSON.parse(text));
  } catch {
    return defaultSettings();
  }
}

/** true — сохранено; false — хранилище недоступно (приложение продолжает работать без сохранения). */
export function saveSettings(storage: StorageLike | null, settings: Settings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** localStorage может быть недоступен (приватный режим, запрет cookies, песочница). */
export function browserStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    const probe = `${SETTINGS_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** Привязки для устройства: свои, иначе стандартные (для mapping "standard"), иначе пусто. */
export function gamepadBindingsFor(settings: Settings, pad: PadInfo): Bindings {
  return (
    settings.gamepad.byId[pad.id] ??
    (pad.mapping === 'standard' ? DEFAULT_STANDARD_GAMEPAD_BINDINGS : emptyBindings())
  );
}

/** Нестандартный mapping без своей раскладки: предлагаем настройку, а не угадываем. */
export function needsGamepadSetup(settings: Settings, pad: PadInfo): boolean {
  return pad.mapping !== 'standard' && settings.gamepad.byId[pad.id] === undefined;
}
