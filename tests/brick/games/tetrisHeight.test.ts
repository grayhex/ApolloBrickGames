import { describe, expect, it } from 'vitest';
import { SHAPE_SQUARE } from '../../../src/brick/games/tetris/shapes';
import { Lab } from './tetrisLab';

class ShortField extends Lab {
  protected override get fieldRows(): number { return 17; }
  rowsToClear(): number[] { return this.fullRows(); }
}

describe('Tetris field height', () => {
  it('spawns at the seventeenth row and maps the floor to row 16', () => {
    const game = new ShortField('tetris');
    game.wipe();
    game.fill(0, '#.........');
    game.respawn(SHAPE_SQUARE);
    expect(game.py + game.current!.minY).toBe(16);
    expect(game.rows()[16]![0]).toBe('#');
    expect(game.rows().slice(17)).toEqual(['..........', '..........', '..........']);
  });

  it('detects collision at the real top and ignores rows outside the field', () => {
    const game = new ShortField('tetris');
    game.wipe();
    game.fill(16, '##########');
    game.fill(17, '##########');
    expect(game.rowsToClear()).toEqual([]);
    game.respawn(SHAPE_SQUARE);
    expect(game.gameEnded).toBe(true);
  });
});
