import { describe, expect, it } from 'vitest';
import { pentixDef } from '../../../src/brick/games/pentix';
import { tetrisDef } from '../../../src/brick/games/tetris';
import { conformance } from '../conformance';

/**
 * Тетрис и Pentix: пока только общие проверки каталога (форма данных, фазы, повторяемость, случайный ввод на каждом варианте).
 * Тесты правил (падение, повороты, ряды, очки, спецфигуры, различие вариантов, «бот») — не написаны: исполнитель остановлен на полпути, см. docs/brick/STATUS.md.
 */
conformance(tetrisDef, { fuzzTicks: 800, seeds: [7] });
conformance(pentixDef, { fuzzTicks: 800, seeds: [7] });

describe('тетрис и Pentix: состав', () => {
  it('у тетриса несколько вариантов, у Pentix — несколько; число вариантов устройства у тетриса — 51', () => {
    expect(tetrisDef.id).toBe('tetris');
    expect(pentixDef.id).toBe('pentix');
    expect(tetrisDef.modes.length).toBeGreaterThan(1);
    expect(pentixDef.modes.length).toBeGreaterThan(1);
    expect(tetrisDef.declaredModes).toBe(51);
  });
});
