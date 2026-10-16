/**
 * Описания игр для левой панели: идентификатор игры каталога (`GameId`) -> описание «по факту реализации» (`GameGuideData`).
 * Каждое описание лежит в своём файле рядом и строится по коду игры (числа берутся из экспортируемых констант игры); сюда они только собраны.
 * «Тетрис с большими фигурами» («Морской бой», D) и «Тетрис Pentix» («168 в 1 танк», 9) — одна игра ядра, описание общее.
 */
import type { GameGuideData } from '../guide';
import { ARKANOID_GUIDE } from './arkanoid';
import { CONSTRUCTION_GUIDE } from './construction';
import { FROGGER_GUIDE } from './frogger';
import { INVADERS_GUIDE } from './invaders';
import { PENTIX_GUIDE } from './pentix';
import { RACING_GUIDE } from './racing';
import { RACING_SHOOT_GUIDE } from './racingShoot';
import { SHAPES_GUIDE } from './shapes';
import { TANKS_GUIDE } from './tanks';
import { TETRIS_GUIDE } from './tetris';

export {
  ARKANOID_GUIDE,
  CONSTRUCTION_GUIDE,
  FROGGER_GUIDE,
  INVADERS_GUIDE,
  PENTIX_GUIDE,
  RACING_GUIDE,
  RACING_SHOOT_GUIDE,
  SHAPES_GUIDE,
  TANKS_GUIDE,
  TETRIS_GUIDE,
};

export const BRICK_GUIDES: Readonly<Record<string, GameGuideData>> = {
  tank: TANKS_GUIDE,
  frog: FROGGER_GUIDE,
  racing: RACING_GUIDE,
  'racing-shooting': RACING_SHOOT_GUIDE,
  'shooting-array': INVADERS_GUIDE,
  'shooting-figures': SHAPES_GUIDE,
  construction: CONSTRUCTION_GUIDE,
  tetris: TETRIS_GUIDE,
  'tetris-big': PENTIX_GUIDE,
  'tetris-pentix': PENTIX_GUIDE,
  arkanoid: ARKANOID_GUIDE,
};
