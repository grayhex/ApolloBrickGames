import { levelToJson } from '../content/serialize';
import type { AssetCatalog, LevelDef, ValidationEnv } from '../content/schema';
import { ContentError, validateLevel } from '../content/validate';
import type { EditorDoc, Pt } from './types';

export type Severity = 'error' | 'warning';

/** Проблема документа: где она (путь в общем формате и, если можно, клетка/объект/пометка) и что не так. */
export interface Problem {
  severity: Severity;
  path: string;
  message: string;
  cell?: Pt;
  objectId?: string;
  markId?: string;
}

export interface DiagnoseEnv {
  assets: AssetCatalog;
  validation: ValidationEnv;
}

/** Уровень общего формата из документа. Без старта подставляется (0, 0) — отсутствие старта диагностируется отдельно. */
export function levelFromDoc(doc: EditorDoc): LevelDef {
  return {
    schemaVersion: 1,
    id: doc.id,
    status: doc.status,
    hudLabel: doc.hudLabel,
    note: doc.note,
    width: doc.width,
    height: doc.height,
    legend: doc.legend,
    rows: doc.rows,
    start: doc.start ?? { x: 0, y: 0 },
    objects: doc.objects,
    transitions: doc.transitions,
    marks: doc.marks,
  };
}

/** Игровой JSON общего формата (без референсов и служебных данных редактора). */
export function gameLevelJson(doc: EditorDoc): Record<string, unknown> {
  return levelToJson(levelFromDoc(doc));
}

const ROW_CELL = /^\$\.rows\[(\d+)\](?:\[(\d+)\])?/;
const OBJECT = /^\$\.objects\[(\d+)\]/;
const MARK = /^\$\.marks\[(\d+)\]/;

function locate(doc: EditorDoc, path: string): Pick<Problem, 'cell' | 'objectId' | 'markId'> {
  const row = ROW_CELL.exec(path);
  if (row) return { cell: { x: Number(row[2] ?? 0), y: Number(row[1]) } };
  if (path.startsWith('$.start') && doc.start) return { cell: { ...doc.start } };
  const object = OBJECT.exec(path);
  if (object) {
    const found = doc.objects[Number(object[1])];
    return found ? { objectId: found.id, cell: { x: found.x, y: found.y } } : {};
  }
  const mark = MARK.exec(path);
  if (mark) {
    const found = doc.marks[Number(mark[1])];
    return found ? { markId: found.id, cell: { x: found.x, y: found.y } } : {};
  }
  return {};
}

/**
 * Полная проверка документа общим валидатором игры. Ошибки — то, из-за чего игра не откроет уровень
 * и тест не запустится; предупреждения — наблюдения об уровне (неизвестные и предполагаемые области).
 * Ничего не исправляется молча: каждая проблема указывает на клетку, объект или пометку.
 */
export function diagnose(doc: EditorDoc, env: DiagnoseEnv): Problem[] {
  const problems: Problem[] = [];
  try {
    validateLevel(gameLevelJson(doc), env.assets, env.validation, doc.id);
  } catch (error) {
    if (!(error instanceof ContentError)) throw error;
    for (const issue of error.details) {
      // Старт заменён заглушкой — настоящую проблему добавим ниже.
      if (doc.start === null && issue.path.startsWith('$.start')) continue;
      problems.push({ severity: 'error', path: issue.path, message: issue.message, ...locate(doc, issue.path) });
    }
  }
  if (doc.start === null) {
    problems.push({ severity: 'error', path: '$.start', message: 'точка старта не задана' });
  }
  const unknown = doc.marks.filter((m) => m.status === 'unknown');
  const assumed = doc.marks.filter((m) => m.status === 'assumed');
  const first = unknown[0];
  if (first) {
    problems.push({
      severity: 'warning',
      path: '$.marks',
      message: `областей, помеченных «неизвестно»: ${unknown.length}; в игре эти клетки ведут себя по своему символу в rows (заполнитель), оригинальное содержимое не установлено`,
      cell: { x: first.x, y: first.y },
      markId: first.id,
    });
  }
  const firstAssumed = assumed[0];
  if (firstAssumed) {
    problems.push({
      severity: 'warning',
      path: '$.marks',
      message: `областей, помеченных «предположение»: ${assumed.length}; они не подтверждены по оригиналу`,
      cell: { x: firstAssumed.x, y: firstAssumed.y },
      markId: firstAssumed.id,
    });
  }
  return problems;
}

/** Для тестового запуска: в нём доступна только редактируемая карта, поэтому переходы на другие уровни — ошибка. */
export function diagnoseForTest(doc: EditorDoc, env: DiagnoseEnv): Problem[] {
  const problems = diagnose(doc, env);
  doc.transitions.forEach((transition, index) => {
    if (transition.to !== null && transition.to !== doc.id) {
      const object = doc.objects.find((o) => o.id === transition.from);
      problems.push({
        severity: 'error',
        path: `$.transitions[${index}].to`,
        message: `переход ведёт на уровень «${transition.to}», а в тестовом запуске доступна только эта карта`,
        ...(object ? { objectId: object.id, cell: { x: object.x, y: object.y } } : {}),
      });
    }
  });
  return problems;
}

export function errorsOf(problems: readonly Problem[]): Problem[] {
  return problems.filter((p) => p.severity === 'error');
}
