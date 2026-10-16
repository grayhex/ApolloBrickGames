import { LibraryGame, action, heldAction, put } from './common';
import type { BrickGameOptions, BrickInput } from '../../types';

export class RoadGame extends LibraryGame {
  readonly id: 'obstacle-race' | 'boat-racing' | 'racing-four' | 'super-tank' | 'racing-pickup' | 'punch-racing';
  x = 4; road = Array<number>(20).fill(2); obstacles: { x: number; y: number; kind: number }[] = []; shots: { x: number; y: number }[] = [];
  weapon = 0; private timer = 0; private cooldown = 0; private passed = 0;
  constructor(id: RoadGame['id'], o: BrickGameOptions = {}) { super(o); this.id = id; this.init(); }
  protected reset(): void { this.setLives(4); this.passed = 0; this.weapon = 0; this.setup(); }
  private setup(): void { this.x = 4; this.road.fill(2); this.obstacles = []; this.shots = []; this.timer = 0; this.cooldown = 0; this.repeat.reset(); }
  protected update(input: BrickInput): void {
    if (this.id === 'racing-four' || this.id === 'boat-racing') {
      const lanes = this.id === 'racing-four' ? [1,3,5,7] : [1,4,7];
      const index = Math.max(0, lanes.indexOf(this.x)); this.x = lanes[this.horizontal(input, index, lanes.length - 1)]!;
    } else this.x = this.horizontal(input, this.x, 8);
    if (this.cooldown) this.cooldown--;
    if (heldAction(input) && !this.cooldown) {
      this.cooldown = 12;
      if (this.id === 'super-tank' || this.id === 'racing-pickup' && this.weapon === 1) { this.shots.push({ x: this.x, y: 16 }); this.emit({ type: 'shot' }); }
      if (this.id === 'punch-racing' || this.id === 'racing-pickup' && this.weapon === 2) {
        this.obstacles = this.obstacles.filter((p) => { if (p.kind === 0 && p.y >= 14 && Math.abs(p.x - this.x) <= 1) { this.addScore(10); this.emit({ type: 'hit' }); return false; } return true; });
      }
    }
    this.timer++;
    if (this.timer % 3 === 0) for (const s of this.shots) {
      s.y--; const hit = this.obstacles.find((p) => p.kind <= 0 && p.y === s.y && (p.kind < 0 || Math.abs(p.x - s.x) <= 1));
      if (hit) { this.obstacles.splice(this.obstacles.indexOf(hit), 1); s.y = -1; this.addScore(10); }
    }
    this.shots = this.shots.filter((s) => s.y >= 0);
    if (this.timer % (input.held.has('up') ? 5 : this.period(25, 7)) === 0) {
      if (this.id === 'obstacle-race') { const next = Math.max(0, Math.min(4, this.road[0]! + this.rng.range(-1, 1))); this.road.unshift(next); this.road.pop(); }
      for (const p of this.obstacles) p.y++;
      this.obstacles = this.obstacles.filter((p) => { if (p.y <= 20) return true; this.addScore(1); this.passed++; return false; });
      if (this.id !== 'obstacle-race' && (!this.obstacles.length || this.obstacles.at(-1)!.y >= 6)) {
        const lanes = this.id === 'racing-four' ? [1,3,5,7] : [1,4,7];
        this.obstacles.push({ x: this.rng.pick(lanes), y: 0, kind: this.id === 'racing-pickup' && this.rng.chance(0.4) ? this.rng.range(1,2) : this.id === 'racing-pickup' && this.rng.chance(0.3) ? -1 : 0 });
      }
      if (this.id === 'obstacle-race') { this.addScore(1); this.passed++; }
    }
    if (this.id === 'obstacle-race' && (this.x <= this.road[18]! || this.x >= this.road[18]! + 5)) { this.lose(() => this.setup()); return; }
    const collision = this.obstacles.find((p) => p.y >= 16 && p.y <= 19 && (p.kind < 0 || Math.abs(p.x - this.x) <= 1));
    if (collision) {
      if (collision.kind > 0) { this.weapon = collision.kind; this.obstacles.splice(this.obstacles.indexOf(collision), 1); this.emit({ type: 'bonus' }); }
      else { this.lose(() => this.setup()); return; }
    }
    if (this.passed >= 30) { this.passed = 0; this.win(() => this.setup()); }
  }
  protected draw(): Uint8Array {
    const out = new Uint8Array(200);
    if (this.id === 'obstacle-race') this.road.forEach((x, y) => { put(out, x, y); put(out, x + 5, y); });
    else for (let y = 0; y < 20; y += 2) { put(out, 0, y); put(out, 9, y); }
    for (const p of this.obstacles) {
      put(out, p.x, p.y, p.kind > 0 ? 2 : 1); put(out, p.x, p.y + 1, p.kind > 0 ? 2 : 1);
      if (p.kind === 2) put(out, p.x, p.y + 2, 2);
      if (p.kind <= 0) { put(out, p.x + 1, p.y + 1); put(out, p.x - 1, p.y + 1); if (p.kind < 0) for (let x = 1; x <= 8; x++) put(out, x, p.y); }
    }
    put(out, this.x, 17, 2); put(out, this.x, 18); put(out, this.x - 1, 19); put(out, this.x + 1, 19);
    for (const s of this.shots) put(out, s.x, s.y); return out;
  }
}

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
        for (const p of this.targets) p.y = this.id === 'talking-shooting' ? Math.min(17, p.y + 1) : p.y + 1;
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
