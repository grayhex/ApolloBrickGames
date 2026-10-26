/**
 * Консоль с меню («168 в 1 танк», «Морской бой»): меню и игра в одном `BrickGame`. В меню на матрице — знак игры (цифра или буква), номер варианта и иллюстрация; кнопки меняют выбор,
 * «старт» запускает выбранную игру. Игра идёт как обычный `BrickGame`; после конца игры «старт» начинает ту же игру заново, `restart()` возвращает в меню.
 * Это допущение: как именно листается меню на настоящем устройстве, неизвестно (по подписям клавиш: UP/MODE — вариант, LEFT/LEVEL — уровень,
 * RIGHT/SPEED — скорость, а игру листает большая кнопка ROTATE). Набор игр, их знаки и число вариантов — у каждой консоли свои (`BrickConsoleEntry`). Настройки меню — число 0..9 (на экране у настоящего устройства в меню SPEED 0 и LEVEL 0).
 */
import type { NativeEntry } from '../devices/catalog';
import nativeMenuFrames from '../devices/menu-frames.json';
import { menuField } from './menuArt';
import { SEA_START, SEA_START_FX_TICKS, SEA_START_LEAD_TICKS } from './seaAnimations';
import { seaMenuField } from './seaMenu';
import {
  BRICK_CELLS,
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
  entryId?: string;
  native?: NativeEntry;
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
  nativeMenu?: 'e88' | 'apollo-b0202';
  /** `sea` — «Морской бой» по фото и видео оригинала: заставка при включении, меню с буквой и анимацией «Ромео и Джульетта», анимация игры A перед партией. */
  menuStyle?: 'sea';
  mode?: number;
  speed?: number;
  level?: number;
}

/** Экран до партии у консоли в стиле `sea`: заставка (до первой нажатой кнопки) → меню. */
type SeaStage = 'intro' | 'menu';

const wrap = (value: number, count: number): number => ((value % count) + count) % count;
const clampSetting = (value: number | undefined, max = MENU_SETTING_MAX): number => Math.min(max, Math.max(0, Math.trunc(value ?? 0) || 0));

export class BrickConsole implements BrickGame {
  readonly id = 'console';

  private readonly catalog: readonly BrickConsoleEntry[];
  private readonly seed: number;
  private readonly hiOf: (gameId: string, mode: number) => number;
  private current: BrickGame | null = null;
  private starts = 0;
  rotationDirection:1|-1=1;
  private readonly nativeMenu: BrickConsoleOptions['nativeMenu'];
  private readonly menuStyle: BrickConsoleOptions['menuStyle'];
  private stage: SeaStage = 'menu';
  /** Такты в текущем экране до партии (заставка, меню): с него идут кадры анимаций. */
  private stageTicks = 0;
  private gameIndex: number;
  private modeIndex: number;
  private menuSpeed: number;
  private menuLevel: number;

  constructor(options: BrickConsoleOptions) {
    if (options.catalog.length === 0) throw new Error('BrickConsole: пустой каталог игр');
    this.catalog = options.catalog;
    this.nativeMenu = options.nativeMenu;
    this.menuStyle = options.menuStyle;
    if (this.menuStyle === 'sea') this.stage = 'intro';
    this.seed = (options.seed ?? 1) >>> 0;
    this.hiOf = options.hiScore ?? (() => 0);
    this.gameIndex = wrap(Math.trunc(options.game ?? 0) || 0, this.catalog.length);
    this.modeIndex = wrap(Math.trunc(options.mode ?? 0) || 0, this.modeCount);
    this.menuSpeed = clampSetting(options.speed);
    this.menuLevel = clampSetting(options.level, this.nativeMenu==='e88'?12:9);
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
    const index = this.catalog.findIndex((entry) => (entry.entryId ?? entry.id) === id);
    if (this.current || index < 0) return false;
    if (this.stage !== 'menu') this.enterMenu();
    if (index !== this.gameIndex) this.stageTicks = 0;
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
    if (this.selected.native) return Number(this.selected.native.nativeCode.replace(/^[A-I]/, ''));
    return this.modeIndex + 1;
  }

  /** Идентификатор выбранной (в меню) или запущенной игры. */
  get entryId(): string { return this.selected.entryId ?? this.selected.id; }
  get native(): NativeEntry | undefined { return this.selected.native; }

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
    if (this.nativeMenu) return this.nativeInput(input);
    this.stageTicks++;
    if (this.stage === 'intro' && input.pressed.size > 0) {
      this.enterMenu();
      return [{ type: 'move' }];
    }
    if (this.stage === 'intro') return this.introFx();
    const shown = this.gameIndex;
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
    if (this.gameIndex !== shown) this.stageTicks = 0; // анимация меню начинается с первого кадра при выборе игры
    return events;
  }

  /** Вспышки заставки (выстрел, взрыв снаряда) звучат на тактах петли `SEA_START_FX_TICKS`: звук привязан к кадрам анимации, а не к мелодии. */
  private introFx(): BrickEvent[] {
    const t = this.stageTicks - SEA_START_LEAD_TICKS;
    return t > 0 && SEA_START_FX_TICKS.includes(t % SEA_START.total) ? [{ type: 'introFx' }] : [];
  }

  private enterMenu(): void {
    this.stage = 'menu';
    this.stageTicks = 0;
  }

  /** Экран консоли: заставка, меню или партия (для проверок и `data-stage`). */
  get screenStage(): SeaStage | 'game' {
    return this.current ? 'game' : this.stage;
  }

  /** Заставка «Морского боя» идёт, пока не нажата кнопка (панель при этом пуста): `cells()` берёт кадры из записи. */
  get intro(): boolean {
    return !this.current && this.stage === 'intro';
  }

  /** У консолей в стиле `sea` нет проверки экрана при включении: сразу заставка. */
  get bootCheck(): boolean {
    return this.menuStyle !== 'sea';
  }

  /** Включение питания: у «Морского боя» — заставка (событие `intro` запускает её мелодию). */
  powerOn(): BrickEvent[] {
    if (this.menuStyle !== 'sea') return [];
    this.current = null;
    this.stage = 'intro';
    this.stageTicks = 0;
    return [{ type: 'intro' }];
  }

  private nativeInput(input: BrickInput): BrickEvent[] {
    const before = `${this.gameIndex}:${this.menuSpeed}:${this.menuLevel}:${this.rotationDirection}`;
    const apollo = this.nativeMenu === 'apollo-b0202';
    if (!apollo && input.pressed.has('rotate')) this.rotationDirection = this.rotationDirection === 1 ? -1 : 1;
    if (input.pressed.has('down')) {
      if (apollo && input.held.has('right')) {
        const groups = [...new Set(this.catalog.map(e => e.native!.group))];
        const next = groups[wrap(groups.indexOf(this.selected.native!.group) + 1, groups.length)];
        this.gameIndex = this.catalog.findIndex(e => e.native!.group === next);
      } else if (apollo) {
        const group = this.catalog.map((e, i) => ({e,i})).filter(({e}) => e.native!.group === this.selected.native!.group);
        this.gameIndex = group[wrap(group.findIndex(({i}) => i === this.gameIndex) + 1, group.length)]!.i;
      } else this.gameIndex = wrap(this.gameIndex + 1, this.catalog.length);
    } else if (apollo && input.pressed.has('rotate')) {
      const group = this.catalog.map((e, i) => ({e,i})).filter(({e}) => e.native!.group === this.selected.native!.group);
      this.gameIndex = group[wrap(group.findIndex(({i}) => i === this.gameIndex) - 1, group.length)]!.i;
    }
    if (input.pressed.has('left')) this.menuLevel = wrap(this.menuLevel + 1, apollo ? 10 : 13);
    if (input.pressed.has('right')) this.menuSpeed = wrap(this.menuSpeed + 1, 10);
    return before === `${this.gameIndex}:${this.menuSpeed}:${this.menuLevel}:${this.rotationDirection}` ? [] : [{ type:'move' }];
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
    return this.current ? this.current.hiScore : this.hiOf(this.selected.entryId ?? this.selected.id, this.selectedMode);
  }

  get speed(): number {
    return this.current ? this.current.speed : Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.menuSpeed + 1));
  }

  get level(): number {
    return this.current ? this.current.level : Math.min(this.nativeMenu==='e88'?13:MAX_LEVEL, Math.max(MIN_LEVEL, this.menuLevel + 1));
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
    if (this.menuStyle === 'sea') {
      if (this.stage === 'intro') {
        this.enterMenu();
        return [{ type: 'move' }];
      }
    }
    return this.begin();
  }

  private begin(): BrickEvent[] {
    const { def, id } = this.selected;
    if (!def) return [{ type: 'blocked' }];
    this.starts++;
    this.current = def.create({
      seed: (this.seed + Math.imul(this.starts, 0x9e3779b1)) >>> 0,
      hiScore: this.hiOf(this.selected.entryId ?? id, this.selectedMode),
      speed: this.menuSpeed + 1,
      level: this.menuLevel + 1,
      mode: this.selectedMode,
      ...(this.menuStyle === 'sea' ? { seaLayout: true } : {}),
      ...(this.nativeMenu==='e88' ? {rotationDirection:this.rotationDirection} : {}),
    });
    return this.current.start();
  }

  pause(): BrickEvent[] {
    return this.current?.pause() ?? [];
  }

  startButton(): BrickEvent[] {
    return this.current?.startButton ? this.current.startButton() : this.pause();
  }

  resume(): BrickEvent[] {
    return this.current?.resume() ?? [];
  }

  /** Назад в меню (как RESET у настоящего устройства); выбор в меню сохраняется. */
  restart(): BrickEvent[] {
    this.current = null;
    if (this.menuStyle === 'sea') this.enterMenu();
    return [];
  }

  step(input: BrickInput): BrickEvent[] {
    return this.current ? this.current.step(input) : [];
  }

  cells(): Uint8Array {
    if (this.current) return this.current.cells();
    const native = this.selected.native;
    if (native) {
      const frames = nativeMenuFrames[native.profileId] as Record<string, string[]>;
      return Uint8Array.from((frames[native.nativeCode] ?? []).join(''), Number);
    }
    if (this.menuStyle === 'sea') {
      if (this.stage === 'intro') {
        const t = this.stageTicks - SEA_START_LEAD_TICKS;
        return t < 0 ? new Uint8Array(BRICK_CELLS) : SEA_START.at(t).cells;
      }
      return seaMenuField(this.selected.symbol, this.modeNumber, this.stageTicks);
    }
    return menuField(this.selected.symbol, this.modeNumber, this.selected.id);
  }

  preview(): Uint8Array | null {
    return this.current ? this.current.preview() : null;
  }
}
