import type { GameEvent } from '../core/state';

/**
 * Эффекты (одиночные звуки поверх мелодии). Ноты и тайминги — phrases.ts; источник — запись игрушки со звуком
 * (docs/video-observations.md §8). `confirm`, `hit`, `blocked`, `levelCompleted`, `gameOver` в записи не встретились — условные.
 */
export type AudioCue =
  | 'introStep'
  | 'jump'
  | 'bump'
  | 'land'
  | 'crumble'
  | 'shot'
  | 'death'
  | 'powerOff'
  | 'confirm'
  | 'hit'
  | 'blocked'
  | 'levelCompleted'
  | 'gameOver';

/**
 * Мелодия — «фоновый» слой, который не прерывается эффектами:
 * `start` — фанфара запуска, доля тишины и зацикленная мелодия; `tune` — только мелодия (после гибели);
 * `ready` — тон готовности после гибели (светодиоды красный → жёлтый → зелёный).
 */
export type MelodyKind = 'start' | 'tune' | 'ready';

/** Порт аудио: ядро событий не знает, чем и как воспроизводится звук. */
export interface AudioPort {
  readonly muted: boolean;
  /** Громкость 0…1 (ползунок страницы). Заглушение — отдельно, `setMuted`. */
  readonly volume: number;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  /** Эффект: один канал, более слабый не перебивает звучащий сильный. */
  play(cue: AudioCue): void;
  /** Запустить мелодию с начала (прежняя обрывается). Часы идут и при заглушённом звуке — светодиоды бегут в такт. */
  startMelody(kind: MelodyKind): void;
  pauseMelody(): void;
  resumeMelody(): void;
  stopMelody(): void;
  /** Остановить всё: мелодию и эффекты. */
  silence(): void;
  /** Раз в кадр: планирует звук на ближайшие ~0,3 с и двигает часы мелодии. */
  update(): void;
  /** Какой светодиод звучит сейчас в такт мелодии: 0 красный, 1 жёлтый, 2 зелёный, -1 — ни один (мелодия молчит или на паузе). */
  ledBeat(): number;
  /** Играет ли мелодия (не на паузе). */
  readonly melodyKind: MelodyKind | null;
}

/** Реализация по умолчанию: ничего не воспроизводит (no-op), но помнит mute и громкость. */
export class NullAudio implements AudioPort {
  muted = true;
  volume = 0.25;
  melodyKind: MelodyKind | null = null;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setVolume(volume: number): void {
    this.volume = volume;
  }

  play(): void {
    // Звука нет.
  }

  startMelody(kind: MelodyKind): void {
    this.melodyKind = kind;
  }

  pauseMelody(): void {
    // Мелодии нет.
  }

  resumeMelody(): void {
    // Мелодии нет.
  }

  stopMelody(): void {
    this.melodyKind = null;
  }

  silence(): void {
    this.melodyKind = null;
  }

  update(): void {
    // Планировать нечего.
  }

  ledBeat(): number {
    return -1;
  }
}

/**
 * Событие ядра → эффект (или null, если звука не требуется). Мелодией управляет оболочка (app.ts) по фазам игры.
 * `typeOf(id)` — тип объекта по id: голова героя разрушила блок («крошение») или выстрел попал в мишень («попадание»).
 */
export function cueForEvent(event: GameEvent, typeOf: (objectId: string) => string | null = () => null): AudioCue | null {
  switch (event.type) {
    case 'shot':
      return 'shot';
    case 'hit':
      if (typeOf(event.targetId) === 'brick') return event.destroyed ? 'crumble' : null; // удар головой уже озвучен как bump
      return 'hit';
    case 'projectileBlocked':
      return 'blocked';
    case 'jump':
      return 'jump';
    case 'bump':
      return 'bump';
    case 'land':
      return 'land';
    case 'death':
      return 'death';
    case 'levelCompleted':
      // Переход на следующий участок в записи беззвучен (мелодия идёт до смены экрана); отдельный сигнал — только в конце игры.
      return event.next === null ? 'levelCompleted' : null;
    case 'gameOver':
      return 'gameOver';
    default:
      return null;
  }
}
