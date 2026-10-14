import type { ObjectDef, ObjectTypeSpec, ParamSpec, Params } from '../content/schema';
import type { LevelRuntime } from './level';
import type { DeathCause, GameEventBody, GameState, ObjectState } from './state';

/**
 * Интерфейс симуляции для обработчиков объектов. Обработчик не видит ни браузер,
 * ни ввод — только состояние и несколько операций.
 */
export interface SimApi {
  readonly state: GameState;
  readonly level: LevelRuntime;
  die(cause: DeathCause): void;
  completeLevel(objectId: string): void;
  addScore(points: number): void;
  emit(event: GameEventBody): void;
  /** Тайл непроходим, клетка за границей карты или занята твёрдым объектом. */
  isBlockedForObject(x: number, y: number): boolean;
}

/**
 * Поведение типа объекта. Новые особые механики оригинала добавляются как новые
 * обработчики в реестр, а не как «язык правил» в JSON.
 */
export interface ObjectBehavior extends ObjectTypeSpec {
  /** Твёрдый для героя (не пускает и служит опорой). */
  solid?: boolean;
  /** Начальные поля состояния из параметров уровня. */
  init?(def: ObjectDef, state: ObjectState): void;
  /** Раз в такт симуляции, в порядке объектов уровня. */
  update?(sim: SimApi, state: ObjectState, def: ObjectDef): void;
  /** Герой пересёкся с областью объекта. */
  heroTouch?(sim: SimApi, state: ObjectState, def: ObjectDef): void;
  /** Снаряд вошёл в область объекта. true — снаряд поглощён. */
  projectileHit?(sim: SimApi, state: ObjectState, def: ObjectDef): boolean;
  /** Герой ударился головой снизу о твёрдый объект (прыжок упёрся в него). */
  headHit?(sim: SimApi, state: ObjectState, def: ObjectDef): void;
  /**
   * Герой, опускаясь, вошёл в клетку объекта сверху («наступил»). true — объект принял удар, касание-смерть (`heroTouch`) не засчитывается.
   * Боковое касание и касание снизу — по-прежнему `heroTouch`.
   */
  stomp?(sim: SimApi, state: ObjectState, def: ObjectDef): boolean;
}

export type BehaviorRegistry = Readonly<Record<string, ObjectBehavior>>;

export function numberParam(params: Params, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === 'number' ? value : fallback;
}

/** Проверка целочисленных параметров по их описанию. */
function validateBySpec(
  specs: readonly ParamSpec[],
): (params: Params, report: (message: string) => void) => void {
  return (params, report) => {
    for (const { key, min, max } of specs) {
      const value = params[key];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        report(`«${key}» — целое число ${min}…${max}, получено ${JSON.stringify(value)}`);
      }
    }
  };
}

/** Попадание снаряда в разрушаемый объект: hp, очки, событие. */
function damage(sim: SimApi, state: ObjectState, def: ObjectDef): boolean {
  state.hp -= 1;
  const destroyed = state.hp <= 0;
  sim.emit({ type: 'hit', x: state.x, y: state.y, targetId: state.id, destroyed });
  if (destroyed) {
    state.active = false;
    sim.addScore(numberParam(def.params, 'score', 0));
  }
  return true;
}

const destructibleParams: readonly ParamSpec[] = [
  { key: 'hp', label: 'Прочность (попаданий)', min: 1, max: 99, default: 1 },
  { key: 'score', label: 'Очки (demo)', min: 0, max: 1_000_000, default: 0 },
];

/** Неподвижная мишень: твёрдая, разрушается выстрелом. */
const target: ObjectBehavior = {
  label: 'Мишень',
  solid: true,
  params: destructibleParams,
  validateParams: validateBySpec(destructibleParams),
  init: (def, state) => {
    state.hp = numberParam(def.params, 'hp', 1);
  },
  projectileHit: damage,
};

/**
 * Пробиваемый блок: твёрдый, ломается ударами головой снизу (по умолчанию с третьего удара).
 * Гипотеза по видео фрагмента: центральный блок крышки арки пережил два удара и исчез на третьем (один наблюдаемый случай).
 */
const brickParams: readonly ParamSpec[] = [
  { key: 'hp', label: 'Прочность (ударов головой)', min: 1, max: 99, default: 3 },
  { key: 'score', label: 'Очки за разрушение (demo)', min: 0, max: 1_000_000, default: 0 },
];

const brick: ObjectBehavior = {
  label: 'Пробиваемый блок',
  solid: true,
  params: brickParams,
  validateParams: validateBySpec(brickParams),
  init: (def, state) => {
    state.hp = numberParam(def.params, 'hp', 3);
  },
  headHit: (sim, state, def) => {
    state.hp -= 1;
    const destroyed = state.hp <= 0;
    sim.emit({ type: 'hit', x: state.x, y: state.y, targetId: state.id, destroyed });
    if (destroyed) {
      state.active = false;
      sim.addScore(numberParam(def.params, 'score', 0));
    }
  },
};

/**
 * Враг («чёрт»): шаг на клетку раз в `stepTicks` тактов (по видео геймплея — 12 тактов ≈ 0,6 с и у малых, и у больших).
 * Два режима: патруль по горизонтали в пределах ±`range` клеток от точки появления и преследование героя (`chase: 1`, большой чёрт 2 × 2):
 * поднимается к верхнему ряду `minY`, плывёт по нему к столбцу героя и, оказавшись над ним, пикирует вниз, пока не упрётся.
 * Гибель героя — от касания; наступить сверху можно, если задано `stomp` (очки; у малого чёрта по упаковке 200).
 */
const patrollerParams: readonly ParamSpec[] = [
  ...destructibleParams,
  { key: 'range', label: 'Размах патруля (клеток)', min: 0, max: 255, default: 3 },
  { key: 'stepTicks', label: 'Тактов на шаг', min: 1, max: 1000, default: 4 },
  { key: 'stomp', label: 'Очки за наступание сверху (0 — наступить нельзя)', min: 0, max: 1_000_000, default: 0 },
  { key: 'chase', label: 'Преследует героя (1) или патрулирует (0)', min: 0, max: 1, default: 0 },
  { key: 'minY', label: 'Верхний ряд при преследовании', min: 0, max: 255, default: 0 },
];

/** Свободна ли вся область врага (w × h) с левым верхним углом в (x, y): ни тайла, ни твёрдого объекта, ни края карты. */
function areaFree(sim: SimApi, def: ObjectDef, x: number, y: number): boolean {
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) if (sim.isBlockedForObject(x + dx, y + dy)) return false;
  return true;
}

/** Шаг преследователя: над героем — вниз; иначе вверх до `minY`, затем по горизонтали к герою (не дальше `range` от точки появления). */
function chaseStep(sim: SimApi, state: ObjectState, def: ObjectDef): void {
  const hero = sim.state.hero;
  const minY = numberParam(def.params, 'minY', 0);
  const range = numberParam(def.params, 'range', 3);
  const over = hero.x >= state.x && hero.x < state.x + def.w;
  if (over) {
    if (state.y + def.h - 1 < hero.y) {
      if (areaFree(sim, def, state.x, state.y + 1)) state.y += 1;
    } else if (state.y > minY && areaFree(sim, def, state.x, state.y - 1)) {
      state.y -= 1; // герой выше или вровень: уходит вверх, чтобы снова зайти сверху
    }
    return;
  }
  if (state.y > minY) {
    if (areaFree(sim, def, state.x, state.y - 1)) state.y -= 1;
    return;
  }
  const next = state.x + (hero.x < state.x ? -1 : 1);
  if (Math.abs(next - def.x) <= range && areaFree(sim, def, next, state.y)) state.x = next;
}

const patroller: ObjectBehavior = {
  label: 'Патруль',
  params: patrollerParams,
  validateParams: validateBySpec(patrollerParams),
  init: (def, state) => {
    state.hp = numberParam(def.params, 'hp', 1);
  },
  update: (sim, state, def) => {
    state.timer += 1;
    if (state.timer < numberParam(def.params, 'stepTicks', 4)) return;
    state.timer = 0;
    if (numberParam(def.params, 'chase', 0) === 1) {
      chaseStep(sim, state, def);
      return;
    }
    // Патруль: у края размаха или у препятствия враг разворачивается и в тот же шаг идёт обратно (на видео у краёв он стоит не дольше, чем в середине).
    const range = numberParam(def.params, 'range', 3);
    const canStep = (to: number): boolean => to >= def.x - range && to <= def.x + range && areaFree(sim, def, to, state.y);
    if (!canStep(state.x + state.dir)) state.dir = state.dir === 1 ? -1 : 1;
    if (canStep(state.x + state.dir)) state.x += state.dir;
  },
  heroTouch: (sim) => sim.die('enemy'),
  projectileHit: damage,
  stomp: (sim, state, def) => {
    const points = numberParam(def.params, 'stomp', 0);
    if (points <= 0) return false;
    state.active = false;
    sim.addScore(points);
    sim.emit({ type: 'stomp', x: state.x, y: state.y, targetId: state.id });
    return true;
  },
};

/**
 * Предмет, который подбирается касанием героя («сердце: съесть» в справке по упаковке — 100 очков; на видео геймплея счёт растёт по 100).
 * Подобранный предмет исчезает. Снаряды его не задевают, твёрдым он не бывает.
 */
const pickupParams: readonly ParamSpec[] = [
  { key: 'score', label: 'Очки за подбор (demo)', min: 0, max: 1_000_000, default: 100 },
];

const pickup: ObjectBehavior = {
  label: 'Предмет (сердце)',
  params: pickupParams,
  validateParams: validateBySpec(pickupParams),
  heroTouch: (sim, state, def) => {
    state.active = false;
    sim.addScore(numberParam(def.params, 'score', 100));
  },
};

/** Опасная область любого размера (w × h). Снаряды пролетают сквозь неё. */
const hazard: ObjectBehavior = {
  label: 'Опасная область',
  heroTouch: (sim) => sim.die('hazard'),
};

/** Финиш участка: переход берётся из transitions уровня. */
const finishParams: readonly ParamSpec[] = [
  { key: 'score', label: 'Очки за финиш (demo)', min: 0, max: 1_000_000, default: 0 },
];

const finish: ObjectBehavior = {
  label: 'Финиш участка',
  params: finishParams,
  validateParams: validateBySpec(finishParams),
  heroTouch: (sim, state, def) => {
    sim.addScore(numberParam(def.params, 'score', 0));
    sim.completeLevel(state.id);
  },
};

/** Описание зарегистрированных типов — для палитры и инспектора редактора. */
export function describeObjectTypes(
  behaviors: BehaviorRegistry,
): { type: string; label: string; solid: boolean; params: readonly ParamSpec[] }[] {
  return Object.entries(behaviors).map(([type, behavior]) => ({
    type,
    label: behavior.label ?? type,
    solid: behavior.solid === true,
    params: behavior.params ?? [],
  }));
}

/** Обработчики демо-профиля. Тип объекта в данных → поведение в коде. */
export const DEMO_BEHAVIORS: BehaviorRegistry = { target, patroller, hazard, finish, brick, pickup };
