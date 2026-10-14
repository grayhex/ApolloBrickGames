import type { GameEvent } from '../core';

/** Строка таблицы спидрана: уровень и его время. */
export interface RunRow {
  levelId: string;
  /** Время уровня в тактах мира: у пройденного — итоговое, у идущего — на сейчас, у остальных — null. */
  ticks: number | null;
  state: 'done' | 'current' | 'pending';
}

export interface RunView {
  rows: readonly RunRow[];
  /** Всё время забега в тактах мира с последнего рестарта (после последнего финиша — замороженное). */
  totalTicks: number;
  done: number;
  count: number;
  /** Последний уровень пройден. */
  finished: boolean;
}

/**
 * Спидран: время каждого уровня и общее время забега. Считается по `worldTick` ядра — только такты, в которые мир действительно
 * считался (пауза, меню и закрытая крышка не в счёт). Смерть времени не останавливает: гибель — часть забега. Рестарт, новая игра
 * и запуск другого уровня обнуляют счётчик. Чистые вычисления: без DOM и часов.
 */
export class Speedrun {
  private readonly order: readonly string[];
  private readonly splits = new Map<string, number>();
  private segmentStart = 0;
  private lastSeen = 0;
  private current: string | null;
  private finished = false;
  private frozenTotal = 0;

  /** `order` — уровни по порядку прохождения; `first` — с какого начинается забег. */
  constructor(order: readonly string[], first: string | null = order[0] ?? null) {
    this.order = order;
    this.current = first;
  }

  /** Новый забег: с `first`, часы с `worldTick`. */
  reset(first: string | null = this.order[0] ?? null, worldTick = 0): void {
    this.splits.clear();
    this.segmentStart = worldTick;
    this.lastSeen = worldTick;
    this.current = first;
    this.finished = false;
    this.frozenTotal = 0;
  }

  /** События ядра: финиш уровня закрывает отрезок, дальше идёт следующий. Такт мира берётся на момент события. */
  onEvent(event: GameEvent, worldTick: number): void {
    if (event.type === 'levelCompleted') {
      this.splits.set(event.levelId, Math.max(0, worldTick - this.segmentStart));
      this.segmentStart = worldTick;
      this.current = event.next;
      if (event.next === null) {
        this.finished = true;
        this.frozenTotal = worldTick;
      }
    } else if (event.type === 'levelStarted' && !this.finished) {
      this.current = event.levelId;
    }
  }

  /** Состояние на такте мира `worldTick`. Если часы мира пошли назад (новая игра внутри ядра), забег начинается заново. */
  view(worldTick: number): RunView {
    if (worldTick < this.lastSeen) this.reset(this.order[0] ?? null, 0);
    this.lastSeen = worldTick;
    const ids = this.order.includes(this.current ?? '') || this.current === null ? this.order : [...this.order, this.current];
    const rows: RunRow[] = ids.map((levelId) => {
      const split = this.splits.get(levelId);
      if (split !== undefined) return { levelId, ticks: split, state: 'done' };
      if (levelId === this.current && !this.finished) return { levelId, ticks: Math.max(0, worldTick - this.segmentStart), state: 'current' };
      return { levelId, ticks: null, state: 'pending' };
    });
    return {
      rows,
      totalTicks: this.finished ? this.frozenTotal : worldTick,
      done: this.splits.size,
      count: ids.length,
      finished: this.finished,
    };
  }
}

/** Время для HUD: `м:сс.д` (доли секунды — десятые), такты → секунды по темпу игры. */
export function formatRunTime(ticks: number, tickRateHz: number): string {
  const tenths = Math.floor((ticks * 10) / tickRateHz);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}
