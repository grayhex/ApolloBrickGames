/**
 * Камера — отдельный модуль рендера. Ядро ничего не знает о прокрутке:
 * как прокручивается оригинальная игра, пока неизвестно.
 * Координаты камеры — левый верхний угол видимой области в клетках карты;
 * если карта меньше окна, значение отрицательное (карта по центру).
 */
export interface CameraPos {
  x: number;
  y: number;
}

export interface CameraArea {
  /** Размер видимой области в клетках. */
  columns: number;
  rows: number;
  /** Размер карты в клетках. */
  levelWidth: number;
  levelHeight: number;
}

function clampAxis(value: number, view: number, level: number): number {
  if (level <= view) {
    const offset = Math.floor((view - level) / 2);
    return offset === 0 ? 0 : -offset; // без «минус нуля»
  }
  return Math.min(Math.max(value, 0), level - view);
}

/** Мгновенно центрирует камеру на клетке (старт участка, перезапуск). */
export function centerCamera(target: CameraPos, area: CameraArea): CameraPos {
  return {
    x: clampAxis(target.x - Math.floor(area.columns / 2), area.columns, area.levelWidth),
    y: clampAxis(target.y - Math.floor(area.rows / 2), area.rows, area.levelHeight),
  };
}

function followAxis(prev: number, target: number, view: number, level: number): number {
  const margin = Math.max(0, Math.floor(view * 0.3));
  let next = prev;
  if (target < prev + margin) next = target - margin;
  else if (target > prev + view - 1 - margin) next = target - (view - 1 - margin);
  return clampAxis(next, view, level);
}

/** Следует за героем, пока тот не выйдет за «мёртвую рамку»; прыжки не дёргают камеру. */
export function followCamera(prev: CameraPos, target: CameraPos, area: CameraArea): CameraPos {
  return {
    x: followAxis(prev.x, target.x, area.columns, area.levelWidth),
    y: followAxis(prev.y, target.y, area.rows, area.levelHeight),
  };
}
