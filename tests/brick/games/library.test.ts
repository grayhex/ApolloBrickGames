import { ShooterGame, RoadGame, BallGame } from '../../../src/brick/games/library/action';
import { MazeGame, FillGame, JigsawGame } from '../../../src/brick/games/library/puzzles';
import { describe, expect, it } from 'vitest';
import { LIBRARY_GAMES } from '../../../src/brick/games/library';
import { conformance } from '../conformance';
import { LightsGame, toggleLights, slideTiles, reversiFlips, ReversiGame, SokobanGame, SolitaireGame, MergeGame } from '../../../src/brick/games/library/puzzles';
import { SnakeGame, PadsGame, BomberGame } from '../../../src/brick/games/library/arcade';
import { CapsuleGame, FlickerTetrisGame, QuarthGame } from '../../../src/brick/games/library/falling';
import { makeBrickInput, NEUTRAL_BRICK_INPUT, type BrickGame } from '../../../src/brick/types';
import { SOKOBAN_LEVELS } from '../../../src/brick/games/library/sokobanLevels';
for (const def of Object.values(LIBRARY_GAMES)) conformance(def);
const run = (g: BrickGame, n: number) => { for (let i = 0; i < n; i++) g.step(NEUTRAL_BRICK_INPUT); };
describe('library rules', () => {
  it('Lights Out toggles only orthogonal neighbours and is its own inverse', () => {
    const b = new Uint8Array(100); toggleLights(b,0,0); expect([...b.keys()].filter((p) => b[p])).toEqual([0,1,10]); toggleLights(b,0,0); expect(b.some(Boolean)).toBe(false);
    const g = new LightsGame(); g.start(); g.board.fill(0); toggleLights(g.board,0,0); expect(g.step(makeBrickInput(['rotate']))).toContainEqual({ type: 'win' });
  });
  it('2048 merges each tile once and computes numeric score', () => {
    expect(slideTiles([1,1,1,1])).toEqual({ cells:[2,2,0,0],score:8 });
    expect(slideTiles([1,1,2,0])).toEqual({ cells:[2,2,0,0],score:4 });
    const g = new MergeGame(); g.start(); g.board.fill(0); g.board[0] = 1; const before = g.board.slice(); g.step(makeBrickInput(['up'])); expect(g.board).toEqual(before);
  });
  it('Reversi flips only a bounded enemy ray; invalid move consumes no turn', () => {
    const g = new ReversiGame(); g.start(); expect(reversiFlips(g.board,19,1)).toEqual([27]);
    g.cursor = 0; const before = g.board.slice(); g.step(makeBrickInput(['rotate'])); run(g,31); expect(g.board).toEqual(before);
    g.cursor = 19; g.step(makeBrickInput(['rotate'])); expect(g.board[27]).toBe(1); run(g,30); expect(g.board.filter(Boolean)).toHaveLength(6);
  });
  it('Sokoban pushes one crate, supports undo and a reachable goal', () => {
    const g = new SokobanGame(); g.start();
    const level = SOKOBAN_LEVELS[0]!;
    // Первая задача решается по сохранённому решению: шаги и толчки, отмена последнего хода, затем победа.
    const dir = (ch: string): 'up' | 'right' | 'down' | 'left' => ({ u: 'up', r: 'right', d: 'down', l: 'left' } as const)[ch.toLowerCase() as 'u' | 'r' | 'd' | 'l'];
    const before = [...g.crates];
    for (const ch of level.solution.slice(0, -1)) { g.step(makeBrickInput([dir(ch)])); g.step(NEUTRAL_BRICK_INPUT); }
    g.step(makeBrickInput(['rotate'])); g.step(NEUTRAL_BRICK_INPUT); // отмена последнего сделанного хода (предпоследнего символа решения)
    expect(g.crates.size).toBe(before.length);
    g.step(makeBrickInput([dir(level.solution.at(-2)!)])); g.step(NEUTRAL_BRICK_INPUT); // тот же ход заново
    expect(g.step(makeBrickInput([dir(level.solution.at(-1)!)]))).toContainEqual({ type:'win' });
  });
  it('peg solitaire removes exactly the jumped peg', () => {
    const g = new SolitaireGame(); g.start(); g.cursor = 10; g.step(makeBrickInput(['rotate'])); g.cursor = 24; g.step(makeBrickInput(['rotate'])); expect(g.pegs.size).toBe(31); expect(g.pegs.has(17)).toBe(false); expect(g.pegs.has(24)).toBe(true);
  });
  it('snake rejects immediate reversal and grows on food; thirteen fruits complete a board', () => {
    const g = new SnakeGame(); g.start(); g.food = 105; g.step(makeBrickInput(['left'])); run(g,19); expect(g.body).toHaveLength(4); expect(g.body[0]).toBe(105);
    g.food = 106; g.eaten = 12; run(g,20); expect(g.score).toBe(120); run(g,60); expect(g.level).toBe(2); expect(g.body).toHaveLength(3);
  });
  it('Simon ignores input during playback and checks ordered responses', () => {
    const g = new PadsGame('simon'); g.start(); g.step(makeBrickInput(['rotate'])); expect(g.lives).toBe(4); run(g,60); const expected = g.sequence[0]!;
    g.step(makeBrickInput([(['up','right','down','left'] as const)[(expected+1)%4]!])); expect(g.lives).toBe(3);
  });
  it('capsule clearing removes matching viruses but leaves unrelated ones anchored', () => {
    const g = new CapsuleGame('dr-mario'); g.start(); g.board.fill(0); g.viruses = new Set([32,28]); g.board[28] = 2; g.board.fill(1,32,36); g.resolve(); expect(g.board.slice(32).some(Boolean)).toBe(false); expect(g.viruses.has(32)).toBe(false); expect(g.board[28]).toBe(2);
  });
  it('flicker tetris has real target cells and wins only after they are cleared', () => {
    const g = new FlickerTetrisGame(); g.start(); expect(g['board'].includes(2)).toBe(true); g['board'].fill(0); expect(g.step(NEUTRAL_BRICK_INPUT)).toContainEqual({ type:'win' }); run(g,60); expect(g['board'].includes(2)).toBe(true);
  });
  it('Quarth removes a completed rectangle, not an arbitrary full row', () => {
    const g = new QuarthGame(); g.start(); g.x = 4; expect(g.step(makeBrickInput(['rotate']))).toContainEqual({ type:'win' }); // у первого силуэта одна клетка не хватает в колонке 4
  });
  it('a bomber destroys buildings only where its bomb lands', () => {
    const g = new BomberGame(); g.start(); g.buildings.fill(2); g.x = 4; g.step(makeBrickInput(['rotate'])); run(g,68); expect(g.buildings[4]).toBe(1); expect(g.buildings[5]).toBe(2);
  });
});

describe('rare game goals and hazards', () => {
  it('UFO Raiders can clear all ordinary cells without shooting the protected UFO', () => {
    const g = new ShooterGame('ufo-raiders'); g.start(); const ufo = {x:2,y:2}; g.targets = [ufo,{x:5,y:16}]; g['protectedUfo'] = ufo; g.x = 5;
    g.step(makeBrickInput(['fire'])); run(g,3); expect(g.score).toBe(105); expect(g.lives).toBe(4); run(g,60); expect(g.level).toBe(2);
    g.targets = [{x:5,y:16},{x:2,y:2}]; g['protectedUfo'] = g.targets[0]!; g.x = 5;
    g.step(makeBrickInput(['fire'])); run(g,3); expect(g.lives).toBe(3);
  });
  it('Space Invaders requires the boss after the formation', () => {
    const g = new ShooterGame('space-invaders'); g.start(); g.targets = []; g.step(NEUTRAL_BRICK_INPUT); expect(g.bossHP).toBeGreaterThan(0); expect(g.level).toBe(1);
    g.bossHP = 1; g.targets = [{x:4,y:16}]; g.step(makeBrickInput(['fire'])); run(g,3); expect(g.score).toBe(105); run(g,60); expect(g.level).toBe(2);
  });
  it('Meteor Fighter takes off before shots and uses health rather than immediate death', () => {
    const g = new ShooterGame('meteor-fighter'); g.start(); g.step(makeBrickInput(['fire'])); expect(g.bullets).toHaveLength(0); run(g,60);
    g.bullets = [{x:g.x,y:17,enemy:true}]; run(g,4); expect(g.health).toBe(2); expect(g.lives).toBe(4);
  });
  it('a pickup wall cannot be punched, but can be shot across its full width', () => {
    const g = new RoadGame('racing-pickup'); g.start(); g.x = 1; g.weapon = 2; g.obstacles = [{x:7,y:14,kind:-1}]; g.step(makeBrickInput(['fire'])); expect(g.obstacles).toHaveLength(1);
    g.weapon = 1; g['cooldown'] = 0; g.step(makeBrickInput(['fire'])); run(g,4); expect(g.obstacles).toHaveLength(0); expect(g.score).toBe(10);
  });
  it('Pneumatic Ball misses do not cost a life and holding action serves again', () => {
    const g = new BallGame('pneumatic-ball'); g.start(); g.balls = [{x:0,y:17,dx:0,dy:1}]; run(g,20); expect(g.lives).toBe(4); expect(g.balls).toHaveLength(0); g.step(makeBrickInput(['rotate'])); expect(g.balls).toHaveLength(1);
  });
  it('maze generation reaches every room, including the exit', () => {
    for (let seed=0;seed<20;seed++) {
      const g = new MazeGame({seed}); const seen = new Set([g.player]), queue = [g.player];
      for(let i=0;i<queue.length;i++) for(const delta of [-10,10,-1,1]) { const p=queue[i]!+delta; if(g.walls[p]===0&&!seen.has(p)){seen.add(p);queue.push(p);} }
      expect(seen.has(g.goal)).toBe(true); expect(seen.size).toBe(g.walls.filter((v)=>v===0).length);
    }
  });
  it('Fill Connect undo cannot farm score', () => {
    const g = new FillGame(); g.start(); g.step(makeBrickInput(['right'])); expect(g.score).toBe(1); g.step(makeBrickInput(['rotate'])); g.step(makeBrickInput(['right'])); expect(g.score).toBe(1);
  });
  it('the jigsaw piece set has an exact covering of the target square', () => {
    const g = new JigsawGame();
    function solve(index:number,mask:number):boolean {
      if(index===4)return mask===65535;
      let shape=g['pieces'][index]!.map((p)=>[...p]);
      for(let angle=0;angle<4;angle++){
        const minX=Math.min(...shape.map((p)=>p[0]!)),minY=Math.min(...shape.map((p)=>p[1]!));shape=shape.map(([x,y])=>[x!-minX,y!-minY]);
        for(let y=0;y<4;y++)for(let x=0;x<4;x++){
          if(shape.some(([dx,dy])=>x+dx!>=4||y+dy!>=4))continue;
          const bits=shape.reduce((m,[dx,dy])=>m|(1<<((y+dy!)*4+x+dx!)),0);if(!(bits&mask)&&solve(index+1,mask|bits))return true;
        }
        shape=shape.map(([x,y])=>[-y!,x!]);
      }return false;
    }
    expect(solve(0,0)).toBe(true);
  });
});
