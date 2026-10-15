import { describe, expect, it } from 'vitest';
import { ContentError } from '../../src/content/validate';
import { Game, makeFrame, NEUTRAL_FRAME, type GameEvent } from '../../src/core';
import { contextFor, startedGame } from '../helpers/builders';

/**
 * Колодец («sewer»): щель между двумя трубами, в которую можно провалиться. По видео геймплея (178–214 с) герой стоит на трубе, падает в щель
 * (в ней висит сердце) и оказывается в комнате — ровный пол и большой чёрт. Здесь — механика на маленьких уровнях: вход, возврат в клетку
 * правее колодца с прежним состоянием уровня, гибель в комнате, комната без стопки, проверка данных.
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
