/**
 * Автоплей Prince: простые «игроки» для демонстрации, которая идёт после заставки (владелец: сразу включается автоплей игр). У каждой игры своя несложная повадка — они читают
 * только то, что видно на матрице, и не претендуют на разбор алгоритма оригинала (записи демонстрации нет). Детерминированы: решения берутся из зерна консоли.
 */
import type { PrinceGameId } from './games/prince';
import { Rng } from './rng';
import { BRICK_COLS, BRICK_ROWS, makeBrickInput, NEUTRAL_BRICK_INPUT, type BrickAction, type BrickGame, type BrickInput } from './types';

const lit = (cells: Uint8Array, x: number, y: number): boolean => cells[y * BRICK_COLS + x] !== 0;

export class PrinceBot {
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /** Ввод на такт `tick` демонстрации для игры `id`. */
  input(id: PrinceGameId, game: BrickGame, tick: number): BrickInput {
    switch (id) {
      case 'tetris':
        return this.tetris(tick);
      case 'racing':
        return this.racing(game, tick);
      case 'tank':
        return this.tank(tick);
      case 'frog':
        return this.frog(tick);
      case 'arkanoid':
        return this.arkanoid(game, tick);
    }
  }

  private press(...actions: BrickAction[]): BrickInput {
    return makeBrickInput(actions);
  }

  /** Тетрис: фигуры сдвигаются в случайную сторону, иногда поворачиваются, и ускоряется падение. */
  private tetris(tick: number): BrickInput {
    const held: BrickAction[] = tick % 100 > 62 ? ['down'] : [];
    if (tick % 16 !== 0) return makeBrickInput([], held);
    const roll = this.rng.int(6);
    const pressed: BrickAction[] = roll < 2 ? ['left'] : roll < 4 ? ['right'] : roll === 4 ? ['rotate'] : [];
    return makeBrickInput(pressed, held);
  }

  /** Гонки: смотрит на ряды перед машиной и уходит туда, где меньше встречных машин. */
  private racing(game: BrickGame, tick: number): BrickInput {
    if (tick % 5 !== 0) return NEUTRAL_BRICK_INPUT;
    const cells = game.cells();
    let min = BRICK_COLS;
    let max = -1;
    for (let y = BRICK_ROWS - 4; y < BRICK_ROWS; y++) {
      for (let x = 1; x < BRICK_COLS - 1; x++) {
        if (!lit(cells, x, y)) continue;
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
    if (max < 0) return NEUTRAL_BRICK_INPUT;
    const near = (from: number, to: number, y0: number, y1: number): number => {
      let count = 0;
      for (let y = y0; y <= y1; y++) for (let x = Math.max(1, from); x <= Math.min(BRICK_COLS - 2, to); x++) if (lit(cells, x, y)) count++;
      return count;
    };
    if (near(min - 1, max + 1, BRICK_ROWS - 10, BRICK_ROWS - 5) === 0) return NEUTRAL_BRICK_INPUT;
    const left = near(1, min - 1, BRICK_ROWS - 12, BRICK_ROWS - 5);
    const right = near(max + 1, BRICK_COLS - 2, BRICK_ROWS - 12, BRICK_ROWS - 5);
    return this.press(left === right ? (this.rng.chance(0.5) ? 'left' : 'right') : left < right ? 'left' : 'right');
  }

  /** Танки: ездит в случайные стороны и стреляет. */
  private tank(tick: number): BrickInput {
    if (tick % 24 === 0) return this.press('rotate');
    if (tick % 9 !== 0 || this.rng.chance(0.4)) return NEUTRAL_BRICK_INPUT;
    return this.press(this.rng.pick<BrickAction>(['left', 'right', 'up', 'down']));
  }

  /** Фроггер: прыгает вперёд, иногда в сторону. */
  private frog(tick: number): BrickInput {
    if (tick % 33 === 0) return this.press(this.rng.chance(0.5) ? 'left' : 'right');
    return tick % 11 === 0 ? this.press('up') : NEUTRAL_BRICK_INPUT;
  }

  /** Арканоид: платформа следует за мячом; пока мяча не видно, запускает его. */
  private arkanoid(game: BrickGame, tick: number): BrickInput {
    const cells = game.cells();
    let ballX = -1;
    for (let y = BRICK_ROWS - 2; y >= 8 && ballX < 0; y--) {
      for (let x = 0; x < BRICK_COLS; x++) {
        if (lit(cells, x, y)) {
          ballX = x;
          break;
        }
      }
    }
    let min = BRICK_COLS;
    let max = -1;
    for (let x = 0; x < BRICK_COLS; x++) {
      if (!lit(cells, x, BRICK_ROWS - 1)) continue;
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    if (ballX < 0) return tick % 45 === 0 ? this.press('rotate') : NEUTRAL_BRICK_INPUT;
    if (max < 0 || tick % 2 !== 0) return NEUTRAL_BRICK_INPUT;
    const center = (min + max) / 2;
    if (ballX < center - 0.6) return this.press('left');
    if (ballX > center + 0.6) return this.press('right');
    return NEUTRAL_BRICK_INPUT;
  }
}
