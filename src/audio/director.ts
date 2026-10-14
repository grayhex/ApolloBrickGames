import type { GameEvent, Phase } from '../core/state';
import { cueForEvent, type AudioPort, type MelodyKind } from './audio';

export interface DirectorOptions {
  audio: AudioPort;
  /** Тип объекта по id в текущем участке (для «крошения» блока и «попадания» в мишень); неизвестный — null. */
  typeOf?(objectId: string): string | null;
  /**
   * Идёт ли сценарий входа (герой сам выпрыгивает из ямы): мелодия начинается по его окончании, как в записи
   * (фанфара звучит, когда игрок получает управление). Без сценария мелодия стартует вместе с игрой.
   */
  entryPending?(phase: Phase): boolean;
}

/**
 * Связка «события и фазы движка → звук». Ядро ничего не знает о звуке: оно присылает события, режиссёр решает,
 * какой эффект сыграть и когда запускать, ставить на паузу и останавливать мелодию. Сюжет по записи:
 * построение комнаты — шаги-щелчки; игра началась, сценарий входа закончился — фанфара и мелодия по кругу;
 * пауза — мелодия замирает; гибель — мелодия обрывается, грохот и джингл; возрождение — тон готовности,
 * после старта — мелодия уже без фанфары; игра окончена или пройдена — тишина.
 */
export class SoundDirector {
  private readonly audio: AudioPort;
  private readonly options: DirectorOptions;
  private phase: Phase = 'ready';
  /** Мелодия, которая ждёт конца сценария входа. */
  private waiting: Extract<MelodyKind, 'start' | 'tune'> | null = null;
  /** Герой погиб и ещё не начал заново: следующий запуск — без фанфары. */
  private afterDeath = false;
  /** Прошли участок и идёт переход на следующий: событие `levelStarted` — не новая игра. */
  private sectionChange = false;
  private introCell: string | null = null;

  constructor(options: DirectorOptions) {
    this.audio = options.audio;
    this.options = options;
  }

  /** Событие ядра (в порядке прихода). */
  onEvent(event: GameEvent): void {
    switch (event.type) {
      case 'levelStarted':
        // Новая игра (не переход на следующий участок и не возрождение после гибели): всё с чистого листа.
        if (this.sectionChange) {
          // Следующий участок: в записи мелодия смолкает со сменой экрана и начинается с начала, без фанфары.
          this.sectionChange = false;
          this.audio.startMelody('tune');
        } else if (!this.afterDeath) {
          this.clear();
          this.phase = 'ready';
        }
        break;
      case 'phaseChanged':
        this.onPhase(event.from, event.to);
        break;
      case 'death':
        this.waiting = null;
        this.afterDeath = true;
        this.audio.stopMelody();
        break;
      case 'gameOver':
      case 'gameCompleted':
        this.clear();
        break;
      case 'levelCompleted':
        if (event.next === null) this.audio.stopMelody(); // конец игры: мелодия смолкает, звучит только эффект
        else this.sectionChange = true; // мелодия продолжается через переход
        break;
      default:
        break;
    }
    const cue = cueForEvent(event, this.options.typeOf);
    if (cue) this.audio.play(cue);
  }

  private onPhase(from: Phase, to: Phase): void {
    this.phase = to;
    switch (to) {
      case 'playing':
        if (from === 'paused') {
          this.audio.resumeMelody();
        } else {
          this.waiting = this.afterDeath ? 'tune' : 'start';
          this.afterDeath = false;
        }
        break;
      case 'paused':
        this.audio.pauseMelody();
        break;
      case 'ready':
        // Возрождение после гибели: тон готовности (красный → жёлтый → зелёный). Новая игра — без звука.
        if (from === 'dead') this.audio.startMelody('ready');
        break;
      case 'gameOver':
      case 'completed':
        this.clear();
        break;
      default:
        break;
    }
  }

  /**
   * Шаг построения комнаты (интро): клетка маршрута героя, `null` — шагов нет. Щелчок на каждую новую клетку.
   * Вызывается каждый кадр с тем, что показывает эффект интро.
   */
  introStep(cell: string | null): void {
    if (cell === this.introCell) return;
    this.introCell = cell;
    if (cell !== null) this.audio.play('introStep');
  }

  /** Раз в кадр: запустить мелодию, когда игрок получил управление, и дать порту спланировать звук. */
  frame(): void {
    if (this.waiting && this.phase === 'playing' && !(this.options.entryPending?.(this.phase) ?? false)) {
      this.audio.startMelody(this.waiting);
      this.waiting = null;
    }
    this.audio.update();
  }

  /** Новая игра, питание, смена уровня: тишина, флаги сброшены. */
  reset(): void {
    this.audio.silence();
    this.clear();
    this.phase = 'ready';
    this.introCell = null;
  }

  private clear(): void {
    this.waiting = null;
    this.afterDeath = false;
    this.sectionChange = false;
    this.audio.stopMelody();
  }
}
