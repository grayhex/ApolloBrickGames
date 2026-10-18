import type { LibraryId } from '../../games/library';
import { gt, type GuideText } from '../guide';

/** Игры, варианты которых перечислены в вики retroconsoles (раздел Modes) и реализованы по её списку; сами правила признаков — допущение. */
const WIKI_VARIANTS = new Set<LibraryId>(['dance', 'obstacle-race', 'snake', 'pneumatic-ball', 'pong', 'honeybee']);

/** Объём содержания, отдельно от технического ready и исторической достоверности. */
export function contentStatus(id: LibraryId): GuideText {
  if (id === 'honeybee') return gt('Основной вариант — Beetle B0202 D01. Остальные семь вариантов по вики сохранены отдельно.', 'The main variant is Beetle B0202 D01. The other seven wiki-based variants remain separate.');
  if (id === 'snake') return gt('Движение, разворот и скорости сверены с E88 / E-23. Прогрессия и рамка частично реконструированы.', 'Movement, reversal and speeds were checked against E88 / E-23. Progression and Frame remain partly reconstructed.');
  if (id === 'dice') return gt('Правила четырёх костей, банка и ставки — Apollo B0202 E02. Другие варианты этой прошивки пока не перенесены.', 'Four-dice, bank and wager rules follow Apollo B0202 E02. Other modes of this firmware have not been ported.');
  if (id === 'sokoban' || id === 'quarth')
    return gt(
      'Набор из 10 авторских задач; совпадение с оригиналом не установлено.',
      'A set of 10 project-authored challenges; fidelity to the original is unverified.',
    );
  if (WIKI_VARIANTS.has(id))
    return gt(
      'Играбельный прототип: один профиль правил; варианты — по списку вики, их правила — допущение.',
      'Playable prototype: one rule profile; variants follow the wiki list, their rules are an assumption.',
    );
  return gt(
    'Играбельный прототип: один профиль правил, без полного набора оригинальных вариантов.',
    'Playable prototype: one rule profile, without the complete original variant set.',
  );
}

const PROGRESSION: Partial<Record<LibraryId, GuideText>> = {
  sokoban: gt(
    'Десять разных задач с растущей длиной кратчайшего решения. После десятой набор повторяется.',
    'Ten distinct puzzles with increasingly long shortest solutions. The set repeats after the tenth.',
  ),
  quarth: gt(
    'Десять силуэтов; после десятого набор повторяется на следующей скорости. Это авторские задачи.',
    'Ten silhouettes; after the tenth, the set repeats at the next speed. These are project-authored challenges.',
  ),
  maze: gt(
    'Каждый выход открывает новый лабиринт. Таймер сокращается с 15 до 6 секунд; награда растёт. Пауза останавливает отсчёт.',
    'Each exit opens a new maze. Time falls from 15 to 6 seconds; rewards grow. Pausing stops the clock.',
  ),
  'lights-out': gt(
    'Решаемое поле 10×10 создаётся 3 + уровень переключениями. Это не гарантия роста сложности и не набор оригинальных задач.',
    'A solvable 10×10 board is generated with 3 + level toggles. This does not guarantee increasing difficulty or reproduce original puzzles.',
  ),
  'fill-connect': gt(
    'Повторяется пустой квадрат 8×8; с уровнем сокращается время. Препятствий и набора карт пока нет.',
    'The same empty 8×8 square repeats; higher levels shorten the time limit. Obstacles and map sets are not implemented.',
  ),
  jigsaw: gt(
    'Один квадрат 4×4 и четыре L-фигуры; готовая задача повторяется. На текущих приставках недоступна: нет отдельной FIRE.',
    'One 4×4 square and four L pieces; the puzzle repeats. Unavailable on current consoles: a separate FIRE button is required.',
  ),
  'matching-blocks': gt(
    'Три формы, шесть перестановок. Пять совпадений повышают уровень; новых форм не добавляется.',
    'Three shapes, six permutations. Five matches advance the level; no additional shapes are introduced.',
  ),
  'peg-solitaire': gt(
    'Один классический крест: после решения поле повторяется. Дополнительного набора задач пока нет.',
    'One classic cross: solving it repeats the board. Additional puzzle sets are not implemented.',
  ),
};

export const contentProgression = (id: LibraryId): GuideText =>
  PROGRESSION[id] ??
  gt(
    'Один профиль правил; условия продвижения указаны выше. Темп задаётся скоростью меню. Полный набор оригинальных уровней не восстановлен.',
    'One rule profile; advancement conditions are listed above. Menu speed sets the pace. The complete original level set has not been reconstructed.',
  );
