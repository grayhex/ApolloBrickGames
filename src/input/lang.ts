/** Языки интерфейса игрушки (настройки, справка, панели). Редактор и технические страницы — только на русском. */
export const LANGS = ['ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'ru';

export const isLang = (value: unknown): value is Lang => LANGS.some((lang) => lang === value);
