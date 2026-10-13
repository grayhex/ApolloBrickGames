import type { LevelDef, ScreenProfile } from '../content/schema';
import type { GameState } from '../core/state';
import type { AssetStore } from './assets';
import type { CameraPos } from './camera';
import { drawText, FONT_HEIGHT, textWidth } from './font';
import { computeLayout, type Layout } from './layout';

/** Нейтральная монохромная «LCD-подобная» палитра. Это не цвета оригинала. */
export const LCD_BG = '#a9b79a';
export const LCD_INK = '#202a1e';

export interface Sprites {
  hero: string;
  projectile: string;
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
}

/**
 * Canvas-рендерер. Рисует в логических пикселях профиля экрана (cellPx на клетку);
 * масштаб до физических пикселей задаёт computeLayout, поэтому размер окна и
 * devicePixelRatio правил игры не меняют.
 */
export class Renderer {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  private readonly canvas: HTMLCanvasElement;
  private readonly screen: ScreenProfile;
  private readonly assets: AssetStore;
  private layout: Layout;

  constructor(canvas: HTMLCanvasElement, screen: ScreenProfile, assets: AssetStore) {
    this.canvas = canvas;
    this.screen = screen;
    this.assets = assets;
    this.logicalWidth = screen.viewport.columns * screen.cellPx;
    this.logicalHeight = (screen.viewport.rows + screen.hud.rows) * screen.cellPx;
    this.layout = computeLayout(this.logicalWidth, this.logicalHeight, 1, this.logicalWidth, this.logicalHeight);
    this.applyLayout();
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
    const { cellPx: cell, viewport, hud } = screen;
    const hudHeight = hud.rows * cell;
    const playTop = hud.position === 'top' ? hudHeight : 0;
    const hudTop = hud.position === 'top' ? 0 : viewport.rows * cell;

    ctx.setTransform(layout.scale, 0, 0, layout.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = LCD_BG;
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, playTop, viewport.columns * cell, viewport.rows * cell);
    ctx.clip();
    this.drawWorld(ctx, input, playTop);
    if (input.debug.grid || input.debug.collisions) this.drawDebug(ctx, input, playTop);
    ctx.restore();

    if (hud.rows > 0) this.drawHud(ctx, input, hudTop, hudHeight);
  }

  private cellToPixel(cam: CameraPos, wx: number, wy: number, playTop: number): { x: number; y: number } {
    const cell = this.screen.cellPx;
    return { x: (wx - cam.x) * cell, y: (wy - cam.y) * cell + playTop };
  }

  private drawWorld(ctx: CanvasRenderingContext2D, input: RenderInput, playTop: number): void {
    const { state, level, camera, sprites } = input;
    const { cellPx: cell, viewport } = this.screen;
    const tick = state.worldTick;

    // Статический слой: что рисовать, решает легенда уровня; проходимость отсюда не берётся.
    for (let cy = 0; cy < viewport.rows; cy++) {
      for (let cx = 0; cx < viewport.columns; cx++) {
        const wx = camera.x + cx;
        const wy = camera.y + cy;
        const char = level.rows[wy]?.[wx];
        const asset = char === undefined ? null : level.legend[char]?.asset;
        if (asset) this.assets.draw(ctx, asset, tick, cx * cell, cy * cell + playTop, cell, LCD_INK);
      }
    }

    level.objects.forEach((def, index) => {
      const object = state.objects[index];
      if (!object || !object.active || !def.asset) return;
      for (let dy = 0; dy < def.h; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const p = this.cellToPixel(camera, object.x + dx, object.y + dy, playTop);
          this.assets.draw(ctx, def.asset, tick, p.x, p.y, cell, LCD_INK);
        }
      }
    });

    for (const projectile of state.projectiles) {
      const p = this.cellToPixel(camera, projectile.x, projectile.y, playTop);
      this.assets.draw(ctx, sprites.projectile, tick, p.x, p.y, cell, LCD_INK, projectile.dir === -1);
    }

    // В фазе смерти герой мигает.
    const blink = state.phase === 'dead' && Math.floor(state.tick / 2) % 2 === 1;
    if (!blink) {
      const p = this.cellToPixel(camera, state.hero.x, state.hero.y, playTop);
      this.assets.draw(ctx, sprites.hero, tick, p.x, p.y, cell, LCD_INK, state.hero.facing === -1);
    }
  }

  /** Отладка: сетка и коллизии (занятые тайлы, области объектов, клетка героя). */
  private drawDebug(ctx: CanvasRenderingContext2D, input: RenderInput, playTop: number): void {
    const { state, level, camera, debug } = input;
    const { cellPx: cell, viewport } = this.screen;
    ctx.lineWidth = 1;

    if (debug.grid) {
      ctx.strokeStyle = 'rgba(32, 42, 30, 0.22)';
      for (let cy = 0; cy < viewport.rows; cy++) {
        for (let cx = 0; cx < viewport.columns; cx++) {
          ctx.strokeRect(cx * cell + 0.5, cy * cell + playTop + 0.5, cell - 1, cell - 1);
        }
      }
    }

    if (debug.collisions) {
      ctx.strokeStyle = 'rgba(190, 30, 30, 0.9)';
      for (let cy = 0; cy < viewport.rows; cy++) {
        for (let cx = 0; cx < viewport.columns; cx++) {
          const char = level.rows[camera.y + cy]?.[camera.x + cx];
          if (char !== undefined && level.legend[char]?.collision === 'solid') {
            ctx.strokeRect(cx * cell + 0.5, cy * cell + playTop + 0.5, cell - 1, cell - 1);
          }
        }
      }
      ctx.strokeStyle = 'rgba(30, 60, 200, 0.9)';
      level.objects.forEach((def, index) => {
        const object = state.objects[index];
        if (!object || !object.active) return;
        const p = this.cellToPixel(camera, object.x, object.y, playTop);
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, def.w * cell - 1, def.h * cell - 1);
      });
      ctx.strokeStyle = 'rgba(20, 150, 40, 0.95)';
      const hero = this.cellToPixel(camera, state.hero.x, state.hero.y, playTop);
      ctx.strokeRect(hero.x + 0.5, hero.y + 0.5, cell - 1, cell - 1);
    }
  }

  /** HUD: жизни слева, подпись участка по центру, счёт справа. Значения временные (demo). */
  private drawHud(ctx: CanvasRenderingContext2D, input: RenderInput, top: number, height: number): void {
    const { state, level, sprites } = input;
    const { cellPx: cell } = this.screen;
    const iconSize = Math.min(cell, height);
    const lives = Math.min(state.lives, 5);
    for (let i = 0; i < lives; i++) {
      this.assets.draw(ctx, sprites.life, state.worldTick, i * iconSize, top, iconSize, LCD_INK);
    }

    const textY = top + Math.floor((height - FONT_HEIGHT) / 2);
    const label = level.hudLabel;
    drawText(ctx, label, Math.floor((this.logicalWidth - textWidth(label)) / 2), textY, LCD_INK);
    const score = String(Math.min(state.score, 99999)).padStart(5, '0');
    drawText(ctx, score, this.logicalWidth - textWidth(score) - 1, textY, LCD_INK);

    ctx.fillStyle = LCD_INK;
    const separatorY = this.screen.hud.position === 'top' ? top + height - 1 : top;
    ctx.fillRect(0, separatorY, this.logicalWidth, 1);
  }
}
