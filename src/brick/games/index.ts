import { LIBRARY_GAMES } from './library';
/**
 * Реестр «кирпичных» игр: идентификатор игры каталога (`GameId` из `src/games/catalog.ts`) → игра ядра. Консоли с меню (`app/cabinet.ts`) берут отсюда игры своих
 * пунктов; игры, которых здесь нет, в меню выбираются, но не запускаются (событие `blocked`). У «Тетриса с большими фигурами» («Морской бой», D) и «Тетриса Pentix»
 * («168 в 1 танк», 9) пока одна игра — Pentix (правила донора, `PentixGameQ…X`): совпадают ли они на устройствах, не установлено.
 */
import type { BrickGameDef } from '../types';
import { seaBattleDef } from './seaBattle';
import { romeoJulietDef } from './romeoJuliet';
import { arkanoidDef } from './arkanoid';
import { constructionDef } from './construction';
import { froggerDef } from './frogger';
import { invadersDef } from './invaders';
import { pentixDef } from './pentix';
import { racingDef, racingShootDef } from './racing';
import { shapesDef } from './shapes';
import { tanksDef } from './tanks';
import { tetrisDef } from './tetris';

export { arkanoidDef, constructionDef, froggerDef, invadersDef, pentixDef, racingDef, racingShootDef, shapesDef, tanksDef, tetrisDef };

export const BRICK_GAMES: Readonly<Record<string, BrickGameDef>> = {
  ...LIBRARY_GAMES,
  'sea-battle': seaBattleDef,
  'romeo-juliet': romeoJulietDef,
  shooting: invadersDef,
  tank: tanksDef,
  frog: froggerDef,
  racing: racingDef,
  'racing-shooting': racingShootDef,
  'shooting-array': invadersDef,
  'shooting-figures': shapesDef,
  construction: constructionDef,
  tetris: tetrisDef,
  'tetris-big': pentixDef,
  'tetris-pentix': pentixDef,
  arkanoid: arkanoidDef,
};

/**
 * Явные алиасы каталога: записи, у которых нет собственной реализации и они делят игру ядра с другой записью. Ключ каталога (`GameId`) — то, что видят меню,
 * рекорды (`crocodile-mario:brick:<игрушка>:<запись>:<вариант>:hi`) и справка; у игры ядра свой идентификатор реализации (`def.id`).
 * Совпадение записей — допущение проекта, не установленный факт об устройствах: «Тетрис с большими фигурами» («Морской бой», D) и «Pentix» («168 в 1 танк», 9)
 * пока играются одним ядром, а «Стрельба» (`shooting`) у «Часов+99» — тот же строй, что «Стрельба по массиву» (`shooting-array`).
 */
export const BRICK_ALIASES: Readonly<Record<string, string>> = {
  shooting: 'shooting-array',
  'tetris-big': 'tetris-pentix',
};

/** Идентификатор реализации (игры ядра) для записи каталога. */
export function implementationId(catalogId: string): string | undefined {
  return BRICK_GAMES[catalogId]?.id;
}
