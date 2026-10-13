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

/** Фиксированные тестовые значения индикаторов: не состояние игры и не структура оригинала. */
export interface HudFixed {
  lives: number;
  /** Подпись в центре строки; символы — из шрифта HUD. */
  label: string;
  score: number;
}

/** Шрифт HUD из ресурса: кадры полосы идут в порядке `glyphs`. */
export interface HudFont {
  asset: string;
  glyphs: string;
}

export interface ScreenProfile {
  schemaVersion: number;
  id: string;
  status: ContentStatus;
  /** Видимая область игрового поля в клетках. */
  viewport: { columns: number; rows: number };
  /**
   * HUD — отдельная область вне игрового поля. `fixed: null` — значения из состояния игры;
   * `font: null` — встроенный шрифт 3×5.
   */
  hud: {
    rows: number;
    position: 'top' | 'bottom';
    /** Размер значка жизни в логических пикселях (по умолчанию — клетка). */
    iconPx: number;
    fixed: HudFixed | null;
    font: HudFont | null;
  };
  /** Размер клетки в логических пикселях Canvas (до масштабирования). */
  cellPx: number;
  /** Цвета LCD: подложка и активные сегменты («чернила»). */
  colors: { background: string; ink: string };
}

export const DEFAULT_LCD_COLORS = { background: '#a9b79a', ink: '#202a1e' } as const;

// ── Каталог ресурсов ───────────────────────────────────────────────────────

/** Откуда взят ресурс и насколько ему можно верить. */
export interface AssetProvenance {
  /** draft — набросок по неполным референсам; confirmed — сверен и принят владельцем; blocked — не хватает референсов. */
  status: 'draft' | 'confirmed' | 'blocked';
  /** Ссылки на референсы (файлы docs/references или описание источника). */
  sources: string[];
  /** Что неизвестно или нуждается в уточнении. */
  note: string;
  /** Точка привязки в координатах ресурса. */
  anchor: string;
}

export type AssetDef =
  | { kind: 'placeholder'; glyph: string }
  | {
      kind: 'image';
      /** Путь относительно файла каталога. PNG или SVG (в SVG `currentColor` заменяется цветом LCD). */
      src: string;
      frameWidth: number;
      frameHeight: number;
      /** Кадры лежат в одну горизонтальную полосу. */
      frames: number;
      /** Сколько тактов показывается один кадр. */
      frameTicks: number;
      /** Заглушка, пока картинка не загрузилась или недоступна. */
      fallbackGlyph: string;
      /** Зеркалить при взгляде влево. По умолчанию нет: зеркало не считается автоматически верным. */
      mirrorWhenLeft: boolean;
      provenance: AssetProvenance | null;
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
  /** null — стрельбы нет вообще (в однокомнатном демо). */
  fire: FireRules | null;
  lives: number;
  /** 0 — таймер выключен. */
  timerLimitTicks: number;
  deathDelayTicks: number;
}

export interface FireRules {
  intervalTicks: number;
  holdRepeat: boolean;
  maxProjectiles: number;
  projectile: { cellsPerStep: number; stepTicks: number; maxRangeCells: number };
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
  sprites: { hero: string; projectile: string | null; life: string };
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
