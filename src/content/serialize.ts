import type { LevelDef } from './schema';

/**
 * Уровень → канонический JSON общего формата (тот же, что читает загрузчик игры).
 * Значения по умолчанию опускаются. Результат проходит validateLevel без правок —
 * это точка входа для будущего редактора уровней: один формат для игры и редактора.
 */
export function levelToJson(level: LevelDef): Record<string, unknown> {
  return {
    schemaVersion: level.schemaVersion,
    id: level.id,
    status: level.status,
    hudLabel: level.hudLabel,
    ...(level.note === '' ? {} : { note: level.note }),
    width: level.width,
    height: level.height,
    legend: Object.fromEntries(
      Object.entries(level.legend).map(([char, entry]) => [
        char,
        entry.asset === null ? { collision: entry.collision } : { collision: entry.collision, asset: entry.asset },
      ]),
    ),
    rows: [...level.rows],
    start: { x: level.start.x, y: level.start.y },
    objects: level.objects.map((object) => ({
      id: object.id,
      type: object.type,
      x: object.x,
      y: object.y,
      ...(object.w === 1 ? {} : { w: object.w }),
      ...(object.h === 1 ? {} : { h: object.h }),
      ...(object.asset === null ? {} : { asset: object.asset }),
      ...(Object.keys(object.params).length === 0 ? {} : { params: { ...object.params } }),
    })),
    transitions: level.transitions.map((transition) => ({ from: transition.from, to: transition.to })),
  };
}
