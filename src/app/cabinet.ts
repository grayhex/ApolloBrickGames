import { actionBit, maskOf, type InputFrame } from '../core';
import type { AudioCue } from '../audio/audio';
import {
  BrickConsole,
  makeBrickInput,
  type BrickAction,
  type BrickConsoleEntry,
  type BrickEvent,
  type BrickGameDef,
  type BrickPhase,
} from '../brick';
import { GAMES, type GameId } from '../games/catalog';
import { makeTetrisInput, TetrisGame, type TetrisAction, type TetrisEvent } from '../tetris';
import { MAX_SCORE } from '../brick/types';
import type { TetrisScene } from '../render/tetrisScreen';
import { gameKey, type ToyModel } from './toys';
import { bodyActions } from './bodyButtons';

/**
 * «Кабинет» игрушки с тетрисным экраном: что оболочка (`tetrisApp.ts`) знает об игре. Три матричные Apollo используют консоль с меню игр;
 * прежний одиночный тетрис сохранён для совместимости модели без меню. Оболочка работает только с этим интерфейсом: фаза, счёт, ввод такта, рисунок для экрана, звук и ключ рекорда.
 */
export type CabinetEvent = BrickEvent | TetrisEvent;

export interface Cabinet {
  readonly phase: BrickPhase;
  readonly score: number;
  readonly hiScore: number;
  readonly lines: number;
  /** Скорость и уровень так, как они стоят на экране (у консоли с меню 0..9, у одиночного тетриса 1..10). */
  readonly speed: number;
  readonly level: number;
  readonly tick: number;
  /** В игре сейчас меню (консоль ещё не запустила игру): ввод идёт в `menu`. */
  readonly inMenu: boolean;
  /** Идентификатор игры каталога, выбранной в меню или играющей сейчас (у одиночного тетриса — тетрис). */
  readonly activeGame: GameId;
  /** Состояние для отладки и проверок: `data-*` игровой области. */
  readonly info: Readonly<Record<string, string | number>>;
  /** Ключ хранилища рекорда текущей игры (у консоли — игры и варианта); `null`, пока игра не выбрана. */
  hiKey(): string;
  start(): CabinetEvent[];
  pause(): CabinetEvent[];
  resume(): CabinetEvent[];
  /** Заново: у одиночного тетриса — новая партия, у консоли — возврат в меню. */
  restart(): CabinetEvent[];
  /** Один игровой такт. */
  step(frame: InputFrame): CabinetEvent[];
  /** Один такт в меню (кнопки выбора). */
  menu(frame: InputFrame): CabinetEvent[];
  scene(extra: { sound: boolean; allOn: boolean }): TetrisScene;
  /** Объект для `window.__tetris` / `window.__brick` при `?debug`. */
  debugTarget(): object;
}

// ── Звук: короткие сигналы пищалки, те же, что у Crocodile Mario (отдельных записей у этих игрушек нет) ─────────────────────────────

const BRICK_CUES: Partial<Record<BrickEvent['type'], AudioCue>> = {
  started: 'confirm',
  rotate: 'bump',
  lock: 'land',
  drop: 'land',
  shot: 'shot',
  hit: 'hit',
  explode: 'crumble',
  crash: 'death',
  lifeLost: 'death',
  bonus: 'confirm',
  win: 'levelCompleted',
  blocked: 'blocked',
  levelUp: 'confirm',
  gameOver: 'gameOver',
};

/** Тон площадки по её номеру: вверх, вправо, вниз, влево. */
const PAD_CUES: readonly AudioCue[] = ['pad0', 'pad1', 'pad2', 'pad3'];

const TETRIS_CUES: Partial<Record<TetrisEvent['type'], AudioCue>> = {
  started: 'confirm',
  move: 'introStep',
  rotate: 'bump',
  lock: 'land',
  drop: 'land',
  levelUp: 'confirm',
  gameOver: 'gameOver',
};

/** Сигнал для события; `moveSound` — звучит ли движение (в меню и в тетрисе да, в остальных играх оно сыпалось бы каждый шаг). */
export function cueFor(event: CabinetEvent, moveSound: boolean): AudioCue | null {
  if (event.type === 'tone') return PAD_CUES[event.pad] ?? null;
  if (event.type === 'lines') return event.count >= 4 ? 'secret' : 'levelCompleted';
  if (event.type === 'move') return moveSound ? 'introStep' : null;
  return (BRICK_CUES[event.type as BrickEvent['type']] ?? TETRIS_CUES[event.type as TetrisEvent['type']]) ?? null;
}

// ── Ввод ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const LEFT = actionBit('left');
const RIGHT = actionBit('right');
const UP = actionBit('up');
const DOWN = actionBit('down');
const FIRE = actionBit('fire');
const JUMP = actionBit('jump');
const ROTATE_MASK = maskOf('up', 'jump');

function brickActions(mask: number, allowed: ReadonlySet<BrickAction>): BrickAction[] {
  const actions: BrickAction[] = [];
  if ((mask & LEFT) && allowed.has('left')) actions.push('left');
  if ((mask & RIGHT) && allowed.has('right')) actions.push('right');
  if ((mask & UP) && allowed.has('up')) actions.push('up');
  if ((mask & DOWN) && allowed.has('down')) actions.push('down');
  if ((mask & JUMP) && allowed.has('rotate')) actions.push('rotate'); // большая кнопка ROTATE: в меню — выбор игры, в игре — поворот или огонь
  if ((mask & FIRE) && allowed.has('fire')) actions.push('fire'); // действие движка; корпус без FIRE отфильтрует его до передачи игре
  return actions;
}

// ── Одиночный тетрис (совместимость моделей без меню) ───────────────────────────────────────────────────────────────────────────────────────────────────

class TetrisCabinet implements Cabinet {
  private readonly game: TetrisGame;
  private readonly toy: string;

  constructor(toy: string, seed: number, hiScore: number) {
    this.toy = toy;
    this.game = new TetrisGame({ seed, hiScore });
  }

  get phase(): BrickPhase {
    return this.game.phase;
  }
  get score(): number {
    return this.game.score;
  }
  get hiScore(): number {
    return this.game.hiScore;
  }
  get lines(): number {
    return this.game.lines;
  }
  get speed(): number {
    return this.game.speed;
  }
  get level(): number {
    return this.game.level;
  }
  get tick(): number {
    return this.game.tick;
  }
  readonly inMenu = false;
  readonly activeGame: GameId = 'tetris';
  get info(): Readonly<Record<string, string | number>> {
    return {};
  }
  hiKey(): string {
    return `crocodile-mario:tetris:${this.toy}:hi`;
  }
  start(): CabinetEvent[] {
    return this.game.start();
  }
  pause(): CabinetEvent[] {
    return this.game.pause();
  }
  resume(): CabinetEvent[] {
    return this.game.resume();
  }
  restart(): CabinetEvent[] {
    return this.game.restart();
  }
  step(frame: InputFrame): CabinetEvent[] {
    const pick = (mask: number): TetrisAction[] => {
      const actions: TetrisAction[] = [];
      if (mask & LEFT) actions.push('left');
      if (mask & RIGHT) actions.push('right');
      if (mask & DOWN) actions.push('down');
      if (mask & ROTATE_MASK) actions.push('rotate');
      return actions;
    };
    return this.game.step(makeTetrisInput(pick(frame.pressed), pick(frame.held)));
  }
  menu(): CabinetEvent[] {
    return [];
  }
  scene(extra: { sound: boolean; allOn: boolean }): TetrisScene {
    const game = this.game;
    return {
      cells: game.snapshot(),
      clearRows: game.clearRows,
      clearTimer: game.clearTimer,
      overFill: game.overFill,
      next: game.phase === 'ready' ? null : game.next,
      score: game.score,
      hiScore: game.hiScore,
      speed: game.speed,
      level: game.level,
      sound: extra.sound,
      phase: game.phase,
      tick: game.tick,
      allOn: extra.allOn,
    };
  }
  debugTarget(): object {
    return this.game;
  }
}

// ── Консоль с меню игр («Часы+99», «168 в 1 танк», «Морской бой») ────────────────────────────────────────────────────────────────────────────

/** Пункты меню консоли: игры игрушки по порядку (`ToyModel.games`) с восстановленными играми из `defs`. */
export function consoleEntries(model: ToyModel, defs: Readonly<Record<string, BrickGameDef>>): BrickConsoleEntry[] {
  return model.games.map((game, index) => ({
    symbol: gameKey(model, index),
    id: game.id,
    def: game.status === 'planned' ? null : (defs[game.id] ?? null),
    ...(game.modes ? { modes: game.modes } : {}),
    declaredModes: game.variants ?? null,
  }));
}

/** Игры с движением по клеткам, где звук каждого шага уместен (тетрис). */
const STEP_SOUND_GAMES: ReadonlySet<string> = new Set([GAMES.tetris.id, GAMES['tetris-big'].id, GAMES['tetris-pentix'].id]);

class ConsoleCabinet implements Cabinet {
  private readonly console_: BrickConsole;
  private readonly toy: string;
  private readonly allowed: ReadonlySet<BrickAction>;

  constructor(model: ToyModel, entries: readonly BrickConsoleEntry[], seed: number, hiScore: (gameId: string, mode: number) => number, game = 0) {
    this.toy = model.id;
    this.allowed = bodyActions(model);
    this.console_ = new BrickConsole({ catalog: entries, seed, hiScore, game });
  }

  get phase(): BrickPhase {
    return this.console_.phase;
  }
  get score(): number {
    return this.console_.score;
  }
  get hiScore(): number {
    return this.console_.hiScore;
  }
  readonly lines = 0;
  get speed(): number {
    return this.console_.displaySpeed;
  }
  get level(): number {
    return this.console_.displayLevel;
  }
  get tick(): number {
    return this.console_.tick;
  }
  get inMenu(): boolean {
    return this.console_.inMenu;
  }
  get activeGame(): GameId {
    return this.console_.gameId as GameId;
  }
  get info(): Readonly<Record<string, string | number>> {
    const c = this.console_;
    return {
      menu: c.inMenu ? 'menu' : 'game',
      game: c.gameId,
      symbol: c.symbol,
      mode: c.modeNumber,
      playable: c.playable ? 'yes' : 'no',
      lives: c.lives ?? '',
    };
  }
  hiKey(): string {
    return `crocodile-mario:brick:${this.toy}:${this.console_.gameId}:${this.console_.mode}:hi`;
  }
  /** Звук движения: в меню и в тетрисах — да; в остальных играх шаг каждый такт слушался бы как трещотка. */
  get moveSound(): boolean {
    return this.console_.inMenu || STEP_SOUND_GAMES.has(this.console_.gameId);
  }
  start(): CabinetEvent[] {
    return this.console_.start();
  }
  pause(): CabinetEvent[] {
    return this.console_.pause();
  }
  resume(): CabinetEvent[] {
    return this.console_.resume();
  }
  restart(): CabinetEvent[] {
    return this.console_.restart();
  }
  step(frame: InputFrame): CabinetEvent[] {
    return this.console_.step(makeBrickInput(brickActions(frame.pressed, this.allowed), brickActions(frame.held, this.allowed)));
  }
  menu(frame: InputFrame): CabinetEvent[] {
    return this.console_.menu(makeBrickInput(brickActions(frame.pressed, this.allowed), brickActions(frame.held, this.allowed)));
  }
  scene(extra: { sound: boolean; allOn: boolean }): TetrisScene {
    const c = this.console_;
    return {
      cells: c.cells(),
      clearRows: [],
      clearTimer: 0,
      overFill: c.overFill,
      next: null,
      preview: c.preview(),
      blinkValue: 2,
      score: Math.min(c.score, MAX_SCORE),
      hiScore: c.hiScore,
      speed: c.displaySpeed,
      level: c.displayLevel,
      sound: extra.sound,
      phase: c.phase,
      tick: c.tick,
      allOn: extra.allOn,
    };
  }
  debugTarget(): object {
    return this.console_;
  }
}

export interface CabinetOptions {
  seed: number;
  /** Рекорд по ключу хранилища оболочки. */
  loadHi(key: string): number;
  /** Восстановленные «кирпичные» игры по идентификатору (см. `brick/games`). */
  defs: Readonly<Record<string, BrickGameDef>>;
}

export function createCabinet(model: ToyModel, options: CabinetOptions): Cabinet {
  if (model.defaultGame === null) throw new Error('This console has no game engine yet.');
  if (!model.menu) return new TetrisCabinet(model.id, options.seed, options.loadHi(`crocodile-mario:tetris:${model.id}:hi`));
  const hiKey = (gameId: string, mode: number): string => `crocodile-mario:brick:${model.id}:${gameId}:${mode}:hi`;
  return new ConsoleCabinet(model, consoleEntries(model, options.defs), options.seed, (gameId, mode) => options.loadHi(hiKey(gameId, mode)), Math.max(0, model.games.findIndex((g) => g.id === model.defaultGame)));
}

/** Звук события для кабинета: в консоли движение звучит только там, где оно уместно. */
export function cabinetCue(cabinet: Cabinet, event: CabinetEvent): AudioCue | null {
  const moveSound = cabinet instanceof ConsoleCabinet ? cabinet.moveSound : true;
  return cueFor(event, moveSound);
}
