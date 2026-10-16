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
  shooting: { ...invadersDef, id: 'shooting' },
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
