/**
 * История изменений на снимках неизменяемых значений.
 * Непрерывный мазок — одна операция: `begin()` … `replace()` × N … `end()`.
 * Любое новое изменение после undo очищает ветку redo.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private base: { value: T } | null = null;
  private readonly limit: number;

  constructor(initial: T, limit = 200) {
    this.current = initial;
    this.limit = limit;
  }

  get present(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get inTransaction(): boolean {
    return this.base !== null;
  }

  /** Одна завершённая операция. Одинаковое значение (по ссылке) операцией не считается. */
  commit(next: T): boolean {
    if (this.base) throw new Error('commit внутри незавершённой операции');
    if (Object.is(next, this.current)) return false;
    this.push(this.current);
    this.current = next;
    return true;
  }

  begin(): void {
    if (this.base) return;
    this.base = { value: this.current };
  }

  /** Промежуточное значение внутри операции (в историю не попадает). */
  replace(next: T): void {
    if (!this.base) throw new Error('replace вне операции');
    this.current = next;
  }

  /** Завершает операцию; true — значение изменилось и операция попала в историю. */
  end(): boolean {
    const base = this.base;
    if (!base) return false;
    this.base = null;
    if (Object.is(base.value, this.current)) return false;
    this.push(base.value);
    return true;
  }

  /** Отменяет незавершённую операцию, возвращая значение на начало. */
  cancel(): void {
    if (!this.base) return;
    this.current = this.base.value;
    this.base = null;
  }

  undo(): T | null {
    if (this.base) this.end();
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(this.current);
    this.current = previous;
    return previous;
  }

  redo(): T | null {
    if (this.base) this.end();
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return next;
  }

  /** Новая точка отсчёта (открыт другой документ): прошлое и будущее очищаются. */
  reset(initial: T): void {
    this.past = [];
    this.future = [];
    this.base = null;
    this.current = initial;
  }

  private push(value: T): void {
    this.past.push(value);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
}
