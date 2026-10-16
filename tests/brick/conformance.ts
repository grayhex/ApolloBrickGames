import { describe, expect, it } from 'vitest';
import {
  BRICK_CELLS,
  BRICK_ROWS,
  MAX_LEVEL,
  MAX_SCORE,
  MAX_SPEED,
  MIN_LEVEL,
  MIN_SPEED,
  NEUTRAL_BRICK_INPUT,
  PREVIEW_CELLS,
  makeBrickInput,
  type BrickAction,
  type BrickGame,
  type BrickGameDef,
  type BrickInput,
} from '../../src/brick';

export const ALL_ACTIONS: readonly BrickAction[] = ['left', 'right', 'up', 'down', 'rotate', 'fire'];

/**
 * Воспроизводимый «случайный игрок»: на каждый такт кнопки то нажимаются, то отпускаются (LCG; `Math.random` в тестах не нужен — важна повторяемость).
 * `bias` — вероятность нажать любую кнопку в такте (0..1).
 */
export function fuzzPlayer(seed: number, bias = 0.15): () => BrickInput {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const held = new Set<BrickAction>();
  return () => {
    const pressed: BrickAction[] = [];
    for (const action of ALL_ACTIONS) {
      if (next() < bias) {
        if (held.has(action)) held.delete(action);
        else {
          held.add(action);
          pressed.push(action);
        }
      }
    }
    return makeBrickInput(pressed, held);
  };
}

/** Короткая сигнатура кадра: сумма клеток со взвешиванием позиции. */
export function frameHash(game: BrickGame): string {
  const cells = game.cells();
  let h = 0;
  for (let i = 0; i < cells.length; i++) h = (Math.imul(h, 31) + (cells[i] ?? 0) * (i + 1)) >>> 0;
  const preview = game.preview();
  let p = 0;
  if (preview) for (let i = 0; i < preview.length; i++) p = (Math.imul(p, 31) + (preview[i] ?? 0) * (i + 1)) >>> 0;
  return `${h}:${p}:${game.score}:${game.lives ?? '-'}:${game.speed}:${game.level}:${game.phase}:${game.overFill}`;
}

/** Инварианты, которые обязаны выполняться в любой момент любой игры. */
export function expectValid(game: BrickGame): void {
  const cells = game.cells();
  expect(cells).toBeInstanceOf(Uint8Array);
  expect(cells.length).toBe(BRICK_CELLS);
  for (const value of cells) expect(value <= 2).toBe(true);
  const preview = game.preview();
  if (preview) {
    expect(preview.length).toBe(PREVIEW_CELLS);
    for (const value of preview) expect(value <= 2).toBe(true);
  }
  expect(Number.isInteger(game.score)).toBe(true);
  expect(game.score).toBeGreaterThanOrEqual(0);
  expect(game.score).toBeLessThanOrEqual(MAX_SCORE);
  expect(game.hiScore).toBeGreaterThanOrEqual(game.score);
  expect(game.speed).toBeGreaterThanOrEqual(MIN_SPEED);
  expect(game.speed).toBeLessThanOrEqual(MAX_SPEED);
  expect(game.level).toBeGreaterThanOrEqual(MIN_LEVEL);
  expect(game.level).toBeLessThanOrEqual(MAX_LEVEL);
  if (game.lives !== null) {
    expect(game.lives).toBeGreaterThanOrEqual(0);
    expect(game.lives).toBeLessThanOrEqual(4);
  }
  expect(game.overFill).toBeGreaterThanOrEqual(0);
  expect(game.overFill).toBeLessThanOrEqual(BRICK_ROWS);
  expect(['ready', 'playing', 'paused', 'over']).toContain(game.phase);
}

/**
 * Общие проверки для любой игры из каталога — на каждом из её вариантов: форма данных, фазы, повторяемость, устойчивость к случайному вводу.
 * Игра сверх этого пишет свои тесты правил.
 */
export function conformance(def: BrickGameDef, options: { fuzzTicks?: number; seeds?: number[] } = {}): void {
  const fuzzTicks = options.fuzzTicks ?? 2500;
  const seeds = options.seeds ?? [1, 7];
  describe(`${def.id}: общие проверки`, () => {
    it('у игры есть варианты с названиями на двух языках и пометкой', () => {
      expect(def.modes.length).toBeGreaterThan(0);
      for (const mode of def.modes) {
        expect(mode.name.ru.length).toBeGreaterThan(0);
        expect(mode.name.en.length).toBeGreaterThan(0);
        expect(mode.note.length).toBeGreaterThan(0);
      }
      if (def.declaredModes !== null) expect(def.declaredModes).toBeGreaterThanOrEqual(def.modes.length);
    });

    def.modes.forEach((mode, index) => {
      describe(`вариант ${String(index + 1).padStart(2, '0')} — ${mode.name.ru}`, () => {
        const make = (seed = 7, extra = {}): BrickGame => def.create({ seed, mode: index, ...extra });

        it('до старта: ждёт, поле и превью допустимы, ввод ничего не меняет, id совпадает с каталогом', () => {
          const game = make();
          expect(game.id).toBe(def.id);
          expect(game.phase).toBe('ready');
          expect(game.score).toBe(0);
          expect(game.tick).toBe(0);
          expectValid(game);
          const before = frameHash(game);
          expect(game.step(makeBrickInput(['left', 'rotate']))).toEqual([]);
          expect(frameHash(game)).toBe(before);
        });

        it('старт, пауза и продолжение, рестарт возвращает к ожиданию', () => {
          const game = make();
          expect(game.start().some((event) => event.type === 'started')).toBe(true);
          expect(game.phase).toBe('playing');
          for (let i = 0; i < 30; i++) game.step(NEUTRAL_BRICK_INPUT);
          expect(game.pause()).toEqual([{ type: 'paused' }]);
          expect(game.phase).toBe('paused');
          const frozen = frameHash(game);
          const tick = game.tick;
          for (let i = 0; i < 20; i++) expect(game.step(makeBrickInput(['left', 'rotate']))).toEqual([]);
          expect(frameHash(game)).toBe(frozen);
          expect(game.tick).toBe(tick);
          expect(game.resume()).toEqual([{ type: 'resumed' }]);
          expect(game.phase).toBe('playing');
          game.restart();
          expect(game.phase).toBe('ready');
          expect(game.score).toBe(0);
          expect(game.tick).toBe(0);
          expectValid(game);
        });

        it('номер варианта вне диапазона берётся по кругу', () => {
          const wrapped = def.create({ seed: 7, mode: index + def.modes.length });
          expect(frameHash(wrapped)).toBe(frameHash(make()));
        });

        for (const seed of seeds) {
          it(`случайный ввод ${fuzzTicks} тактов (зерно ${seed}): инварианты, повторяемость, события допустимы`, () => {
            const a = make(seed);
            const b = make(seed);
            a.start();
            b.start();
            const playerA = fuzzPlayer(seed * 31 + index);
            const playerB = fuzzPlayer(seed * 31 + index);
            let lastHi = a.hiScore;
            for (let t = 0; t < fuzzTicks; t++) {
              if (a.phase === 'over') {
                expect(b.phase).toBe('over');
                a.start();
                b.start();
              }
              const eventsA = a.step(playerA());
              const eventsB = b.step(playerB());
              expect(eventsA).toEqual(eventsB);
              expect(frameHash(a)).toBe(frameHash(b));
              expect(a.hiScore).toBeGreaterThanOrEqual(lastHi);
              lastHi = a.hiScore;
              if (t % 5 === 0 || a.phase === 'over') expectValid(a);
            }
          });
        }

        it('скорость и уровень из параметров ограничиваются диапазоном 1..10', () => {
          const game = make(7, { speed: 99, level: -4 });
          expect(game.speed).toBe(MAX_SPEED);
          expect(game.level).toBe(MIN_LEVEL);
          const low = make(7, { speed: 0, level: 0 });
          expect(low.speed).toBe(MIN_SPEED);
          expect(low.level).toBe(MIN_LEVEL);
        });
      });
    });
  });
}
