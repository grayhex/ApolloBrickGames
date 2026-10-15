import { describe, expect, it } from 'vitest';
import { nextInt } from '../../src/core/rng';
import {
  CLEAR_TICKS,
  FIELD_COLUMNS,
  FIELD_ROWS,
  GAME_OVER_HOLD_TICKS,
  GAME_OVER_TICKS_PER_ROW,
  MAX_SCORE,
  NEUTRAL_TETRIS_INPUT,
  PIECE_KINDS,
  TetrisGame,
  makeTetrisInput,
  type TetrisAction,
  type TetrisEvent,
  type TetrisInput,
  type TetrisOptions,
} from '../../src/tetris';
import { filledCount, hardDrop, hold, paint, place, press, rowsOf, run, startedGame, typesOf } from './helpers';

/** Забить «вход» сверху: ни одна фигура не сможет появиться. */
function blockTop(game: TetrisGame): void {
  for (let y = 0; y < 4; y++) for (let x = 3; x <= 6; x++) game.field[y * FIELD_COLUMNS + x] = 3;
}

/** Партия, которая закончится на ближайшем сбросе: вход забит, O висит в стороне (на сбросе +16 очков). */
function doomedGame(options: TetrisOptions = {}): TetrisGame {
  const game = startedGame(options);
  blockTop(game);
  place(game, 'O', 0, 0, 10);
  return game;
}

const OVER_TICKS = FIELD_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS;

describe('конец игры', () => {
  it('фигура не помещается при появлении: событие gameOver, фигуры нет, анимация только началась', () => {
    const game = doomedGame();
    expect(typesOf(hardDrop(game))).toEqual(['drop', 'lock', 'gameOver']);
    expect(game.phase).toBe('playing');
    expect(game.piece).toBeNull();
    expect(game.overFill).toBe(0);
  });

  it('анимация: две тактовые на строку снизу, фаза over после полного заполнения и короткой паузы', () => {
    const game = doomedGame();
    hardDrop(game);
    for (let n = 1; n <= OVER_TICKS - 1; n++) {
      expect(game.step(NEUTRAL_TETRIS_INPUT)).toEqual([]);
      expect(game.overFill, `такт ${n}`).toBe(Math.min(FIELD_ROWS, Math.floor(n / GAME_OVER_TICKS_PER_ROW)));
      expect(game.phase, `такт ${n}`).toBe('playing');
    }
    expect(game.overFill).toBe(FIELD_ROWS);
    game.step(NEUTRAL_TETRIS_INPUT);
    expect(game.phase).toBe('over');
    expect(game.overFill).toBe(FIELD_ROWS);
  });

  it('пауза после заполнения экрана есть: строка 20 закрашена, а фаза всё ещё playing', () => {
    const game = doomedGame();
    hardDrop(game);
    run(game, FIELD_ROWS * GAME_OVER_TICKS_PER_ROW);
    expect(game.overFill).toBe(FIELD_ROWS);
    expect(game.phase).toBe('playing');
    run(game, GAME_OVER_HOLD_TICKS - 1);
    expect(game.phase).toBe('playing');
    run(game, 1);
    expect(game.phase).toBe('over');
  });

  it('во время анимации и после неё ввод игнорируется, поле и счёт не меняются', () => {
    const game = doomedGame();
    hardDrop(game);
    const field = rowsOf(game.field);
    const score = game.score;
    for (let i = 0; i < OVER_TICKS + 20; i++) {
      expect(game.step(press('left', 'rotate', 'drop'))).toEqual([]);
    }
    expect(game.phase).toBe('over');
    expect(rowsOf(game.field)).toEqual(field);
    expect(game.score).toBe(score);
    expect(game.piece).toBeNull();
  });

  it('в фазе over такты не считаются', () => {
    const game = doomedGame();
    hardDrop(game);
    run(game, OVER_TICKS);
    const tick = game.tick;
    run(game, 50);
    expect(game.tick).toBe(tick);
  });

  it('gameOver приходит ровно один раз за партию', () => {
    const game = doomedGame();
    const events = [...hardDrop(game), ...run(game, OVER_TICKS + 30)];
    expect(events.filter((event) => event.type === 'gameOver')).toHaveLength(1);
  });

  it('хай-скор подтягивается до счёта партии', () => {
    const game = doomedGame();
    hardDrop(game);
    expect(game.score).toBe(16);
    expect(game.hiScore).toBe(16);
  });

  it('хай-скор выше счёта остаётся прежним', () => {
    const game = doomedGame({ hiScore: 500 });
    hardDrop(game);
    run(game, OVER_TICKS);
    expect(game.phase).toBe('over');
    expect(game.hiScore).toBe(500);
  });

  it('конец игры может наступить и при появлении фигуры после очистки линий', () => {
    const game = startedGame();
    blockTop(game);
    paint(game, ['#########.']);
    place(game, 'I', 1, 7, 0);
    game.next = 'O'; // O займёт строки 0 и 1 — на строке 1 уже стоят блоки
    expect(typesOf(hardDrop(game))).toEqual(['drop', 'lock', 'lines']);
    run(game, CLEAR_TICKS - 1);
    expect(game.phase).toBe('playing');
    expect(game.step(NEUTRAL_TETRIS_INPUT)).toEqual([{ type: 'gameOver' }]);
    expect(game.piece).toBeNull();
    expect(game.clearRows).toEqual([]);
    run(game, OVER_TICKS);
    expect(game.phase).toBe('over');
  });

  it('обычная партия без управления кончается сама: стопка упирается в потолок', () => {
    const game = startedGame({ seed: 77 });
    const events: TetrisEvent[] = [];
    for (let i = 0; i < 200 && game.phase !== 'over'; i++) events.push(...game.step(press('drop')));
    for (let i = 0; i < OVER_TICKS && game.phase !== 'over'; i++) events.push(...game.step(NEUTRAL_TETRIS_INPUT));
    expect(game.phase).toBe('over');
    expect(events.filter((event) => event.type === 'gameOver')).toHaveLength(1);
    expect(game.hiScore).toBe(game.score);
    expect(game.score).toBeGreaterThan(0);
  });
});

describe('новая партия после конца игры', () => {
  function overGame(options: TetrisOptions = {}): TetrisGame {
    const game = doomedGame(options);
    hardDrop(game);
    run(game, OVER_TICKS);
    return game;
  }

  it('start из over: чистая партия, счёт 0, линии 0, скорость стартовая, хай-скор сохранён', () => {
    const game = overGame({ startSpeed: 3 });
    game.lines = 25;
    game.speed = 5;
    const hi = game.hiScore;
    expect(hi).toBe(16);
    expect(game.start()).toEqual([{ type: 'started' }]);
    expect(game.phase).toBe('playing');
    expect(filledCount(game.field)).toBe(0);
    expect(game.score).toBe(0);
    expect(game.lines).toBe(0);
    expect(game.speed).toBe(3);
    expect(game.hiScore).toBe(hi);
    expect(game.overFill).toBe(0);
    expect(game.clearRows).toEqual([]);
    expect(game.clearTimer).toBe(0);
    expect(game.tick).toBe(0);
    expect(game.piece).not.toBeNull();
    expect(PIECE_KINDS).toContain(game.next);
  });

  it('новая партия играется как обычная, а мешок снова собирается по семь', () => {
    const game = overGame();
    game.start();
    const kinds: string[] = [];
    for (let i = 0; i < 14; i++) {
      kinds.push(game.piece?.kind ?? '?');
      game.field.fill(0);
      hardDrop(game);
    }
    expect(new Set(kinds.slice(0, 7)).size).toBe(7);
    expect(new Set(kinds.slice(7, 14)).size).toBe(7);
  });

  it('restart: готовность без старта, всё чисто, хай-скор остаётся', () => {
    const game = overGame();
    expect(game.restart()).toEqual([]);
    expect(game.phase).toBe('ready');
    expect(game.piece).toBeNull();
    expect(filledCount(game.field)).toBe(0);
    expect(game.score).toBe(0);
    expect(game.hiScore).toBe(16);
    expect(game.overFill).toBe(0);
    expect(PIECE_KINDS).toContain(game.next);
    expect(game.step(press('left'))).toEqual([]);
    expect(game.start()).toEqual([{ type: 'started' }]);
  });

  it('restart посреди партии: сбрасывает поле, счёт, линии, скорость, анимации', () => {
    const game = startedGame({ startSpeed: 2 });
    paint(game, ['#########.']);
    place(game, 'I', 1, 7, 0);
    game.lines = 14;
    hardDrop(game);
    expect(game.clearTimer).toBeGreaterThan(0);
    const hi = game.hiScore;
    game.restart();
    expect(game.phase).toBe('ready');
    expect(game.clearRows).toEqual([]);
    expect(game.clearTimer).toBe(0);
    expect(game.lines).toBe(0);
    expect(game.speed).toBe(2);
    expect(game.score).toBe(0);
    expect(game.hiScore).toBe(hi);
    expect(filledCount(game.field)).toBe(0);
  });

  it('restart во время анимации конца игры тоже возвращает чистую готовность', () => {
    const game = doomedGame();
    hardDrop(game);
    run(game, 10);
    game.restart();
    expect(game.phase).toBe('ready');
    expect(game.overFill).toBe(0);
    game.start();
    expect(run(game, 200)).toEqual([]);
    expect(game.phase).toBe('playing');
  });

  it('хай-скор переживает несколько партий и растёт только вверх', () => {
    const game = startedGame();
    place(game, 'O', 0, 3, 0);
    hardDrop(game); // 36
    expect(game.hiScore).toBe(36);
    game.restart();
    game.start();
    expect(game.score).toBe(0);
    expect(game.hiScore).toBe(36);
    place(game, 'O', 0, 3, 14);
    hardDrop(game); // 8
    expect(game.score).toBe(8);
    expect(game.hiScore).toBe(36);
  });
});

describe('пауза', () => {
  it('pause/resume переключают playing и paused и возвращают события', () => {
    const game = startedGame();
    expect(game.pause()).toEqual([{ type: 'paused' }]);
    expect(game.phase).toBe('paused');
    expect(game.resume()).toEqual([{ type: 'resumed' }]);
    expect(game.phase).toBe('playing');
  });

  it('pause вне игры и resume не с паузы ничего не делают', () => {
    const game = new TetrisGame();
    expect(game.pause()).toEqual([]);
    expect(game.phase).toBe('ready');
    game.start();
    expect(game.resume()).toEqual([]);
    game.pause();
    expect(game.pause()).toEqual([]);
    expect(game.phase).toBe('paused');
    const over = doomedGame();
    hardDrop(over);
    run(over, OVER_TICKS);
    expect(over.pause()).toEqual([]);
    expect(over.resume()).toEqual([]);
    expect(over.phase).toBe('over');
  });

  it('на паузе ввод игнорируется, такты не идут, фигура и счёт стоят', () => {
    const game = startedGame();
    place(game, 'T', 0, 4, 3);
    game.pause();
    const tick = game.tick;
    for (let i = 0; i < 200; i++) {
      expect(game.step(press('left', 'rotate', 'drop'))).toEqual([]);
      game.step(hold('down'));
    }
    expect(game.tick).toBe(tick);
    expect(game.piece).toEqual({ kind: 'T', rotation: 0, x: 4, y: 3 });
    expect(game.score).toBe(0);
  });

  it('нажатия на паузе не копятся: после продолжения фигура не двигается сама', () => {
    const game = startedGame();
    place(game, 'T', 0, 4, 3);
    game.pause();
    run(game, 10, press('left'));
    game.resume();
    expect(game.step(NEUTRAL_TETRIS_INPUT)).toEqual([]);
    expect(game.piece?.x).toBe(4);
    expect(typesOf(game.step(press('left')))).toEqual(['move']);
  });

  it('падение продолжается с того места, где остановилось: счётчик на паузе не идёт', () => {
    const game = startedGame();
    const y0 = game.piece?.y ?? NaN;
    run(game, 40);
    game.pause();
    run(game, 500);
    game.resume();
    run(game, 7);
    expect(game.piece?.y).toBe(y0);
    run(game, 1);
    expect(game.piece?.y).toBe(y0 + 1);
  });

  it('пауза замораживает вспышку очистки и анимацию конца игры', () => {
    const game = startedGame();
    paint(game, ['#########.']);
    place(game, 'I', 1, 7, 0);
    hardDrop(game);
    run(game, 5);
    expect(game.clearTimer).toBe(CLEAR_TICKS - 5);
    game.pause();
    run(game, 100);
    expect(game.clearTimer).toBe(CLEAR_TICKS - 5);
    game.resume();
    run(game, 1);
    expect(game.clearTimer).toBe(CLEAR_TICKS - 6);

    const over = doomedGame();
    hardDrop(over);
    run(over, 10);
    expect(over.overFill).toBe(5);
    over.pause();
    run(over, 100);
    expect(over.overFill).toBe(5);
    expect(over.phase).toBe('paused');
    over.resume();
    run(over, OVER_TICKS);
    expect(over.phase).toBe('over');
  });
});

// ---------------------------------------------------------------- детерминизм

const ACTIONS: readonly TetrisAction[] = ['left', 'right', 'down', 'rotate', 'drop'];

/** Сценарий ввода из seeded ГСЧ: то и дело меняется набор зажатых кнопок, «drop» — только импульс. */
function scriptedInputs(seed: number, count: number): TetrisInput[] {
  let state = seed;
  const draw = (max: number): number => {
    const roll = nextInt(state, max);
    state = roll.state;
    return roll.value;
  };
  const held = new Set<TetrisAction>();
  const inputs: TetrisInput[] = [];
  for (let i = 0; i < count; i++) {
    const pressed: TetrisAction[] = [];
    if (draw(10) < 3) {
      const pick = draw(ACTIONS.length + 1);
      const action = ACTIONS[pick];
      if (!action) held.clear();
      else if (action === 'drop') pressed.push('drop');
      else if (held.has(action)) held.delete(action);
      else {
        held.add(action);
        pressed.push(action);
      }
    }
    inputs.push(makeTetrisInput(pressed, held));
  }
  return inputs;
}

/** Мусор на дне при каждом старте — чтобы случайная игра вообще собирала линии. */
function addGarbage(game: TetrisGame, seed: number): void {
  let state = seed;
  for (let row = FIELD_ROWS - 4; row < FIELD_ROWS; row++) {
    let filled = 0;
    for (let x = 0; x < FIELD_COLUMNS; x++) {
      const roll = nextInt(state, 10);
      state = roll.state;
      const on = roll.value < 8;
      game.field[row * FIELD_COLUMNS + x] = on ? 1 + (roll.value % 7) : 0;
      if (on) filled++;
    }
    if (filled === FIELD_COLUMNS) game.field[row * FIELD_COLUMNS + (seed % FIELD_COLUMNS)] = 0;
  }
}

interface Trace {
  readonly frames: string[];
  readonly game: TetrisGame;
  readonly violations: string[];
  readonly counts: Record<string, number>;
}

/** Сыграть сценарий: на `ready`/`over` сразу новый старт. Возвращает покадровый след и нарушения инвариантов. */
function play(seed: number, inputs: readonly TetrisInput[], options: TetrisOptions = {}): Trace {
  const game = new TetrisGame({ seed, ...options });
  const frames: string[] = [];
  const violations: string[] = [];
  const counts: Record<string, number> = {};
  let starts = 0;
  for (const input of inputs) {
    let events: TetrisEvent[];
    if (game.phase === 'ready' || game.phase === 'over') {
      events = game.start();
      addGarbage(game, seed + ++starts);
    } else {
      events = game.step(input);
    }
    for (const event of events) counts[event.type] = (counts[event.type] ?? 0) + 1;
    frames.push(`${game.phase}|${game.score}|${game.hiScore}|${game.lines}|${game.speed}|${game.snapshot().join('')}|${JSON.stringify(events)}`);
    checkInvariants(game, violations);
  }
  return { frames, game, violations, counts };
}

function checkInvariants(game: TetrisGame, violations: string[]): void {
  const at = `${game.phase}/tick ${game.tick}`;
  if (game.score < 0 || game.score > MAX_SCORE) violations.push(`${at}: счёт ${game.score}`);
  if (game.hiScore < game.score) violations.push(`${at}: хай-скор ${game.hiScore} < счёта ${game.score}`);
  if (game.speed < 1 || game.speed > 10) violations.push(`${at}: скорость ${game.speed}`);
  if (game.overFill < 0 || game.overFill > FIELD_ROWS) violations.push(`${at}: overFill ${game.overFill}`);
  for (const value of game.field) {
    if (value < 0 || value > 7) {
      violations.push(`${at}: значение клетки ${value}`);
      break;
    }
  }
  if (game.clearRows.length > 0 && (game.clearTimer <= 0 || game.piece !== null)) {
    violations.push(`${at}: вспышка без таймера или с фигурой`);
  }
  const piece = game.piece;
  if (piece) {
    if (piece.rotation < 0 || piece.rotation > 3) violations.push(`${at}: поворот ${piece.rotation}`);
    if (filledCount(game.snapshot()) !== filledCount(game.field) + 4) {
      violations.push(`${at}: фигура ${piece.kind} пересекает стопку или вылезла за поле (${piece.x},${piece.y})`);
    }
  }
}

describe('детерминизм', () => {
  it('одно зерно и один сценарий ввода — одинаковые состояния на каждом такте', () => {
    const inputs = scriptedInputs(2024, 4000);
    const a = play(5, inputs, { startSpeed: 4 });
    const b = play(5, inputs, { startSpeed: 4 });
    expect(a.frames).toEqual(b.frames);
    expect([...a.game.snapshot()]).toEqual([...b.game.snapshot()]);
    expect(a.game.score).toBe(b.game.score);
    expect(a.game.hiScore).toBe(b.game.hiScore);
  });

  it('сценарий действительно играет партию: бывают падения, очистки и конец игры', () => {
    const { counts } = play(5, scriptedInputs(2024, 4000), { startSpeed: 4 });
    expect(counts['lock'] ?? 0).toBeGreaterThan(20);
    expect(counts['lines'] ?? 0).toBeGreaterThan(0);
    expect(counts['gameOver'] ?? 0).toBeGreaterThan(0);
    expect(counts['started'] ?? 0).toBeGreaterThan(1);
  });

  it('другое зерно даёт другую партию', () => {
    const inputs = scriptedInputs(2024, 1500);
    expect(play(5, inputs).frames).not.toEqual(play(6, inputs).frames);
  });

  it('экземпляры не делят состояние: игра соседа на результат не влияет', () => {
    const a = new TetrisGame({ seed: 3 });
    const neighbour = new TetrisGame({ seed: 4 });
    const alone = new TetrisGame({ seed: 3 });
    a.start();
    neighbour.start();
    alone.start();
    for (const input of scriptedInputs(9, 600)) {
      neighbour.step(input);
      a.step(input);
      alone.step(input);
    }
    expect([...a.snapshot()]).toEqual([...alone.snapshot()]);
    expect(a.score).toBe(alone.score);
    expect(a.next).toBe(alone.next);
  });

  it('инварианты на длинной случайной игре: фигура не пересекает стопку, счёт и скорость в пределах', () => {
    for (const [seed, startSpeed] of [
      [1, 1],
      [2, 6],
      [3, 10],
    ] as const) {
      const { violations } = play(seed, scriptedInputs(seed * 77, 12000), { startSpeed });
      expect(violations.slice(0, 5), `зерно ${seed}`).toEqual([]);
    }
  });

  it('скорость всегда равна min(10, стартовая + линии / 10)', () => {
    const game = new TetrisGame({ seed: 12, startSpeed: 2 });
    game.start();
    for (const input of scriptedInputs(31, 8000)) {
      if (game.phase === 'over') game.start();
      game.step(input);
      expect(game.speed).toBe(Math.min(10, 2 + Math.floor(game.lines / 10)));
    }
  });
});
