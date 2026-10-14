import { describe, expect, it } from 'vitest';
import { Game, makeFrame, SECRET_CHORD, type GameEvent, type InputFrame } from '../../src/core';
import { contextFor, corridor } from '../helpers/builders';
import { marioContext, loadRoomPack } from '../helpers/content';
import { enteredGame } from '../helpers/solver';

/**
 * Жизни по упаковке оригинала: «После старта выдаётся 4 жизни. Если нажать LEFT и DOWN вместе до того, как Марио выпрыгнет
 * из колодца, будет 200 жизней». Аккорд — отдельный бит кадра (`SECRET_CHORD`), его выставляет оболочка (tests/app/secret.test.ts).
 */

const chord: InputFrame = { pressed: 0, held: SECRET_CHORD, released: 0 };
const secretEvents = (events: readonly GameEvent[]): GameEvent[] => events.filter((e) => e.type === 'secretLives');

describe('жизни и секрет: правила пакета комнаты', () => {
  it('по упаковке: после старта 4 жизни; секрет — 200', () => {
    const { rules } = loadRoomPack();
    expect(rules.params.lives).toBe(4);
    expect(rules.params.secret).toEqual({ lives: 200 });
    expect(new Game(marioContext(1)).state.lives).toBe(4);
  });

  it('аккорд в колодце (до старта игры и во время неё) даёт 200 жизней — событие один раз, повтор ничего не меняет', () => {
    const game = new Game(marioContext(1));
    expect(game.state.inWell).toBe(true);
    expect(secretEvents(game.step(makeFrame({})))).toHaveLength(0); // без аккорда — ничего
    expect(game.state.lives).toBe(4);

    expect(secretEvents(game.step(chord))).toEqual([{ type: 'secretLives', lives: 200, tick: game.state.tick }]);
    expect(game.state.lives).toBe(200);
    expect(secretEvents(game.step(chord))).toHaveLength(0); // уже 200: повтор молчит
    expect(game.state.lives).toBe(200);
  });

  it('аккорд, поданный вместе со стартом, тоже засчитывается (держат LEFT + DOWN и жмут S./P.)', () => {
    const game = new Game(marioContext(2));
    game.step({ pressed: makeFrame({ pressed: ['start'] }).pressed, held: makeFrame({ pressed: ['start'] }).held | SECRET_CHORD, released: 0 });
    expect(game.state.phase).toBe('playing');
    expect(game.state.lives).toBe(200);
  });

  it('герой выбрался из колодца — аккорд теряет силу; новая игра и возрождение открывают его снова', () => {
    const { game } = enteredGame(loadRoomPack(), 'mario-1', false);
    expect(game.state.hero.x).toBe(2); // вышел из ямы на правую стойку
    expect(game.state.inWell).toBe(false);
    expect(secretEvents(game.step(chord))).toHaveLength(0);
    expect(game.state.lives).toBe(4);

    game.reset(); // новая игра: снова в колодце
    expect(game.state.inWell).toBe(true);
    game.step(chord);
    expect(game.state.lives).toBe(200);
  });

  it('на паузе аккорд не принимается', () => {
    const game = new Game(marioContext(1));
    game.step(makeFrame({ pressed: ['start'] }));
    game.step(makeFrame({ pressed: ['pause'] }));
    expect(game.state.phase).toBe('paused');
    game.step(chord);
    expect(game.state.lives).toBe(4);
  });

  it('без правила «secret» в пакете аккорд ничего не делает (демо-профиль)', () => {
    const game = new Game(contextFor([{ rows: corridor(10, 4), start: { x: 0, y: 2 } }]));
    expect(game.state.lives).toBe(3);
    game.step(chord);
    expect(game.state.lives).toBe(3);
  });

  it('200 жизней: гибель отнимает одну, игра не заканчивается', () => {
    const game = new Game(marioContext(1));
    game.step(chord);
    expect(game.state.lives).toBe(200);
    game.die('pit'); // вне фазы playing ничего не делает
    expect(game.state.lives).toBe(200);
    game.step(makeFrame({ pressed: ['start'] }));
    game.die('pit');
    expect(game.state.lives).toBe(199);
    expect(game.state.phase).toBe('dead');
  });
});
