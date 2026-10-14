import { describe, expect, it } from 'vitest';
import { NullAudio, type AudioCue, type MelodyKind } from '../../src/audio/audio';
import { SoundDirector } from '../../src/audio/director';
import type { GameEvent, Phase } from '../../src/core/state';

/** Журнал вызовов порта: что, в каком порядке. */
class LogAudio extends NullAudio {
  log: string[] = [];
  override play(cue?: AudioCue): void {
    this.log.push(`play:${cue}`);
  }
  override startMelody(kind: MelodyKind): void {
    this.log.push(`start:${kind}`);
  }
  override pauseMelody(): void {
    this.log.push('pause');
  }
  override resumeMelody(): void {
    this.log.push('resume');
  }
  override stopMelody(): void {
    this.log.push('stop');
  }
  override silence(): void {
    this.log.push('silence');
  }
  override update(): void {
    this.log.push('update');
  }
}

const make = (entryPending = false) => {
  const audio = new LogAudio();
  const state = { entry: entryPending };
  const director = new SoundDirector({
    audio,
    typeOf: (id) => (id === 'b1' ? 'brick' : id === 't1' ? 'target' : null),
    entryPending: () => state.entry,
  });
  const send = (event: Record<string, unknown>): void => director.onEvent({ tick: 1, ...event } as GameEvent);
  const phase = (from: Phase, to: Phase): void => send({ type: 'phaseChanged', from, to });
  const calls = (): string[] => audio.log.filter((entry) => entry !== 'update' && entry !== 'stop');
  return { audio, director, send, phase, calls, state };
};

describe('режиссёр звука', () => {
  it('новая игра: тишина; после старта мелодия (фанфара + круг) начинается на ближайшем кадре', () => {
    const { audio, director, send, phase, calls } = make();
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    expect(calls()).toEqual([]);
    director.frame();
    expect(calls()).toEqual(['start:start']);
    expect(audio.log.at(-1)).toBe('update'); // и порту дали спланировать звук
    director.frame();
    expect(calls()).toEqual(['start:start']); // второй раз не запускается
  });

  it('мелодия ждёт конца сценария входа (герой сам выпрыгивает из ямы), затем стартует', () => {
    const { director, send, phase, calls, state } = make(true);
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    director.frame();
    expect(calls()).toEqual([]);
    state.entry = false;
    director.frame();
    expect(calls()).toEqual(['start:start']);
  });

  it('пауза замораживает мелодию, продолжение запускает дальше; без повторной фанфары', () => {
    const { director, send, phase, calls } = make();
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    phase('playing', 'paused');
    phase('paused', 'playing');
    director.frame();
    expect(calls()).toEqual(['start:start', 'pause', 'resume']);
  });

  it('пауза до окончания сценария входа не запускает мелодию, пока игра на паузе', () => {
    const { director, send, phase, calls, state } = make(true);
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    phase('playing', 'paused');
    state.entry = false;
    director.frame();
    expect(calls()).toEqual(['pause']);
    phase('paused', 'playing');
    director.frame();
    expect(calls()).toEqual(['pause', 'resume', 'start:start']);
  });

  it('гибель: мелодия обрывается и звучит «death»; возрождение — тон готовности; следующий старт — мелодия без фанфары', () => {
    const { director, send, phase, calls } = make();
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    phase('playing', 'dead');
    send({ type: 'death', cause: 'pit', x: 1, y: 1 });
    send({ type: 'levelStarted', levelId: 'a' }); // возрождение: тот же участок
    phase('dead', 'ready');
    expect(calls()).toEqual(['start:start', 'play:death', 'start:ready']);
    phase('ready', 'playing');
    director.frame();
    expect(calls().at(-1)).toBe('start:tune');
  });

  it('игра окончена или пройдена: мелодия смолкает; следующая новая игра снова с фанфары', () => {
    const { director, send, phase, calls } = make();
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    send({ type: 'death', cause: 'pit', x: 1, y: 1 });
    phase('playing', 'dead');
    send({ type: 'gameOver' });
    phase('dead', 'gameOver');
    expect(calls().slice(-1)).toEqual(['play:gameOver']);
    // Новая игра по start из gameOver: сброс состояния и снова фанфара.
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    expect(calls().filter((c) => c.startsWith('start:'))).toEqual(['start:start', 'start:start']);
  });

  it('переход на следующий участок: мелодия начинается с начала без фанфары; рестарт посреди игры — снова с фанфары после старта', () => {
    const { director, send, phase, calls } = make();
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    send({ type: 'levelCompleted', levelId: 'a', next: 'b' });
    send({ type: 'levelStarted', levelId: 'b' });
    director.frame();
    expect(calls().filter((c) => c.startsWith('start:') || c.startsWith('play:'))).toEqual(['start:start', 'start:tune']); // эффекта у перехода нет
    // Рестарт: ядро шлёт levelStarted без phaseChanged, фаза возвращается в ready.
    send({ type: 'levelStarted', levelId: 'a' });
    director.frame();
    expect(calls().filter((c) => c.startsWith('start:'))).toEqual(['start:start', 'start:tune']); // в ready тишина
    phase('ready', 'playing');
    director.frame();
    expect(calls().filter((c) => c.startsWith('start:'))).toEqual(['start:start', 'start:tune', 'start:start']);
  });

  it('конец игры: мелодия смолкает и звучит отдельный сигнал', () => {
    const { director, send, phase, calls } = make();
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    send({ type: 'levelCompleted', levelId: 'a', next: null });
    phase('playing', 'completed');
    send({ type: 'gameCompleted' });
    expect(calls()).toEqual(['start:start', 'play:levelCompleted']);
  });

  it('эффекты по событиям: прыжок, удар головой, крошение блока на третьем ударе, попадание в мишень', () => {
    const { send, calls } = make();
    send({ type: 'jump', x: 1, y: 1 });
    send({ type: 'bump', x: 1, y: 0 });
    send({ type: 'hit', x: 1, y: 0, targetId: 'b1', destroyed: false });
    send({ type: 'hit', x: 1, y: 0, targetId: 'b1', destroyed: true });
    send({ type: 'hit', x: 3, y: 3, targetId: 't1', destroyed: true });
    expect(calls()).toEqual(['play:jump', 'play:bump', 'play:crumble', 'play:hit']);
  });

  it('шаги построения комнаты: щелчок на каждую новую клетку, повтор клетки не звучит, после конца интро — заново', () => {
    const { director, calls } = make();
    director.introStep('12,5');
    director.introStep('12,5');
    director.introStep('11,5');
    director.introStep(null);
    director.introStep('12,5');
    expect(calls()).toEqual(['play:introStep', 'play:introStep', 'play:introStep']);
  });

  it('явный рестарт (reset) после гибели: гибель обрывается, следующий запуск — снова с фанфары, а не как возрождение', () => {
    const { audio, director, send, phase, calls } = make();
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    phase('playing', 'dead');
    send({ type: 'death', cause: 'pit', x: 1, y: 1 });
    director.reset(); // игрок нажал «Рестарт», пока звучала гибель
    expect(audio.log).toContain('silence');
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.frame();
    expect(calls().filter((c) => c.startsWith('start:'))).toEqual(['start:start', 'start:start']);
  });

  it('reset глушит всё и сбрасывает ожидание', () => {
    const { director, send, phase, calls, state } = make(true);
    send({ type: 'levelStarted', levelId: 'a' });
    phase('ready', 'playing');
    director.reset();
    state.entry = false;
    director.frame();
    expect(calls()).toEqual(['silence']);
  });
});
