import { describe, expect, it } from 'vitest';
import {
  BRICK_COLS,
  BRICK_ROWS,
  NEUTRAL_BRICK_INPUT,
  genuineTicks,
  makeBrickInput,
  type BrickGameOptions,
  type BrickInput,
} from '../../../src/brick';
import { CONSTRUCTION_MODES, ConstructionGame, constructionDef } from '../../../src/brick/games/construction';
import type { GunSpace } from '../../../src/brick/games/gun/space';
import { conformance, frameHash } from '../conformance';
import {
  CLEAR_LOSE,
  CLEAR_WIN,
  INTRO,
  KABOOM,
  at,
  cellsOf,
  flipped,
  hold,
  idle,
  litRows,
  rowCells,
  run,
  show,
  skipIntro,
  tap,
  types,
} from './gunKit';

/** Игра с доступом к внутренностям: поле пушки (донорские координаты), пушка, пули, начисление очков. */
class TestConstruction extends ConstructionGame {
  field(): GunSpace {
    return this.space;
  }
  gunX(): number {
    return this.gun.x;
  }
  barrels(): number {
    return this.gun.barrels;
  }
  put(x: number, y: number): void {
    this.space.set(x, y, 1);
  }
  fillRow(y: number, except: readonly number[] = []): void {
    for (let x = 0; x < BRICK_COLS; x++) this.space.set(x, y, except.includes(x) ? 0 : 1);
  }
  bulletRows(x: number): (number | null)[] {
    return this.bullets.visibleRows(x);
  }
  bulletCount(): number {
    return this.bullets.count;
  }
  give(points: number): void {
    this.award(points);
  }
  setLivesTo(count: number): void {
    this.setLives(count);
  }
}

const make = (mode = 0, extra: BrickGameOptions = {}): TestConstruction => new TestConstruction({ seed: 5, mode, ...extra });
/** Игра, запущенная и прошедшая «мелодию» (первое действие игрока — в следующем такте). */
const started = (mode = 0, extra: BrickGameOptions = {}): TestConstruction => {
  const game = make(mode, extra);
  game.start();
  skipIntro(game);
  return game;
};
/** Игра с очищенным полем: на нём только то, что положит тест. */
const bare = (mode = 0, extra: BrickGameOptions = {}): TestConstruction => {
  const game = started(mode, extra);
  game.field().clear();
  return game;
};

/** Копия поля пушки. */
const snapshot = (game: TestConstruction): Uint8Array => game.field().cells.slice();

/** Поле пушки, сдвинутое по горизонтали на dx колонок с оборачиванием. */
function rotated(cells: Uint8Array, dx: number): Uint8Array {
  const out = new Uint8Array(cells.length);
  for (let y = 0; y < BRICK_ROWS; y++) {
    for (let x = 0; x < BRICK_COLS; x++) {
      out[y * BRICK_COLS + ((x + dx + BRICK_COLS) % BRICK_COLS)] = cells[y * BRICK_COLS + x] ?? 0;
    }
  }
  return out;
}

/** Строки стены на экране без пушки (строки выше 17). */
const wallRows = (game: TestConstruction): number[] => litRows(game.cells()).filter((row) => row < 17);

conformance(constructionDef);

describe('construction: варианты', () => {
  it('восемь создающих вариантов донора GunGame (типы 5..8 и 13..16), у каждого своё название и пометка о допущении', () => {
    expect(CONSTRUCTION_MODES.length).toBe(8);
    expect(constructionDef.declaredModes).toBeNull();
    expect(constructionDef.id).toBe('construction');
    const names = CONSTRUCTION_MODES.map((mode) => mode.name.ru);
    expect(new Set(names).size).toBe(8);
    expect(names[0]).toBe('Одна пушка');
    expect(names[3]).toBe('Две пушки, сдвиг поля');
    expect(names[7]).toBe('Две пушки, сдвиг поля, поле вверх ногами');
    for (const mode of CONSTRUCTION_MODES) {
      expect(mode.note).toContain('допущение');
      expect(mode.note).toContain('GunGame');
    }
    expect(CONSTRUCTION_MODES.map((mode) => /тип (\d+)/.exec(mode.note)?.[1])).toEqual(
      ['5', '6', '7', '8', '13', '14', '15', '16'],
    );
  });

  it('варианты различаются: после одинаковых действий картинка и счёт у восьми вариантов разные', () => {
    const signatures = new Set<string>();
    for (let mode = 0; mode < 8; mode++) {
      const game = started(mode);
      for (let t = 0; t < 600; t++) {
        const input =
          t % 9 === 0
            ? makeBrickInput(['fire'])
            : t % 31 === 0
              ? makeBrickInput(['left'])
              : t % 47 === 0
                ? makeBrickInput(['right'])
                : NEUTRAL_BRICK_INPUT;
        game.step(input);
      }
      signatures.add(frameHash(game));
    }
    expect(signatures.size).toBe(8);
  });

  it('одно зерно и одни и те же вводы дают одну и ту же партию, другое зерно — другие стены', () => {
    const a = started(0, { seed: 11 });
    const b = started(0, { seed: 11 });
    const c = started(0, { seed: 12 });
    run(a, 400, (t) => (t % 13 === 0 ? makeBrickInput(['fire']) : NEUTRAL_BRICK_INPUT));
    run(b, 400, (t) => (t % 13 === 0 ? makeBrickInput(['fire']) : NEUTRAL_BRICK_INPUT));
    run(c, 400, (t) => (t % 13 === 0 ? makeBrickInput(['fire']) : NEUTRAL_BRICK_INPUT));
    expect(frameHash(a)).toBe(frameHash(b));
    expect(frameHash(c)).not.toBe(frameHash(a));
  });
});

describe('construction: начало уровня', () => {
  it('до старта на поле только пушка; ввод ничего не меняет', () => {
    const game = make();
    expect(show(game.cells())).toBe(show(cellsOf([...Array<string>(18).fill(''), '....#.....', '...###....'])));
    expect(game.lives).toBe(4);
    expect(game.preview()?.filter((cell) => cell).length).toBe(8);
  });

  it('на уровне N выкладывается N рядов сверху по одному за 3 такта; в каждом есть и горящие, и пустые клетки', () => {
    const game = make(0, { level: 5 });
    game.start();
    expect(wallRows(game)).toEqual([0]);
    idle(game, 3);
    expect(wallRows(game)).toEqual([0, 1]);
    idle(game, 3);
    expect(wallRows(game)).toEqual([0, 1, 2]);
    idle(game, INTRO);
    expect(wallRows(game)).toEqual([0, 1, 2, 3, 4]);
    for (const row of wallRows(game)) {
      expect(rowCells(game.cells(), row)).toBeGreaterThanOrEqual(1);
      expect(rowCells(game.cells(), row)).toBeLessThanOrEqual(BRICK_COLS - 1);
    }
  });

  it('пушка стоит внизу по центру: три клетки основания и дуло над серединой', () => {
    const game = started();
    const cells = game.cells();
    expect([3, 4, 5].map((x) => at(cells, x, 19))).toEqual([1, 1, 1]);
    expect(at(cells, 4, 18)).toBe(1);
    expect(at(cells, 2, 19)).toBe(0);
    expect(at(cells, 6, 19)).toBe(0);
    expect(rowCells(cells, 18)).toBe(1);
  });

  it('«мелодия» перед уровнем идёт 90 тактов без ввода', () => {
    const game = make();
    game.start();
    const events = run(game, INTRO - 1, () => makeBrickInput(['left', 'fire']));
    expect(types(events)).toEqual([]);
    expect(game.gunX()).toBe(4);
    expect(game.bulletCount()).toBe(0);
    game.step(NEUTRAL_BRICK_INPUT);
    tap(game, 'left');
    expect(game.gunX()).toBe(3);
  });
});

describe('construction: пушка', () => {
  it('одно нажатие — одна клетка влево или вправо; зажатая кнопка не повторяется', () => {
    const game = started();
    expect(types(tap(game, 'left'))).toEqual(['move']);
    expect(game.gunX()).toBe(3);
    run(game, 30, () => makeBrickInput([], ['left']));
    expect(game.gunX()).toBe(3);
    tap(game, 'right');
    tap(game, 'right');
    expect(game.gunX()).toBe(5);
    expect(at(game.cells(), 5, 18)).toBe(1);
  });

  it('у левого края центр доходит до колонки 0, и основание обрезается полем; дальше не идёт и звука нет', () => {
    const game = bare();
    for (let i = 0; i < 4; i++) tap(game, 'left');
    expect(game.gunX()).toBe(0);
    expect(types(tap(game, 'left'))).toEqual([]);
    expect(game.gunX()).toBe(0);
    const cells = game.cells();
    expect([0, 1, 2].map((x) => at(cells, x, 19))).toEqual([1, 1, 0]);
    expect(at(cells, 0, 18)).toBe(1);
  });

  it('у правого края — то же зеркально (центр до колонки 9)', () => {
    const game = bare();
    for (let i = 0; i < 6; i++) tap(game, 'right');
    expect(game.gunX()).toBe(9);
    const cells = game.cells();
    expect([7, 8, 9].map((x) => at(cells, x, 19))).toEqual([0, 1, 1]);
    expect(at(cells, 9, 18)).toBe(1);
  });

  it('пушка не заходит в клетки стены', () => {
    const game = bare();
    game.put(5, 1); // над основанием: пушка в колонке 5 упёрлась бы дулом
    tap(game, 'right');
    expect(game.gunX()).toBe(4);
    game.put(2, 0);
    tap(game, 'left');
    tap(game, 'left'); // колонка 3 свободна (основание 2..4 занято клеткой (2, 0))
    expect(game.gunX()).toBe(4);
  });
});

describe('construction: выстрел и полёт пули', () => {
  it('пуля выходит из дула на ряд над ним и поднимается на ряд за такт мигающей клеткой', () => {
    const game = bare();
    const events = tap(game, 'fire');
    expect(types(events)).toEqual(['shot']);
    expect(game.bulletRows(4)).toEqual([2]);
    expect(at(game.cells(), 4, 17)).toBe(2);
    idle(game);
    expect(at(game.cells(), 4, 17)).toBe(0);
    expect(at(game.cells(), 4, 16)).toBe(2);
    idle(game, 5);
    expect(game.bulletRows(4)).toEqual([8]);
    expect(at(game.cells(), 4, 11)).toBe(2);
  });

  it('rotate и fire — одна и та же кнопка; зажатая кнопка стреляет один раз', () => {
    const game = bare();
    tap(game, 'rotate');
    expect(game.bulletCount()).toBe(1);
    run(game, 20, () => makeBrickInput([], ['rotate', 'fire']));
    expect(game.bulletCount()).toBe(1);
    tap(game, ['rotate', 'fire']);
    expect(game.bulletCount()).toBe(2);
  });

  it('пуля останавливается перед первой клеткой стены в колонке и становится клеткой (+1 очко)', () => {
    const game = bare();
    game.put(4, 10);
    tap(game, 'fire');
    const events = idle(game, 12);
    expect(types(events)).toEqual(['lock']);
    expect(game.field().get(4, 9)).toBe(1);
    expect(game.field().get(4, 10)).toBe(1);
    expect(game.field().total()).toBe(2);
    expect(game.score).toBe(1);
    expect(game.bulletCount()).toBe(0);
  });

  it('пуля тянется вдоль колонки и не проскакивает пустоты: свисающая над пустотой клетка берёт пулю под себя', () => {
    const game = bare();
    game.put(4, 15);
    game.put(4, 12); // ниже по колонке — первая на пути пули
    tap(game, 'fire');
    idle(game, 12);
    expect(game.field().get(4, 11)).toBe(1);
    expect(game.field().get(4, 14)).toBe(0);
  });

  it('если в колонке нет клеток, пуля прилипает к верхнему краю', () => {
    const game = bare();
    tap(game, 'fire');
    idle(game, 16);
    expect(game.field().total()).toBe(0);
    expect(game.bulletRows(4)).toEqual([18]);
    idle(game);
    expect(game.field().get(4, 19)).toBe(1);
    expect(at(game.cells(), 4, 0)).toBe(1);
    expect(game.score).toBe(1);
  });

  it('пуля упирается в стену, прижатую к стволу: клетка не создаётся (место занято дулом)', () => {
    const game = bare();
    game.put(4, 2);
    tap(game, 'fire');
    expect(game.bulletCount()).toBe(0);
    expect(game.field().total()).toBe(1);
    expect(game.score).toBe(0);
  });

  it('в воздухе может быть много пуль, и они летят каждая своей колонкой', () => {
    const game = bare();
    tap(game, 'fire', 3);
    tap(game, 'left');
    tap(game, 'fire');
    expect(game.bulletRows(4)).toEqual([6]);
    expect(game.bulletRows(3)).toEqual([2]);
  });

  it('две пушки: пули вылетают из колонок по бокам от центра, медленнее вдвое', () => {
    const game = bare(2);
    expect(game.barrels()).toBe(2);
    tap(game, 'fire');
    expect(game.bulletCount()).toBe(2);
    expect(game.bulletRows(3)).toEqual([null]);
    idle(game);
    expect(game.bulletRows(3)).toEqual([2]);
    expect(game.bulletRows(5)).toEqual([2]);
    expect(game.bulletRows(4)).toEqual([]);
    idle(game, 2);
    expect(game.bulletRows(3)).toEqual([3]);
  });

  it('две пушки у края поля: колонки за краем пропускаются', () => {
    const game = bare(2);
    for (let i = 0; i < 4; i++) tap(game, 'left');
    expect(game.gunX()).toBe(0);
    tap(game, 'fire');
    expect(game.bulletCount()).toBe(1);
    expect(game.bulletRows(1)).toEqual([null]);
  });

  it('боковая пуля может стать клеткой над основанием пушки, в ряду дула', () => {
    const game = bare(2);
    game.put(3, 2);
    tap(game, 'fire');
    idle(game, 2);
    expect(game.field().get(3, 1)).toBe(1);
    expect(game.field().get(5, 19)).toBe(0);
  });
});

describe('construction: полный ряд', () => {
  /** Ряд 10 заполнен, кроме колонки 4; над дырой стоит клетка, чтобы пуля остановилась в ней; ниже и выше — по метке. */
  function almostFull(mode = 0): TestConstruction {
    const game = bare(mode);
    game.fillRow(10, [4]);
    game.put(4, 11);
    game.put(2, 12); // выше ряда — не двигается
    game.put(7, 8); // ниже ряда — поднимется на его место
    game.put(1, 5);
    return game;
  }

  /** Стреляет и ждёт, пока ряд будет собран; возвращает события такта и такты сценки (уже прошло 0). */
  function shootUntilRow(game: TestConstruction): ReturnType<typeof tap> {
    tap(game, 'fire');
    const events: ReturnType<typeof tap> = [];
    for (let i = 0; i < 20 && !types(events).includes('lines'); i++) events.push(...idle(game));
    return events;
  }

  it('собранный ряд гаснет от колонки пушки к краям и исчезает; +1 за клетку и +10 за ряд', () => {
    const game = almostFull();
    const events = shootUntilRow(game);
    expect(types(events)).toEqual(['lock', 'lines']);
    expect(events[1]).toEqual({ type: 'lines', count: 1, rows: [9] });
    expect(game.score).toBe(1);
    const row = 9; // строка экрана ряда 10
    const lit = (): number => rowCells(game.cells(), row);
    expect(lit()).toBe(8); // сразу погасли колонки 3 и 4 (пушка в колонке 4)
    idle(game, 4);
    expect(lit()).toBe(6);
    idle(game, 4);
    expect(lit()).toBe(4);
    idle(game, 4);
    expect(lit()).toBe(2);
    idle(game, 4);
    expect(lit()).toBe(1);
    idle(game, 4);
    expect(lit()).toBe(0);
    expect(game.score).toBe(1);
    expect(game.field().total()).toBe(4); // осталось четыре метки
    idle(game, 4);
    expect(game.score).toBe(11);
  });

  it('ряды между убранным и пушкой поднимаются на его место, ряды выше не двигаются', () => {
    const game = almostFull();
    shootUntilRow(game);
    idle(game, 24);
    const field = game.field();
    expect(field.get(2, 12)).toBe(1);
    expect(field.get(4, 11)).toBe(1);
    expect(field.get(7, 9)).toBe(1);
    expect(field.get(1, 6)).toBe(1);
    expect(field.get(7, 8)).toBe(0);
    expect(field.get(1, 5)).toBe(0);
    expect(field.total()).toBe(4);
    expect(field.rowCount(10)).toBe(0);
  });

  it('пока ряд убирается, пушка не двигается и не стреляет, пули в воздухе пропадают', () => {
    const game = almostFull();
    tap(game, 'fire', 2);
    tap(game, 'left'); // вторая пуля из колонки 3 — уйдёт в воздух до сборки ряда
    expect(game.bulletCount()).toBe(2);
    tap(game, 'right');
    let events = [] as ReturnType<typeof tap>;
    for (let i = 0; i < 20 && !types(events).includes('lines'); i++) events = idle(game);
    expect(types(events)).toContain('lines');
    expect(game.bulletCount()).toBe(0);
    const x = game.gunX();
    run(game, 10, () => makeBrickInput(['left', 'fire']));
    expect(game.gunX()).toBe(x);
    expect(game.bulletCount()).toBe(0);
  });

  it('ряд убирается и в обычном, и в перевёрнутом поле (то же самое по кнопкам, зеркально на экране)', () => {
    const normal = almostFull(0);
    const upside = almostFull(4);
    shootUntilRow(normal);
    const events = shootUntilRow(upside);
    expect(events[1]).toEqual({ type: 'lines', count: 1, rows: [10] });
    idle(normal, 24);
    idle(upside, 24);
    expect(flipped(upside.cells())).toEqual(normal.cells());
    expect(upside.score).toBe(normal.score);
  });

  it('с краю колонки пушки ряд гаснет только в одну сторону и дольше (десять шагов от колонки 0)', () => {
    const game = bare();
    for (let i = 0; i < 4; i++) tap(game, 'left');
    game.fillRow(10, [0]);
    game.put(0, 11);
    tap(game, 'fire');
    let events = [] as ReturnType<typeof tap>;
    for (let i = 0; i < 20 && !types(events).includes('lines'); i++) events = idle(game);
    expect(rowCells(game.cells(), 9)).toBe(8); // сразу погасла колонка 0, а колонки -1 нет
    idle(game, 36);
    expect(rowCells(game.cells(), 9)).toBe(0);
    expect(game.score).toBe(1);
    idle(game, 4);
    expect(game.score).toBe(11);
  });
});

describe('construction: спуск стены', () => {
  it('новый ряд сверху раз в 270 тактов на скорости 1 и раз в 150 на скорости 10 (донор: 4500 и 2500 мс)', () => {
    expect(genuineTicks(1, 4500, 2500)).toBe(270);
    expect(genuineTicks(10, 4500, 2500)).toBe(150);
    for (const [speed, period] of [
      [1, 270],
      [10, 150],
    ] as const) {
      const game = started(0, { speed });
      const before = game.cells().slice();
      idle(game, period - 1);
      expect(game.cells()).toEqual(before);
      idle(game);
      const after = game.cells();
      expect(after.subarray(10, 20)).toEqual(before.subarray(0, 10));
      expect(rowCells(after, 0)).toBeGreaterThanOrEqual(1);
      expect(rowCells(after, 0)).toBeLessThan(BRICK_COLS);
    }
  });

  it('у двух пушек шаг стены вдвое длиннее', () => {
    const game = started(2);
    const before = game.cells().slice();
    idle(game, 539);
    expect(game.cells()).toEqual(before);
    idle(game);
    expect(game.cells()).not.toEqual(before);
  });

  it('«вниз» роняет ряд сразу и повторяет это каждые 3 такта, пока зажата', () => {
    const game = started();
    const before = game.cells().slice();
    const events = tap(game, 'down');
    expect(types(events)).toEqual(['move']);
    expect(game.cells().subarray(10, 20)).toEqual(before.subarray(0, 10));
    const count = wallRows(game).length;
    hold(game, 'down', 7); // нажатие, затем 3-й и 6-й такт
    expect(wallRows(game).length).toBe(count + 3);
  });

  it('в перевёрнутом поле ряд роняет «вверх», а «вниз» ничего не делает', () => {
    const game = started(4);
    const before = game.cells().slice();
    expect(tap(game, 'down')).toEqual([]);
    expect(game.cells()).toEqual(before);
    const events = tap(game, 'up');
    expect(types(events)).toEqual(['move']);
    expect(game.cells().subarray(18 * 10, 19 * 10)).toEqual(before.subarray(19 * 10, 20 * 10));
  });

  it('если в самом нижнем ряду уже есть клетка, новый ряд не добавляется (как `addLinesToBoard` донора)', () => {
    const game = bare();
    game.put(7, 0);
    game.put(1, 19);
    const before = game.cells().slice();
    tap(game, 'down');
    expect(game.cells()).toEqual(before);
  });

  it('стартовый таймер спуска начинается после «мелодии» и не уходит в минус при паузе', () => {
    const game = started();
    idle(game, 100);
    game.pause();
    run(game, 500, () => NEUTRAL_BRICK_INPUT);
    game.resume();
    const rows = wallRows(game).length;
    idle(game, 169);
    expect(wallRows(game).length).toBe(rows);
    idle(game);
    expect(wallRows(game).length).toBe(rows + 1);
  });
});

describe('construction: сдвиг поля', () => {
  it('в вариантах со сдвигом через 2 такта после спуска ряда всё поле сдвигается на клетку влево или вправо с оборачиванием', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const game = started(1, { seed });
      idle(game, 269);
      game.put(0, 10);
      game.put(9, 12);
      idle(game);
      const dropped = snapshot(game);
      idle(game, 2);
      const after = snapshot(game);
      const left = rotated(dropped, -1);
      const right = rotated(dropped, 1);
      const direction = after.every((value, i) => value === left[i]) ? -1 : after.every((value, i) => value === right[i]) ? 1 : 0;
      expect(direction, `зерно ${seed}`).not.toBe(0);
      seen.add(direction);
    }
    expect([...seen].sort()).toEqual([-1, 1]);
  });

  it('при сдвиге клетка из крайней колонки выходит с другой стороны, пушка и пули остаются на месте', () => {
    const game = started(1);
    idle(game, 269);
    game.put(9, 12);
    game.put(0, 13);
    idle(game, 3);
    const field = game.field();
    const moved = field.get(0, 12) + field.get(8, 12);
    expect(moved).toBe(1); // клетка из колонки 9 ушла в колонку 0 или в 8
    expect(game.gunX()).toBe(4);
    expect(at(game.cells(), 4, 18)).toBe(1);
  });

  it('в вариантах без сдвига поле после спуска ряда не двигается', () => {
    for (const mode of [0, 2, 4, 6]) {
      const game = started(mode);
      idle(game, mode === 2 || mode === 6 ? 539 : 269);
      idle(game);
      const dropped = snapshot(game);
      idle(game, 5);
      expect(snapshot(game), `вариант ${mode + 1}`).toEqual(dropped);
    }
  });

  it('сдвиг не отменяет проверку касания пушки: ряд, дошедший до дула, всё равно стоит жизни', () => {
    const game = bare(1);
    game.put(7, 2);
    game.put(0, 17);
    const events = tap(game, 'down');
    expect(types(events)).not.toContain('crash');
    expect(types(idle(game, 3))).toContain('crash');
  });
});

describe('construction: перевёрнутое поле', () => {
  it('пушка вверху, стена растёт снизу', () => {
    const game = started(4);
    const cells = game.cells();
    expect([3, 4, 5].map((x) => at(cells, x, 0))).toEqual([1, 1, 1]);
    expect(at(cells, 4, 1)).toBe(1);
    expect(litRows(cells).filter((row) => row > 2)).toEqual([19]);
  });

  it('при тех же вводах картинка — вертикальное зеркало обычного варианта, счёт тот же', () => {
    const normal = started(0, { seed: 9 });
    const upside = started(4, { seed: 9 });
    const input = (t: number): BrickInput =>
      t % 11 === 0
        ? makeBrickInput(['fire'])
        : t % 17 === 5
          ? makeBrickInput(['left'])
          : t % 23 === 7
            ? makeBrickInput(['right'])
            : NEUTRAL_BRICK_INPUT;
    for (let t = 0; t < 600; t++) {
      normal.step(input(t));
      upside.step(input(t));
      if (t % 10 === 0) expect(flipped(upside.cells())).toEqual(normal.cells());
    }
    expect(upside.score).toBe(normal.score);
    expect(upside.score).toBeGreaterThan(0);
  });
});

describe('construction: очки, скорость, уровень, жизни', () => {
  it('каждые 500 очков скорость растёт на единицу (SCORE_TO_NEXT_LEVEL донора)', () => {
    const game = started();
    game.give(499);
    expect(game.speed).toBe(1);
    game.give(1);
    expect(game.speed).toBe(2);
    expect(types(idle(game))).toEqual(['levelUp']);
    game.give(500);
    game.give(500);
    expect(game.speed).toBe(4);
    expect(game.level).toBe(1);
  });

  it('после десятой скорости — скорость 1, уровень +1 и победа: очистка поля, затем уровень с большим числом рядов', () => {
    const game = started(0, { speed: 10, level: 3 });
    game.give(500);
    expect(game.speed).toBe(1);
    expect(game.level).toBe(4);
    const events = idle(game);
    expect(types(events)).toEqual(['levelUp', 'win']);
    game.put(2, 8);
    idle(game, CLEAR_WIN - 2);
    expect(game.gunX()).toBe(4);
    idle(game, 3 + INTRO);
    expect(wallRows(game).length).toBe(4);
    expect(game.field().get(2, 8)).toBe(0);
    expect(game.score).toBe(500);
  });

  it('после десятого уровня уровень начинается с первого, скорость остаётся первой', () => {
    const game = started(0, { speed: 10, level: 10 });
    game.give(500);
    expect([game.speed, game.level]).toEqual([1, 1]);
    idle(game, CLEAR_WIN + INTRO + 5);
    expect(wallRows(game).length).toBe(1);
  });

  it('за каждые 10000 очков — добавочная жизнь; при полных жизнях — бонус к счёту', () => {
    const game = started();
    game.setLivesTo(3);
    game.give(9999);
    expect(game.lives).toBe(3);
    game.give(1);
    expect(game.lives).toBe(4);
    expect(types(idle(game))).toContain('bonus');
    game.give(10000);
    expect(game.lives).toBe(4);
    expect(game.score).toBe(20000 + 1000);
  });

  it('стена дошла до дула — потеря жизни: взрыв, очистка поля, тот же уровень заново; счёт и скорость сохраняются', () => {
    const game = started(0, { speed: 3, level: 2 });
    game.give(7);
    game.field().clear();
    game.put(7, 2);
    const first = tap(game, 'down');
    expect(types(first)).toEqual(['crash']);
    expect(game.lives).toBe(4);
    const x = game.gunX();
    const frozen = run(game, KABOOM - 2, () => makeBrickInput(['left', 'fire']));
    expect(types(frozen)).toEqual([]);
    expect(game.gunX()).toBe(x);
    expect(game.bulletCount()).toBe(0);
    const events = idle(game, 2);
    expect(types(events)).toEqual(['lifeLost']);
    expect(game.lives).toBe(3);
    idle(game, CLEAR_LOSE + INTRO + 1);
    expect(wallRows(game).length).toBe(2);
    expect(game.field().get(7, 2)).toBe(0);
    expect(game.score).toBe(7);
    expect([game.speed, game.level]).toEqual([3, 2]);
    expect(game.gunX()).toBe(4);
    expect(game.phase).toBe('playing');
  });

  it('взрыв рисуется поверх поля: сначала кольцо из восьми клеток вокруг пушки', () => {
    const game = started();
    game.field().clear();
    game.put(7, 2);
    tap(game, 'down');
    const cells = game.cells();
    expect(rowCells(cells, 16)).toBe(3);
    expect(rowCells(cells, 17)).toBe(2);
    expect(rowCells(cells, 18)).toBe(3);
    expect(at(cells, 4, 17)).toBe(0);
  });

  it('конец игры: жизни кончились — взрыв, заливка поля, фаза over; новая партия начинается с чистого счёта, рекорд сохраняется', () => {
    const game = started();
    game.give(40);
    game.setLivesTo(1);
    game.field().clear();
    game.put(7, 2);
    const hi = game.hiScore;
    expect(types(tap(game, 'down'))).toEqual(['crash']);
    const events = idle(game, KABOOM);
    expect(types(events)).toEqual(['lifeLost', 'gameOver']);
    expect(game.lives).toBe(0);
    for (let i = 0; i < 80 && game.phase !== 'over'; i++) idle(game);
    expect(game.phase).toBe('over');
    expect(game.overFill).toBe(BRICK_ROWS);
    expect(game.hiScore).toBe(hi);
    expect(game.hiScore).toBeGreaterThanOrEqual(40);
    game.start();
    expect(game.phase).toBe('playing');
    expect([game.score, game.lives, game.speed, game.level]).toEqual([0, 4, 1, 1]);
    skipIntro(game);
    expect(wallRows(game).length).toBe(1);
  });

  it('если держать «вниз», стена быстро доходит до пушки: четыре жизни кончаются, игра заканчивается', () => {
    for (const mode of [0, 5]) {
      const game = started(mode);
      const key = mode === 5 ? 'up' : 'down';
      const events = [] as ReturnType<typeof tap>;
      for (let t = 0; t < 4000 && game.phase !== 'over'; t++) {
        events.push(...game.step(makeBrickInput(t === 0 ? [key] : [], [key])));
      }
      expect(game.phase, `вариант ${mode + 1}`).toBe('over');
      const names = types(events);
      expect(names.filter((name) => name === 'crash').length).toBe(4);
      expect(names.filter((name) => name === 'lifeLost').length).toBe(4);
      expect(names.filter((name) => name === 'gameOver').length).toBe(1);
      expect(game.lives).toBe(0);
    }
  });

  it('ускорение выстрелами: пауза замораживает пули и спуск', () => {
    const game = bare();
    tap(game, 'fire', 4);
    const rows = game.bulletRows(4);
    game.pause();
    run(game, 40, () => NEUTRAL_BRICK_INPUT);
    expect(game.bulletRows(4)).toEqual(rows);
  });
});

/** Бот: выбирает ряд, который выстрел дополнит сильнее всего, идёт к нужной колонке (или паре колонок) и стреляет. */
function botInput(game: TestConstruction): BrickInput {
  const space = game.field();
  const lanes = (gx: number): number[] =>
    (game.barrels() === 2 ? [gx - 1, gx + 1] : [gx]).filter((x) => x >= 0 && x < BRICK_COLS);
  const attachRow = (x: number): number => {
    for (let y = 2; y < BRICK_ROWS; y++) if (space.get(x, y) !== 0) return y - 1;
    return BRICK_ROWS - 1;
  };
  let best = Number.NEGATIVE_INFINITY;
  let target = game.gunX();
  for (let gx = 0; gx < BRICK_COLS; gx++) {
    for (const lane of lanes(gx)) {
      const row = attachRow(lane);
      if (row < 2) continue;
      const value = space.rowCount(row) * 100 - Math.abs(gx - game.gunX());
      if (value > best) {
        best = value;
        target = gx;
      }
    }
  }
  if (target < game.gunX()) return makeBrickInput(['left']);
  if (target > game.gunX()) return makeBrickInput(['right']);
  return makeBrickInput(['fire']);
}

describe('construction: бот', () => {
  it('бот добивает ряды: очки растут, ряды убираются, жизни целы (одна пушка, обычное и перевёрнутое поле)', () => {
    for (const mode of [0, 4]) {
      const game = started(mode, { seed: 3, level: 3, speed: 4 });
      const events = run(game, 3500, () => botInput(game));
      const names = types(events);
      expect(game.score, `вариант ${mode + 1}`).toBeGreaterThan(150);
      expect(names.filter((name) => name === 'lines').length).toBeGreaterThanOrEqual(3);
      expect(game.lives).toBe(4);
      expect(game.phase).toBe('playing');
    }
  });

  it('бот справляется и с двумя пушками, и со сдвигом поля', () => {
    for (const mode of [2, 3, 7]) {
      const game = started(mode, { seed: 4, level: 3, speed: 6 });
      const names = types(run(game, 4000, () => botInput(game)));
      expect(game.score, `вариант ${mode + 1}`).toBeGreaterThan(60);
      expect(names).toContain('lines');
    }
  });

  it('бот доходит до новой скорости: 500 очков и выше', () => {
    const game = started(0, { seed: 2, level: 4, speed: 10 });
    let reached = false;
    for (let t = 0; t < 12000 && !reached; t++) {
      game.step(botInput(game));
      reached = game.level >= 5 || game.score >= 500;
    }
    expect(reached).toBe(true);
  });
});
