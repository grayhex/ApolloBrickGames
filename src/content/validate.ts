import {
  SCHEMA_VERSION,
  type AnimationsDef,
  type AssetCatalog,
  type AssetDef,
  type AssetProvenance,
  type ContentPack,
  type CellPos,
  type ContentStatus,
  type EntryStep,
  DEFAULT_LCD_COLORS,
  type FireRules,
  type Hud,
  type HudDigits,
  type HudTime,
  type HudFixed,
  type IntroAnimation,
  type LegendEntry,
  type LevelDef,
  type LevelMark,
  MAX_MARK_NOTE,
  MAX_MARK_REF,
  type ObjectDef,
  type PackManifest,
  type Params,
  type RuleParams,
  type RuleSetDef,
  type ScreenProfile,
  type Transition,
  type ValidationEnv,
} from './schema';

/** Одна проблема данных: путь вида `$.rows[3]` и сообщение. Редактор по пути находит клетку/объект. */
export interface ContentIssue {
  path: string;
  message: string;
}

/** Ошибка данных: список понятных сообщений с путём до проблемного поля. */
export class ContentError extends Error {
  readonly source: string;
  /** Готовые строки «путь: сообщение». */
  readonly issues: readonly string[];
  /** То же в структурном виде. */
  readonly details: readonly ContentIssue[];

  constructor(source: string, issues: readonly (string | ContentIssue)[]) {
    const details = issues.map((issue) => (typeof issue === 'string' ? { path: '$', message: issue } : issue));
    const lines = details.map((issue) => (issue.path === '$' ? issue.message : `${issue.path}: ${issue.message}`));
    super(`Ошибка данных в «${source}»:\n` + lines.map((line) => `  • ${line}`).join('\n'));
    this.name = 'ContentError';
    this.source = source;
    this.issues = lines;
    this.details = details;
  }
}

export const MAX_LEVEL_SIZE_LIMIT = 256;
const MAX_LEVEL_SIZE = MAX_LEVEL_SIZE_LIMIT;
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const HUD_LABEL_PATTERN = /^[A-Za-z0-9 -]{1,8}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Накопитель ошибок с вспомогательными читалками полей. */
export class Checker {
  readonly issues: ContentIssue[] = [];

  fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  record(value: unknown, path: string): Rec | null {
    if (isRecord(value)) return value;
    this.fail(path, 'ожидался объект');
    return null;
  }

  int(rec: Rec, key: string, path: string, min: number, max: number, fallback?: number): number {
    const value = rec[key];
    const where = `${path}.${key}`;
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.fail(where, `ожидалось целое число, получено ${JSON.stringify(value)}`);
      return fallback ?? min;
    }
    if (value < min || value > max) {
      this.fail(where, `значение ${value} вне диапазона ${min}…${max}`);
    }
    return value;
  }

  bool(rec: Rec, key: string, path: string): boolean {
    const value = rec[key];
    if (typeof value !== 'boolean') {
      this.fail(`${path}.${key}`, `ожидалось true/false, получено ${JSON.stringify(value)}`);
      return false;
    }
    return value;
  }

  str(rec: Rec, key: string, path: string, pattern?: RegExp, fallback?: string): string {
    const value = rec[key];
    const where = `${path}.${key}`;
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'string' || value === '') {
      this.fail(where, `ожидалась непустая строка, получено ${JSON.stringify(value)}`);
      return fallback ?? '';
    }
    if (pattern && !pattern.test(value)) {
      this.fail(where, `значение «${value}» не подходит под ${pattern}`);
    }
    return value;
  }

  schemaVersion(rec: Rec, path: string): number {
    const value = rec['schemaVersion'];
    if (value !== SCHEMA_VERSION) {
      this.fail(
        `${path}.schemaVersion`,
        `неподдерживаемая версия схемы ${JSON.stringify(value)}, поддерживается ${SCHEMA_VERSION}`,
      );
    }
    return SCHEMA_VERSION;
  }

  status(rec: Rec, path: string): ContentStatus {
    const value = rec['status'];
    if (value !== 'demo' && value !== 'confirmed') {
      this.fail(`${path}.status`, `ожидалось «demo» или «confirmed», получено ${JSON.stringify(value)}`);
      return 'demo';
    }
    return value;
  }

  done(source: string): void {
    if (this.issues.length > 0) throw new ContentError(source, this.issues);
  }

  /** Корень документа не объект — дальше читать нечего. */
  abort(source: string): never {
    throw new ContentError(source, this.issues);
  }
}

// ── Профиль экрана ─────────────────────────────────────────────────────────

export function validateScreenProfile(raw: unknown, source = 'screen'): ScreenProfile {
  const c = new Checker();
  const rec = c.record(raw, '$');
  if (!rec) return c.abort(source);

  const viewport = c.record(rec['viewport'], '$.viewport') ?? {};
  const cell = c.record(rec['cell'], '$.cell') ?? {};
  const rawMargin = rec['margin'] === undefined ? {} : (c.record(rec['margin'], '$.margin') ?? {});
  const margin = {
    left: c.int(rawMargin, 'left', '$.margin', 0, 2048, 0),
    right: c.int(rawMargin, 'right', '$.margin', 0, 2048, 0),
    top: c.int(rawMargin, 'top', '$.margin', 0, 2048, 0),
    bottom: c.int(rawMargin, 'bottom', '$.margin', 0, 2048, 0),
  };
  const cellSize = { width: c.int(cell, 'width', '$.cell', 1, 1024), height: c.int(cell, 'height', '$.cell', 1, 1024) };

  const rawColors = rec['colors'] === undefined ? {} : (c.record(rec['colors'], '$.colors') ?? {});
  const color = (key: 'background' | 'ink'): string =>
    c.str(rawColors, key, '$.colors', COLOR_PATTERN, DEFAULT_LCD_COLORS[key]);

  const smoothing = rec['smoothing'];
  if (smoothing !== undefined && typeof smoothing !== 'boolean') c.fail('$.smoothing', 'ожидалось true/false');

  let ghost: ScreenProfile['ghost'] = null;
  if (rec['ghost'] !== undefined && rec['ghost'] !== null) {
    const g = c.record(rec['ghost'], '$.ghost') ?? {};
    ghost = { asset: c.str(g, 'asset', '$.ghost'), enabled: g['enabled'] === undefined ? true : c.bool(g, 'enabled', '$.ghost') };
  }

  const hud = validateHud(c, rec['hud'], cellSize, margin);

  const profile: ScreenProfile = {
    schemaVersion: c.schemaVersion(rec, '$'),
    id: c.str(rec, 'id', '$', ID_PATTERN),
    status: c.status(rec, '$'),
    viewport: {
      columns: c.int(viewport, 'columns', '$.viewport', 1, 64),
      rows: c.int(viewport, 'rows', '$.viewport', 1, 64),
    },
    cell: cellSize,
    margin,
    colors: { background: color('background'), ink: color('ink') },
    smoothing: smoothing === true,
    ghost,
    hud,
  };
  c.done(source);
  return profile;
}

function validateHudTime(c: Checker, raw: unknown): HudTime {
  const t = c.record(raw, '$.hud.time') ?? {};
  const d = c.record(t['digits'], '$.hud.time.digits') ?? {};
  const path = '$.hud.time.digits';
  return {
    asset: c.str(t, 'asset', '$.hud.time'),
    x: c.int(t, 'x', '$.hud.time', -4096, 4096),
    y: c.int(t, 'y', '$.hud.time', -4096, 4096),
    width: c.int(t, 'width', '$.hud.time', 1, 1024),
    height: c.int(t, 'height', '$.hud.time', 1, 1024),
    digits: {
      x: c.int(d, 'x', path, -4096, 4096),
      y: c.int(d, 'y', path, -4096, 4096),
      pitch: c.int(d, 'pitch', path, 1, 1024),
      slots: c.int(d, 'slots', path, 1, 16),
    },
  };
}

function validateHud(
  c: Checker,
  raw: unknown,
  cell: { width: number; height: number },
  margin: { top: number; bottom: number },
): Hud {
  const hud = c.record(raw, '$.hud') ?? {};
  let fixed: HudFixed | null = null;
  if (hud['fixed'] !== undefined && hud['fixed'] !== null) {
    const f = c.record(hud['fixed'], '$.hud.fixed') ?? {};
    fixed = {
      lives: c.int(f, 'lives', '$.hud.fixed', 0, 9),
      label: c.str(f, 'label', '$.hud.fixed', HUD_LABEL_PATTERN),
      score: c.int(f, 'score', '$.hud.fixed', 0, 99999),
    };
  }

  if (hud['kind'] === 'lcd') {
    const lives = c.record(hud['lives'], '$.hud.lives') ?? {};
    const digits = (key: 'label' | 'score'): HudDigits => {
      const d = c.record(hud[key], `$.hud.${key}`) ?? {};
      const path = `$.hud.${key}`;
      return {
        x: c.int(d, 'x', path, -4096, 4096),
        y: c.int(d, 'y', path, -4096, 4096),
        pitch: c.int(d, 'pitch', path, 1, 1024),
        slots: c.int(d, 'slots', path, 1, 16),
      };
    };
    const rawFont = c.record(hud['font'], '$.hud.font') ?? {};
    const glyphs: Record<string, string> = {};
    for (const [char, asset] of Object.entries(c.record(rawFont['glyphs'], '$.hud.font.glyphs') ?? {})) {
      if (char.length !== 1) c.fail(`$.hud.font.glyphs["${char}"]`, 'ключ — ровно один символ');
      if (typeof asset === 'string' && asset !== '') glyphs[char] = asset;
      else c.fail(`$.hud.font.glyphs["${char}"]`, 'ожидался идентификатор ресурса');
    }
    return {
      kind: 'lcd',
      fixed,
      lives: {
        asset: c.str(lives, 'asset', '$.hud.lives'),
        x: c.int(lives, 'x', '$.hud.lives', -4096, 4096),
        y: c.int(lives, 'y', '$.hud.lives', -4096, 4096),
        width: c.int(lives, 'width', '$.hud.lives', 1, 1024),
        height: c.int(lives, 'height', '$.hud.lives', 1, 1024),
        pitch: c.int(lives, 'pitch', '$.hud.lives', 1, 1024),
        ...(lives['spare'] === undefined ? {} : { spare: c.bool(lives, 'spare', '$.hud.lives') }),
        ...(lives['max'] === undefined ? {} : { max: c.int(lives, 'max', '$.hud.lives', 1, 9) }),
      },
      label: digits('label'),
      score: digits('score'),
      ...(hud['time'] === undefined ? {} : { time: validateHudTime(c, hud['time']) }),
      font: {
        width: c.int(rawFont, 'width', '$.hud.font', 1, 512),
        height: c.int(rawFont, 'height', '$.hud.font', 1, 512),
        glyphs,
        ghost: rawFont['ghost'] === undefined || rawFont['ghost'] === null ? null : c.str(rawFont, 'ghost', '$.hud.font'),
      },
    };
  }

  if (hud['kind'] !== 'builtin') {
    c.fail('$.hud.kind', `ожидалось «builtin» или «lcd», получено ${JSON.stringify(hud['kind'])}`);
  }
  const position = hud['position'];
  if (position !== 'top' && position !== 'bottom') {
    c.fail('$.hud.position', `ожидалось «top» или «bottom», получено ${JSON.stringify(position)}`);
  }
  const side = position === 'bottom' ? 'bottom' : 'top';
  if (margin[side] < 5) c.fail('$.margin', `для встроенного HUD нужна полоса margin.${side} не меньше 5 пикселей`);
  return {
    kind: 'builtin',
    position: side,
    iconPx: c.int(hud, 'iconPx', '$.hud', 1, 512, Math.min(cell.width, cell.height)),
    fixed,
  };
}

// ── Каталог ресурсов ───────────────────────────────────────────────────────

export function validateAssetCatalog(raw: unknown, env: ValidationEnv, source = 'assets'): AssetCatalog {
  const c = new Checker();
  const rec = c.record(raw, '$');
  if (!rec) return c.abort(source);

  const assets: Record<string, AssetDef> = {};
  const rawAssets = c.record(rec['assets'], '$.assets') ?? {};
  const checkGlyph = (glyph: string, path: string): void => {
    if (env.glyphs && !env.glyphs.includes(glyph)) {
      c.fail(path, `неизвестная заглушка «${glyph}», доступны: ${env.glyphs.join(', ')}`);
    }
  };

  for (const [id, value] of Object.entries(rawAssets)) {
    const path = `$.assets.${id}`;
    if (!ID_PATTERN.test(id)) c.fail(path, 'идентификатор ресурса должен состоять из букв, цифр, «.», «_», «-»');
    const def = c.record(value, path);
    if (!def) continue;
    if (def['kind'] === 'placeholder') {
      const glyph = c.str(def, 'glyph', path);
      checkGlyph(glyph, `${path}.glyph`);
      assets[id] = { kind: 'placeholder', glyph };
    } else if (def['kind'] === 'image') {
      const fallbackGlyph = c.str(def, 'fallbackGlyph', path, undefined, 'unknown');
      checkGlyph(fallbackGlyph, `${path}.fallbackGlyph`);
      let provenance: AssetProvenance | null = null;
      if (def['provenance'] !== undefined) {
        const pr = c.record(def['provenance'], `${path}.provenance`) ?? {};
        const status = pr['status'];
        if (status !== 'draft' && status !== 'confirmed' && status !== 'blocked') {
          c.fail(`${path}.provenance.status`, `ожидалось «draft», «confirmed» или «blocked», получено ${JSON.stringify(status)}`);
        }
        const sources: string[] = [];
        if (Array.isArray(pr['sources'])) {
          pr['sources'].forEach((source: unknown, index: number) => {
            if (typeof source === 'string' && source !== '') sources.push(source);
            else c.fail(`${path}.provenance.sources[${index}]`, 'ожидалась непустая строка');
          });
        } else {
          c.fail(`${path}.provenance.sources`, 'ожидался массив ссылок на референсы');
        }
        provenance = {
          status: status === 'confirmed' || status === 'blocked' ? status : 'draft',
          sources,
          note: typeof pr['note'] === 'string' ? pr['note'] : '',
          anchor: typeof pr['anchor'] === 'string' ? pr['anchor'] : 'cell-top-left',
        };
      }
      const origin = def['origin'] === undefined ? {} : (c.record(def['origin'], `${path}.origin`) ?? {});
      const mirror = def['mirrorWhenLeft'];
      if (mirror !== undefined && typeof mirror !== 'boolean') c.fail(`${path}.mirrorWhenLeft`, 'ожидалось true/false');
      assets[id] = {
        kind: 'image',
        src: c.str(def, 'src', path),
        frameWidth: c.int(def, 'frameWidth', path, 1, 4096),
        frameHeight: c.int(def, 'frameHeight', path, 1, 4096),
        origin: {
          x: c.int(origin, 'x', `${path}.origin`, 0, 65535, 0),
          y: c.int(origin, 'y', `${path}.origin`, 0, 65535, 0),
        },
        frames: c.int(def, 'frames', path, 1, 256, 1),
        frameTicks: c.int(def, 'frameTicks', path, 1, 10_000, 1),
        fallbackGlyph,
        mirrorWhenLeft: mirror === true,
        provenance,
      };
    } else {
      c.fail(`${path}.kind`, `ожидалось «placeholder» или «image», получено ${JSON.stringify(def['kind'])}`);
    }
  }

  const catalog: AssetCatalog = {
    schemaVersion: c.schemaVersion(rec, '$'),
    id: c.str(rec, 'id', '$', ID_PATTERN),
    status: c.status(rec, '$'),
    assets,
  };
  c.done(source);
  return catalog;
}

// ── Правила ────────────────────────────────────────────────────────────────

export function validateRuleSet(raw: unknown, env: ValidationEnv, source = 'rules'): RuleSetDef {
  const c = new Checker();
  const rec = c.record(raw, '$');
  if (!rec) return c.abort(source);

  const p = c.record(rec['params'], '$.params') ?? {};
  const move = c.record(p['move'], '$.params.move') ?? {};
  const jump = c.record(p['jump'], '$.params.jump') ?? {};
  const fall = c.record(p['fall'], '$.params.fall') ?? {};
  const fireRules = (): FireRules => {
    const fire = c.record(p['fire'], '$.params.fire') ?? {};
    const projectile = c.record(fire['projectile'], '$.params.fire.projectile') ?? {};
    return {
      intervalTicks: c.int(fire, 'intervalTicks', '$.params.fire', 1, 1000),
      holdRepeat: c.bool(fire, 'holdRepeat', '$.params.fire'),
      maxProjectiles: c.int(fire, 'maxProjectiles', '$.params.fire', 1, 16),
      projectile: {
        cellsPerStep: c.int(projectile, 'cellsPerStep', '$.params.fire.projectile', 1, 64),
        stepTicks: c.int(projectile, 'stepTicks', '$.params.fire.projectile', 1, 1000),
        maxRangeCells: c.int(projectile, 'maxRangeCells', '$.params.fire.projectile', 1, 1000),
      },
    };
  };

  const triggers: string[] = [];
  if (Array.isArray(jump['triggers'])) {
    jump['triggers'].forEach((value: unknown, index: number) => {
      if (typeof value === 'string' && env.actions.includes(value)) triggers.push(value);
      else c.fail(`$.params.jump.triggers[${index}]`, `неизвестное действие ${JSON.stringify(value)}`);
    });
  } else {
    c.fail('$.params.jump.triggers', 'ожидался массив действий');
  }

  const table: number[] = [];
  if (Array.isArray(jump['table']) && jump['table'].length > 0) {
    jump['table'].forEach((value: unknown, index: number) => {
      if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 4) table.push(value);
      else c.fail(`$.params.jump.table[${index}]`, `ожидалось целое от -4 до 4, получено ${JSON.stringify(value)}`);
    });
  } else {
    c.fail('$.params.jump.table', 'ожидался непустой массив целых (смещение по вертикали на фазу, «-» вверх)');
  }

  const params: RuleParams = {
    tickRateHz: c.int(p, 'tickRateHz', '$.params', 1, 240),
    move: {
      repeatDelayTicks: c.int(move, 'repeatDelayTicks', '$.params.move', 0, 1000),
      repeatIntervalTicks: c.int(move, 'repeatIntervalTicks', '$.params.move', 1, 1000),
    },
    jump: { triggers, table, stepTicks: c.int(jump, 'stepTicks', '$.params.jump', 1, 1000) },
    fall: { periodTicks: c.int(fall, 'periodTicks', '$.params.fall', 1, 1000) },
    fire: p['fire'] === null ? null : fireRules(),
    lives: c.int(p, 'lives', '$.params', 1, 99),
    timerLimitTicks: c.int(p, 'timerLimitTicks', '$.params', 0, 1_000_000),
    deathDelayTicks: c.int(p, 'deathDelayTicks', '$.params', 0, 10_000),
  };
  if (p['secret'] !== undefined) {
    const secret = c.record(p['secret'], '$.params.secret') ?? {};
    params.secret = { lives: c.int(secret, 'lives', '$.params.secret', 1, 999) };
  }
  if (p['timerUnitTicks'] !== undefined) {
    const unit = p['timerUnitTicks'];
    if (typeof unit === 'number' && Number.isFinite(unit) && unit >= 1 && unit <= 10_000) params.timerUnitTicks = unit;
    else c.fail('$.params.timerUnitTicks', `ожидалось число от 1 до 10000 (тактов в единице таймера), получено ${JSON.stringify(unit)}`);
  }
  const timerScope = p['timerScope'];
  if (timerScope === 'section' || timerScope === 'game') params.timerScope = timerScope;
  else if (timerScope !== undefined) {
    c.fail('$.params.timerScope', `ожидалось «section» или «game», получено ${JSON.stringify(timerScope)}`);
  }
  const bottomEdge = p['bottomEdge'];
  if (bottomEdge === 'pit' || bottomEdge === 'floor') params.bottomEdge = bottomEdge;
  else if (bottomEdge !== undefined) {
    c.fail('$.params.bottomEdge', `ожидалось «pit» или «floor», получено ${JSON.stringify(bottomEdge)}`);
  }

  const result: RuleSetDef = {
    schemaVersion: c.schemaVersion(rec, '$'),
    id: c.str(rec, 'id', '$', ID_PATTERN),
    status: c.status(rec, '$'),
    version: c.int(rec, 'version', '$', 1, 1_000_000),
    params,
  };
  c.done(source);
  return result;
}

// ── Уровень ────────────────────────────────────────────────────────────────

export function validateLevel(
  raw: unknown,
  assets: AssetCatalog,
  env: ValidationEnv,
  source = 'level',
): LevelDef {
  const c = new Checker();
  const rec = c.record(raw, '$');
  if (!rec) return c.abort(source);

  const checkAsset = (asset: string | null, path: string): void => {
    if (asset !== null && !(asset in assets.assets)) {
      c.fail(path, `ресурс «${asset}» не найден в каталоге «${assets.id}»`);
    }
  };

  const width = c.int(rec, 'width', '$', 1, MAX_LEVEL_SIZE);
  const height = c.int(rec, 'height', '$', 1, MAX_LEVEL_SIZE);

  // Легенда: символ → проходимость + рисунок.
  const legend: Record<string, LegendEntry> = {};
  const rawLegend = c.record(rec['legend'], '$.legend') ?? {};
  for (const [char, value] of Object.entries(rawLegend)) {
    const path = `$.legend["${char}"]`;
    if (char.length !== 1) c.fail(path, 'ключ легенды — ровно один символ (BMP)');
    const entry = c.record(value, path);
    if (!entry) continue;
    const collision = entry['collision'];
    if (collision !== 'empty' && collision !== 'solid') {
      c.fail(`${path}.collision`, `ожидалось «empty» или «solid», получено ${JSON.stringify(collision)}`);
    }
    const asset = entry['asset'] === undefined ? null : c.str(entry, 'asset', path);
    checkAsset(asset, `${path}.asset`);
    legend[char] = { collision: collision === 'solid' ? 'solid' : 'empty', asset };
  }

  // Статический слой.
  const rows: string[] = [];
  if (Array.isArray(rec['rows'])) {
    if (rec['rows'].length !== height) {
      c.fail('$.rows', `строк ${rec['rows'].length}, а height = ${height}`);
    }
    rec['rows'].forEach((row: unknown, y: number) => {
      if (typeof row !== 'string') {
        c.fail(`$.rows[${y}]`, 'ожидалась строка');
        return;
      }
      const cells = row.split('');
      if (cells.length !== width) c.fail(`$.rows[${y}]`, `длина ${cells.length}, а width = ${width}`);
      cells.forEach((char, x) => {
        if (!(char in legend)) c.fail(`$.rows[${y}][${x}]`, `символ «${char}» не описан в legend`);
      });
      rows.push(row);
    });
  } else {
    c.fail('$.rows', 'ожидался массив строк');
  }

  const isSolidAt = (x: number, y: number): boolean => {
    const char = rows[y]?.[x];
    return char !== undefined && legend[char]?.collision === 'solid';
  };

  // Старт.
  const startRec = c.record(rec['start'], '$.start') ?? {};
  const start = {
    x: c.int(startRec, 'x', '$.start', 0, Math.max(0, width - 1)),
    y: c.int(startRec, 'y', '$.start', 0, Math.max(0, height - 1)),
  };
  if (isSolidAt(start.x, start.y)) c.fail('$.start', `точка старта (${start.x}, ${start.y}) находится в занятой клетке`);

  // Объекты.
  const objects: ObjectDef[] = [];
  const objectIds = new Set<string>();
  const rawObjects = rec['objects'] === undefined ? [] : rec['objects'];
  if (!Array.isArray(rawObjects)) {
    c.fail('$.objects', 'ожидался массив объектов');
  } else {
    rawObjects.forEach((value: unknown, index: number) => {
      const path = `$.objects[${index}]`;
      const obj = c.record(value, path);
      if (!obj) return;
      const id = c.str(obj, 'id', path, ID_PATTERN);
      if (objectIds.has(id)) c.fail(`${path}.id`, `идентификатор «${id}» уже занят`);
      objectIds.add(id);

      const type = c.str(obj, 'type', path);
      const spec = env.objectTypes[type];
      if (!spec) {
        c.fail(`${path}.type`, `неизвестный тип «${type}», доступны: ${Object.keys(env.objectTypes).join(', ')}`);
      }

      const w = c.int(obj, 'w', path, 1, MAX_LEVEL_SIZE, 1);
      const h = c.int(obj, 'h', path, 1, MAX_LEVEL_SIZE, 1);
      const x = c.int(obj, 'x', path, 0, MAX_LEVEL_SIZE);
      const y = c.int(obj, 'y', path, 0, MAX_LEVEL_SIZE);
      if (x + w > width || y + h > height) {
        c.fail(path, `область (${x}, ${y}) ${w}×${h} выходит за карту ${width}×${height}`);
      }

      const asset = obj['asset'] === undefined ? null : c.str(obj, 'asset', path);
      checkAsset(asset, `${path}.asset`);

      const params: Params = {};
      const rawParams = obj['params'] === undefined ? {} : obj['params'];
      if (isRecord(rawParams)) {
        for (const [key, param] of Object.entries(rawParams)) {
          if (typeof param === 'number' || typeof param === 'string' || typeof param === 'boolean') {
            params[key] = param;
          } else {
            c.fail(`${path}.params.${key}`, 'параметр — число, строка или true/false');
          }
        }
      } else {
        c.fail(`${path}.params`, 'ожидался объект параметров');
      }
      spec?.validateParams?.(params, (message) => c.fail(`${path}.params`, message));

      objects.push({ id, type, x, y, w, h, asset, params });
    });
  }

  // Переходы.
  const transitions: Transition[] = [];
  const rawTransitions = rec['transitions'] === undefined ? [] : rec['transitions'];
  if (!Array.isArray(rawTransitions)) {
    c.fail('$.transitions', 'ожидался массив переходов');
  } else {
    const seenFrom = new Set<string>();
    rawTransitions.forEach((value: unknown, index: number) => {
      const path = `$.transitions[${index}]`;
      const tr = c.record(value, path);
      if (!tr) return;
      const from = c.str(tr, 'from', path);
      if (!objectIds.has(from)) c.fail(`${path}.from`, `объект «${from}» не найден среди objects`);
      if (seenFrom.has(from)) c.fail(`${path}.from`, `для «${from}» уже есть переход`);
      seenFrom.add(from);
      const to = tr['to'];
      if (to !== null && (typeof to !== 'string' || to === '')) {
        c.fail(`${path}.to`, 'ожидался id уровня или null (конец игры)');
      }
      transitions.push({ from, to: typeof to === 'string' ? to : null });
    });
  }
  // Объекты, которым переход обязателен (колодец): без него в них нечего «проваливаться».
  for (const obj of objects) {
    if (env.objectTypes[obj.type]?.requiresTransition && !transitions.some((tr) => tr.from === obj.id && tr.to !== null)) {
      c.fail('$.transitions', `для объекта «${obj.id}» (тип «${obj.type}») нужен переход в другой уровень`);
    }
  }

  // Исследовательские пометки (необязательны).
  const marks: LevelMark[] = [];
  const markIds = new Set<string>();
  const rawMarks = rec['marks'] === undefined ? [] : rec['marks'];
  if (!Array.isArray(rawMarks)) {
    c.fail('$.marks', 'ожидался массив пометок');
  } else {
    rawMarks.forEach((value: unknown, index: number) => {
      const path = `$.marks[${index}]`;
      const mark = c.record(value, path);
      if (!mark) return;
      const markId = c.str(mark, 'id', path, ID_PATTERN);
      if (markIds.has(markId)) c.fail(`${path}.id`, `идентификатор «${markId}» уже занят`);
      markIds.add(markId);
      const w = c.int(mark, 'w', path, 1, MAX_LEVEL_SIZE, 1);
      const h = c.int(mark, 'h', path, 1, MAX_LEVEL_SIZE, 1);
      const x = c.int(mark, 'x', path, 0, MAX_LEVEL_SIZE);
      const y = c.int(mark, 'y', path, 0, MAX_LEVEL_SIZE);
      if (x + w > width || y + h > height) {
        c.fail(path, `область (${x}, ${y}) ${w}×${h} выходит за карту ${width}×${height}`);
      }
      const status = mark['status'];
      if (status !== 'unknown' && status !== 'assumed' && status !== 'confirmed') {
        c.fail(`${path}.status`, `ожидалось «unknown», «assumed» или «confirmed», получено ${JSON.stringify(status)}`);
      }
      const note = mark['note'] === undefined ? '' : mark['note'];
      if (typeof note !== 'string' || note.length > MAX_MARK_NOTE) {
        c.fail(`${path}.note`, `заметка — строка не длиннее ${MAX_MARK_NOTE} символов`);
      }
      const ref = mark['ref'] === undefined ? '' : mark['ref'];
      if (typeof ref !== 'string' || ref.length > MAX_MARK_REF) {
        c.fail(`${path}.ref`, `ссылка на референс — строка не длиннее ${MAX_MARK_REF} символов`);
      }
      marks.push({
        id: markId,
        x,
        y,
        w,
        h,
        status: status === 'assumed' || status === 'confirmed' ? status : 'unknown',
        note: typeof note === 'string' ? note : '',
        ref: typeof ref === 'string' ? ref : '',
      });
    });
  }

  const id = c.str(rec, 'id', '$', ID_PATTERN);
  const level: LevelDef = {
    schemaVersion: c.schemaVersion(rec, '$'),
    id,
    status: c.status(rec, '$'),
    hudLabel: c.str(rec, 'hudLabel', '$', HUD_LABEL_PATTERN, id.toUpperCase().slice(0, 8)),
    note: typeof rec['note'] === 'string' ? rec['note'] : '',
    width,
    height,
    legend,
    rows,
    start,
    objects,
    transitions,
    marks,
  };
  c.done(source);
  return level;
}

// ── Манифест и сборка пакета ───────────────────────────────────────────────

export function validatePackManifest(raw: unknown, source = 'manifest'): PackManifest {
  const c = new Checker();
  const rec = c.record(raw, '$');
  if (!rec) return c.abort(source);

  const levels: string[] = [];
  if (Array.isArray(rec['levels']) && rec['levels'].length > 0) {
    rec['levels'].forEach((value: unknown, index: number) => {
      if (typeof value === 'string' && value !== '') levels.push(value);
      else c.fail(`$.levels[${index}]`, 'ожидался путь к файлу уровня');
    });
  } else {
    c.fail('$.levels', 'ожидался непустой массив путей к файлам уровней');
  }
  const sprites = c.record(rec['sprites'], '$.sprites') ?? {};
  const animations = rec['animations'] === undefined ? undefined : c.str(rec, 'animations', '$');

  const manifest: PackManifest = {
    schemaVersion: c.schemaVersion(rec, '$'),
    id: c.str(rec, 'id', '$', ID_PATTERN),
    title: c.str(rec, 'title', '$'),
    status: c.status(rec, '$'),
    version: c.int(rec, 'version', '$', 1, 1_000_000),
    screen: c.str(rec, 'screen', '$'),
    rules: c.str(rec, 'rules', '$'),
    assets: c.str(rec, 'assets', '$'),
    levels,
    firstLevel: c.str(rec, 'firstLevel', '$'),
    sprites: {
      hero: c.str(sprites, 'hero', '$.sprites'),
      projectile: sprites['projectile'] === undefined ? null : c.str(sprites, 'projectile', '$.sprites'),
      life: c.str(sprites, 'life', '$.sprites'),
    },
  };
  if (animations !== undefined) manifest.animations = animations;
  c.done(source);
  return manifest;
}

// ── Анимации ───────────────────────────────────────────────────────────────

export const MAX_ANIMATION_TICKS = 1000;
export const MAX_ROUTE_CELLS = 2048;
export const MAX_ENTRY_STEPS = 64;
export const MAX_ENTRY_TICKS = 2000;

export function validateAnimations(raw: unknown, source = 'animations', env?: ValidationEnv): AnimationsDef {
  const c = new Checker();
  const rec = c.record(raw, '$');
  if (!rec) return c.abort(source);

  let bump: AnimationsDef['bump'] = null;
  if (rec['bump'] !== undefined && rec['bump'] !== null) {
    const b = c.record(rec['bump'], '$.bump') ?? {};
    bump = { ticks: c.int(b, 'ticks', '$.bump', 1, MAX_ANIMATION_TICKS) };
  }

  let intro: IntroAnimation | null = null;
  if (rec['intro'] !== undefined && rec['intro'] !== null) {
    const i = c.record(rec['intro'], '$.intro') ?? {};
    const ticks = (key: string, min: number): number => c.int(i, key, '$.intro', min, MAX_ANIMATION_TICKS);
    const coverage = i['coverage'];
    if (typeof coverage !== 'number' || !(coverage >= 0 && coverage <= 1)) {
      c.fail('$.intro.coverage', `ожидалось число от 0 до 1, получено ${JSON.stringify(coverage)}`);
    }
    const routes: Record<string, CellPos[]> = {};
    const rawRoutes = i['routes'] === undefined ? {} : (c.record(i['routes'], '$.intro.routes') ?? {});
    for (const [levelId, value] of Object.entries(rawRoutes)) {
      const path = `$.intro.routes["${levelId}"]`;
      if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROUTE_CELLS) {
        c.fail(path, `ожидался непустой массив клеток [x, y] (не более ${MAX_ROUTE_CELLS})`);
        continue;
      }
      const cells: CellPos[] = [];
      value.forEach((cell: unknown, index: number) => {
        const ok =
          Array.isArray(cell) &&
          cell.length === 2 &&
          cell.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < MAX_LEVEL_SIZE);
        if (ok) cells.push({ x: (cell as number[])[0] as number, y: (cell as number[])[1] as number });
        else c.fail(`${path}[${index}]`, `ожидалась клетка [x, y] — два целых от 0 до ${MAX_LEVEL_SIZE - 1}`);
      });
      routes[levelId] = cells;
    }
    intro = {
      blankTicks: ticks('blankTicks', 0),
      fillTicks: ticks('fillTicks', 1),
      holdTicks: ticks('holdTicks', 0),
      dissolveTicks: ticks('dissolveTicks', 1),
      emptyTicks: ticks('emptyTicks', 0),
      coverage: typeof coverage === 'number' ? coverage : 0,
      stepTicks: ticks('stepTicks', 1),
      routes,
    };
  }

  let entry: AnimationsDef['entry'] = null;
  if (rec['entry'] !== undefined && rec['entry'] !== null) {
    const e = c.record(rec['entry'], '$.entry') ?? {};
    const rawScripts = e['scripts'] === undefined ? {} : (c.record(e['scripts'], '$.entry.scripts') ?? {});
    const scripts: Record<string, EntryStep[]> = {};
    const actions = (path: string, value: unknown): string[] => {
      if (value === undefined) return [];
      if (!Array.isArray(value)) {
        c.fail(path, 'ожидался массив действий');
        return [];
      }
      const out: string[] = [];
      value.forEach((name: unknown, index: number) => {
        const known = typeof name === 'string' && (env ? env.actions.includes(name) : true);
        if (known) out.push(name as string);
        else c.fail(`${path}[${index}]`, `неизвестное действие ${JSON.stringify(name)}`);
      });
      return out;
    };
    for (const [levelId, value] of Object.entries(rawScripts)) {
      const path = `$.entry.scripts["${levelId}"]`;
      if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ENTRY_STEPS) {
        c.fail(path, `ожидался непустой массив шагов (не более ${MAX_ENTRY_STEPS})`);
        continue;
      }
      let total = 0;
      const steps: EntryStep[] = [];
      value.forEach((step: unknown, index: number) => {
        const where = `${path}[${index}]`;
        const s = c.record(step, where) ?? {};
        const ticks = c.int(s, 'ticks', where, 1, MAX_ANIMATION_TICKS);
        total += ticks;
        steps.push({ ticks, held: actions(`${where}.held`, s['held']), press: actions(`${where}.press`, s['press']) });
      });
      if (total > MAX_ENTRY_TICKS) c.fail(path, `сценарий длиннее ${MAX_ENTRY_TICKS} тактов`);
      scripts[levelId] = steps;
    }
    entry = { scripts };
  }

  const result: AnimationsDef = {
    schemaVersion: c.schemaVersion(rec, '$'),
    id: c.str(rec, 'id', '$', ID_PATTERN),
    status: c.status(rec, '$'),
    bump,
    intro,
    entry,
  };
  c.done(source);
  return result;
}

/** Файлы пакета, уже разобранные из JSON (до валидации). */
export interface RawPack {
  manifest: unknown;
  screen: unknown;
  rules: unknown;
  assets: unknown;
  levels: unknown[];
  /** Файл анимаций, если манифест его объявляет. */
  animations?: unknown;
}

/** Проверяет все части пакета и ссылки между ними. Бросает ContentError. */
export function assemblePack(raw: RawPack, env: ValidationEnv): ContentPack {
  const manifest = validatePackManifest(raw.manifest);
  const screen = validateScreenProfile(raw.screen, manifest.screen);
  const rules = validateRuleSet(raw.rules, env, manifest.rules);
  const assets = validateAssetCatalog(raw.assets, env, manifest.assets);

  if (raw.levels.length !== manifest.levels.length) {
    throw new ContentError('manifest', [
      `в манифесте ${manifest.levels.length} файлов уровней, загружено ${raw.levels.length}`,
    ]);
  }
  const levels = raw.levels.map((level, index) =>
    validateLevel(level, assets, env, manifest.levels[index] ?? `levels[${index}]`),
  );
  if ((manifest.animations !== undefined) !== (raw.animations !== undefined)) {
    throw new ContentError('manifest', ['файл анимаций объявлен в манифесте и загружен не одинаково']);
  }
  const animations =
    manifest.animations !== undefined ? validateAnimations(raw.animations, manifest.animations, env) : undefined;

  const issues: string[] = [];
  const levelIds = new Set<string>();
  for (const level of levels) {
    if (levelIds.has(level.id)) issues.push(`уровень «${level.id}» объявлен дважды`);
    levelIds.add(level.id);
  }
  if (!levelIds.has(manifest.firstLevel)) {
    issues.push(`firstLevel «${manifest.firstLevel}» не найден среди уровней`);
  }
  for (const level of levels) {
    for (const tr of level.transitions) {
      if (tr.to !== null && !levelIds.has(tr.to)) {
        issues.push(`уровень «${level.id}»: переход из «${tr.from}» ведёт в несуществующий уровень «${tr.to}»`);
      }
    }
  }
  for (const levelId of Object.keys(animations?.entry?.scripts ?? {})) {
    if (!levelIds.has(levelId)) issues.push(`animations.entry.scripts["${levelId}"]: уровень «${levelId}» не найден в пакете`);
  }
  if (animations?.intro) {
    for (const [levelId, route] of Object.entries(animations.intro.routes)) {
      const level = levels.find((l) => l.id === levelId);
      const where = `animations.intro.routes["${levelId}"]`;
      if (!level) {
        issues.push(`${where}: уровень «${levelId}» не найден в пакете`);
        continue;
      }
      const seen = new Set<string>();
      route.forEach((cell, index) => {
        if (cell.x >= level.width || cell.y >= level.height) {
          issues.push(`${where}[${index}]: клетка ${cell.x},${cell.y} вне карты ${level.width}×${level.height}`);
        }
        const key = `${cell.x},${cell.y}`;
        if (seen.has(key)) issues.push(`${where}[${index}]: клетка ${key} уже есть в маршруте`);
        seen.add(key);
        const prev = route[index - 1];
        if (prev && Math.abs(prev.x - cell.x) + Math.abs(prev.y - cell.y) !== 1) {
          issues.push(`${where}[${index}]: шаг ${prev.x},${prev.y} → ${key} должен быть на одну клетку по стороне`);
        }
      });
      const last = route[route.length - 1];
      if (last && (last.x !== level.start.x || last.y !== level.start.y)) {
        issues.push(
          `${where}: маршрут должен заканчиваться в точке старта уровня (${level.start.x},${level.start.y}), а не в ${last.x},${last.y}`,
        );
      }
    }
  }
  for (const [role, assetId] of Object.entries(manifest.sprites)) {
    if (assetId !== null && !(assetId in assets.assets)) {
      issues.push(`sprites.${role}: ресурс «${assetId}» не найден в каталоге «${assets.id}»`);
    }
  }
  const needAsset = (assetId: string, where: string): void => {
    if (!(assetId in assets.assets)) issues.push(`${where}: ресурс «${assetId}» не найден в каталоге «${assets.id}»`);
  };
  if (screen.ghost) needAsset(screen.ghost.asset, 'screen.ghost.asset');
  const { hud } = screen;
  if (hud.kind === 'lcd') {
    needAsset(hud.lives.asset, 'screen.hud.lives.asset');
    for (const [char, assetId] of Object.entries(hud.font.glyphs)) needAsset(assetId, `screen.hud.font.glyphs["${char}"]`);
    if (hud.font.ghost) needAsset(hud.font.ghost, 'screen.hud.font.ghost');
    if (hud.fixed) {
      const label = hud.fixed.label;
      const score = String(hud.fixed.score).padStart(hud.score.slots, '0');
      if (label.length > hud.label.slots) {
        issues.push(`screen.hud.fixed.label: «${label}» длиннее числа позиций (${hud.label.slots})`);
      }
      if (score.length > hud.score.slots) {
        issues.push(`screen.hud.fixed.score: ${hud.fixed.score} не помещается в ${hud.score.slots} позиций`);
      }
      for (const char of `${label}${score}`) {
        if (!(char in hud.font.glyphs)) issues.push(`screen.hud.fixed: символа «${char}» нет в шрифте HUD`);
      }
    }
  }
  if (issues.length > 0) throw new ContentError(manifest.id, issues);

  return animations ? { manifest, screen, rules, assets, levels, animations } : { manifest, screen, rules, assets, levels };
}
