import { describe, expect, it } from 'vitest';
import { cueForEvent, type AudioCue } from '../../src/audio/audio';
import {
  CUE_BEEPS,
  CUE_PRIORITY,
  cueDurationMs,
  scheduleBeeps,
  WebAudioPort,
  type AudioContextLike,
  type GainLike,
  type OscillatorLike,
} from '../../src/audio/beeper';

const CUES = Object.keys(CUE_BEEPS) as AudioCue[];

class FakeContext implements AudioContextLike {
  currentTime = 10;
  state = 'suspended';
  destination = { name: 'destination' };
  oscillators: (OscillatorLike & { started: number[]; stopped: (number | undefined)[]; connected: unknown[] })[] = [];
  resumed = 0;
  gains: GainLike[] = [];
  createOscillator() {
    const osc = {
      type: 'sine',
      frequency: { value: 0 },
      started: [] as number[],
      stopped: [] as (number | undefined)[],
      connected: [] as unknown[],
      connect(destination: unknown) {
        this.connected.push(destination);
      },
      start(when?: number) {
        this.started.push(when ?? 0);
      },
      stop(when?: number) {
        this.stopped.push(when);
      },
    };
    this.oscillators.push(osc);
    return osc;
  }
  createGain(): GainLike {
    const gain = { gain: { value: 1 }, connect: () => {} };
    this.gains.push(gain);
    return gain;
  }
  async resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
  }
}

describe('1-битный звук: сигналы', () => {
  it('у каждой реплики есть корректный сигнал: конечные частоты, положительная длительность, не длиннее секунды', () => {
    for (const cue of CUES) {
      const beeps = CUE_BEEPS[cue];
      expect(beeps.length, cue).toBeGreaterThan(0);
      expect(beeps.some((b) => b.freq > 0), cue).toBe(true);
      for (const beep of beeps) {
        expect(Number.isFinite(beep.freq) && beep.freq >= 0 && beep.freq <= 4000, cue).toBe(true);
        expect(beep.ms, cue).toBeGreaterThan(0);
      }
      expect(cueDurationMs(cue), cue).toBeLessThanOrEqual(1000);
      expect(CUE_PRIORITY[cue], cue).toBeGreaterThanOrEqual(0);
    }
  });

  it('расписание непрерывно, паузы не звучат', () => {
    const plan = scheduleBeeps('hit', 5);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ freq: 660, start: 5 });
    expect(plan[0]?.end).toBeCloseTo(5.045, 9);
    expect(plan[1]).toMatchObject({ freq: 660 });
    expect(plan[1]?.start).toBeCloseTo(5.065, 9); // между сигналами пауза 20 мс
    expect(plan[1]?.end).toBeCloseTo(5.125, 9);
    const jump = scheduleBeeps('jump', 0);
    expect(jump[0]?.end).toBe(jump[1]?.start);
  });

  it('события ядра → реплики: старт игры, прыжок, смерть; прочее без звука', () => {
    expect(cueForEvent({ type: 'phaseChanged', from: 'ready', to: 'playing', tick: 1 })).toBe('start');
    expect(cueForEvent({ type: 'phaseChanged', from: 'paused', to: 'playing', tick: 1 })).toBeNull();
    expect(cueForEvent({ type: 'jump', x: 1, y: 1, tick: 1 })).toBe('jump');
    expect(cueForEvent({ type: 'levelStarted', levelId: 'a', tick: 1 })).toBeNull();
  });
});

describe('WebAudioPort', () => {
  const make = (muted = false) => {
    const context = new FakeContext();
    const port = new WebAudioPort({ muted, factory: () => context });
    return { context, port };
  };

  it('играет прямоугольной волной через один усилитель фиксированной громкости', () => {
    const { context, port } = make();
    port.play('jump');
    expect(context.resumed).toBe(1);
    expect(context.gains).toHaveLength(1);
    expect(context.gains[0]?.gain.value).toBeCloseTo(0.07);
    expect(context.oscillators.map((o) => [o.type, o.frequency.value])).toEqual([['square', 880], ['square', 1175]]);
    expect(context.oscillators.every((o) => o.connected[0] === context.gains[0])).toBe(true);
    expect(context.oscillators[0]?.started).toEqual([10]);
    expect(context.oscillators[1]?.started[0]).toBeCloseTo(10.04);
  });

  it('mute молчит и ничего не создаёт; включение звука снова разрешает сигналы', () => {
    const { context, port } = make(true);
    port.play('jump');
    expect(context.oscillators).toHaveLength(0);
    port.setMuted(false);
    port.play('shot');
    expect(context.oscillators.length).toBeGreaterThan(0);
    const count = context.oscillators.length;
    port.setMuted(true);
    port.play('shot');
    expect(context.oscillators).toHaveLength(count);
  });

  it('один канал: новый сигнал обрывает прежний, но мелкий не перебивает важный', () => {
    const { context, port } = make();
    port.play('jump');
    const first = context.oscillators.slice();
    context.currentTime = 10.01;
    port.play('shot');
    expect(first.every((o) => o.stopped.length > 1)).toBe(true); // прежний сигнал оборван
    const afterShot = context.oscillators.length;

    context.currentTime = 20;
    port.play('death');
    const afterDeath = context.oscillators.length;
    context.currentTime = 20.05;
    port.play('land'); // низкий приоритет внутри звучащего «death»
    expect(context.oscillators).toHaveLength(afterDeath);
    context.currentTime = 21;
    port.play('land'); // death уже закончился
    expect(context.oscillators.length).toBeGreaterThan(afterDeath);
    expect(afterShot).toBeGreaterThan(first.length);
  });

  it('без Web Audio API или при ошибке создания контекста — тишина без исключений', () => {
    const none = new WebAudioPort({ factory: () => null });
    expect(() => {
      none.unlock();
      none.play('death');
    }).not.toThrow();
    const broken = new WebAudioPort({
      factory: () => {
        throw new Error('нет звука');
      },
    });
    expect(() => broken.play('jump')).not.toThrow();
  });

  it('unlock будит приостановленный контекст по жесту пользователя', () => {
    const { context, port } = make();
    port.unlock();
    expect(context.resumed).toBe(1);
    port.unlock();
    expect(context.resumed).toBe(1); // уже работает
  });
});
