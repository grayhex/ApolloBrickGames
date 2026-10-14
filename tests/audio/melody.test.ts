import { describe, expect, it } from 'vitest';
import { MelodyPlayer, Track, TRACKS } from '../../src/audio/melody';
import { FANFARE, MICRO_MS, READY, ROOT_HZ, semitoneHz, STEP_MS, TUNE, TUNE_STEPS } from '../../src/audio/phrases';

const tone = (ms: number, hz = 440) => ({ ms, hz: [hz] });
const rest = (ms: number) => ({ ms, hz: [] });

describe('дорожка: светодиоды бегут по звучащим нотам', () => {
  const track = new Track([{ notes: [tone(100), tone(100), rest(50), tone(100)] }, { notes: [tone(100), tone(100)], loop: true }]);

  it('красный → жёлтый → зелёный на каждой ноте; пауза гасит все', () => {
    expect(track.ledAt(0)).toBe(0);
    expect(track.ledAt(99)).toBe(0);
    expect(track.ledAt(100)).toBe(1);
    expect(track.ledAt(210)).toBe(-1); // пауза
    expect(track.ledAt(260)).toBe(2); // третья звучащая нота
    expect(track.ledAt(360)).toBe(0); // первая нота цикла продолжает счёт: четвёртая → красный
    expect(track.ledAt(460)).toBe(1);
  });

  it('цикл бесконечен и счёт светодиодов продолжается через обороты', () => {
    expect(track.durationMs).toBe(Infinity);
    const start = track.headMs - 200; // начало цикла
    const seen = Array.from({ length: 12 }, (_, i) => track.ledAt(start + i * 100 + 1));
    // цикл из двух нот, на каждом обороте светодиод сдвигается: 0,1 → 2,0 → 1,2 … (начало счёта перед циклом — 3 ноты)
    expect(seen).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]);
    const a = track.at(100);
    const b = track.at(100 + 2);
    expect(b?.startMs).toBeCloseTo((a?.startMs ?? 0) + 200, 9);
  });

  it('конечная дорожка заканчивается: за концом светодиодов нет, индекс -1', () => {
    const finite = new Track([{ notes: [tone(100), tone(100)] }]);
    expect(finite.durationMs).toBe(200);
    expect(finite.indexAt(199)).toBe(1);
    expect(finite.indexAt(200)).toBe(-1);
    expect(finite.ledAt(250)).toBe(-1);
    expect(finite.at(2)).toBeNull();
  });

  it('зациклить можно только последнюю часть и она должна звучать', () => {
    expect(() => new Track([{ notes: [tone(10)], loop: true }, { notes: [tone(10)] }])).toThrow();
    expect(() => new Track([{ notes: [rest(10)], loop: true }])).toThrow();
  });
});

describe('мелодия игрушки (реконструкция по записи)', () => {
  it('лад: основной тон 762 Гц, равномерно-темперированные полутоны', () => {
    expect(ROOT_HZ).toBe(762);
    expect(semitoneHz(0)).toBe(762);
    expect(semitoneHz(12)).toBeCloseTo(1524, 6);
    expect(semitoneHz(-3)).toBeCloseTo(641, 0);
  });

  it('мелодия — 20 тактов (80 долей) по сетке 135,6 мс; нота не длиннее двух долей', () => {
    expect(TUNE_STEPS).toBe(80);
    const total = TUNE.reduce((sum, note) => sum + note.ms, 0);
    expect(total).toBeCloseTo(80 * STEP_MS, 6);
    for (const note of TUNE) {
      expect(note.hz.length).toBeGreaterThanOrEqual(1);
      expect(note.hz.length).toBeLessThanOrEqual(2); // пищалка: до двух голосов
      expect(note.ms === STEP_MS || note.ms === 2 * STEP_MS).toBe(true);
      for (const hz of note.hz) expect(hz).toBeGreaterThan(500);
    }
  });

  it('фанфара — 12 нот по 2/5 доли: ми ре ми ре до ре ми ре ми ля си до; тон готовности — 8 долей в три ноты', () => {
    expect(FANFARE).toHaveLength(12);
    expect(FANFARE[0]?.ms).toBeCloseTo(MICRO_MS * 2, 9);
    expect(FANFARE.map((n) => Math.round(12 * Math.log2((n.hz[0] ?? 1) / ROOT_HZ)))).toEqual([4, 2, 4, 2, 0, 2, 4, 2, 4, 9, 11, 12]);
    expect(READY.map((n) => n.ms / STEP_MS)).toEqual([2, 3, 3]);
  });

  it('дорожка «start»: фанфара, доля тишины, затем мелодия по кругу', () => {
    const track = TRACKS.start;
    const fanfare = FANFARE.reduce((sum, note) => sum + note.ms, 0);
    expect(track.ledAt(0)).toBe(0);
    expect(track.ledAt(fanfare + STEP_MS / 2)).toBe(-1); // тишина между фанфарой и мелодией (в записи — 0,135 с без светодиодов)
    expect(track.ledAt(fanfare + STEP_MS + 1)).toBeGreaterThanOrEqual(0);
    expect(track.durationMs).toBe(Infinity);
    // Через сколько-то оборотов мелодия по-прежнему звучит и светодиод определён.
    expect(track.ledAt(fanfare + STEP_MS + 5 * 80 * STEP_MS + 10)).toBeGreaterThanOrEqual(0);
  });

  it('дорожка «ready»: красный → жёлтый → зелёный на 2 + 3 + 3 доли, затем тишина', () => {
    const track = TRACKS.ready;
    expect(track.ledAt(STEP_MS)).toBe(0);
    expect(track.ledAt(STEP_MS * 3)).toBe(1);
    expect(track.ledAt(STEP_MS * 6)).toBe(2);
    expect(track.ledAt(STEP_MS * 8 + 1)).toBe(-1);
    expect(track.durationMs).toBeCloseTo(8 * STEP_MS, 6);
  });
});

describe('проигрыватель мелодии', () => {
  const simple = () => new MelodyPlayer();

  it('часы идут от запуска; пауза замораживает позицию, продолжение двигает её дальше', () => {
    const player = simple();
    player.start('tune', 1000);
    expect(player.position(1250)).toBe(250);
    player.pause(1250);
    expect(player.position(5000)).toBe(250);
    expect(player.led(5000)).toBe(-1);
    player.resume(5000);
    expect(player.position(5100)).toBe(350);
    expect(player.paused).toBe(false);
  });

  it('collect отдаёт ноты окна один раз; уже отзвучавшие пропускает, начатую — частично', () => {
    const player = simple();
    player.start('tune', 0);
    const first = player.collect(0, 300);
    expect(first.length).toBeGreaterThan(1);
    expect(first[0]?.offsetMs).toBe(0);
    expect(player.collect(0, 300)).toEqual([]); // повторно то же окно ничего не даёт
    const next = player.collect(200, 300); // окно сдвинулось: подхватились только новые ноты
    expect(next.length).toBeGreaterThan(0);
    expect(next.every((item) => item.offsetMs >= 100)).toBe(true);
    // Звук «включили» посреди ноты: нота идёт, её начало уже позади.
    const late = simple();
    late.start('tune', 0);
    const partial = late.collect(1000, 100);
    const sounding = partial.find((item) => item.offsetMs < 0);
    expect(sounding).toBeDefined();
    expect(partial.every((item) => item.offsetMs + item.note.ms > 0)).toBe(true);
  });

  it('светодиоды и часы идут независимо от того, выбирают ли ноты (звук заглушён)', () => {
    const player = simple();
    player.start('start', 0);
    expect(player.led(10)).toBe(0);
    expect(player.led(70)).toBe(1);
    // Часами владеет проигрыватель: ноты никто не забирал, светодиод всё равно определён на любой минуте.
    expect(player.led(61_234)).toBeGreaterThanOrEqual(-1);
    expect(player.collect(61_234, 100).every((item) => item.offsetMs + item.note.ms > 0)).toBe(true);
  });

  it('конечная дорожка сама выключается по концу; stop обнуляет', () => {
    const player = simple();
    player.start('ready', 0);
    expect(player.kind).toBe('ready');
    expect(player.active(100)).toBe(true);
    player.collect(8 * STEP_MS + 1, 100);
    expect(player.kind).toBeNull();
    expect(player.active(9999)).toBe(false);
    player.start('start', 0);
    player.stop();
    expect(player.kind).toBeNull();
    expect(player.led(10)).toBe(-1);
  });

  it('на паузе ноты не выдаются', () => {
    const player = simple();
    player.start('tune', 0);
    player.pause(10);
    expect(player.collect(10, 300)).toEqual([]);
  });
});
