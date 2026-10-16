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
  const draw = (
    panel: 'sea' | 'tank' | 'clock',
    phase: TetrisScene['phase'],
    patch: Partial<TetrisScene> = {},
  ): { name: string; alpha: number }[] => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel, ink: '#000' });
    screen.resize(264, 320, 1);
    screen.setGhost(false);
    screen.render(scene({ phase, sound: false, ...patch }));
    return calls;
  };

  it('«Морской бой» рисует чашку (блюдце — эллипс) на экране ожидания; «168 в 1 танк» — чашку паузы: только на паузе и при полной заливке, танка нет', () => {
    const cup = draw('sea', 'ready');
    expect(cup.filter((call) => call.name === 'ellipse' && call.alpha === 1)).toHaveLength(1);
    expect(cup.filter((call) => call.name === 'roundRect')).toHaveLength(0);
    for (const phase of ['ready', 'playing', 'over'] as const) {
      const tank = draw('tank', phase);
      expect(tank.filter((call) => call.name === 'ellipse')).toHaveLength(0);
      expect(tank.filter((call) => call.name === 'roundRect')).toHaveLength(0);
    }
    const paused = draw('tank', 'paused');
    expect(paused.filter((call) => call.name === 'ellipse' && call.alpha === 1)).toHaveLength(1);
    expect(paused.filter((call) => call.name === 'roundRect')).toHaveLength(0);
    // при полной заливке горит и нота звука (ещё один эллипс — головка ноты)
    const full = draw('tank', 'playing', { allOn: true });
    expect(full.filter((call) => call.name === 'ellipse' && call.alpha === 1)).toHaveLength(2);
    expect(full.filter((call) => call.name === 'roundRect')).toHaveLength(0);
  });

  it('в игре значок «Морского боя» гаснет (как чашка у оригинала), а у «Часов+99» значка внизу нет вовсе', () => {
    expect(draw('sea', 'playing').filter((call) => call.name === 'ellipse')).toHaveLength(0);
    expect(draw('clock', 'ready').filter((call) => call.name === 'roundRect')).toHaveLength(0);
  });

  it('при слое сегментов чашка «168 в 1» бледная вне паузы', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'tank', ink: '#000' });
    screen.resize(264, 320, 1);
    screen.setGhost(true);
    screen.render(scene({ phase: 'playing' }));
    const cups = calls.filter((call) => call.name === 'ellipse' && call.alpha > 0 && call.alpha < 1);
    expect(cups.length).toBeGreaterThanOrEqual(1);
  });
});

describe('экран «168 в 1 танк»: сегменты по фотографии', () => {
  const draw = (panel: 'sea' | 'tank' | 'clock', patch: Partial<TetrisScene>, ghost = false): { name: string; alpha: number }[] => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel, ink: '#000' });
    screen.resize(264, 320, 1);
    screen.setGhost(ghost);
    screen.render(scene(patch));
    return calls;
  };
  const count = (calls: { name: string; alpha: number }[], name: string, alpha?: number): number =>
    calls.filter((call) => call.name === name && (alpha === undefined || call.alpha === alpha)).length;

  it('при полной заливке старшая цифра счёта, SPEED и LEVEL — только «1» (два сегмента): 62 сегмента из 77, одинаково у «168 в 1» и «Морского боя»', () => {
    const tank = draw('tank', { allOn: true, phase: 'ready' });
    const sea = draw('sea', { allOn: true, phase: 'ready' });
    expect(count(sea, 'fillRect', 1)).toBe(count(tank, 'fillRect', 1));
    // матрица 200 ячеек + рамка NEXT 16 (по fillRect на точку) + разделитель 1 + сегменты цифр
    expect(count(tank, 'fillRect', 1)).toBe(200 + 16 + 1 + 62);
  });

  it('счёт показывается до 1 999 999: старшая цифра гаснет вместо нуля и горит единицей', () => {
    const low = draw('tank', { phase: 'playing', score: 0 });
    const million = draw('tank', { phase: 'playing', score: 1_000_000 });
    expect(count(million, 'fillRect', 1) - count(low, 'fillRect', 1)).toBeGreaterThan(0);
    const capped = draw('tank', { phase: 'playing', score: 9_999_999 });
    const max = draw('tank', { phase: 'playing', score: 1_999_999 });
    expect(count(capped, 'fillRect', 1)).toBe(count(max, 'fillRect', 1));
  });

  it('NEXT — сегмент: подпись горит только при наличии превью; в меню (превью нет) её нет', () => {
    const withPreview = draw('tank', { phase: 'playing', preview: new Uint8Array(16) });
    const without = draw('tank', { phase: 'ready', preview: null });
    expect(count(withPreview, 'fillText')).toBe(count(without, 'fillText') + 1);
  });

  it('превью рисуется по значениям клеток; мигающая клетка превью гаснет в тактах второй половины периода', () => {
    const preview = new Uint8Array(16);
    preview[0] = 1;
    preview[5] = 1;
    preview[10] = 2;
    const on = draw('tank', { phase: 'playing', preview, blinkValue: 2, tick: 0 });
    const off = draw('tank', { phase: 'playing', preview, blinkValue: 2, tick: 15 });
    expect(count(on, 'strokeRect', 1)).toBe(3);
    expect(count(off, 'strokeRect', 1)).toBe(2);
  });

  it('мигающие клетки матрицы гаснут и загораются; обычные горят всегда', () => {
    const cells = new Uint8Array(FIELD_COLUMNS * FIELD_ROWS);
    cells[0] = 1;
    cells[1] = 2;
    cells[2] = 2;
    const on = draw('tank', { phase: 'playing', cells, blinkValue: 2, tick: 0 });
    const off = draw('tank', { phase: 'playing', cells, blinkValue: 2, tick: 15 });
    const again = draw('tank', { phase: 'playing', cells, blinkValue: 2, tick: 30 });
    expect(count(on, 'strokeRect', 1)).toBe(3);
    expect(count(off, 'strokeRect', 1)).toBe(1);
    expect(count(again, 'strokeRect', 1)).toBe(3);
  });

  it('без blinkValue (тетрис-заглушка) значение 2 — обычная клетка (фигура O), не мигает', () => {
    const cells = new Uint8Array(FIELD_COLUMNS * FIELD_ROWS);
    cells[1] = 2;
    expect(count(draw('sea', { phase: 'playing', cells, tick: 15 }), 'strokeRect', 1)).toBe(1);
  });

  it('повторный кадр с тем же превью и мигающей фазой не перерисовывается, смена фазы мигания — перерисовывается', () => {
    const { canvas, calls } = stubCanvas();
    const screen = new TetrisScreen(canvas, { glyph: 'square', panel: 'tank', ink: '#000' });
    screen.resize(264, 320, 1);
    const cells = new Uint8Array(FIELD_COLUMNS * FIELD_ROWS);
    cells[1] = 2;
    const frame = scene({ phase: 'playing', cells, blinkValue: 2, tick: 1, preview: null });
    screen.render(frame);
    calls.length = 0;
    screen.render({ ...frame, tick: 2 });
    expect(calls).toHaveLength(0);
    screen.render({ ...frame, tick: 16 });
    expect(calls.length).toBeGreaterThan(0);
  });
});
