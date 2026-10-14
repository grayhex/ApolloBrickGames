/**
 * Шутка со шлейфом: пока кнопку мыши (или палец) держат на шлейфе между половинами игрушки, контакт «пропадает» —
 * экран сначала частично рассыпается, потом гаснет совсем; отпустили — картинка возвращается. Игра при этом идёт
 * своим ходом: гаснет только изображение. Логика времени без DOM: уровень потери считается по часам, которые передаёт оболочка.
 */
export const GLITCH = {
  /** Сколько держать, пока первые куски не начнут пропадать, мс. */
  onsetMs: 350,
  /** К этому моменту потеря достигает `partialMax` (экран ещё виден кусками). */
  partialMs: 1700,
  partialMax: 0.72,
  /** К этому моменту экран погас совсем. */
  fullMs: 2400,
  /** Сколько возвращается картинка после отпускания, мс. */
  recoverMs: 380,
} as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export class CableGlitch {
  private heldAt: number | null = null;
  /** Уровень потери в момент отпускания и время отпускания: откуда идёт восстановление. */
  private releasedFrom = 0;
  private releasedAt = -Infinity;

  get held(): boolean {
    return this.heldAt !== null;
  }

  /** Взялись за шлейф. */
  grab(now: number): void {
    if (this.heldAt !== null) return;
    this.heldAt = now;
    this.releasedFrom = 0;
    this.releasedAt = -Infinity;
  }

  /** Отпустили: потеря плавно спадает с достигнутого уровня. */
  release(now: number): void {
    if (this.heldAt === null) return;
    this.releasedFrom = this.level(now);
    this.releasedAt = now;
    this.heldAt = null;
  }

  /** Потеря 0…1 в момент `now`: 0 — всё цело, 1 — экран погас. */
  level(now: number): number {
    if (this.heldAt !== null) {
      const t = now - this.heldAt;
      if (t <= GLITCH.onsetMs) return 0;
      if (t >= GLITCH.fullMs) return 1;
      if (t <= GLITCH.partialMs) {
        const k = clamp01((t - GLITCH.onsetMs) / (GLITCH.partialMs - GLITCH.onsetMs));
        return GLITCH.partialMax * k * k * (3 - 2 * k); // плавное начало и конец
      }
      const k = clamp01((t - GLITCH.partialMs) / (GLITCH.fullMs - GLITCH.partialMs));
      return GLITCH.partialMax + (1 - GLITCH.partialMax) * k;
    }
    const since = now - this.releasedAt;
    if (since >= GLITCH.recoverMs || this.releasedFrom <= 0) return 0;
    return this.releasedFrom * (1 - since / GLITCH.recoverMs);
  }

  /** Идёт ли сейчас сбой (держат или картинка ещё возвращается). */
  active(now: number): boolean {
    return this.level(now) > 0;
  }
}
