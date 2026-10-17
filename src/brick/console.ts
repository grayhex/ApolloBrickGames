/**
 * Консоль с меню («168 в 1 танк», «Морской бой»): меню и игра в одном `BrickGame`. В меню на матрице — знак игры (цифра или буква), номер варианта и иллюстрация; кнопки меняют выбор,
 * «старт» запускает выбранную игру. Игра идёт как обычный `BrickGame`; после конца игры «старт» начинает ту же игру заново, `restart()` возвращает в меню.
 * Это допущение: как именно листается меню на настоящем устройстве, неизвестно (по подписям клавиш: UP/MODE — вариант, LEFT/LEVEL — уровень,
 * RIGHT/SPEED — скорость, а игру листает большая кнопка ROTATE). Набор игр, их знаки и число вариантов — у каждой консоли свои (`BrickConsoleEntry`). Настройки меню — число 0..9 (на экране у настоящего устройства в меню SPEED 0 и LEVEL 0).
 */
import { menuField } from './menuArt';
import {
  MAX_LEVEL,
  MAX_SPEED,
  MIN_LEVEL,
  MIN_SPEED,
  type BrickEvent,
  type BrickGame,
  type BrickGameDef,
  type BrickInput,
  type BrickPhase,
} from './types';

/** Предельное значение настройки скорости и уровня в меню (на экране 0..9; игре передаётся на единицу больше). */
export const MENU_SETTING_MAX = 9;

/** Пункт меню консоли. Игры у консолей пересекаются, а знаки, число вариантов и порядок — свои. */
export interface BrickConsoleEntry {
  /** Знак игры на экране: цифра `1`–`9` («168 в 1 танк») или буква `A`–`F` («Морской бой»). */
  symbol: string;
  /** Идентификатор игры: иллюстрация меню и ключ рекорда. */
  id: string;
  /** Игра; `null` — на устройстве есть, но ещё не восстановлена: в меню выбирается, не запускается (событие `blocked`). */
  def: BrickGameDef | null;
  /** Какие варианты игры (индексы в `def.modes`, по порядку) показывает эта консоль; без поля — все реализованные. */
  modes?: readonly number[];
  /** Сколько вариантов у игры на этой консоли по наблюдениям владельца (если известно): реализованных может быть меньше. */
  declaredModes?: number | null;
}

export interface BrickConsoleOptions {
  /** Пункты меню по порядку. */
  catalog: readonly BrickConsoleEntry[];
  /** Зерно: каждая новая партия получает своё, производное от него (повторяемо). */
  seed?: number;
  /** Рекорд игры в варианте (оболочка хранит их отдельно). */
  hiScore?: (gameId: string, mode: number) => number;
  /** Начальный выбор в меню (с нуля): игра, вариант, скорость и уровень. */
  game?: number;
  mode?: number;
  speed?: number;
  level?: number;
}

const wrap = (value: number, count: number): number => ((value % count) + count) % count;
const clampSetting = (value: number | undefined): number => Math.min(MENU_SETTING_MAX, Math.max(0, Math.trunc(value ?? 0) || 0));

export class BrickConsole implements BrickGame {
  readonly id = 'console';

  private readonly catalog: readonly BrickConsoleEntry[];
  private readonly seed: number;
  private readonly hiOf: (gameId: string, mode: number) => number;
  private current: BrickGame | null = null;
  private starts = 0;
  private gameIndex: number;
  private modeIndex: number;
  private menuSpeed: number;
  private menuLevel: number;

  constructor(options: BrickConsoleOptions) {
    if (options.catalog.length === 0) throw new Error('BrickConsole: пустой каталог игр');
    this.catalog = options.catalog;
    this.seed = (options.seed ?? 1) >>> 0;
    this.hiOf = options.hiScore ?? (() => 0);
    this.gameIndex = wrap(Math.trunc(options.game ?? 0) || 0, this.catalog.length);
    this.modeIndex = wrap(Math.trunc(options.mode ?? 0) || 0, this.modeCount);
    this.menuSpeed = clampSetting(options.speed);
    this.menuLevel = clampSetting(options.level);
  }

  // ---------------------------------------------------------------- выбор в меню

  private get selected(): BrickConsoleEntry {
    const entry = this.catalog[this.gameIndex];
    if (!entry) throw new Error('BrickConsole: нет игры с таким номером');
    return entry;
  }

  /** Сколько вариантов у выбранной игры в меню этой консоли. */
  get modeCount(): number {
    const entry = this.selected;
    return Math.max(1, entry.modes?.length ?? entry.def?.modes.length ?? 1);
  }

  /** Находимся в меню (игра ещё не выбрана и не запущена). */
  get inMenu(): boolean {
    return this.current === null;
  }

  /** Номер выбранной игры в меню (с единицы). */
  get gameNumber(): number {
    return this.gameIndex + 1;
  }

  /** Выбрать игру в меню по идентификатору (кнопка в справке); вне меню или для чужой игры — `false`. Вариант сбрасывается на первый, как при листании. */
  selectGame(id: string): boolean {
    const index = this.catalog.findIndex((entry) => entry.id === id);
    if (this.current || index < 0) return false;
    this.gameIndex = index;
    this.modeIndex = 0;
    return true;
  }

  /** Знак выбранной игры на экране: цифра или буква. */
  get symbol(): string {
    return this.selected.symbol;
  }

  /** Игра выбранного пункта восстановлена и запускается. */
  get playable(): boolean {
    return this.selected.def !== null;
  }

  /** Номер выбранного варианта на экране (с единицы). */
  get modeNumber(): number {
    return this.modeIndex + 1;
  }

  /** Идентификатор выбранной (в меню) или запущенной игры. */
  get gameId(): string {
    return this.selected.id;
  }

  /** Вариант выбранной (в меню) или запущенной игры, с нуля: номер в самой игре (у консоли с урезанным списком вариантов он может отличаться от номера на экране). */
  get mode(): number {
    return this.selectedMode;
  }

  /** Frozen menu settings used for the next start, independent of progress inside the game. */
  get startSettings(): {speed:number;level:number} { return {speed:this.menuSpeed,level:this.menuLevel}; }

  private get selectedMode(): number {
    return this.selected.modes?.[this.modeIndex] ?? this.modeIndex;
  }

  /** Скорость и уровень в меню и на экране консоли — число 0..9 (у игры внутри — на единицу больше). */
  get displaySpeed(): number {
    return this.current ? Math.max(0, this.current.speed - 1) : this.menuSpeed;
  }

  get displayLevel(): number {
    return this.current ? Math.max(0, this.current.level - 1) : this.menuLevel;
  }

  /** Запущенная игра (или `null` в меню): для тестов и отладки. */
  get game(): BrickGame | null {
    return this.current;
  }

  /** Кнопки меню (по фронту нажатия): ROTATE — следующая игра, UP/DOWN — вариант вперёд/назад, LEFT — уровень, RIGHT — скорость. */
  menu(input: BrickInput): BrickEvent[] {
    if (this.current) return [];
    const events: BrickEvent[] = [];
    const moved = (): void => {
      events.push({ type: 'move' });
    };
    if (input.pressed.has('rotate') || input.pressed.has('fire')) {
      this.gameIndex = wrap(this.gameIndex + 1, this.catalog.length);
      this.modeIndex = 0;
      moved();
    }
    if (input.pressed.has('up')) {
      this.modeIndex = wrap(this.modeIndex + 1, this.modeCount);
      moved();
    }
    if (input.pressed.has('down')) {
      this.modeIndex = wrap(this.modeIndex - 1, this.modeCount);
      moved();
    }
    if (input.pressed.has('left')) {
      this.menuLevel = wrap(this.menuLevel + 1, MENU_SETTING_MAX + 1);
      moved();
    }
    if (input.pressed.has('right')) {
      this.menuSpeed = wrap(this.menuSpeed + 1, MENU_SETTING_MAX + 1);
      moved();
    }
    return events;
  }

  // ---------------------------------------------------------------- BrickGame

  get phase(): BrickPhase {
    return this.current ? this.current.phase : 'ready';
  }

  get score(): number {
    return this.current?.score ?? 0;
  }

  /** В меню — рекорд выбранной игры и варианта, в игре — рекорд партии. */
  get hiScore(): number {
    return this.current ? this.current.hiScore : this.hiOf(this.selected.id, this.selectedMode);
  }

  get speed(): number {
    return this.current ? this.current.speed : Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.menuSpeed + 1));
  }

  get level(): number {
    return this.current ? this.current.level : Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, this.menuLevel + 1));
  }

  get lives(): number | null {
    return this.current?.lives ?? null;
  }

  get tick(): number {
    return this.current?.tick ?? 0;
  }

  get overFill(): number {
    return this.current?.overFill ?? 0;
  }

  /** В меню запускает выбранную игру; после конца игры — ту же игру заново; в игре ничего не делает. */
  start(): BrickEvent[] {
    if (this.current) return this.current.start();
    const { def, id } = this.selected;
    if (!def) return [{ type: 'blocked' }];
    this.starts++;
    this.current = def.create({
      seed: (this.seed + Math.imul(this.starts, 0x9e3779b1)) >>> 0,
      hiScore: this.hiOf(id, this.selectedMode),
      speed: this.menuSpeed + 1,
      level: this.menuLevel + 1,
      mode: this.selectedMode,
    });
    return this.current.start();
  }

  pause(): BrickEvent[] {
    return this.current?.pause() ?? [];
  }

  resume(): BrickEvent[] {
    return this.current?.resume() ?? [];
  }

  /** Назад в меню (как RESET у настоящего устройства); выбор в меню сохраняется. */
  restart(): BrickEvent[] {
    this.current = null;
    return [];
  }

  step(input: BrickInput): BrickEvent[] {
    return this.current ? this.current.step(input) : [];
  }

  cells(): Uint8Array {
    return this.current ? this.current.cells() : menuField(this.selected.symbol, this.modeNumber, this.selected.id);
  }

  preview(): Uint8Array | null {
    return this.current?.preview() ?? null;
  }
}
