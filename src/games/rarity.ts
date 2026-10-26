import type { GameId } from './catalog';

/**
 * Редкость игр по разделу «Games» страницы [Retro Consoles Wiki · Brick Game](https://retroconsoles.fandom.com/wiki/Brick_Game#Games); сохранённый текст страницы лежит в
 * `docs/research/Brick Game _ Retro Consoles Wiki _ Fandom.html`. Вики делит игры на «Common», «Uncommon», «Rare» («These can only be found on certain models») и «Ultra Rare»;
 * отдельный раздел «Mobile games» — игры, которых на настоящих приставках нет (редкость там не указана). Соответствие игр проекта играм вики — явная таблица ниже
 * (`docs/brick/rarity.md`): название в вики записано в комментарии. Игры, которых в вики нет (Crocodile Mario, часы, «Ромео и Джульетта»), редкости не имеют.
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'ultra-rare' | 'mobile';

/** От самой частой к самой редкой; «Mobile» — после «Ultra Rare»: это не ступень редкости, а раздел вики. */
export const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'ultra-rare', 'mobile'];

export const RARITY_BY_GAME: Readonly<Partial<Record<GameId, Rarity>>> = {
  // Common
  tank: 'common', // Tank game (Battle City)
  tetris: 'common', // Tetromino game
  'tetris-big': 'common', // Tetromino game: вариации с большими фигурами
  'tetris-pentix': 'common', // Tetromino game: вариации с пентамино
  racing: 'common', // Car racing game (2 Racing/3 Racing)
  'obstacle-race': 'common', // Obstacles Race
  'shooting-array': 'common', // Shooting Disappearing (ряды блоков опускаются, их нужно расстрелять)
  'shooting-figures': 'common', // Shooting Disappearing / Shooting filling (общий вариант по таблице docs/brick/modes-reference.md)
  construction: 'common', // Shooting filling
  frog: 'common', // Frogger
  arkanoid: 'common', // Unilateral Table Tennis (Arkanoid)
  pong: 'common', // Bilateral Table Tennis (Pong)
  snake: 'common', // Snake
  honeybee: 'common', // Little Honeybee (Galactica)
  'pneumatic-ball': 'common', // Pneumatic Ball
  // Uncommon
  'matching-blocks': 'uncommon', // Matching Blocks
  'whack-a-mole': 'uncommon', // Whack-a-mole
  simon: 'uncommon', // Simon Says
  dice: 'uncommon', // Dice (Da Xi Bao)
  // Rare
  'racing-shooting': 'rare', // Shooting Car Racing
  dance: 'rare', // Dance Dance Revolution
  quarth: 'rare', // Shoot Blocks (known Fire block)
  'lights-out': 'rare', // Lights Out
  'boat-racing': 'rare', // Boat racing
  'talking-shooting': 'rare', // Shooting Disappearing (Talking Gamemate Version)
  'ufo-raiders': 'rare', // UFO Raiders (Talking Gamemate Version)
  'tetris-flicker': 'rare', // Tetris Flickering Dot
  'super-tank': 'rare', // Super Tank
  'racing-pickup': 'rare', // Car Racing/Boat Racing (Pickup Mode)
  // Ultra Rare
  jigsaw: 'ultra-rare', // Jig Saw Puzzles Game
  'punch-racing': 'ultra-rare', // Punching Car Racing
  'meteor-fighter': 'ultra-rare', // Meteor Fighter Game
  sokoban: 'ultra-rare', // Sokoban (Warehouse Workers)
  columns: 'ultra-rare', // Colomus game (Magic Diamond)
  'columns-flicker': 'ultra-rare', // Colomus game (Flickering Dot)
  shooting: 'ultra-rare', // Space Invader (Invaders): вертикальный шутер по донору InvadersGame
  'space-invaders': 'ultra-rare', // Space Invader
  'peg-solitaire': 'ultra-rare', // Solitaire Board game (Smarty Chess)
  'sea-battle': 'ultra-rare', // Battleship
  basket: 'ultra-rare', // Basket game
  'dr-mario': 'ultra-rare', // Column Game (Dr. Mario Clone)
  bowling: 'ultra-rare', // Bowling
  'dual-shooting': 'ultra-rare', // Shooting (два ствола, шкалы здоровья)
  maze: 'ultra-rare', // Maze
  'tetris-shooting': 'ultra-rare', // Tetris Shooting
  'racing-four': 'ultra-rare', // Car racing game (4 lane)
  'pong-double': 'ultra-rare', // Pong (Double Ball)
  'arkanoid-dots': 'ultra-rare', // Arkanoid (Two Flickering Dots)
  // Mobile games
  'flappy-bird': 'mobile', // Flappy Bird
  reversi: 'mobile', // Reversi
  'fill-connect': 'mobile', // Fill Connect
  '2048': 'mobile', // 2048
  digger: 'mobile', // Digger
  'helicopter-bomber': 'mobile', // Helicopter Bomber
};

export const rarityOf = (id: GameId): Rarity | null => RARITY_BY_GAME[id] ?? null;

/** Место игры в порядке возрастания редкости; игры без редкости — в конце. */
export const rarityRank = (id: GameId): number => {
  const rarity = rarityOf(id);
  return rarity === null ? RARITY_ORDER.length : RARITY_ORDER.indexOf(rarity);
};

/** Устойчивая сортировка по возрастанию редкости: внутри одной ступени порядок исходного списка сохраняется. */
export function sortByRarity<T>(items: readonly T[], idOf: (item: T) => GameId): T[] {
  return items
    .map((item, index) => ({ item, index, rank: rarityRank(idOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

/** Подписи ступеней: короткая — на значке и в заголовке группы списка, пояснение — во всплывающей подсказке (формулировки вики). */
export const RARITY_LABEL: Readonly<Record<Rarity, { ru: string; en: string; noteRu: string; noteEn: string }>> = {
  common: {
    ru: 'Обычная',
    en: 'Common',
    noteRu: 'Обычная · такая игра есть почти на любой настоящей приставке «Brick Game» (по Retro Consoles Wiki).',
    noteEn: 'Common · found on almost any real “Brick Game” console (per the Retro Consoles Wiki).',
  },
  uncommon: {
    ru: 'Нечастая',
    en: 'Uncommon',
    noteRu: 'Нечастая · встречается реже обычных игр (по Retro Consoles Wiki).',
    noteEn: 'Uncommon · seen less often than the common games (per the Retro Consoles Wiki).',
  },
  rare: {
    ru: 'Редкая',
    en: 'Rare',
    noteRu: 'Редкая · есть только на некоторых моделях (по Retro Consoles Wiki).',
    noteEn: 'Rare · can only be found on certain models (per the Retro Consoles Wiki).',
  },
  'ultra-rare': {
    ru: 'Сверхредкая',
    en: 'Ultra Rare',
    noteRu: 'Сверхредкая · очень редкая игра, её нет почти ни на одной приставке (по Retro Consoles Wiki).',
    noteEn: 'Ultra Rare · a very rare game, on almost no console (per the Retro Consoles Wiki).',
  },
  mobile: {
    ru: 'Мобильная',
    en: 'Mobile',
    noteRu: 'Мобильная · в вики это отдельный раздел «Mobile games»: игра взята из мобильных приложений, на настоящих приставках её нет.',
    noteEn: 'Mobile · a separate “Mobile games” section of the wiki: the game comes from mobile apps and is not on real consoles.',
  },
};
