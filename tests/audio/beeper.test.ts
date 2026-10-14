import { describe, expect, it } from 'vitest';
import { cueForEvent, NullAudio, type AudioCue } from '../../src/audio/audio';
import {
  LOOKAHEAD_MS,
  MASTER_GAIN,
  MELODY_GAIN,
  WebAudioPort,
  type AudioContextLike,
  type AudioParamLike,
  type GainLike,
  type OscillatorLike,
} from '../../src/audio/beeper';
import { CUES, cueDurationMs, MICRO_MS, STEP_MS } from '../../src/audio/phrases';

const NAMES = Object.keys(CUES) as AudioCue[];

interface FakeOscillator extends OscillatorLike {
  started: number[];
  stopped: (number | undefined)[];
  connected: unknown[];
  steps: [number, number][];
  ramps: [number, number][];
}

class FakeContext implements AudioContextLike {
  currentTime = 10;
  state = 'suspended';
  destination = { name: 'destination' };
  oscillators: FakeOscillator[] = [];
  resumed = 0;
  gains: (GainLike & { connectedTo: unknown[] })[] = [];
  createOscillator(): FakeOscillator {
    const steps: [number, number][] = [];
    const ramps: [number, number][] = [];
    const frequency: AudioParamLike = {
      value: 0,
      setValueAtTime: (value, time) => void steps.push([value, time]),
      exponentialRampToValueAtTime: (value, time) => void ramps.push([value, time]),
    };
    const osc: FakeOscillator = {
      type: 'sine',
      frequency,
      started: [],
      stopped: [],
      connected: [],
      steps,
      ramps,
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
  createGain() {
    const gain = {
      gain: { value: 1 },
      connectedTo: [] as unknown[],
      connect(destination: unknown) {
        this.connectedTo.push(destination);
      },
    };
    this.gains.push(gain);
    return gain;
  }
  async resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
  }
}

/** Контекст, уже «разбуженный» жестом: состояние running. */
const running = (): FakeContext => {
  const context = new FakeContext();
  context.state = 'running';
  return context;
};

describe('эффекты: данные', () => {
  it('у каждого эффекта корректные ноты: конечные частоты, положительная длина, не длиннее 3 секунд', () => {
    for (const cue of NAMES) {
      const def = CUES[cue];
      expect(def.notes.length, cue).toBeGreaterThan(0);
      expect(def.priority, cue).toBeGreaterThanOrEqual(0);
      expect(def.notes.some((n) => n.hz.length > 0 || n.noise), cue).toBe(true);
      for (const note of def.notes) {
        expect(note.ms, cue).toBeGreaterThan(0);
        expect(note.hz.length, cue).toBeLessThanOrEqual(2);
        for (const hz of note.hz) expect(Number.isFinite(hz) && hz > 0 && hz < 6000, cue).toBe(true);
        if (note.glideTo !== undefined) expect(note.glideTo, cue).toBeGreaterThan(0);
      }
      expect(cueDurationMs(cue), cue).toBeLessThanOrEqual(3000);
    }
  });

  it('измеренные длительности из записи: прыжок — 7 коротких нот; смерть ≈ 2,4 с; крошение ≈ 1,8 с', () => {
    expect(CUES.jump.notes).toHaveLength(7);
    expect(cueDurationMs('jump')).toBeCloseTo(7 * MICRO_MS, 6);
    expect(cueDurationMs('death')).toBeGreaterThan(2300);
    expect(cueDurationMs('death')).toBeLessThan(2600);
    expect(cueDurationMs('crumble')).toBeGreaterThan(1700);
    expect(cueDurationMs('crumble')).toBeLessThan(2000);
    expect(cueDurationMs('introStep')).toBeLessThan(149); // шаг построения короче периода шагов
  });
});

describe('события ядра → эффекты', () => {
  const at = { x: 1, y: 1, tick: 1 };

  it('основные события озвучены; фазы и старт участка без эффекта (мелодией управляет оболочка)', () => {
    expect(cueForEvent({ type: 'jump', ...at })).toBe('jump');
    expect(cueForEvent({ type: 'bump', ...at })).toBe('bump');
    expect(cueForEvent({ type: 'land', ...at })).toBe('land');
    expect(cueForEvent({ type: 'shot', dir: 1, ...at })).toBe('shot');
    expect(cueForEvent({ type: 'death', cause: 'fall', ...at } as never)).toBe('death');
    expect(cueForEvent({ type: 'gameOver', tick: 1 })).toBe('gameOver');
    expect(cueForEvent({ type: 'secretLives', lives: 200, tick: 1 })).toBe('secret'); // секрет с 200 жизнями — условный сигнал
    expect(cueForEvent({ type: 'levelCompleted', levelId: 'a', next: 'b', tick: 1 })).toBeNull(); // переход на следующий участок беззвучен
    expect(cueForEvent({ type: 'levelCompleted', levelId: 'a', next: null, tick: 1 })).toBe('levelCompleted');
    expect(cueForEvent({ type: 'phaseChanged', from: 'ready', to: 'playing', tick: 1 })).toBeNull();
    expect(cueForEvent({ type: 'levelStarted', levelId: 'a', tick: 1 })).toBeNull();
  });

  it('удар головой по блоку: третий удар — крошение вместо ещё одного свипа; выстрел по мишени — «попадание»', () => {
    const typeOf = (id: string): string | null => (id === 'b1' ? 'brick' : id === 't1' ? 'target' : null);
    expect(cueForEvent({ type: 'hit', targetId: 'b1', destroyed: false, ...at }, typeOf)).toBeNull();
    expect(cueForEvent({ type: 'hit', targetId: 'b1', destroyed: true, ...at }, typeOf)).toBe('crumble');
    expect(cueForEvent({ type: 'hit', targetId: 't1', destroyed: false, ...at }, typeOf)).toBe('hit');
    expect(cueForEvent({ type: 'hit', targetId: 't1', destroyed: true, ...at }, typeOf)).toBe('hit');
  });
});

describe('WebAudioPort: эффекты', () => {
  const make = (options: { muted?: boolean; volume?: number } = {}) => {
    const context = running();
    let wall = 0;
    const port = new WebAudioPort({ ...options, factory: () => context, clock: () => wall });
    port.unlock(); // жест пользователя: контекст создан и работает
    return {
      context,
      port,
      advance(ms: number) {
        wall += ms;
        context.currentTime += ms / 1000;
      },
    };
  };

  it('играет прямоугольной волной через общий усилитель: громкость ползунка × MASTER_GAIN', () => {
    const { context, port } = make();
    port.play('jump');
    const master = context.gains[0];
    expect(master?.gain.value).toBeCloseTo(0.25 * MASTER_GAIN);
    expect(master?.connectedTo[0]).toBe(context.destination);
    expect(context.oscillators).toHaveLength(7);
    expect(context.oscillators.every((o) => o.type === 'square')).toBe(true);
    expect(context.oscillators.map((o) => Math.round(o.frequency.value))).toEqual(
      [0, 2, 4, 5, 7, 5, 4].map((st) => Math.round(762 * 2 ** (st / 12))),
    );
    expect(context.oscillators[0]?.started).toEqual([10]);
    expect(context.oscillators[1]?.started[0]).toBeCloseTo(10 + MICRO_MS / 1000, 9);
  });

  it('setVolume меняет общий уровень на лету и ограничивает 0…1', () => {
    const { context, port } = make();
    port.play('shot');
    const master = context.gains[0];
    port.setVolume(1);
    expect(master?.gain.value).toBeCloseTo(MASTER_GAIN);
    port.setVolume(0);
    expect(master?.gain.value).toBe(0);
    port.setVolume(7);
    expect(port.volume).toBe(1);
    port.setVolume(-3);
    expect(port.volume).toBe(0);
    port.setVolume(Number.NaN);
    expect(port.volume).toBe(0.25); // по умолчанию 25 %
  });

  it('выстрел и свипы — экспоненциальное скольжение частоты первого голоса; шум — быстро меняющиеся частоты', () => {
    const { context, port } = make();
    port.play('shot');
    const shot = context.oscillators[0];
    expect(shot?.frequency.value).toBe(3800);
    expect(shot?.ramps).toHaveLength(1);
    expect(shot?.ramps[0]?.[0]).toBe(1800);
    expect(shot?.ramps[0]?.[1]).toBeCloseTo(10.032, 6);

    context.currentTime = 20;
    port.play('crumble');
    const bursts = context.oscillators.slice(1);
    expect(bursts).toHaveLength(10);
    const first = bursts[0];
    expect((first?.steps.length ?? 0)).toBeGreaterThan(20); // 115 мс по 4 мс
    const freqs = new Set(first?.steps.map(([hz]) => Math.round(hz)));
    expect(freqs.size).toBeGreaterThan(10);
    for (const [hz] of first?.steps ?? []) expect(hz >= 500 && hz <= 5000).toBe(true);
    // Громкость «крошения» ниже — через свой усилитель.
    expect(context.gains.some((g) => g.gain.value === 0.6)).toBe(true);
  });

  it('шум воспроизводим: одинаковая последовательность для одинаковых портов', () => {
    const run = () => {
      const { context, port } = make();
      port.play('powerOff');
      return context.oscillators[0]?.frequency.value;
    };
    expect(run()).toBe(run());
  });

  it('задержка эффекта сдвигает первый звук от события (bump: чирик через 100 мс)', () => {
    const { context, port } = make();
    port.play('bump');
    expect(context.oscillators[0]?.started[0]).toBeCloseTo(10.1, 9);
    expect(context.oscillators[0]?.ramps[0]?.[0]).toBe(2800);
  });

  it('mute молчит и ничего не создаёт; включение звука снова разрешает эффекты', () => {
    const { context, port } = make({ muted: true });
    port.play('jump');
    expect(context.oscillators).toHaveLength(0);
    port.setMuted(false);
    port.play('shot');
    const count = context.oscillators.length;
    expect(count).toBeGreaterThan(0);
    port.setMuted(true);
    port.play('shot');
    expect(context.oscillators).toHaveLength(count);
  });

  it('один канал: новый эффект обрывает прежний, а слабый не перебивает важный', () => {
    const { context, port } = make();
    port.play('jump');
    const first = context.oscillators.slice();
    context.currentTime = 10.01;
    port.play('shot'); // слабее jump (1 < 2): не перебивает
    expect(context.oscillators).toHaveLength(first.length);
    context.currentTime = 10.5;
    port.play('shot');
    expect(context.oscillators.length).toBeGreaterThan(first.length);

    context.currentTime = 20;
    port.play('death');
    const afterDeath = context.oscillators.length;
    context.currentTime = 20.5;
    port.play('land'); // слабее звучащего «death»
    expect(context.oscillators).toHaveLength(afterDeath);
    context.currentTime = 25;
    port.play('land'); // death уже закончился
    expect(context.oscillators.length).toBeGreaterThan(afterDeath);
  });

  it('равный или более высокий приоритет обрывает звучащий: у прежних голосов появляется stop', () => {
    const { context, port } = make();
    port.play('jump');
    const jump = context.oscillators.slice();
    context.currentTime = 10.02;
    port.play('bump');
    expect(jump.every((o) => o.stopped.length >= 2)).toBe(true);
  });

  it('без Web Audio API или при ошибке создания контекста — тишина без исключений', () => {
    const none = new WebAudioPort({ factory: () => null });
    expect(() => {
      none.unlock();
      none.play('death');
      none.startMelody('start');
      none.update();
      none.silence();
    }).not.toThrow();
    const broken = new WebAudioPort({
      factory: () => {
        throw new Error('нет звука');
      },
    });
    expect(() => broken.play('jump')).not.toThrow();
  });

  it('без жеста пользователя эффекты отбрасываются, контекст не создаётся: интро при открытии страницы не копится до первого нажатия', () => {
    let created = 0;
    const context = new FakeContext();
    context.resume = async () => {}; // браузер без жеста контекст не будит: он остаётся приостановленным
    let wall = 0;
    const port = new WebAudioPort({
      factory: () => {
        created += 1;
        return context;
      },
      clock: () => wall,
    });
    port.play('introStep');
    port.play('introStep');
    expect(created).toBe(0);
    expect(context.oscillators).toHaveLength(0);
    // Жест: пока браузер будит контекст (он ещё приостановлен), эффект подтверждения ставится — по нажатию это его же звук.
    port.unlock();
    expect(created).toBe(1);
    port.play('confirm');
    expect(context.oscillators.length).toBeGreaterThan(0);
    // Контекст так и остался приостановленным, жест давно позади: эффекты не накапливаются в замороженном времени.
    const count = context.oscillators.length;
    context.state = 'suspended';
    wall += 2000;
    port.play('jump');
    expect(context.oscillators).toHaveLength(count);
    // Контекст проснулся — эффекты снова звучат.
    context.state = 'running';
    port.play('jump');
    expect(context.oscillators.length).toBeGreaterThan(count);
  });

  it('unlock будит приостановленный контекст по жесту пользователя', () => {
    const context = new FakeContext();
    const port = new WebAudioPort({ factory: () => context, clock: () => 0 });
    port.unlock();
    expect(context.resumed).toBe(1);
    port.unlock();
    expect(context.resumed).toBe(1); // уже работает
  });
});

describe('WebAudioPort: мелодия', () => {
  const make = (options: { muted?: boolean } = {}) => {
    const context = running();
    let wall = 1000;
    const port = new WebAudioPort({ ...options, factory: () => context, clock: () => wall });
    port.unlock(); // жест пользователя: контекст создан и работает
    const advance = (ms: number): void => {
      wall += ms;
      context.currentTime += ms / 1000;
      port.update();
    };
    return { context, port, advance };
  };

  it('мелодия ставится в расписание на ~0,3 с вперёд и добавляется по мере хода времени', () => {
    const { context, port, advance } = make();
    port.startMelody('tune');
    expect(context.oscillators).toHaveLength(0); // пока не было update
    port.update();
    const first = context.oscillators.length;
    expect(first).toBeGreaterThan(0);
    for (const osc of context.oscillators) expect(osc.started[0]).toBeLessThanOrEqual(10 + LOOKAHEAD_MS / 1000 + 1e-9);
    advance(250);
    expect(context.oscillators.length).toBeGreaterThan(first);
    const count = context.oscillators.length;
    port.update(); // то же время: ничего нового
    expect(context.oscillators).toHaveLength(count);
  });

  it('аккорд = два голоса через усилитель на половину уровня; мелодия идёт через свою шину', () => {
    const { context, port } = make();
    port.startMelody('tune');
    port.update();
    expect(context.gains.some((g) => g.gain.value === MELODY_GAIN)).toBe(true); // шина мелодии
    const half = context.gains.filter((g) => g.gain.value === 0.5 && g.connectedTo.length === 1);
    expect(half.length).toBeGreaterThan(0); // «до + ми»
    expect(context.oscillators.slice(0, 2).map((o) => Math.round(o.frequency.value))).toEqual([762, Math.round(762 * 2 ** (4 / 12))]);
  });

  it('светодиоды бегут красный → жёлтый → зелёный на нотах фанфары', () => {
    const { port, advance } = make();
    port.startMelody('start');
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(port.ledBeat());
      advance(MICRO_MS * 2);
    }
    expect(seen).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('светодиоды учитывают задержку вывода звука: горят тогда, когда нота слышна', () => {
    const { context, port, advance } = make();
    (context as { outputLatency?: number }).outputLatency = 0.1; // 100 мс до динамика
    port.startMelody('start');
    expect(port.ledBeat()).toBe(0); // нулевая позиция: нота уже звучит у динамика не раньше, чем через 100 мс, а светодиод — первая нота
    advance(MICRO_MS * 2 + 10); // 64 мс: по часам идёт вторая нота, а слышна ещё первая
    expect(port.ledBeat()).toBe(0);
    advance(100);
    expect(port.ledBeat()).not.toBe(0);
  });

  it('мелодия не прерывается эффектами: оба слоя звучат одновременно', () => {
    const { context, port } = make();
    port.startMelody('tune');
    port.update();
    const melody = context.oscillators.slice();
    port.play('jump');
    expect(melody.every((o) => o.stopped.length === 1)).toBe(true); // только плановая остановка по концу ноты
    expect(context.oscillators.length).toBe(melody.length + 7);
  });

  it('пауза обрывает голоса и замораживает часы; продолжение идёт с того же места', () => {
    const { context, port, advance } = make();
    port.startMelody('tune');
    port.update();
    advance(100);
    const before = context.oscillators.length;
    port.pauseMelody();
    expect(port.ledBeat()).toBe(-1);
    advance(5000); // время идёт, мелодия — нет
    expect(context.oscillators).toHaveLength(before);
    port.resumeMelody();
    port.update();
    expect(context.oscillators.length).toBeGreaterThan(before);
    expect(port.ledBeat()).toBeGreaterThanOrEqual(0);
  });

  it('заглушённый звук не создаёт голосов, но светодиоды продолжают бежать; при включении мелодия подхватывается с текущего места', () => {
    const { context, port, advance } = make({ muted: true });
    port.startMelody('start');
    port.update();
    expect(context.oscillators).toHaveLength(0);
    expect(port.ledBeat()).toBe(0);
    advance(5000);
    expect(context.oscillators).toHaveLength(0);
    expect(port.ledBeat()).toBeGreaterThanOrEqual(-1);
    port.setMuted(false);
    port.update();
    expect(context.oscillators.length).toBeGreaterThan(0);
    // Нота, которая звучала в момент включения, начата с «середины»: её голос стартует сейчас, а не в прошлом.
    for (const osc of context.oscillators) expect(osc.started[0]).toBeGreaterThanOrEqual(context.currentTime - 1e-9);
  });

  it('не планирует, пока браузер не «разбудил» контекст; затем начинает с текущей позиции', () => {
    const context = new FakeContext();
    let wall = 0;
    const port = new WebAudioPort({ factory: () => context, clock: () => wall });
    port.unlock();
    context.state = 'suspended'; // жеста ещё не было
    port.startMelody('tune');
    wall += 400;
    port.update();
    expect(context.oscillators).toHaveLength(0);
    context.state = 'running';
    wall += 4000;
    context.currentTime += 4;
    port.update();
    expect(context.oscillators.length).toBeGreaterThan(0);
    for (const osc of context.oscillators) expect(osc.started[0]).toBeGreaterThanOrEqual(context.currentTime - 1e-9);
  });

  it('stopMelody и silence глушат мелодию; ready — конечная дорожка, после неё тишина', () => {
    const { context, port, advance } = make();
    port.startMelody('ready');
    expect(port.melodyKind).toBe('ready');
    port.update();
    expect(context.oscillators).toHaveLength(2); // в окно вперёд попала и вторая часть тона
    for (let i = 0; i < 40; i++) advance(40);
    expect(port.melodyKind).toBeNull();
    expect(port.ledBeat()).toBe(-1);
    const earlier = context.oscillators.length;
    port.startMelody('tune');
    port.update();
    const voices = context.oscillators.slice(earlier);
    expect(voices.length).toBeGreaterThan(0);
    port.stopMelody();
    expect(voices.every((o) => o.stopped.length >= 2)).toBe(true); // плановая остановка + обрыв
    expect(port.melodyKind).toBeNull();
    port.startMelody('tune');
    port.silence();
    expect(port.melodyKind).toBeNull();
  });

  it('тон готовности: нота «ре» на 2 + 3 + 3 доли', () => {
    const { context, port, advance } = make();
    port.startMelody('ready');
    port.update();
    for (let i = 0; i < 30; i++) advance(40);
    const hz = context.oscillators.map((o) => Math.round(o.frequency.value));
    expect(new Set(hz)).toEqual(new Set([Math.round(762 * 2 ** (2 / 12))]));
    expect(context.oscillators).toHaveLength(3);
    const lengths = context.oscillators.map((o) => (o.stopped[0] ?? 0) - (o.started[0] ?? 0));
    expect(lengths[0]).toBeCloseTo((2 * STEP_MS) / 1000, 3);
  });
});

describe('NullAudio', () => {
  it('ничего не делает, но помнит mute и громкость', () => {
    const audio = new NullAudio();
    audio.setMuted(false);
    audio.setVolume(0.2);
    audio.startMelody('start');
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBe(0.2);
    expect(audio.melodyKind).toBe('start');
    expect(audio.ledBeat()).toBe(-1);
    audio.silence();
    expect(audio.melodyKind).toBeNull();
  });
});
