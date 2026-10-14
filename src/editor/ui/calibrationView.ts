import { defaultQuad, quadProblems } from '../calibration';
import type { Pt, Quad, ReferenceImage } from '../types';
import { button, el } from './el';
import type { PhotoCache } from './photos';

export interface CalibrationOptions {
  ref: ReferenceImage;
  bitmap: ImageBitmap;
  photos: PhotoCache;
  /** Размер игровой области в клетках профиля экрана и пропорция клетки. */
  columns: number;
  rows: number;
  cellRatio: number;
  onDone(quad: Quad): void;
  onCancel(): void;
}

const LABELS = ['1 · верхний левый', '2 · верхний правый', '3 · нижний правый', '4 · нижний левый'];
const HANDLE_RADIUS = 9;
const HIT_RADIUS = 16;

/**
 * Отметка четырёх углов игровой области на исходном снимке. Исходное фото не меняется:
 * результат — только четыре точки в пикселях файла, из которых строится выпрямленная подложка.
 * Пока открыт этот вид, рабочая карта скрыта и редактирование карты невозможно.
 */
export class CalibrationView {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly loupe: HTMLCanvasElement;
  private readonly preview: HTMLCanvasElement;
  private readonly message: HTMLElement;
  private readonly done: HTMLButtonElement;
  private readonly options: CalibrationOptions;
  private points: Pt[];
  private active = 0;
  private dragging = false;
  private fit = { scale: 1, x: 0, y: 0 };
  private previewTimer = 0;
  private readonly observer: ResizeObserver;

  constructor(options: CalibrationOptions) {
    this.options = options;
    const quad = options.ref.quad ?? defaultQuad(options.ref.width, options.ref.height);
    this.points = quad.map((p) => ({ x: p.x, y: p.y }));

    this.canvas = el('canvas', { class: 'calib__canvas', tabindex: '0', 'aria-label': 'Исходный кадр с четырьмя углами игровой области' });
    this.loupe = el('canvas', { class: 'calib__loupe', width: '128', height: '128', 'aria-hidden': 'true' });
    this.preview = el('canvas', { class: 'calib__preview', 'aria-label': 'Предпросмотр выпрямленной области' });
    this.message = el('p', { class: 'calib__message', role: 'status' });
    this.done = button('Готово', () => this.finish(), { class: 'btn btn--primary' });

    this.root = el(
      'div',
      { class: 'calib' },
      el(
        'div',
        { class: 'calib__top' },
        el('h3', {}, `Калибровка: ${options.ref.name}`),
        el(
          'p',
          { class: 'calib__help' },
          'Перетащите четыре маркера на углы игровой области кадра — без строки HUD, рамки и корпуса: 1 — верхний левый, 2 — верхний правый, 3 — нижний правый, 4 — нижний левый. Стрелки сдвигают выбранный маркер на 1 пиксель (Shift — на 10), клавиши 1–4 выбирают маркер.',
        ),
      ),
      el(
        'div',
        { class: 'calib__body' },
        this.canvas,
        el('div', { class: 'calib__side' }, el('div', { class: 'calib__label' }, 'Лупа'), this.loupe, el('div', { class: 'calib__label' }, `Предпросмотр ${options.columns}×${options.rows} клеток`), this.preview),
      ),
      el(
        'div',
        { class: 'calib__bottom' },
        this.message,
        el(
          'div',
          { class: 'calib__buttons' },
          button('Сбросить углы', () => this.reset()),
          button('Отмена', () => options.onCancel()),
          this.done,
        ),
      ),
    );

    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('keydown', this.onKey);
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(this.canvas);
    queueMicrotask(() => {
      this.layout();
      this.canvas.focus({ preventScroll: true });
    });
  }

  destroy(): void {
    this.observer.disconnect();
    window.clearTimeout(this.previewTimer);
  }

  private get quad(): Quad {
    return [this.points[0] as Pt, this.points[1] as Pt, this.points[2] as Pt, this.points[3] as Pt];
  }

  private reset(): void {
    const quad = defaultQuad(this.options.ref.width, this.options.ref.height);
    this.points = quad.map((p) => ({ x: p.x, y: p.y }));
    this.refresh();
  }

  private finish(): void {
    if (quadProblems(this.quad).length > 0) return;
    this.options.onDone(this.quad.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })) as unknown as Quad);
  }

  // ── Раскладка и координаты ───────────────────────────────────────────────

  private layout(): void {
    const box = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(160, Math.floor((box?.width ?? 600) - 190));
    const h = Math.max(160, Math.floor(Math.min(window.innerHeight * 0.62, (box?.height ?? 480) || 480)));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const { width, height } = this.options.ref;
    const scale = Math.min(w / width, h / height);
    this.fit = { scale, x: (w - width * scale) / 2, y: (h - height * scale) / 2 };
    this.preview.style.width = '176px';
    this.preview.style.height = `${Math.round((176 * this.options.rows * this.options.cellRatio) / this.options.columns)}px`;
    this.preview.width = 352;
    this.preview.height = Math.round((352 * this.options.rows * this.options.cellRatio) / this.options.columns);
    this.refresh();
  }

  private toScreen(p: Pt): Pt {
    return { x: this.fit.x + p.x * this.fit.scale, y: this.fit.y + p.y * this.fit.scale };
  }

  private toSource(x: number, y: number): Pt {
    const { width, height } = this.options.ref;
    return {
      x: Math.min(width, Math.max(0, (x - this.fit.x) / this.fit.scale)),
      y: Math.min(height, Math.max(0, (y - this.fit.y) / this.fit.scale)),
    };
  }

  private local(event: PointerEvent): Pt {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.clientWidth / (rect.width || 1)),
      y: (event.clientY - rect.top) * (this.canvas.clientHeight / (rect.height || 1)),
    };
  }

  // ── Ввод ─────────────────────────────────────────────────────────────────

  private readonly onDown = (event: PointerEvent): void => {
    const p = this.local(event);
    let best = -1;
    let bestDistance = HIT_RADIUS;
    this.points.forEach((point, i) => {
      const s = this.toScreen(point);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d <= bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    if (best < 0) return;
    this.active = best;
    this.dragging = true;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.focus({ preventScroll: true });
    this.refresh();
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const p = this.local(event);
    this.points[this.active] = this.toSource(p.x, p.y);
    this.refresh();
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.refresh();
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key >= '1' && event.key <= '4') {
      this.active = Number(event.key) - 1;
      this.refresh();
      event.preventDefault();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, Pt> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    const { width, height } = this.options.ref;
    const current = this.points[this.active] as Pt;
    this.points[this.active] = { x: Math.min(width, Math.max(0, current.x + d.x)), y: Math.min(height, Math.max(0, current.y + d.y)) };
    this.refresh();
  };

  // ── Рисование ────────────────────────────────────────────────────────────

  private refresh(): void {
    this.drawMain();
    this.drawLoupe();
    const problems = quadProblems(this.quad);
    this.message.textContent = problems[0] ?? 'Углы заданы корректно: четырёхугольник выпуклый, порядок обхода верный.';
    this.message.className = problems.length > 0 ? 'calib__message calib__message--error' : 'calib__message';
    this.done.disabled = problems.length > 0;
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.drawPreview(problems.length === 0), 120);
  }

  private drawMain(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.fillStyle = '#0e1113';
    ctx.fillRect(0, 0, w, h);
    const { width, height } = this.options.ref;
    ctx.drawImage(this.options.bitmap, this.fit.x, this.fit.y, width * this.fit.scale, height * this.fit.scale);

    const screen = this.points.map((p) => this.toScreen(p));
    ctx.save();
    ctx.beginPath();
    screen.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    const valid = quadProblems(this.quad).length === 0;
    ctx.fillStyle = valid ? 'rgba(126, 200, 255, 0.12)' : 'rgba(255, 90, 77, 0.18)';
    ctx.fill();
    ctx.strokeStyle = valid ? '#7ec8ff' : '#ff5a4d';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Равномерная сетка клеток внутри четырёхугольника (в перспективе — приближённая: линии между противоположными сторонами).
    ctx.strokeStyle = valid ? 'rgba(126, 200, 255, 0.35)' : 'rgba(255, 90, 77, 0.25)';
    ctx.lineWidth = 1;
    const [a, b, c, d] = screen as [Pt, Pt, Pt, Pt];
    for (let i = 1; i < this.options.columns; i++) {
      const t = i / this.options.columns;
      ctx.beginPath();
      ctx.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      ctx.lineTo(d.x + (c.x - d.x) * t, d.y + (c.y - d.y) * t);
      ctx.stroke();
    }
    for (let i = 1; i < this.options.rows; i++) {
      const t = i / this.options.rows;
      ctx.beginPath();
      ctx.moveTo(a.x + (d.x - a.x) * t, a.y + (d.y - a.y) * t);
      ctx.lineTo(b.x + (c.x - b.x) * t, b.y + (c.y - b.y) * t);
      ctx.stroke();
    }
    ctx.restore();

    screen.forEach((p, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = i === this.active ? '#d8ff6a' : '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#101418';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#101418';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.x, p.y + 0.5);
      ctx.restore();
      ctx.fillStyle = '#d8ff6a';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(LABELS[i] ?? '', p.x + 12, p.y - 12);
    });
  }

  private drawLoupe(): void {
    const ctx = this.loupe.getContext('2d');
    if (!ctx) return;
    const p = this.points[this.active] as Pt;
    const size = 16;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e1113';
    ctx.fillRect(0, 0, 128, 128);
    ctx.drawImage(this.options.bitmap, p.x - size / 2, p.y - size / 2, size, size, 0, 0, 128, 128);
    ctx.strokeStyle = '#d8ff6a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(64, 0);
    ctx.lineTo(64, 128);
    ctx.moveTo(0, 64);
    ctx.lineTo(128, 64);
    ctx.stroke();
  }

  private drawPreview(valid: boolean): void {
    const ctx = this.preview.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0e1113';
    ctx.fillRect(0, 0, this.preview.width, this.preview.height);
    if (!valid) return;
    const surface = this.options.photos.surface(
      { ...this.options.ref, quad: this.quad },
      this.options.columns,
      this.options.rows,
      { w: 32, h: Math.round(32 * this.options.cellRatio) },
    );
    if (!surface) return;
    ctx.drawImage(surface, 0, 0, this.preview.width, this.preview.height);
    ctx.strokeStyle = 'rgba(216, 255, 106, 0.6)';
    ctx.lineWidth = 1;
    for (let x = 1; x < this.options.columns; x++) {
      const px = Math.round((x / this.options.columns) * this.preview.width) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.preview.height);
      ctx.stroke();
    }
    for (let y = 1; y < this.options.rows; y++) {
      const py = Math.round((y / this.options.rows) * this.preview.height) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(this.preview.width, py);
      ctx.stroke();
    }
  }
}
