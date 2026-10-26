import { describe, expect, it } from 'vitest';
import { BRICK_CELLS, makeBrickInput, type BrickAction } from '../../src/brick';
import { MINI_GAME_COUNT, MINI_RACING_COUNT, MINI_TETRIS_COUNT, MINI_TETRIS_VARIANTS, miniEntry } from '../../src/brick/games/mini';
import { MINI_FACE_TICKS, MiniConsole, miniIntroField, miniNumberField } from '../../src/brick/miniConsole';

const press = (...actions: BrickAction[]) => makeBrickInput(actions);
const lit = (cells: Uint8Array): number => cells.reduce((sum, cell) => sum + (cell ? 1 : 0), 0);

/** Консоль, прошедшая заставку (одна нажатая кнопка). */
function menu(options: ConstructorParameters<typeof MiniConsole>[0] = {}): MiniConsole {
  const mini = new MiniConsole(options);
  mini.powerOn();
  mini.menu(press('left'));
  return mini;
}

describe('Mini Brick Game B-S96: номера игр', () => {
  it('97 номеров: 00 и 01 — гонки в двух вариациях, 02–96 — 95 вариаций тетриса', () => {
    expect(MINI_GAME_COUNT).toBe(97);
    expect(MINI_RACING_COUNT).toBe(2);
    expect(MINI_TETRIS_COUNT).toBe(95);
    expect(MINI_TETRIS_VARIANTS).toHaveLength(95);
    expect(miniEntry(0)).toMatchObject({ mode: 0, def: { id: 'racing' } });
    expect(miniEntry(1)).toMatchObject({ mode: 1, def: { id: 'racing' } });
    expect(miniEntry(2)).toMatchObject({ mode: 0, def: { id: 'tetris' } });
    expect(miniEntry(96)).toMatchObject({ mode: 94, def: { id: 'tetris' } });
    for (let n = 2; n < MINI_GAME_COUNT; n++) expect(miniEntry(n).def.id).toBe('tetris');
  });

  it('вариации тетриса различаются и 02 — обычный тетрис без особых фигур', () => {
    const first = MINI_TETRIS_VARIANTS[0]!;
    expect(first).toMatchObject({ family: 'plain', supers: [], inverted: false, lineTimer: false, morph: false, shift: false });
    expect(new Set(MINI_TETRIS_VARIANTS.map((v) => `${v.letter}${v.type}`)).size).toBe(95);
    expect(MINI_TETRIS_VARIANTS.at(-1)!.inverted).toBe(true);
  });
});

describe('Mini Brick Game B-S96: заставка и меню', () => {
  it('включение: рожица, потом «96»; кнопка открывает меню, и только после этого игры выбираются', () => {
    const mini = new MiniConsole();
    expect(mini.powerOn()).toEqual([{ type: 'intro' }]);
    expect(mini.screenStage).toBe('intro');
    expect(lit(mini.cells())).toBeGreaterThan(100); // full portrait from the owner photo
    for (let i = 0; i < 40; i++) mini.menu(makeBrickInput());
    const face = mini.cells();
    expect(lit(face)).toBeGreaterThan(20);
    expect(mini.introDone).toBe(false);
    for (let i = 0; i < MINI_FACE_TICKS; i++) mini.menu(makeBrickInput());
    expect(mini.introDone).toBe(true);
    expect(Array.from(mini.cells())).toEqual(Array.from(miniNumberField(96)));
    expect(mini.menu(press('down'))).toEqual([{ type: 'move' }]); // нажатие только открывает меню
    expect(mini.screenStage).toBe('menu');
    expect(mini.gameNumber).toBe(0);
  });

  it('заставку можно пропустить кнопкой и во время рожицы; START тоже открывает меню', () => {
    const early = new MiniConsole();
    early.powerOn();
    early.menu(makeBrickInput());
    expect(early.menu(press('rotate'))).toEqual([{ type: 'move' }]);
    expect(early.screenStage).toBe('menu');
    const viaStart = new MiniConsole();
    viaStart.powerOn();
    expect(viaStart.start()).toEqual([{ type: 'move' }]);
    expect(viaStart.screenStage).toBe('menu');
  });

  it('портрет держится три секунды, затем «96» неподвижно', () => {
    const frames = new Set<string>();
    for (let t = 0; t < MINI_FACE_TICKS; t++) frames.add(Array.from(miniIntroField(t)).join(''));
    expect(frames.size).toBe(1); // static owner-reference portrait
    expect(Array.from(miniIntroField(MINI_FACE_TICKS + 500))).toEqual(Array.from(miniNumberField(96)));
    for (const field of [miniIntroField(0), miniIntroField(MINI_FACE_TICKS)]) expect(field).toHaveLength(BRICK_CELLS);
  });

  it('DOWN листает номера вперёд по кругу, ROTATE — назад; LEFT — уровень 0–12, RIGHT — скорость 0–9', () => {
    const mini = menu();
    expect(mini.menu(press('down'))).toEqual([{ type: 'move' }]);
    expect(mini.gameNumber).toBe(1);
    mini.menu(press('rotate'));
    mini.menu(press('rotate'));
    expect(mini.gameNumber).toBe(96);
    mini.menu(press('down'));
    expect(mini.gameNumber).toBe(0);
    for (let i = 0; i < 13; i++) mini.menu(press('left'));
    expect(mini.displayLevel).toBe(0);
    for (let i = 0; i < 12; i++) mini.menu(press('left'));
    expect(mini.displayLevel).toBe(12);
    for (let i = 0; i < 10; i++) mini.menu(press('right'));
    expect(mini.displaySpeed).toBe(0);
    mini.menu(press('right'));
    expect(mini.displaySpeed).toBe(1);
    expect(mini.menu(makeBrickInput())).toEqual([]); // без нажатия ничего не меняется
  });

  it('на матрице крупное двузначное число: «01», «42», «96» — разные картинки', () => {
    const pictures = [1, 42, 96, 0, 99].map((n) => Array.from(miniNumberField(n)).join(''));
    expect(new Set(pictures).size).toBe(5);
    const field = miniNumberField(96);
    expect(lit(field)).toBeGreaterThan(20);
    expect(Array.from(field.slice(0, 6 * 10))).toEqual(new Array(60).fill(0)); // верхние шесть строк пусты
  });
});

describe('Mini Brick Game B-S96: партии', () => {
  it('00 и 01 запускают гонки с разной формой машины, 02 — тетрис; настройки меню попадают в игру', () => {
    const racing = menu({ game: 0 });
    for (let i = 0; i < 3; i++) racing.menu(press('left'));
    for (let i = 0; i < 4; i++) racing.menu(press('right'));
    expect(racing.start()).toEqual(expect.arrayContaining([{ type: 'started' }]));
    expect(racing.screenStage).toBe('game');
    expect(racing.game?.id).toBe('racing');
    expect(racing.displayLevel).toBe(3);
    expect(racing.displaySpeed).toBe(0); // flag scene; racing acceleration starts at 1 afterward
    const three = menu({ game: 1 });
    three.start();
    expect(three.game?.id).toBe('racing');
    expect(three.game!.cells()).toEqual(racing.game!.cells()); // identical start flag for both variants
    const blocks = menu({ game: 2 });
    blocks.start();
    expect(blocks.game?.id).toBe('tetris');
    expect(blocks.phase).toBe('playing');
  });

  it('все 97 игр создаются, стартуют и отдают поле 10 × 20; тетрис даёт превью', () => {
    for (let n = 0; n < MINI_GAME_COUNT; n++) {
      const mini = menu({ game: n });
      expect(mini.gameNumber).toBe(n);
      mini.start();
      expect(mini.phase).toBe('playing');
      for (let t = 0; t < 30; t++) mini.step(makeBrickInput());
      expect(mini.cells()).toHaveLength(BRICK_CELLS);
      if (n >= 2) expect(mini.preview() ?? mini.cells()).toBeTruthy();
    }
  });

  it('пауза, продолжение, RESET в меню с сохранением выбора; START после конца игры начинает ту же', () => {
    const mini = menu({ game: 5 });
    mini.start();
    expect(mini.pause().length).toBeGreaterThan(0);
    expect(mini.phase).toBe('paused');
    mini.resume();
    expect(mini.phase).toBe('playing');
    mini.restart();
    expect(mini.screenStage).toBe('menu');
    expect(mini.gameNumber).toBe(5);
    expect(Array.from(mini.cells())).toEqual(Array.from(miniNumberField(5)));
    const level = mini.startSettings;
    expect(level).toEqual({ speed: 0, level: 0 });
  });

  it('тетрис доигрывается до конца партии без кнопок, после чего START запускает её заново', () => {
    const mini = menu({ game: 2, seed: 7 });
    mini.start();
    let guard = 0;
    while (mini.phase !== 'over' && guard++ < 60_000) mini.step(makeBrickInput());
    expect(mini.phase).toBe('over');
    mini.start();
    expect(mini.phase).toBe('playing');
    expect(mini.screenStage).toBe('game');
  });

  it('рекорд номера показывается в меню и передаётся игре', () => {
    const mini = menu({ game: 3, hiScore: (n) => n * 100 });
    expect(mini.hiScore).toBe(300);
    mini.start();
    expect(mini.hiScore).toBe(300);
  });
});

it('idle fruit meter fills bottom-up, drains top-down and alternates point/line records every half-second from power-on',()=>{
 const mini=new MiniConsole();mini.powerOn();expect(mini.idleDisplay).toEqual({scale:1,lines:false});
 const step=(n:number)=>{for(let i=0;i<n;i++)mini.menu(makeBrickInput());};
 step(30);expect(mini.idleDisplay).toEqual({scale:2,lines:true});
 step(330);expect(mini.idleDisplay).toEqual({scale:13,lines:false});
 step(30);expect(mini.idleDisplay).toEqual({scale:12,lines:true});
 step(360);expect(mini.idleDisplay).toEqual({scale:0,lines:true});
 step(30);expect(mini.idleDisplay).toEqual({scale:1,lines:false});
});
