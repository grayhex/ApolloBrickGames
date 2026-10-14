import type { ContentPack } from '../../content/schema';
import type { AssetStore } from '../../render/assets';
import type { Problem } from '../diagnose';
import type { ResizePlan } from '../grid';
import { objectAt } from '../ops';
import type { EditorStore } from '../store';
import type { Pointer, ToolController } from '../tools';
import type { Pt, ViewMode } from '../types';
import {
  cellAtScreen,
  clientToCanvas,
  fitView,
  panBy,
  resizeKeepCenter,
  screenToWorld,
  visibleCells,
  worldToScreen,
  yScale,
  zoomAt,
  type View,
} from '../viewport';
import type { PhotoCache } from './photos';

export interface MapDeps {
  store: EditorStore;
  tools: ToolController;
  pack: () => ContentPack;
  assets: () => AssetStore;
  photos: PhotoCache;
  problems: () => readonly Problem[];
  /** Типы объектов, известные движку: остальные рисуются как неподдерживаемые. */
  knownTypes: () => ReadonlySet<string>;
  /** Ввод в рабочую область временно отключён (калибровка, тестовый запуск). */
  blocked: () => boolean;
}

interface Layers {
  photo: boolean;
  tiles: boolean;
  /** Прозрачность тайлов: поверх фото они полупрозрачны. */
  tileAlpha: number;
  photoAlpha: number | null;
}

const STATUS_COLORS = { unknown: '#ff5fd2', assumed: '#ffb020', confirmed: '#5fe08a' } as const;
const STATUS_BADGE = { unknown: '?', assumed: '≈', confirmed: '✓' } as const;
const OUTSIDE = '#0e1113';

function layersFor(mode: ViewMode, side: 'main' | 'photo'): Layers {
  switch (mode) {
    case 'photo':
      return { photo: true, tiles: false, tileAlpha: 1, photoAlpha: 1 };
    case 'map':
      return { photo: false, tiles: true, tileAlpha: 1, photoAlpha: null };
    case 'overlay':
      return { photo: true, tiles: true, tileAlpha: 0.62, photoAlpha: null };
    case 'side':
      return side === 'photo'
        ? { photo: true, tiles: false, tileAlpha: 1, photoAlpha: 1 }
        : { photo: false, tiles: true, tileAlpha: 1, photoAlpha: null };
  }
}

/**
 * Рабочая область: карта, подложка, сетка, выделение. Рисует по требованию (dirty-флаг + rAF).
 * Все координаты мыши переводятся в клетки по актуальному виду (zoom/pan/размер холста/DPR),
 * поэтому инструменты редактируют именно клетку под курсором.
 */
export class MapView {
  view: View = { scale: 32, tx: 0, ty: 0 };
  onHover: (cell: Pt | null) => void = () => {};
  /** Прикреплён ли вид к документу (false — пользователь двигал/масштабировал, вписывание не нужно). */
  private readonly host: HTMLElement;
  private readonly main: HTMLCanvasElement;
  private readonly side: HTMLCanvasElement;
  private readonly deps: MapDeps;
  private cssW = 0;
  private cssH = 0;
  private raf = 0;
  private spaceHeld = false;
  private panning: { startX: number; startY: number; view: View } | null = null;
  private hover: Pt | null = null;
  private shrink: ResizePlan | null = null;
  private fitted = false;
  private readonly observer: ResizeObserver;

  constructor(host: HTMLElement, deps: MapDeps) {
    this.host = host;
    this.deps = deps;
    this.side = host.ownerDocument.createElement('canvas');
    this.side.className = 'map__canvas map__canvas--photo';
    this.main = host.ownerDocument.createElement('canvas');
    this.main.className = 'map__canvas map__canvas--main';
    this.main.tabIndex = 0;
    this.main.setAttribute('aria-label', 'Карта уровня');
    host.append(this.side, this.main);

    this.main.addEventListener('pointerdown', this.onPointerDown);
    this.main.addEventListener('pointermove', this.onPointerMove);
    this.main.addEventListener('pointerup', this.onPointerUp);
    this.main.addEventListener('pointercancel', this.onPointerCancel);
    this.main.addEventListener('pointerleave', () => {
      this.hover = null;
      this.onHover(null);
      this.request();
    });
    this.main.addEventListener('contextmenu', (event) => event.preventDefault());
    for (const canvas of [this.main, this.side]) canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    deps.store.subscribe(() => this.request());
  }

  get canvas(): HTMLCanvasElement {
    return this.main;
  }

  destroy(): void {
    this.observer.disconnect();
    cancelAnimationFrame(this.raf);
  }

  setSpace(held: boolean): void {
    this.spaceHeld = held;
    this.updateCursor();
  }

  setShrinkPreview(plan: ResizePlan | null): void {
    this.shrink = plan;
    this.request();
  }

  get cellRatio(): number {
    const { cell } = this.deps.pack().screen;
    return cell.height / cell.width;
  }

  /** Вписать всю карту в рабочую область. */
  fit(): void {
    const { doc } = this.deps.store;
    this.view = fitView(this.mainWidth(), this.cssH, doc.width, doc.height, 28, this.cellRatio);
    this.fitted = true;
    this.request();
  }

  /** Поместить клетку в центр области (если вид не позволяет её увидеть — приблизить). */
  centerOn(cell: Pt): void {
    const w = this.mainWidth();
    const wx = cell.x + 0.5;
    const wy = cell.y + 0.5;
    const ys = yScale(this.view);
    this.view = { ...this.view, tx: w / 2 - wx * this.view.scale, ty: this.cssH / 2 - wy * ys };
    this.request();
  }

  zoomBy(factor: number): void {
    this.view = zoomAt(this.view, factor, this.mainWidth() / 2, this.cssH / 2);
    this.fitted = false;
    this.request();
  }

  request(): void {
    if (this.raf !== 0) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  // ── Размер ───────────────────────────────────────────────────────────────

  private mainWidth(): number {
    return this.deps.store.ui.mode === 'side' ? this.cssW / 2 : this.cssW;
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this.cssW && h === this.cssH) return;
    const first = this.cssW === 0;
    const oldW = this.mainWidth();
    const oldH = this.cssH;
    this.cssW = w;
    this.cssH = h;
    const dpr = window.devicePixelRatio || 1;
    const mainW = this.mainWidth();
    this.sizeCanvas(this.main, mainW, h, dpr);
    this.sizeCanvas(this.side, mainW, h, dpr);
    if (first || !this.fitted) {
      if (first) this.fit();
      else this.view = resizeKeepCenter(this.view, oldW, oldH, mainW, h);
    } else this.fit();
    this.request();
  }

  /** Режим «Рядом» меняет ширину основной области. */
  relayout(): void {
    const dpr = window.devicePixelRatio || 1;
    const mainW = this.mainWidth();
    const oldW = this.main.clientWidth || mainW;
    // Режим «Рядом» делит область пополам — карта вписывается заново.
    this.sizeCanvas(this.main, mainW, this.cssH, dpr);
    this.sizeCanvas(this.side, mainW, this.cssH, dpr);
    this.view = resizeKeepCenter(this.view, oldW, this.cssH, mainW, this.cssH);
    this.fit();
  }

  private sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number, dpr: number): void {
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
  }

  // ── Ввод ─────────────────────────────────────────────────────────────────

  private pointerOf(event: PointerEvent | MouseEvent, canvas: HTMLCanvasElement): { screen: Pt; pointer: Pointer } {
    const rect = canvas.getBoundingClientRect();
    const screen = clientToCanvas(event.clientX, event.clientY, rect, this.mainWidth(), this.cssH);
    const world = screenToWorld(this.view, screen.x, screen.y);
    return {
      screen,
      pointer: { cell: { x: Math.floor(world.x), y: Math.floor(world.y) }, world, shift: event.shiftKey },
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.deps.blocked()) return;
    this.main.focus({ preventScroll: true });
    const { screen, pointer } = this.pointerOf(event, this.main);
    const wantsPan = event.button === 1 || this.spaceHeld || this.deps.store.tool.tool === 'pan';
    if (event.button === 2) return;
    this.main.setPointerCapture(event.pointerId);
    if (wantsPan) {
      this.panning = { startX: screen.x, startY: screen.y, view: this.view };
      this.fitted = false;
      this.updateCursor();
      return;
    }
    if (event.button !== 0) return;
    this.deps.tools.down(pointer);
    this.request();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const { screen, pointer } = this.pointerOf(event, this.main);
    if (this.panning) {
      const { startX, startY, view } = this.panning;
      this.view = panBy(view, screen.x - startX, screen.y - startY);
      this.request();
      return;
    }
    const cell = cellAtScreen(this.view, screen.x, screen.y);
    if (!this.hover || this.hover.x !== cell.x || this.hover.y !== cell.y) {
      this.hover = cell;
      this.onHover(cell);
      this.request();
    }
    if (this.deps.tools.dragging) {
      this.deps.tools.move(pointer);
      this.request();
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.main.hasPointerCapture(event.pointerId)) this.main.releasePointerCapture(event.pointerId);
    if (this.panning) {
      this.panning = null;
      this.updateCursor();
      return;
    }
    if (!this.deps.tools.dragging) return;
    this.deps.tools.up(this.pointerOf(event, this.main).pointer);
    this.request();
  };

  private readonly onPointerCancel = (): void => {
    this.panning = null;
    this.deps.tools.cancel();
    this.updateCursor();
    this.request();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.deps.blocked()) return;
    event.preventDefault();
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const p = clientToCanvas(event.clientX, event.clientY, rect, this.mainWidth(), this.cssH);
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    this.fitted = false;
    if (event.shiftKey && !event.ctrlKey) {
      this.view = panBy(this.view, -(event.deltaY || event.deltaX) * unit, 0);
    } else {
      this.view = zoomAt(this.view, Math.exp(-event.deltaY * unit * 0.0016), p.x, p.y);
    }
    this.request();
  };

  private updateCursor(): void {
    const tool = this.deps.store.tool.tool;
    const pan = this.spaceHeld || tool === 'pan';
    this.main.style.cursor = this.panning ? 'grabbing' : pan ? 'grab' : tool === 'photo' ? 'move' : tool === 'select' ? 'cell' : 'crosshair';
  }

  // ── Рисование ────────────────────────────────────────────────────────────

  private render(): void {
    this.updateCursor();
    const mode = this.deps.store.ui.mode;
    // Контракт для браузерных тестов: вид и содержимое карты в data-атрибутах.
    const data = this.main.dataset;
    data['scale'] = String(this.view.scale);
    data['tx'] = String(this.view.tx);
    data['ty'] = String(this.view.ty);
    data['ratio'] = String(this.view.ratio ?? 1);
    this.side.style.display = mode === 'side' ? 'block' : 'none';
    if (mode === 'side') this.draw(this.side, layersFor(mode, 'photo'), false);
    this.draw(this.main, layersFor(mode, 'main'), true);
  }

  private draw(canvas: HTMLCanvasElement, layers: Layers, interactive: boolean): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.mainWidth();
    const h = this.cssH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(0, 0, w, h);

    const { store } = this.deps;
    const { doc, ui } = store;
    const pack = this.deps.pack();
    const assets = this.deps.assets();
    const { view } = this;
    const sx = view.scale;
    const sy = yScale(view);
    const range = visibleCells(view, w, h, doc.width, doc.height);
    const px = (x: number): number => view.tx + x * sx;
    const py = (y: number): number => view.ty + y * sy;

    ctx.fillStyle = pack.screen.colors.background;
    ctx.fillRect(px(0), py(0), doc.width * sx, doc.height * sy);

    if (layers.photo) this.drawPhotos(ctx, layers.photoAlpha, pack);

    if (layers.tiles) {
      ctx.save();
      ctx.globalAlpha = layers.tileAlpha;
      ctx.beginPath();
      ctx.rect(px(0), py(0), doc.width * sx, doc.height * sy);
      ctx.clip();
      const ghost = pack.screen.ghost;
      const ink = pack.screen.colors.ink;
      ctx.imageSmoothingEnabled = pack.screen.smoothing;
      for (let y = range.y0; y < range.y1; y++) {
        const row = doc.rows[y] ?? '';
        for (let x = range.x0; x < range.x1; x++) {
          const entry = doc.legend[row[x] ?? ''];
          if (ghost && ui.showGhost) assets.draw(ctx, ghost.asset, 0, px(x), py(y), sx, sy, ink);
          if (!entry) {
            ctx.fillStyle = 'rgba(255, 60, 60, 0.45)';
            ctx.fillRect(px(x), py(y), sx, sy);
          } else if (entry.asset !== null) {
            assets.draw(ctx, entry.asset, 0, px(x), py(y), sx, sy, ink);
          } else if (entry.collision === 'solid') {
            ctx.fillStyle = 'rgba(32, 42, 30, 0.55)';
            ctx.fillRect(px(x) + 1, py(y) + 1, sx - 2, sy - 2);
          }
        }
      }
      ctx.restore();
      if (ui.showObjects) this.drawObjects(ctx, pack, assets);
    }

    if (layers.tiles && ui.showObjects) this.drawStart(ctx, pack, assets);
    if (ui.showMarks && (layers.tiles || layers.photo)) this.drawMarks(ctx);
    if (ui.showGrid) this.drawGrid(ctx, range, w, h);
    this.drawWindowFrame(ctx, pack);
    if (interactive) {
      this.drawProblems(ctx);
      this.drawSelection(ctx);
      this.drawPreview(ctx);
      this.drawShrink(ctx);
      this.drawHover(ctx);
    }
    this.drawRulers(ctx, range, w, h);
  }

  private drawPhotos(ctx: CanvasRenderingContext2D, alphaOverride: number | null, pack: ContentPack): void {
    const { doc, ui, selection } = this.deps.store;
    const { columns, rows } = pack.screen.viewport;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    for (const ref of doc.refs) {
      if (!ref.visible) continue;
      const surface = this.deps.photos.surface(ref, columns, rows, { w: 96, h: Math.round(96 * this.cellRatio) });
      const x = this.view.tx + ref.origin.x * sx;
      const y = this.view.ty + ref.origin.y * sy;
      if (surface) {
        ctx.save();
        ctx.globalAlpha = alphaOverride ?? ref.opacity;
        ctx.drawImage(surface, x, y, columns * sx, rows * sy);
        ctx.restore();
      }
      const active = ui.activeRef === ref.id || (selection?.kind === 'ref' && selection.id === ref.id);
      ctx.save();
      ctx.strokeStyle = active ? '#7ec8ff' : 'rgba(126, 200, 255, 0.45)';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, columns * sx - 1, rows * sy - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = active ? '#7ec8ff' : 'rgba(126, 200, 255, 0.8)';
      ctx.font = '12px system-ui, sans-serif';
      const label = `${ref.name}${ref.quad === null ? ' (не откалибровано)' : ''}${ref.locked ? ' 🔒' : ''}`;
      ctx.fillText(label, x + 4, y - 5);
      ctx.restore();
    }
  }

  private drawObjects(ctx: CanvasRenderingContext2D, pack: ContentPack, assets: AssetStore): void {
    const { doc, selection } = this.deps.store;
    const known = this.deps.knownTypes();
    const sx = this.view.scale;
    const sy = yScale(this.view);
    for (const object of doc.objects) {
      const x = this.view.tx + object.x * sx;
      const y = this.view.ty + object.y * sy;
      const w = object.w * sx;
      const h = object.h * sy;
      if (object.asset !== null) assets.draw(ctx, object.asset, 0, x, y, w, h, pack.screen.colors.ink);
      const supported = known.has(object.type);
      const chosen = selection?.kind === 'object' && selection.id === object.id;
      ctx.save();
      ctx.lineWidth = chosen ? 3 : 2;
      ctx.strokeStyle = !supported ? '#ff5a4d' : chosen ? '#ffffff' : '#9fd0ff';
      ctx.setLineDash(supported ? [] : [5, 3]);
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.setLineDash([]);
      ctx.fillStyle = !supported ? '#ff5a4d' : '#9fd0ff';
      ctx.font = `bold ${Math.max(10, Math.min(16, sx * 0.3))}px system-ui, sans-serif`;
      ctx.fillText(supported ? object.type.slice(0, 1).toUpperCase() : '?', x + 6, y + Math.min(h - 6, 6 + 16));
      ctx.restore();
    }
  }

  private drawStart(ctx: CanvasRenderingContext2D, pack: ContentPack, assets: AssetStore): void {
    const { doc, selection } = this.deps.store;
    if (!doc.start) return;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    const x = this.view.tx + doc.start.x * sx;
    const y = this.view.ty + doc.start.y * sy;
    ctx.save();
    ctx.globalAlpha = 0.9;
    assets.draw(ctx, pack.manifest.sprites.hero, 0, x, y, sx, sy, pack.screen.colors.ink);
    ctx.restore();
    const char = doc.rows[doc.start.y]?.[doc.start.x];
    const blocked = char === undefined || doc.legend[char]?.collision === 'solid';
    ctx.save();
    ctx.strokeStyle = blocked ? '#ff5a4d' : selection?.kind === 'start' ? '#ffffff' : '#6df08a';
    ctx.lineWidth = selection?.kind === 'start' ? 3 : 2;
    ctx.strokeRect(x + 1.5, y + 1.5, sx - 3, sy - 3);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('СТАРТ', x + 3, y + sy - 4);
    ctx.restore();
  }

  private drawMarks(ctx: CanvasRenderingContext2D): void {
    const { doc, selection } = this.deps.store;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    for (const mark of doc.marks) {
      const x = this.view.tx + mark.x * sx;
      const y = this.view.ty + mark.y * sy;
      const color = STATUS_COLORS[mark.status];
      const chosen = selection?.kind === 'mark' && selection.id === mark.id;
      ctx.save();
      ctx.fillStyle = `${color}22`;
      ctx.fillRect(x, y, mark.w * sx, mark.h * sy);
      ctx.strokeStyle = color;
      ctx.lineWidth = chosen ? 3 : 1.5;
      ctx.setLineDash(mark.status === 'confirmed' ? [] : [4, 3]);
      ctx.strokeRect(x + 0.5, y + 0.5, mark.w * sx - 1, mark.h * sy - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(STATUS_BADGE[mark.status], x + 4, y + 15);
      ctx.restore();
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, range: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number): void {
    const { doc } = this.deps.store;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    if (sx < 7) return;
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = range.x0; x <= range.x1; x++) {
      ctx.strokeStyle = x % 5 === 0 ? 'rgba(20, 30, 20, 0.45)' : 'rgba(20, 30, 20, 0.2)';
      const sxp = Math.round(this.view.tx + x * sx) + 0.5;
      ctx.beginPath();
      ctx.moveTo(sxp, Math.max(0, this.view.ty));
      ctx.lineTo(sxp, Math.min(h, this.view.ty + doc.height * sy));
      ctx.stroke();
    }
    for (let y = range.y0; y <= range.y1; y++) {
      ctx.strokeStyle = y % 5 === 0 ? 'rgba(20, 30, 20, 0.45)' : 'rgba(20, 30, 20, 0.2)';
      const syp = Math.round(this.view.ty + y * sy) + 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, this.view.tx), syp);
      ctx.lineTo(Math.min(w, this.view.tx + doc.width * sx), syp);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawRulers(ctx: CanvasRenderingContext2D, range: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number): void {
    const sx = this.view.scale;
    const sy = yScale(this.view);
    const stepX = Math.max(1, Math.ceil(34 / sx));
    const stepY = Math.max(1, Math.ceil(20 / sy));
    ctx.save();
    ctx.fillStyle = 'rgba(14, 17, 19, 0.78)';
    ctx.fillRect(0, 0, w, 16);
    ctx.fillRect(0, 0, 28, h);
    ctx.fillStyle = '#9fb0a8';
    ctx.font = '10px ui-monospace, monospace';
    for (let x = Math.ceil(range.x0 / stepX) * stepX; x < range.x1; x += stepX) {
      ctx.fillText(String(x), this.view.tx + x * sx + 2, 11);
    }
    for (let y = Math.ceil(range.y0 / stepY) * stepY; y < range.y1; y += stepY) {
      ctx.fillText(String(y), 2, this.view.ty + y * sy + 12);
    }
    ctx.restore();
  }

  private drawWindowFrame(ctx: CanvasRenderingContext2D, pack: ContentPack): void {
    const { ui } = this.deps.store;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    const { columns, rows } = pack.screen.viewport;
    const x = this.view.tx + ui.windowX * sx;
    const y = this.view.ty + ui.windowY * sy;
    ctx.save();
    ctx.strokeStyle = '#d8ff6a';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(x, y, columns * sx, rows * sy);
    ctx.restore();
  }

  private drawProblems(ctx: CanvasRenderingContext2D): void {
    const sx = this.view.scale;
    const sy = yScale(this.view);
    ctx.save();
    for (const problem of this.deps.problems()) {
      if (!problem.cell || problem.severity !== 'error') continue;
      const x = this.view.tx + problem.cell.x * sx;
      const y = this.view.ty + problem.cell.y * sy;
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, sx - 3, sy - 3);
    }
    ctx.restore();
  }

  private drawSelection(ctx: CanvasRenderingContext2D): void {
    const rect = this.deps.store.selectionRect();
    if (!rect) return;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    const x = this.view.tx + rect.x * sx;
    const y = this.view.ty + rect.y * sy;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x, y, rect.w * sx, rect.h * sy);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, rect.w * sx, rect.h * sy);
    ctx.restore();
  }

  private drawPreview(ctx: CanvasRenderingContext2D): void {
    const preview = this.deps.tools.preview;
    if (!preview) return;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    const dx = preview.kind === 'move' ? preview.dx : 0;
    const dy = preview.kind === 'move' ? preview.dy : 0;
    const x = this.view.tx + (preview.rect.x + dx) * sx;
    const y = this.view.ty + (preview.rect.y + dy) * sy;
    const tone = preview.kind === 'move' ? 'select' : preview.tone;
    const color = tone === 'paint' ? '#d8ff6a' : tone === 'mark' ? STATUS_COLORS[this.deps.store.tool.markStatus] : '#ffffff';
    ctx.save();
    ctx.fillStyle = `${color}33`;
    ctx.fillRect(x, y, preview.rect.w * sx, preview.rect.h * sy);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, preview.rect.w * sx, preview.rect.h * sy);
    ctx.restore();
  }

  private drawShrink(ctx: CanvasRenderingContext2D): void {
    const plan = this.shrink;
    if (!plan) return;
    const { doc } = this.deps.store;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    ctx.save();
    ctx.fillStyle = 'rgba(255, 59, 48, 0.32)';
    if (plan.width < doc.width) ctx.fillRect(this.view.tx + plan.width * sx, this.view.ty, (doc.width - plan.width) * sx, doc.height * sy);
    if (plan.height < doc.height) ctx.fillRect(this.view.tx, this.view.ty + plan.height * sy, doc.width * sx, (doc.height - plan.height) * sy);
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 2;
    for (const cell of plan.cutCells) {
      const x = this.view.tx + cell.x * sx;
      const y = this.view.ty + cell.y * sy;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3);
      ctx.lineTo(x + sx - 3, y + sy - 3);
      ctx.moveTo(x + sx - 3, y + 3);
      ctx.lineTo(x + 3, y + sy - 3);
      ctx.stroke();
    }
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(this.view.tx, this.view.ty, plan.width * sx, plan.height * sy);
    ctx.restore();
  }

  private drawHover(ctx: CanvasRenderingContext2D): void {
    const cell = this.hover;
    if (!cell || this.panning || this.deps.blocked()) return;
    const { doc, tool } = this.deps.store;
    if (cell.x < 0 || cell.y < 0 || cell.x >= doc.width || cell.y >= doc.height) return;
    if (tool.tool === 'pan' || tool.tool === 'photo') return;
    const sx = this.view.scale;
    const sy = yScale(this.view);
    ctx.save();
    ctx.strokeStyle = 'rgba(216, 255, 106, 0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.view.tx + cell.x * sx + 1, this.view.ty + cell.y * sy + 1, sx - 2, sy - 2);
    ctx.restore();
  }

  // ── Проверки и справка ───────────────────────────────────────────────────

  /** Клетка в левом верхнем углу видимой области с учётом линейки (для вставки по умолчанию). */
  cellUnder(point: Pt): Pt {
    return cellAtScreen(this.view, point.x, point.y);
  }

  objectUnder(cell: Pt): string | null {
    return objectAt(this.deps.store.doc, cell.x, cell.y)?.id ?? null;
  }

  worldToScreen(wx: number, wy: number): Pt {
    return worldToScreen(this.view, wx, wy);
  }
}
