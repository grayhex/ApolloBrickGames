import type { ContentPack, ParamSpec } from '../../content/schema';
import type { AssetStore } from '../../render/assets';
import type { DiagnoseEnv, Problem } from '../diagnose';
import type { EditorSession } from '../session';
import type { EditorStore } from '../store';
import type { Pt } from '../types';
import type { MapView } from './mapView';
import type { PhotoCache } from './photos';

export interface ObjectTypeInfo {
  type: string;
  label: string;
  solid: boolean;
  params: readonly ParamSpec[];
}

/** Всё, что нужно панелям от остального редактора. Панели не знают друг о друге. */
export interface EditorContext {
  store: EditorStore;
  session: EditorSession;
  map: MapView;
  photos: PhotoCache;
  pack(): ContentPack;
  assets(): AssetStore;
  env(): DiagnoseEnv;
  objectTypes: readonly ObjectTypeInfo[];
  problems(): readonly Problem[];
  say(message: string, tone?: 'info' | 'warn' | 'error'): void;
  startCalibration(refId: string): void;
  runTest(from: Pt | null): void;
  resizeMap(width: number, height: number): Promise<void>;
  addPhotos(files: readonly File[]): Promise<void>;
  gotoProblem(problem: Problem): void;
  /** Значения по умолчанию для нового объекта типа `type`. */
  objectDefaults(type: string): { params: Record<string, number | string | boolean>; asset: string | null };
}

export const TOOL_LABELS: Record<string, { label: string; key: string; hint: string }> = {
  brush: { label: 'Кисть', key: 'B', hint: 'Рисует выбранной клеткой; мазок — одна операция отмены' },
  eraser: { label: 'Ластик', key: 'E', hint: 'Стирает только клетки карты; объекты, старт и пометки остаются' },
  rect: { label: 'Прямоугольник', key: 'R', hint: 'Заполняет прямоугольник выбранной клеткой' },
  fill: { label: 'Заливка', key: 'F', hint: 'Заливает связную область одинаковых клеток' },
  eyedropper: { label: 'Пипетка', key: 'I', hint: 'Берёт клетку под курсором как выбранную' },
  select: { label: 'Выделение', key: 'V', hint: 'Выделяет прямоугольник клеток; перетаскивание внутри выделения переносит клетки' },
  start: { label: 'Старт', key: 'S', hint: 'Ставит или переносит единственную точку старта героя' },
  object: { label: 'Объект', key: 'O', hint: 'Ставит выбранный тип объекта; клик по объекту выделяет и переносит его' },
  mark: { label: 'Пометка', key: 'M', hint: 'Исследовательская пометка области: неизвестно / предположение / подтверждено' },
  photo: { label: 'Подложка', key: 'P', hint: 'Двигает выбранный референс по карте (Shift — по целым клеткам)' },
  pan: { label: 'Рука', key: 'H', hint: 'Перемещает рабочую область (также пробел + перетаскивание или средняя кнопка)' },
};
