import type { LevelDef } from './schema';

/**
 * Уровень → канонический JSON общего формата (тот же, что читает загрузчик игры).
 * Значения по умолчанию опускаются. Результат проходит validateLevel без правок —
 * один формат для игры и встроенного редактора уровней.
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
    ...(level.marks.length === 0
      ? {}
      : {
          marks: level.marks.map((mark) => ({
            id: mark.id,
            x: mark.x,
            y: mark.y,
            ...(mark.w === 1 ? {} : { w: mark.w }),
            ...(mark.h === 1 ? {} : { h: mark.h }),
            status: mark.status,
            ...(mark.note === '' ? {} : { note: mark.note }),
            ...(mark.ref === '' ? {} : { ref: mark.ref }),
          })),
        }),
  };
}
