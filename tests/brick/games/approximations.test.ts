import { scenarioSuite } from '../scenarioCoverage';
import { describe, expect, it } from 'vitest';
import { SeaBattleGame, seaBattleDef, placeFleet, FLEET } from '../../../src/brick/games/seaBattle';
import { RomeoJulietGame, romeoJulietDef } from '../../../src/brick/games/romeoJuliet';
import { makePiece } from '../../../src/brick/games/tetris/shapes';
import { makeBrickInput, NEUTRAL_BRICK_INPUT } from '../../../src/brick/types';
import { GAME_OVER_TICKS } from '../../../src/brick/base';
import { Rng } from '../../../src/brick/rng';
import { conformance } from '../conformance';

const coveredScenario = scenarioSuite('approximations');
conformance(seaBattleDef);
conformance(romeoJulietDef);
const run = (game: SeaBattleGame | RomeoJulietGame, ticks: number) => { for (let i = 0; i < ticks; i++) game.step(NEUTRAL_BRICK_INPUT); };
describe('Sea Battle', () => {
  it('places complete non-touching fleets reproducibly', () => {
    for (let seed = 0; seed < 30; seed++) {
      const board = placeFleet(new Rng(seed));
      expect(board).toEqual(placeFleet(new Rng(seed)));
      FLEET.forEach((length, i) => expect(board.filter((v) => v === i + 1)).toHaveLength(length));
      board.forEach((id, cell) => {
        if (!id) return;
        const x = cell % 10, y = Math.floor(cell / 10);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= 10 || y + dy < 0 || y + dy >= 10) continue;
          expect([0, id]).toContain(board[(y + dy) * 10 + x + dx]);
        }
      });
    }
  });
  coveredScenario('sea-battle', 'неудача', 'hit scores, waits for exactly one enemy reply and rejects a repeated shot', () => {
    const game = new SeaBattleGame(); game.start();
    const target = game['enemy'].findIndex(Boolean);
    game['x'] = target % 10; game['y'] = Math.floor(target / 10);
    expect(game.step(makeBrickInput(['rotate']))).toContainEqual({ type: 'hit' });
    expect(game.score).toBeGreaterThanOrEqual(10);
    game.step(makeBrickInput(['rotate']));
    expect(game['ownShots'].filter(Boolean)).toHaveLength(1);
    run(game, 29); expect(game['enemyShots'].filter(Boolean)).toHaveLength(1);
    expect(game.step(makeBrickInput(['rotate']))).toContainEqual({ type: 'blocked' });
    run(game, 31); expect(game['enemyShots'].filter(Boolean)).toHaveLength(1);
  });
  it('the opponent chooses coordinates without looking at the fleet', () => {
    const a = new SeaBattleGame({ seed: 7 }), b = new SeaBattleGame({ seed: 7 });
    a.start(); b.start(); b['own'].reverse();
    a['reply'] = b['reply'] = 1;
    a.step(NEUTRAL_BRICK_INPUT); b.step(NEUTRAL_BRICK_INPUT);
    expect(a['enemyShots']).toEqual(b['enemyShots']);
  });
  coveredScenario('sea-battle', 'прогресс', 'destroying the last ship wins; losing your fleet ends the game', () => {
    const game = new SeaBattleGame(); game.start();
    game['enemy'].fill(0); game['enemy'][0] = 1;
    expect(game.step(makeBrickInput(['rotate']))).toContainEqual({ type: 'win' });
    expect(game.score).toBe(160); run(game, 120); expect(game.level).toBe(2);
    game['own'].fill(1); game['enemyShots'].fill(1); game['enemyShots'][0] = 0; game['reply'] = 1;
    expect(game.step(NEUTRAL_BRICK_INPUT)).toContainEqual({ type: 'gameOver' });
    run(game, GAME_OVER_TICKS + 2); expect(game.phase).toBe('over');
  });
});
describe('Romeo and Juliet', () => {
  it('starts with a dot at bottom left, a seven-cell column on the right and next-piece preview', () => {
    const game = new RomeoJulietGame();
    expect(game['hero']).toEqual({ x: 0, y: 19 });
    expect(game['board'].filter(Boolean)).toHaveLength(7);
    expect(game.preview()?.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  });
  it('pieces move, rotate, drop and stay on the board without clearing rows', () => {
    const game = new RomeoJulietGame(); game.start();
    game['piece'] = makePiece(1); game['x'] = 3;
    game.step(makeBrickInput(['left'])); expect(game['x']).toBe(2);
    game.step(makeBrickInput(['rotate'])); expect(game['piece'].angle).toBe(1);
    game.step(makeBrickInput(['fire'])); expect(game['board'].filter(Boolean).length).toBe(10);
  });
  coveredScenario('romeo-juliet', 'прогресс', 'the dot waits for stairs and automatically climbs towards Juliet', () => {
    const game = new RomeoJulietGame(); game.start();
    run(game, 12); expect(game['hero']).toEqual({ x: 0, y: 19 });
    // Six rises, then two level steps to the seven-cell target column.
    for (let x = 1; x <= 8; x++) {
      const top = 20 - Math.min(x, 7);
      for (let y = top; y < 20; y++) game['board'][y * 10 + x] = 1;
    }
    run(game, 9 * 12); expect(game['hero']).toEqual({ x: 9, y: 12 });
    expect(game.score).toBe(190); run(game, 120); expect(game.level).toBe(2);
  });
  it('the target remains reachable at the highest starting level', () => {
    const game = new RomeoJulietGame({ level: 10 }); game.start();
    for (let x = 1; x <= 8; x++) for (let y = 20 - x; y < 20; y++) game['board'][y * 10 + x] = 1;
    run(game, 9 * 12);
    expect(game['hero']).toEqual({ x: 9, y: 10 });
    run(game, 120); expect(game.level).toBe(1); expect(game.speed).toBe(2);
  });
  it('a wall taller than one cell cannot be climbed', () => {
    const game = new RomeoJulietGame(); game.start(); game['board'][191] = game['board'][181] = 1;
    run(game, 12); expect(game['hero']).toEqual({ x: 0, y: 19 });
  });
  coveredScenario('romeo-juliet', 'неудача', 'burying the dot loses a life, and restart preserves the score but resets stairs', () => {
    const game = new RomeoJulietGame(); game.start();
    game['piece'] = makePiece(1); game['x'] = 0;
    game.step(makeBrickInput(['fire'])); expect(game.lives).toBe(3);
    run(game, 112); expect(game['hero']).toEqual({ x: 0, y: 19 }); expect(game['board'].filter(Boolean)).toHaveLength(7);
  });
});
