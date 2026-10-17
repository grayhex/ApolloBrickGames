import { LibraryGame, action, heldAction, put } from './common';
import type { BrickGameOptions, BrickInput } from '../../types';

/** Препятствие, бонус или стена на дороге: `kind` 0 — машина, 1 и 2 — бонусы (дальняя и ближняя атака), −1 — стена во всю ширину. */
export interface RoadObstacle {
  x: number;
  y: number;
  kind: number;
}
type RoadId = 'obstacle-race' | 'boat-racing' | 'racing-four' | 'super-tank' | 'racing-pickup' | 'punch-racing';
/** Клетка спрайта: смещение от опорной точки и яркость (1 горит, 2 мигает). */
type Pixel = readonly [dx: number, dy: number, value: number];

/**
 * Геометрия дороги: один источник и для рисунка, и для столкновений — у спрайтов, которые игрок видит, нет «невидимых» зон и нет проходов сквозь клетки.
 * Игрок стоит на строках 17–19 (опорная точка — нос); машина-препятствие — от своей верхней клетки. Узкие спрайты (одна колонка) у четырёх полос:
 * полосы стоят через одну колонку (1, 3, 5, 7), и машины шириной три клетки соседних полос перекрывали бы друг друга.
 */
export const ROAD_PLAYER_ROW = 17;
const PLAYER_WIDE: readonly Pixel[] = [[0, 0, 2], [0, 1, 1], [-1, 2, 1], [1, 2, 1]];
const PLAYER_SLIM: readonly Pixel[] = [[0, 0, 2], [0, 1, 1], [0, 2, 1]];
const CAR_WIDE: readonly Pixel[] = [[0, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1]];
const CAR_SLIM: readonly Pixel[] = [[0, 0, 1], [0, 1, 1], [0, 2, 1]];
const BONUS_GUN: readonly Pixel[] = [[0, 0, 2], [0, 1, 2]];
const BONUS_PUNCH: readonly Pixel[] = [[0, 0, 2], [0, 1, 2], [0, 2, 2]];
/** Ширина стены дорожного барьера — всё поле: обойти нельзя, разрушить можно только выстрелом. */
const WALL: readonly Pixel[] = Array.from({ length: 20 }, (_, i): Pixel => [i % 10, Math.floor(i / 10), 1]);
/** Полоса дороги шириной в коридор: стенки по краям, свободны колонки между ними. */
export const ROAD_CORRIDOR = 6;
const ROAD_LEFT_MAX = 3;
const cellKey = (x: number, y: number): number => y * 10 + x;

export function roadPlayerPixels(slim: boolean, x: number): { x: number; y: number; value: number }[] {
  return (slim ? PLAYER_SLIM : PLAYER_WIDE).map(([dx, dy, value]) => ({ x: x + dx, y: ROAD_PLAYER_ROW + dy, value }));
}
export function roadObstaclePixels(slim: boolean, o: RoadObstacle): { x: number; y: number; value: number }[] {
  const sprite = o.kind < 0 ? WALL : o.kind === 1 ? BONUS_GUN : o.kind === 2 ? BONUS_PUNCH : slim ? CAR_SLIM : CAR_WIDE;
  return sprite.map(([dx, dy, value]) => ({ x: (o.kind < 0 ? 0 : o.x) + dx, y: o.y + dy, value }));
}

export class RoadGame extends LibraryGame {
  readonly id: RoadId;
  x = 4; road = Array<number>(20).fill(2); obstacles: RoadObstacle[] = []; shots: { x: number; y: number }[] = [];
  /** Последнее подобранное оружие (1 — дальняя атака, 2 — ближняя) и признак, что дальняя атака уже была выдана: стены появляются только после неё. */
  weapon = 0; hasGun = false; private timer = 0; private cooldown = 0; private passed = 0;
  constructor(id: RoadGame['id'], o: BrickGameOptions = {}) { super(o); this.id = id; this.init(); }
  protected reset(): void { this.setLives(4); this.passed = 0; this.weapon = 0; this.hasGun = false; this.setup(); }
  private setup(): void { this.x = 4; this.road.fill(2); this.obstacles = []; this.shots = []; this.timer = 0; this.cooldown = 0; this.repeat.reset(); }
  private get slim(): boolean { return this.id === 'racing-four'; }
  private get canShoot(): boolean { return this.id === 'super-tank' || this.id === 'racing-pickup' && (this.weapon === 1 || this.hasGun); }
  private get canPunch(): boolean { return this.id === 'punch-racing' || this.id === 'racing-pickup' && this.weapon === 2; }
  private obstacleKeys(o: RoadObstacle): Set<number> { return new Set(roadObstaclePixels(this.slim, o).filter((c) => c.x >= 0 && c.x < 10).map((c) => cellKey(c.x, c.y))); }
  /** Выстрелы попадают в клетку препятствия (машина или стена); бонус выстрел не задевает. */
  private resolveShots(): void {
    for (const s of this.shots) {
      const hit = this.obstacles.find((o) => o.kind <= 0 && this.obstacleKeys(o).has(cellKey(s.x, s.y)));
      if (hit) { this.obstacles.splice(this.obstacles.indexOf(hit), 1); s.y = -1; this.addScore(10); this.emit({ type: 'hit' }); }
    }
    this.shots = this.shots.filter((s) => s.y >= 0);
  }
  /** Ближний удар: машины, клетки которых лежат в трёх клетках перед носом (строки 14–16, колонки x−1…x+1); стену он не разрушает. */
  private punch(): void {
    this.obstacles = this.obstacles.filter((o) => {
      if (o.kind !== 0) return true;
      const near = roadObstaclePixels(this.slim, o).some((c) => c.y >= 14 && c.y <= 16 && Math.abs(c.x - this.x) <= 1);
      if (near) { this.addScore(10); this.emit({ type: 'hit' }); }
      return !near;
    });
  }
  protected update(input: BrickInput): void {
    if (this.id === 'racing-four' || this.id === 'boat-racing') {
      const lanes = this.id === 'racing-four' ? [1,3,5,7] : [1,4,7];
      const index = Math.max(0, lanes.indexOf(this.x)); this.x = lanes[this.horizontal(input, index, lanes.length - 1)]!;
    } else this.x = this.horizontal(input, this.x, 8);
    if (this.cooldown) this.cooldown--;
    if (heldAction(input) && !this.cooldown) {
      this.cooldown = 12;
      if (this.canShoot) { this.shots.push({ x: this.x, y: 16 }); this.emit({ type: 'shot' }); }
      if (this.canPunch) this.punch();
    }
    this.timer++;
    if (this.timer % 3 === 0) { for (const s of this.shots) s.y--; this.resolveShots(); }
    if (this.timer % (input.held.has('up') ? 5 : this.period(25, 7)) === 0) {
      if (this.id === 'obstacle-race') { const next = Math.max(0, Math.min(ROAD_LEFT_MAX, this.road[0]! + this.rng.range(-1, 1))); this.road.unshift(next); this.road.pop(); }
      for (const p of this.obstacles) p.y++;
      this.resolveShots(); // препятствие, шагнувшее в клетку выстрела, считается пойманным выстрелом
      this.obstacles = this.obstacles.filter((p) => { if (p.y <= 20) return true; this.addScore(1); this.passed++; return false; });
      if (this.id !== 'obstacle-race' && (!this.obstacles.length || this.obstacles.at(-1)!.y >= 6)) {
        const lanes = this.id === 'racing-four' ? [1,3,5,7] : [1,4,7];
        let kind = this.id === 'racing-pickup' && this.rng.chance(0.4) ? this.rng.range(1,2) : this.id === 'racing-pickup' && this.rng.chance(0.3) ? -1 : 0;
        // Стена разрушается только выстрелом: пока дальнее оружие не выдано, вместо стены — обычная машина (неизбежной потери жизни нет).
        if (kind < 0 && !this.hasGun) kind = 0;
        this.obstacles.push({ x: this.rng.pick(lanes), y: 0, kind });
      }
      if (this.id === 'obstacle-race') { this.addScore(1); this.passed++; }
    }
    const mine = new Set(roadPlayerPixels(this.slim, this.x).map((c) => cellKey(c.x, c.y)));
    if (this.id === 'obstacle-race' && [17, 18, 19].some((y) => mine.has(cellKey(this.road[y]!, y)) || mine.has(cellKey(this.road[y]! + ROAD_CORRIDOR, y)) || this.outside(y))) { this.lose(() => this.setup()); return; }
    let crashed = false;
    for (const o of [...this.obstacles]) {
      if (![...this.obstacleKeys(o)].some((key) => mine.has(key))) continue;
      if (o.kind > 0) { this.weapon = o.kind; if (o.kind === 1) this.hasGun = true; this.obstacles.splice(this.obstacles.indexOf(o), 1); this.emit({ type: 'bonus' }); }
      else crashed = true;
    }
    if (crashed) { this.lose(() => this.setup()); return; }
    if (this.passed >= 30) { this.passed = 0; this.win(() => this.setup()); }
  }
  /** Игрок вышел за край поля на строке `y` (клетка с отрицательной колонкой или правее девятой): у трассы это тоже съезд с дороги. */
  private outside(y: number): boolean { return roadPlayerPixels(this.slim, this.x).some((c) => c.y === y && (c.x < 0 || c.x > 9)); }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200);
    if (this.id === 'obstacle-race') this.road.forEach((x, y) => { put(out, x, y); put(out, x + ROAD_CORRIDOR, y); });
    else for (let y = 0; y < 20; y += 2) { put(out, 0, y); put(out, 9, y); }
    for (const p of this.obstacles) for (const c of roadObstaclePixels(this.slim, p)) put(out, c.x, c.y, c.value);
    for (const c of roadPlayerPixels(this.slim, this.x)) put(out, c.x, c.y, c.value);
    for (const s of this.shots) put(out, s.x, s.y); return out;
  }
}

/** Нижняя строка, до которой доходит строй в игре с ответным огнём. Пуля игрока рождается в строке 17 и проверяется после сдвига вверх, поэтому строй останавливается строкой выше: иначе его нижний ряд нельзя было бы подстрелить. */
const TALKING_LOWEST_ROW = 16;

export class ShooterGame extends LibraryGame {
  readonly id: 'honeybee' | 'space-invaders' | 'ufo-raiders' | 'dual-shooting' | 'talking-shooting' | 'tetris-shooting' | 'meteor-fighter';
  x = 4; targets: { x: number; y: number }[] = []; bullets: { x: number; y: number; enemy: boolean }[] = [];
  private timer = 0; private cooldown = 0; private directionNow = 1; bossHP = 0; health = 3; private protectedUfo: { x: number; y: number } | null = null; private bossStage = false; private hazard = { x:9, y:0 }; private takeoff = 0;
  constructor(id: ShooterGame['id'], o: BrickGameOptions = {}) { super(o); this.id = id; this.init(); }
  protected reset(): void { this.setLives(4); this.setup(); }
  private setup(): void {
    this.x = 4; this.health = 3; this.timer = this.cooldown = 0; this.bullets = []; this.directionNow = 1; this.bossHP = this.id === 'dual-shooting' || this.id === 'meteor-fighter' ? 10 + this.level : 0; this.takeoff = this.id === 'meteor-fighter' ? 60 : 0;
    this.targets = []; this.bossStage = false; this.hazard = { x:9, y:0 };
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 7; x++) if (this.id !== 'honeybee' || (x + y) % 3 !== 0) this.targets.push({ x, y });
    if (this.id === 'tetris-shooting') this.targets = [{x:2,y:2},{x:3,y:2},{x:4,y:2},{x:3,y:3},{x:6,y:5},{x:6,y:6},{x:6,y:7},{x:7,y:7}];
    if (this.id === 'meteor-fighter') this.targets = [{x:4,y:2},{x:3,y:3},{x:4,y:3},{x:5,y:3},{x:2,y:4},{x:3,y:4},{x:4,y:4},{x:5,y:4},{x:6,y:4}];
    this.protectedUfo = this.id === 'ufo-raiders' ? this.targets[0]! : null;
    this.repeat.reset();
  }
  protected update(input: BrickInput): void {
    this.x = this.horizontal(input, this.x, 8);
    if (this.takeoff > 0) { this.takeoff--; return; }
    if (this.cooldown) this.cooldown--;
    if (heldAction(input) && !this.cooldown) { this.cooldown = 10; this.bullets.push({ x: this.x, y: 17, enemy: false }); if (this.id === 'dual-shooting') this.bullets.push({ x: this.x + 1, y: 17, enemy: false }); this.emit({ type: 'shot' }); }
    this.timer++;
    if (this.timer % 4 === 0) {
      for (const b of this.bullets) {
        b.y += b.enemy ? 1 : -1;
        if (!b.enemy) {
          const index = this.targets.findIndex((p) => p.x === b.x && p.y === b.y);
          if (index >= 0) {
            if (this.id === 'ufo-raiders' && this.targets[index] === this.protectedUfo) { this.lose(() => this.setup()); return; }
            if (this.bossHP > 0) { this.bossHP--; if (!this.bossHP) this.targets = []; } else this.targets.splice(index, 1);
            b.y = -1; this.addScore(5); this.emit({ type: 'hit' });
          }
        } else if (b.y >= 18 && b.y <= 19 && Math.abs(b.x - this.x) <= 1) {
          b.y = 20; if (--this.health <= 0 || this.id !== 'dual-shooting' && this.id !== 'meteor-fighter') { this.lose(() => this.setup()); return; }
        }
      }
      this.bullets = this.bullets.filter((b) => b.y >= 0 && b.y < 20);
    }
    if (!this.targets.length || this.id === 'ufo-raiders' && this.targets.length === 1 && this.targets[0] === this.protectedUfo) {
      if (this.id === 'space-invaders' && !this.bossStage) { this.bossStage = true; this.bossHP = 8 + this.level; this.targets = [{x:3,y:2},{x:4,y:2},{x:5,y:2},{x:4,y:3}]; }
      else { this.win(() => this.setup()); return; }
    }
    if (this.id === 'tetris-shooting' && this.timer % this.period(45, 16) === 0) {
      if (--this.hazard.x < 0) { this.hazard.x = 9; this.hazard.y++; }
      if (this.hazard.y >= 18) { this.lose(() => this.setup()); return; }
    }
    if (this.timer % this.period(90, 25) === 0) {
      const enemy = this.rng.pick(this.targets); this.bullets.push({ x: enemy.x, y: enemy.y + 1, enemy: true });
    }
    if (this.timer % this.period(45, 16) === 0 && this.id !== 'honeybee' && this.id !== 'dual-shooting' && this.id !== 'meteor-fighter') {
      if (this.targets.some((p) => p.x + this.directionNow < 0 || p.x + this.directionNow > 9)) {
        this.directionNow *= -1;
        // «Говорящая» стрельба: строй идёт вниз целиком и останавливается над пушкой по общей нижней границе (клетки не склеиваются и не меняют форму).
        const step = this.id !== 'talking-shooting' || Math.max(...this.targets.map((p) => p.y)) + 1 <= TALKING_LOWEST_ROW ? 1 : 0;
        for (const p of this.targets) p.y += step;
      } else for (const p of this.targets) p.x += this.directionNow;
      if (this.targets.some((p) => p.y >= 18)) { this.lose(() => this.setup()); return; }
    }
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); this.targets.forEach((p) => put(out, p.x, p.y, this.id === 'ufo-raiders' && p === this.protectedUfo ? 2 : 1)); for (const b of this.bullets) put(out, b.x, b.y, b.enemy ? 2 : 1); put(out, this.x, 17 + Math.ceil(this.takeoff/30), 2); for (let dx = -1; dx <= 1; dx++) put(out, this.x + dx, 18); if (this.id === 'tetris-shooting') put(out,this.hazard.x,this.hazard.y,2); if (this.id === 'dual-shooting' || this.id === 'meteor-fighter' || this.bossStage) { for (let i = 0; i < Math.min(10, this.bossHP); i++) put(out, i, 0); for (let i = 0; i < this.health; i++) put(out, i, 19, 2); } return out; }
}

export class BallGame extends LibraryGame {
  readonly id: 'pong' | 'pong-double' | 'pneumatic-ball' | 'arkanoid-dots';
  x = 3; guard = 3; balls: { x: number; y: number; dx: number; dy: number }[] = []; bricks = new Set<number>(); dots = new Set<number>(); private timer = 0; private guardDirection = 1; private goals = 0;
  constructor(id: BallGame['id'], o: BrickGameOptions = {}) { super(o); this.id = id; this.init(); }
  protected reset(): void { this.setLives(4); this.goals = 0; this.setup(); }
  private setup(): void {
    this.x = this.guard = 3; this.timer = 0; this.guardDirection = 1; this.bricks.clear(); this.dots.clear(); this.repeat.reset();
    this.balls = [{ x: 4, y: 17, dx: 1, dy: -1 }]; if (this.id === 'pong-double') this.balls.push({ x: 5, y: 14, dx: -1, dy: -1 });
    if (this.id === 'pong') for (let y = 8; y <= 9; y++) for (let x = 2; x <= 7; x++) this.bricks.add(y * 10 + x);
    if (this.id === 'arkanoid-dots') { for (let y = 3; y <= 6; y++) for (let x = 1; x <= 8; x++) this.bricks.add(y * 10 + x); this.dots.add(12); this.dots.add(17); }
  }
  protected update(input: BrickInput): void {
    this.x = this.horizontal(input, this.x, 7); this.timer++;
    if (this.id === 'pneumatic-ball' && !this.balls.length && heldAction(input)) this.balls.push({ x: this.x + 1, y: 17, dx: 0, dy: -1 });
    if (this.timer % this.period(20, 6)) return;
    this.guard += this.guardDirection; if (this.guard <= 0 || this.guard >= 7) this.guardDirection *= -1;
    for (const ball of this.balls) {
      let xx = ball.x + ball.dx, yy = ball.y + ball.dy;
      if (xx < 0 || xx > 9) { ball.dx *= -1; xx = ball.x + ball.dx; }
      const cell = yy * 10 + xx;
      if (this.bricks.delete(cell)) { this.addScore(5); ball.dy *= -1; yy = ball.y + ball.dy; this.emit({ type: 'hit' }); }
      if (!this.bricks.size && this.dots.delete(cell)) { this.addScore(25); ball.dy *= -1; yy = ball.y + ball.dy; }
      if (yy <= 1) {
        if (this.id === 'arkanoid-dots') { ball.dy = 1; yy = 2; }
        else if (xx >= this.guard && xx < this.guard + 3) { ball.dy = 1; yy = 2; }
        else { this.addScore(10); this.goals++; ball.y = 21; continue; }
      }
      if (yy >= 18 && ball.dy > 0) {
        if (xx >= this.x && xx < this.x + 3) { ball.dy = -1; ball.dx = xx === this.x ? -1 : xx === this.x + 2 ? 1 : (heldAction(input) ? -ball.dx || 1 : ball.dx || 1); yy = 17; }
        else { ball.y = 21; if (this.id !== 'pneumatic-ball') { this.lose(() => this.setup()); return; } continue; }
      }
      ball.x = xx; ball.y = yy;
    }
    this.balls = this.balls.filter((b) => b.y < 20);
    if (this.id === 'arkanoid-dots' && !this.bricks.size && !this.dots.size || this.goals >= 5) { this.goals = 0; this.win(() => this.setup()); }
    else if (!this.balls.length && this.id !== 'pneumatic-ball') this.balls.push({ x: this.x + 1, y: 17, dx: 1, dy: -1 });
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); for (const p of this.bricks) out[p] = 1; for (const p of this.dots) out[p] = 2; for (let dx = 0; dx < 3; dx++) { put(out, this.x + dx, 19); if (this.id !== 'arkanoid-dots') put(out, this.guard + dx, 0); } for (const b of this.balls) put(out, b.x, b.y, 2); return out; }
}

export class BowlingGame extends LibraryGame {
  readonly id = 'bowling'; x = 4; aim = 0; ball: { x: number; y: number } | null = null; pins = new Set<number>(); rolls: number[] = []; frame = 0; private first: number | null = null; private knocked = 0; private timer = 0;
  constructor(o: BrickGameOptions = {}) { super(o); this.init(); }
  protected reset(): void { this.x = 4; this.aim = 0; this.ball = null; this.rolls = []; this.frame = 0; this.first = null; this.rack(); this.repeat.reset(); }
  private rack(): void { this.pins.clear(); for (let y = 0; y < 4; y++) for (let n = 0; n <= y; n++) this.pins.add((5 - y) * 10 + 4 - y + n * 2); }
  protected update(input: BrickInput): void {
    if (!this.ball) { this.x = this.horizontal(input, this.x); if (input.pressed.has('up')) this.aim = Math.min(1, this.aim + 1); if (input.pressed.has('down')) this.aim = Math.max(-1, this.aim - 1); if (action(input)) { this.ball = { x: this.x, y: 18 }; this.knocked = 0; this.timer = 0; } return; }
    if (++this.timer % 5) return;
    this.ball.y--; if (this.ball.y % 5 === 0) this.ball.x += this.aim;
    const hit = [...this.pins].find((p) => Math.floor(p / 10) === this.ball!.y && Math.abs(p % 10 - this.ball!.x) <= 1);
    if (hit !== undefined) { const fallen = [...this.pins].filter((p) => Math.floor(p / 10) <= this.ball!.y && Math.abs(p % 10 - hit % 10) <= this.ball!.y - Math.floor(p / 10) + 1); for (const p of fallen) this.pins.delete(p); this.knocked += fallen.length; }
    if (this.ball.y > 0) return;
    this.rolls.push(this.knocked); this.addScore(this.knocked); this.ball = null;
    // Ten frames, pinfall scoring; strikes/spares are signalled, no undocumented bonus rule.
    if (this.first !== null || !this.pins.size) { if (!this.pins.size) this.emit({ type: 'bonus' }); this.first = null; this.frame++; this.rack(); } else this.first = this.knocked;
    if (this.frame >= 10) this.gameOver();
  }
  protected draw(): Uint8Array { const out = new Uint8Array(200); for (const p of this.pins) out[p] = 1; put(out, this.x, 19, 2); put(out, Math.max(0, Math.min(9, this.x + this.aim)), 17, 2); if (this.ball) put(out, this.ball.x, this.ball.y, 2); return out; }
}
