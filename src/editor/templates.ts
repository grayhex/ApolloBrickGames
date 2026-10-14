import type { ContentPack, LegendEntry, LevelDef } from '../content/schema';
import { emptyChar } from './grid';
import type { EditorDoc } from './types';

/** Допустимый идентификатор уровня из названия: латиница, цифры, точка, дефис; иначе запасной вариант. */
export function slugify(name: string, fallback = 'room'): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9._-]+$/g, '')
    .replace(/-{2,}/g, '-');
  return slug === '' ? fallback : slug.slice(0, 48);
}

export interface NewDocOptions {
  projectId: string;
  name: string;
  /** Каталог пакета в public/content (профиль экрана и правила). */
  pack: string;
  /** Идентификатор уровня; по умолчанию из названия. */
  id?: string;
}

function templateLegend(base: ContentPack): Record<string, LegendEntry> {
  const first = base.levels.find((level) => level.id === base.manifest.firstLevel) ?? base.levels[0];
  const legend = first ? structuredClone(first.legend) : {};
  if (emptyChar(legend) === null) legend['.'] = { collision: 'empty', asset: null };
  if (!Object.values(legend).some((entry) => entry.collision === 'solid')) legend['#'] = { collision: 'solid', asset: null };
  return legend;
}

/**
 * «Одна комната» по профилю экрана пакета: размер берётся из видимого поля профиля, а не зашит;
 * внизу ряд земли и старт над ним. Это шаблон редактора, а не оригинальный уровень.
 */
export function newRoomDoc(base: ContentPack, options: NewDocOptions & { floor?: boolean }): EditorDoc {
  const { columns, rows: rowCount } = base.screen.viewport;
  const legend = templateLegend(base);
  const empty = emptyChar(legend) ?? '.';
  const ground = Object.entries(legend).find(([, entry]) => entry.collision === 'solid')?.[0] ?? '#';
  const withFloor = options.floor !== false && rowCount > 1;
  const rows = Array.from({ length: rowCount }, (_, y) => (withFloor && y === rowCount - 1 ? ground : empty).repeat(columns));
  return {
    projectId: options.projectId,
    pack: options.pack,
    name: options.name,
    id: options.id ?? slugify(options.name),
    status: 'demo',
    hudLabel: 'NEW',
    note: '',
    width: columns,
    height: rowCount,
    legend,
    rows,
    start: withFloor ? { x: Math.min(1, columns - 1), y: rowCount - 2 } : { x: 0, y: rowCount - 1 },
    objects: [],
    transitions: [],
    marks: [],
    refs: [],
  };
}

/** Редактируемая копия готового уровня пакета (например demo-room). */
export function docFromLevel(level: LevelDef, options: NewDocOptions): EditorDoc {
  return {
    projectId: options.projectId,
    pack: options.pack,
    name: options.name,
    id: options.id ?? level.id,
    status: level.status,
    hudLabel: level.hudLabel,
    note: level.note,
    width: level.width,
    height: level.height,
    legend: structuredClone(level.legend),
    rows: [...level.rows],
    start: { ...level.start },
    objects: structuredClone(level.objects),
    transitions: structuredClone(level.transitions),
    marks: structuredClone(level.marks),
    refs: [],
  };
}
