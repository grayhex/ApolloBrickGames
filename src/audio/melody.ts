import type { MelodyKind } from './audio';
import { FANFARE, READY, STEP_MS, TUNE, type Note } from './phrases';

/** Нота мелодии на временной шкале дорожки. */
export interface TimedNote {
  /** Начало на шкале дорожки, мс (для циклов — с учётом оборотов). */
  startMs: number;
  note: Note;
  /** Светодиод, который горит на этой ноте: 0 красный, 1 жёлтый, 2 зелёный; -1 — пауза (все погашены). */
  led: number;
}

interface Item {
  startMs: number;
  note: Note;
  /** Порядковый номер звучащей ноты (пауза не считается) — по нему светодиоды бегут красный → жёлтый → зелёный. */
  ordinal: number;
}

/**
 * Дорожка: части идут подряд, последняя может быть зациклена. Светодиоды переключаются на каждой звучащей ноте
 * (в записи — на фанфаре, мелодии и тоне готовности), пауза гасит их. Чистая логика, без звука и часов.
 */
export class Track {
  private readonly items: Item[] = [];
  /** Индекс первой ноты цикла и длина цикла (мс, нот, звучащих нот); `loopCount` = 0 — дорожка конечная. */
  private readonly loopFrom: number;
  private readonly loopCount: number;
  private readonly loopMs: number;
  private readonly loopSounding: number;
  /** Длина одного прохода до цикла (или всей дорожки), мс. */
  readonly headMs: number;

  constructor(parts: readonly { notes: readonly Note[]; loop?: boolean }[]) {
    let at = 0;
    let ordinal = 0;
    let loopFrom = 0;
    let loopCount = 0;
    let loopMs = 0;
    let loopSounding = 0;
    parts.forEach((part, index) => {
      const looped = part.loop === true;
      if (looped && index !== parts.length - 1) throw new Error('Зациклить можно только последнюю часть дорожки.');
      if (looped) loopFrom = this.items.length;
      let sounding = 0;
      let span = 0;
      for (const note of part.notes) {
        const isRest = note.hz.length === 0 && !note.noise;
        this.items.push({ startMs: at, note, ordinal });
        if (!isRest) {
          ordinal += 1;
          sounding += 1;
        }
        at += note.ms;
        span += note.ms;
      }
      if (looped) {
        loopCount = part.notes.length;
        loopMs = span;
        loopSounding = sounding;
      }
    });
    this.loopFrom = loopFrom;
    this.loopCount = loopCount;
    this.loopMs = loopMs;
    this.loopSounding = loopSounding;
    this.headMs = at;
    if (loopCount > 0 && (loopMs <= 0 || loopSounding === 0)) throw new Error('Зацикленная часть должна звучать.');
  }

  get looped(): boolean {
    return this.loopCount > 0;
  }

  /** Длина дорожки, мс; для зацикленной — бесконечность. */
  get durationMs(): number {
    return this.looped ? Number.POSITIVE_INFINITY : this.headMs;
  }

  /** Нота под порядковым номером `index` с учётом циклов; null — дорожка закончилась. */
  at(index: number): TimedNote | null {
    if (index < 0) return null;
    if (index < this.items.length) return this.timed(this.items[index], 0);
    if (!this.looped) return null;
    const local = index - this.loopFrom;
    const cycle = Math.floor(local / this.loopCount);
    return this.timed(this.items[this.loopFrom + (local % this.loopCount)], cycle);
  }

  /** Номер ноты, звучащей в момент `ms` (или ближайшей следующей, если играет пауза); -1 — дорожка закончилась. */
  indexAt(ms: number): number {
    if (ms < 0) return 0;
    const prefix = this.looped ? this.loopFrom : this.items.length;
    const loopStart = this.headMs - this.loopMs; // начало цикла (у конечной дорожки — её конец)
    if (ms < loopStart) return this.search(ms, 0, prefix, 0);
    if (!this.looped) return -1;
    const local = ms - loopStart;
    const cycle = Math.floor(local / this.loopMs);
    const inside = this.search(local - cycle * this.loopMs, this.loopFrom, this.loopFrom + this.loopCount, loopStart);
    return inside + cycle * this.loopCount;
  }

  /** Светодиод на момент `ms`: 0…2 или -1 (пауза, дорожка закончилась). */
  ledAt(ms: number): number {
    const index = this.indexAt(ms);
    return index < 0 ? -1 : (this.at(index)?.led ?? -1);
  }

  /** Первая нота из `items[from, to)`, которая ещё не закончилась к моменту `ms` (`origin` — сдвиг шкалы нот). */
  private search(ms: number, from: number, to: number, origin: number): number {
    for (let i = from; i < to; i++) {
      const item = this.items[i];
      if (item && ms < item.startMs - origin + item.note.ms) return i;
    }
    return to - 1;
  }

  private timed(item: Item | undefined, cycle: number): TimedNote | null {
    if (!item) return null;
    const isRest = item.note.hz.length === 0 && !item.note.noise;
    const ordinal = item.ordinal + cycle * this.loopSounding;
    return { startMs: item.startMs + cycle * this.loopMs, note: item.note, led: isRest ? -1 : ordinal % 3 };
  }
}

const rest = (ms: number): Note => ({ ms, hz: [] });

/** Дорожки мелодии (см. `MelodyKind`). Запись показывает: после фанфары — доля тишины, затем мелодия по кругу. */
export const TRACKS: Readonly<Record<MelodyKind, Track>> = {
  start: new Track([{ notes: FANFARE }, { notes: [rest(STEP_MS)] }, { notes: TUNE, loop: true }]),
  tune: new Track([{ notes: TUNE, loop: true }]),
  ready: new Track([{ notes: READY }]),
};

/**
 * Проигрыватель мелодии: часы (по внешним «стенным» часам, мс), пауза и продолжение, выдача нот на ближайшее окно.
 * Не знает про Web Audio: порт берёт у него ноты и сам ставит их в расписание. Часы идут независимо от звука —
 * при заглушении и до «разблокировки» браузером светодиоды продолжают бежать в такт.
 */
export class MelodyPlayer {
  private track: Track | null = null;
  private kindValue: MelodyKind | null = null;
  /** Позиция на шкале дорожки в момент `anchor` (стенное время), мс. */
  private base = 0;
  private anchor = 0;
  private pausedFlag = false;
  /** Номер следующей ноты, которую ещё не отдавали. */
  private cursor = 0;

  get kind(): MelodyKind | null {
    return this.kindValue;
  }

  get paused(): boolean {
    return this.pausedFlag;
  }

  /** Идёт ли дорожка (не закончилась и не остановлена); пауза считается «идёт». */
  active(now: number): boolean {
    return this.track !== null && this.position(now) < this.track.durationMs;
  }

  start(kind: MelodyKind, now: number): void {
    this.track = TRACKS[kind];
    this.kindValue = kind;
    this.base = 0;
    this.anchor = now;
    this.pausedFlag = false;
    this.cursor = 0;
  }

  stop(): void {
    this.track = null;
    this.kindValue = null;
    this.pausedFlag = false;
  }

  pause(now: number): void {
    if (!this.track || this.pausedFlag) return;
    this.base = this.position(now);
    this.pausedFlag = true;
    this.rewind(now);
  }

  resume(now: number): void {
    if (!this.track || !this.pausedFlag) return;
    this.anchor = now;
    this.pausedFlag = false;
  }

  /**
   * Забыть ноты, выданные, но не прозвучавшие, — после обрыва голосов (пауза, заглушение): ближайшая выдача начнётся
   * с ноты, которая звучит сейчас (её остаток), а не с ещё не наступивших, которые уже были «израсходованы» окном вперёд.
   */
  rewind(now: number): void {
    if (!this.track) return;
    const index = this.track.indexAt(this.position(now));
    if (index >= 0) this.cursor = Math.min(this.cursor, index);
  }

  /** Позиция на шкале дорожки, мс. */
  position(now: number): number {
    return this.pausedFlag ? this.base : this.base + (now - this.anchor);
  }

  /**
   * Сколько мелодия звучит с запуска (паузы не считаются), мс; для остановленного проигрывателя — 0.
   * По нему запись «ремастера» находит «то же место», когда музыку переключают на лету.
   */
  elapsed(now: number): number {
    return this.track ? this.position(now) : 0;
  }

  /** Светодиод: 0…2; -1 — мелодия молчит, на паузе или закончилась. */
  led(now: number): number {
    if (!this.track || this.pausedFlag) return -1;
    return this.track.ledAt(this.position(now));
  }

  /**
   * Ноты, которые звучат или начнутся до `now + horizonMs` и ещё не отдавались. `offsetMs` — когда нота начинается
   * относительно `now` (отрицательное — уже звучит, надо пропустить `-offsetMs` её начала). Закончившиеся ноты пропускаются.
   * На паузе и после конца дорожки — пусто; по концу конечной дорожки проигрыватель выключается сам.
   */
  collect(now: number, horizonMs: number): { offsetMs: number; note: Note; led: number }[] {
    const track = this.track;
    if (!track || this.pausedFlag) return [];
    const position = this.position(now);
    const out: { offsetMs: number; note: Note; led: number }[] = [];
    for (;;) {
      const timed = track.at(this.cursor);
      if (!timed) break; // конечная дорожка прошла целиком
      if (timed.startMs >= position + horizonMs) break;
      this.cursor += 1;
      if (timed.startMs + timed.note.ms <= position) continue; // нота уже отзвучала
      if (timed.note.hz.length > 0 || timed.note.noise) out.push({ offsetMs: timed.startMs - position, note: timed.note, led: timed.led });
    }
    if (!track.looped && position >= track.durationMs) this.stop();
    return out;
  }
}
