import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ContentPack, LevelDef } from '../../src/content/schema';
import { loadRoomPack } from '../helpers/content';
import { makeFrame, NEUTRAL_FRAME, type GameEvent } from '../../src/core';
import { enteredGame, replaySolution, solveLevel } from '../helpers/solver';

/**
 * Девять уровней MARIO — «геймплейное приближение» (расстановка придумана по видео геймплея, не оригинал 1 в 1).
 * Тесты фиксируют инварианты приближения: общий старт, цепочка переходов, нарастание длины, ограничения формата —
 * и главное: каждый уровень проходим на настоящем движке (решатель tests/helpers/solver.ts), в том числе с врагами и без стрельбы.
 * Колодцы (уровни 2–9, видео 178–214 с): щель между трубами с сердцем, в которую можно провалиться — в комнату с большим чёртом (нечётные
 * уровни) или с бонусными сердцами (чётные); по выходу герой возвращается на уровень. Летящих на героя «пуль» нет: враги — простые черти.
 */

const pack = loadRoomPack();
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const level = (n: number): LevelDef => {
  const found = pack.levels.find((l) => l.id === `mario-${n}`);
  if (!found) throw new Error(`нет уровня mario-${n}`);
  return found;
};
const WELL_NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9] as const;
const roomName = (n: number): string => `mario-${n}-${n % 2 === 1 ? 'boss' : 'bonus'}`;
const room = (n: number): LevelDef => {
  const found = pack.levels.find((l) => l.id === roomName(n));
  if (!found) throw new Error(`нет комнаты ${roomName(n)}`);
  return found;
};
const count = (def: LevelDef, predicate: (o: LevelDef['objects'][number]) => boolean): number => def.objects.filter(predicate).length;

describe('девять уровней MARIO: пакет и формат', () => {
  it('пакет начинается с mario-1…9 по порядку, за ними комнаты колодцев; игра стартует с mario-1; прежний «туннель» остаётся как тестовый', () => {
    expect(pack.manifest.levels.slice(0, 9)).toEqual(NUMBERS.map((n) => `levels/mario-${n}.json`));
    expect(pack.manifest.levels.slice(9, 17)).toEqual(WELL_NUMBERS.map((n) => `levels/${roomName(n)}.json`));
    expect(pack.manifest.firstLevel).toBe('mario-1');
    expect(pack.levels.some((l) => l.id === 'tunnel-run')).toBe(true);
  });

  it('метки HUD «1-01…1-09»; каждый уровень ведёт в следующий, последний — конец игры', () => {
    for (const n of NUMBERS) {
      const def = level(n);
      expect(def.hudLabel).toBe(`1-0${n}`);
      // Первым — переход финиша в следующий уровень; дальше (с уровня 2) — переход колодца в его комнату.
      expect(def.transitions[0]).toEqual({ from: 'goal', to: n < 9 ? `mario-${n + 1}` : null });
      expect(def.transitions.slice(1)).toEqual(n === 1 ? [] : [{ from: 'well1', to: roomName(n) }]);
      expect(def.objects.filter((o) => o.type === 'finish')).toHaveLength(1);
      expect(def.marks.some((m) => m.status === 'assumed')).toBe(true); // помечены как допущение, а не измерение
    }
  });

  it('общий старт: яма с крышкой — первые 13 столбцов одинаковы у всех уровней, герой в яме', () => {
    const first = level(1);
    for (const n of NUMBERS) {
      const def = level(n);
      expect(def.start).toEqual({ x: 1, y: 5 });
      expect(def.rows.map((row) => row.slice(0, 13))).toEqual(first.rows.map((row) => row.slice(0, 13)));
      expect(def.objects.find((o) => o.id === 'lid')).toMatchObject({ type: 'brick', x: 1, y: 3, params: { hp: 3 } });
    }
  });

  it('поле шире экрана, но не больше предела формата (256); уровни растут в длину', () => {
    let previous = 0;
    for (const n of NUMBERS) {
      const def = level(n);
      expect(def.width).toBeGreaterThan(pack.screen.viewport.columns);
      expect(def.width).toBeLessThanOrEqual(256);
      expect(def.width).toBeGreaterThan(previous);
      previous = def.width;
    }
  });

  it('содержимое нарастает: простых врагов (малых чертей) и сердец не меньше, чем в первом; больших 2 × 2 и летящих «пуль» в уровнях нет', () => {
    const small = (def: LevelDef) => count(def, (o) => o.type === 'patroller' && o.w === 1);
    expect(small(level(1))).toBeGreaterThanOrEqual(3);
    expect(small(level(9))).toBeGreaterThan(small(level(1)));
    for (const n of NUMBERS) {
      const def = level(n);
      expect(count(def, (o) => o.type === 'pickup')).toBeGreaterThanOrEqual(10);
      expect(count(def, (o) => o.type === 'hazard')).toBeGreaterThanOrEqual(3); // провалы
      // Враги — только простые: малый чёрт 1 × 1 патрулирует (не преследует), рисуется чёртом, а не точкой-«пулей».
      for (const o of def.objects.filter((x) => x.type === 'patroller')) {
        expect(o.w, `${def.id}/${o.id}`).toBe(1);
        expect(o.h).toBe(1);
        expect(o.params['chase'] ?? 0).toBe(0);
        expect(o.asset).toBe('cell.devil');
        expect(o.params['stomp']).toBe(200); // наступить сверху можно
      }
      expect(def.objects.some((o) => o.asset === 'cell.object')).toBe(false);
    }
    expect(small(level(9))).toBeGreaterThanOrEqual(small(level(5)));
  });

  it('колодцы: в уровнях 2–9 по одному; трубы 2 × 3 по бокам щели, в щели сердце, на дне вход в комнату (нечётные — босс, чётные — бонус); в первом уровне колодца нет', () => {
    expect(count(level(1), (o) => o.type === 'sewer')).toBe(0);
    for (const n of WELL_NUMBERS) {
      const def = level(n);
      const wells = def.objects.filter((o) => o.type === 'sewer');
      expect(wells, `mario-${n}`).toHaveLength(1);
      const well = wells[0]!;
      expect(well).toMatchObject({ id: 'well1', y: 5, w: 1, h: 1 });
      // Щель — пустой столбец (без пола); по бокам трубы шириной 2 и высотой 3 (ряды 3–5).
      const solid = (x: number, y: number): boolean => def.rows[y]?.[x] === '#';
      for (let y = 0; y < 6; y++) expect(solid(well.x, y), `щель (${well.x}, ${y})`).toBe(false);
      for (const x of [well.x - 2, well.x - 1, well.x + 1, well.x + 2]) {
        for (const y of [3, 4, 5]) expect(solid(x, y), `труба (${x}, ${y})`).toBe(true);
        expect(solid(x, 2), `над трубой (${x}, 2)`).toBe(false);
      }
      // Сердце в щели; возврат — на пол за правой трубой.
      expect(def.objects.some((o) => o.type === 'pickup' && o.x === well.x && o.y === 4)).toBe(true);
      const { returnX, returnY } = well.params as { returnX: number; returnY: number };
      expect(returnX).toBeGreaterThan(well.x + 2);
      expect(returnY).toBe(4);
      expect(solid(returnX, 5)).toBe(true);
      expect(solid(returnX, returnY)).toBe(false);
      // Посередине уровня, а не у старта или финиша.
      expect(well.x).toBeGreaterThan(def.width * 0.4);
      expect(well.x).toBeLessThan(def.width * 0.75);
    }
  });

  it('комнаты: 13 × 6, ровный пол, выход у правого края; босс — большой чёрт 2 × 2 (преследует героя, 4 попадания, +400), бонус — сердца в рядах 1–4', () => {
    for (const n of WELL_NUMBERS) {
      const def = room(n);
      expect(def.hudLabel).toBe(`1-0${n}`);
      expect(def.width).toBe(pack.screen.viewport.columns);
      expect(def.height).toBe(6);
      expect(def.rows[5]).toBe('#'.repeat(13));
      expect(def.rows.slice(0, 5).every((row) => row === '.'.repeat(13))).toBe(true);
      expect(def.transitions).toEqual([]);
      expect(def.objects[0]).toMatchObject({ id: 'exit', type: 'exit', x: 12 });
      if (n % 2 === 1) {
        expect(def.objects.filter((o) => o.type === 'patroller')).toEqual([
          expect.objectContaining({ id: 'boss', w: 2, h: 2, asset: 'cell.devil_big', params: expect.objectContaining({ chase: 1, hp: 4, score: 400 }) }),
        ]);
        expect(def.objects.some((o) => o.type === 'pickup')).toBe(false);
      } else {
        expect(def.objects.some((o) => o.type === 'patroller')).toBe(false);
        const hearts = def.objects.filter((o) => o.type === 'pickup');
        expect(hearts).toHaveLength(4 * 12); // поле 12 × 4: ряды 1–4, столбцы 0–11
        expect(hearts.every((o) => o.y >= 1 && o.y <= 4 && o.x <= 11 && o.asset === 'cell.heart' && o.params['score'] === 100)).toBe(true);
      }
    }
  });
});

describe('девять уровней MARIO: проходимость (поиск по настоящему движку)', () => {
  for (const n of NUMBERS) {
    const id = `mario-${n}`;

    it(`${id}: проходим без врагов; найденное решение воспроизводится с чистого старта и обходит колодец поверху`, () => {
      const result = solveLevel(pack, id, { enemies: false });
      expect(result.solved).toBe(true);
      expect(replaySolution(pack, id, false, result.frames)).toBe(true);
      const { game } = enteredGame(pack, id, false);
      const types = new Set<string>();
      for (const frame of result.frames) for (const e of game.step(frame)) types.add(e.type);
      expect(types.has('roomEntered')).toBe(false); // в колодец не падали: уровень пройден по трубам
      // Лимит времени режима «TIME 400» (400 с при 20 тактах/с) решение выдерживает с большим запасом.
      expect(result.ticks).toBeLessThan(400 * 20);
    });

    it(`${id}: проходим и с врагами — их можно обойти или наступить сверху, стрельба не требуется`, () => {
      const result = solveLevel(pack, id, { enemies: true });
      expect(result.solved).toBe(true);
      expect(replaySolution(pack, id, true, result.frames)).toBe(true);
    });
  }

  for (const n of WELL_NUMBERS) {
    const id = roomName(n);

    it(`${id}: из комнаты есть выход — с чертом/сердцами (без стрельбы) — и решение воспроизводится`, () => {
      for (const enemies of [false, true]) {
        const result = solveLevel(pack, id, { enemies, goal: 'room', maxNodes: 300_000 });
        expect(result.solved, `${id} enemies=${enemies}`).toBe(true);
        expect(replaySolution(pack, id, enemies, result.frames, 'room')).toBe(true);
      }
    });

    it(`mario-${n}: провалившись в колодец, герой попадает в ${id}, а выйдя — возвращается за правую трубу на полу уровня`, () => {
      const def = level(n);
      const well = def.objects.find((o) => o.type === 'sewer')!;
      const { returnX } = well.params as { returnX: number };
      const { game } = enteredGame(pack, `mario-${n}`, false);
      game.state.hero.x = well.x;
      game.state.hero.y = 0;
      const events: GameEvent[] = [];
      for (let i = 0; i < 80 && game.state.levelId === `mario-${n}`; i++) events.push(...game.step(NEUTRAL_FRAME));
      expect(events.find((e) => e.type === 'roomEntered')).toMatchObject({ levelId: id, from: `mario-${n}` });
      expect(events.some((e) => e.type === 'levelCompleted')).toBe(false);
      expect(game.state.levelId).toBe(id);
      expect(game.state.score).toBe(100); // сердце в щели
      // К самому выходу: комната пуста у правого края (чёрт — у правого верхнего угла, герой его проскакивает у пола).
      game.state.hero.x = 11;
      game.state.hero.y = 4;
      if (game.state.objects.some((o) => o.id === 'boss')) {
        const boss = game.state.objects.find((o) => o.id === 'boss')!;
        boss.x = 3; // чёрт далеко слева: проверяем возврат, а не прохождение мимо него
      }
      const back: GameEvent[] = [];
      for (let i = 0; i < 40 && game.state.levelId === id; i++) back.push(...game.step(makeFrame({ held: ['right'] })));
      expect(back.find((e) => e.type === 'roomLeft')).toMatchObject({ levelId: `mario-${n}`, from: id });
      expect(game.state.levelId).toBe(`mario-${n}`);
      expect(game.state.hero).toMatchObject({ x: returnX, y: 4 });
      expect(game.state.objects.find((o) => o.id === 'well1')?.active).toBe(false); // колодец закрыт
    });
  }

  it('бонусная комната: все 48 сердец достижимы прыжками (+4800), выход после этого открыт', () => {
    for (const n of [2, 4, 6, 8]) {
      const { game } = enteredGame(pack, roomName(n), false);
      const jumpAt = (): void => {
        game.step(makeFrame({ pressed: ['jump'] }));
        for (let i = 0; i < 40; i++) game.step(NEUTRAL_FRAME);
      };
      for (let i = 0; i < 30; i++) game.step(NEUTRAL_FRAME); // падение с места старта на пол
      // Влево до столбца 0, затем по столбцу вправо с прыжком в каждом: прыжок вверх собирает все клетки столбца до верхнего ряда 1.
      while (game.state.hero.x > 0) game.step(makeFrame({ held: ['left'] }));
      game.step(NEUTRAL_FRAME);
      for (let x = 0; x <= 11; x++) {
        jumpAt();
        if (x < 11) {
          game.step(makeFrame({ held: ['right'] }));
          game.step(NEUTRAL_FRAME);
        }
      }
      expect(game.state.score, roomName(n)).toBe(4800);
      expect(game.state.objects.filter((o) => o.id.startsWith('h') && o.active)).toHaveLength(0);
    }
  });

  it('custom-1: сгенерированный пользовательский уровень проходим — без врагов и с врагами; он не ведёт никуда дальше (последний в пакете)', () => {
    const custom = pack.levels.find((l) => l.id === 'custom-1');
    expect(custom).toBeDefined();
    expect(custom?.transitions).toEqual([{ from: 'goal', to: null }]);
    expect(custom?.hudLabel).toBe('U-01');
    for (const enemies of [false, true]) {
      const result = solveLevel(pack, 'custom-1', { enemies });
      expect(result.solved).toBe(true);
      expect(replaySolution(pack, 'custom-1', enemies, result.frames)).toBe(true);
      expect(result.ticks).toBeLessThan(400 * 20);
    }
  });

  it('контроль: герой, который только бежит вправо, до финиша не доходит (стенки и провалы требуют прыжков)', () => {
    for (const n of NUMBERS) {
      const { game } = enteredGame(pack, `mario-${n}`, true);
      let completed = false;
      for (let i = 0; i < 1500 && game.state.phase === 'playing'; i++) {
        completed = game.step(makeFrame({ held: ['right'] })).some((e) => e.type === 'levelCompleted') || completed;
      }
      expect(completed).toBe(false);
    }
  });
});

/** Синтетический уровень «два края и пропасть»: площадка в строке `from`, пустых столбцов `gap`, площадка в строке `to`. */
function crossing(from: number, to: number, gap: number): ContentPack {
  const lead = 8;
  const width = lead + gap + 8;
  const rows = Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: width }, (_, x) => ((x < lead ? from : x < lead + gap ? -1 : to) === row ? '#' : '.')).join(''),
  );
  const level = {
    schemaVersion: 1,
    id: 'crossing',
    status: 'demo',
    hudLabel: 'TEST',
    width,
    height: 6,
    legend: { '.': { collision: 'empty' }, '#': { collision: 'solid', asset: 'cell.obstacle' } },
    rows,
    start: { x: 1, y: from - 1 },
    objects: [
      { id: 'pit', type: 'hazard', x: 0, y: 5, w: width, h: 1, params: {} },
      { id: 'goal', type: 'finish', x: width - 3, y: to - 1, w: 1, h: 1, asset: 'cell.all_on', params: { score: 0 } },
    ],
    transitions: [{ from: 'goal', to: null }],
    marks: [],
  } as unknown as LevelDef;
  return { ...pack, levels: [level], manifest: { ...pack.manifest, firstLevel: 'crossing' }, animations: undefined } as ContentPack;
}

describe('таблица дальности прыжка (tools/levels/reach.json), по которой генератор ставит платформы', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { reach } = JSON.parse(readFileSync(join(root, 'tools', 'levels', 'reach.json'), 'utf8')) as {
    reach: Record<string, Record<string, number>>;
  };

  it('наибольший проходимый пролёт между краями совпадает с движком для каждой пары строк 5…2', () => {
    for (const from of [5, 4, 3, 2]) {
      for (const to of [5, 4, 3, 2]) {
        const max = reach[String(from)]?.[String(to)] ?? -1;
        const solves = (gap: number): boolean => solveLevel(crossing(from, to, gap), 'crossing', { enemies: false, maxNodes: 40_000 }).solved;
        expect(solves(max), `${from}→${to}: пролёт ${max} проходим`).toBe(true);
        expect(solves(max + 1), `${from}→${to}: пролёт ${max + 1} непроходим`).toBe(false);
      }
    }
  }, 120_000);
});
