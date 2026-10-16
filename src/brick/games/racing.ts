/**
 * Игра 3 «Гонки» (`racing`) и игра 4 «Гонки со стрельбой» (`racing-shoot`) консоли «168 в 1 танк».
 * Общий код (дорога, поток машин, аварии, очки) — в `racing/`; здесь сами игры и их описания для каталога консоли.
 */
import type { BrickGameDef, BrickGameOptions } from '../types';
import { RacingBase } from './racing/base';
import { RACING_ID, RACING_MODES, RACING_SHOOT_ID, RACING_SHOOT_MODES } from './racing/modes';
import { ROAD_MODE_COUNT } from './racing/road';
import { RacingShootGame } from './racing/shoot';

/** «Гонки»: `RacingGame` донора — четыре схемы дороги (две/три полосы, обычная и перевёрнутая). */
export class RacingGame extends RacingBase {
  readonly id = RACING_ID;

  constructor(options: BrickGameOptions = {}) {
    super(options, ROAD_MODE_COUNT);
    this.init();
  }
}

export { RacingBase, RacingShootGame };

export const racingDef: BrickGameDef = {
  id: RACING_ID,
  declaredModes: null,
  modes: RACING_MODES,
  create: (options) => new RacingGame(options),
};

export const racingShootDef: BrickGameDef = {
  id: RACING_SHOOT_ID,
  declaredModes: null,
  modes: RACING_SHOOT_MODES,
  create: (options) => new RacingShootGame(options),
};
