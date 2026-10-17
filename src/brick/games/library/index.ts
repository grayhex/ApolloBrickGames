import { LIBRARY_IDS, LIBRARY_NAMES, type LibraryId } from '../../../games/library';
import type { BrickAction, BrickGame, BrickGameDef, BrickGameOptions } from '../../types';
import { MazeGame, JigsawGame, LightsGame, SokobanGame, SolitaireGame, ReversiGame, MergeGame, FillGame } from './puzzles';
import { SnakeGame, PadsGame, MatchingGame, FlappyGame, BasketGame, DiggerGame, BomberGame, DiceGame } from './arcade';
import { RoadGame, ShooterGame, BallGame, BowlingGame } from './action';
import { FlickerTetrisGame, QuarthGame, CapsuleGame } from './falling';
import { LIBRARY_MODES, WIKI_MODE_COUNT } from './modes';
const factories: Record<LibraryId, (o: BrickGameOptions) => BrickGame> = {
  maze: (o) => new MazeGame(o), jigsaw: (o) => new JigsawGame(o),
  'meteor-fighter': (o) => new ShooterGame('meteor-fighter',o),
  'tetris-shooting': (o) => new ShooterGame('tetris-shooting',o),
  snake: (o) => new SnakeGame(o), 'lights-out': (o) => new LightsGame(o), sokoban: (o) => new SokobanGame(o),
  'peg-solitaire': (o) => new SolitaireGame(o), reversi: (o) => new ReversiGame(o), '2048': (o) => new MergeGame(o), 'fill-connect': (o) => new FillGame(o),
  'whack-a-mole': (o) => new PadsGame('whack-a-mole',o), simon: (o) => new PadsGame('simon',o), dance: (o) => new PadsGame('dance',o),
  'matching-blocks': (o) => new MatchingGame(o), 'flappy-bird': (o) => new FlappyGame(o), basket: (o) => new BasketGame(o), digger: (o) => new DiggerGame(o), 'helicopter-bomber': (o) => new BomberGame(o), dice: (o) => new DiceGame(o),
  'obstacle-race': (o) => new RoadGame('obstacle-race',o), 'boat-racing': (o) => new RoadGame('boat-racing',o), 'racing-four': (o) => new RoadGame('racing-four',o), 'super-tank': (o) => new RoadGame('super-tank',o), 'racing-pickup': (o) => new RoadGame('racing-pickup',o), 'punch-racing': (o) => new RoadGame('punch-racing',o),
  honeybee: (o) => new ShooterGame('honeybee',o), 'space-invaders': (o) => new ShooterGame('space-invaders',o), 'ufo-raiders': (o) => new ShooterGame('ufo-raiders',o), 'dual-shooting': (o) => new ShooterGame('dual-shooting',o), 'talking-shooting': (o) => new ShooterGame('talking-shooting',o),
  pong: (o) => new BallGame('pong',o), 'pong-double': (o) => new BallGame('pong-double',o), 'pneumatic-ball': (o) => new BallGame('pneumatic-ball',o), 'arkanoid-dots': (o) => new BallGame('arkanoid-dots',o), bowling: (o) => new BowlingGame(o),
  'tetris-flicker': (o) => new FlickerTetrisGame(o), quarth: (o) => new QuarthGame(o), 'dr-mario': (o) => new CapsuleGame('dr-mario',o), columns: (o) => new CapsuleGame('columns',o), 'columns-flicker': (o) => new CapsuleGame('columns-flicker',o),
};
/** Кнопки, без которых игра не проходится и которых нет на корпусе игрушек 1–4: такая игра не назначается игрушке (см. `needs` в `BrickGameDef`). */
const NEEDS: Partial<Record<LibraryId, readonly BrickAction[]>> = { jigsaw: ['fire'] };
/** Игры, где FIRE делает своё действие, отличное от ROTATE (см. `usesFire` в `BrickGameDef`): жёсткое падение, рестарт задачи, «поставить фигуру». */
const USES_FIRE: ReadonlySet<LibraryId> = new Set<LibraryId>(['tetris-flicker', 'dr-mario', 'columns', 'columns-flicker', 'sokoban', 'peg-solitaire', 'jigsaw']);
export const LIBRARY_GAMES: Readonly<Record<LibraryId, BrickGameDef>> = Object.fromEntries(LIBRARY_IDS.map((id): [LibraryId, BrickGameDef] => [id, {
  id, declaredModes: WIKI_MODE_COUNT[id] ?? null, ...(NEEDS[id] ? { needs: NEEDS[id] } : {}), ...(USES_FIRE.has(id) ? { usesFire: true } : {}),
  modes: LIBRARY_MODES[id] ?? [{ name: { ru: LIBRARY_NAMES[id][0], en: LIBRARY_NAMES[id][1] }, note: 'Реконструкция по описанию правил; точная прошивка и варианты оригинала не подтверждены.' }], create: factories[id],
}])) as Record<LibraryId, BrickGameDef>;
