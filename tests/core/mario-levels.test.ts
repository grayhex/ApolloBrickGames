import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ContentPack, LevelDef } from '../../src/content/schema';
import { loadRoomPack } from '../helpers/content';
import { makeFrame } from '../../src/core';
import { enteredGame, replaySolution, solveLevel } from '../helpers/solver';

/**
 * Девять уровней MARIO — «геймплейное приближение» (расстановка придумана по видео геймплея, не оригинал 1 в 1).
 * Тесты фиксируют инварианты приближения: общий старт, цепочка переходов, нарастание длины, ограничения формата —
 * и главное: каждый уровень проходим на настоящем движке (решатель tests/helpers/solver.ts), в том числе с врагами и без стрельбы.
 */

const pack = loadRoomPack();
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const level = (n: number): LevelDef => {
  const found = pack.levels.find((l) => l.id === `mario-${n}`);
  if (!found) throw new Error(`нет уровня mario-${n}`);
  return found;
};
const count = (def: LevelDef, predicate: (o: LevelDef['objects'][number]) => boolean): number => def.objects.filter(predicate).length;

describe('девять уровней MARIO: пакет и формат', () => {
  it('пакет начинается с mario-1…9 по порядку, игра стартует с mario-1; прежний «туннель» остаётся как тестовый', () => {
    expect(pack.manifest.levels.slice(0, 9)).toEqual(NUMBERS.map((n) => `levels/mario-${n}.json`));
    expect(pack.manifest.firstLevel).toBe('mario-1');
    expect(pack.levels.some((l) => l.id === 'tunnel-run')).toBe(true);
  });

  it('метки HUD «1-01…1-09»; каждый уровень ведёт в следующий, последний — конец игры', () => {
    for (const n of NUMBERS) {
      const def = level(n);
      expect(def.hudLabel).toBe(`1-0${n}`);
      expect(def.transitions).toEqual([{ from: 'goal', to: n < 9 ? `mario-${n + 1}` : null }]);
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

  it('содержимое нарастает: врагов и сердец не меньше, чем в первом; большие парящие враги появляются с четвёртого уровня', () => {
    const small = (def: LevelDef) => count(def, (o) => o.type === 'patroller' && o.w === 1);
    const big = (def: LevelDef) => count(def, (o) => o.type === 'patroller' && o.w === 2);
    expect(small(level(1))).toBeGreaterThanOrEqual(3);
    expect(small(level(9))).toBeGreaterThan(small(level(1)));
    for (const n of NUMBERS) {
      expect(count(level(n), (o) => o.type === 'pickup')).toBeGreaterThanOrEqual(10);
      expect(count(level(n), (o) => o.type === 'hazard')).toBeGreaterThanOrEqual(3); // провалы
      if (n <= 3) expect(big(level(n))).toBe(0);
      else expect(big(level(n))).toBeGreaterThan(0);
    }
  });
});

describe('девять уровней MARIO: проходимость (поиск по настоящему движку)', () => {
  for (const n of NUMBERS) {
    const id = `mario-${n}`;

    it(`${id}: проходим без врагов; найденное решение воспроизводится с чистого старта`, () => {
      const result = solveLevel(pack, id, { enemies: false });
      expect(result.solved).toBe(true);
      expect(replaySolution(pack, id, false, result.frames)).toBe(true);
      // Лимит времени режима «TIME 400» (400 с при 20 тактах/с) решение выдерживает с большим запасом.
      expect(result.ticks).toBeLessThan(400 * 20);
    });

    it(`${id}: проходим и с врагами — их можно обойти или наступить сверху, стрельба не требуется`, () => {
      const result = solveLevel(pack, id, { enemies: true });
      expect(result.solved).toBe(true);
      expect(replaySolution(pack, id, true, result.frames)).toBe(true);
    });
  }

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
