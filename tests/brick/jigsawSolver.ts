/** Решение пазла «Уложи фигуры» перебором — независимо от игры: для каждой фигуры число поворотов и положение угла рамки. Нужно сценарным тестам (ядро и браузер). */
export interface Placement {
  turns: number;
  x: number;
  y: number;
}
export type JigsawShape = number[][];
const normalise = (shape: JigsawShape): JigsawShape => {
  const minX = Math.min(...shape.map((p) => p[0]!));
  const minY = Math.min(...shape.map((p) => p[1]!));
  return shape.map(([x, y]) => [x! - minX, y! - minY]);
};
const turnJigsawShape = (shape: JigsawShape): JigsawShape => normalise(shape.map(([x, y]) => [-y!, x!]));

/** Решение пазла перебором (независимо от игры): для каждой фигуры — число поворотов и положение угла рамки. */
export function solveJigsaw(pieces: JigsawShape[]): Placement[] | null {
  const search = (index: number, mask: number, placed: Placement[]): Placement[] | null => {
    if (index === pieces.length) return mask === 0xffff ? placed : null;
    let shape = normalise(pieces[index]!.map((p) => [...p]));
    for (let turns = 0; turns < 4; turns++) {
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          if (shape.some(([dx, dy]) => x + dx! >= 4 || y + dy! >= 4)) continue;
          const bits = shape.reduce((m, [dx, dy]) => m | (1 << ((y + dy!) * 4 + x + dx!)), 0);
          if (bits & mask) continue;
          const rest = search(index + 1, mask | bits, [...placed, { turns, x, y }]);
          if (rest) return rest;
        }
      }
      shape = turnJigsawShape(shape);
    }
    return null;
  };
  return search(0, 0, []);
}

