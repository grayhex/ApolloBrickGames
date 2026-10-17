/**
 * Общий интерфейс «кирпичных» игр для матрицы 10 × 20: тетрис, танки, гонки, стрельба, лягушка и другие игры консолей Apollo.
 * Ядро чистое и детерминированное: никакого DOM, часов и Math.random — случайность только через seeded ГСЧ (`Rng`).
 * Один вызов `step` — один такт (`BRICK_TICK_HZ` в секунду); одинаковое зерно и одинаковые вводы дают одинаковые состояния.
 */

export const BRICK_COLS = 10;
export const BRICK_ROWS = 20;
export const BRICK_CELLS = BRICK_COLS * BRICK_ROWS;
/** Такты в секунду — как у `FixedStepper` оболочки (и у одиночного тетриса). */
export const BRICK_TICK_HZ = 60;
/** Превью («NEXT»): 4 × 4 клетки. */
export const PREVIEW_COLS = 4;
export const PREVIEW_ROWS = 4;
export const PREVIEW_CELLS = PREVIEW_COLS * PREVIEW_ROWS;

/** Значения клеток матрицы и превью: 0 — погашена, 1 — горит, 2 — мигает (горит и гаснет сама, ритм задаёт экран). */
export const CELL_OFF = 0;
export const CELL_ON = 1;
export const CELL_BLINK = 2;

/** Скорость и уровень игры, как в игрушке: 1..10 (на экране консоли показывается число минус один). */
export const MIN_SPEED = 1;
export const MAX_SPEED = 10;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10;

/** Максимум счёта: дальше упор, а не переполнение. */
export const MAX_SCORE = 9_999_999;
export const DEFAULT_SEED = 1;

/**
 * Действия движка. `rotate` — большая кнопка ROTATE (в стрелялках — огонь). Значение `fire` задаёт игра:
 * бросок, выстрел, повтор задачи или укладка фигуры. На текущих матричных Apollo отдельной FIRE нет; оболочка фильтрует
 * это действие даже с клавиатуры/геймпада. RESET корпуса возвращает в меню.
 */
export type BrickAction = 'left' | 'right' | 'up' | 'down' | 'rotate' | 'fire';

export type BrickPhase = 'ready' | 'playing' | 'paused' | 'over';

export interface BrickInput {
  /** Фронт нажатия в этом такте. */
  readonly pressed: ReadonlySet<BrickAction>;
  /** Кнопки, которые сейчас зажаты (нажатые в этом такте считаются зажатыми тоже). */
  readonly held: ReadonlySet<BrickAction>;
}

export const NEUTRAL_BRICK_INPUT: BrickInput = { pressed: new Set(), held: new Set() };

/** Собрать ввод такта. Нажатые в этом такте кнопки автоматически считаются и зажатыми. */
export function makeBrickInput(pressed: Iterable<BrickAction> = [], held: Iterable<BrickAction> = []): BrickInput {
  const pressedSet = new Set(pressed);
  const heldSet = new Set(held);
  for (const action of pressedSet) heldSet.add(action);
  return { pressed: pressedSet, held: heldSet };
}

/** События для звука и оболочки (оболочка сопоставляет им короткие сигналы пищалки). */
export type BrickEvent =
  | { type: 'started' }
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'lock' }
  | { type: 'drop' }
  | { type: 'shot' }
  | { type: 'hit' }
  | { type: 'explode' }
  | { type: 'crash' }
  | { type: 'lifeLost' }
  | { type: 'bonus' }
  | { type: 'win' }
  | { type: 'blocked' }
  /** Сигнал площадки (Simon, танцы): номер площадки 0–3 (вверх, вправо, вниз, влево) и длительность в тактах. Оболочка превращает его в тон площадки. */
  | { type: 'tone'; pad: number; ticks: number }
  | { type: 'lines'; count: number; rows?: number[] }
  | { type: 'levelUp'; speed: number }
  | { type: 'gameOver' }
  | { type: 'paused' }
  | { type: 'resumed' };

/** Что нужно игре при создании. Все числа — «донорские»: скорость и уровень 1..10, режим — номер варианта с нуля. */
export interface BrickGameOptions {
  seed?: number;
  hiScore?: number;
  /** Начальная скорость 1..10 (по умолчанию 1). */
  speed?: number;
  /** Начальный уровень 1..10 (по умолчанию 1). */
  level?: number;
  /** Вариант игры (режим) с нуля: 0 — «01» на экране. Вне диапазона — берётся по модулю числа вариантов. */
  mode?: number;
}

/**
 * Игра. Оболочка и консоль с меню (`console.ts`) работают только с этим интерфейсом.
 * Рисунок поля отдаёт `cells()` (200 значений, строка за строкой, верх — строка 0), превью — `preview()` (16 значений или `null`).
 */
export interface BrickGame {
  /** Идентификатор игры (`GameId` каталога). */
  readonly id: string;
  readonly phase: BrickPhase;
  readonly score: number;
  readonly hiScore: number;
  /** Текущая скорость, 1..10. */
  readonly speed: number;
  /** Текущий уровень, 1..10. */
  readonly level: number;
  /** Оставшиеся жизни (0..4) или `null`, если у игры жизней нет. Показываются в превью. */
  readonly lives: number | null;
  /** Такты, отыгранные в фазе `playing` с начала партии. */
  readonly tick: number;
  /** Анимация конца игры: сколько рядов снизу уже залито (0..BRICK_ROWS). */
  readonly overFill: number;

  /** `ready` или `over` -> `playing`: новая партия, рекорд сохраняется. */
  start(): BrickEvent[];
  pause(): BrickEvent[];
  resume(): BrickEvent[];
  /** Свежая партия в любой фазе, но без старта: `ready`. */
  restart(): BrickEvent[];
  /** Один такт. Работает только в `playing` (в том числе анимации потери жизни и конца игры). */
  step(input: BrickInput): BrickEvent[];

  /** Матрица 10 × 20 для рисования: новая копия или внутренний буфер, который игра не меняет до следующего вызова `step`. */
  cells(): Uint8Array;
  /** Превью 4 × 4 (следующая фигура, жизни и т. п.) или `null`. */
  preview(): Uint8Array | null;
}

/** Описание варианта игры (режима). */
export interface BrickModeDef {
  /** Короткое название для справки и админки. */
  name: { ru: string; en: string };
  /** Что за вариант (одной-двумя фразами), в том числе что в нём донорское и что — допущение. */
  note: string;
}

/** Игра в каталоге консоли: номер в меню, варианты и фабрика. */
export interface BrickGameDef {
  /** Идентификатор игры (см. `GameId` в `src/games/catalog.ts`). */
  id: string;
  /** Варианты игры; номер на экране — индекс + 1 (двузначный: 01, 02, …). */
  /**
   * Кнопки, без которых игру нельзя пройти. По умолчанию — только то, что есть на корпусе игрушек 1–4 (стрелки и ROTATE). Если нужна кнопка, которой на корпусе нет
   * (например, отдельный «огонь»: RESET корпуса — выход в меню, а не огонь), игра не назначается игрушке — ни в схеме конфигурации, ни в списке админки.
   * Кнопки не дорисовываются, клавиатура и длинные нажатия вместо недостающей кнопки не вводятся: у нас всё аутентично.
   */
  needs?: readonly BrickAction[];
  modes: readonly BrickModeDef[];
  /** Сколько вариантов у игры на настоящем устройстве, если известно (иначе `null`): реализованных может быть меньше. */
  declaredModes: number | null;
  create(options: BrickGameOptions): BrickGame;
}
