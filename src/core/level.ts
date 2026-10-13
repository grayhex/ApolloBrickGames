import type { LevelDef } from '../content/schema';

/** Уровень, подготовленный для симуляции: быстрые проверки проходимости. */
export interface LevelRuntime {
  readonly def: LevelDef;
  readonly width: number;
  readonly height: number;
  /** 1 — клетка непроходима. Индекс: y * width + x. */
  readonly solid: Uint8Array;
  /** id объекта-триггера → id следующего уровня (null — конец игры). */
  readonly transitions: ReadonlyMap<string, string | null>;
}

export function prepareLevel(def: LevelDef): LevelRuntime {
  const solid = new Uint8Array(def.width * def.height);
  def.rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (def.legend[char]?.collision === 'solid') solid[y * def.width + x] = 1;
    });
  });
  return {
    def,
    width: def.width,
    height: def.height,
    solid,
    transitions: new Map(def.transitions.map((tr) => [tr.from, tr.to])),
  };
}

/** Занятость тайла; за пределами карты — false (границы обрабатывает симуляция). */
export function tileSolid(level: LevelRuntime, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  return level.solid[y * level.width + x] === 1;
}
