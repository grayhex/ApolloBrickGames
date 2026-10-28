/**
 * Игры Prince 皇太子 (118 in 1, AX-128). Владелец: после заставки сразу идёт автоплей игр — тетрис, гонки, танки, фроггер, арканоид; большая кнопка переключает игру,
 * можно выбрать скорость и режим и начать самому. Сколько вариаций у каждой игры и под какими номерами они стоят, неизвестно, поэтому разбивка — допущение проекта:
 * номера 1–118 идут подряд по играм в том порядке, в котором их назвал владелец, а числа вариаций взяты из реализаций библиотеки так, чтобы в сумме вышло 118:
 * тетрис — 61 вариация (первые 61 из набора Mini Brick: обычные, с особыми фигурами, с мусорными рядами и т. д.), гонки — 4, танки — 5, фроггер — 16, арканоид — 32.
 */
import type { BrickGameDef } from '../types';
import { arkanoidDef, froggerDef, racingDef, tanksDef } from './index';
import { miniTetrisDef } from './mini';

export type PrinceGameId = 'tetris' | 'racing' | 'tank' | 'frog' | 'arkanoid';

export interface PrinceGame {
  id: PrinceGameId;
  def: BrickGameDef;
  /** Сколько вариаций у игры на этом устройстве (допущение, см. выше). */
  count: number;
}

/** Порядок — как перечислил владелец; он же порядок большой кнопки в демонстрации. */
export const PRINCE_GAMES: readonly PrinceGame[] = [
  { id: 'tetris', def: miniTetrisDef, count: 61 },
  { id: 'racing', def: racingDef, count: 4 },
  { id: 'tank', def: tanksDef, count: 5 },
  { id: 'frog', def: froggerDef, count: 16 },
  { id: 'arkanoid', def: arkanoidDef, count: 32 },
];

/** Всего вариаций на корпусе: «118 in 1». */
export const PRINCE_GAME_COUNT = PRINCE_GAMES.reduce((sum, game) => sum + game.count, 0);

/** Номер первой вариации каждой игры (с нуля). */
export const PRINCE_FIRST: readonly number[] = PRINCE_GAMES.map((_, index) => PRINCE_GAMES.slice(0, index).reduce((sum, game) => sum + game.count, 0));

/** Игра (индекс в `PRINCE_GAMES`) и номер вариации внутри неё для номера 0–117. */
export function princeEntry(number: number): { game: number; mode: number } {
  const n = ((Math.trunc(number) % PRINCE_GAME_COUNT) + PRINCE_GAME_COUNT) % PRINCE_GAME_COUNT;
  let game = 0;
  while (game + 1 < PRINCE_GAMES.length && n >= PRINCE_FIRST[game + 1]!) game++;
  return { game, mode: n - PRINCE_FIRST[game]! };
}

/** Номер 0–117 по индексу игры и номеру вариации (вариация берётся по модулю числа вариаций игры). */
export function princeNumber(game: number, mode: number): number {
  const index = ((game % PRINCE_GAMES.length) + PRINCE_GAMES.length) % PRINCE_GAMES.length;
  const count = PRINCE_GAMES[index]!.count;
  return PRINCE_FIRST[index]! + (((mode % count) + count) % count);
}
