import { afterEach, describe, expect, it, vi } from 'vitest';
import { SFX_REMASTER_GAIN, TRACK_GAIN, WebAudioPort, type AudioContextLike, type GainLike, type OscillatorLike } from '../../src/audio/beeper';
import { loopEndOf, remasterSources, RemasterTrack, TAIL_MARGIN, type BufferLike, type BufferSourceLike } from '../../src/audio/remaster';

class FakeSource implements BufferSourceLike {
  buffer: BufferLike | null = null;
  loop = false;
  loopStart: number | undefined;
  loopEnd: number | undefined;
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
  /** Сколько секунд тишины в конце декодированной записи (0 — данные каналов не отдаются вовсе). */
  silentTail = 0;
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
    if (this.decodeFails || data.byteLength === UNDECODABLE.byteLength) throw new Error('не декодируется');
    if (this.silentTail <= 0) return { duration: this.duration };
    return stereo(this.duration, this.silentTail);
  }
  async resume(): Promise<void> {
    this.state = 'running';
  }
}

/** Запись с тишиной в конце: звук (0,5) до `duration − tail`, дальше нули. 100 отсчётов в секунду. */
function stereo(duration: number, tail: number): BufferLike {
  const rate = 100;
  const data = new Float32Array(Math.round(duration * rate));
  data.fill(0.5, 0, Math.round((duration - tail) * rate));
  return { duration, sampleRate: rate, numberOfChannels: 2, getChannelData: () => data };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const BYTES = new Uint8Array([1, 2, 3, 4]).buffer;
/** Байты, которые контекст «не умеет декодировать» (как Opus в MP4 в Safari): по длине отличаются от `BYTES`. */
const UNDECODABLE = new Uint8Array([9, 9]).buffer;

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

describe('зацикливание: тишина в конце записи обрезается', () => {
  it('loopEndOf: круг кончается на последнем слышимом звуке плюс небольшой запас; без данных или без тишины — вся запись', () => {
    expect(loopEndOf(stereo(8, 1.1))).toBeCloseTo(8 - 1.1 + TAIL_MARGIN, 2);
    expect(loopEndOf(stereo(8, 0))).toBe(8); // тишины нет
    expect(loopEndOf({ duration: 8 })).toBe(8); // декодер данных каналов не отдаёт
    const silent: BufferLike = { duration: 3, sampleRate: 10, numberOfChannels: 1, getChannelData: () => new Float32Array(30) };
    expect(loopEndOf(silent)).toBe(3); // сплошная тишина — как есть
    const quiet: BufferLike = { duration: 3, sampleRate: 10, numberOfChannels: 1, getChannelData: () => new Float32Array(30).fill(0.0005) };
    expect(loopEndOf(quiet)).toBe(3); // тише порога (≈ −60 дБ) — тоже тишина
  });

  it('источник зацикливается на [0; loopEnd), позиция считается по кругу, а не по всей записи', async () => {
    const context = new FakeContext();
    context.silentTail = 1; // из 8 секунд последняя — тишина
    const track = new RemasterTrack(async () => BYTES);
    await track.load(context);
    expect(track.duration).toBe(8);
    expect(track.loopSeconds).toBeCloseTo(7 + TAIL_MARGIN, 2);
    track.play(context, {});
    const source = context.sources[0];
    expect(source?.loopStart).toBe(0);
    expect(source?.loopEnd).toBeCloseTo(7 + TAIL_MARGIN, 2);
    context.currentTime += 8; // 8 с по кругу длиной 7,05 с → позиция 0,95
    expect(track.position(context.currentTime)).toBeCloseTo(8 - (7 + TAIL_MARGIN), 2);
  });

  it('без тишины в конце loopStart/loopEnd не трогаются', async () => {
    const context = new FakeContext();
    const track = new RemasterTrack(async () => BYTES);
    await track.load(context);
    track.play(context, {});
    expect(context.sources[0]?.loopEnd).toBeUndefined();
  });
});

describe('RemasterTrack: перемотка', () => {
  it('seek обрывает звук, следующий запуск — с заданной позиции по кругу; до загрузки и с мусором — с начала', async () => {
    const context = new FakeContext();
    const track = new RemasterTrack(async () => BYTES);
    track.seek(3); // записи ещё нет
    await track.load(context);
    track.play(context, {});
    expect(context.sources[0]?.started).toEqual([[0, 0]]);
    track.seek(19); // круг 8 с → 3
    expect(context.sources[0]?.stopped).toBe(1);
    expect(track.playing).toBe(false);
    track.play(context, {});
    expect(context.sources[1]?.started).toEqual([[0, 3]]);
    track.seek(-1); // назад от начала — тоже по кругу
    track.play(context, {});
    expect(context.sources[2]?.started).toEqual([[0, 7]]);
    track.seek(Number.NaN);
    track.play(context, {});
    expect(context.sources[3]?.started).toEqual([[0, 0]]);
  });
});

describe('громкость записи не выше оригинала', () => {
  it('TRACK_GAIN не превышает допустимый предел из замера tools/audio/loudness.mjs (запись −14,1 LUFS, мелодия −22,2 LUFS → ≤ 0,394)', () => {
    expect(TRACK_GAIN).toBeLessThanOrEqual(0.394);
    expect(TRACK_GAIN).toBeGreaterThan(0.3); // и не уходит в тишину: запас не больше 2,5 дБ
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

  it('громкость и «Звук»: усиление записи = громкость музыки × TRACK_GAIN (не громкость звука), при заглушении 0; запись продолжает идти молча', async () => {
    const { context, port, trackGain } = make();
    expect(trackGain().gain.value).toBeCloseTo(0.25 * TRACK_GAIN);
    port.setVolume(1); // «Звук» (эффекты) записи не касается
    expect(trackGain().gain.value).toBeCloseTo(0.25 * TRACK_GAIN);
    port.setMusicVolume(1);
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

  it('повторный setMusic с тем же значением ничего не перезапускает (включение сегментов, возврат на вкладку)', async () => {
    const { context, port, advance } = make();
    port.setMusic('remaster');
    await tick();
    port.startMelody('start');
    port.update();
    advance(5000);
    for (let i = 0; i < 4; i++) {
      port.setMusic('remaster'); // приложение зовёт его на каждое изменение вида
      port.update();
    }
    expect(context.sources).toHaveLength(1); // запись не начиналась заново
    expect(context.sources[0]?.stopped).toBe(0);
    expect(context.sources[0]?.started).toEqual([[0, 0]]);

    port.setMusic('original');
    port.update();
    const voices = context.oscillators.length;
    for (let i = 0; i < 4; i++) {
      port.setMusic('original');
      port.update();
    }
    expect(context.sources[0]?.stopped).toBe(1); // остановлена один раз, при настоящем переключении
    expect(context.sources).toHaveLength(1);
    expect(context.oscillators.length).toBeGreaterThanOrEqual(voices); // пищалка идёт без обрыва и перезапуска
  });

  it('«Оригинал» → «Ремастер» на лету: запись вступает с того места по времени, где идёт мелодия', async () => {
    const { context, port, advance } = make();
    port.setMusic('remaster');
    await tick();
    port.setMusic('original');
    port.startMelody('start');
    port.update();
    advance(7000);
    port.update();
    port.setMusic('remaster');
    port.update();
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.started).toEqual([[0, 7]]); // 7 с от запуска мелодии
    expect(port.musicSource).toBe('remaster');
  });

  it('«Ремастер» → «Оригинал» на лету: пищалка подхватывает с того же места, а не с начала мелодии', async () => {
    const { context, port, advance } = make();
    context.duration = 100; // запись длиннее проигранного (в тестах по умолчанию 8 с, позиция ходила бы по кругу)
    port.setMusic('remaster');
    await tick();
    port.startMelody('start');
    port.update();
    advance(20000); // дольше одного круга пищалки (≈ 10,85 с)
    port.update();
    const before = context.oscillators.length;
    port.setMusic('original');
    expect(context.sources[0]?.stopped).toBe(1);
    port.update();
    expect(port.musicSource).toBe('original');
    expect(context.oscillators.length).toBeGreaterThan(before); // пищалка зазвучала
    advance(5000);
    port.setMusic('remaster'); // и обратно: запись — с 25-й секунды, а не с нуля
    port.update();
    expect(context.sources[1]?.started).toEqual([[0, 25]]);
  });

  it('запись догрузилась позже выбора: звучащая мелодия на лету переходит на неё; на паузе — после продолжения', async () => {
    const { context, port, advance } = make();
    port.setMusic('remaster'); // загрузка пошла, но ещё не закончилась
    port.startMelody('start');
    port.update();
    advance(4000);
    port.update();
    expect(context.sources).toHaveLength(0);
    await tick();
    port.update();
    expect(context.sources[0]?.started).toEqual([[0, 4]]);

    const paused = make();
    paused.port.startMelody('start');
    paused.advance(2000);
    paused.port.update();
    paused.port.pauseMelody();
    paused.port.setMusic('remaster');
    await tick();
    paused.port.update();
    expect(paused.context.sources).toHaveLength(0); // на паузе запись молчит
    paused.advance(9000);
    paused.port.resumeMelody();
    paused.port.update();
    expect(paused.context.sources[0]?.started).toEqual([[0, 2]]); // паузы в счёт не идут
  });

  it('эффекты тише, пока выбран «Ремастер»; «Оригинал» и недоступная запись возвращают прежний уровень', async () => {
    const { port, context } = make();
    const sfx = (): number => (context.gains[2] as GainLike).gain.value;
    expect(sfx()).toBe(1);
    port.setMusic('remaster');
    expect(sfx()).toBe(SFX_REMASTER_GAIN);
    expect(SFX_REMASTER_GAIN).toBeLessThan(1);
    port.setMusic('original');
    expect(sfx()).toBe(1);

    const broken = make({ decodeFails: true });
    broken.port.setMusic('remaster');
    await tick();
    broken.port.update();
    expect((broken.context.gains[2] as GainLike).gain.value).toBe(1); // записи нет — звучит пищалка, эффекты прежние
  });

  it('громкость музыки не трогает эффекты и пищалку, а громкость звука — запись', async () => {
    const { port, context, trackGain } = make();
    port.setMusic('remaster');
    port.setMusicVolume(0.5);
    port.setVolume(0.1);
    expect(trackGain().gain.value).toBeCloseTo(0.5 * TRACK_GAIN);
    expect((context.gains[0] as GainLike).gain.value).toBeCloseTo(0.1 * 0.14); // общий усилитель пищалки и эффектов
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

describe('RemasterTrack: несколько источников (Opus, затем AAC)', () => {
  it('первый не декодируется (Opus в MP4 в Safari) — берётся запасной; запись готова, играет из второго', async () => {
    const context = new FakeContext();
    const calls = [0, 0];
    const track = new RemasterTrack([
      async () => ((calls[0] = (calls[0] ?? 0) + 1), UNDECODABLE),
      async () => ((calls[1] = (calls[1] ?? 0) + 1), BYTES),
    ]);
    await track.load(context);
    expect(track.status).toBe('ready');
    expect(track.loadedSource).toBe(1);
    expect(calls).toEqual([1, 1]);
    track.play(context, {});
    expect(context.sources).toHaveLength(1);
  });

  it('первый источник годится — второй даже не качается; нет файла у первого — берётся второй', async () => {
    const context = new FakeContext();
    let second = 0;
    const first = new RemasterTrack([async () => BYTES, async () => ((second += 1), BYTES)]);
    await first.load(context);
    expect(first.loadedSource).toBe(0);
    expect(second).toBe(0); // ленивая загрузка: лишнего трафика нет

    const missing = new RemasterTrack([async () => null, async () => BYTES]);
    await missing.load(new FakeContext());
    expect(missing.status).toBe('ready');
    expect(missing.loadedSource).toBe(1);
  });

  it('ни один источник не подошёл — failed, запись не играет; один источник по-прежнему можно передать без массива', async () => {
    const none = new RemasterTrack([async () => UNDECODABLE, async () => null]);
    await none.load(new FakeContext());
    expect(none.status).toBe('failed');
    expect(none.loadedSource).toBe(-1);
    none.play(new FakeContext(), {});
    expect(none.playing).toBe(false);

    const single = new RemasterTrack(async () => BYTES);
    await single.load(new FakeContext());
    expect(single.status).toBe('ready');
  });
});

describe('remasterSources: порядок источников', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function firstUrl(canPlay: string): Promise<string> {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return { ok: true, arrayBuffer: async () => BYTES };
    });
    const sources = remasterSources('/CrocodileMario/', () => canPlay);
    expect(sources).toHaveLength(2);
    await sources[0]?.();
    return urls[0] ?? '';
  }

  it('браузер играет Opus в MP4 — сначала Opus; не играет (пустая строка, как Safari старых версий) — сразу AAC', async () => {
    expect(await firstUrl('probably')).toBe('/CrocodileMario/audio/remaster.m4a');
    expect(await firstUrl('maybe')).toBe('/CrocodileMario/audio/remaster.m4a');
    expect(await firstUrl('')).toBe('/CrocodileMario/audio/remaster-aac.m4a');
  });
});

describe('WebAudioPort: состояние записи для кнопки «Ремастер»', () => {
  it('без загрузчика — failed; с загрузчиком: idle → loading → ready; не декодируется ни один источник — failed', async () => {
    const none = new WebAudioPort({ factory: () => new FakeContext() });
    expect(none.remasterStatus).toBe('failed');

    const { port } = make();
    expect(port.remasterStatus).toBe('idle');
    port.setMusic('remaster');
    expect(port.remasterStatus).toBe('loading');
    await tick();
    expect(port.remasterStatus).toBe('ready');

    const broken = make({ bytes: UNDECODABLE });
    broken.port.setMusic('remaster');
    await tick();
    expect(broken.port.remasterStatus).toBe('failed');
  });

  it('запасной источник спасает: первый не декодируется, звучит запись из второго', async () => {
    const context = new FakeContext();
    let wall = 0;
    const port = new WebAudioPort({ factory: () => context, clock: () => wall, remaster: [async () => UNDECODABLE, async () => BYTES] });
    port.unlock();
    port.setMusic('remaster');
    await tick();
    expect(port.remasterStatus).toBe('ready');
    port.startMelody('start');
    port.update();
    wall += 100;
    expect(context.sources).toHaveLength(1);
    expect(port.musicSource).toBe('remaster');
  });
});

