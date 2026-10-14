import { describe, expect, it } from 'vitest';
import { TRACK_GAIN, WebAudioPort, type AudioContextLike, type GainLike, type OscillatorLike } from '../../src/audio/beeper';
import { RemasterTrack, type BufferLike, type BufferSourceLike } from '../../src/audio/remaster';

class FakeSource implements BufferSourceLike {
  buffer: BufferLike | null = null;
  loop = false;
  connectedTo: unknown[] = [];
  started: [number | undefined, number | undefined][] = [];
  stopped = 0;
  connect(destination: unknown): void {
    this.connectedTo.push(destination);
  }
  start(when?: number, offset?: number): void {
    this.started.push([when, offset]);
  }
  stop(): void {
    this.stopped += 1;
  }
}

class FakeContext implements AudioContextLike {
  currentTime = 10;
  state = 'running';
  destination = { name: 'destination' };
  oscillators: OscillatorLike[] = [];
  gains: (GainLike & { connectedTo: unknown[] })[] = [];
  sources: FakeSource[] = [];
  decoded: ArrayBuffer[] = [];
  duration = 8;
  decodeFails = false;
  createOscillator(): OscillatorLike {
    const osc: OscillatorLike = {
      type: 'sine',
      frequency: { value: 0, setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
    };
    this.oscillators.push(osc);
    return osc;
  }
  createGain(): GainLike & { connectedTo: unknown[] } {
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
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  async decodeAudioData(data: ArrayBuffer): Promise<BufferLike> {
    this.decoded.push(data);
    if (this.decodeFails) throw new Error('не декодируется');
    return { duration: this.duration };
  }
  async resume(): Promise<void> {
    this.state = 'running';
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const BYTES = new Uint8Array([1, 2, 3, 4]).buffer;

function make(options: { bytes?: ArrayBuffer | null; withLoader?: boolean; decodeFails?: boolean } = {}) {
  const context = new FakeContext();
  context.decodeFails = options.decodeFails ?? false;
  let wall = 0;
  let fetched = 0;
  const bytes = options.bytes === undefined ? BYTES : options.bytes;
  const port = new WebAudioPort({
    factory: () => context,
    clock: () => wall,
    ...(options.withLoader === false
      ? {}
      : {
          remaster: async () => {
            fetched += 1;
            return bytes;
          },
        }),
  });
  port.unlock();
  return {
    context,
    port,
    fetched: () => fetched,
    advance(ms: number) {
      wall += ms;
      context.currentTime += ms / 1000;
    },
    /** Громкостный узел записи: создаётся последним среди усилителей, подключён к выходу контекста. */
    trackGain: () => context.gains[3] as GainLike & { connectedTo: unknown[] },
  };
}

describe('RemasterTrack: загрузка и позиция', () => {
  it('грузит и декодирует запись один раз; нет файла или битые данные — состояние failed', async () => {
    const context = new FakeContext();
    let calls = 0;
    const track = new RemasterTrack(async () => {
      calls += 1;
      return BYTES;
    });
    expect(track.status).toBe('idle');
    const first = track.load(context);
    const second = track.load(context);
    expect(track.status).toBe('loading');
    await Promise.all([first, second]);
    expect(track.status).toBe('ready');
    expect(track.duration).toBe(8);
    expect(calls).toBe(1);
    expect(context.decoded).toHaveLength(1);

    const missing = new RemasterTrack(async () => null);
    await missing.load(context);
    expect(missing.status).toBe('failed');

    const empty = new RemasterTrack(async () => new ArrayBuffer(0));
    await empty.load(context);
    expect(empty.status).toBe('failed');

    context.decodeFails = true;
    const broken = new RemasterTrack(async () => BYTES);
    await broken.load(context);
    expect(broken.status).toBe('failed');

    const noDecoder = new RemasterTrack(async () => BYTES);
    await noDecoder.load({ currentTime: 0, state: 'running' }); // у контекста нет decodeAudioData
    expect(noDecoder.status).toBe('failed');
  });

  it('играет по кругу, пауза запоминает позицию (по модулю длины), остановка сбрасывает', async () => {
    const context = new FakeContext();
    const track = new RemasterTrack(async () => BYTES);
    await track.load(context);
    const out = { name: 'out' };
    track.play(context, out);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.loop).toBe(true);
    expect(context.sources[0]?.connectedTo).toEqual([out]);
    expect(context.sources[0]?.started).toEqual([[0, 0]]);
    expect(track.playing).toBe(true);
    track.play(context, out); // уже играет: второй источник не создаётся
    expect(context.sources).toHaveLength(1);

    context.currentTime += 3;
    expect(track.position(context.currentTime)).toBeCloseTo(3);
    track.pause(context.currentTime);
    expect(context.sources[0]?.stopped).toBe(1);
    expect(track.playing).toBe(false);

    context.currentTime += 100; // время паузы не идёт в счёт
    track.play(context, out);
    expect(context.sources[1]?.started).toEqual([[0, 3]]);
    context.currentTime += 7; // 3 + 7 = 10 → 10 mod 8 = 2
    expect(track.position(context.currentTime)).toBeCloseTo(2);

    track.stop();
    expect(context.sources[1]?.stopped).toBe(1);
    track.play(context, out);
    expect(context.sources[2]?.started).toEqual([[0, 0]]); // после остановки — с начала
  });
});

describe('WebAudioPort: музыка «Ремастер»', () => {
  it('по умолчанию и без загрузчика звучит оригинальная мелодия-пищалка', async () => {
    const a = make({ withLoader: false });
    a.port.setMusic('remaster');
    await tick();
    a.port.startMelody('start');
    a.port.update();
    expect(a.context.sources).toHaveLength(0);
    expect(a.context.oscillators.length).toBeGreaterThan(0);
    expect(a.port.musicSource).toBe('original');

    const b = make();
    b.port.startMelody('start'); // «Оригинал»: запись не нужна и не грузится
    b.port.update();
    expect(b.fetched()).toBe(0);
    expect(b.context.oscillators.length).toBeGreaterThan(0);
    expect(b.port.musicSource).toBe('original');
  });

  it('выбор «Ремастера» грузит запись один раз; после загрузки мелодия идёт записью по кругу, пищалка молчит', async () => {
    const { context, port, fetched, trackGain } = make();
    port.setMusic('remaster');
    port.unlock();
    port.setMusic('remaster');
    await tick();
    expect(fetched()).toBe(1);

    port.startMelody('start');
    port.update();
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.loop).toBe(true);
    expect(context.sources[0]?.connectedTo).toEqual([trackGain()]);
    expect(trackGain().connectedTo).toEqual([context.destination]); // мимо общего усилителя пищалки
    expect(port.musicSource).toBe('remaster');
    expect(context.oscillators).toHaveLength(0); // мелодия-пищалка не звучит
    port.update();
    expect(context.sources).toHaveLength(1); // повторный кадр не плодит источники
  });

  it('запись ещё не загружена, файла нет или он не декодируется — играет оригинал', async () => {
    const loading = make();
    loading.port.setMusic('remaster'); // загрузка идёт, но дождаться её мы не стали
    loading.port.startMelody('start');
    loading.port.update();
    expect(loading.context.sources).toHaveLength(0);
    expect(loading.context.oscillators.length).toBeGreaterThan(0);
    await tick();

    for (const options of [{ bytes: null }, { decodeFails: true }]) {
      const m = make(options);
      m.port.setMusic('remaster');
      await tick();
      m.port.startMelody('tune');
      m.port.update();
      expect(m.context.sources).toHaveLength(0);
      expect(m.context.oscillators.length).toBeGreaterThan(0);
      expect(m.port.musicSource).toBe('original');
    }
  });

  it('тон готовности после гибели остаётся пищалкой; следующий запуск мелодии — снова запись с начала', async () => {
    const { context, port, advance } = make();
    port.setMusic('remaster');
    await tick();
    port.startMelody('ready');
    port.update();
    expect(context.sources).toHaveLength(0);
    expect(context.oscillators.length).toBeGreaterThan(0);

    port.startMelody('tune');
    port.update();
    expect(context.sources[0]?.started).toEqual([[0, 0]]);
    advance(2500);
    port.stopMelody();
    expect(context.sources[0]?.stopped).toBe(1);
    expect(port.musicSource).toBe('original');
    port.startMelody('tune');
    port.update();
    expect(context.sources[1]?.started).toEqual([[0, 0]]);
  });

  it('пауза держит позицию записи, продолжение идёт с неё; на паузе новые источники не создаются', async () => {
    const { context, port, advance } = make();
    port.setMusic('remaster');
    await tick();
    port.startMelody('start');
    port.update();
    advance(3000);
    port.pauseMelody();
    expect(context.sources[0]?.stopped).toBe(1);
    port.update();
    expect(context.sources).toHaveLength(1);
    advance(5000);
    port.resumeMelody();
    port.update();
    expect(context.sources[1]?.started).toEqual([[0, 3]]);
  });

  it('громкость и «Звук»: усиление записи = громкость × TRACK_GAIN, при заглушении 0; запись продолжает идти молча', async () => {
    const { context, port, trackGain } = make();
    expect(trackGain().gain.value).toBeCloseTo(0.25 * TRACK_GAIN);
    port.setVolume(1);
    expect(trackGain().gain.value).toBeCloseTo(TRACK_GAIN);
    port.setMusic('remaster');
    await tick();
    port.startMelody('start');
    port.update();
    port.setMuted(true);
    expect(trackGain().gain.value).toBe(0);
    port.update();
    expect(context.sources[0]?.stopped).toBe(0); // позиция не теряется
    port.setMuted(false);
    expect(trackGain().gain.value).toBeCloseTo(TRACK_GAIN);
  });

  it('переключение музыки на лету: «Ремастер» подменяет звучащую пищалку, «Оригинал» возвращает', async () => {
    const { context, port } = make();
    port.setMusic('remaster');
    await tick();
    port.setMusic('original');
    port.startMelody('tune');
    port.update();
    expect(port.musicSource).toBe('original');
    expect(context.sources).toHaveLength(0);

    port.setMusic('remaster'); // мелодия уже идёт
    port.update();
    expect(context.sources).toHaveLength(1);
    expect(port.musicSource).toBe('remaster');

    port.setMusic('original');
    expect(context.sources[0]?.stopped).toBe(1);
    expect(port.musicSource).toBe('original');
  });

  it('без жеста контекст не создаётся и запись не грузится', async () => {
    let created = 0;
    let fetched = 0;
    const port = new WebAudioPort({
      factory: () => {
        created += 1;
        return new FakeContext();
      },
      remaster: async () => {
        fetched += 1;
        return BYTES;
      },
    });
    port.setMusic('remaster');
    port.startMelody('start');
    port.update();
    await tick();
    expect(created).toBe(0);
    expect(fetched).toBe(0);
  });
});
