/**
 * Консоль Prince 皇太子 (118 in 1): заставка при включении («Финал» увертюры и поднимающиеся цифры «9 9 9 9 in 1») → автоплей игр → партия.
 * Владелец: после заставки сразу включается автоплей — тетрис, гонки, танки, фроггер, арканоид; большая кнопка переключает игру; можно выбрать скорость и режим
 * и нажать старт, чтобы играть самому. Допущения (docs/devices/prince118.md): ROTATE — следующая игра, UP — предыдущая, DOWN — следующая вариация игры,
 * LEFT — уровень 0–12, RIGHT — скорость 0–9 (по кругу), START — играть; любая кнопка во время заставки её пропускает; RESET из партии возвращает в автоплей.
 */
import { princeEntry, princeNumber, PRINCE_GAMES, PRINCE_GAME_COUNT } from './games/prince';
import { MiniConsole, MINI_LEVEL_LIMIT, MINI_LEVEL_MAX, MINI_SPEED_MAX, type MiniConsoleOptions, type MiniStage } from './miniConsole';
import { MINI_IDLE_STEP_TICKS } from './miniTiming';
import { PRINCE_INTRO_TICKS, princeIntroField } from './princeIntro';
import { PrinceBot } from './princeDemo';
import { makeBrickInput, type BrickEvent, type BrickGame, type BrickInput, type BrickPhase } from './types';

const wrap = (value: number, count: number): number => ((value % count) + count) % count;
const clamp = (value: number | undefined, max: number): number => Math.min(max, Math.max(0, Math.trunc(value ?? 0) || 0));
/** После конца партии автоплея пауза перед новой, такты (≈ 2,5 с). */
const DEMO_OVER_WAIT = 150;

export class PrinceConsole extends MiniConsole {
  private live: BrickGame | null = null;
  private demo: BrickGame;
  private readonly bot: PrinceBot;
  private readonly baseSeed: number;
  private readonly record: (number: number) => number;
  private princeStage: MiniStage = 'intro';
  private selNumber: number;
  private selSpeed: number;
  private selLevel: number;
  private clock = 0;
  private introTicks = 0;
  private played = 0;
  private overTicks = 0;
  /** Последняя выбранная вариация каждой игры: большая кнопка возвращает к ней. */
  private readonly remembered: number[] = PRINCE_GAMES.map(() => 0);

  constructor(options: MiniConsoleOptions = {}) {
    super(options);
    this.baseSeed = (options.seed ?? 1) >>> 0;
    this.record = options.hiScore ?? (() => 0);
    this.selNumber = wrap(Math.trunc(options.game ?? 0) || 0, PRINCE_GAME_COUNT);
    this.selSpeed = clamp(options.speed, MINI_SPEED_MAX);
    this.selLevel = clamp(options.level, MINI_LEVEL_MAX);
    this.bot = new PrinceBot(this.baseSeed ^ 0x5bd1e995);
    this.demo = this.create(this.selNumber, 1);
    this.demo.start();
  }

  // ---------------------------------------------------------------- вспомогательное

  private create(number: number, salt: number): BrickGame {
    const { game, mode } = princeEntry(number);
    return PRINCE_GAMES[game]!.def.create({
      seed: (this.baseSeed + Math.imul(salt, 0x9e3779b1)) >>> 0,
      hiScore: this.record(number),
      speed: this.selSpeed + 1,
      level: this.selLevel + 1,
      levelLimit: MINI_LEVEL_LIMIT,
      mode,
    });
  }

  private resetDemo(): void {
    this.demo = this.create(this.selNumber, ++this.played + 100);
    this.demo.start();
    this.clock = 0;
    this.overTicks = 0;
  }

  private chooseGame(game: number): void {
    this.remembered[princeEntry(this.selNumber).game] = princeEntry(this.selNumber).mode;
    const index = wrap(game, PRINCE_GAMES.length);
    this.selNumber = princeNumber(index, this.remembered[index]!);
  }

  /** У тетриса «вверх» — тоже поворот (на корпусе стрелка вверх и ROTATE работают одинаково); у остальных игр «вверх» — движение. */
  private translate(input: BrickInput): BrickInput {
    if (PRINCE_GAMES[princeEntry(this.selNumber).game]!.id !== 'tetris' || !input.held.has('up')) return input;
    return makeBrickInput([...input.pressed, ...(input.pressed.has('up') ? (['rotate'] as const) : [])], [...input.held, 'rotate']);
  }

  // ---------------------------------------------------------------- состояние для экрана и тестов

  /** Номер вариации 0–117 (на экране — номер + 1). */
  override get gameNumber(): number {
    return this.selNumber;
  }

  override get inMenu(): boolean {
    return this.live === null;
  }

  override get screenStage(): MiniStage | 'game' {
    return this.live ? 'game' : this.princeStage;
  }

  override get introDone(): boolean {
    return this.princeStage === 'intro' && this.introTicks >= PRINCE_INTRO_TICKS;
  }

  override get idleDisplay(): { scale: number; lines: boolean } {
    return { scale: 0, lines: Math.floor(this.clock / MINI_IDLE_STEP_TICKS) % 2 === 1 };
  }

  /** Идентификатор игры выбранной вариации: `tetris`, `racing`, `tank`, `frog` или `arkanoid`. */
  override get gameId(): string {
    return PRINCE_GAMES[princeEntry(this.selNumber).game]!.id;
  }

  /** Вариация выбранной игры с нуля. */
  override get mode(): number {
    return princeEntry(this.selNumber).mode;
  }

  override get game(): BrickGame {
    return this.live ?? this.demo;
  }

  override get startSettings(): { speed: number; level: number } {
    return { speed: this.selSpeed, level: this.selLevel };
  }

  override get displaySpeed(): number {
    return this.live ? Math.max(0, this.live.speed - 1) : this.selSpeed;
  }

  override get displayLevel(): number {
    return this.live ? Math.max(0, this.live.level - 1) : this.selLevel;
  }

  // ---------------------------------------------------------------- включение, автоплей и выбор

  override powerOn(): BrickEvent[] {
    this.live = null;
    this.princeStage = 'intro';
    this.introTicks = 0;
    this.clock = 0;
    this.resetDemo();
    return [{ type: 'intro' }];
  }

  /** Такт заставки или автоплея: кнопки выбирают игру, вариацию, уровень и скорость; за ходом партии следит «игрок» демонстрации. */
  override menu(input: BrickInput): BrickEvent[] {
    if (this.live) return [];
    if (this.princeStage === 'intro') {
      this.introTicks++;
      if (input.pressed.size > 0) {
        this.princeStage = 'menu';
        this.resetDemo();
        return [{ type: 'move' }];
      }
      if (this.introTicks >= PRINCE_INTRO_TICKS) {
        this.princeStage = 'menu';
        this.resetDemo();
      }
      return [];
    }
    const before = `${this.selNumber}:${this.selSpeed}:${this.selLevel}`;
    const { game } = princeEntry(this.selNumber);
    if (input.pressed.has('rotate')) this.chooseGame(game + 1);
    else if (input.pressed.has('up')) this.chooseGame(game - 1);
    if (input.pressed.has('down')) this.selNumber = princeNumber(game, princeEntry(this.selNumber).mode + 1);
    if (input.pressed.has('left')) this.selLevel = wrap(this.selLevel + 1, MINI_LEVEL_MAX + 1);
    if (input.pressed.has('right')) this.selSpeed = wrap(this.selSpeed + 1, MINI_SPEED_MAX + 1);
    if (before !== `${this.selNumber}:${this.selSpeed}:${this.selLevel}`) {
      this.resetDemo();
      return [{ type: 'move' }];
    }
    this.clock++;
    if (this.demo.phase === 'over') {
      if (++this.overTicks >= DEMO_OVER_WAIT) this.resetDemo();
    } else {
      this.demo.step(this.bot.input(PRINCE_GAMES[princeEntry(this.selNumber).game]!.id, this.demo, this.clock));
    }
    return [];
  }

  /** Вкладка левой панели (игра) ставит курсор на последнюю вариацию этой игры. */
  override selectGame(id: string): void {
    if (this.live || this.princeStage !== 'menu') return;
    const index = PRINCE_GAMES.findIndex((game) => game.id === id);
    if (index < 0 || index === princeEntry(this.selNumber).game) return;
    this.chooseGame(index);
    this.resetDemo();
  }

  // ---------------------------------------------------------------- BrickGame

  override get phase(): BrickPhase {
    return this.live ? this.live.phase : 'ready';
  }

  override get score(): number {
    return this.live?.score ?? 0;
  }

  override get hiScore(): number {
    return this.live ? this.live.hiScore : this.record(this.selNumber);
  }

  override get speed(): number {
    return this.game.speed;
  }

  override get level(): number {
    return this.game.level;
  }

  override get lives(): number | null {
    return this.live?.lives ?? null;
  }

  override get tick(): number {
    return this.live?.tick ?? this.clock;
  }

  override get overFill(): number {
    return this.live?.overFill ?? 0;
  }

  /** В заставке открывает автоплей; в автоплее начинает партию выбранной вариации; после конца партии — ту же заново. */
  override start(): BrickEvent[] {
    if (this.live) return this.live.start();
    if (this.princeStage === 'intro') {
      this.princeStage = 'menu';
      this.resetDemo();
      return [{ type: 'move' }];
    }
    this.live = this.create(this.selNumber, ++this.played);
    return this.live.start();
  }

  override pause(): BrickEvent[] {
    return this.live?.pause() ?? [];
  }

  override startButton(): BrickEvent[] {
    return this.live?.startButton ? this.live.startButton() : this.pause();
  }

  override resume(): BrickEvent[] {
    return this.live?.resume() ?? [];
  }

  /** RESET: из партии — назад в автоплей (выбор сохраняется). */
  override restart(): BrickEvent[] {
    this.live = null;
    this.princeStage = 'menu';
    this.resetDemo();
    return [];
  }

  override step(input: BrickInput): BrickEvent[] {
    this.clock++;
    return this.live ? this.live.step(this.translate(input)) : [];
  }

  override cells(): Uint8Array {
    if (!this.live && this.princeStage === 'intro') return princeIntroField(this.introTicks);
    return this.game.cells();
  }

  override preview(): Uint8Array | null {
    return this.game.preview();
  }
}
