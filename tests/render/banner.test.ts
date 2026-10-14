import { describe, expect, it } from 'vitest';
import type { AnimationsDef } from '../../src/content/schema';
import { Game } from '../../src/core';
import {
  BANNER_COLUMN_TICKS,
  BANNER_ROWS,
  bannerBitmap,
  bannerCells,
  bannerLoopTicks,
  bannerWidth,
} from '../../src/render/banner';
import { effectsWorld, LevelEffects } from '../../src/render/effects';
import { levelOf, loadRoomPack, roomContext } from '../helpers/content';

const viewport = { columns: 13, rows: 6 };

describe('бегущая надпись GAME OVER', () => {
  it('буквы по раскадровке: G, A, M, E 3 × 5 через одну пустую колонку, слова через три', () => {
    const bitmap = bannerBitmap('GAME');
    expect(bitmap).toHaveLength(4 * 3 + 3);
    // G: левая колонка целиком; последняя колонка — ряды 0, 3, 4.
    expect(bitmap[0]).toEqual([true, true, true, true, true]);
    expect(bitmap[2]).toEqual([true, false, false, true, true]);
    // Колонка между буквами пуста.
    expect(bitmap[3]).toEqual(Array(BANNER_ROWS).fill(false));
    // E: полный столбец и три перекладины.
    expect(bitmap[12]).toEqual(Array(BANNER_ROWS).fill(true));
    expect(bitmap[14]).toEqual([true, false, true, false, true]);
    expect(bannerWidth('GAME OVER')).toBe(15 + 3 + 15);
  });

  it('до начала пусто; сразу после начала у правого края входит первая колонка G', () => {
    expect(bannerCells(-1, viewport)).toEqual([]);
    expect(bannerCells(0, viewport)).toEqual([]);
    const entering = bannerCells(BANNER_COLUMN_TICKS, viewport);
    expect(entering.every((c) => c.x === viewport.columns - 1)).toBe(true);
    expect(entering.map((c) => c.y)).toEqual([0, 1, 2, 3, 4]);
  });

  it('плывёт справа налево примерно на 6 колонок в секунду (3 такта на колонку при 20 тактах/с)', () => {
    const at = (dt: number): number => Math.min(...bannerCells(dt, viewport).map((c) => c.x));
    expect(at(BANNER_COLUMN_TICKS * 6)).toBeLessThan(at(BANNER_COLUMN_TICKS * 3));
    expect(at(BANNER_COLUMN_TICKS * 3) - at(BANNER_COLUMN_TICKS * 6)).toBe(3);
    expect(20 / BANNER_COLUMN_TICKS).toBeGreaterThan(6);
  });

  it('клетки всегда в пределах поля; надпись повторяется с началом нового прохода', () => {
    const loop = bannerLoopTicks(viewport.columns);
    for (let dt = 0; dt < loop * 2; dt += 2) {
      for (const cell of bannerCells(dt, viewport)) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(viewport.columns);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeLessThan(BANNER_ROWS);
      }
    }
    expect(bannerCells(loop + 5 * BANNER_COLUMN_TICKS, viewport)).toEqual(bannerCells(5 * BANNER_COLUMN_TICKS, viewport));
  });
});

describe('эффект «конец игры»', () => {
  const pack = loadRoomPack();
  const level = levelOf(pack, 'tunnel-run');
  const animations = pack.animations as AnimationsDef;

  it('в фазе gameOver поле пусто, герой и объекты скрыты, по экрану плывёт надпись блоками уровня', () => {
    const game = new Game(roomContext());
    const fx = new LevelEffects(animations, { viewport: pack.screen.viewport, intro: true });
    const world = effectsWorld(roomContext(), game.state);
    expect(world).not.toBeNull();
    game.state.phase = 'gameOver';
    game.state.tick = 100;
    if (world) fx.onEvent({ type: 'gameOver', tick: 100 }, world);

    game.state.tick = 100 + BANNER_COLUMN_TICKS * 4;
    const frame = fx.frame(game.state, level);
    expect(frame.hiddenTiles).toBe('all');
    expect(frame.objects).toBe(false);
    expect(frame.hero).toBe('hidden');
    expect(frame.fill?.asset).toBe('cell.obstacle');
    expect(frame.fill?.cells.length).toBeGreaterThan(0);

    game.state.phase = 'playing';
    expect(fx.frame(game.state, level).hiddenTiles).toBeNull();
  });
});
