#!/usr/bin/env node
/**
 * Генератор девяти «оригинальных» уровней MARIO — ГЕЙМПЛЕЙНОЕ ПРИБЛИЖЕНИЕ, а не восстановление 1 в 1.
 *
 * Основа — разбор видео геймплея (docs/video-observations.md §9): у всех уровней одинаковый старт («яма» с крышкой и тремя ударами головой),
 * дальше — платформы над широкими провалами, колонны, лестницы, простые враги (малые чёрти) на площадках, сердца и колодцы.
 * Колодцы (уровни 2–9, видео 178–214 с): две трубы и щель между ними с сердцем; провалившийся герой оказывается в комнате — с большим чёртом
 * 2 × 2 (нечётные уровни) или полностью заполненной бонусными сердцами (чётные) — и по выходу возвращается на уровень правее колодца.
 * Большие враги живут только в комнатах-колодцах; летящих на героя «пуль» в уровнях нет.
 * Первые ≈ 120 столбцов уровня 1 повторяют измеренную цепочку платформ по видео (разброс ± 2 столбца); остальное — допущения по общей логике:
 * сложность растёт с номером уровня (длиннее, шире провалы, уже площадки, выше колонны, больше врагов).
 *
 * Кроме девяти — один «пользовательский» уровень custom-1 (тот же движок и те же секции, свой профиль и зерно): он стоит в выпадающем
 * списке пользовательских уровней в пульте рядом с картами из редактора и нужен, чтобы список не был пустым.
 *
 * Запуск: node tools/levels/generate.mjs  — перезаписывает public/content/room/levels/mario-1…9.json, комнаты mario-N-boss/-bonus.json и custom-1.json, список уровней
 * в pack.json и сценарии интро/входа в animations.json. Результат детерминирован (зерно на уровень), готовые файлы лежат в репозитории.
 * Проходимость проверяет тест tests/core/mario-levels.test.ts: поиск в ширину по настоящему движку (враги отключены).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOM = join(ROOT, 'public', 'content', 'room');
const ROWS = 6;
const FLOOR = 5;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Столбцы уровня + объекты. Поверхность — строка, на которой стоит герой минус 1: пол — 5, площадка в ряду 4 — герой на строке 3.
 * Физика героя (rules.json): прыжок вверх до 3 клеток, по горизонтали за прыжок ≈ 6 клеток; запас в генераторе — 1 клетка.
 */
class Level {
  constructor(id, label, rnd) {
    this.id = id;
    this.label = label;
    this.rnd = rnd;
    this.cols = [];
    this.objects = [];
    this.counts = {};
    this.marks = [];
    this.transitions = []; // переходы колодцев: { from, to }
    this.spots = []; // места для сердец: { x, row (строка героя) }
  }

  get x() {
    return this.cols.length;
  }

  /** Запоминает размеры массивов: секцию, которая не влезла в уровень, можно откатить. */
  snapshot() {
    return { cols: this.cols.length, objects: this.objects.length, spots: this.spots.length, counts: { ...this.counts } };
  }

  restore(s) {
    this.cols.length = s.cols;
    this.objects.length = s.objects;
    this.spots.length = s.spots;
    this.counts = s.counts;
  }

  id_(prefix) {
    this.counts[prefix] = (this.counts[prefix] ?? 0) + 1;
    return `${prefix}${this.counts[prefix]}`;
  }

  col(rows = []) {
    this.cols.push(new Set(rows));
  }

  floor(n) {
    for (let i = 0; i < n; i++) this.col([FLOOR]);
  }

  /** Провал шириной n: пустые столбцы и опасная область под ними (в оригинале — «падение в реку»). */
  pitSpan(x, n) {
    this.objects.push({ id: this.id_('pit'), type: 'hazard', x, y: FLOOR, w: n, h: 1, params: {} });
  }

  /** Плавающая площадка: столбцы с одной твёрдой клеткой в строке `row`. */
  platformCols(len, row) {
    for (let i = 0; i < len; i++) this.col([row]);
  }

  /**
   * Цепочка площадок над провалом. `steps`: [{ gap, len, row }] — пустой промежуток перед площадкой, её длина и строка поверхности;
   * `after` — промежуток до пола. Промежутки не длиннее запаса прыжка: 5 − подъём (вниз — длиннее).
   */
  chain(steps, after) {
    const start = this.x;
    let surface = FLOOR;
    for (const step of steps) {
      for (let i = 0; i < step.gap; i++) this.col([]);
      const from = this.x;
      this.platformCols(step.len, step.row);
      this.spots.push({ x: from + Math.floor(step.len / 2), row: step.row - 1, kind: 'platform', len: step.len, from });
      surface = step.row;
    }
    for (let i = 0; i < after; i++) this.col([]);
    this.pitSpan(start, this.x - start);
    return surface;
  }

  pit(n) {
    const start = this.x;
    for (let i = 0; i < n; i++) this.col([]);
    this.pitSpan(start, n);
  }

  /** Колонна: твёрдые клетки от строки `top` до пола в `w` столбцах. */
  pillar(w, top) {
    const rows = [];
    for (let r = top; r <= FLOOR; r++) rows.push(r);
    const from = this.x;
    for (let i = 0; i < w; i++) this.col(rows);
    this.spots.push({ x: from + Math.floor(w / 2), row: top - 1, kind: 'pillar', len: w, from });
  }

  /** Лестница вверх и вниз: ступени шириной w высотой по одной клетке, площадка наверху. */
  stairs(steps, w, top) {
    for (let s = 1; s <= steps; s++) this.pillar(w, FLOOR + 1 - (s + 1));
    for (let i = 0; i < top; i++) this.col(this.cols[this.x - 1] ? [...this.cols[this.x - 1]] : [FLOOR]);
    const from = this.x - top;
    this.spots.push({ x: from + Math.floor(top / 2), row: FLOOR - steps - 1, kind: 'plateau', len: top, from });
    for (let s = steps; s >= 1; s--) this.pillar(w, FLOOR + 1 - (s + 1));
  }

  /** Створки: два свисающих блока из верхних рядов; под ними проходит пол, прыжок выше строки 3 упирается в них. */
  gate(depth, gap) {
    const rows = [];
    for (let r = 0; r < depth; r++) rows.push(r);
    this.col([FLOOR, ...rows]);
    for (let i = 0; i < gap; i++) this.col([FLOOR]);
    this.col([FLOOR, ...rows]);
  }

  heart(x, row) {
    this.objects.push({ id: this.id_('h'), type: 'pickup', x, y: row, w: 1, h: 1, asset: 'cell.heart', params: { score: 100 } });
  }

  smallEnemy(x, row, range) {
    this.objects.push({
      id: this.id_('e'),
      type: 'patroller',
      x,
      y: row,
      w: 1,
      h: 1,
      asset: 'cell.devil',
      params: { hp: 1, score: 20, range, stepTicks: 12, stomp: 200 },
    });
  }

  /**
   * Колодец (по видео 180–196 с): две трубы шириной 2 и высотой 3 (ряды 3–5) и щель между ними без пола; в щели висит сердце, на дне — вход в комнату
   * `roomId`. Трубы — как колонны: на них надо залезть (подъём 2 клетки), с одной на другую — прыжок через щель; оступившийся проваливается.
   * После выхода из комнаты герой стоит на полу сразу за правой трубой.
   */
  well(roomId) {
    this.floor(5);
    const left = this.x;
    this.pillar(2, FLOOR - 2);
    const gap = this.x;
    this.col([]);
    this.pillar(2, FLOOR - 2);
    const after = this.x;
    this.floor(3);
    const id = this.id_('well');
    this.objects.push({ id, type: 'sewer', x: gap, y: FLOOR, w: 1, h: 1, params: { returnX: after + 1, returnY: FLOOR - 1 } });
    this.heart(gap, FLOOR - 1);
    this.transitions.push({ from: id, to: roomId });
    this.wellAt = { left, gap, after };
  }
}

/** Общий старт всех уровней по видео: «яма» между колоннами (x = 0 и 2), крышка-кирпич над ней, пол с 3-го столбца. */
function startScreen(level) {
  level.col([3, 4, 5]);
  level.col([]);
  level.col([3, 4, 5]);
  level.floor(10);
  level.objects.push({ id: 'lid', type: 'brick', x: 1, y: 3, w: 1, h: 1, asset: 'cell.obstacle', params: { hp: 3, score: 0 } });
}

// ── Уровень 1: измеренная цепочка по видео (столбцы 0–119) ───────────────────

function measuredStart(level) {
  startScreen(level); // 0–12: яма и пол
  level.chain(
    [
      { gap: 1, len: 7, row: 4 },
      { gap: 1, len: 4, row: 3 },
    ],
    1,
  ); // 13–25: провал 13 клеток, площадки в рядах 4 и 3
  level.floor(6); // 26–31
  level.chain(
    [
      { gap: 1, len: 7, row: 4 },
      { gap: 1, len: 5, row: 3 },
    ],
    1,
  ); // 32–46: провал 15 клеток
  level.floor(7); // 47–53
  level.pit(3); // 54–56
  level.floor(14); // 57–70
  // Над этим полом на видео висят площадки в ряду 3 (на них стоят мелкие враги и лежат сердца) — возвращаются ниже вспомогательным путём.
  level.chain(
    [
      { gap: 3, len: 6, row: 4 },
      { gap: 2, len: 5, row: 4 },
      { gap: 2, len: 6, row: 2 },
    ],
    1,
  ); // 71–94: провал, цепочка через верхнюю площадку
  level.floor(6); // 95–100
  level.pit(4); // 101–104
  level.floor(14); // 105–118
}

// ── Секции для остальных уровней ────────────────────────────────────────────

const choice = (rnd, list) => list[Math.floor(rnd() * list.length)];
const between = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));

/**
 * Наибольший пролёт (пустых столбцов между краями), который проходит решатель на настоящем движке, при условии, что кнопку
 * направления нажимают не чаще раза в 3 такта: REACH[поверхность откуда][поверхность куда] (5 — пол, 4…2 — площадки).
 * Таблица — в reach.json; её сверяет с движком тест tests/core/mario-levels.test.ts (синтетический уровень «два края и пропасть»).
 * Выше площадка — ближе потолок (строка 0 непроходима), поэтому с ряда 2 прыжок короче: 2 → 2 всего 3 клетки.
 */
const REACH = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'reach.json'), 'utf8')).reach;

/** Запас: пролёты в уровнях на 2 клетки короче предельных — играть должно быть можно без ювелирной точности. */
const REACH_MARGIN = 2;
const maxGap = (from, to) => Math.max(1, REACH[from][to] - REACH_MARGIN);

function randomChain(level, p) {
  const rnd = level.rnd;
  const count = between(rnd, p.chainSteps[0], p.chainSteps[1]);
  const steps = [];
  let surface = FLOOR;
  for (let i = 0; i < count; i++) {
    const rows = p.rows.filter((r) => surface - r <= p.maxRise && surface - r >= -2);
    const row = choice(rnd, rows.length ? rows : [surface === FLOOR ? 4 : surface]);
    const gap = Math.min(maxGap(surface, row), between(rnd, 1, p.gapMax));
    const len = between(rnd, p.platLen[0], p.platLen[1]);
    steps.push({ gap, len, row });
    surface = row;
  }
  level.chain(steps, Math.min(maxGap(surface, FLOOR), between(rnd, 1, p.gapMax)));
}

function rest(level, p) {
  level.floor(between(level.rnd, 3, p.restMax));
}

function sectionFlat(level) {
  level.floor(between(level.rnd, 7, 13));
}

function sectionPit(level, p) {
  level.pit(between(level.rnd, 2, p.pitMax));
}

function sectionPillars(level, p) {
  const rnd = level.rnd;
  const n = between(rnd, 2, 3);
  for (let i = 0; i < n; i++) {
    level.floor(between(rnd, 2, 4));
    const extra = between(rnd, 1, p.pillarExtra);
    level.pillar(between(rnd, 1, 2), FLOOR - extra);
  }
}

function sectionPillarHop(level, p) {
  // Колонны как «камни» через провал: сверху на колонну, с неё на следующую.
  const rnd = level.rnd;
  const n = between(rnd, 2, 3);
  const start = level.x;
  level.floor(1);
  const from = level.x;
  for (let i = 0; i < n; i++) {
    const extra = Math.min(p.pillarExtra, between(rnd, 1, 2));
    const width = between(rnd, 1, 2);
    level.pillar(width, FLOOR - extra);
    // Колонна стоит на полу, между колоннами — провал: герой прыгает с вершины на вершину.
    if (i < n - 1) for (let k = 0; k < between(rnd, 2, 3); k++) level.col([]);
  }
  level.objects.push({ id: level.id_('pit'), type: 'hazard', x: from, y: FLOOR, w: level.x - from, h: 1, params: {} });
  level.floor(1);
  void start;
}

function sectionStairs(level, p) {
  level.stairs(between(level.rnd, 2, p.stairsMax), between(level.rnd, 2, 3), between(level.rnd, 2, 4));
}

function sectionGate(level) {
  level.floor(3);
  level.gate(between(level.rnd, 1, 2), between(level.rnd, 2, 3));
  level.floor(3);
}

const SECTIONS = {
  flat: sectionFlat,
  pit: sectionPit,
  chain: randomChain,
  pillars: sectionPillars,
  pillarHop: sectionPillarHop,
  stairs: sectionStairs,
  gate: sectionGate,
};

/**
 * Выбор следующей секции «по квотам»: берётся та, чьё число меньше всего отстаёт от доли по весам профиля, —
 * так в каждом уровне поровну цепочек, провалов, колонн и т. д., а не случайный перекос.
 */
function pickKind(level, p) {
  const entries = Object.entries(p.weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const made = (level.kinds ??= {});
  const done = Object.values(made).reduce((a, b) => a + b, 0) + 1;
  let best = entries[0][0];
  let bestScore = -Infinity;
  for (const [name, w] of entries) {
    if (name === level.lastKind && level.sameKind >= 2) continue;
    const score = (w / total) * done - (made[name] ?? 0) + level.rnd() * 0.9;
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  made[best] = (made[best] ?? 0) + 1;
  level.sameKind = best === level.lastKind ? level.sameKind + 1 : 1;
  level.lastKind = best;
  return best;
}

function fillSection(level, p) {
  const kind = pickKind(level, p);
  rest(level, p);
  SECTIONS[kind](level, p);
  return kind;
}

/** Профиль сложности по номеру уровня (допущение: чем дальше, тем длиннее, шире провалы, уже площадки, выше колонны, больше врагов). */
const PROFILES = [
  null,
  { length: 170, maxRise: 2, rows: [4, 3], gapMax: 3, platLen: [5, 7], chainSteps: [2, 3], pitMax: 3, pillarExtra: 1, stairsMax: 2, smallN: 3, bonusN: 2, enemyP: 0.35, restMax: 6, hearts: 10, weights: { flat: 4, chain: 5, pit: 2, pillars: 1 } },
  { length: 184, maxRise: 2, rows: [4, 3], gapMax: 3, platLen: [5, 7], chainSteps: [2, 3], pitMax: 4, pillarExtra: 2, stairsMax: 2, smallN: 4, bonusN: 2, enemyP: 0.45, restMax: 6, hearts: 11, weights: { flat: 3, chain: 4, pit: 2, pillars: 4, stairs: 1 } },
  { length: 194, maxRise: 2, rows: [4, 3, 2], gapMax: 4, platLen: [4, 6], chainSteps: [2, 4], pitMax: 4, pillarExtra: 2, stairsMax: 3, smallN: 6, bonusN: 3, enemyP: 0.5, restMax: 5, hearts: 12, weights: { flat: 3, chain: 4, pit: 2, pillars: 2, stairs: 4 } },
  { length: 204, maxRise: 2, rows: [4, 3, 2], gapMax: 4, platLen: [4, 6], chainSteps: [2, 4], pitMax: 4, pillarExtra: 3, stairsMax: 3, smallN: 8, bonusN: 3, enemyP: 0.5, restMax: 5, hearts: 12, weights: { flat: 3, chain: 4, pit: 2, pillars: 3, stairs: 2, gate: 2 } },
  { length: 214, maxRise: 3, rows: [4, 3, 2], gapMax: 4, platLen: [4, 5], chainSteps: [3, 5], pitMax: 5, pillarExtra: 3, stairsMax: 3, smallN: 9, bonusN: 3, enemyP: 0.5, restMax: 5, hearts: 13, weights: { flat: 2, chain: 7, pit: 2, pillars: 2, gate: 2 } },
  { length: 224, maxRise: 3, rows: [4, 3, 2], gapMax: 4, platLen: [3, 5], chainSteps: [2, 4], pitMax: 5, pillarExtra: 3, stairsMax: 3, smallN: 10, bonusN: 3, enemyP: 0.55, restMax: 4, hearts: 13, weights: { flat: 2, chain: 3, pit: 3, pillars: 3, pillarHop: 6, gate: 1, stairs: 1 } },
  { length: 234, maxRise: 3, rows: [4, 3, 2], gapMax: 4, platLen: [2, 4], chainSteps: [4, 6], pitMax: 5, pillarExtra: 3, stairsMax: 3, smallN: 11, bonusN: 3, enemyP: 0.3, restMax: 4, hearts: 14, weights: { flat: 2, chain: 9, pit: 3, pillarHop: 2, gate: 1 } },
  { length: 246, maxRise: 3, rows: [4, 3, 2], gapMax: 4, platLen: [3, 5], chainSteps: [3, 5], pitMax: 5, pillarExtra: 3, stairsMax: 3, smallN: 13, bonusN: 3, enemyP: 0.6, restMax: 4, hearts: 15, weights: { flat: 2, chain: 5, pit: 3, pillars: 2, pillarHop: 3, gate: 2, stairs: 1 } },
  { length: 256, maxRise: 3, rows: [4, 3, 2], gapMax: 4, platLen: [3, 5], chainSteps: [3, 5], pitMax: 5, pillarExtra: 3, stairsMax: 3, smallN: 14, bonusN: 3, enemyP: 0.6, restMax: 4, hearts: 16, weights: { flat: 2, chain: 5, pit: 3, pillars: 3, pillarHop: 3, gate: 2, stairs: 3 } },
];

/** Профиль пользовательского уровня custom-1: средняя сложность, всё понемногу (допущение по общей логике геймплея). */
const CUSTOM_PROFILE = { length: 190, maxRise: 2, rows: [4, 3, 2], gapMax: 4, platLen: [4, 6], chainSteps: [2, 4], pitMax: 4, pillarExtra: 2, stairsMax: 3, smallN: 8, bonusN: 3, enemyP: 0.5, restMax: 5, hearts: 12, weights: { flat: 3, chain: 4, pit: 2, pillars: 2, pillarHop: 2, stairs: 2, gate: 1 } };

/** Короткая «подпись» уровня — что в нём нового (для примечания и документации). */
const THEMES = [
  null,
  'начало: цепочки площадок над провалами по видео, мелкие враги, сердца',
  'появляются колонны (до 2 клеток над полом) и провалы до 4 клеток; первый колодец с бонусной комнатой',
  'лестницы вверх и вниз, площадки в ряду 2, колонны; колодец с большим чёртом',
  'створки и колонны выше, провалы шире; колодец с бонусной комнатой',
  'длинные цепочки площадок с подъёмом до 3 клеток; колодец с большим чёртом',
  'колонны как «камни» через провалы, плотные провалы и колонны; колодец с бонусной комнатой',
  'очень узкие площадки (2–4 клетки) над самыми длинными провалами; колодец с большим чёртом',
  'много врагов на узких площадках; колодец с большим чёртом',
  'всё вместе: лестницы, цепочки, колонны-«камни», больше всего врагов; самый длинный уровень; колодец с большим чёртом',
];


// ── Расстановка после планировки: бонусные площадки, враги, сердца ──────────────

/** Столбец «чистый», если в нём ровно одна твёрдая клетка в строке `row`. */
const plain = (level, x, row) => x >= 0 && x < level.cols.length && level.cols[x].size === 1 && level.cols[x].has(row);

/** Поверхность столбца для героя: строка клетки над самой верхней твёрдой; null — столбец пуст (провал) или это створка. */
function standRow(level, x) {
  const set = level.cols[x];
  if (!set || set.size === 0 || set.has(0)) return null;
  return Math.min(...set) - 1;
}

/**
 * Необязательные верхние площадки (ряд 3) над длинными ровными участками пола — на видео над полом висят площадки с сердцами.
 * Высота пола + площадки: герой на полу (строка 4) прыгает на площадку (строка 2): подъём 2 клетки.
 */
function addBonusPlatforms(level, p) {
  const total = level.cols.length;
  const taken = [];
  let x = 16;
  while (x < total - 22 && taken.length < p.bonusN) {
    let end = x;
    while (end < total && plain(level, end, FLOOR)) end++;
    if (end - x >= 11) {
      const len = Math.min(5, end - x - 6);
      const at = x + 3 + Math.floor(level.rnd() * Math.max(1, end - x - len - 6));
      for (let k = 0; k < len; k++) level.cols[at + k].add(3);
      taken.push(at);
      level.spots.push({ x: at + Math.floor(len / 2), row: 2, kind: 'bonus', len, from: at });
      x = end + 6;
    } else {
      x = Math.max(end, x) + 1;
    }
  }
}

/** Берёт из списка кандидатов по одному на равные участки уровня — враги и сердца распределяются по всей длине. */
function spread(candidates, count, from, to, minDistance, rnd) {
  const picked = [];
  if (count <= 0 || candidates.length === 0) return picked;
  const segment = (to - from) / count;
  for (let i = 0; i < count; i++) {
    const centre = from + segment * (i + 0.5);
    const best = candidates
      .filter((c) => picked.every((q) => Math.abs(q.x - c.x) >= minDistance))
      .map((c) => ({ c, d: Math.abs(c.x - centre) + rnd() * 2 + (c.penalty ?? 0) }))
      .sort((a, b) => a.d - b.d)[0];
    if (best) picked.push(best.c);
  }
  return picked;
}

/** Мелкие враги: на ровных участках пола и длинных площадках, патруль ±1…2 клетки (площадка вокруг врага чистая на 1 клетку шире). */
function placeSmallEnemies(level, p) {
  const total = level.cols.length;
  const candidates = [];
  for (let x = 16; x < total - 18; x++) {
    for (const row of [FLOOR, 4, 3, 2]) {
      for (const range of [2, 1, 0]) {
        let ok = true;
        for (let k = x - range - 1; k <= x + range + 1 && ok; k++) ok = plain(level, k, row);
        if (ok) {
          candidates.push({ x, row: row - 1, range, penalty: (2 - range) * 3 });
          break;
        }
      }
    }
  }
  for (const c of spread(candidates, p.smallN, 16, total - 18, 9, level.rnd)) level.smallEnemy(c.x, c.row, c.range);
}

/** Сердца: по одному на равные участки уровня; верхние площадки, колонны и платформы цепочек — в первую очередь. */
function placeHearts(level, p) {
  const total = level.cols.length;
  const enemies = level.objects.filter((o) => o.type === 'patroller');
  const inEnemy = (x, row) =>
    enemies.some((o) => x >= o.x - (o.params.range ?? 0) && x <= o.x + (o.params.range ?? 0) + o.w - 1 && row >= o.y - 1 && row <= o.y + o.h);
  const all = [];
  for (let x = 15; x < total - 14; x++) {
    const row = standRow(level, x);
    if (row === null || row < 1) continue;
    if (inEnemy(x, row)) continue;
    all.push({ x, row, high: row < FLOOR - 1 });
  }
  const high = all.filter((c) => c.high);
  const chosen = [];
  const want = p.hearts;
  const preferred = spread(high, Math.min(want, Math.ceil(want * 0.7)), 15, total - 14, 4, level.rnd);
  chosen.push(...preferred);
  const rest = spread(
    all.filter((c) => chosen.every((q) => Math.abs(q.x - c.x) >= 5)),
    want - chosen.length,
    15,
    total - 14,
    5,
    level.rnd,
  );
  chosen.push(...rest);
  chosen.sort((a, b) => a.x - b.x);
  for (const c of chosen) level.heart(c.x, c.row);
  level.heartCount = chosen.length;
}

/** Комната колодца уровня n: «boss» — большой чёрт 2 × 2 (нечётные уровни), «bonus» — бонусные сердца (чётные); у уровня 1 и custom-1 колодца нет. */
const roomKind = (n) => (n % 2 === 1 ? 'boss' : 'bonus');
const roomId = (n) => `mario-${n}-${roomKind(n)}`;

/** n — номер уровня MARIO (1–9) или 'custom' — пользовательский уровень custom-1. */
function buildLevel(n) {
  const custom = n === 'custom';
  const p = custom ? CUSTOM_PROFILE : PROFILES[n];
  const level = custom
    ? new Level('custom-1', 'U-01', mulberry32(0x55534552))
    : new Level(`mario-${n}`, `1-0${n}`, mulberry32(0x4d41524f + n * 7919));
  let measured = 0;
  if (n === 1) {
    measuredStart(level);
    measured = level.x;
  } else {
    startScreen(level);
    if (n === 9) {
      // Уровень 9 на видео начинается лестницей из площадок 2–3 клетки, поднимающейся вправо (кадры 66–78 с).
      level.floor(3);
      level.stairs(3, 3, 3);
    }
  }
  // Секции добавляются, пока влезают в бюджет длины (под финиш остаётся 15 столбцов); не влезшая секция откатывается.
  const well = typeof n === 'number' && n >= 2 ? roomId(n) : null;
  for (let guard = 0; guard < 80 && level.x < p.length - 15 - 20; guard++) {
    if (well && !level.wellAt && level.x >= p.length * 0.45) {
      level.well(well); // колодец примерно посередине уровня
      continue;
    }
    const shot = level.snapshot();
    const kinds = { ...(level.kinds ?? {}) };
    const last = level.lastKind;
    const same = level.sameKind;
    fillSection(level, p);
    if (level.x > p.length - 15) {
      level.restore(shot);
      level.kinds = kinds;
      level.lastKind = last;
      level.sameKind = same;
      level.floor(Math.max(0, Math.min(6, p.length - 15 - level.x)));
      break;
    }
  }
  // Финиш: ровный пол и клетка «финиш» на уровне героя; остаток бюджета длины уходит в ровный пол перед ним.
  level.floor(Math.max(0, Math.min(20, p.length - 12 - level.x)));
  level.floor(6);
  const finishX = level.x;
  level.floor(1);
  level.floor(5);
  level.objects.push({ id: 'goal', type: 'finish', x: finishX, y: FLOOR - 1, w: 1, h: 1, asset: 'cell.all_on', params: { score: 0 } });

  addBonusPlatforms(level, p);
  placeSmallEnemies(level, p);
  placeHearts(level, p);
  return { level, measured, p };
}

function toJson(n, { level, measured }, next) {
  const custom = n === 'custom';
  const width = level.cols.length;
  const rows = Array.from({ length: ROWS }, (_, r) => level.cols.map((c) => (c.has(r) ? '#' : '.')).join(''));
  const marks = [
    {
      id: 'approximation',
      x: 0,
      y: 0,
      w: width,
      h: ROWS,
      status: 'assumed',
      note: custom
        ? 'Сгенерированный пользовательский уровень: планировка собрана по общей логике движка (секции и пределы прыжка — как у уровней MARIO), не оригинальный уровень.'
        : n === 1
          ? 'Геймплейное приближение: столбцы 0–119 — измеренная по видео цепочка платформ над провалами (разброс ±2 столбца, видео: попытки 108–225 с), дальше и враги/сердца — допущения.'
          : `Геймплейное приближение, не оригинальный уровень 1-0${n}: ${THEMES[n]}. Планировка — допущение по общей логике геймплея; владелец позже передаст прохождение для восстановления 1 в 1.`,
      ref: 'video: 19b50e99-Apollo-Tetris-Crocodile (геймплей)',
    },
  ];
  if (measured > 0) marks.push({ id: 'measured-chain', x: 0, y: 0, w: measured, h: ROWS, status: 'assumed', note: 'Столбцы по видео: цепочки платформ рядов 4 и 3 над провалами 13–15 клеток, пол 6–14 клеток между ними.', ref: 'video 108–225 c (три попытки сходятся с точностью до 2 столбцов)' });
  return {
    schemaVersion: 1,
    id: level.id,
    status: 'demo',
    hudLabel: level.label,
    note: custom
      ? 'Сгенерированный пользовательский уровень «Генерация 1»: цепочки площадок, колонны, лестницы, створки и враги — по общей логике движка (tools/levels/generate.mjs). Не оригинальный уровень.'
      : `Геймплейное приближение уровня ${level.label} (MARIO, уровень ${n} из 9): ${THEMES[n]}. Не оригинальный уровень — расстановка придумана по общей логике геймплея на видео; враги и таймер — по видео геймплея (docs/video-observations.md §10).`,
    width,
    height: ROWS,
    legend: { '.': { collision: 'empty' }, '#': { collision: 'solid', asset: 'cell.obstacle' } },
    rows,
    start: { x: 1, y: FLOOR },
    objects: level.objects,
    transitions: [{ from: 'goal', to: next }, ...level.transitions],
    marks,
  };
}

/**
 * Комната колодца (ровный экран 13 × 6, камера не двигается): герой падает сверху слева; выход — правый край. В «boss» летает большой чёрт 2 × 2
 * (преследует героя, пикирует — по видео 202–214 с; его можно застрелить, 4 попадания, +400); в «bonus» поле заполнено сердцами (ряды 1–4, по +100).
 */
function buildRoom(n) {
  const kind = roomKind(n);
  const width = 13;
  const rows = Array.from({ length: ROWS }, (_, r) => (r === FLOOR ? '#' : '.').repeat(width));
  const objects = [{ id: 'exit', type: 'exit', x: width - 1, y: 0, w: 1, h: FLOOR, params: {} }];
  if (kind === 'boss') {
    objects.push({
      id: 'boss',
      type: 'patroller',
      x: 10,
      y: 0,
      w: 2,
      h: 2,
      asset: 'cell.devil_big',
      params: { hp: 4, score: 400, range: 8, stepTicks: 12, chase: 1, minY: 0 },
    });
  } else {
    for (let y = 1; y <= 4; y++) {
      for (let x = 0; x < width - 1; x++) {
        objects.push({ id: `h${y}-${x}`, type: 'pickup', x, y, w: 1, h: 1, asset: 'cell.heart', params: { score: 100 } });
      }
    }
  }
  const label = `1-0${n}`;
  return {
    schemaVersion: 1,
    id: roomId(n),
    status: 'demo',
    hudLabel: label,
    note:
      kind === 'boss'
        ? `Комната колодца уровня ${label}: ровный пол и большой чёрт 2 × 2 (видео геймплея 198–214 с, docs/video-observations.md §11). Выход — правый край. Допущение: что бывает в оригинале после комнаты и как её закончить, по видео не ясно.`
        : `Комната колодца уровня ${label}: поле заполнено бонусными сердцами, которые можно просто собрать (по подсказке владельца вместо босса; в видео такой комнаты нет). Выход — правый край.`,
    width,
    height: ROWS,
    legend: { '.': { collision: 'empty' }, '#': { collision: 'solid', asset: 'cell.obstacle' } },
    rows,
    start: { x: 2, y: 0 },
    objects,
    transitions: [],
    marks: [
      {
        id: 'approximation',
        x: 0,
        y: 0,
        w: width,
        h: ROWS,
        status: 'assumed',
        note: kind === 'boss' ? 'Размеры комнаты и маршрут чёрта — по видео 198–214 с (ровный пол на весь экран, большой чёрт сверху справа); выход и награда — допущения.' : 'Заполнение сердцами — по подсказке владельца; число и очки — допущения.',
        ref: 'video: 19b50e99-Apollo-Tetris-Crocodile (геймплей)',
      },
    ],
  };
}

function logLevel(json, objects) {
  const count = (type) => objects.filter((o) => o.type === type).length;
  console.log(`${json.id}  ${json.hudLabel}  ширина ${json.width}  провалы ${count('hazard')}  враги ${objects.filter((o) => o.type === 'patroller').length}  колодцы ${count('sewer')}  сердца ${count('pickup')}`);
}

function main() {
  const ids = [];
  const roomIds = [];
  for (let n = 1; n <= 9; n++) {
    const built = buildLevel(n);
    const json = toJson(n, built, n < 9 ? `mario-${n + 1}` : null);
    writeFileSync(join(ROOM, 'levels', `mario-${n}.json`), JSON.stringify(json, null, 2) + '\n');
    ids.push(json.id);
    logLevel(json, built.level.objects);
    if (n >= 2) {
      const room = buildRoom(n);
      writeFileSync(join(ROOM, 'levels', `${room.id}.json`), JSON.stringify(room, null, 2) + '\n');
      roomIds.push(room.id);
      console.log(`  → комната ${room.id} (${roomKind(n)}): объектов ${room.objects.length}`);
    }
  }
  const customBuilt = buildLevel('custom');
  const customJson = toJson('custom', customBuilt, null);
  writeFileSync(join(ROOM, 'levels', 'custom-1.json'), JSON.stringify(customJson, null, 2) + '\n');
  logLevel(customJson, customBuilt.level.objects);

  // Пакет: девять уровней первыми, дальше прежние (тестовый «туннель» по видео), последним — пользовательский.
  const packPath = join(ROOM, 'pack.json');
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  const keep = pack.levels.filter((file) => !/levels\/(mario-\d(-boss|-bonus)?|custom-\d)\.json$/.test(file));
  pack.levels = [...ids.map((id) => `levels/${id}.json`), ...roomIds.map((id) => `levels/${id}.json`), ...keep, 'levels/custom-1.json'];
  pack.firstLevel = 'mario-1';
  pack.title = 'Игрушка: девять уровней MARIO — геймплейное приближение (не оригинальные уровни)';
  writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n');

  // Интро и сценарий выхода из ямы — одни и те же у всех уровней (общий старт по видео): копия сценария «туннеля».
  const animPath = join(ROOM, 'animations.json');
  const anim = JSON.parse(readFileSync(animPath, 'utf8'));
  for (const id of [...ids, 'custom-1']) {
    anim.intro.routes[id] = anim.intro.routes['tunnel-run'];
    anim.entry.scripts[id] = anim.entry.scripts['tunnel-run'];
  }
  // Маршруты и сценарии одинаковы у девяти уровней — пишем компактно (клетки и списки действий в одну строку).
  const compact = JSON.stringify(anim, null, 2)
    .replace(/\[\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1, $2]')
    .replace(/\[\s+("[a-z]+"(?:,\s+"[a-z]+")*)\s+\]/g, (_, list) => `[${list.replace(/\s+/g, ' ')}]`);
  writeFileSync(animPath, compact + '\n');
}

main();
