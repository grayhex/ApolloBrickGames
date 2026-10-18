/**
 * Основа «кирпичной» игры: фазы (ready → playing ⇄ paused → over), счёт и рекорд, скорость и уровень, жизни и добавочные жизни,
 * сценки без ввода (взрыв, потеря жизни, очистка поля), анимация конца игры и очередь событий.
 *
 * Игра наследует `BrickBase`, реализует `reset`, `update`, `draw` (и при желании `drawPreview`, `onStart`) и в конце своего конструктора
 * вызывает `this.init()`. Время — такты (`BRICK_TICK_HZ`), случайность — `this.rng` (seeded). Ничего, кроме этого файла, о фазах знать не нужно.
 */
import { emptyField } from './grid';
import { Rng } from './rng';
import {
  BRICK_COLS,
  BRICK_ROWS,
  BRICK_TICK_HZ,
  CELL_ON,
  DEFAULT_SEED,
  MAX_LEVEL,
  MAX_SCORE,
  MAX_SPEED,
  MIN_LEVEL,
  MIN_SPEED,
  PREVIEW_CELLS,
  PREVIEW_COLS,
  type BrickEvent,
  type BrickGame,
  type BrickGameOptions,
  type BrickInput,
  type BrickPhase,
} from './types';

/** Максимум жизней на индикаторе. */
export const MAX_LIVES = 4;
/**
 * Анимация конца игры: экран заливается снизу вверх по одному ряду за 127 мс, затем пауза. Темп — по трассе ROM двух прошивок HT943 в BrickEmuPy
 * (E‑23 Plus Mark II 96 in 1 и E88 8 in 1 — прошивка референсной модели E‑S88): ряд полностью загорается каждые ≈127 мс, весь экран — за ≈2,5 с
 * (`scripts/research/brickemu_gameover.py`, `tests/fixtures/brickemu/gameover.json`). Число тактов дробное: ряд считается по `floor`.
 * Допущения: после заливки у оригинала идёт такая же поочерёдная очистка сверху вниз и экран счёта; здесь экран остаётся залитым до новой партии.
 */
export const GAME_OVER_ROW_MS = 127;
export const GAME_OVER_TICKS_PER_ROW = (GAME_OVER_ROW_MS * BRICK_TICK_HZ) / 1000;
export const GAME_OVER_HOLD_TICKS = 30;
/** Сколько тактов от `gameOver` до фазы `over`: заливка всех рядов и пауза. */
export const GAME_OVER_TICKS = Math.ceil(BRICK_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS);
/** Очистка поля (вверх и вниз): тактов на потерю жизни и на победу в уровне. */
export const CLEAR_LOSE_TICKS = 72;
export const CLEAR_WIN_TICKS = 314;
/** Волна взрыва держится столько тактов (60 мс донора); волн в проходе семь, проходов четыре. */
export const KABOOM_WAVE_TICKS = 4;

const clampInt = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
};

/** Волны взрыва донора (Game.kaboom): 5 × 5, `#` — горит. */
const KABOOM_WAVES: readonly (readonly string[])[] = [
  ['.....', '.###.', '.#.#.', '.###.', '.....'],
  ['#####', '#...#', '#...#', '#...#', '#####'],
  ['#.#.#', '.....', '#...#', '.....', '#.#.#'],
  ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
  ['.....', '.###.', '.#.#.', '.###.', '.....'],
  ['.....', '.....', '..#..', '.....', '.....'],
  ['.....', '.....', '.....', '.....', '.....'],
];
const KABOOM_PASSES = 4;
const KABOOM_SIZE = 5;

interface Cutscene {
  total: number;
  elapsed: number;
  frame: ((elapsed: number) => void) | null;
  done: () => void;
}

export abstract class BrickBase implements BrickGame {
  abstract readonly id: string;

  phase: BrickPhase = 'ready';
  score = 0;
  hiScore: number;
  speed: number;
  level: number;
  lives: number | null = null;
  tick = 0;
  overFill = 0;

  protected readonly rng: Rng;
  /** Вариант игры, 0-based, уже приведённый к диапазону. */
  protected readonly mode: number;
  protected readonly startSpeed: number;
  protected readonly startLevel: number;
  protected readonly levelLimit: number;
  /** Накладка: пока задана, `cells()` возвращает её вместо `draw()` (очистка поля, взрыв). Создаётся и снимается сценками. */
  protected overlay: Uint8Array | null = null;
  /** Если > 0 — каждый раз, когда счёт переваливает за очередную кратную, у игры с жизнями появляется ещё одна (или бонус к счёту при полных). */
  protected scoresToExtraLife = 0;

  private queue: BrickEvent[] = [];
  private dying = false;
  private overTimer = 0;
  private scene: Cutscene | null = null;
  private extraLives = 0;

  protected constructor(options: BrickGameOptions, modeCount: number) {
    this.rng = new Rng(options.seed ?? DEFAULT_SEED);
    this.startSpeed = clampInt(options.speed ?? MIN_SPEED, MIN_SPEED, MAX_SPEED);
    this.levelLimit = options.levelLimit ?? MAX_LEVEL;
    this.startLevel = clampInt(options.level ?? MIN_LEVEL, MIN_LEVEL, this.levelLimit);
    this.speed = this.startSpeed;
    this.level = this.startLevel;
    this.hiScore = clampInt(options.hiScore ?? 0, 0, MAX_SCORE);
    const count = Math.max(1, modeCount);
    this.mode = (((Math.trunc(options.mode ?? 0) || 0) % count) + count) % count;
  }

  // ---------------------------------------------------------------- что реализует игра

  /** Начать новую партию: поле, объекты, жизни (`this.setLives`), таймеры. Счёт, скорость и уровень уже сброшены. Вызывается из `init()`, `restart()` и при старте после конца игры. */
  protected abstract reset(): void;
  /** Один игровой такт (не вызывается во время сценки и анимации конца игры). События — через `this.emit`. */
  protected abstract update(input: BrickInput): void;
  /** Рисунок матрицы 200 клеток (0 — погашена, 1 — горит, 2 — мигает). Не должен менять состояние игры. */
  protected abstract draw(): Uint8Array;
  /** Рисунок превью 4 × 4 или `null` (по умолчанию — индикатор жизней, если они есть). */
  protected drawPreview(): Uint8Array | null {
    return null;
  }
  /** Вызывается, когда фаза стала `playing` (например, появление первой фигуры). */
  protected onStart(): void {
    // по умолчанию ничего
  }

  /** Вызвать в конце конструктора игры: первая подготовка партии. */
  protected init(): void {
    this.freshGame();
  }

  // ---------------------------------------------------------------- BrickGame

  start(): BrickEvent[] {
    if (this.phase === 'over') this.freshGame();
    else if (this.phase !== 'ready') return [];
    this.phase = 'playing';
    this.emit({ type: 'started' });
    this.onStart();
    return this.flush();
  }

  pause(): BrickEvent[] {
    if (this.phase !== 'playing') return [];
    this.phase = 'paused';
    return [{ type: 'paused' }];
  }

  resume(): BrickEvent[] {
    if (this.phase !== 'paused') return [];
    this.phase = 'playing';
    return [{ type: 'resumed' }];
  }

  restart(): BrickEvent[] {
    this.freshGame();
    this.phase = 'ready';
    return [];
  }

  step(input: BrickInput): BrickEvent[] {
    if (this.phase !== 'playing') return [];
    this.tick++;
    if (this.dying) this.stepDying();
    else if (this.scene) this.stepScene(this.scene);
    else this.update(input);
    return this.flush();
  }

  cells(): Uint8Array {
    return this.overlay ?? this.draw();
  }

  preview(): Uint8Array | null {
    const own = this.drawPreview();
    if (own) return own;
    if (this.lives === null) return null;
    return livesPreview(this.lives);
  }

  // ---------------------------------------------------------------- помощники для игр

  /** Поставить событие в очередь такта. */
  protected emit(event: BrickEvent): void {
    this.queue.push(event);
  }

  protected addScore(points: number): void {
    this.setScore(this.score + points);
  }

  protected setScore(value: number): void {
    this.score = clampInt(value, 0, MAX_SCORE);
    if (this.score > this.hiScore) this.hiScore = this.score;
    if (this.scoresToExtraLife > 0 && this.lives !== null) {
      const earned = Math.floor(this.score / this.scoresToExtraLife);
      while (earned > this.extraLives) {
        this.extraLives++;
        this.emit({ type: 'bonus' });
        if (this.lives < MAX_LIVES) this.lives++;
        else this.score = Math.min(MAX_SCORE, this.score + Math.floor(this.scoresToExtraLife / 10));
      }
      // бонус за полные жизни тоже счёт: рекорд не может быть ниже текущего счёта
      if (this.score > this.hiScore) this.hiScore = this.score;
    }
  }

  /** Скорость 1..10; за пределами — по кругу, как в донорской игрушке. */
  protected setSpeed(value: number): void {
    if (value < MIN_SPEED) this.speed = MAX_SPEED;
    else if (value > MAX_SPEED) this.speed = MIN_SPEED;
    else this.speed = Math.trunc(value);
  }

  /** Уровень 1..10; переполнение возвращает уровень на 1 и повышает скорость (как `GameWithLives.win` донора). */
  protected nextLevel(): void {
    const next = this.level + 1;
    if (next > this.levelLimit) {
      this.level = MIN_LEVEL;
      this.setSpeed(this.speed + 1);
    } else {
      this.level = next;
    }
    this.emit({ type: 'levelUp', speed: this.speed });
  }

  protected setLives(count: number): void {
    this.lives = clampInt(count, 0, MAX_LIVES);
  }

  /** Конец игры: анимация заливки, затем фаза `over`. */
  protected gameOver(): void {
    if (this.dying) return;
    this.scene = null;
    this.overlay = null;
    this.dying = true;
    this.overTimer = 0;
    this.overFill = 0;
    if (this.score > this.hiScore) this.hiScore = this.score;
    this.emit({ type: 'gameOver' });
  }

  /** Сценка без ввода: `total` тактов, `frame(прошло)` вызывается сразу и на каждом следующем такте, в конце (на `total`-м такте) — `done`. Игра в это время не обновляется. */
  protected cutscene(total: number, frame: ((elapsed: number) => void) | null, done: () => void): void {
    this.scene = { total: Math.max(1, Math.trunc(total)), elapsed: 0, frame, done };
    frame?.(0); // первый кадр виден сразу, в том же такте
  }

  protected get busy(): boolean {
    return this.scene !== null || this.dying;
  }

  /** Очистка поля, как у донора: заливка снизу вверх, затем стирание сверху вниз. */
  protected animateClear(totalTicks: number, done: () => void): void {
    const total = Math.max(2, Math.trunc(totalTicks));
    this.cutscene(
      total,
      (elapsed) => {
        const half = total / 2;
        const out = emptyField();
        if (elapsed < half) {
          const rows = Math.min(BRICK_ROWS, Math.ceil(((elapsed + 1) / half) * BRICK_ROWS));
          out.fill(CELL_ON, (BRICK_ROWS - rows) * BRICK_COLS);
        } else {
          const cleared = Math.min(BRICK_ROWS, Math.ceil(((elapsed + 1 - half) / half) * BRICK_ROWS));
          out.fill(CELL_ON, cleared * BRICK_COLS);
        }
        this.overlay = out;
      },
      done,
    );
  }

  /** Взрыв, как у донора: четыре прохода по семи волнам 5 × 5 вокруг (x, y); эпицентр сдвигается, если взрыв вышел бы за поле. */
  protected animateKaboom(x: number, y: number, done: () => void): void {
    const half = (KABOOM_SIZE - 1) / 2;
    const cx = Math.min(BRICK_COLS - 1 - half, Math.max(half, Math.trunc(x)));
    const cy = Math.min(BRICK_ROWS - 1 - half, Math.max(half, Math.trunc(y)));
    const base = this.draw().slice();
    const total = KABOOM_PASSES * KABOOM_WAVES.length * KABOOM_WAVE_TICKS;
    this.cutscene(
      total,
      (elapsed) => {
        const wave = KABOOM_WAVES[Math.floor(elapsed / KABOOM_WAVE_TICKS) % KABOOM_WAVES.length];
        const out = base.slice();
        wave?.forEach((row, dy) => {
          for (let dx = 0; dx < row.length; dx++) {
            out[(cy - half + dy) * BRICK_COLS + (cx - half + dx)] = row[dx] === '#' ? CELL_ON : 0;
          }
        });
        this.overlay = out;
      },
      done,
    );
  }

  // ---------------------------------------------------------------- внутреннее

  private freshGame(): void {
    this.score = 0;
    this.speed = this.startSpeed;
    this.level = this.startLevel;
    this.lives = null;
    this.tick = 0;
    this.overFill = 0;
    this.dying = false;
    this.overTimer = 0;
    this.scene = null;
    this.overlay = null;
    this.extraLives = 0;
    this.queue = [];
    this.reset();
  }

  private flush(): BrickEvent[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  private stepScene(scene: Cutscene): void {
    scene.elapsed++;
    if (scene.elapsed < scene.total) {
      scene.frame?.(scene.elapsed);
      return;
    }
    this.scene = null;
    this.overlay = null;
    scene.done();
  }

  private stepDying(): void {
    this.overTimer++;
    this.overFill = Math.min(BRICK_ROWS, Math.floor(this.overTimer / GAME_OVER_TICKS_PER_ROW));
    if (this.overTimer >= BRICK_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS) {
      this.dying = false;
      this.phase = 'over';
    }
  }
}

/** Жизни в превью, как у донора: каждая — пара клеток в колонках 1 и 2 сверху вниз. */
export function livesPreview(lives: number): Uint8Array {
  const out = new Uint8Array(PREVIEW_CELLS);
  for (let i = 0; i < Math.min(lives, MAX_LIVES); i++) {
    out[i * PREVIEW_COLS + 1] = CELL_ON;
    out[i * PREVIEW_COLS + 2] = CELL_ON;
  }
  return out;
}
