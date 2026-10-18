import { MazeGame } from '../brick/games/library/puzzles';
import { BRICK_GAMES } from '../brick/games';
import { BRICK_COLS, BRICK_ROWS, makeBrickInput, type BrickAction } from '../brick';

/**
 * «Геймплей» в левой справке: несколько секунд настоящей игры (тот же движок, что на экране консоли), записанные по простому сценарию ввода и
 * проигрываемые по кругу. Запись детерминирована (зерно и сценарий постоянны), делается один раз для игры по первому показу и хранится в памяти.
 * Сценарий — не игра на результат, а демонстрация движения: стрельба с качанием, смена полос, повороты фигур. Что происходит на экране, определяет движок.
 */
export interface Clip {
  /** Кадры матрицы 10 × 20 (0 — пусто, 1 — горит, 2 — мигает), по одному на 1/`CLIP_FPS` секунды. */
  readonly frames: readonly Uint8Array[];
}

export const CLIP_FPS = 10;
const CLIP_SEED = 20261017;
/** Такты вступления (джингл, выезд поля) пропускаются: показываем игру, а не заставку. */
const SKIP_TICKS = 150;
const CAPTURE_TICKS = 240;
const TICKS_PER_FRAME = 6;

type Frame = { pressed: BrickAction[]; held: BrickAction[] };
type Script = (tick: number) => Frame;

const every = (tick: number, period: number): boolean => tick % period === 0;
const cycle = (actions: readonly BrickAction[], period: number): Script => (tick) => {
  const action = actions[Math.floor(tick / period) % actions.length]!;
  return { pressed: every(tick, period) ? [action] : [], held: [] };
};
/** Автоогонь с качанием пушки влево и вправо. */
const shooter: Script = (tick) => ({ pressed: [], held: ['rotate', Math.floor(tick / 20) % 2 === 0 ? 'left' : 'right'] });
/** Смена полос или шагов в стороны, время от времени вперёд. */
const road: Script = (tick) => ({ pressed: every(tick, 36) ? [Math.floor(tick / 36) % 3 === 2 ? 'up' : Math.floor(tick / 36) % 2 === 0 ? 'left' : 'right'] : [], held: [] });
/** Платформа качается из стороны в сторону, мяч подбивается. */
const paddle: Script = (tick) => ({ pressed: every(tick, 45) ? ['rotate'] : [], held: [Math.floor(tick / 30) % 2 === 0 ? 'left' : 'right'] });
/** Падающие фигуры: сдвиги, повороты и ускорение. */
const falling: Script = (tick) => {
  const step = Math.floor(tick / 18) % 6;
  const action = (['left', 'rotate', 'right', 'right', 'rotate', 'left'] as const)[step]!;
  return { pressed: every(tick, 18) ? [action] : [], held: step >= 3 ? ['down'] : [] };
};
const snake: Script = cycle(['up', 'right', 'down', 'left'], 28);
const ordinary: Script = cycle(['left', 'rotate', 'right', 'up', 'rotate', 'down'], 16);

const SCRIPTS: Record<string, Script> = {};
for (const id of ['shooting', 'shooting-array', 'shooting-figures', 'construction', 'space-invaders', 'ufo-raiders', 'honeybee', 'meteor-fighter', 'dual-shooting', 'talking-shooting', 'tetris-shooting', 'racing-shooting', 'tank', 'super-tank'])
  SCRIPTS[id] = shooter;
for (const id of ['racing', 'racing-four', 'boat-racing', 'obstacle-race', 'racing-pickup', 'punch-racing', 'frog', 'flappy-bird']) SCRIPTS[id] = road;
for (const id of ['pong', 'pong-double', 'pneumatic-ball', 'arkanoid-dots', 'arkanoid', 'basket']) SCRIPTS[id] = paddle;
for (const id of ['tetris', 'tetris-big', 'tetris-pentix', 'tetris-flicker', 'quarth', 'columns', 'columns-flicker', 'dr-mario', 'romeo-juliet']) SCRIPTS[id] = falling;
SCRIPTS['snake'] = snake;

/** A real route demonstrates maze movement and its clock, instead of walking into a wall. */
function mazeDemo(game: MazeGame,tick:number): Frame {
  if(tick%12!==0)return {pressed:[],held:[]};
  const queue=[game.goal],distance=new Map([[game.goal,0]]);
  for(const p of queue)for(const delta of [-10,1,10,-1])if(game.walls[p+delta]===0&&!distance.has(p+delta)){distance.set(p+delta,distance.get(p)!+1);queue.push(p+delta);}
  const directions=['up','right','down','left'] as const;
  const index=[-10,1,10,-1].findIndex(delta=>distance.get(game.player+delta)===(distance.get(game.player)??0)-1);
  return {pressed:index<0?[]:[directions[index]!],held:[]};
}

const cache = new Map<string, Clip | null>();

/** Запись игры; `null`, если у игры нет реализации. Кадры считаются на месте: тысяча тактов чистой симуляции занимает миллисекунды. */
export function clipFor(id: string): Clip | null {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const def = BRICK_GAMES[id];
  let clip: Clip | null = null;
  if (def) {
    const game = def.create({ seed: CLIP_SEED, speed: id==='maze'?1:6, level: 1 });
    const script = SCRIPTS[id] ?? ordinary;
    game.start();
    const frames: Uint8Array[] = [];
    for (let tick = 0; tick < SKIP_TICKS + CAPTURE_TICKS; tick++) {
      const { pressed, held } = game instanceof MazeGame ? mazeDemo(game,tick) : script(tick);
      game.step(makeBrickInput(pressed, [...held, ...pressed]));
      if (tick >= SKIP_TICKS && (tick - SKIP_TICKS) % TICKS_PER_FRAME === 0) frames.push(game.cells().slice());
      if (game.phase === 'over' && frames.length > 0) break;
    }
    clip = frames.length > 0 ? { frames } : null;
  }
  cache.set(id, clip);
  return clip;
}

/** Размер клетки и промежуток на холсте, пикселей CSS. */
const CELL = 4;
const GAP = 1;

/**
 * Холст с зацикленной записью. Цвет — текущий цвет текста панели (холст прозрачный), поэтому подходит и тёмной, и светлой теме.
 * При «уменьшении движения» показывается один кадр. Таймер сам останавливается, когда холст убран из страницы (панель перерисована).
 */
export function clipCanvas(clip: Clip, label: string, options: { scale?: number; signal?: AbortSignal; playing?: () => boolean } = {}): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const scale = options.scale ?? 1;
  const pitch = (CELL + GAP) * scale;
  const width = BRICK_COLS * pitch - GAP * scale;
  const height = BRICK_ROWS * pitch - GAP * scale;
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.className = 'gclip__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  const draw = (index: number): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ink = getComputedStyle(canvas).color || '#000';
    const frame = clip.frames[index % clip.frames.length]!;
    const blinkOn = Math.floor(index / 3) % 2 === 0;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (let y = 0; y < BRICK_ROWS; y++)
      for (let x = 0; x < BRICK_COLS; x++) {
        const value = frame[y * BRICK_COLS + x] ?? 0;
        ctx.globalAlpha = value === 1 || (value === 2 && blinkOn) ? 1 : 0.09;
        ctx.fillStyle = ink;
        ctx.fillRect(x * pitch, y * pitch, CELL * scale, CELL * scale);
      }
    ctx.globalAlpha = 1;
  };
  if (!options.playing && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    queueMicrotask(() => draw(Math.floor(clip.frames.length / 2)));
    return canvas;
  }
  let index = 0;
  let seen = false;
  let waited = 0;
  let visible = true;
  const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; });
  observer.observe(canvas);
  const stop = (): void => { window.clearInterval(timer); observer.disconnect(); };
  const timer = window.setInterval(() => {
    if (canvas.isConnected) {
      seen = true;
      if (document.hidden || !visible) return;
      if (options.playing?.() === false) return;
      draw(index++);
      canvas.dataset['frame'] = String(index % clip.frames.length);
    } else if (seen || ++waited > 30) stop();
  }, 1000 / CLIP_FPS);
  options.signal?.addEventListener('abort', stop, { once: true });
  queueMicrotask(() => draw(0));
  return canvas;
}
