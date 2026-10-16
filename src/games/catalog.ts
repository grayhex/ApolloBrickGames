/**
 * Каталог игр, которые встречаются на игрушках Apollo. Игры у консолей **пересекаются** (тетрис есть почти везде, стрельба, гонки и танк — на нескольких),
 * поэтому игра описана один раз, а у каждой консоли (`app/toys.ts`) указан её набор — по наклейке или упаковке, с названием как напечатано.
 * Чистые данные без DOM: когда будут восстановлены логика и настройки каждой игры (в том числе в «админке»), они подключатся к этому каталогу по `id`.
 */
export const GAME_IDS = [
  'mario',
  'clock',
  'tetris',
  'tetris-big',
  'tetris-pentix',
  'shooting',
  'shooting-array',
  'shooting-figures',
  'racing',
  'racing-shooting',
  'tank',
  'arkanoid',
  'romeo-juliet',
  'sea-battle',
  'frog',
  'construction',
] as const;
export type GameId = (typeof GAME_IDS)[number];

/**
 * Чем игра запускается в оболочке сейчас: движок Crocodile Mario, тетрис-заглушка или ядро «кирпичных» игр (`src/brick`, правила по открытому донору,
 * `docs/brick-games.md`). Нет движка — игра ещё не восстановлена.
 */
export type GameEngine = 'mario' | 'tetris' | 'brick';

export interface GameDef {
  id: GameId;
  /** Названия для интерфейса (на наклейке — своё, см. `ToyGame.label`). */
  names: { ru: string; en: string };
  /** Игровой движок оболочки, если есть; `null` — игра пока не восстановлена. */
  engine: GameEngine | null;
}

export const GAMES: Record<GameId, GameDef> = {
  mario: { id: 'mario', names: { ru: 'Crocodile Mario', en: 'Crocodile Mario' }, engine: 'mario' },
  clock: { id: 'clock', names: { ru: 'Часы', en: 'Clock' }, engine: null },
  tetris: { id: 'tetris', names: { ru: 'Тетрис', en: 'Tetris' }, engine: 'brick' },
  'tetris-big': { id: 'tetris-big', names: { ru: 'Тетрис с большими фигурами', en: 'Tetris with big pieces' }, engine: 'brick' },
  'tetris-pentix': { id: 'tetris-pentix', names: { ru: 'Тетрис Pentix', en: 'Pentix' }, engine: 'brick' },
  shooting: { id: 'shooting', names: { ru: 'Стрельба', en: 'Shooting' }, engine: null },
  'shooting-array': { id: 'shooting-array', names: { ru: 'Стрельба по массиву и точкам', en: 'Shooting: wall and targets' }, engine: 'brick' },
  'shooting-figures': { id: 'shooting-figures', names: { ru: 'Стрельба по фигурам', en: 'Shooting: shapes' }, engine: 'brick' },
  racing: { id: 'racing', names: { ru: 'Гонки', en: 'Racing' }, engine: 'brick' },
  'racing-shooting': { id: 'racing-shooting', names: { ru: 'Гонки со стрельбой', en: 'Racing with shooting' }, engine: 'brick' },
  tank: { id: 'tank', names: { ru: 'Танки', en: 'Tanks' }, engine: 'brick' },
  arkanoid: { id: 'arkanoid', names: { ru: 'Арканоид', en: 'Arkanoid' }, engine: 'brick' },
  'romeo-juliet': { id: 'romeo-juliet', names: { ru: 'Ромео и Джульетта', en: 'Romeo and Juliet' }, engine: null },
  'sea-battle': { id: 'sea-battle', names: { ru: 'Морской бой', en: 'Sea Battle' }, engine: null },
  frog: { id: 'frog', names: { ru: 'Лягушка (Frogger)', en: 'Frog (Frogger)' }, engine: 'brick' },
  construction: { id: 'construction', names: { ru: 'Строитель', en: 'Builder' }, engine: 'brick' },
};

/**
 * Состояние игры на конкретной консоли: `ready` — играет настоящая (приближённая) игра, `placeholder` — вместо неё заглушка (тетрис),
 * `planned` — игра есть на устройстве, но ещё не восстановлена.
 */
export type GameStatus = 'ready' | 'placeholder' | 'planned';

export const isGameId = (value: string): value is GameId => (GAME_IDS as readonly string[]).includes(value);
