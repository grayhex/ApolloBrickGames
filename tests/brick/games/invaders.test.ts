import { scenarioSuite } from '../scenarioCoverage';
import { describe, expect, it } from 'vitest';
import { GAME_OVER_TICKS_PER_ROW, GAME_OVER_HOLD_TICKS,
  BRICK_COLS,
  BRICK_ROWS,
  CLEAR_LOSE_TICKS,
  CLEAR_WIN_TICKS,
  NEUTRAL_BRICK_INPUT,
  Rng,
  cellIndex,
  genuineTicks,
  makeBrickInput,
  msToTicks,
  type BrickAction,
  type BrickEvent,
  type BrickGame,
  type BrickGameOptions,
  type BrickInput,
} from '../../../src/brick';
import { InvadersGame, invadersDef, invadersTraits } from '../../../src/brick/games/invaders';
import {
  PRELOADED_WALLS,
  WALL_WIDTH,
  countBricks,
  generatedHeight,
  generatedWall,
  hasBrick,
  preloadedWall,
  rowHasBrick,
  shiftWall,
  type Wall,
} from '../../../src/brick/games/invaders/wall';
import { conformance } from '../conformance';

const coveredScenario = scenarioSuite('invaders');

// ---------------------------------------------------------------- помощники

/** «Мелодия» перед уровнем: 1500 мс. */
const INTRO = msToTicks(1500);
/** Взрыв: четыре прохода по семи волнам по 4 такта. */
const KABOOM = 4 * 7 * 4;
/** Столько тактов нужно, чтобы дойти от первой строки до конца игры: заливка рядов и пауза. */
const GAME_OVER_TICKS = Math.ceil(BRICK_ROWS * GAME_OVER_TICKS_PER_ROW + GAME_OVER_HOLD_TICKS);
const SLOW = 1_000_000;

const make = (mode = 0, options: BrickGameOptions = {}): InvadersGame => new InvadersGame({ seed: 7, mode, ...options });

/** Игра запущена, «мелодия» отыграла: следующий такт — первый настоящий. */
function ready(mode = 0, options: BrickGameOptions = {}): InvadersGame {
  const game = make(mode, options);
  game.start();
  idle(game, INTRO);
  return game;
}

/** То же, но нашествие «заморожено»: стена и шар стоят, пока тест сам их не тронет. */
function frozen(mode = 0, options: BrickGameOptions = {}): InvadersGame {
  const game = ready(mode, options);
  game['invasionLeft'] = SLOW;
  return game;
}

function idle(game: BrickGame, ticks: number): BrickEvent[] {
  const events: BrickEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
  return events;
}

const types = (events: readonly BrickEvent[]): string[] => events.map((event) => event.type);

/** Поле текстом: `#` горит, `*` мигает (пули), `.` погашена. Строка 0 — верх экрана. */
function screen(game: BrickGame): string[] {
  const cells = game.cells();
  const rows: string[] = [];
  for (let y = 0; y < BRICK_ROWS; y++) {
    let line = '';
    for (let x = 0; x < BRICK_COLS; x++) line += ['.', '#', '*'][cells[cellIndex(x, y)] ?? 0] ?? '.';
    rows.push(line);
  }
  return rows;
}

/** Символ клетки (x, строка экрана). */
const at = (game: BrickGame, x: number, row: number): string => screen(game)[row]?.[x] ?? '?';

/** Ввод с правильными фронтами нажатия: зажатые кнопки меняются от такта к такту. */
function driver(): (held: readonly BrickAction[]) => BrickInput {
  let previous = new Set<BrickAction>();
  return (held) => {
    const now = new Set(held);
    const pressed = [...now].filter((action) => !previous.has(action));
    previous = now;
    return makeBrickInput(pressed, now);
  };
}

/** Опустошить стену и поставить кирпичи (колонка, ряд снизу). */
function setBricks(game: InvadersGame, bricks: readonly (readonly [number, number])[]): void {
  const wall = game['wall'];
  wall.cells.fill(0);
  for (const [x, row] of bricks) wall.cells[row * WALL_WIDTH + x] = 1;
  wall.count = countBricks(wall);
}

// ---------------------------------------------------------------- общие проверки каталога

describe('игра 5: общие проверки каталога', () => {
  conformance(invadersDef);
});

// ---------------------------------------------------------------- варианты

describe('игра 5: варианты', () => {
  /** Таблица донорских типов 1..16: [два ствола, сдвиг стены, перевёрнутое поле, готовая стена]. */
  const TABLE: readonly (readonly [boolean, boolean, boolean, boolean])[] = [
    [false, false, false, true], // 1
    [false, true, false, true], // 2
    [true, false, false, true], // 3
    [true, true, false, true], // 4
    [false, false, false, false], // 5
    [false, true, false, false], // 6
    [true, false, false, false], // 7
    [true, true, false, false], // 8
    [false, false, true, true], // 9
    [false, true, true, true], // 10
    [true, false, true, true], // 11
    [true, true, true, true], // 12
    [false, false, true, false], // 13
    [false, true, true, false], // 14
    [true, false, true, false], // 15
    [true, true, true, false], // 16
  ];

  it('все 16 донорских вариантов описаны, число вариантов устройства не объявлено', () => {
    expect(invadersDef.id).toBe('invaders');
    expect(invadersDef.declaredModes).toBeNull();
    expect(invadersDef.modes.length).toBe(16);
    const names = new Set(invadersDef.modes.map((mode) => mode.name.ru));
    expect(names.size).toBe(16);
    expect(new Set(invadersDef.modes.map((mode) => mode.name.en)).size).toBe(16);
    invadersDef.modes.forEach((mode, index) => {
      expect(mode.note).toContain(`тип ${index + 1}`);
      expect(mode.note).toContain('Допущение');
    });
  });

  it('свойства вариантов совпадают с таблицей донора (стволы, сдвиг, переворот, стена)', () => {
    TABLE.forEach(([twoBarrels, shifting, inverted, preloaded], index) => {
      const traits = invadersTraits(index);
      expect(traits, `тип ${index + 1}`).toEqual({ type: index + 1, twoBarrels, shifting, inverted, preloaded });
      expect(make(index).traits).toEqual(traits);
    });
    // номер вне диапазона берётся по кругу
    expect(invadersTraits(16).type).toBe(1);
    expect(invadersTraits(-1).type).toBe(16);
  });

  it('названия отражают свойства варианта', () => {
    TABLE.forEach(([twoBarrels, shifting, inverted, preloaded], index) => {
      const { ru, en } = invadersDef.modes[index]?.name ?? { ru: '', en: '' };
      expect(ru.includes('два ствола')).toBe(twoBarrels);
      expect(ru.includes('один ствол')).toBe(!twoBarrels);
      expect(ru.includes('со сдвигом')).toBe(shifting);
      expect(ru.includes('вверх дном')).toBe(inverted);
      expect(ru.includes('Случайная')).toBe(!preloaded);
      expect(en.includes('two barrels')).toBe(twoBarrels);
      expect(en.includes('Shifting') || en.includes('shifting')).toBe(shifting);
      expect(en.includes('upside down')).toBe(inverted);
      expect(en.includes('Random')).toBe(!preloaded);
    });
  });

  it('перевёрнутый вариант рисует то же поле вверх ногами, орудие сверху', () => {
    for (const base of [0, 2, 4, 5]) {
      const normal = screen(make(base, { level: 4 }));
      const flipped = screen(make(base + 8, { level: 4 }));
      expect(flipped).toEqual([...normal].reverse());
    }
    const top = screen(make(8));
    expect(top[0]).toBe('...###....');
    expect(top[1]).toBe('....#.....');
  });

  it('вариант со сдвигом: после каждого опускания стена сдвигается на клетку по кругу, без сдвига — нет', () => {
    const fixed = ready(0);
    const shifting = ready(1);
    const before = Array.from(fixed['wall'].cells);
    expect(Array.from(shifting['wall'].cells)).toEqual(before);
    fixed.step(NEUTRAL_BRICK_INPUT);
    shifting.step(NEUTRAL_BRICK_INPUT);
    // от стены отделился шар (самый правый кирпич нижнего ряда); сравниваем без него
    const fixedAfter = Array.from(fixed['wall'].cells);
    const shiftedAfter = Array.from(shifting['wall'].cells);
    expect(shiftedAfter.filter(Boolean).length).toBe(47);
    // без сдвига стена осталась на месте, не хватает только кирпича, ставшего шаром (нижний ряд, колонка 6)
    expect(fixedAfter).toEqual(before.map((cell, index) => (index === 6 ? 0 : cell)));
    const rotate = (cells: number[], by: number): number[] => {
      const out = new Array<number>(cells.length).fill(0);
      for (let row = 0; row < cells.length / WALL_WIDTH; row++) {
        for (let x = 0; x < WALL_WIDTH; x++) {
          out[row * WALL_WIDTH + ((x + by + WALL_WIDTH) % WALL_WIDTH)] = cells[row * WALL_WIDTH + x] ?? 0;
        }
      }
      return out;
    };
    const wallShifted = rotate(before, 1);
    const wallShiftedBack = rotate(before, -1);
    // в варианте со сдвигом ряд ушёл в одну из сторон, и шар отделился уже от сдвинутой стены
    const ball = shifting['ball'];
    expect(ball).not.toBeNull();
    const restored = [...shiftedAfter];
    if (ball) restored[(ball.y - shifting['bricksY']) * WALL_WIDTH + ball.x] = 1;
    expect([wallShifted, wallShiftedBack]).toContainEqual(restored);
  });

  it('вариант со случайной стеной: стена другая при другом зерне, готовая стена — одна и та же', () => {
    expect(screen(make(4, { seed: 1 }))).not.toEqual(screen(make(4, { seed: 2 })));
    expect(screen(make(0, { seed: 1 }))).toEqual(screen(make(0, { seed: 2 })));
    const random = make(4, { level: 1 });
    expect(random['wall'].height).toBe(generatedHeight(1));
    expect(preloadedWall(1).height).toBe(8);
    // на 10-м уровне случайная стена выше
    expect(make(4, { level: 10 })['wall'].height).toBe(10);
  });

  it('один ствол стреляет по центру, два — по бокам от центра', () => {
    const one = frozen(0);
    one.step(makeBrickInput(['rotate']));
    expect(screen(one).filter((line) => line.includes('*')).length).toBe(1);
    expect(one['bullets'].map((bullet) => bullet.x)).toEqual([4]);

    const two = frozen(2);
    two.step(makeBrickInput(['rotate']));
    expect(two['bullets'].map((bullet) => bullet.x)).toEqual([3, 5]);
  });

  it('кнопка «вниз» ускоряет нашествие, а на перевёрнутом поле кнопки «вверх» и «вниз» меняются местами', () => {
    const accelerated = (mode: number, button: BrickAction): number => {
      const game = ready(mode);
      game.step(NEUTRAL_BRICK_INPUT); // стена опустилась, шар отделился
      game['invasionLeft'] = SLOW;
      const before = game['ball']?.y ?? -99;
      game.step(makeBrickInput([button]));
      return before - (game['ball']?.y ?? -99);
    };
    expect(accelerated(0, 'down')).toBe(1);
    expect(accelerated(0, 'up')).toBe(0);
    expect(accelerated(8, 'up')).toBe(1);
    expect(accelerated(8, 'down')).toBe(0);
  });
});

// ---------------------------------------------------------------- стена: данные донора

describe('игра 5: стена кирпичей', () => {
  const HEIGHTS = [8, 7, 8, 7, 7, 8, 8, 8, 8, 8];
  const COUNTS = [48, 54, 68, 56, 54, 56, 60, 56, 56, 45];

  it('десять готовых стен: размеры и число кирпичей по данным донора', () => {
    expect(PRELOADED_WALLS.length).toBe(10);
    PRELOADED_WALLS.forEach((picture, index) => {
      expect(picture.length).toBe(HEIGHTS[index]);
      for (const line of picture) expect(line).toMatch(/^[#.]{10}$/);
      const wall = preloadedWall(index + 1);
      expect(wall.height).toBe(HEIGHTS[index]);
      expect(wall.count).toBe(COUNTS[index]);
      expect(countBricks(wall)).toBe(COUNTS[index]);
    });
  });

  it('рисунок стены читается сверху вниз, нижний ряд стены — последняя строка рисунка', () => {
    const wall = preloadedWall(1);
    // верх уровня 1: `.#.#..#.#.`, низ: `...####...`
    const rowText = (row: number): string =>
      [...Array(WALL_WIDTH).keys()].map((x) => (hasBrick(wall, x, row) ? '#' : '.')).join('');
    expect(rowText(wall.height - 1)).toBe('.#.#..#.#.');
    expect(rowText(0)).toBe('...####...');
    expect(rowHasBrick(wall, 0)).toBe(true);
    expect(hasBrick(wall, -1, 0)).toBe(false);
    expect(hasBrick(wall, 0, 99)).toBe(false);
    // уровень вне диапазона берётся с краю
    expect(preloadedWall(0).count).toBe(48);
    expect(preloadedWall(99).count).toBe(45);
  });

  it('случайная стена: высота «уровень / 2 + 5», горизонтальная симметрия, непустая, повторяема по зерну', () => {
    expect([1, 2, 3, 4, 9, 10].map(generatedHeight)).toEqual([5, 6, 6, 7, 9, 10]);
    let verticallySymmetric = 0;
    let other = 0;
    for (let level = 1; level <= 10; level++) {
      for (let seed = 1; seed <= 12; seed++) {
        const wall = generatedWall(level, new Rng(seed));
        expect(wall.height).toBe(generatedHeight(level));
        expect(wall.count).toBe(countBricks(wall));
        expect(wall.count).toBeGreaterThan(0);
        let symmetric = true;
        for (let row = 0; row < wall.height; row++) {
          for (let x = 0; x < WALL_WIDTH; x++) {
            expect(hasBrick(wall, x, row)).toBe(hasBrick(wall, WALL_WIDTH - 1 - x, row));
          }
          for (let x = 0; x < WALL_WIDTH; x++) {
            if (hasBrick(wall, x, row) !== hasBrick(wall, x, wall.height - 1 - row)) symmetric = false;
          }
        }
        if (symmetric) verticallySymmetric++;
        else other++;
        expect(Array.from(generatedWall(level, new Rng(seed)).cells)).toEqual(Array.from(wall.cells));
      }
    }
    // шанс вертикальной симметрии — один из трёх (плюс случайные совпадения)
    expect(verticallySymmetric).toBeGreaterThan(10);
    expect(other).toBeGreaterThan(40);
  });

  it('допущение: пустая случайная стена получает два центральных кирпича внизу', () => {
    const wall = generatedWall(1, { int: () => 0 }); // «монетка» всегда даёт пустую клетку
    expect(wall.count).toBe(2);
    expect(hasBrick(wall, 4, 0)).toBe(true);
    expect(hasBrick(wall, 5, 0)).toBe(true);
  });

  it('круговой сдвиг: кирпич с края выходит с другого края, на десять клеток — на месте', () => {
    const make1 = (x: number): Wall => {
      const wall: Wall = { height: 1, cells: new Uint8Array(WALL_WIDTH), count: 1 };
      wall.cells[x] = 1;
      return wall;
    };
    const right = make1(9);
    shiftWall(right, 1);
    expect(Array.from(right.cells)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const left = make1(0);
    shiftWall(left, -1);
    expect(Array.from(left.cells)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const same = make1(3);
    shiftWall(same, 10);
    expect(same.cells[3]).toBe(1);
  });
});

// ---------------------------------------------------------------- начало партии

describe('игра 5: начало партии', () => {
  it('до старта на поле стена сверху и орудие снизу', () => {
    const lines = screen(make(0));
    // стена уровня 1 занимает строки 0..7 (верх рисунка — верхняя строка)
    expect(lines.slice(0, 8)).toEqual(PRELOADED_WALLS[0]);
    expect(lines.slice(8, 18).every((line) => line === '..........')).toBe(true);
    expect(lines[18]).toBe('....#.....');
    expect(lines[19]).toBe('...###....');
  });

  it('четыре жизни, счёт ноль, добавочная жизнь каждую тысячу очков', () => {
    const game = make(0);
    expect(game.lives).toBe(4);
    expect(game.score).toBe(0);
    expect(game['scoresToExtraLife']).toBe(1000);
    expect(game.speed).toBe(1);
    expect(game.level).toBe(1);
    expect(make(0, { speed: 5, level: 7 }).level).toBe(7);
  });

  it('«мелодия» перед уровнем: 90 тактов без ввода и без нашествия', () => {
    expect(INTRO).toBe(90);
    const game = make(0);
    game.start();
    const first = screen(game);
    for (let i = 0; i < INTRO; i++) {
      const events = game.step(makeBrickInput(['left', 'rotate']));
      expect(events).toEqual([]);
      expect(screen(game)).toEqual(first);
    }
    expect(game['bricksY']).toBe(12);
    expect(game['gunX']).toBe(4);
    // дальше игра живёт: первым же тактом стена опускается и отделяется шар
    game.step(NEUTRAL_BRICK_INPUT);
    expect(game['bricksY']).toBe(11);
    expect(game['ball']).not.toBeNull();
  });
});

// ---------------------------------------------------------------- орудие

describe('игра 5: движение орудия', () => {
  it('нажатие сдвигает орудие на колонку, зажатая кнопка повторяется раз в 3 такта', () => {
    const game = frozen();
    const input = driver();
    const positions: number[] = [];
    for (let t = 0; t < 12; t++) {
      game.step(input(['left']));
      positions.push(game['gunX']);
    }
    // сразу 3, дальше 2 — через три такта, 1 — ещё через три, 0 — ещё через три и упор
    expect(positions).toEqual([3, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0, 0]);
    const events = types(game.step(input(['left'])));
    expect(events).not.toContain('move');
  });

  it('событие `move` — только когда орудие сдвинулось', () => {
    const game = frozen();
    expect(types(game.step(makeBrickInput(['right'])))).toEqual(['move']);
    expect(game['gunX']).toBe(5);
    expect(types(game.step(NEUTRAL_BRICK_INPUT))).toEqual([]);
  });

  it('центр орудия доходит до крайних колонок, боковой ствол за краем не виден (как у донора)', () => {
    const game = frozen();
    game['gunX'] = 0;
    expect(screen(game).slice(18)).toEqual(['#.........', '##........']);
    game['gunX'] = 9;
    expect(screen(game).slice(18)).toEqual(['.........#', '........##']);
    game.step(makeBrickInput(['right']));
    expect(game['gunX']).toBe(9);
    game['gunX'] = 0;
    game.step(makeBrickInput(['left']));
    expect(game['gunX']).toBe(0);
  });

  it('обе кнопки сразу: сдвиги гасят друг друга', () => {
    const game = frozen();
    const events = game.step(makeBrickInput(['left', 'right']));
    expect(game['gunX']).toBe(4);
    expect(types(events)).toEqual([]);
  });

  it('на перевёрнутом поле влево по-прежнему влево, а орудие вверху', () => {
    const game = frozen(8);
    game.step(makeBrickInput(['left']));
    expect(game['gunX']).toBe(3);
    expect(screen(game).slice(0, 2)).toEqual(['..###.....', '...#......']);
  });

  it('орудие, въехавшее в шар, погибает', () => {
    const game = frozen();
    game['ball'] = { x: 3, y: 0, dx: 1 };
    game['wall'].count++;
    const events = game.step(makeBrickInput(['left']));
    expect(types(events)).toEqual(expect.arrayContaining(['crash', 'explode']));
    expect(game['gunX']).toBe(4); // орудие остаётся на месте и взрывается там
    expect(game['dead']).toBe(true);
  });
});

// ---------------------------------------------------------------- пули

describe('игра 5: пули', () => {
  it('выстрел: пуля мигает над дулом и поднимается на клетку за такт, звучит `shot`', () => {
    const game = frozen();
    setBricks(game, [[0, 0]]); // стена далеко, колонка 4 пуста
    const first = game.step(makeBrickInput(['rotate']));
    expect(types(first)).toEqual(['shot']);
    // донорская строка 2 -> строка экрана 17
    expect(screen(game)[17]).toBe('....*.....');
    game.step(NEUTRAL_BRICK_INPUT);
    expect(screen(game)[17]).toBe('..........');
    expect(screen(game)[16]).toBe('....*.....');
    game.step(NEUTRAL_BRICK_INPUT);
    expect(screen(game)[15]).toBe('....*.....');
  });

  it('кнопка огня `fire` стреляет так же, как `rotate`, обе вместе — одним выстрелом', () => {
    const game = frozen();
    expect(types(game.step(makeBrickInput(['fire'])))).toEqual(['shot']);
    const both = frozen();
    both.step(makeBrickInput(['rotate', 'fire']));
    expect(both['bullets'].length).toBe(1);
  });

  it('зажатый огонь: выстрел раз в 90 мс (5 тактов) с одним стволом и раз в 180 мс (11 тактов) с двумя', () => {
    const count = (mode: number, ticks: number): number => {
      const game = frozen(mode);
      setBricks(game, [[0, 0]]);
      const input = driver();
      let shots = 0;
      for (let t = 0; t < ticks; t++) shots += game.step(input(['rotate'])).filter((event) => event.type === 'shot').length;
      return shots;
    };
    expect(msToTicks(90)).toBe(5);
    expect(msToTicks(180)).toBe(11);
    expect(count(0, 30)).toBe(6); // такты 0, 5, 10, 15, 20, 25
    expect(count(2, 33)).toBe(3); // такты 0, 11, 22
  });

  it('пуля с двумя стволами летит вдвое медленнее: клетка за два такта (30 мс), с одним — за такт (15 мс)', () => {
    expect([msToTicks(30), msToTicks(15)]).toEqual([2, 1]);
    const rowsOf = (mode: number, column: number): number[] => {
      const game = frozen(mode);
      setBricks(game, [[0, 0]]);
      game.step(makeBrickInput(['rotate']));
      const rows: number[] = [];
      for (let t = 0; t < 10; t++) {
        game.step(NEUTRAL_BRICK_INPUT);
        rows.push(screen(game).findIndex((line) => line[column] === '*'));
      }
      return rows;
    };
    // с одним стволом пуля каждый такт на строку выше
    const one = rowsOf(0, 4);
    expect(one).toEqual([16, 15, 14, 13, 12, 11, 10, 9, 8, 7]);
    // с двумя — каждая клетка держится два такта
    const two = rowsOf(2, 3);
    expect(two).toEqual([17, 17, 16, 16, 15, 15, 14, 14, 13, 13]);
  });

  it('у края поля орудие стреляет одним боковым стволом', () => {
    const left = frozen(2);
    left['gunX'] = 0;
    left.step(makeBrickInput(['rotate']));
    expect(left['bullets'].map((bullet) => bullet.x)).toEqual([1]);
    const right = frozen(2);
    right['gunX'] = 9;
    right.step(makeBrickInput(['rotate']));
    expect(right['bullets'].map((bullet) => bullet.x)).toEqual([8]);
  });

  it('пуля, не нашедшая цели, вспыхивает на верхней строке один такт и пропадает', () => {
    const game = frozen();
    setBricks(game, [[0, 0]]);
    game.step(makeBrickInput(['rotate'])); // выстрел, пуля на строке экрана 17
    const seen: number[] = [];
    for (let t = 0; t < 30; t++) {
      game.step(NEUTRAL_BRICK_INPUT);
      seen.push(screen(game).findIndex((line) => line[4] === '*'));
    }
    // пуля прошла строки 16 .. 0, на нулевой простояла один такт
    expect(seen.slice(0, 17)).toEqual([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(seen.slice(17).every((row) => row === -1)).toBe(true);
    expect(game['bullets']).toEqual([]);
  });

  it('пули в одной колонке не мешают друг другу', () => {
    const game = frozen();
    setBricks(game, [[0, 0]]);
    const input = driver();
    for (let t = 0; t < 12; t++) game.step(input(['rotate']));
    expect(game['bullets'].length).toBeGreaterThanOrEqual(2);
    const stars = screen(game).filter((line) => line[4] === '*').length;
    expect(stars).toBe(game['bullets'].filter((bullet) => bullet.shown >= 0).length);
  });
});

// ---------------------------------------------------------------- попадания

describe('игра 5: попадания по массиву', () => {
  it('пуля выбивает ближайший кирпич колонки; за попадание очко и звук `hit`', () => {
    const game = frozen();
    // колонка 4 уровня 1: кирпичи в рядах стены 0..4 снизу (верхние три ряда рисунка в этой колонке пусты)
    expect(game['wall'].count).toBe(48);
    game.step(makeBrickInput(['rotate']));
    // пуля летит 10 тактов (строки 2..11) и на одиннадцатой клетке, в нижнем ряду стены, находит кирпич
    const events = idle(game, 10);
    expect(types(events)).toEqual(['hit']);
    expect(game.score).toBe(1);
    expect(game['wall'].count).toBe(47);
    expect(hasBrick(game['wall'], 4, 0)).toBe(false);
    expect(hasBrick(game['wall'], 4, 1)).toBe(true);
    expect(game['bullets']).toEqual([]);
  });

  it('пуля задерживается ровно в такт попадания: перед ним летит, в него исчезает', () => {
    const game = frozen();
    game.step(makeBrickInput(['rotate']));
    for (let t = 0; t < 9; t++) game.step(NEUTRAL_BRICK_INPUT);
    // последняя клетка перед кирпичом: донорская строка 11 -> строка экрана 8, кирпич нижнего ряда на строке 7
    expect(at(game, 4, 8)).toBe('*');
    expect(at(game, 4, 7)).toBe('#');
    game.step(NEUTRAL_BRICK_INPUT);
    expect(at(game, 4, 8)).toBe('.');
    expect(at(game, 4, 7)).toBe('.');
  });

  it('следующие выстрелы пробивают колонку слой за слоем', () => {
    const game = frozen();
    const input = driver();
    let hits = 0;
    for (let t = 0; t < 120; t++) hits += game.step(input(['rotate'])).filter((event) => event.type === 'hit').length;
    // в колонке 4 уровня 1 пять кирпичей, дальше пуля улетает в пустоту
    expect(hits).toBe(5);
    expect(game.score).toBe(5);
    for (let row = 0; row < 8; row++) expect(hasBrick(game['wall'], 4, row)).toBe(false);
  });

  it('пуля пролетает сквозь дыры в стене и бьёт кирпич выше', () => {
    const game = frozen();
    game['gunX'] = 0;
    // колонка 0 уровня 1: кирпичи только в рядах 3 и 4 снизу (под ними — пустые клетки)
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((row) => hasBrick(game['wall'], 0, row))).toEqual([
      false, false, false, true, true, false, false, false,
    ]);
    game.step(makeBrickInput(['rotate']));
    for (let t = 0; t < 40; t++) game.step(NEUTRAL_BRICK_INPUT);
    expect(hasBrick(game['wall'], 0, 3)).toBe(false);
    expect(hasBrick(game['wall'], 0, 4)).toBe(true);
    expect(game.score).toBe(1);
  });

  it('два ствола бьют сразу по двум колонкам', () => {
    const game = frozen(2);
    game.step(makeBrickInput(['rotate']));
    const events: BrickEvent[] = [];
    for (let t = 0; t < 40; t++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
    expect(events.filter((event) => event.type === 'hit').length).toBe(2);
    expect(game.score).toBe(2);
    expect(hasBrick(game['wall'], 3, 0)).toBe(false);
    expect(hasBrick(game['wall'], 5, 0)).toBe(false);
  });

  it('на перевёрнутом поле пули летят вниз к стене, внизу экрана', () => {
    const game = frozen(8);
    game.step(makeBrickInput(['rotate']));
    expect(screen(game)[2]).toBe('....*.....');
    for (let t = 0; t < 11; t++) game.step(NEUTRAL_BRICK_INPUT);
    expect(game.score).toBe(1);
    expect(game['wall'].count).toBe(47);
    // в перевёрнутой стене выбитый кирпич — на строке 12 экрана, а не 7
    expect(at(game, 4, 12)).toBe('.');
  });

  it('счёт растёт и после крупных серий, а добавочная жизнь даётся каждую тысячу очков', () => {
    const game = frozen();
    game['setLives'](3);
    game['setScore'](999);
    game.step(makeBrickInput(['rotate']));
    const events: BrickEvent[] = [];
    for (let t = 0; t < 12; t++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
    expect(game.score).toBe(1000);
    expect(types(events)).toContain('bonus');
    expect(game.lives).toBe(4);
    // жизней уже четыре: следующая тысяча даёт бонус к счёту (десятая часть)
    game['setScore'](2000);
    expect(game.lives).toBe(4);
    expect(game.score).toBe(2100);
  });
});

// ---------------------------------------------------------------- отдельные точки-враги

describe('игра 5: точка отделяется от стены и летит на игрока', () => {
  it('в первом такте игры стена опускается на строку, от неё отделяется самый правый кирпич нижнего ряда', () => {
    const game = ready();
    expect(types(game.step(NEUTRAL_BRICK_INPUT))).toEqual(['rotate']);
    expect(game['bricksY']).toBe(11);
    // нижний ряд уровня 1 — `...####...`, правый кирпич — колонка 6
    expect(game['ball']).toEqual({ x: 6, y: 11, dx: 1 });
    expect(hasBrick(game['wall'], 6, 0)).toBe(false);
    expect(game['wall'].count).toBe(48); // шар числится среди оставшихся
    expect(countBricks(game['wall'])).toBe(47);
    // на экране он выглядит ещё как часть стены
    expect(screen(game)[8]).toBe('...####...');
  });

  it('следующий шаг нашествия — через период скорости: 300 мс = 18 тактов на скорости 1', () => {
    const game = ready();
    game.step(NEUTRAL_BRICK_INPUT);
    const startY = game['ball']?.y ?? 0;
    for (let t = 0; t < 17; t++) {
      game.step(NEUTRAL_BRICK_INPUT);
      expect(game['ball']?.y).toBe(startY);
    }
    game.step(NEUTRAL_BRICK_INPUT);
    expect(game['ball']).toEqual({ x: 7, y: startY - 1, dx: 1 });
    // пока шар летит, стена стоит
    expect(game['bricksY']).toBe(11);
  });

  it('шаг нашествия зависит от скорости и от числа кирпичей (больше 50 — медленнее)', () => {
    expect(make(0, { speed: 1 })['invasionPeriod']).toBe(msToTicks(300));
    expect(make(0, { speed: 10 })['invasionPeriod']).toBe(msToTicks(55));
    expect(make(0, { speed: 10 })['invasionPeriod']).toBe(genuineTicks(10, 300, 55));
    // уровень 3: 68 кирпичей, шаг длиннее на 18 мс
    expect(make(0, { speed: 1, level: 3 })['invasionPeriod']).toBe(msToTicks(318));
    expect(make(0, { speed: 10, level: 3 })['invasionPeriod']).toBe(msToTicks(73));
    // уровень 10: 45 кирпичей, штрафа нет
    expect(make(0, { speed: 1, level: 10 })['invasionPeriod']).toBe(msToTicks(300));
    const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((speed) => make(0, { speed })['invasionPeriod']);
    expect([...periods].sort((a, b) => b - a)).toEqual(periods);
    expect(periods[0]).toBeGreaterThan(periods[9] ?? 0);
  });

  it('«волшебное прицеливание»: направление шара выбирается так, чтобы после отскоков он вернулся к орудию', () => {
    const game = frozen();
    const aim = (x: number, y: number, gunX: number): number => {
      game['gunX'] = gunX;
      return game['aim'](x, y);
    };
    // шар слева от орудия: близко по горизонтали -> вправо, к орудию; далеко -> влево, от стены отскочит
    expect(aim(1, 10, 4)).toBe(-1); // |3| < |10|: влево
    expect(aim(1, 2, 4)).toBe(1); // |3| >= |2|: вправо
    // шар справа или над орудием: симметрично
    expect(aim(8, 10, 4)).toBe(1); // |4| < |10|: вправо
    expect(aim(8, 3, 4)).toBe(-1); // |4| >= |3|: влево
    expect(aim(4, 5, 4)).toBe(1); // над орудием: вправо
    expect(aim(4, 0, 4)).toBe(-1);
  });

  it('траектория: диагональ вниз, отскок от правого края, за нижним краем шар пропадает без вреда', () => {
    const game = ready();
    game.step(NEUTRAL_BRICK_INPUT);
    game['invasionLeft'] = SLOW;
    const path: [number, number][] = [];
    const directions: number[] = [];
    for (let step = 0; step < 20 && game['ball']; step++) {
      game['processInvasion']();
      const ball = game['ball'];
      if (!ball) break;
      path.push([ball.x, ball.y]);
      directions.push(ball.dx);
    }
    expect(path).toEqual([
      [7, 10], [8, 9], [9, 8], [8, 7], [7, 6], [6, 5], [5, 4], [4, 3], [3, 2], [2, 1], [1, 0],
    ]);
    // четвёртый шаг: у правого края направление меняется
    expect(directions).toEqual([1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1]);
    expect(game['ball']).toBeNull();
    expect(game['wall'].count).toBe(47); // шар числился среди оставшихся, теперь исчез
    expect(game.score).toBe(0);
    expect(game['dead']).toBe(false);
    // отскок и отделение шара звучат как `rotate`
    expect(types(game.step(NEUTRAL_BRICK_INPUT)).filter((type) => type === 'rotate').length).toBe(1);
    expect(game.lives).toBe(4);
  });

  it('шар, прилетевший в орудие, — потеря жизни: по основанию и по «дулу»', () => {
    // дуло: шар приходит на строку 1 в колонку орудия
    const tip = frozen();
    tip['ball'] = { x: 5, y: 2, dx: -1 };
    tip['wall'].count++;
    tip['invasionLeft'] = 1;
    const tipEvents = tip.step(NEUTRAL_BRICK_INPUT);
    expect(types(tipEvents)).toEqual(['crash', 'explode']);
    // основание: шар приходит на строку 0 в одну из трёх клеток
    const base = frozen();
    base['ball'] = { x: 2, y: 1, dx: 1 };
    base['wall'].count++;
    base['invasionLeft'] = 1;
    expect(types(base.step(NEUTRAL_BRICK_INPUT))).toEqual(['crash', 'explode']);
    // мимо: проходит правее основания орудия
    const miss = frozen();
    miss['ball'] = { x: 8, y: 2, dx: -1 };
    miss['wall'].count++;
    for (let step = 0; step < 2; step++) {
      miss['invasionLeft'] = 1;
      expect(types(miss.step(NEUTRAL_BRICK_INPUT))).toEqual([]);
    }
    expect(miss['ball']).toEqual({ x: 6, y: 0, dx: -1 });
    miss['invasionLeft'] = 1;
    miss.step(NEUTRAL_BRICK_INPUT);
    expect(miss['ball']).toBeNull();
    expect(miss['dead']).toBe(false);
  });

  it('шар, летящий по естественной траектории, убивает неподвижное орудие в колонке 1', () => {
    const game = ready();
    game['gunX'] = 1;
    const events: BrickEvent[] = [];
    for (let t = 0; t < 400 && !types(events).includes('crash'); t++) events.push(...game.step(NEUTRAL_BRICK_INPUT));
    expect(types(events)).toContain('crash');
    // первый шаг + 11 шагов шара по 18 тактов
    expect(game.tick).toBeGreaterThan(INTRO + 11 * 18);
    expect(game.tick).toBeLessThanOrEqual(INTRO + 1 + 11 * 18);
  });

  it('пуля сбивает шар: очков нет, звук `hit`, шар перестаёт считаться оставшимся', () => {
    const game = frozen();
    setBricks(game, [[0, 7]]);
    game['ball'] = { x: 4, y: 8, dx: 1 };
    game['wall'].count++;
    expect(game['wall'].count).toBe(2);
    game.step(makeBrickInput(['rotate']));
    let events: BrickEvent[] = [];
    for (let t = 0; t < 8; t++) events = events.concat(game.step(NEUTRAL_BRICK_INPUT));
    expect(types(events)).toContain('hit');
    expect(game['ball']).toBeNull();
    expect(game.score).toBe(0);
    expect(game['wall'].count).toBe(1);
  });

  it('пуля, летящая рядом с шаром, его не задевает', () => {
    const game = frozen();
    setBricks(game, [[0, 7]]);
    game['ball'] = { x: 5, y: 8, dx: 1 };
    game['wall'].count++;
    game.step(makeBrickInput(['rotate']));
    for (let t = 0; t < 20; t++) game.step(NEUTRAL_BRICK_INPUT);
    expect(game['ball']).not.toBeNull();
    expect(game['wall'].count).toBe(2);
  });

  it('после шара стена снова опускается и отделяет следующий', () => {
    const game = ready();
    game.step(NEUTRAL_BRICK_INPUT);
    // дождаться, когда шар упадёт (11 шагов), и ещё одного шага нашествия
    for (let i = 0; i < 12; i++) {
      game['invasionLeft'] = 1;
      game.step(NEUTRAL_BRICK_INPUT);
    }
    expect(game['ball']).toBeNull();
    expect(game['bricksY']).toBe(11);
    game['invasionLeft'] = 1;
    game.step(NEUTRAL_BRICK_INPUT);
    expect(game['bricksY']).toBe(10);
    // нижний ряд теперь потерял правый кирпич: следующий шар — колонка 5
    expect(game['ball']).toMatchObject({ x: 5, y: 10 });
  });
});

// ---------------------------------------------------------------- стена доходит до орудия

describe('игра 5: стена касается орудия', () => {
  it('любой кирпич на строке дула — гибель, в какой бы колонке он ни был', () => {
    const game = frozen();
    game['gunX'] = 0;
    setBricks(game, [[9, 0]]);
    game['bricksY'] = 2; // нижний ряд стены на строке 2 — безопасно
    game['invasionLeft'] = 1;
    const events = game.step(NEUTRAL_BRICK_INPUT);
    expect(game['bricksY']).toBe(1);
    expect(types(events)).toEqual(['crash', 'explode']);
  });

  it('пустой нижний ряд стену не останавливает: гибель наступает, когда до дула дошёл первый кирпич', () => {
    const game = frozen();
    setBricks(game, [[3, 1], [5, 1]]); // нижний ряд пуст, кирпичи во втором
    game['bricksY'] = 3; // пустой ряд на строке 3, ряд с кирпичами — на 4
    expect(game['dropWall']()).toBe(true); // ряд с кирпичами на 3
    expect(game['dropWall']()).toBe(true); // пустой ряд на строке дула, кирпичи на 2: безопасно
    expect(game['dropWall']()).toBe(false); // кирпичи на строке дула
    expect(game['bricksY']).toBe(0);
  });

  it('потеря жизни: взрыв, минус жизнь, очистка поля, тот же уровень заново, счёт сохраняется', () => {
    const game = frozen();
    game['addScore'](7);
    setBricks(game, [[2, 0], [3, 0]]);
    game['bricksY'] = 2;
    game['invasionLeft'] = 1;
    const events = game.step(NEUTRAL_BRICK_INPUT);
    expect(types(events)).toEqual(['crash', 'explode']);
    expect(game.lives).toBe(4); // жизнь отнимается после взрыва
    // взрыв: 112 тактов, поле не принимает ввод
    const during = idle(game, KABOOM - 1);
    expect(types(during)).toEqual([]);
    expect(game.lives).toBe(4);
    const after = game.step(NEUTRAL_BRICK_INPUT);
    expect(types(after)).toEqual(['lifeLost']);
    expect(game.lives).toBe(3);
    // очистка поля, затем «мелодия» и тот же уровень с новой стеной
    idle(game, CLEAR_LOSE_TICKS);
    expect(game.level).toBe(1);
    expect(game['wall'].count).toBe(48);
    expect(game['gunX']).toBe(4);
    expect(game['bricksY']).toBe(12);
    expect(game.score).toBe(7);
    expect(game['dead']).toBe(false);
    expect(game.phase).toBe('playing');
    // дальше нашествие продолжается
    idle(game, INTRO);
    game.step(NEUTRAL_BRICK_INPUT);
    expect(game['bricksY']).toBe(11);
  });

  it('ввод во время взрыва и очистки не действует', () => {
    const game = frozen();
    setBricks(game, [[2, 0]]);
    game['bricksY'] = 2;
    game['invasionLeft'] = 1;
    game.step(NEUTRAL_BRICK_INPUT);
    const x = game['gunX'];
    for (let t = 0; t < KABOOM - 2; t++) {
      expect(game.step(makeBrickInput(['left', 'rotate']))).toEqual([]);
      expect(game['gunX']).toBe(x);
      expect(game['bullets'].length).toBe(0);
    }
  });

  it('перевёрнутое поле: взрыв у орудия вверху, жизнь отнимается так же', () => {
    const game = frozen(8);
    setBricks(game, [[2, 0]]);
    game['bricksY'] = 2;
    game['invasionLeft'] = 1;
    game.step(NEUTRAL_BRICK_INPUT);
    // у верхнего края экрана горят клетки взрыва (5 × 5 с верхней строки)
    const lines = screen(game);
    expect(lines.slice(0, 5).some((line) => line.includes('#'))).toBe(true);
    idle(game, KABOOM);
    expect(game.lives).toBe(3);
  });

  it('случайная стена после потери жизни — новая случайная стена того же уровня', () => {
    const game = frozen(4);
    const first = Array.from(game['wall'].cells);
    setBricks(game, [[2, 0]]);
    game['bricksY'] = 2;
    game['invasionLeft'] = 1;
    game.step(NEUTRAL_BRICK_INPUT);
    idle(game, KABOOM + CLEAR_LOSE_TICKS);
    expect(game['wall'].height).toBe(generatedHeight(1));
    expect(Array.from(game['wall'].cells)).not.toEqual(first);
  });
});

// ---------------------------------------------------------------- победа, поражение

describe('игра 5: победа в уровне и конец игры', () => {
  coveredScenario(['shooting', 'shooting-array'], 'прогресс', 'последний кирпич выбит: очистка поля, `win`, следующий уровень с новой стеной и «мелодией»', () => {
    const game = frozen();
    game['addScore'](3);
    setBricks(game, [[4, 0]]);
    const shot = game.step(makeBrickInput(['rotate']));
    expect(types(shot)).toEqual(['shot']);
    let events: BrickEvent[] = [];
    for (let t = 0; t < 11; t++) events = events.concat(game.step(NEUTRAL_BRICK_INPUT));
    expect(types(events)).toEqual(['hit', 'win']);
    expect(game.score).toBe(4);
    expect(game.level).toBe(1);
    // очистка поля идёт: заливка снизу вверх
    expect(screen(game)[BRICK_ROWS - 1]).toBe('##########');
    expect(screen(game)[0]).not.toBe('##########');
    expect(idle(game, CLEAR_WIN_TICKS - 2)).toEqual([]);
    expect(game.level).toBe(1);
    const done = idle(game, 1);
    expect(types(done)).toEqual(['levelUp']);
    expect(game.level).toBe(2);
    expect(game['wall'].height).toBe(7);
    expect(game['wall'].count).toBe(54);
    expect(game['bricksY']).toBe(13);
    expect(game['gunX']).toBe(4);
    expect(game.score).toBe(4);
    // «мелодия» и нашествие
    expect(idle(game, INTRO)).toEqual([]);
    expect(types(game.step(NEUTRAL_BRICK_INPUT))).toEqual(['rotate']);
    expect(game['bricksY']).toBe(12);
  });

  it('пока шар в полёте, уровень не выигран; выигран, когда шар сбит или улетел', () => {
    const game = frozen();
    setBricks(game, []);
    game['ball'] = { x: 0, y: 1, dx: 1 };
    game['wall'].count = 1;
    game['invasionLeft'] = 1;
    idle(game, 1); // шар на (1, 0): основание орудия занимает колонки 3..5
    expect(game['ball']).toEqual({ x: 1, y: 0, dx: 1 });
    expect(game.level).toBe(1);
    game['invasionLeft'] = 1;
    const events = idle(game, 1);
    expect(game['ball']).toBeNull();
    expect(types(events)).toEqual(['win']);
  });

  it('после десятого уровня снова первый, а скорость растёт', () => {
    const game = frozen(0, { level: 10, speed: 3 });
    setBricks(game, [[4, 0]]);
    game.step(makeBrickInput(['rotate']));
    idle(game, 11 + CLEAR_WIN_TICKS);
    expect(game.level).toBe(1);
    expect(game.speed).toBe(4);
    expect(game['wall'].height).toBe(8);
    expect(game['invasionPeriod']).toBe(genuineTicks(4, 300, 55));
  });

  it('уровни идут по порядку 1..10, стена каждого уровня — своя', () => {
    for (let level = 1; level <= 10; level++) {
      const game = make(0, { level });
      expect(game['wall'].height).toBe(HEIGHTS_BY_LEVEL[level - 1]);
      expect(game['wall'].count).toBe(COUNTS_BY_LEVEL[level - 1]);
    }
  });

  coveredScenario(['shooting', 'shooting-array'], 'неудача', 'жизни кончились: `gameOver`, заливка рядов, фаза `over`, повторный старт начинает партию заново', () => {
    const game = frozen();
    game['addScore'](12);
    game['setLives'](1);
    setBricks(game, [[2, 0]]);
    game['bricksY'] = 2;
    game['invasionLeft'] = 1;
    game.step(NEUTRAL_BRICK_INPUT);
    const events = idle(game, KABOOM + 1);
    expect(types(events)).toEqual(['lifeLost', 'gameOver']);
    expect(game.lives).toBe(0);
    idle(game, GAME_OVER_TICKS + 2);
    expect(game.phase).toBe('over');
    expect(game.overFill).toBe(BRICK_ROWS);
    expect(game.hiScore).toBe(12);
    game.start();
    expect(game.phase).toBe('playing');
    expect(game.lives).toBe(4);
    expect(game.score).toBe(0);
    expect(game.hiScore).toBe(12);
    expect(game['wall'].count).toBe(48);
  });

  it('игрок, который ничего не делает, рано или поздно проигрывает', () => {
    for (const mode of [0, 4, 8]) {
      const game = make(mode, { speed: 10 });
      game.start();
      let gameOver = false;
      let lost = 0;
      for (let t = 0; t < 60000 && game.phase !== 'over'; t++) {
        for (const event of game.step(NEUTRAL_BRICK_INPUT)) {
          if (event.type === 'gameOver') gameOver = true;
          if (event.type === 'lifeLost') lost++;
        }
      }
      expect(gameOver, `вариант ${mode + 1}`).toBe(true);
      expect(game.phase).toBe('over');
      expect(lost).toBe(4);
      expect(game.score).toBe(0);
    }
  });
});

const HEIGHTS_BY_LEVEL = [8, 7, 8, 7, 7, 8, 8, 8, 8, 8];
const COUNTS_BY_LEVEL = [48, 54, 68, 56, 54, 56, 60, 56, 56, 45];

// ---------------------------------------------------------------- бот

/** Предсказать путь шара до падения (те же правила, что в игре): список клеток после каждого шага. */
function ballPath(game: InvadersGame): [number, number][] {
  const ball = game['ball'];
  const path: [number, number][] = [];
  if (!ball) return path;
  let { x, y, dx } = ball;
  while (y > 0) {
    y--;
    let nx = x + dx;
    if (nx < 0 || nx >= BRICK_COLS) {
      dx = -dx;
      nx = x + dx;
    }
    x = nx;
    path.push([x, y]);
  }
  return path;
}

/** Опасна ли колонка `c` для орудия при данном пути шара. */
function dangerous(path: readonly [number, number][], c: number): boolean {
  return path.some(([x, y]) => (y === 1 && x === c) || (y === 0 && Math.abs(x - c) <= 1));
}

/**
 * Бот с доступом к внутренностям: стоит под ближайшей колонкой с кирпичами (с двумя стволами — рядом с ней) и стреляет,
 * а когда шар подлетает, уходит из-под его траектории. Возвращает число прошедших тактов или -1, если не уложился.
 */
function playUntil(game: InvadersGame, done: () => boolean, maxTicks: number): number {
  const input = driver();
  for (let t = 0; t < maxTicks; t++) {
    if (done()) return t;
    if (game.phase === 'over') return -1;
    const held: BrickAction[] = [];
    const wall = game['wall'];
    const x = game['gunX'];
    const columns: number[] = [];
    for (let c = 0; c < WALL_WIDTH; c++) {
      for (let row = 0; row < wall.height; row++) {
        if (hasBrick(wall, c, row)) {
          columns.push(c);
          break;
        }
      }
    }
    const barrels = game.traits.twoBarrels ? [-1, 1] : [0];
    const path = ballPath(game);
    const near = (game['ball']?.y ?? 99) <= 7;
    const stand = (c: number): number[] => barrels.map((b) => c - b).filter((v) => v >= 0 && v < BRICK_COLS);
    // место, где можно стоять: безопасное, если шар подлетает
    const spots: number[] = [];
    for (const c of columns) for (const s of stand(c)) if (!(near && dangerous(path, s))) spots.push(s);
    let goal = x;
    if (near && dangerous(path, x)) {
      const safe = [...Array(BRICK_COLS).keys()].filter((c) => !dangerous(path, c));
      safe.sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
      goal = safe[0] ?? x;
    } else if (spots.length > 0) {
      spots.sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
      goal = spots[0] ?? x;
    }
    if (goal < x) held.push('left');
    else if (goal > x) held.push('right');
    else if (columns.length > 0) held.push('rotate');
    game.step(input(held));
  }
  return done() ? maxTicks : -1;
}

describe('игра 5: бот проходит уровень', () => {
  for (const mode of [0, 2, 4, 6]) {
    it(`вариант ${mode + 1}: бот выбивает стену и переходит на второй уровень, не потеряв жизни`, () => {
      const game = make(mode, { seed: 11 });
      game.start();
      const events: BrickEvent[] = [];
      const original = game.step.bind(game);
      game.step = (input) => {
        const out = original(input);
        events.push(...out);
        return out;
      };
      const ticks = playUntil(game, () => game.level === 2, 6000);
      expect(ticks).toBeGreaterThan(0);
      expect(game.level).toBe(2);
      expect(game.lives).toBe(4);
      expect(types(events)).toContain('win');
      expect(types(events)).toContain('levelUp');
      expect(types(events).filter((type) => type === 'shot').length).toBeGreaterThan(20);
      // счёт — число выбитых кирпичей; часть кирпичей ушла шарами
      expect(game.score).toBeGreaterThan(20);
      expect(game.score).toBeLessThanOrEqual(mode < 4 ? COUNTS_BY_LEVEL[0] ?? 48 : 50);
    });
  }

  it('бот на перевёрнутом поле играет так же', () => {
    const game = make(8, { seed: 5 });
    game.start();
    const ticks = playUntil(game, () => game.level === 2, 6000);
    expect(ticks).toBeGreaterThan(0);
    expect(game.lives).toBe(4);
  });

  it('счёт: за каждый выбитый кирпич по одному очку, за шары — ничего', () => {
    const game = make(0, { seed: 3 });
    game.start();
    let hits = 0;
    const original = game.step.bind(game);
    game.step = (input) => {
      const out = original(input);
      hits += out.filter((event) => event.type === 'hit').length;
      return out;
    };
    playUntil(game, () => game.level === 2, 6000);
    // каждое попадание — либо кирпич (очко), либо шар (без очков)
    expect(hits).toBeGreaterThanOrEqual(game.score);
  });
});

// ---------------------------------------------------------------- детерминизм

describe('игра 5: детерминизм', () => {
  it('одно зерно и одни вводы — одни события и поля, в том числе у случайной стены со сдвигом', () => {
    const run = (seed: number): string[] => {
      const game = make(5, { seed });
      game.start();
      const input = driver();
      const log: string[] = [];
      for (let t = 0; t < 1500; t++) {
        const held: BrickAction[] = t % 40 < 20 ? ['rotate'] : [];
        if (t % 90 < 30) held.push('left');
        else if (t % 90 < 60) held.push('right');
        const events = game.step(input(held));
        log.push(`${types(events).join(',')}|${screen(game).join('')}|${game.score}`);
      }
      return log;
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it('перезапуск партии не портит состояние: новая стена, новые жизни', () => {
    const game = make(4);
    game.start();
    idle(game, 200);
    game.restart();
    expect(game.phase).toBe('ready');
    expect(game.lives).toBe(4);
    expect(game['bullets']).toEqual([]);
    expect(game['ball']).toBeNull();
    expect(game['wall'].height).toBe(generatedHeight(1));
  });
});

// ---------------------------------------------------------------- отрисовка

describe('игра 5: отрисовка', () => {
  it('значения клеток 0/1/2: пули мигают, остальное горит', () => {
    const game = frozen();
    game.step(makeBrickInput(['rotate']));
    const cells = game.cells();
    expect(new Set(cells)).toEqual(new Set([0, 1, 2]));
    // рисование не меняет состояние
    expect(Array.from(game.cells())).toEqual(Array.from(cells));
  });

  it('превью — индикатор жизней', () => {
    const game = make();
    expect(game.preview()?.filter((cell) => cell).length).toBe(8);
    game['setLives'](2);
    expect(game.preview()?.filter((cell) => cell).length).toBe(4);
  });

  it('первый кадр очистки поля виден сразу, в том же такте, что и победа', () => {
    const game = frozen();
    setBricks(game, [[4, 0]]);
    game.step(makeBrickInput(['rotate']));
    for (let t = 0; t < 11; t++) game.step(NEUTRAL_BRICK_INPUT);
    expect(screen(game)[BRICK_ROWS - 1]).toBe('##########');
  });
});
