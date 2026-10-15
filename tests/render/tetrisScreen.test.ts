import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TetrisScreen, type TetrisScene } from '../../src/render/tetrisScreen';
import { FIELD_COLUMNS, FIELD_ROWS } from '../../src/tetris';

/** Холст-пустышка: считает вызовы рисования (с учётом прозрачности), без браузера. */
function stubCanvas(): { canvas: HTMLCanvasElement; calls: { name: string; alpha: number }[] } {
  const calls: { name: string; alpha: number }[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1 };
  const context = new Proxy(state, {
    get(target, property: string) {
      if (property in target) return target[property];
      return (): void => {
        calls.push({ name: property, alpha: Number(target['globalAlpha']) });
      };
    },
    set(target, property: string, value) {
      target[property] = value;
      return true;
    },
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => context } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

const scene = (patch: Partial<TetrisScene> = {}): TetrisScene => ({
  cells: new Uint8Array(FIELD_COLUMNS * FIELD_ROWS),
  clearRows: [],
  clearTimer: 0,
  overFill: 0,
  next: null,
  score: 0,
  hiScore: 0,
  speed: 1,
  level: 1,
  sound: false,
  phase: 'playing',
  tick: 0,
  allOn: false,
  ...patch,
});

const litCells = (patch: Partial<TetrisScene>): Uint8Array => {
  const cells = new Uint8Array(FIELD_COLUMNS * FIELD_ROWS);
  cells.set([1, 1, 1, 1], 5 * FIELD_COLUMNS);
  return patch.cells ?? cells;
};

describe('экран тетриса: рисунок ячейки', () => {
  it('«Морской бой»: включённая ячейка — прямоугольник с точкой; без слоя сегментов выключенные не рисуются', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    screen.resize(264, 320, 1);
    screen.setGhost(false);
    screen.render(scene({ cells: litCells({}) }));
    expect(calls.filter((call) => call.name === 'strokeRect' && call.alpha === 1)).toHaveLength(4);
    expect(calls.filter((call) => call.name === 'strokeRect' && call.alpha < 1)).toHaveLength(0);
  });

  it('«Часы+99»: включённая ячейка — шесть лепестков звёздочки в рамке', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'star', panel: 'clock', ink: '#000' });
    screen.resize(264, 320, 1);
    screen.setGhost(false);
    screen.render(scene({ cells: litCells({}) }));
    expect(calls.filter((call) => call.name === 'ellipse' && call.alpha === 1)).toHaveLength(4 * 6);
    expect(calls.filter((call) => call.name === 'strokeRect' && call.alpha === 1)).toHaveLength(4);
  });

  it('слой сегментов: выключенные ячейки рисуются бледными — по одной на каждую из 200 клеток матрицы', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    screen.resize(264, 320, 1);
    screen.setGhost(true);
    screen.render(scene({ cells: litCells({}) }));
    const faint = calls.filter((call) => call.name === 'strokeRect' && call.alpha < 1);
    // 196 выключенных клеток матрицы и ещё 16 бледных ячеек окошка NEXT 4 × 4.
    expect(faint).toHaveLength(FIELD_COLUMNS * FIELD_ROWS - 4 + 16);
  });

  it('вспышка при включении: горят все 200 ячеек; чашка у «Морского боя» нарисована, у «Часов+99» значки режима', () => {
    const sea = stubCanvas();
    const a = new TetrisScreen(sea.canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    a.resize(264, 320, 1);
    a.setGhost(false);
    a.render(scene({ allOn: true }));
    expect(sea.calls.filter((call) => call.name === 'strokeRect' && call.alpha === 1).length).toBeGreaterThanOrEqual(FIELD_COLUMNS * FIELD_ROWS);

    const clock = stubCanvas();
    const b = new TetrisScreen(clock.canvas, { glyph: 'star', panel: 'clock', ink: '#000' });
    b.resize(264, 320, 1);
    b.setGhost(false);
    b.render(scene({ allOn: true }));
    expect(clock.calls.filter((call) => call.name === 'arc' && call.alpha === 1).length).toBeGreaterThan(0); // значок часов
  });

  it('сгорающий ряд мигает: на нечётной половине периода ячейки погашены', () => {
    const full = new Uint8Array(FIELD_COLUMNS * FIELD_ROWS);
    full.fill(1, 19 * FIELD_COLUMNS);
    const on = stubCanvas();
    const a = new TetrisScreen(on.canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    a.resize(264, 320, 1);
    a.setGhost(false);
    a.render(scene({ cells: full, clearRows: [19], clearTimer: 24 })); // 24 / 4 = 6 — чётное: горит
    expect(on.calls.filter((call) => call.name === 'strokeRect' && call.alpha === 1)).toHaveLength(FIELD_COLUMNS);
    const off = stubCanvas();
    const b = new TetrisScreen(off.canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    b.resize(264, 320, 1);
    b.setGhost(false);
    b.render(scene({ cells: full, clearRows: [19], clearTimer: 20 })); // 20 / 4 = 5 — нечётное: погашено
    expect(off.calls.filter((call) => call.name === 'strokeRect' && call.alpha === 1)).toHaveLength(0);
  });

  it('конец игры: залиты нижние ряды по счётчику overFill', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    screen.resize(264, 320, 1);
    screen.setGhost(false);
    screen.render(scene({ overFill: 3 }));
    expect(calls.filter((call) => call.name === 'strokeRect' && call.alpha === 1)).toHaveLength(3 * FIELD_COLUMNS);
  });

  it('холст вписывается в окно без растяжения: логический размер 264 × 320, ячейка квадратная', () => {
    const { canvas } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    screen.resize(132, 160, 2);
    expect(canvas.width).toBe(264);
    expect(canvas.height).toBe(320);
    expect(canvas.style.width).toBe('132px');
    expect(SCREEN_HEIGHT / FIELD_ROWS).toBe(16); // ячейка 16 × 16: матрица 160 × 320, остальное — боковая панель
    expect(SCREEN_WIDTH).toBeGreaterThan((SCREEN_HEIGHT / FIELD_ROWS) * FIELD_COLUMNS);
  });
});

describe('экран тетриса: перерисовка только при видимых изменениях', () => {
  it('пропускает одинаковые кадры, но замечает изменение той же матрицы и счёта', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    screen.resize(264, 320, 1);
    const frame = scene();
    screen.render(frame);
    calls.length = 0;
    screen.render({ ...frame, tick: 1 });
    expect(calls).toHaveLength(0);
    frame.cells[0] = 1;
    screen.render(frame);
    expect(calls.some(c => c.name === 'strokeRect')).toBe(true);
    calls.length = 0;
    screen.render({ ...frame, score: 100 });
    expect(calls.some(c => c.name === 'fillRect')).toBe(true);
  });

  it('перерисовывает после смены сегментов, размера, сбоя шлейфа и выключения', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    screen.resize(264, 320, 1);
    const frame = scene();
    screen.render(frame);
    for (const invalidate of [() => screen.setGhost(true), () => screen.resize(132, 160, 2), () => screen.dropout(.5, 1), () => screen.clear()]) {
      invalidate();
      calls.length = 0;
      screen.render(frame);
      expect(calls.some(c => c.name === 'strokeRect')).toBe(true);
    }
    screen.clear();
    calls.length = 0;
    screen.clear();
    expect(calls).toHaveLength(0);
  });

  it('сохраняет мигание сгорающих рядов и смену счёта на рекорд после конца игры', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'sea', ink: '#000' });
    screen.resize(264, 320, 1);
    const clearing = scene({ cells: litCells({}), clearRows: [5], clearTimer: 24 });
    screen.render(clearing);
    calls.length = 0;
    screen.render({ ...clearing, clearTimer: 23 });
    expect(calls.some(c => c.name === 'clearRect')).toBe(true);
    const over = scene({ phase: 'over', overFill: 20, tick: 0, score: 10, hiScore: 100 });
    screen.render(over);
    calls.length = 0;
    screen.render({ ...over, tick: 90 });
    expect(calls.some(c => c.name === 'fillRect')).toBe(true);
  });
});

describe('значок игры в углу боковой панели', () => {
  const draw = (panel: 'sea' | 'tank' | 'clock', phase: TetrisScene['phase']): { name: string; alpha: number }[] => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel, ink: '#000' });
    screen.resize(264, 320, 1);
    screen.setGhost(false);
    screen.render(scene({ phase, sound: false }));
    return calls;
  };

  it('«Морской бой» рисует чашку (блюдце — эллипс), «168 в 1 танк» — танк (гусеница — скруглённый прямоугольник); на экране ожидания они горят', () => {
    const cup = draw('sea', 'ready');
    const tank = draw('tank', 'ready');
    expect(cup.filter((call) => call.name === 'ellipse' && call.alpha === 1)).toHaveLength(1);
    expect(cup.filter((call) => call.name === 'roundRect')).toHaveLength(0);
    expect(tank.filter((call) => call.name === 'roundRect' && call.alpha === 1).length).toBeGreaterThanOrEqual(2); // гусеница и башня
    expect(tank.filter((call) => call.name === 'ellipse')).toHaveLength(0); // чашки нет
  });

  it('в игре значок гаснет (как чашка у оригинала), а у «Часов+99» значка внизу нет вовсе', () => {
    expect(draw('tank', 'playing').filter((call) => call.name === 'roundRect')).toHaveLength(0);
    expect(draw('sea', 'playing').filter((call) => call.name === 'ellipse')).toHaveLength(0);
    expect(draw('clock', 'ready').filter((call) => call.name === 'roundRect')).toHaveLength(0);
  });
});
