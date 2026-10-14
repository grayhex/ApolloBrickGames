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
  /** Подпись; символы — из шрифта HUD. */
  label: string;
  score: number;
}

/** Значки жизни: один ресурс, повторённый по горизонтали (координаты — в логических пикселях экрана). */
export interface HudLives {
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pitch: number;
  /** Значки показывают запасные жизни (жизни − 1: текущая не рисуется). По умолчанию — все жизни. */
  spare?: boolean;
  /** Сколько значков помещается в ряд (при большем числе жизней рисуется столько же). По умолчанию 9. */
  max?: number;
}

/** Ряд цифровых позиций: левый верхний угол первой позиции, шаг и число позиций. */
export interface HudDigits {
  x: number;
  y: number;
  pitch: number;
  slots: number;
}

/**
 * Таймер вместо подписи: слово (`TIME`, один ресурс) слева и число цифрами шрифта HUD (позиции `digits`, как у подписи).
 * Показывается, пока идёт игра с таймером (`rules.timerLimitTicks > 0`): на видео геймплея подпись `1-01` заменялась на `TIME 397`.
 */
export interface HudTime {
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
  digits: HudDigits;
}

/** Шрифт HUD из отдельных ресурсов-символов; размер символа на экране может отличаться от размера спрайта. */
export interface HudFont {
  /** Размер символа на экране. */
  width: number;
  height: number;
  /** Символ → идентификатор ресурса. */
  glyphs: Record<string, string>;
  /** Выключенные сегменты позиции (рисуются под символом, если слой неактивных сегментов включён). */
  ghost: string | null;
}

export type Hud =
  | {
      /** Встроенный шрифт 3 × 5 в полосе поля `margin.top` / `margin.bottom`. */
      kind: 'builtin';
      position: 'top' | 'bottom';
      /** Размер значка жизни в логических пикселях. */
      iconPx: number;
      fixed: HudFixed | null;
    }
  | {
      /** Спрайты в явных координатах (LCD-раскладка). */
      kind: 'lcd';
      fixed: HudFixed | null;
      lives: HudLives;
      label: HudDigits;
      score: HudDigits;
      font: HudFont;
      /** Необязательно: без него таймер на HUD не рисуется (подпись остаётся). */
      time?: HudTime;
    };

export interface ScreenProfile {
  schemaVersion: number;
  id: string;
  status: ContentStatus;
  /** Видимая область игрового поля в клетках. */
  viewport: { columns: number; rows: number };
  /** Размер клетки в логических пикселях (не обязательно квадрат). */
  cell: { width: number; height: number };
  /** Поля вокруг поля игры; HUD располагается в верхнем (или нижнем) поле. */
  margin: { left: number; right: number; top: number; bottom: number };
  /** Цвета LCD: подложка и активные сегменты («чернила»). */
  colors: { background: string; ink: string };
  /** Сглаживание при масштабировании: нужно для растровой графики, у пиксельных заглушек выключено. */
  smoothing: boolean;
  /** Слой неактивных сегментов под каждой клеткой. `enabled` — включён ли по умолчанию. */
  ghost: { asset: string; enabled: boolean } | null;
  hud: Hud;
}

export const DEFAULT_LCD_COLORS = { background: '#a9b79a', ink: '#202a1e' } as const;

/** Размер логического холста экрана: поле + поля вокруг. */
export function screenSize(screen: ScreenProfile): { width: number; height: number } {
  return {
    width: screen.margin.left + screen.viewport.columns * screen.cell.width + screen.margin.right,
    height: screen.margin.top + screen.viewport.rows * screen.cell.height + screen.margin.bottom,
  };
}

// ── Каталог ресурсов ───────────────────────────────────────────────────────

/** Откуда взят ресурс и насколько ему можно верить. */
export interface AssetProvenance {
  /** draft — набросок по неполным референсам; confirmed — сверен и принят владельцем; blocked — не хватает референсов. */
  status: 'draft' | 'confirmed' | 'blocked';
  /** Ссылки на референсы (путь к файлу или описание источника). */
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
      /** Где в исходном файле начинается первый кадр (для атласа — левый верхний угол прямоугольника ресурса). */
      origin: { x: number; y: number };
      /** Кадры лежат в одну горизонтальную полосу, начиная с `origin`. */
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
  /**
   * Секрет с «бонусными» жизнями: если до того, как герой уйдёт из столбца старта («выпрыгнет из колодца»), оболочка передала
   * в ядро аккорд `SECRET_CHORD` (по упаковке — LEFT и DOWN вместе), жизни становятся `lives`. Без поля секрета нет.
   */
  secret?: { lives: number };
  /** 0 — таймер выключен. */
  timerLimitTicks: number;
  /**
   * Длительность одной единицы таймера на HUD в тактах (не обязательно целая: в видео геймплея единица ≈ 0,77 с). По умолчанию — `tickRateHz`
   * (единица — секунда). Число на HUD — `ceil(осталось тактов / timerUnitTicks)`.
   */
  timerUnitTicks?: number;
  /**
   * `section` (по умолчанию) — таймер начинается заново на каждом участке и после гибели; `game` — один на всю игру: гибель и переходы между
   * участками его не сбрасывают (стоит, пока герой не играет), а когда время вышло, игра заканчивается сразу — все жизни теряются.
   */
  timerScope?: 'section' | 'game';
  deathDelayTicks: number;
  /**
   * Что лежит за нижним краем карты: `pit` — провал (герой выпадает и погибает), `floor` — земля
   * (нижний ряд карты рабочий, в нём можно стоять). По умолчанию `pit`.
   */
  bottomEdge?: 'pit' | 'floor';
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

// ── Анимации (презентация, в симуляции не участвуют) ───────────────────────

/** Клетка карты. */
export interface CellPos {
  x: number;
  y: number;
}

/**
 * Интро участка (наблюдение по видео фрагмента): пустой экран → поле заполняется блоками → пауза →
 * блоки растворяются → герой пробегает маршрут и оставляет за собой твёрдые клетки. Все длительности — в тактах.
 */
export interface IntroAnimation {
  blankTicks: number;
  fillTicks: number;
  holdTicks: number;
  dissolveTicks: number;
  emptyTicks: number;
  /** Доля клеток поля, заполняемая блоками (остальные — «дырки»), 0…1. */
  coverage: number;
  /** Тактов на один шаг героя по маршруту. */
  stepTicks: number;
  /** id уровня → маршрут героя (соседние клетки; последняя — точка старта уровня). Без записи этап построения пропускается. */
  routes: Record<string, CellPos[]>;
}

/** Шаг сценария входа: удерживаемые и нажатые на первом такте действия, длительность в тактах. */
export interface EntryStep {
  ticks: number;
  held: string[];
  press: string[];
}

export interface AnimationsDef {
  schemaVersion: number;
  id: string;
  status: ContentStatus;
  /** Отскок перекладины: сколько тактов показывается копия блока над местом удара головой. null — без эффекта. */
  bump: { ticks: number } | null;
  /** Интро участка; null — без интро. */
  intro: IntroAnimation | null;
  /**
   * Сценарий входа: после старта участка первые такты вместо игрока вводит заготовленный ввод
   * (герой «выходит из туннеля»). Это обычный ввод на вход ядра, поэтому он идёт через те же правила и записывается в replay.
   */
  entry: { scripts: Record<string, EntryStep[]> } | null;
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

/** Насколько можно верить наблюдению: «не видно/неизвестно», «предположение», «подтверждено». */
export type ObservationStatus = 'unknown' | 'assumed' | 'confirmed';

/**
 * Исследовательская пометка области или клетки: что известно о карте, а что нет.
 * Метаданные уровня — в симуляции не участвуют. «Пустая наблюдаемая клетка» — это отсутствие пометки;
 * «неизвестная клетка» — пометка `unknown` (в `rows` в таком месте стоит символ пустой клетки лишь как заполнитель).
 */
export interface LevelMark {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status: ObservationStatus;
  /** Короткая заметка. */
  note: string;
  /** Название референса (кадра), по которому сделана пометка; пустая строка — без ссылки. */
  ref: string;
}

export const MAX_MARK_NOTE = 500;
export const MAX_MARK_REF = 80;

export interface LevelDef {
  schemaVersion: number;
  id: string;
  status: ContentStatus;
  /** Подпись в HUD; формат подписи оригинала не установлен. */
  hudLabel: string;
  /** Пояснение к уровню (происхождение, допущения). Метаданные: в симуляции не участвуют. */
  note: string;
  width: number;
  height: number;
  legend: Record<string, LegendEntry>;
  rows: string[];
  start: { x: number; y: number };
  objects: ObjectDef[];
  transitions: Transition[];
  /** Исследовательские пометки; по умолчанию пусто. Не участвуют в симуляции. */
  marks: LevelMark[];
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
  /** Необязательный файл анимаций (отскок блока, интро участка). */
  animations?: string;
  /** Идентификаторы ресурсов героя и снаряда (в ядре их нет). */
  sprites: { hero: string; projectile: string | null; life: string };
}

export interface ContentPack {
  manifest: PackManifest;
  screen: ScreenProfile;
  rules: RuleSetDef;
  assets: AssetCatalog;
  levels: LevelDef[];
  /** Анимации (необязательны). */
  animations?: AnimationsDef;
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
