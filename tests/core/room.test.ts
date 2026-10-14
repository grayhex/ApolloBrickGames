import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assemblePack } from '../../src/content/validate';
import type { LevelDef } from '../../src/content/schema';
import { createContext, Game, makeFrame, playReplay, stateHash, validationEnv, type Replay } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import { demoRoomContext, levelOf, loadRawPack, loadRoomPack } from '../helpers/content';
import { Pilot } from '../helpers/pilot';
import { idle, run } from '../helpers/script';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'demo-room.replay.json');

/** Сценарий для fixture: ходьба → прыжок через уступ → приземление → граница → обратно → платформа. */
function playRoomScenario(p: Pilot): void {
  const hero = () => p.state.hero;
  p.tick([], ['start']);
  p.until(() => hero().x >= 8, ['right']); // подойти к уступу (x = 9, 10)
  p.tick();
  p.until(() => hero().x >= 11, ['right'], ['jump']); // прыжок через уступ
  p.settle();
  p.until(() => hero().x >= 12, ['right']); // правая граница комнаты
  p.ticks(10, ['right']); // упереться в границу
  p.until(() => hero().x <= 11, ['left']); // назад: уступ мешает (x = 9, 10)
  p.tick();
  p.until(() => hero().x <= 8, ['left'], ['jump']); // обратно через уступ
  p.settle();
  p.until(() => hero().x <= 2, ['left']);
  p.tick();
  p.tick([], ['jump']); // подняться, не сходя с места (платформа x = 3..5 над головой)
  p.until(() => hero().x >= 4, ['right']); // сдвинуться над платформой
  p.settle(); // и встать на неё
}

if (process.env['UPDATE_FIXTURES']) {
  const pilot = new Pilot(demoRoomContext());
  playRoomScenario(pilot);
  writeFileSync(fixturePath, JSON.stringify(pilot.replay()) + '\n');
}

describe('тестовая комната demo-room: данные', () => {
  const pack = loadRoomPack();
  const room = levelOf(pack, 'demo-room') as LevelDef;

  it('в пакете тестовый уровень по видео (первый) и песочница demo-room без переходов и объектов; явная пометка «не оригинальный уровень»', () => {
    expect(pack.levels.map((l) => l.id)).toEqual(['tunnel-run', 'demo-room']);
    expect(pack.manifest.firstLevel).toBe('tunnel-run');
    expect(room.id).toBe('demo-room');
    expect(room.status).toBe('demo');
    expect(room.note).toMatch(/Искусственная тестовая карта; не оригинальный уровень/);
    expect(room.objects).toEqual([]);
    expect(room.transitions).toEqual([]);
    expect(pack.manifest.title).toMatch(/не оригинальный уровень/);
  });

  it('вся комната помещается в окно: камера неподвижна', () => {
    expect(room.width).toBe(pack.screen.viewport.columns);
    expect(room.height).toBe(pack.screen.viewport.rows);
  });

  it('пол сплошной (без пропастей), старт на опоре, виден свободный ход для прыжка', () => {
    const floor = room.rows[room.height - 1] ?? '';
    expect([...floor].every((char) => room.legend[char]?.collision === 'solid')).toBe(true);
    const below = room.rows[room.start.y + 1]?.[room.start.x] ?? '.';
    expect(room.legend[below]?.collision).toBe('solid');
    const solidCells = room.rows.join('').split('').filter((char) => room.legend[char]?.collision === 'solid').length;
    expect(solidCells).toBeLessThan(room.width * room.height * 0.35);
  });

  it('правила: профиль помечен demo; без таймера; стрельба есть (снаряд — сердечко); три жизни', () => {
    expect(pack.rules.status).toBe('demo');
    expect(pack.rules.params.fire).not.toBeNull();
    expect(pack.manifest.sprites.projectile).toBe('cell.heart');
    expect(pack.rules.params.timerLimitTicks).toBe(0);
    expect(pack.rules.params.lives).toBe(3);
    expect(pack.rules.params.jump.triggers).toEqual(['jump', 'up']); // по упаковке: UP — тоже прыжок вверх
  });

  it('все ресурсы-картинки комнаты помечены происхождением; нет ни одного «confirmed» без подтверждения', () => {
    for (const [id, asset] of Object.entries(pack.assets.assets)) {
      expect(asset.kind, id).toBe('image');
      if (asset.kind === 'image') {
        expect(asset.provenance, id).not.toBeNull();
        expect(asset.provenance?.sources.length, id).toBeGreaterThan(0);
        expect(asset.provenance?.status, id).not.toBe('confirmed');
      }
    }
  });

  it('у героя нет зеркального варианта без подтверждения', () => {
    const hero = pack.assets.assets[pack.manifest.sprites.hero];
    expect(hero?.kind === 'image' && hero.mirrorWhenLeft).toBe(false);
  });
});

describe('однокомнатное демо: механика', () => {
  const started = (): Game => {
    const game = new Game(demoRoomContext());
    game.step(makeFrame({ pressed: ['start'] }));
    return game;
  };

  it('ходит влево и вправо, упирается в границы и в уступ', () => {
    const game = started();
    run(game, { held: ['left'], ticks: 30 });
    expect(game.state.hero.x).toBe(0);
    run(game, idle(1), { held: ['right'], ticks: 60 });
    expect(game.state.hero.x).toBe(8); // уступ в клетках x = 9, 10 на высоте героя
  });

  it('прыжок → приземление; повторного прыжка при удержании кнопки нет, пока не отпущена и нажата снова', () => {
    const game = started();
    const events = run(game, { press: ['jump'], held: ['jump'], ticks: 80 });
    expect(events.filter((e) => e.type === 'jump')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'land')).toHaveLength(1);
    expect(game.state.hero).toMatchObject({ x: 1, y: 4, airborne: false });
    const again = run(game, idle(1), { press: ['jump'], held: ['jump'], ticks: 4 });
    expect(again.filter((e) => e.type === 'jump')).toHaveLength(1);
  });

  it('в воздухе прыжок не повторяется (нет двойного прыжка), высота — по таблице', () => {
    const game = started();
    let top = game.state.hero.y;
    for (let i = 0; i < 20; i++) {
      game.step(makeFrame({ pressed: ['jump'], held: ['jump'] })); // жмём на каждом такте
      top = Math.min(top, game.state.hero.y);
    }
    expect(top).toBe(1); // старт на полу y = 4, подъём на 3 клетки
  });

  it('под платформой голова упирается в потолок, на платформу можно запрыгнуть', () => {
    const game = started();
    run(game, { held: ['right'], ticks: 7 }); // шаги на 0-м, 3-м и 6-м тактах: x = 4, под платформой (x = 3..5, y = 4)
    expect(game.state.hero).toMatchObject({ x: 4, y: 4 });
    run(game, idle(1), { press: ['jump'], held: ['jump'] });
    expect(game.state.hero.y).toBe(4); // потолок над головой
  });

  it('герой не покидает комнату, как бы ни управлять', () => {
    const game = started();
    const keys = [['left'], ['right'], ['right', 'jump'], ['left', 'jump'], ['jump'], []] as const;
    for (let i = 0; i < 400; i++) {
      const held = keys[(i * 7 + (i >> 3)) % keys.length] ?? [];
      game.step(makeFrame({ held, pressed: i % 5 === 0 ? ['jump'] : [] }));
      const { x, y } = game.state.hero;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(12);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(4);
    }
  });

  it('пауза замораживает прыжок, продолжение возвращает ту же траекторию', () => {
    const plain = started();
    run(plain, { press: ['jump'], held: ['jump'] }, idle(5));
    const paused = started();
    run(paused, { press: ['jump'], held: ['jump'] }, idle(2));
    run(paused, { press: ['pause'] }, idle(40), { press: ['pause'] }); // пауза и явное продолжение
    run(paused, idle(3)); // 3 такта мира до паузы + 3 после = 6, как у прогона без паузы
    expect(paused.state.hero).toEqual(plain.state.hero);
    expect(paused.state.worldTick).toBe(plain.state.worldTick);
  });

  it('сброс возвращает героя на старт и в состояние ready', () => {
    const game = started();
    run(game, { held: ['right'], ticks: 12 }, { press: ['jump'], held: ['jump'], ticks: 3 });
    game.reset();
    expect(game.state.phase).toBe('ready');
    expect(game.state.hero).toMatchObject({ x: 1, y: 4, airborne: false, jumpIndex: -1 });
    expect(game.state.tick).toBe(0);
  });

  it('другие значения таймингов меняют прыжок без правок кода (данные, а не константы)', () => {
    const raw = loadRawPack('room');
    (raw.rules as { params: { jump: { table: number[] } } }).params.jump.table = [-1, -1, 0];
    const packed = assemblePack(raw, validationEnv(undefined, GLYPH_NAMES));
    const ctx = createContext({ ...packed, manifest: { ...packed.manifest, firstLevel: 'demo-room' } });
    const game = new Game(ctx);
    game.step(makeFrame({ pressed: ['start'] }));
    let top = 4;
    for (let i = 0; i < 30; i++) {
      game.step(makeFrame({ pressed: i === 0 ? ['jump'] : [] }));
      top = Math.min(top, game.state.hero.y);
    }
    expect(top).toBe(2); // таблица [-1, -1, 0]: подъём на 2 клетки
  });

  it('графика не определяет коллизии: замена ресурсов не меняет механику', () => {
    const withArt = demoRoomContext();
    const raw = loadRawPack('room');
    const level = raw.levels[1] as { id: string; legend: Record<string, { collision: string; asset?: string }> };
    expect(level.id).toBe('demo-room');
    for (const entry of Object.values(level.legend)) delete entry.asset; // уровень вообще без рисунков
    const packed = assemblePack(raw, validationEnv(undefined, GLYPH_NAMES));
    const withoutArt = createContext({ ...packed, manifest: { ...packed.manifest, firstLevel: 'demo-room' } });

    const play = (ctx: ReturnType<typeof demoRoomContext>): string => {
      const pilot = new Pilot(ctx);
      playRoomScenario(pilot);
      return stateHash(pilot.state);
    };
    expect(play(withoutArt)).toBe(play(withArt));
  });
});

describe('однокомнатное демо: replay', () => {
  const fixture = (): Replay => JSON.parse(readFileSync(fixturePath, 'utf-8')) as Replay;

  it('fixture на месте и воспроизводится одинаково', () => {
    expect(existsSync(fixturePath)).toBe(true);
    const a = playReplay(demoRoomContext(), fixture());
    const b = playReplay(demoRoomContext(), fixture());
    expect(stateHash(a.game.state)).toBe(stateHash(b.game.state));
  });

  it('сценарий «движение → прыжок → приземление → граница → платформа» даёт ожидаемый итог', () => {
    const { game, events } = playReplay(demoRoomContext(), fixture());
    expect(events.filter((e) => e.type === 'jump').length).toBeGreaterThanOrEqual(2);
    expect(events.filter((e) => e.type === 'land').length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.type === 'shot' || e.type === 'death')).toBe(false);
    expect(game.state.phase).toBe('playing');
    expect(game.state.hero).toMatchObject({ x: 4, y: 2, airborne: false }); // стоит на платформе (y = 3)
  });
});
