/** Языки интерфейса игрушки (настройки, справка, панели). Редактор и технические страницы — только на русском. */
export const LANGS = ['ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'ru';

/** Язык по умолчанию для тех, кто сам его не выбирал: задаётся в админке (`SiteConfig.language`) и применяется при запуске страницы. */
let defaultLang: Lang = DEFAULT_LANG;
export const getDefaultLang = (): Lang => defaultLang;
export function setDefaultLang(lang: Lang): void {
  defaultLang = lang;
}

export const isLang = (value: unknown): value is Lang => LANGS.some((lang) => lang === value);
