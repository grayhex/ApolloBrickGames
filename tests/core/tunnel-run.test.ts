import { describe, expect, it } from 'vitest';
import { EntryScript } from '../../src/app/entry';
import type { LevelDef } from '../../src/content/schema';
import { Game, makeFrame, NEUTRAL_FRAME, type GameEvent, type InputFrame } from '../../src/core';
import { centerCamera } from '../../src/render/camera';
import { loadRoomPack, roomContext } from '../helpers/content';
import { idle, run } from '../helpers/script';

const pack = loadRoomPack();
const level = pack.levels[0] as LevelDef;
const animations = pack.animations;

/** Игра на тестовом уровне: старт нажат, сценарий входа ждёт. */
function started(): { game: Game; entry: EntryScript } {
  const game = new Game(roomContext());
  const entry = new EntryScript(animations?.entry);
  entry.arm(game.state.levelId);
  game.step(makeFrame({ pressed: ['start'] }));
  return { game, entry };
}

/** Один такт: сценарий входа вместо игрока, пока идёт; иначе кадр игрока. */
function tick(game: Game, entry: EntryScript, player: InputFrame = NEUTRAL_FRAME): readonly GameEvent[] {
  return game.step(entry.next(game.state.levelId, game.state.phase) ?? player);
}

/** Проигрывает сценарий входа до конца. */
function enter(game: Game, entry: EntryScript): void {
  do tick(game, entry);
  while (entry.active);
}

describe('старт запускает тестовый уровень: выход героя из туннеля (ямы под крышкой арки)', () => {
  it('игра начинается на уровне tunnel-run: герой в яме под крышкой, поле шире экрана', () => {
    const game = new Game(roomContext());
    expect(game.state.levelId).toBe('tunnel-run');
    expect(game.state.hero).toMatchObject({ x: 1, y: 5 });
    expect(level.width).toBeGreaterThan(pack.screen.viewport.columns);
    expect(game.state.phase).toBe('ready'); // ждёт нажатия S./P.
  });

  it('сценарий: три удара головой о крышку (крышка исчезает), прыжок на три клетки и шаг вправо — герой на верхушке правой стойки', () => {
    const { game, entry } = started();
    const events: GameEvent[] = [];
    let ticks = 0;
    while (entry.active || ticks === 0) {
      events.push(...tick(game, entry));
      ticks += 1;
      expect(ticks).toBeLessThan(200);
    }
    expect(ticks).toBe(11 + 11 + 11 + 7 + 1 + 12);
    expect(events.filter((e) => e.type === 'bump')).toHaveLength(3);
    expect(events.filter((e) => e.type === 'hit').map((e) => (e.type === 'hit' ? e.destroyed : null))).toEqual([false, false, true]);
    expect(game.state.objects.find((o) => o.id === 'lid')?.active).toBe(false);
    expect(game.state.hero).toMatchObject({ x: 2, y: 2, airborne: false });
    expect(game.state.phase).toBe('playing');
    expect(game.state.score).toBe(0);
  });

  it('пока идёт сценарий, нажатия игрока не мешают; после него герой слушается игрока', () => {
    const { game, entry } = started();
    const left = makeFrame({ held: ['left'] });
    for (let i = 0; i < 20; i++) tick(game, entry, left); // игрок давит влево во время сценария
    expect(entry.active).toBe(true);
    while (entry.active) tick(game, entry, left);
    run(game, idle(15));
    expect(game.state.hero).toMatchObject({ x: 2, y: 2 });
    run(game, { held: ['right'], ticks: 7 });
    expect(game.state.hero.x).toBeGreaterThan(2); // игрок бежит вправо
  });

  it('сценарий запускается заново при возрождении и новой игре (событие levelStarted), но не раньше старта', () => {
    const entry = new EntryScript(animations?.entry);
    expect(entry.next('tunnel-run', 'ready')).toBeNull(); // не вооружён и фаза не playing
    entry.onEvent({ type: 'levelStarted', levelId: 'tunnel-run', tick: 0 });
    expect(entry.next('tunnel-run', 'ready')).toBeNull(); // ждёт нажатия старта
    expect(entry.next('tunnel-run', 'playing')).not.toBeNull();
    expect(entry.active).toBe(true);
    expect(entry.remaining).toBe(11 + 11 + 11 + 7 + 1 + 12 - 1);
    entry.onEvent({ type: 'levelStarted', levelId: 'tunnel-run', tick: 5 }); // новая игра посреди сценария
    expect(entry.active).toBe(false);
    expect(entry.next('tunnel-run', 'playing')?.pressed).toBeGreaterThan(0); // снова с первого кадра (прыжок)
    expect(new EntryScript(null).next('tunnel-run', 'playing')).toBeNull();
  });

  it('pending: сценарий ждёт первого такта игры, идёт и заканчивается', () => {
    const entry = new EntryScript(animations?.entry);
    entry.arm('tunnel-run');
    expect(entry.pending('ready')).toBe(false); // игра ещё не начата
    expect(entry.pending('playing')).toBe(true); // начата, сценарий возьмётся на этом такте
    while (entry.next('tunnel-run', 'playing') !== null && entry.active) {
      expect(entry.pending('paused')).toBe(true); // пауза посреди сценария его не сбрасывает
    }
    expect(entry.pending('playing')).toBe(false);
    expect(new EntryScript(null).pending('playing')).toBe(false);
  });
});

describe('камера: герой остаётся в середине поля, мир прокручивается клетками', () => {
  const area = { columns: 13, rows: 6, levelWidth: level.width, levelHeight: level.height };
  it('столбец героя на экране — 6, пока не упрёмся в края уровня', () => {
    for (const x of [8, 15, 30, 49]) {
      const cam = centerCamera({ x, y: 4 }, area);
      expect(x - cam.x).toBe(6);
    }
    expect(centerCamera({ x: 2, y: 2 }, area).x).toBe(0); // у левого края — без прокрутки
    expect(centerCamera({ x: level.width - 1, y: 4 }, area).x).toBe(level.width - 13); // у правого края — упор
    expect(centerCamera({ x: 20, y: 5 }, area).y).toBe(0); // по вертикали уровень равен экрану
  });
});

describe('стрельба: из центра ячейки вылетает «сердечко»', () => {
  it('выстрел по направлению взгляда: снаряд стартует в клетке героя, летит клетку за 2 такта и пропадает по дальности', () => {
    const { game, entry } = started();
    enter(game, entry);
    run(game, idle(8));
    run(game, { held: ['right'], ticks: 10 }); // сошёл на пол и смотрит вправо
    const { x, y } = game.state.hero;
    const events = run(game, { press: ['fire'], ticks: 1 });
    expect(events.filter((e) => e.type === 'shot')).toEqual([expect.objectContaining({ x, y, dir: 1 })]);
    expect(game.state.projectiles.map((p) => [p.x, p.y])).toEqual([[x, y]]);
    run(game, idle(2));
    expect(game.state.projectiles[0]?.x).toBe(x + 1);
    run(game, idle(40));
    expect(game.state.projectiles).toHaveLength(0);
    expect(pack.manifest.sprites.projectile).toBe('cell.heart'); // а рисуется центральным сегментом фигурки
  });

  it('сердечко попадает в мишень: +10 очков, мишень исчезает; о столб оно разбивается', () => {
    const { game } = started();
    const target = game.state.objects.find((o) => o.id === 't1');
    expect(target).toMatchObject({ x: 24, y: 4 });
    game.state.hero.x = 19;
    game.state.hero.y = 4;
    game.state.hero.facing = 1;
    const events = run(game, { press: ['fire'], ticks: 1 }, idle(14));
    expect(events.find((e) => e.type === 'hit')).toMatchObject({ targetId: 't1', destroyed: true });
    expect(game.state.score).toBe(10);
    expect(target?.active).toBe(false);

    game.state.hero.x = 18; // слева от столба 2 × 2 (x = 15–16)
    game.state.hero.facing = -1;
    const blocked = run(game, { press: ['fire'], ticks: 1 }, idle(10));
    expect(blocked.some((e) => e.type === 'projectileBlocked')).toBe(true);
    expect(game.state.projectiles).toHaveLength(0);
  });

  it('не более двух сердечек одновременно и пауза между выстрелами', () => {
    const { game } = started();
    game.state.hero.x = 42;
    game.state.hero.y = 4;
    game.state.hero.facing = 1; // справа свободно до мишени в x = 49
    const shots = (n: number): number => run(game, { press: ['fire'], ticks: 1 }, idle(n)).filter((e) => e.type === 'shot').length;
    expect(shots(4)).toBe(1); // такт 0: выстрел
    expect(shots(0)).toBe(0); // такт 5: интервал 6 тактов, ещё нельзя
    expect(shots(2)).toBe(1); // такт 6: можно
    run(game, idle(3)); // такт 12: пауза прошла, но в полёте уже два сердечка
    expect(game.state.projectiles).toHaveLength(2);
    expect(shots(0)).toBe(0);
    expect(game.state.projectiles).toHaveLength(2);
  });
});

describe('уровень проходим: бот бежит вправо, прыгает через препятствия и расстреливает мишени', () => {
  it('от старта до финиша — «Участок пройден», очки за все мишени', () => {
    const { game, entry } = started();
    const solid = (x: number, y: number): boolean => {
      if (level.legend[level.rows[y]?.[x] ?? '.']?.collision === 'solid') return true;
      return game.state.objects.some((o, i) => o.active && level.objects[i]?.type !== 'finish' && o.x === x && o.y === y);
    };
    let completed = false;
    for (let t = 0; t < 1800 && !completed; t++) {
      const { x, y, airborne } = game.state.hero;
      const targetAhead = game.state.objects.some((o) => o.active && o.id.startsWith('t') && o.y === y && o.x > x && o.x - x <= 5);
      const jump = !airborne && (solid(x + 1, y) || solid(x + 2, y - 1)) && !targetAhead;
      const player = makeFrame({
        held: ['right'],
        pressed: [...(targetAhead && t % 4 === 0 ? (['fire'] as const) : []), ...(jump ? (['jump'] as const) : [])],
      });
      const events = tick(game, entry, player);
      completed = events.some((e) => e.type === 'gameCompleted');
    }
    expect(completed).toBe(true);
    expect(game.state.phase).toBe('completed');
    expect(game.state.score).toBe(40); // четыре мишени по 10
    expect(game.state.lives).toBe(3);
  });
});
