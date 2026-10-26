/**
 * Консоль Mini Brick Game B-S96: заставка при включении (рожица, затем «96»), меню номеров 00–96 и сама партия.
 * Меню по фото владельца: на матрице крупное двузначное число — номер игры («01»), без названий и превью; кнопки подписаны LEFT/LEVEL, RIGHT/SPEED, DOWN/GAME.
 * Допущения: DOWN листает номера вперёд, ROTATE — назад (на 97 номеров иначе неудобно), LEFT — уровень 0–12, RIGHT — скорость 0–9 (по кругу), START запускает.
 * Портрет по фото владельца держится 180 тактов, затем появляется 96.
 * Игра идёт как обычный `BrickGame`; после её конца START начинает ту же игру заново, `restart()` (RESET) возвращает в меню.
 */
import { BIG_DIGITS } from './menuArt';
import { MINI_GAME_COUNT, miniEntry } from './games/mini';
import { blit, emptyField, pictureField, type Sprite } from './grid';
import {
  MAX_SPEED,
  MIN_SPEED,
  type BrickEvent,
  type BrickGame,
  type BrickInput,
  type BrickPhase,
} from './types';

/** Уровни 0–12 (13 значков шкалы), скорости 0–9. */
export const MINI_LEVEL_MAX = 12;
export const MINI_SPEED_MAX = 9;
export const MINI_LEVEL_LIMIT = 13;

const wrap = (value: number, count: number): number => ((value % count) + count) % count;
const clamp = (value: number | undefined, max: number): number => Math.min(max, Math.max(0, Math.trunc(value ?? 0) || 0));

/** Full-matrix portrait, owner photograph; static for about three seconds. */
const FACE: Sprite = [
  '##########','##########','##########','##########',
  '###....###','##......##','#..#..#..#','#........#',
  '#..#..#..#','##..##..##','.##....##.','..######..',
  '....##....','#..####..#','##########','##########',
  '##########','##########','##########','##########',
];
export const MINI_FACE_FRAMES = [{ticks:180,face:FACE}] as const;
export const MINI_FACE_TICKS = MINI_FACE_FRAMES.reduce((sum, frame) => sum + frame.ticks, 0);

const FACE_ROW = 0;
/** Две крупные цифры 4 × 7 на матрице 10 × 20: левая — колонки 0–3, правая — 6–9, строки 6–12. */
const DIGIT_ROW = 6;
const DIGIT_COLS: readonly [number, number] = [0, 6];

/** Крупное двузначное число на матрице (меню и «96» заставки). */
export function miniNumberField(number: number): Uint8Array {
  const out = emptyField();
  const text = String(Math.max(0, Math.min(99, Math.trunc(number)))).padStart(2, '0');
  [...text].forEach((digit, index) => blit(out, BIG_DIGITS[Number(digit)]!, DIGIT_COLS[index]!, DIGIT_ROW));
  return out;
}

/** Кадр заставки на такте `tick` от включения: рожица, затем неподвижное «96». */
export function miniIntroField(tick: number): Uint8Array {
  let t = tick;
  for (const frame of MINI_FACE_FRAMES) {
    if (t < frame.ticks) return frame.face ? pictureField(frame.face, 0, FACE_ROW) : emptyField();
    t -= frame.ticks;
  }
  return miniNumberField(96);
}

export interface MiniConsoleOptions {
  /** Зерно партий (каждая новая получает своё, производное от него). */
  seed?: number;
  /** Рекорд номера игры (оболочка хранит их отдельно). */
  hiScore?: (number: number) => number;
  /** Номер игры, выбранный в меню с самого начала (0–96). */
  game?: number;
  speed?: number;
  level?: number;
}

/** Экран до партии: заставка (до первой нажатой кнопки) → меню. */
export type MiniStage = 'intro' | 'menu';

export class MiniConsole implements BrickGame {
  readonly id = 'mini-console';

  private readonly seed: number;
  private readonly hiOf: (number: number) => number;
  private current: BrickGame | null = null;
  private starts = 0;
  private stage: MiniStage = 'intro';
  private stageTicks = 0;
  private powerTicks = 0;
  private number: number;
  private menuSpeed: number;
  private menuLevel: number;

  constructor(options: MiniConsoleOptions = {}) {
    this.seed = (options.seed ?? 1) >>> 0;
    this.hiOf = options.hiScore ?? (() => 0);
    this.number = wrap(Math.trunc(options.game ?? 0) || 0, MINI_GAME_COUNT);
    this.menuSpeed = clamp(options.speed, MINI_SPEED_MAX);
    this.menuLevel = clamp(options.level, MINI_LEVEL_MAX);
  }

  // ---------------------------------------------------------------- состояние для экрана и тестов

  /** Номер игры на экране (0–96). */
  get gameNumber(): number {
    return this.number;
  }

  /** Находимся в меню или на заставке (игра не запущена). */
  get inMenu(): boolean {
    return this.current === null;
  }

  /** Экран консоли: заставка, меню или партия. */
  get screenStage(): MiniStage | 'game' {
    return this.current ? 'game' : this.stage;
  }

  /** Заставка уже показывает «96» и ждёт нажатия. */
  get introDone(): boolean {
    return this.stage === 'intro' && this.stageTicks >= MINI_FACE_TICKS;
  }

  /** Idle animation clock starts at power-on and survives menu selection/settings changes. */
  get idleDisplay(): {scale:number;lines:boolean} {
    const pulse=Math.floor(this.powerTicks/30),phase=pulse%26;
    return {scale:phase<13?phase+1:25-phase,lines:pulse%2===1};
  }

  /** Идентификатор игры выбранного номера (`racing` или `tetris`). */
  get gameId(): string {
    return miniEntry(this.number).def.id;
  }

  /** Вариация выбранной игры с нуля. */
  get mode(): number {
    return miniEntry(this.number).mode;
  }

  /** Запущенная игра (или `null` в меню): для тестов и отладки. */
  get game(): BrickGame | null {
    return this.current;
  }

  /** Настройки меню, с которыми начнётся следующая партия. */
  get startSettings(): { speed: number; level: number } {
    return { speed: this.menuSpeed, level: this.menuLevel };
  }

  /** Скорость 0–9 и уровень 0–12 на экране: в меню — настройка, в партии — текущее значение игры. */
  get displaySpeed(): number {
    return this.current ? Math.max(0, this.current.speed - 1) : this.menuSpeed;
  }

  get displayLevel(): number {
    return this.current ? Math.max(0, this.current.level - 1) : this.menuLevel;
  }

  // ---------------------------------------------------------------- включение и меню

  /** Включение питания: заставка с начала; событие `intro` запускает её сигнал. */
  powerOn(): BrickEvent[] {
    this.current = null;
    this.stage = 'intro';
    this.stageTicks = 0; this.powerTicks = 0;
    return [{ type: 'intro' }];
  }

  /** Такт меню или заставки: любая кнопка в заставке открывает меню, в меню кнопки листают номера и меняют настройки. */
  menu(input: BrickInput): BrickEvent[] {
    if (this.current) return [];
    this.stageTicks++; this.powerTicks++;
    const pressed = input.pressed;
    if (this.stage === 'intro') {
      if (pressed.size === 0) return [];
      this.stage = 'menu';
      this.stageTicks = 0;
      return [{ type: 'move' }];
    }
    const before = `${this.number}:${this.menuSpeed}:${this.menuLevel}`;
    if (pressed.has('down')) this.number = wrap(this.number + 1, MINI_GAME_COUNT);
    if (pressed.has('rotate') || pressed.has('up') || pressed.has('fire')) this.number = wrap(this.number - 1, MINI_GAME_COUNT);
    if (pressed.has('left')) this.menuLevel = wrap(this.menuLevel + 1, MINI_LEVEL_MAX + 1);
    if (pressed.has('right')) this.menuSpeed = wrap(this.menuSpeed + 1, MINI_SPEED_MAX + 1);
    return before === `${this.number}:${this.menuSpeed}:${this.menuLevel}` ? [] : [{ type: 'move' }];
  }

  // ---------------------------------------------------------------- BrickGame

  get phase(): BrickPhase {
    return this.current ? this.current.phase : 'ready';
  }

  get score(): number {
    return this.current?.score ?? 0;
  }

  /** В меню — рекорд выбранного номера, в партии — рекорд партии. */
  get hiScore(): number {
    return this.current ? this.current.hiScore : this.hiOf(this.number);
  }

  get speed(): number {
    return this.current ? this.current.speed : Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.menuSpeed + 1));
  }

  get level(): number {
    return this.current ? this.current.level : this.menuLevel + 1;
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

  /** В заставке открывает меню; в меню запускает выбранный номер; после конца игры — ту же игру заново. */
  start(): BrickEvent[] {
    if (this.current) return this.current.start();
    if (this.stage === 'intro') {
      this.stage = 'menu';
      this.stageTicks = 0;
      return [{ type: 'move' }];
    }
    const { def, mode } = miniEntry(this.number);
    this.starts++;
    this.current = def.create({
      seed: (this.seed + Math.imul(this.starts, 0x9e3779b1)) >>> 0,
      hiScore: this.hiOf(this.number),
      speed: this.menuSpeed + 1,
      level: this.menuLevel + 1,
      levelLimit: MINI_LEVEL_LIMIT,
      mode,
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

  /** Назад в меню (RESET корпуса); выбор в меню сохраняется. */
  restart(): BrickEvent[] {
    this.current = null;
    this.stage = 'menu';
    this.stageTicks = 0;
    return [];
  }

  step(input: BrickInput): BrickEvent[] {
    this.powerTicks++;
    return this.current ? this.current.step(input) : [];
  }

  cells(): Uint8Array {
    if (this.current) return this.current.cells();
    return this.stage === 'intro' ? miniIntroField(this.stageTicks) : miniNumberField(this.number);
  }

  preview(): Uint8Array | null {
    return this.current ? this.current.preview() : null;
  }
}
