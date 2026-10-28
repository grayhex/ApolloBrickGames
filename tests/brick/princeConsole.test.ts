import { describe, expect, it } from 'vitest';
import { BRICK_CELLS, makeBrickInput, type BrickAction } from '../../src/brick';
import { PRINCE_FIRST, PRINCE_GAMES, PRINCE_GAME_COUNT, princeEntry, princeNumber } from '../../src/brick/games/prince';
import { PrinceConsole } from '../../src/brick/princeConsole';
import { PRINCE_INTRO_BUILD_TICKS, PRINCE_INTRO_TICKS, princeIntroField } from '../../src/brick/princeIntro';
import { PRINCE_TELL_MS, PRINCE_VERSE_MS } from '../../src/audio/princeTunes';

const press = (...actions: BrickAction[]) => makeBrickInput(actions);
const idle = makeBrickInput();
const lit = (cells: Uint8Array): number => cells.reduce((sum, cell) => sum + (cell ? 1 : 0), 0);

/** Консоль после заставки (одна нажатая кнопка): идёт автоплей. */
function demo(options: ConstructorParameters<typeof PrinceConsole>[0] = {}): PrinceConsole {
  const prince = new PrinceConsole({ seed: 7, ...options });
  prince.powerOn();
  prince.menu(press('left'));
  return prince;
}

describe('Prince 118 in 1: номера игр', () => {
  it('118 вариаций в пяти играх по порядку владельца: тетрис, гонки, танки, фроггер, арканоид', () => {
    expect(PRINCE_GAME_COUNT).toBe(118);
    expect(PRINCE_GAMES.map((game) => game.id)).toEqual(['tetris', 'racing', 'tank', 'frog', 'arkanoid']);
    expect(PRINCE_GAMES.map((game) => game.count)).toEqual([61, 4, 5, 16, 32]);
    expect(PRINCE_FIRST).toEqual([0, 61, 65, 70, 86]);
    for (const game of PRINCE_GAMES) expect(game.def.modes.length).toBeGreaterThanOrEqual(game.def.id === 'tetris' ? 61 : game.count);
  });

  it('номер ↔ игра и вариация: взаимно обратны, номера идут подряд и по кругу', () => {
    for (let n = 0; n < PRINCE_GAME_COUNT; n++) {
      const { game, mode } = princeEntry(n);
      expect(princeNumber(game, mode)).toBe(n);
    }
    expect(princeEntry(0)).toEqual({ game: 0, mode: 0 });
    expect(princeEntry(61)).toEqual({ game: 1, mode: 0 });
    expect(princeEntry(117)).toEqual({ game: 4, mode: 31 });
    expect(princeEntry(118)).toEqual({ game: 0, mode: 0 });
    expect(princeNumber(1, 4)).toBe(61); // вариации идут по кругу внутри игры
  });
});

describe('Prince 118 in 1: заставка', () => {
  it('включение: событие intro; цифры поднимаются по одной снизу, пока не встанут «9 9 9 9 in 1»', () => {
    const prince = new PrinceConsole({ seed: 7 });
    expect(prince.powerOn()).toEqual([{ type: 'intro' }]);
    expect(prince.screenStage).toBe('intro');
    expect(lit(prince.cells())).toBe(0); // в первый такт матрица пуста
    const counts: number[] = [];
    for (let tick = 0; tick < PRINCE_INTRO_BUILD_TICKS + 10; tick++) {
      prince.menu(idle);
      counts.push(lit(prince.cells()));
    }
    expect(counts.some((count) => count > 0)).toBe(true);
    expect(counts.at(-1)).toBeGreaterThan(60); // четыре девятки и надпись на месте
    // число горящих клеток только растёт: элементы выезжают и не пропадают
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
  });

  it('первая девятка выезжает снизу: сначала видна только её верхняя кромка у нижнего края', () => {
    const early = princeIntroField(5);
    expect(lit(early)).toBeGreaterThan(0);
    const rows = Array.from({ length: 20 }, (_, y) => early.slice(y * 10, y * 10 + 10).some(Boolean));
    expect(rows.indexOf(true)).toBeGreaterThanOrEqual(18); // у нижнего края
    expect(lit(princeIntroField(PRINCE_INTRO_BUILD_TICKS))).toBe(lit(princeIntroField(PRINCE_INTRO_BUILD_TICKS + 99)));
  });

  it('четыре девятки и «in 1» не налезают друг на друга: итоговая картинка = сумма частей', () => {
    const final = princeIntroField(PRINCE_INTRO_BUILD_TICKS);
    // четыре девятки по 13 клеток (петля и ножка) и «in 1» из 22 клеток
    expect(lit(final)).toBe(4 * 13 + 22);
  });

  it('заставка длится дольше мелодии «Финала» и сама переходит в автоплей без звука', () => {
    expect(PRINCE_INTRO_TICKS / 60).toBeGreaterThan(PRINCE_TELL_MS / 1000);
    const prince = new PrinceConsole({ seed: 7 });
    prince.powerOn();
    let events = 0;
    for (let tick = 0; tick < PRINCE_INTRO_TICKS + 2; tick++) events += prince.menu(idle).length;
    expect(events).toBe(0);
    expect(prince.screenStage).toBe('menu');
    expect(prince.inMenu).toBe(true);
  });

  it('любая кнопка пропускает заставку: звук выбора и автоплей', () => {
    const prince = new PrinceConsole({ seed: 7 });
    prince.powerOn();
    prince.menu(idle);
    expect(prince.menu(press('down'))).toEqual([{ type: 'move' }]);
    expect(prince.screenStage).toBe('menu');
    expect(demo().start()).toBeTruthy();
  });

  it('START в заставке открывает автоплей, а не начинает партию', () => {
    const prince = new PrinceConsole({ seed: 7 });
    prince.powerOn();
    expect(prince.start()).toEqual([{ type: 'move' }]);
    expect(prince.screenStage).toBe('menu');
    expect(prince.game.phase).toBe('playing'); // демонстрация идёт
  });
});

describe('Prince 118 in 1: автоплей и выбор', () => {
  it('идёт сам: за пару секунд поле меняется без нажатий', () => {
    const prince = demo();
    const first = Uint8Array.from(prince.cells());
    for (let i = 0; i < 300; i++) prince.menu(idle);
    expect(prince.cells()).not.toEqual(first);
    expect(prince.inMenu).toBe(true);
  });

  it('большая кнопка листает игры по кругу: тетрис → гонки → танки → фроггер → арканоид → тетрис', () => {
    const prince = demo();
    const seen = [prince.gameId];
    for (let i = 0; i < 5; i++) {
      expect(prince.menu(press('rotate'))).toEqual([{ type: 'move' }]);
      seen.push(prince.gameId);
    }
    expect(seen).toEqual(['tetris', 'racing', 'tank', 'frog', 'arkanoid', 'tetris']);
    expect(prince.menu(press('up'))).toEqual([{ type: 'move' }]); // UP — назад
    expect(prince.gameId).toBe('arkanoid');
  });

  it('DOWN листает вариации внутри игры, LEFT — уровень 0–12, RIGHT — скорость 0–9 (по кругу)', () => {
    const prince = demo();
    prince.menu(press('down'));
    expect(prince.gameNumber).toBe(1);
    for (let i = 0; i < 60; i++) prince.menu(press('down'));
    expect(prince.gameNumber).toBe(0); // 61 вариация тетриса — и снова первая
    for (let i = 0; i < 13; i++) prince.menu(press('left'));
    expect(prince.displayLevel).toBe(0);
    for (let i = 0; i < 12; i++) prince.menu(press('left'));
    expect(prince.displayLevel).toBe(12);
    for (let i = 0; i < 10; i++) prince.menu(press('right'));
    expect(prince.displaySpeed).toBe(0);
    prince.menu(press('right'));
    expect(prince.startSettings).toEqual({ speed: 1, level: 12 });
  });

  it('большая кнопка возвращает к последней вариации игры', () => {
    const prince = demo();
    for (let i = 0; i < 5; i++) prince.menu(press('down')); // тетрис, вариация 6
    prince.menu(press('rotate')); // гонки
    prince.menu(press('down'));
    expect(prince.gameNumber).toBe(PRINCE_FIRST[1]! + 1);
    for (let i = 0; i < 4; i++) prince.menu(press('rotate')); // по кругу назад в тетрис
    expect(prince.gameNumber).toBe(5);
  });

  it('вкладка левой панели ставит курсор на игру только в автоплее', () => {
    const prince = demo();
    prince.selectGame('frog');
    expect(prince.gameId).toBe('frog');
    prince.selectGame('нет такой');
    expect(prince.gameId).toBe('frog');
    prince.start();
    prince.selectGame('tank');
    expect(prince.gameId).toBe('frog'); // в партии выбор не меняется
  });

  it('автоплей каждой игры идёт и начинается заново после конца', () => {
    for (const [index, game] of PRINCE_GAMES.entries()) {
      const prince = demo({ game: PRINCE_FIRST[index]! });
      expect(prince.gameId).toBe(game.id);
      let changes = 0;
      let last = '';
      for (let i = 0; i < 1500; i++) {
        prince.menu(idle);
        const key = prince.cells().join('');
        if (key !== last) changes++;
        last = key;
      }
      expect(changes, game.id).toBeGreaterThan(20);
      expect(prince.inMenu).toBe(true);
    }
  });
});

describe('Prince 118 in 1: партия', () => {
  it('START начинает партию выбранной вариации с выбранными скоростью и уровнем', () => {
    const prince = demo({ game: PRINCE_FIRST[2]! });
    prince.menu(press('left'));
    prince.menu(press('right'));
    prince.menu(press('right'));
    expect(prince.start()).toContainEqual({ type: 'started' });
    expect(prince.inMenu).toBe(false);
    expect(prince.screenStage).toBe('game');
    expect(prince.gameId).toBe('tank');
    expect(prince.phase).toBe('playing');
    expect(prince.displaySpeed).toBe(2);
    expect(prince.displayLevel).toBe(1);
    expect(prince.cells()).toHaveLength(BRICK_CELLS);
  });

  it('у тетриса «вверх» — поворот, у остальных игр — движение', () => {
    const tetris = demo();
    tetris.start();
    const before = tetris.cells().join('');
    tetris.step(press('up'));
    expect(tetris.cells().join('')).not.toBe(before);
    const frog = demo({ game: PRINCE_FIRST[3]! });
    frog.start();
    const frogBefore = frog.cells().join('');
    for (let i = 0; i < 3; i++) frog.step(press('up'));
    expect(frog.cells().join('')).not.toBe(frogBefore);
  });

  it('RESET из партии возвращает в автоплей, а выбор сохраняется', () => {
    const prince = demo({ game: PRINCE_FIRST[1]! });
    prince.menu(press('down'));
    prince.start();
    prince.restart();
    expect(prince.inMenu).toBe(true);
    expect(prince.screenStage).toBe('menu');
    expect(prince.gameNumber).toBe(PRINCE_FIRST[1]! + 1);
  });

  it('рекорд берётся по номеру вариации', () => {
    const prince = demo({ hiScore: (n) => (n === 0 ? 1234 : 7) });
    expect(prince.hiScore).toBe(1234);
    prince.menu(press('down'));
    expect(prince.hiScore).toBe(7);
  });

  it('одинаковое зерно — одинаковый автоплей', () => {
    const a = demo({ seed: 11 });
    const b = demo({ seed: 11 });
    for (let i = 0; i < 400; i++) {
      a.menu(idle);
      b.menu(idle);
    }
    expect(a.cells()).toEqual(b.cells());
  });
});

describe('Prince 118 in 1: мелодии', () => {
  it('«Финал» — монофония около 11 секунд, куплет — 16 четвертей', () => {
    expect(PRINCE_TELL_MS).toBeGreaterThan(10_000);
    expect(PRINCE_TELL_MS).toBeLessThan(14_000);
    expect(PRINCE_VERSE_MS).toBeCloseTo(16 * 536, -1);
  });
});
