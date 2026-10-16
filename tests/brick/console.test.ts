import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  BrickBase,
  BrickConsole,
  type BrickConsoleEntry,
  CELL_ON,
  ILLUSTRATIONS,
  MENU_SETTING_MAX,
  NEUTRAL_BRICK_INPUT,
  cellIndex,
  emptyField,
  makeBrickInput,
  menuField,
  type BrickAction,
  type BrickGameDef,
  type BrickGameOptions,
  type BrickInput,
} from '../../src/brick';

/** Пробная игра: хранит параметры, с которыми создана, и ничего не делает. */
class StubGame extends BrickBase {
  readonly id: string;
  readonly created: BrickGameOptions;
  constructor(id: string, options: BrickGameOptions, modes: number) {
    super(options, modes);
    this.id = id;
    this.created = options;
    this.init();
  }
  protected reset(): void {
    this.setLives(3);
  }
  protected update(input: BrickInput): void {
    if (input.pressed.has('fire')) this.addScore(10);
    if (input.pressed.has('up')) this.gameOver();
  }
  protected draw(): Uint8Array {
    const out = emptyField();
    out[0] = CELL_ON;
    return out;
  }
}

const def = (id: string, modes: number): BrickGameDef => ({
  id,
  declaredModes: null,
  modes: Array.from({ length: modes }, (_, i) => ({ name: { ru: `в${i + 1}`, en: `m${i + 1}` }, note: 'проба' })),
  create: (options) => new StubGame(id, options, modes),
});

const entry = (symbol: string, game: BrickGameDef | null, extra: Partial<BrickConsoleEntry> = {}): BrickConsoleEntry => ({
  symbol,
  id: game?.id ?? 'sea-battle',
  def: game,
  ...extra,
});
const catalog = [entry('1', def('tank', 5)), entry('2', def('frog', 3)), entry('3', def('racing', 4))];
const press = (...actions: BrickAction[]): BrickInput => makeBrickInput(actions);
const lit = (field: Uint8Array, cols: number[], rows: number[]): boolean => rows.every((y) => cols.every((x) => field[cellIndex(x, y)] !== 0));

describe('рисунок меню по фотографии экрана', () => {
  const field = menuField('2', 1, 'frog');

  it('крупная «2» в колонках 4–7, строки 0–6: верх, боковые чёрточки, диагональ, нижняя перекладина', () => {
    expect(lit(field, [5, 6], [0])).toBe(true);
    expect(lit(field, [4, 7], [1, 2])).toBe(true);
    expect(lit(field, [6], [3])).toBe(true);
    expect(lit(field, [5], [4])).toBe(true);
    expect(lit(field, [4], [5])).toBe(true);
    expect(lit(field, [4, 5, 6, 7], [6])).toBe(true);
    expect(field[cellIndex(7, 6)]).toBe(1);
    expect(field[cellIndex(3, 3)]).toBe(0);
  });

  it('номер варианта «01»: ноль в колонках 2–4 (строки 8–12), единица — чёрта у правого края цифры', () => {
    expect(lit(field, [2, 3, 4], [8, 12])).toBe(true);
    expect(lit(field, [2, 4], [9, 10, 11])).toBe(true);
    expect(field[cellIndex(3, 10)]).toBe(0);
    expect(lit(field, [9], [8, 9, 10, 11, 12])).toBe(true);
    expect(field[cellIndex(8, 10)]).toBe(0);
    expect(field[cellIndex(7, 10)]).toBe(0);
  });

  it('иллюстрация лягушки: одна клетка в нижней строке, машины в полосах над ней', () => {
    expect(lit(field, [4], [19])).toBe(true);
    expect([...field.slice(19 * BRICK_COLS, 20 * BRICK_COLS)].filter(Boolean).length).toBe(1);
    expect(lit(field, [3, 4, 5], [15])).toBe(true);
    expect(lit(field, [1, 2, 3], [16])).toBe(true);
    expect(lit(field, [5, 6, 7], [17])).toBe(true);
    expect(lit(field, [0, 1], [18])).toBe(true);
    expect(lit(field, [6, 7, 8], [18])).toBe(true);
  });

  it('у каждой игры есть иллюстрация 10 × 5, и все они различаются', () => {
    const ids = Object.keys(ILLUSTRATIONS);
    expect(ids.length).toBe(12);
    for (const id of ids) {
      const art = ILLUSTRATIONS[id] ?? [];
      expect(art.length).toBe(5);
      for (const row of art) expect(row.length).toBe(BRICK_COLS);
    }
    expect(new Set(ids.map((id) => (ILLUSTRATIONS[id] ?? []).join('/'))).size).toBe(ids.length);
  });

  it('все цифры 0..9 рисуются, поле 10 × 20', () => {
    for (let n = 0; n < 10; n++) {
      const picture = menuField(String(n), n + 10, 'tank');
      expect(picture.length).toBe(BRICK_COLS * BRICK_ROWS);
      expect([...picture.slice(0, 7 * BRICK_COLS)].some(Boolean)).toBe(true);
    }
  });
});

describe('консоль: меню', () => {
  it('в меню ждёт; по умолчанию выбрана первая игра, вариант 01, скорость и уровень 0', () => {
    const console_ = new BrickConsole({ catalog });
    expect(console_.inMenu).toBe(true);
    expect(console_.phase).toBe('ready');
    expect([console_.gameNumber, console_.modeNumber, console_.displaySpeed, console_.displayLevel]).toEqual([1, 1, 0, 0]);
    expect(console_.speed).toBe(1);
    expect(console_.level).toBe(1);
    expect(console_.preview()).toBeNull();
    expect(console_.lives).toBeNull();
    expect(console_.gameId).toBe('tank');
  });

  it('ROTATE листает игры по кругу и сбрасывает вариант; UP/DOWN листают варианты по кругу', () => {
    const console_ = new BrickConsole({ catalog });
    expect(console_.menu(press('up')).length).toBe(1);
    expect(console_.modeNumber).toBe(2);
    console_.menu(press('down'));
    console_.menu(press('down'));
    expect(console_.modeNumber).toBe(5);
    console_.menu(press('rotate'));
    expect([console_.gameNumber, console_.modeNumber, console_.gameId]).toEqual([2, 1, 'frog']);
    console_.menu(press('rotate'));
    console_.menu(press('fire'));
    expect(console_.gameNumber).toBe(1);
    for (let i = 0; i < 5; i++) console_.menu(press('up'));
    expect(console_.modeNumber).toBe(1);
  });

  it('LEFT — уровень, RIGHT — скорость, оба по кругу 0..9; удержание без фронта ничего не меняет', () => {
    const console_ = new BrickConsole({ catalog });
    for (let i = 0; i < 3; i++) console_.menu(press('left'));
    expect(console_.displayLevel).toBe(3);
    for (let i = 0; i < MENU_SETTING_MAX + 1; i++) console_.menu(press('right'));
    expect(console_.displaySpeed).toBe(0);
    expect(console_.menu(makeBrickInput([], ['left', 'right', 'up', 'rotate']))).toEqual([]);
    expect(console_.displayLevel).toBe(3);
    expect(console_.menu(NEUTRAL_BRICK_INPUT)).toEqual([]);
  });

  it('начальный выбор ограничивается диапазонами', () => {
    const console_ = new BrickConsole({ catalog, game: 7, mode: 9, speed: 42, level: -3 });
    expect([console_.gameNumber, console_.modeNumber, console_.displaySpeed, console_.displayLevel]).toEqual([2, 1, 9, 0]);
  });

  it('у консоли с буквами знак игры — буква: рисуется «A», по кругу A–F', () => {
    const letters = new BrickConsole({
      catalog: ['A', 'B', 'C', 'D', 'E', 'F'].map((symbol, i) => entry(symbol, i === 1 ? def('tank', 5) : null, { id: `g${symbol}` })),
    });
    expect(letters.symbol).toBe('A');
    expect(lit(letters.cells(), [5, 6], [0])).toBe(true);
    expect(lit(letters.cells(), [4, 5, 6, 7], [3])).toBe(true); // перекладина «A»
    for (let i = 0; i < 6; i++) letters.menu(press('rotate'));
    expect(letters.symbol).toBe('A');
    letters.menu(press('rotate'));
    expect(letters.symbol).toBe('B');
  });

  it('урезанный список вариантов: меню показывает только выбранные, игре передаётся её собственный номер варианта', () => {
    const records: BrickGameOptions[] = [];
    const base = def('tank', 5);
    const spy: BrickGameDef = { ...base, create: (options) => (records.push(options), new StubGame('tank', options, 5)) };
    const console_ = new BrickConsole({ catalog: [entry('B', spy, { modes: [3, 1] })] });
    expect(console_.modeCount).toBe(2);
    console_.menu(press('up'));
    console_.menu(press('up'));
    expect(console_.modeNumber).toBe(1);
    console_.menu(press('up'));
    expect(console_.mode).toBe(1);
    console_.start();
    expect(records[0]?.mode).toBe(1);
    expect(console_.modeCount).toBe(2);
  });

  it('невосстановленная игра выбирается, но не запускается: событие blocked, меню остаётся', () => {
    const console_ = new BrickConsole({ catalog: [entry('A', null, { id: 'sea-battle' })] });
    expect(console_.playable).toBe(false);
    expect(console_.start()).toEqual([{ type: 'blocked' }]);
    expect(console_.inMenu).toBe(true);
    expect(console_.phase).toBe('ready');
    expect(console_.modeCount).toBe(1);
    expect(console_.cells().some(Boolean)).toBe(true);
  });

  it('пустой каталог — ошибка', () => {
    expect(() => new BrickConsole({ catalog: [] })).toThrow();
  });

  it('рекорд в меню — выбранной игры и варианта', () => {
    const console_ = new BrickConsole({ catalog, hiScore: (id, mode) => (id === 'frog' && mode === 1 ? 777 : 0) });
    expect(console_.hiScore).toBe(0);
    console_.menu(press('rotate'));
    console_.menu(press('up'));
    expect(console_.hiScore).toBe(777);
  });

  it('картинка меню меняется вместе с выбором', () => {
    const console_ = new BrickConsole({ catalog });
    const first = [...console_.cells()];
    console_.menu(press('up'));
    expect([...console_.cells()]).not.toEqual(first);
    console_.menu(press('rotate'));
    expect([...console_.cells()]).toEqual([...menuField('2', 1, 'frog')]);
  });
});

describe('консоль: игра', () => {
  it('старт запускает выбранную игру с выбранными параметрами; зерно у партий разное, но повторяемое', () => {
    const records: BrickGameOptions[] = [];
    const spy: BrickGameDef = { ...def('tank', 5), create: (options) => (records.push(options), new StubGame('tank', options, 5)) };
    const console_ = new BrickConsole({ catalog: [entry('1', spy)], seed: 11, hiScore: () => 55 });
    console_.menu(press('up'));
    console_.menu(press('up'));
    console_.menu(press('left'));
    console_.menu(press('right'));
    console_.menu(press('right'));
    expect(console_.start()).toEqual([{ type: 'started' }]);
    expect(console_.inMenu).toBe(false);
    expect(console_.phase).toBe('playing');
    expect(records[0]).toMatchObject({ mode: 2, speed: 3, level: 2, hiScore: 55 });
    expect(console_.hiScore).toBe(55);
    expect(console_.lives).toBe(3);
    expect(console_.preview()).not.toBeNull();
    expect([console_.displaySpeed, console_.displayLevel]).toEqual([2, 1]);
    console_.restart();
    expect(console_.inMenu).toBe(true);
    expect([console_.modeNumber, console_.displaySpeed]).toEqual([3, 2]);
    console_.start();
    expect(records[1]?.seed).not.toBe(records[0]?.seed);
    const again = new BrickConsole({ catalog: [entry('1', spy)], seed: 11 });
    again.menu(press('up'));
    again.start();
    expect(records[2]?.seed).toBe(records[0]?.seed);
  });

  it('игра идёт внутри: ввод, счёт, пауза, конец игры; меню в игре не реагирует; после конца «старт» — та же игра', () => {
    const console_ = new BrickConsole({ catalog });
    console_.start();
    expect(console_.menu(press('rotate', 'up'))).toEqual([]);
    expect(console_.gameNumber).toBe(1);
    console_.step(press('fire'));
    expect(console_.score).toBe(10);
    expect(console_.pause()).toEqual([{ type: 'paused' }]);
    expect(console_.phase).toBe('paused');
    expect(console_.resume()).toEqual([{ type: 'resumed' }]);
    console_.step(press('up'));
    for (let i = 0; i < 100; i++) console_.step(NEUTRAL_BRICK_INPUT);
    expect(console_.phase).toBe('over');
    expect(console_.overFill).toBe(BRICK_ROWS);
    const first = console_.game;
    console_.start();
    expect(console_.phase).toBe('playing');
    expect(console_.game).toBe(first);
    expect(console_.score).toBe(0);
    console_.restart();
    expect(console_.game).toBeNull();
    expect(console_.phase).toBe('ready');
  });

  it('cells в игре — поле игры', () => {
    const console_ = new BrickConsole({ catalog });
    console_.start();
    expect(console_.cells()[0]).toBe(1);
    expect(console_.cells().filter(Boolean).length).toBe(1);
  });
});
