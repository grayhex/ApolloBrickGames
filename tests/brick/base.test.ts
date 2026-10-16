import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  BrickBase,
  CELL_ON,
  Countdown,
  GAME_OVER_HOLD_TICKS,
  GAME_OVER_TICKS_PER_ROW,
  NEUTRAL_BRICK_INPUT,
  Repeater,
  Rng,
  blit,
  cellIndex,
  emptyField,
  flipSprite,
  genuineTicks,
  inField,
  livesPreview,
  makeBrickInput,
  mirrorSprite,
  msToTicks,
  pictureField,
  removeRow,
  rotateSprite,
  rowEmpty,
  rowFull,
  spriteCells,
  spriteHits,
  type BrickGameDef,
  type BrickGameOptions,
  type BrickInput,
} from '../../src/brick';
import { conformance } from './conformance';

/** Пробная игра: клетка идёт вправо по верхней строке; «вверх» — потеря жизни со взрывом, пять шагов подряд — победа в уровне, жизни кончились — конец игры. */
class DemoGame extends BrickBase {
  readonly id = 'demo';
  x = 0;
  private readonly period = new Countdown(3);

  constructor(options: BrickGameOptions = {}) {
    super(options, 2);
    this.init();
  }

  protected reset(): void {
    this.x = 0;
    this.setLives(2);
    this.scoresToExtraLife = 50;
    this.period.reset(3);
  }

  protected update(input: BrickInput): void {
    if (input.pressed.has('up')) {
      this.emit({ type: 'crash' });
      this.setLives((this.lives ?? 0) - 1);
      const exit = (): void => {
        if ((this.lives ?? 0) <= 0) this.gameOver();
        else this.x = 0;
      };
      this.animateKaboom(this.x, 0, exit);
      return;
    }
    if (input.pressed.has('rotate')) {
      this.animateClear(20, () => {
        this.nextLevel();
        this.x = 0;
      });
      return;
    }
    if (input.pressed.has('fire')) this.addScore(60);
    if (!this.period.fire()) return;
    this.x = Math.min(BRICK_COLS - 1, this.x + 1);
    this.addScore(1);
  }

  protected draw(): Uint8Array {
    const out = emptyField();
    out[cellIndex(this.x, 0)] = CELL_ON;
    return out;
  }
}

const demoDef: BrickGameDef = {
  id: 'demo',
  declaredModes: null,
  modes: [
    { name: { ru: 'Первый', en: 'First' }, note: 'проверка основы' },
    { name: { ru: 'Второй', en: 'Second' }, note: 'проверка основы' },
  ],
  create: (options) => new DemoGame(options),
};

const idle = (game: DemoGame, ticks: number): void => {
  for (let i = 0; i < ticks; i++) game.step(NEUTRAL_BRICK_INPUT);
};

describe('основа игры: фазы и параметры', () => {
  it('новая игра ждёт, старт запускает, пауза замораживает такты', () => {
    const game = new DemoGame({ seed: 3 });
    expect(game.phase).toBe('ready');
    expect(game.step(NEUTRAL_BRICK_INPUT)).toEqual([]);
    expect(game.tick).toBe(0);
    expect(game.start()).toEqual([{ type: 'started' }]);
    expect(game.start()).toEqual([]);
    idle(game, 6);
    expect(game.tick).toBe(6);
    expect(game.x).toBe(2);
    game.pause();
    idle(game, 6);
    expect(game.tick).toBe(6);
    game.resume();
    idle(game, 3);
    expect(game.x).toBe(3);
  });

  it('скорость, уровень и рекорд из параметров ограничены; вариант берётся по кругу', () => {
    const game = new DemoGame({ speed: 42, level: 0, hiScore: -5 });
    expect(game.speed).toBe(10);
    expect(game.level).toBe(1);
    expect(game.hiScore).toBe(0);
    expect(new DemoGame({ mode: 3 })['mode']).toBe(1);
    expect(new DemoGame({ mode: -1 })['mode']).toBe(1);
    expect(new DemoGame({ mode: Number.NaN })['mode']).toBe(0);
  });

  it('жизни показываются в превью парами клеток; без жизней превью нет', () => {
    const game = new DemoGame();
    expect([...(game.preview() ?? [])]).toEqual([...livesPreview(2)]);
    expect(livesPreview(4).filter((cell) => cell).length).toBe(8);
    expect(new DemoGame({}).preview()).not.toBeNull();
  });
});

describe('основа игры: счёт, жизни, уровни', () => {
  it('счёт считает рекорд; каждые 50 очков — добавочная жизнь, у полных жизней — бонус к счёту', () => {
    const game = new DemoGame({ hiScore: 10 });
    game.start();
    game.step(makeBrickInput(['fire']));
    expect(game.score).toBe(60);
    expect(game.hiScore).toBe(60);
    expect(game.lives).toBe(3);
    const events = game.step(makeBrickInput(['fire']));
    expect(events.map((event) => event.type)).toContain('bonus');
    expect(game.lives).toBe(4);
    game.step(makeBrickInput(['fire']));
    game.step(makeBrickInput(['fire']));
    expect(game.lives).toBe(4);
    expect(game.score).toBeGreaterThan(240);
  });

  it('потеря жизни: взрыв без ввода, затем игра продолжается; на последней жизни — конец игры', () => {
    const game = new DemoGame();
    game.start();
    idle(game, 6);
    const lost = game.step(makeBrickInput(['up']));
    expect(lost.map((event) => event.type)).toEqual(['crash']);
    expect(game.lives).toBe(1);
    const kaboomTicks = 4 * 7 * 4;
    const frozenX = game.x;
    for (let i = 0; i < kaboomTicks - 1; i++) {
      game.step(makeBrickInput(['fire']));
      expect(game.x).toBe(frozenX);
      expect(game.score).toBe(frozenScore(game));
    }
    game.step(NEUTRAL_BRICK_INPUT);
    expect(game.x).toBe(0);
    game.step(makeBrickInput(['up']));
    for (let i = 0; i < kaboomTicks; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(game['dying']).toBe(true);
  });

  it('победа в уровне: очистка поля, затем уровень растёт; после десятого — первый уровень и скорость выше', () => {
    const game = new DemoGame({ speed: 3, level: 9 });
    game.start();
    game.step(makeBrickInput(['rotate']));
    const during = game.cells();
    expect(during.length).toBe(BRICK_COLS * BRICK_ROWS);
    for (let i = 0; i < 20; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(game.level).toBe(10);
    expect(game.speed).toBe(3);
    game.step(makeBrickInput(['rotate']));
    for (let i = 0; i < 20; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(game.level).toBe(1);
    expect(game.speed).toBe(4);
  });

  it('очистка поля заливает его снизу вверх и стирает сверху вниз', () => {
    const game = new DemoGame();
    game.start();
    game.step(makeBrickInput(['rotate']));
    const rowsLit = (): number[] => {
      const cells = game.cells();
      const rows: number[] = [];
      for (let y = 0; y < BRICK_ROWS; y++) if (cells[cellIndex(0, y)]) rows.push(y);
      return rows;
    };
    // в первом такте сценки заливается первая строка снизу
    expect(rowsLit()).toContain(BRICK_ROWS - 1);
    for (let i = 0; i < 9; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(rowsLit().length).toBe(BRICK_ROWS); // середина: поле залито полностью
    for (let i = 0; i < 10; i++) game.step(NEUTRAL_BRICK_INPUT);
    expect(rowsLit().length).toBeLessThan(BRICK_ROWS);
  });
});

function frozenScore(game: DemoGame): number {
  return game.score;
}

describe('основа игры: конец игры и перезапуск', () => {
  it('заливка рядов идёт снизу, после паузы фаза `over`; повторный старт — новая партия с сохранённым рекордом', () => {
    const game = new DemoGame();
    game.start();
    game.step(makeBrickInput(['fire']));
    const hi = game.hiScore;
    game['gameOver']();
    let overSeen = false;
    for (let i = 0; i < BRICK_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS + 2; i++) {
      game.step(NEUTRAL_BRICK_INPUT);
      if (game.phase === 'over') overSeen = true;
    }
    expect(overSeen).toBe(true);
    expect(game.overFill).toBe(BRICK_ROWS);
    expect(game.step(NEUTRAL_BRICK_INPUT)).toEqual([]);
    game.start();
    expect(game.phase).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.overFill).toBe(0);
    expect(game.hiScore).toBe(hi);
    expect(game.lives).toBe(2);
  });

  it('restart возвращает партию к ожиданию', () => {
    const game = new DemoGame();
    game.start();
    idle(game, 9);
    game.restart();
    expect(game.phase).toBe('ready');
    expect(game.x).toBe(0);
    expect(game.tick).toBe(0);
  });
});

describe('основа игры: общие проверки каталога на пробной игре', () => {
  conformance(demoDef, { fuzzTicks: 600 });
});

describe('время: такты, таймеры, автоповтор', () => {
  it('миллисекунды в такты: не меньше одного, 60 Гц', () => {
    expect(msToTicks(1000)).toBe(60);
    expect(msToTicks(1)).toBe(1);
    expect(msToTicks(500)).toBe(30);
  });

  it('«настоящая» скорость равномерно идёт от скорости первого уровня к десятому', () => {
    expect(genuineTicks(1, 1000, 100)).toBe(msToTicks(1000));
    expect(genuineTicks(10, 1000, 100)).toBe(msToTicks(100));
    expect(genuineTicks(5, 1000, 100)).toBe(msToTicks(600));
    expect(genuineTicks(99, 1000, 100)).toBe(genuineTicks(10, 1000, 100));
    expect(genuineTicks(0, 1000, 100)).toBe(genuineTicks(1, 1000, 100));
  });

  it('Countdown срабатывает раз в период и сбрасывается', () => {
    const timer = new Countdown(3);
    expect([1, 2, 3, 4, 5, 6].map(() => timer.fire())).toEqual([false, false, true, false, false, true]);
    timer.reset(2);
    expect([timer.fire(), timer.fire()]).toEqual([false, true]);
  });

  it('Repeater: сразу по нажатию, потом после задержки с интервалом; отпущенная кнопка начинает заново', () => {
    const repeater = new Repeater(4, 2);
    const down = makeBrickInput(['left']);
    const held = makeBrickInput([], ['left']);
    expect(repeater.fire('left', down)).toBe(true);
    const fired = [1, 2, 3, 4, 5, 6, 7, 8].map(() => repeater.fire('left', held));
    expect(fired).toEqual([false, false, false, true, false, true, false, true]);
    expect(repeater.fire('left', NEUTRAL_BRICK_INPUT)).toBe(false);
    expect(repeater.fire('left', held)).toBe(false);
  });
});

describe('сетка и спрайты', () => {
  const sprite = ['##.', '.#.', '.##'];

  it('границы поля', () => {
    expect(inField(0, 0)).toBe(true);
    expect(inField(9, 19)).toBe(true);
    expect(inField(10, 0)).toBe(false);
    expect(inField(0, -1)).toBe(false);
  });

  it('blit рисует с обрезкой и считает нарисованное', () => {
    const buffer = emptyField();
    expect(blit(buffer, sprite, 0, 0)).toBe(5);
    expect(blit(buffer, sprite, 9, 19, 2)).toBe(1); // остальные клетки вышли за поле
    expect(buffer[cellIndex(9, 19)]).toBe(2);
    expect(spriteCells(sprite).length).toBe(5);
  });

  it('spriteHits: столкновение с горящими клетками и с краем', () => {
    const buffer = emptyField();
    buffer[cellIndex(3, 3)] = 1;
    expect(spriteHits(buffer, ['#'], 3, 3)).toBe(true);
    expect(spriteHits(buffer, ['#'], 4, 3)).toBe(false);
    expect(spriteHits(buffer, ['##'], 9, 0)).toBe(true);
  });

  it('поворот, отражение, переворот', () => {
    expect(rotateSprite(['#.', '##'])).toEqual(['##', '#.']);
    expect(mirrorSprite(['#..', '##.'])).toEqual(['..#', '.##']);
    expect(flipSprite(['#..', '##.'])).toEqual(['##.', '#..']);
    const four = rotateSprite(rotateSprite(rotateSprite(rotateSprite(sprite))));
    expect(four).toEqual(sprite);
  });

  it('строки: полная, пустая, удаление сдвигает верх вниз', () => {
    const buffer = emptyField();
    for (let x = 0; x < BRICK_COLS; x++) buffer[cellIndex(x, 5)] = 1;
    buffer[cellIndex(2, 4)] = 1;
    expect(rowFull(buffer, 5)).toBe(true);
    expect(rowEmpty(buffer, 6)).toBe(true);
    removeRow(buffer, 5);
    expect(rowFull(buffer, 5)).toBe(false);
    expect(buffer[cellIndex(2, 5)]).toBe(1);
    expect(rowEmpty(buffer, 0)).toBe(true);
  });

  it('pictureField: `#` горит, `*` мигает, смещение и обрезка', () => {
    const picture = pictureField(['#*', '.#'], 8, 18);
    expect(picture[cellIndex(8, 18)]).toBe(1);
    expect(picture[cellIndex(9, 18)]).toBe(2);
    expect(picture[cellIndex(9, 19)]).toBe(1);
  });
});

describe('Rng', () => {
  it('одно зерно — одна последовательность; диапазоны и перемешивание корректны', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    const seq = (rng: Rng): number[] => Array.from({ length: 20 }, () => rng.int(7));
    expect(seq(a)).toEqual(seq(b));
    const rng = new Rng(9);
    for (let i = 0; i < 200; i++) {
      const value = rng.range(3, 6);
      expect(value >= 3 && value <= 6).toBe(true);
    }
    expect(rng.int(1)).toBe(0);
    expect(rng.int(0)).toBe(0);
    const shuffled = new Rng(2).shuffled([1, 2, 3, 4, 5, 6]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => rng.pick([])).toThrow();
    expect(new Rng(1).pick(['a'])).toBe('a');
  });
});
