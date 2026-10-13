import { screenSize, type HudFixed, type LevelDef, type ScreenProfile } from '../content/schema';
import type { GameState } from '../core/state';
import type { AssetStore } from './assets';
import type { CameraPos } from './camera';
import { drawText as drawBuiltinText, FONT_HEIGHT, textWidth } from './font';
import { computeLayout, type Layout } from './layout';

export interface Sprites {
  hero: string;
  /** null — снарядов в этих правилах нет. */
  projectile: string | null;
  life: string;
}

export interface DebugOverlay {
  grid: boolean;
  collisions: boolean;
}

export interface RenderInput {
  state: GameState;
  level: LevelDef;
  camera: CameraPos;
  sprites: Sprites;
  debug: DebugOverlay;
  /** Подменить значения HUD (контрольный лист показывает значения с фотографий). */
  hudOverride?: HudFixed;
  /** Не рисовать героя (сцена с фотографии без фигурки). */
  hideHero?: boolean;
}

/**
 * Canvas-рендерер. Рисует в логических пикселях профиля экрана (поле из клеток width × height
 * и поля вокруг него); масштаб до физических пикселей задаёт computeLayout, поэтому размер окна
 * и devicePixelRatio правил игры не меняют.
 */
export class Renderer {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  private readonly canvas: HTMLCanvasElement;
  private readonly screen: ScreenProfile;
  private readonly assets: AssetStore;
  private layout: Layout;
  private ghostEnabled: boolean;

  constructor(canvas: HTMLCanvasElement, screen: ScreenProfile, assets: AssetStore) {
    this.canvas = canvas;
    this.screen = screen;
    this.assets = assets;
    this.ghostEnabled = screen.ghost?.enabled ?? false;
    const size = screenSize(screen);
    this.logicalWidth = size.width;
    this.logicalHeight = size.height;
    this.layout = computeLayout(size.width, size.height, 1, size.width, size.height);
    this.applyLayout();
  }

  /** Слой неактивных сегментов (если он есть в профиле): включить или выключить. */
  setGhost(enabled: boolean): void {
    this.ghostEnabled = enabled && this.screen.ghost !== null;
  }

  get hasGhostLayer(): boolean {
    return this.screen.ghost !== null;
  }

  /** Подогнать Canvas под контейнер. Вызывать при resize, смене DPR/масштаба страницы. */
  resize(containerCssWidth: number, containerCssHeight: number, devicePixelRatio: number): Layout {
    this.layout = computeLayout(
      containerCssWidth,
      containerCssHeight,
      devicePixelRatio,
      this.logicalWidth,
      this.logicalHeight,
    );
    this.applyLayout();
    return this.layout;
  }

  private applyLayout(): void {
    const { canvas, layout } = this;
    if (canvas.width !== layout.backingWidth) canvas.width = layout.backingWidth;
    if (canvas.height !== layout.backingHeight) canvas.height = layout.backingHeight;
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;
  }

  render(input: RenderInput): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { screen, layout } = this;
    const { cell, margin, viewport, colors } = screen;

    ctx.setTransform(layout.scale, 0, 0, layout.scale, 0, 0);
    ctx.imageSmoothingEnabled = screen.smoothing;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, viewport.columns * cell.width, viewport.rows * cell.height);
    ctx.clip();
    this.drawWorld(ctx, input);
    if (input.debug.grid || input.debug.collisions) this.drawDebug(ctx, input);
    ctx.restore();

    this.drawHud(ctx, input);
  }

  /** Левый верхний угол клетки карты в логических пикселях экрана. */
  private cellOrigin(cam: CameraPos, wx: number, wy: number): { x: number; y: number } {
    const { cell, margin } = this.screen;
    return { x: margin.left + (wx - cam.x) * cell.width, y: margin.top + (wy - cam.y) * cell.height };
  }

  private drawWorld(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const { state, level, camera, sprites } = input;
    const { cell, viewport, colors, ghost } = this.screen;
    const ink = colors.ink;
    const tick = state.worldTick;

    // Слой неактивных сегментов под всем остальным (необязательный).
    if (this.ghostEnabled && ghost) {
      for (let cy = 0; cy < viewport.rows; cy++) {
        for (let cx = 0; cx < viewport.columns; cx++) {
          const p = this.cellOrigin({ x: 0, y: 0 }, cx, cy);
          this.assets.draw(ctx, ghost.asset, tick, p.x, p.y, cell.width, cell.height, ink);
        }
      }
    }

    // Статический слой: что рисовать, решает легенда уровня; проходимость отсюда не берётся.
    for (let cy = 0; cy < viewport.rows; cy++) {
      for (let cx = 0; cx < viewport.columns; cx++) {
        const char = level.rows[camera.y + cy]?.[camera.x + cx];
        const asset = char === undefined ? null : level.legend[char]?.asset;
        if (!asset) continue;
        const p = this.cellOrigin({ x: 0, y: 0 }, cx, cy);
        this.assets.draw(ctx, asset, tick, p.x, p.y, cell.width, cell.height, ink);
      }
    }

    level.objects.forEach((def, index) => {
      const object = state.objects[index];
      if (!object || !object.active || !def.asset) return;
      for (let dy = 0; dy < def.h; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const p = this.cellOrigin(camera, object.x + dx, object.y + dy);
          this.assets.draw(ctx, def.asset, tick, p.x, p.y, cell.width, cell.height, ink);
        }
      }
    });

    const projectileSprite = sprites.projectile;
    if (projectileSprite) {
      for (const projectile of state.projectiles) {
        const p = this.cellOrigin(camera, projectile.x, projectile.y);
        const flip = projectile.dir === -1 && this.assets.mirrorsWhenLeft(projectileSprite);
        this.assets.draw(ctx, projectileSprite, tick, p.x, p.y, cell.width, cell.height, ink, flip);
      }
    }

    // В фазе смерти герой мигает.
    const blink = state.phase === 'dead' && Math.floor(state.tick / 2) % 2 === 1;
    if (!blink && !input.hideHero) {
      const p = this.cellOrigin(camera, state.hero.x, state.hero.y);
      // Зеркало для взгляда влево — только если ресурс это допускает (в каталоге по умолчанию — нет).
      const flip = state.hero.facing === -1 && this.assets.mirrorsWhenLeft(sprites.hero);
      this.assets.draw(ctx, sprites.hero, tick, p.x, p.y, cell.width, cell.height, ink, flip);
    }
  }

  /** Отладка: сетка и коллизии (занятые тайлы, области объектов, клетка героя). */
  private drawDebug(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const { state, level, camera, debug } = input;
    const { cell, viewport } = this.screen;
    const line = Math.max(1, Math.round(Math.min(cell.width, cell.height) / 16));
    ctx.lineWidth = line;
    const box = (x: number, y: number, w: number, h: number): void =>
      ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line);

    if (debug.grid) {
      ctx.strokeStyle = 'rgba(32, 42, 30, 0.35)';
      for (let cy = 0; cy < viewport.rows; cy++) {
        for (let cx = 0; cx < viewport.columns; cx++) {
          const p = this.cellOrigin({ x: 0, y: 0 }, cx, cy);
          box(p.x, p.y, cell.width, cell.height);
        }
      }
    }

    if (debug.collisions) {
      ctx.strokeStyle = 'rgba(190, 30, 30, 0.9)';
      for (let cy = 0; cy < viewport.rows; cy++) {
        for (let cx = 0; cx < viewport.columns; cx++) {
          const char = level.rows[camera.y + cy]?.[camera.x + cx];
          if (char !== undefined && level.legend[char]?.collision === 'solid') {
            const p = this.cellOrigin({ x: 0, y: 0 }, cx, cy);
            box(p.x, p.y, cell.width, cell.height);
          }
        }
      }
      ctx.strokeStyle = 'rgba(30, 60, 200, 0.9)';
      level.objects.forEach((def, index) => {
        const object = state.objects[index];
        if (!object || !object.active) return;
        const p = this.cellOrigin(camera, object.x, object.y);
        box(p.x, p.y, def.w * cell.width, def.h * cell.height);
      });
      ctx.strokeStyle = 'rgba(20, 150, 40, 0.95)';
      const hero = this.cellOrigin(camera, state.hero.x, state.hero.y);
      box(hero.x, hero.y, cell.width, cell.height);
    }
  }

  /** Значения HUD: подмена → фиксированные тестовые → состояние игры. */
  private hudValues(input: RenderInput): { lives: number; label: string; score: number } {
    const fixed = input.hudOverride ?? this.screen.hud.fixed;
    if (fixed) return fixed;
    return { lives: input.state.lives, label: input.level.hudLabel, score: input.state.score };
  }

  private drawHud(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const values = this.hudValues(input);
    if (this.screen.hud.kind === 'lcd') this.drawLcdHud(ctx, input, values);
    else this.drawBuiltinHud(ctx, input, values);
  }

  /** HUD из спрайтов в явных координатах: значки жизни, подпись, число. */
  private drawLcdHud(ctx: CanvasRenderingContext2D, input: RenderInput, values: { lives: number; label: string; score: number }): void {
    const hud = this.screen.hud;
    if (hud.kind !== 'lcd') return;
    const ink = this.screen.colors.ink;
    const tick = input.state.worldTick;

    for (let i = 0; i < Math.min(values.lives, 9); i++) {
      this.assets.draw(ctx, hud.lives.asset, tick, hud.lives.x + i * hud.lives.pitch, hud.lives.y, hud.lives.width, hud.lives.height, ink);
    }

    const row = (text: string, digits: { x: number; y: number; pitch: number; slots: number }): void => {
      const padded = text.slice(-digits.slots).padStart(digits.slots, ' ');
      [...padded].forEach((char, index) => {
        const x = digits.x + index * digits.pitch;
        if (this.ghostEnabled && hud.font.ghost) {
          this.assets.draw(ctx, hud.font.ghost, tick, x, digits.y, hud.font.width, hud.font.height, ink);
        }
        const asset = hud.font.glyphs[char];
        if (asset) this.assets.draw(ctx, asset, tick, x, digits.y, hud.font.width, hud.font.height, ink);
      });
    };
    row(values.label, hud.label);
    row(String(Math.min(values.score, 10 ** hud.score.slots - 1)).padStart(hud.score.slots, '0'), hud.score);
  }

  /**
   * Встроенный HUD (пиксельные заглушки): значки жизни слева, подпись по центру, пятизначное число справа
   * в полосе поля. Значения — из состояния игры либо фиксированные тестовые.
   */
  private drawBuiltinHud(ctx: CanvasRenderingContext2D, input: RenderInput, values: { lives: number; label: string; score: number }): void {
    const { hud, margin, cell, colors, viewport } = this.screen;
    if (hud.kind !== 'builtin') return;
    const height = hud.position === 'top' ? margin.top : margin.bottom;
    const top = hud.position === 'top' ? 0 : margin.top + viewport.rows * cell.height;
    const ink = colors.ink;
    const score = String(Math.min(values.score, 99999)).padStart(5, '0');

    const icon = Math.min(hud.iconPx, height);
    const iconY = top + Math.floor((height - icon) / 2);
    for (let i = 0; i < Math.min(values.lives, 5); i++) {
      this.assets.draw(ctx, input.sprites.life, input.state.worldTick, i * icon + (i > 0 ? i : 0), iconY, icon, icon, ink);
    }

    const marginX = Math.max(1, Math.floor(cell.width / 8));
    const textY = top + Math.floor((height - FONT_HEIGHT) / 2);
    drawBuiltinText(ctx, values.label, Math.floor((this.logicalWidth - textWidth(values.label)) / 2), textY, ink);
    drawBuiltinText(ctx, score, this.logicalWidth - textWidth(score) - marginX, textY, ink);

    ctx.fillStyle = ink;
    ctx.fillRect(0, hud.position === 'top' ? top + height - 1 : top, this.logicalWidth, 1);
  }
}
