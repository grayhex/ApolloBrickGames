export type Phase = 'ready' | 'playing' | 'paused' | 'dead' | 'completed' | 'gameOver';
export type DeathCause = 'enemy' | 'hazard' | 'pit' | 'time';

/** Координаты — целые клетки карты; (0, 0) — левый верхний угол, y растёт вниз. */
export interface HeroState {
  x: number;
  y: number;
  facing: 1 | -1;
  /** Направление, которое удерживается сейчас (0 — нет). */
  moveDir: -1 | 0 | 1;
  /** Сколько тактов подряд удерживается направление (для повтора шага). */
  moveHold: number;
  /** Индекс фазы прыжка в таблице; -1 — не прыгает. */
  jumpIndex: number;
  jumpTimer: number;
  fallTimer: number;
  airborne: boolean;
  fireCooldown: number;
}

export interface ProjectileState {
  id: number;
  x: number;
  y: number;
  dir: 1 | -1;
  travelled: number;
  timer: number;
}

/** Состояние объекта уровня; индекс совпадает с индексом в LevelDef.objects. */
export interface ObjectState {
  id: string;
  x: number;
  y: number;
  active: boolean;
  hp: number;
  dir: 1 | -1;
  timer: number;
}

export interface StateMeta {
  rulesId: string;
  rulesVersion: number;
  contentId: string;
  contentVersion: number;
}

/** Всё состояние симуляции — простые данные, сериализуется через JSON. */
export interface GameState {
  stateVersion: 1;
  meta: StateMeta;
  seed: number;
  rng: number;
  /** Все вызовы step(), включая паузу и меню. */
  tick: number;
  /** Только такты, в которые мир действительно считался. */
  worldTick: number;
  phase: Phase;
  levelId: string;
  hero: HeroState;
  projectiles: ProjectileState[];
  nextProjectileId: number;
  objects: ObjectState[];
  score: number;
  lives: number;
  timerTicks: number;
  /**
   * «Колодец»: герой с начала участка (и после каждого возрождения) ещё не уходил из столбца старта. Пока `true`, секретный аккорд
   * (`SECRET_CHORD`) даёт бонусные жизни; как только герой «выпрыгнул из колодца», аккорд теряет силу.
   */
  inWell: boolean;
  /**
   * Игра началась: после первого запуска (S./P. в фазе `ready`) и до новой игры. Пока `false`, на HUD подпись уровня; с началом игры
   * подпись заменяет таймер (видео геймплея: `1-01` → `TIME 397`). После гибели и возрождения остаётся `true` — таймер на экране.
   */
  gameStarted: boolean;
  /** Обратный отсчёт фазы `dead`. */
  phaseTimer: number;
  deathCause: DeathCause | null;
}

/** События для внешних систем (звук, HUD). Ядро само ничего не воспроизводит. */
export type GameEventBody =
  | { type: 'phaseChanged'; from: Phase; to: Phase }
  | { type: 'levelStarted'; levelId: string }
  | { type: 'shot'; x: number; y: number; dir: 1 | -1 }
  | { type: 'hit'; x: number; y: number; targetId: string; destroyed: boolean }
  | { type: 'projectileBlocked'; x: number; y: number }
  | { type: 'jump'; x: number; y: number }
  | { type: 'land'; x: number; y: number }
  /** Голова героя упёрлась в блок над ним (x, y — клетка блока). Для эффектов отрисовки. */
  | { type: 'bump'; x: number; y: number }
  | { type: 'death'; cause: DeathCause; x: number; y: number }
  | { type: 'levelCompleted'; levelId: string; next: string | null }
  | { type: 'gameOver' }
  | { type: 'gameCompleted' }
  /** Герой наступил сверху на врага (`targetId`): враг уничтожен, очки начислены. */
  | { type: 'stomp'; x: number; y: number; targetId: string }
  /** Секрет сработал: жизни выросли до `lives` (аккорд LEFT + DOWN до выхода героя из столбца старта). */
  | { type: 'secretLives'; lives: number };

export type GameEvent = GameEventBody & { tick: number };
