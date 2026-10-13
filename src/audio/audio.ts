import type { GameEvent } from '../core/state';

/** Звуковые «реплики» движка. Оригинальные звуки пока не реконструированы. */
export type AudioCue = 'shot' | 'hit' | 'blocked' | 'jump' | 'land' | 'death' | 'levelCompleted' | 'gameOver';

/** Порт аудио: ядро событий не знает, чем и как воспроизводится звук. */
export interface AudioPort {
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  play(cue: AudioCue): void;
}

/** Реализация по умолчанию: ничего не воспроизводит (no-op), но помнит mute. */
export class NullAudio implements AudioPort {
  muted = true;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  play(): void {
    // Звука нет: поведение оригинала и сами звуки ещё не подтверждены.
  }
}

/** Событие ядра → реплика (или null, если звука не требуется). */
export function cueForEvent(event: GameEvent): AudioCue | null {
  switch (event.type) {
    case 'shot':
      return 'shot';
    case 'hit':
      return 'hit';
    case 'projectileBlocked':
      return 'blocked';
    case 'jump':
      return 'jump';
    case 'land':
      return 'land';
    case 'death':
      return 'death';
    case 'levelCompleted':
      return 'levelCompleted';
    case 'gameOver':
      return 'gameOver';
    default:
      return null;
  }
}
