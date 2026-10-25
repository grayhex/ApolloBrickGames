import { scenarioSuite } from '../scenarioCoverage';
import { describe, expect, it } from 'vitest';
import { SeaBattleGame, seaBattleDef, placeFleet, FLEET, SHOT_LEAD_TICKS } from '../../../src/brick/games/seaBattle';
import { BONUS_START, BONUS_STEP_TICKS, RomeoJulietGame, romeoJulietDef } from '../../../src/brick/games/romeoJuliet';
import { SEA_SHOT } from '../../../src/brick/seaAnimations';
import { makePiece } from '../../../src/brick/games/tetris/shapes';
import { makeBrickInput, NEUTRAL_BRICK_INPUT } from '../../../src/brick/types';
import { GAME_OVER_TICKS } from '../../../src/brick/base';
import { Rng } from '../../../src/brick/rng';
import { conformance } from '../conformance';

const coveredScenario = scenarioSuite('approximations');
conformance(seaBattleDef);
conformance(romeoJulietDef);
const run = (game: SeaBattleGame | RomeoJulietGame, ticks: number) => { for (let i = 0; i < ticks; i++) game.step(NEUTRAL_BRICK_INPUT); };
/** Like `run`, but returns everything the game said. */
const listen = (game: SeaBattleGame | RomeoJulietGame, ticks: number) => Array.from({ length: ticks }, () => game.step(NEUTRAL_BRICK_INPUT)).flat();
/** One turn scene: the field for a moment (the shot is heard), then the recorded clip. */
const SCENE = SHOT_LEAD_TICKS + SEA_SHOT.total;
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
  coveredScenario('sea-battle', 'неудача', 'a shot plays the recorded turn scene first, then a hit scores; the opponent answers once and a repeated shot is rejected', () => {
    const game = new SeaBattleGame(); game.start();
    const target = game['enemy'].findIndex(Boolean);
    game['x'] = target % 10; game['y'] = Math.floor(target / 10);
    expect(game.step(makeBrickInput(['rotate']))).toContainEqual({ type: 'launch' });
    expect(game['ownShots'].filter(Boolean)).toHaveLength(0); // the result waits for the end of the scene
    expect(game.step(makeBrickInput(['rotate']))).toEqual([]); // input is ignored while it plays
    expect(listen(game, SCENE - 1)).toContainEqual({ type: 'hit' });
    expect(game.score).toBeGreaterThanOrEqual(10);
    expect(game['ownShots'].filter(Boolean)).toHaveLength(1);
    expect(game.step(makeBrickInput(['rotate']))).toEqual([]); // the opponent is about to answer: no shot of yours
    expect(listen(game, 40 + SCENE).some((event) => event.type === 'launch')).toBe(true);
    expect(game['enemyShots'].filter(Boolean)).toHaveLength(1);
    expect(game.step(makeBrickInput(['rotate']))).toContainEqual({ type: 'blocked' });
    run(game, SCENE + 20); expect(game['enemyShots'].filter(Boolean)).toHaveLength(1);
  });
  it('the turn scene is the recording: ship with a mine above it, then the mine falls over the targeted column onto the live lower field', () => {
    const game = new SeaBattleGame({ seed: 5 }); game.start();
    game['x'] = 7;
    game.step(makeBrickInput(['rotate']));
    const scene = (): string => Array.from(game.cells().slice(0, 140)).join('');
    const cross = (): { x: number; y: number }[] => Array.from(game.cells().slice(0, 140)).flatMap((v, i) => (v ? [{ x: i % 10, y: Math.floor(i / 10) }] : []));
    listen(game, SHOT_LEAD_TICKS + 4);
    const first = cross();
    expect(first.some(({ x, y }) => y >= 2 && y <= 4 && x >= 6 && x <= 8)).toBe(true); // mine moved from column 5 to column 7
    listen(game, SEA_SHOT.total - 20);
    expect(scene()).not.toBe('');
    // lower field rows are the live board while the mine falls
    const board = game['draw']();
    expect(Array.from(game.cells().slice(150))).toEqual(Array.from(board.slice(150)));
  });
  it('the opponent chooses coordinates without looking at the fleet', () => {
    const a = new SeaBattleGame({ seed: 7 }), b = new SeaBattleGame({ seed: 7 });
    a.start(); b.start(); b['own'].reverse();
    a['reply'] = b['reply'] = 1;
    a.step(NEUTRAL_BRICK_INPUT); b.step(NEUTRAL_BRICK_INPUT);
    run(a, SCENE); run(b, SCENE);
    expect(a['enemyShots']).toEqual(b['enemyShots']);
  });
  coveredScenario('sea-battle', 'прогресс', 'destroying the last ship wins; losing your fleet ends the game', () => {
    const game = new SeaBattleGame(); game.start();
    game['enemy'].fill(0); game['enemy'][0] = 1;
    game.step(makeBrickInput(['rotate']));
    expect(listen(game, SCENE)).toContainEqual({ type: 'win' });
    expect(game.score).toBe(160); run(game, 120); expect(game.level).toBe(2);
    game['own'].fill(1); game['enemyShots'].fill(1); game['enemyShots'][0] = 0; game['reply'] = 1;
    expect(listen(game, SCENE + 2)).toContainEqual({ type: 'gameOver' });
    run(game, GAME_OVER_TICKS + 2); expect(game.phase).toBe('over');
  });
  it('a sunk ship is a noise burst on landing, a plain hit or a miss is the rising drop', () => {
    const game = new SeaBattleGame(); game.start();
    game['enemy'].fill(0); game['enemy'][0] = 1; game['enemy'][1] = 1; // a two-cell ship: the first hit does not sink it
    game['x'] = 5; game['y'] = 5; // miss
    game.step(makeBrickInput(['rotate']));
    expect(listen(game, SCENE).filter((e) => e.type !== 'launch')).toEqual([{ type: 'shot' }]);
    run(game, 40 + SCENE); // the opponent's answer
    game['x'] = 0; game['y'] = 0; // hit, not sunk
    expect(game.step(makeBrickInput(['rotate']))).toContainEqual({ type: 'launch' });
    expect(listen(game, SCENE)).toContainEqual({ type: 'hit' });
    run(game, 40 + SCENE);
    game['x'] = 1; // the last cell of the ship
    game.step(makeBrickInput(['rotate']));
    const events = listen(game, SCENE);
    expect(events).toContainEqual({ type: 'explode' });
    expect(events).not.toContainEqual({ type: 'hit' });
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
    // 9 climbs of 10 and the 100 for Juliet, plus whatever is left of the starting points
    expect(game.score).toBeGreaterThanOrEqual(190 + BONUS_START - 6); expect(game.score).toBeLessThanOrEqual(190 + BONUS_START); run(game, 120); expect(game.level).toBe(2);
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
  it('the counter starts with starting points that shrink with time; the record never drops below the counter', () => {
    const game = new RomeoJulietGame(); game.start();
    expect(game.score).toBe(BONUS_START);
    run(game, BONUS_STEP_TICKS * 10); expect(game.score).toBe(BONUS_START - 10);
    expect(game.hiScore).toBe(BONUS_START);
    game['piece'] = makePiece(1); game['x'] = 3;
    game.step(makeBrickInput(['fire'])); // three cells land on the board: three earned points
    expect(game.score).toBe(BONUS_START - 10 + 3);
  });
  it('the starting points of an attempt run out; a lost attempt gives them up and the next one starts afresh', () => {
    const game = new RomeoJulietGame(); game.start();
    game['bonus'] = 2; game['show']();
    run(game, BONUS_STEP_TICKS * 2 + 1);
    expect(game['bonus']).toBe(0);
    expect(game.score).toBe(game['banked']); // only what the pieces earned is left
    game['piece'] = makePiece(1); game['x'] = 0;
    game.step(makeBrickInput(['fire'])); // buries the dot
    expect(game['banked']).toBe(0); expect(game.lives).toBe(3);
    run(game, 112); expect(game.score).toBe(BONUS_START); // a new attempt, new starting points
  });
  it('every step of the falling figure is announced, a hard drop only lands', () => {
    const game = new RomeoJulietGame(); game.start();
    game['piece'] = makePiece(1); game['x'] = 4;
    const fall = game['fall'].period;
    const events = listen(game, fall * 3 + 1);
    expect(events.filter((event) => event.type === 'step').length).toBeGreaterThanOrEqual(2);
    expect(listen(game, 1)).not.toContainEqual({ type: 'lock' });
    expect(game.step(makeBrickInput(['fire']))).toEqual(expect.arrayContaining([{ type: 'lock' }]));
  });
  coveredScenario('romeo-juliet', 'неудача', 'burying the dot loses a life, and restart preserves the score but resets stairs', () => {
    const game = new RomeoJulietGame(); game.start();
    game['piece'] = makePiece(1); game['x'] = 0;
    game.step(makeBrickInput(['fire'])); expect(game.lives).toBe(3);
    run(game, 112); expect(game['hero']).toEqual({ x: 0, y: 19 }); expect(game['board'].filter(Boolean)).toHaveLength(7);
  });
});
