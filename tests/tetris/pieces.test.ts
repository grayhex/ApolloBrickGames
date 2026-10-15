import { describe, expect, it } from 'vitest';
import {
  BOX_SIZE,
  PIECE_KINDS,
  ROTATION_COUNT,
  SPAWN_COLUMN,
  cellsOf,
  pieceCellValue,
  pieceKindOfValue,
  spawnRowOf,
  type PieceKind,
} from '../../src/tetris';

/** Коробка 4×4 строками: `X` — клетка фигуры. */
function draw(kind: PieceKind, rotation: number): string[] {
  const grid = Array.from({ length: BOX_SIZE }, () => Array.from({ length: BOX_SIZE }, () => '.'));
  for (const [dx, dy] of cellsOf(kind, rotation)) {
    const row = grid[dy];
    if (row) row[dx] = 'X';
  }
  return grid.map((row) => row.join(''));
}

describe('фигуры: состав и форма', () => {
  it('семь фигур в порядке I O T S Z J L', () => {
    expect([...PIECE_KINDS]).toEqual(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
  });

  describe.each(PIECE_KINDS)('фигура %s', (kind) => {
    it.each([0, 1, 2, 3])('поворот %i: ровно 4 разные клетки внутри коробки 4×4', (rotation) => {
      const cells = cellsOf(kind, rotation);
      expect(cells).toHaveLength(4);
      expect(new Set(cells.map(([dx, dy]) => `${dx},${dy}`)).size).toBe(4);
      for (const [dx, dy] of cells) {
        expect(Number.isInteger(dx) && Number.isInteger(dy)).toBe(true);
        expect(dx).toBeGreaterThanOrEqual(0);
        expect(dx).toBeLessThan(BOX_SIZE);
        expect(dy).toBeGreaterThanOrEqual(0);
        expect(dy).toBeLessThan(BOX_SIZE);
      }
    });

    it('четыре поворота подряд возвращают исходную форму', () => {
      expect(cellsOf(kind, ROTATION_COUNT)).toEqual(cellsOf(kind, 0));
    });

    it('поворот берётся по модулю 4, отрицательный — против часовой', () => {
      expect(cellsOf(kind, 5)).toEqual(cellsOf(kind, 1));
      expect(cellsOf(kind, -1)).toEqual(cellsOf(kind, 3));
    });

    it('при появлении верхняя клетка лежит на строке 0 поля', () => {
      const top = Math.min(...cellsOf(kind, 0).map(([, dy]) => dy)) + spawnRowOf(kind);
      expect(top).toBe(0);
    });

    it('фигура целиком помещается в 10 колонок при появлении по центру', () => {
      for (const [dx] of cellsOf(kind, 0)) {
        expect(SPAWN_COLUMN + dx).toBeGreaterThanOrEqual(0);
        expect(SPAWN_COLUMN + dx).toBeLessThan(10);
      }
    });
  });

  it('O не меняется при поворотах', () => {
    for (let rotation = 1; rotation < ROTATION_COUNT; rotation++) {
      expect(cellsOf('O', rotation)).toEqual(cellsOf('O', 0));
    }
    expect(draw('O', 0)).toEqual(['.XX.', '.XX.', '....', '....']);
  });

  it('I: горизонтальная на строке 1, вертикальная в колонке 2 (по часовой), затем строка 2 и колонка 1', () => {
    expect(draw('I', 0)).toEqual(['....', 'XXXX', '....', '....']);
    expect(draw('I', 1)).toEqual(['..X.', '..X.', '..X.', '..X.']);
    expect(draw('I', 2)).toEqual(['....', '....', 'XXXX', '....']);
    expect(draw('I', 3)).toEqual(['.X..', '.X..', '.X..', '.X..']);
  });

  it('T: четыре ориентации по часовой стрелке', () => {
    expect(draw('T', 0)).toEqual(['.X..', 'XXX.', '....', '....']);
    expect(draw('T', 1)).toEqual(['.X..', '.XX.', '.X..', '....']);
    expect(draw('T', 2)).toEqual(['....', 'XXX.', '.X..', '....']);
    expect(draw('T', 3)).toEqual(['.X..', 'XX..', '.X..', '....']);
  });

  it('J: четыре ориентации по часовой стрелке', () => {
    expect(draw('J', 0)).toEqual(['X...', 'XXX.', '....', '....']);
    expect(draw('J', 1)).toEqual(['.XX.', '.X..', '.X..', '....']);
    expect(draw('J', 2)).toEqual(['....', 'XXX.', '..X.', '....']);
    expect(draw('J', 3)).toEqual(['.X..', '.X..', 'XX..', '....']);
  });

  it('L: четыре ориентации по часовой стрелке', () => {
    expect(draw('L', 0)).toEqual(['..X.', 'XXX.', '....', '....']);
    expect(draw('L', 1)).toEqual(['.X..', '.X..', '.XX.', '....']);
    expect(draw('L', 2)).toEqual(['....', 'XXX.', 'X...', '....']);
    expect(draw('L', 3)).toEqual(['XX..', '.X..', '.X..', '....']);
  });

  it('S и Z: исходная и повёрнутая формы', () => {
    expect(draw('S', 0)).toEqual(['.XX.', 'XX..', '....', '....']);
    expect(draw('S', 1)).toEqual(['.X..', '.XX.', '..X.', '....']);
    expect(draw('S', 2)).toEqual(['....', '.XX.', 'XX..', '....']);
    expect(draw('S', 3)).toEqual(['X...', 'XX..', '.X..', '....']);
    expect(draw('Z', 0)).toEqual(['XX..', '.XX.', '....', '....']);
    expect(draw('Z', 1)).toEqual(['..X.', '.XX.', '.X..', '....']);
    expect(draw('Z', 2)).toEqual(['....', 'XX..', '.XX.', '....']);
    expect(draw('Z', 3)).toEqual(['.X..', 'XX..', 'X...', '....']);
  });

  it('при появлении I лежит на строке 0 поля (y = -1), остальные — коробка с y = 0', () => {
    expect(spawnRowOf('I')).toBe(-1);
    for (const kind of PIECE_KINDS) if (kind !== 'I') expect(spawnRowOf(kind)).toBe(0);
  });
});

describe('фигуры: значения клеток поля', () => {
  it('значения 1..7 по порядку PIECE_KINDS и обратное соответствие', () => {
    PIECE_KINDS.forEach((kind, index) => {
      expect(pieceCellValue(kind)).toBe(index + 1);
      expect(pieceKindOfValue(index + 1)).toBe(kind);
    });
  });

  it('пустая и неверная клетка не соответствуют ни одной фигуре', () => {
    expect(pieceKindOfValue(0)).toBeNull();
    expect(pieceKindOfValue(8)).toBeNull();
    expect(pieceKindOfValue(-1)).toBeNull();
  });
});
