/**
 * Версионированный формат данных проекта. Это НЕ формат памяти Apollo:
 * просто удобное описание экрана, правил, ресурсов и уровней для этого движка.
 * Подробности и примеры: docs/content-format.md
 */

export const SCHEMA_VERSION = 1;

/** `demo` — временные значения движка; `confirmed` — подтверждено на устройстве владельцем. */
export type ContentStatus = 'demo' | 'confirmed';

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

// ── Профиль экрана ─────────────────────────────────────────────────────────

export interface ScreenProfile {
  schemaVersion: number;
  id: string;
  status: ContentStatus;
  /** Видимая область игрового поля в клетках. */
  viewport: { columns: number; rows: number };
  /** HUD — отдельная область вне игрового поля. */
  hud: { rows: number; position: 'top' | 'bottom' };
  /** Размер клетки в логических пикселях Canvas (до масштабирования). */
  cellPx: number;
}

// ── Каталог ресурсов ───────────────────────────────────────────────────────

export type AssetDef =
  | { kind: 'placeholder'; glyph: string }
  | {
      kind: 'image';
      /** Путь относительно файла каталога. */
      src: string;
      frameWidth: number;
      frameHeight: number;
      /** Кадры лежат в одну горизонтальную полосу. */
      frames: number;
      /** Сколько тактов показывается один кадр. */
      frameTicks: number;
      /** Заглушка, пока картинка не загрузилась или недоступна. */
      fallbackGlyph: string;
    };

export interface AssetCatalog {
  schemaVersion: number;
  id: string;
  status: ContentStatus;
  assets: Record<string, AssetDef>;
}

// ── Правила (таймирование и параметры демо-профиля) ────────────────────────

export interface RuleParams {
  /** Логических тактов в секунду. Для демо — не частота оригинала. */
  tickRateHz: number;
  move: { repeatDelayTicks: number; repeatIntervalTicks: number };
  jump: { triggers: string[]; table: number[]; stepTicks: number };
  fall: { periodTicks: number };
  fire: {
    intervalTicks: number;
    holdRepeat: boolean;
    maxProjectiles: number;
    projectile: { cellsPerStep: number; stepTicks: number; maxRangeCells: number };
  };
  lives: number;
  /** 0 — таймер выключен. */
  timerLimitTicks: number;
  deathDelayTicks: number;
}

export interface RuleSetDef {
  schemaVersion: number;
  id: string;
  status: ContentStatus;
  /** Версия набора правил: попадает в replay. */
  version: number;
  params: RuleParams;
}

// ── Уровень ────────────────────────────────────────────────────────────────

export type Collision = 'empty' | 'solid';

export interface LegendEntry {
  /** Проходимость задаётся только здесь, а не рисунком. */
  collision: Collision;
  /** Графический идентификатор (необязателен). */
  asset: string | null;
}

export interface ObjectDef {
  id: string;
  /** Тип поведения (обработчик в core/behaviors). */
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Графический идентификатор — отдельно от поведения. */
  asset: string | null;
  params: Params;
}

export interface Transition {
  /** id объекта-триггера (тип `finish`). */
  from: string;
  /** id следующего уровня или null — игра пройдена. */
  to: string | null;
}

export interface LevelDef {
  schemaVersion: number;
  id: string;
  status: ContentStatus;
  /** Подпись в HUD; формат подписи оригинала не установлен. */
  hudLabel: string;
  width: number;
  height: number;
  legend: Record<string, LegendEntry>;
  rows: string[];
  start: { x: number; y: number };
  objects: ObjectDef[];
  transitions: Transition[];
}

// ── Пакет контента ─────────────────────────────────────────────────────────

/** Манифест: ссылки на файлы относительно самого манифеста. */
export interface PackManifest {
  schemaVersion: number;
  id: string;
  title: string;
  status: ContentStatus;
  /** Версия контента: попадает в replay. */
  version: number;
  screen: string;
  rules: string;
  assets: string;
  levels: string[];
  firstLevel: string;
  /** Идентификаторы ресурсов героя и снаряда (в ядре их нет). */
  sprites: { hero: string; projectile: string; life: string };
}

export interface ContentPack {
  manifest: PackManifest;
  screen: ScreenProfile;
  rules: RuleSetDef;
  assets: AssetCatalog;
  levels: LevelDef[];
}

/** Описание числового параметра типа объекта: из него строятся и проверка, и поле инспектора. */
export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

/**
 * Что валидатор (и редактор) должен знать от кода о типе объекта.
 * Новый тип появляется в реестре поведений — и сразу доступен в проверке и палитре.
 */
export interface ObjectTypeSpec {
  /** Название для палитры. */
  label?: string;
  /** Описанные параметры; неописанные параметры не запрещены, но и не проверяются. */
  params?: readonly ParamSpec[];
  validateParams?: (params: Params, report: (message: string) => void) => void;
}

export interface ValidationEnv {
  objectTypes: Readonly<Record<string, ObjectTypeSpec>>;
  actions: readonly string[];
  /** Известные заглушки рендера; если не задано — имена не проверяются. */
  glyphs?: readonly string[];
}
