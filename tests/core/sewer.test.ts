import { describe, expect, it } from 'vitest';
import { ContentError } from '../../src/content/validate';
import { Game, makeFrame, NEUTRAL_FRAME, type GameEvent } from '../../src/core';
import { contextFor, startedGame } from '../helpers/builders';

/**
 * Колодец («sewer»): щель между двумя трубами, в которую можно провалиться. По видео геймплея (178–214 с) герой стоит на трубе, падает в щель
 * (в ней висит сердце) и оказывается в комнате — ровный пол и большой чёрт. Здесь — механика на маленьких уровнях: вход, возврат в клетку
 * правее колодца с прежним состоянием уровня, гибель в комнате, комната без стопки, проверка данных; победа в комнате (`victory`: чёрт уничтожен
 * или сердца собраны) переносит героя в комнату выхода из тоннеля, а оттуда выход возвращает на уровень.
 */

const W = 24;
const FLOOR = 5;

/** Пол с колодцем: трубы в столбцах 4–5 и 7–8 (ряды 3–5), щель — столбец 6 без пола. */
function mainRows(): string[] {
  const rows = Array.from({ length: 6 }, () => Array.from({ length: W }, () => '.'));
  for (let x = 0; x < W; x++) rows[FLOOR]![x] = '#';
  rows[FLOOR]![6] = '.';
  for (const x of [4, 5, 7, 8]) for (const y of [3, 4]) rows[y]![x] = '#';
  return rows.map((r) => r.join(''));
}

const ROOM_W = 13;
const roomRows = (): string[] => [...Array.from({ length: FLOOR }, () => '.'.repeat(ROOM_W)), '#'.repeat(ROOM_W)];

const heart = (id: string, x: number, y: number) => ({ id, type: 'pickup', x, y, w: 1, h: 1, params: { score: 100 } });

const mainLevel = (extraObjects: object[] = []) => ({
  id: 'main',
  rows: mainRows(),
  start: { x: 6, y: 0 }, // сразу над щелью: герой падает в колодец
  objects: [
    { id: 'well', type: 'sewer', x: 6, y: FLOOR, w: 1, h: 1, params: { returnX: 10, returnY: 4 } },
    heart('h-well', 6, 4),
    heart('h-out', 12, 4),
    ...extraObjects,
  ],
  transitions: [{ from: 'well', to: 'room' }],
});

const roomLevel = (extraObjects: object[] = []) => ({
  id: 'room',
  rows: roomRows(),
  start: { x: 2, y: 0 },
  objects: [{ id: 'exit', type: 'exit', x: 12, y: 0, w: 1, h: 5, params: {} }, ...extraObjects],
});

function game(extra: object[] = [], roomExtra: object[] = []): Game {
  return startedGame(
    contextFor([mainLevel(extra), roomLevel(roomExtra)], (p) => {
      p.timerLimitTicks = 0;
    }),
  );
}

const tick = (g: Game, n: number, frame = NEUTRAL_FRAME): GameEvent[] => {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...g.step(frame));
  return events;
};
const object = (g: Game, id: string) => g.state.objects.find((o) => o.id === id)!;

/** Падает в колодец и доходит до выхода комнаты. */
function intoRoom(g: Game): GameEvent[] {
  const events = tick(g, 60);
  expect(g.state.levelId).toBe('room');
  return events;
}

describe('колодец: падение в щель', () => {
  it('герой падает в щель, подбирает сердце и оказывается в комнате; прохождение уровня не засчитывается', () => {
    const g = game();
    const events = intoRoom(g);
    expect(events.filter((e) => e.type === 'roomEntered')).toEqual([expect.objectContaining({ levelId: 'room', from: 'main' })]);
    expect(events.some((e) => e.type === 'levelCompleted')).toBe(false);
    expect(g.state.score).toBe(100); // сердце в щели
    expect(g.state.phase).toBe('playing');
    expect(g.state.stash).toMatchObject({ levelId: 'main', x: 10, y: 4 });
  });

  it('герой в комнате начинает в клетке старта комнаты, объекты комнаты свежие, снаряды сброшены', () => {
    const g = game([], [heart('r1', 5, 4)]);
    tick(g, 60);
    expect(g.state.levelId).toBe('room');
    expect(object(g, 'r1').active).toBe(true);
    expect(g.state.projectiles).toEqual([]);
  });

  it('использованный колодец закрыт: во второй раз герой в щели просто стоит на дне', () => {
    const g = game();
    intoRoom(g);
    tick(g, 100, makeFrame({ held: ['right'] })); // до выхода
    expect(g.state.levelId).toBe('main');
    expect(object(g, 'well').active).toBe(false);
    // вернулся в клетку (10, 4); идёт влево до трубы, залезает на неё и падает в щель обратно
    const events: GameEvent[] = [];
    for (let i = 0; i < 400 && g.state.levelId === 'main'; i++) {
      // шаг к трубе, прыжок на неё, затем в щель: упрощённо — перенесём героя сами и проверим падение
      if (i === 0) {
        g.state.hero.x = 6;
        g.state.hero.y = 0;
      }
      events.push(...g.step(NEUTRAL_FRAME));
      if (g.state.hero.y === 5 && g.state.hero.x === 6) break;
    }
    expect(g.state.levelId).toBe('main');
    expect(events.some((e) => e.type === 'roomEntered')).toBe(false);
    expect(g.state.hero).toMatchObject({ x: 6, y: 5 });
  });
});

describe('выход из комнаты', () => {
  it('касание выхода возвращает героя в клетку возвращения уровня; сердца и колодец остаются в том состоянии, что были', () => {
    const g = game();
    intoRoom(g);
    const events: GameEvent[] = [];
    for (let i = 0; i < 200 && !events.some((e) => e.type === 'roomLeft'); i++) events.push(...g.step(makeFrame({ held: ['right'] })));
    expect(events.filter((e) => e.type === 'roomLeft')).toEqual([expect.objectContaining({ levelId: 'main', from: 'room' })]);
    expect(g.state.levelId).toBe('main');
    expect(g.state.stash).toBeNull();
    expect(g.state.hero).toMatchObject({ x: 10, y: 4 });
    expect(object(g, 'h-well').active).toBe(false); // подобранное сердце не вернулось
    expect(object(g, 'h-out').active).toBe(true); // остальное нетронуто
    expect(object(g, 'well').active).toBe(false);
    expect(g.state.score).toBe(100);
    expect(g.state.phase).toBe('playing');
  });

  it('после возврата игра идёт как обычно: герой подбирает сердце на уровне', () => {
    const g = game();
    intoRoom(g);
    tick(g, 100, makeFrame({ held: ['right'] }));
    tick(g, 60, makeFrame({ held: ['right'] }));
    expect(object(g, 'h-out').active).toBe(false);
    expect(g.state.score).toBe(200);
  });

  it('комната, запущенная сама по себе (нет стопки): выход — только событие, уровень не меняется', () => {
    const g = startedGame(
      contextFor([roomLevel()], (p) => {
        p.timerLimitTicks = 0;
      }),
    );
    const events = tick(g, 100, makeFrame({ held: ['right'] }));
    expect(events.filter((e) => e.type === 'roomLeft')).toEqual([expect.objectContaining({ levelId: '', from: 'room' })]);
    expect(g.state.levelId).toBe('room');
  });
});

describe('гибель в комнате', () => {
  it('герой погибает в комнате — уровень начинается заново с начала, стопка пуста, сердца на месте', () => {
    const g = game([], [{ id: 'spike', type: 'hazard', x: 2, y: 5, w: 1, h: 1, params: {} }]);
    tick(g, 60);
    // комната: опасная клетка под местом приземления героя (столбец 2, ряд 5 — но там пол; ставим на ряд 4)
    expect(g.state.levelId).toBe('room');
    g.state.hero.x = 2;
    g.state.hero.y = 4;
    object(g, 'spike').y = 4;
    const events = tick(g, 80);
    expect(events.some((e) => e.type === 'death')).toBe(true);
    expect(g.state.levelId).toBe('main');
    expect(g.state.stash).toBeNull();
    expect(g.state.lives).toBe(2);
    expect(object(g, 'h-well').active).toBe(true);
    expect(object(g, 'well').active).toBe(true);
    expect(g.state.hero).toMatchObject({ x: 6, y: expect.any(Number) });
  });
});

describe('проверка данных', () => {
  it('колодец без перехода в комнату отвергается', () => {
    const level = mainLevel();
    level.transitions = [];
    expect(() => contextFor([level, roomLevel()])).toThrow(ContentError);
  });

  it('колодец с переходом «null» (конец игры) отвергается: проваливаться некуда', () => {
    const level = mainLevel();
    level.transitions = [{ from: 'well', to: null as unknown as string }];
    expect(() => contextFor([level, roomLevel()])).toThrow(ContentError);
  });

  it('переход в несуществующую комнату отвергается', () => {
    const level = mainLevel();
    level.transitions = [{ from: 'well', to: 'нет-такой' }];
    expect(() => contextFor([level, roomLevel()])).toThrow(ContentError);
  });
});


describe('победа в комнате и комната выхода из тоннеля', () => {
  const watchRoom = (watch: 'patroller' | 'pickup', extra: object[]) => ({
    id: 'room',
    rows: roomRows(),
    start: { x: 2, y: 0 },
    objects: [{ id: 'victory', type: 'victory', x: 0, y: 0, w: 1, h: 1, params: { watch } }, ...extra],
    transitions: [{ from: 'victory', to: 'tunnel-exit' }],
  });
  const exitRoom = {
    id: 'tunnel-exit',
    rows: roomRows(),
    start: { x: 6, y: 4 },
    objects: [{ id: 'exit', type: 'exit', x: 12, y: 0, w: 1, h: 5, params: {} }],
  };
  const devil = { id: 'boss', type: 'patroller', x: 9, y: 3, w: 2, h: 2, params: { hp: 2, score: 400, range: 0, stepTicks: 1000, stomp: 0 } };
  const game2 = (watch: 'patroller' | 'pickup', roomExtra: object[]): Game =>
    startedGame(
      contextFor([mainLevel(), watchRoom(watch, roomExtra), exitRoom], (p) => {
        p.timerLimitTicks = 0;
      }),
    );

  it('чёрт уничтожен выстрелами — героя переносит в комнату выхода; уровень по-прежнему ждёт в стопке, а выход возвращает героя на него', () => {
    const g = game2('patroller', [devil]);
    intoRoom(g);
    g.state.hero.x = 3;
    g.state.hero.y = 4;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 && g.state.levelId === 'room'; i++) events.push(...g.step(i % 7 === 0 ? makeFrame({ pressed: ['fire'], held: ['fire'] }) : NEUTRAL_FRAME));
    expect(events.filter((e) => e.type === 'hit' && e.targetId === 'boss')).toHaveLength(2);
    expect(events.find((e) => e.type === 'roomEntered' && e.levelId === 'tunnel-exit')).toMatchObject({ from: 'room' });
    expect(events.some((e) => e.type === 'levelStarted' || e.type === 'levelCompleted')).toBe(false);
    expect(g.state.levelId).toBe('tunnel-exit');
    expect(g.state.score).toBe(500); // сердце в щели и чёрт
    expect(g.state.hero).toMatchObject({ x: 6, y: 4 });
    expect(g.state.stash).toMatchObject({ levelId: 'main', x: 10, y: 4 });
    // Выход из комнаты выхода — на уровень.
    const back: GameEvent[] = [];
    for (let i = 0; i < 80 && g.state.levelId === 'tunnel-exit'; i++) back.push(...g.step(makeFrame({ held: ['right'] })));
    expect(back.find((e) => e.type === 'roomLeft')).toMatchObject({ levelId: 'main', from: 'tunnel-exit' });
    expect(g.state.levelId).toBe('main');
    expect(g.state.hero).toMatchObject({ x: 10, y: 4 });
    expect(g.state.stash).toBeNull();
    expect(object(g, 'well').active).toBe(false);
  });

  it('все бонусные сердца собраны — перенос в комнату выхода; пока осталось хоть одно, героя никуда не переносит', () => {
    const hearts = [heart('b1', 3, 4), heart('b2', 8, 4)];
    const g = game2('pickup', hearts);
    intoRoom(g);
    g.state.hero.x = 2;
    g.state.hero.y = 4;
    for (let i = 0; i < 4; i++) g.step(makeFrame({ held: ['right'] })); // дошёл до первого сердца (столбец 3), второе дальше
    expect(g.state.levelId).toBe('room');
    expect(object(g, 'b1').active).toBe(false);
    expect(object(g, 'b2').active).toBe(true);
    expect(g.state.stash).not.toBeNull();
    for (let i = 0; i < 40 && g.state.levelId === 'room'; i++) g.step(makeFrame({ held: ['right'] }));
    expect(g.state.levelId).toBe('tunnel-exit');
    expect(g.state.stash).not.toBeNull();
    expect(g.state.score).toBe(300);
  });

  it('в комнате нет объектов, за которыми следит победа, — победа не наступает (комната не «выигрывается» сама)', () => {
    const g = game2('pickup', []);
    intoRoom(g);
    tick(g, 100);
    expect(g.state.levelId).toBe('room');
  });

  it('гибель в комнате выхода начинает уровень сначала', () => {
    const g = game2('patroller', [devil]);
    intoRoom(g);
    g.state.objects.find((o) => o.id === 'boss')!.active = false;
    tick(g, 3);
    expect(g.state.levelId).toBe('tunnel-exit');
    g.die('pit');
    tick(g, g.ctx.rules.params.deathDelayTicks + 2);
    expect(g.state.levelId).toBe('main');
    expect(g.state.stash).toBeNull();
    expect(object(g, 'well').active).toBe(true);
    expect(object(g, 'h-well').active).toBe(true);
  });

  it('проверка данных: победа без перехода или без параметра «watch» отвергается', () => {
    const noTransition = { ...watchRoom('pickup', [heart('b1', 3, 4)]), transitions: [] };
    expect(() => contextFor([mainLevel(), noTransition, exitRoom])).toThrow(ContentError);
    const noWatch = { ...watchRoom('pickup', [heart('b1', 3, 4)]) };
    noWatch.objects = [{ id: 'victory', type: 'victory', x: 0, y: 0, w: 1, h: 1, params: {} }, heart('b1', 3, 4)];
    expect(() => contextFor([mainLevel(), noWatch, exitRoom])).toThrow(ContentError);
  });
});
