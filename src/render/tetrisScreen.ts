import { cellsOf, FIELD_COLUMNS, FIELD_ROWS, type PieceKind } from '../tetris';

/**
 * Экран «Часов+99» и «Морского боя» (заглушка-тетрис): LCD с матрицей 10 × 20 и боковой панелью, как на фотографиях оригинала —
 * рекорд или счёт семью цифрами, нота (звук), NEXT 4 × 4, SPEED, LEVEL. У «Часов+99» сверху панели ещё значки PM, часов и игры,
 * у «Морского боя» внизу — чашка. Это не картинки, а сегменты: включённые рисуются чернилами, остальные — бледным «призраком»
 * (слой «Сегменты»), как у настоящего жидкокристалла. Рисунок ячейки: звёздочка («Часы+99») или точка в прямоугольнике («Морской бой»).
 * Холст логический 264 × 320 (ячейка 16), масштабируется под окно без растяжения; фон даёт само окно (`--lcd-bg`).
 */

export const SCREEN_WIDTH = 264;
export const SCREEN_HEIGHT = 320;
const CELL = 16;
const PANEL_CX = 216; // середина боковой панели
const DIVIDER_X = 162;

export type TetrisGlyph = 'star' | 'square';
/**
 * Боковая панель: у «Часов+99» значки режима сверху, у «Морского боя» чашка внизу; у «168 в 1 танк» (по фотографиям) чашка внизу — значок паузы
 * (горит на паузе и при полной заливке). У обеих игрушек с чашкой (по фотографиям) NEXT — сегмент (горит, когда у игры есть превью), а старшая цифра счёта,
 * SPEED и LEVEL умеет показывать только «1».
 */
export type TetrisPanel = 'clock' | 'sea' | 'tank' | 'classic';

export interface TetrisScreenOptions {
  glyph: TetrisGlyph;
  panel: TetrisPanel;
  /** Цвет включённых сегментов. */
  ink: string;
}

export interface TetrisScene {
  /** Поле с фигурой на нём: FIELD_COLUMNS × FIELD_ROWS, 0 — пусто. */
  cells: Uint8Array;
  /** Сгорающие ряды (мигают) и сколько тактов анимации осталось. */
  clearRows: readonly number[];
  clearTimer: number;
  /** Конец игры: сколько рядов снизу уже залито. */
  overFill: number;
  next: PieceKind | null;
  score: number;
  hiScore: number;
  speed: number;
  level: number;
  sound: boolean;
  phase: 'ready' | 'playing' | 'paused' | 'over';
  tick: number;
  /** Все сегменты включены (вспышка при включении игрушки). */
  allOn: boolean;
  /** Игры консоли с меню: превью 4 × 4 (16 значений) или `null`, если превью нет (NEXT не горит). Если поле задано, `next` не используется. */
  preview?: Uint8Array | null;
  /** Игры консоли с меню: значение клетки (матрицы и превью), которое мигает (у этих игр — 2). */
  blinkValue?: number;
}

/** Мигающие клетки: полпериода в тактах. */
const BLINK_HALF_TICKS = 15;

// Сегменты цифры: a (верх), b (верх-право), c (низ-право), d (низ), e (низ-лево), f (верх-лево), g (середина).
const DIGITS: readonly string[] = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

const GHOST_ALPHA = 0.12;

/** Хэш для «рассыпания» экрана (детерминированный, без Math.random). */
function hash(a: number, b: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
}

export class TetrisScreen {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly options: TetrisScreenOptions;
  private ghost = false;
  private blank = false;
  private signature = '';
  private previousCells = new Uint8Array(0);
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(canvas: HTMLCanvasElement, options: TetrisScreenOptions) {
    this.canvas = canvas;
    this.options = options;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D недоступен');
    this.ctx = ctx;
  }

  /** Есть ли слой неактивных сегментов (у этого экрана — всегда). */
  get hasGhostLayer(): boolean {
    return true;
  }

  setGhost(on: boolean): void {
    if (this.ghost !== on) this.signature = '';
    this.ghost = on;
  }

  /** Размер окна в CSS-пикселях и плотность пикселей: холст вписывается без растяжения. */
  resize(width: number, height: number, dpr: number): void {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    this.signature = '';
    this.blank = false;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.scale = Math.min(w / SCREEN_WIDTH, h / SCREEN_HEIGHT);
    this.offsetX = (w - SCREEN_WIDTH * this.scale) / 2;
    this.offsetY = (h - SCREEN_HEIGHT * this.scale) / 2;
  }

  clear(): void {
    this.signature = '';
    if (this.blank) return;
    this.blank = true;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Шутка со шлейфом: куски экрана гаснут (`level` 0…1); зерно меняется — куски мерцают. */
  dropout(level: number, seed: number): void {
    // The next frame must restore the undamaged image even if the game did not change.
    this.signature = '';
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    const count = Math.round(level * 260);
    for (let i = 0; i < count; i++) {
      const x = Math.floor(hash(seed, i * 2) * SCREEN_WIDTH);
      const y = Math.floor(hash(seed, i * 2 + 1) * SCREEN_HEIGHT);
      const w = 6 + Math.floor(hash(i, seed) * 26);
      const h = 4 + Math.floor(hash(seed + 7, i) * 12);
      ctx.fillRect(this.offsetX + x * this.scale, this.offsetY + y * this.scale, w * this.scale, h * this.scale);
    }
    ctx.restore();
  }

  render(scene: TetrisScene): void {
    // Compare visible state, not simulation ticks: an unmoved piece needs no repaint.
    const blink = scene.clearTimer > 0 && Math.floor(scene.clearTimer / 4) % 2 === 1;
    const hi = scene.phase === 'over' && scene.overFill >= FIELD_ROWS ? Math.floor(scene.tick / 90) % 2 : 0;
    const blinkOn = scene.blinkValue === undefined || Math.floor(scene.tick / BLINK_HALF_TICKS) % 2 === 0;
    const hasPreview = scene.preview !== undefined && scene.preview !== null;
    const dance = this.options.panel === 'classic' && scene.phase === 'playing' ? Math.floor(scene.tick / 30) % 2 : 0;
    const signature = `${dance}|${blink}|${scene.clearRows.join(',')}|${scene.overFill}|${scene.next}|${scene.score}|${scene.hiScore}|${scene.speed}|${scene.level}|${scene.sound}|${scene.phase}|${scene.allOn}|${hi}|${blinkOn}|${hasPreview}|${scene.preview?.join('') ?? ''}`;
    if (
      signature === this.signature &&
      scene.cells.length === this.previousCells.length &&
      scene.cells.every((cell, i) => cell === this.previousCells[i])
    )
      return;
    const ctx = this.ctx;
    this.clear();
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    ctx.fillStyle = this.options.ink;
    ctx.strokeStyle = this.options.ink;
    this.drawMatrix(scene);
    ctx.globalAlpha = 1;
    ctx.fillRect(DIVIDER_X, 0, 1.4, SCREEN_HEIGHT);
    this.drawPanel(scene);
    ctx.globalAlpha = 1;
    this.blank = false;
    this.signature = signature;
    this.previousCells = scene.cells.slice();
  }

  // ── Матрица ────────────────────────────────────────────────────────────
  private drawMatrix(scene: TetrisScene): void {
    const blinkOff = scene.clearTimer > 0 && Math.floor(scene.clearTimer / 4) % 2 === 1;
    const blinkHidden = scene.blinkValue !== undefined && Math.floor(scene.tick / BLINK_HALF_TICKS) % 2 === 1 && !scene.allOn;
    for (let y = 0; y < FIELD_ROWS; y++) {
      const clearing = scene.clearRows.includes(y);
      for (let x = 0; x < FIELD_COLUMNS; x++) {
        const value = scene.cells[y * FIELD_COLUMNS + x] ?? 0;
        let lit = scene.allOn || value !== 0;
        if (blinkHidden && value === scene.blinkValue) lit = false;
        if (clearing && blinkOff) lit = false;
        if (scene.overFill > 0 && y >= FIELD_ROWS - scene.overFill) lit = true;
        this.cell(x * CELL, y * CELL, CELL, lit);
      }
    }
  }

  /** Одна ячейка: включённая — полным рисунком, выключенная — бледным (если слой сегментов включён). */
  private cell(x: number, y: number, size: number, lit: boolean): void {
    if (!lit && !this.ghost) return;
    const ctx = this.ctx;
    ctx.globalAlpha = lit ? 1 : GHOST_ALPHA;
    if (this.options.glyph === 'star') {
      // Рамка ячейки и звёздочка-«цветок» из шести лепестков.
      ctx.lineWidth = 0.9;
      ctx.strokeRect(x + 0.7, y + 0.7, size - 1.4, size - 1.4);
      const cx = x + size / 2;
      const cy = y + size / 2;
      const r = size * 0.36;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + Math.PI / 6;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.55, r * 0.24, a, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Прямоугольник и точка в нём.
      ctx.lineWidth = size * 0.11;
      ctx.strokeRect(x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8);
      ctx.fillRect(x + size * 0.34, y + size * 0.34, size * 0.32, size * 0.32);
    }
    ctx.globalAlpha = 1;
  }

  // ── Боковая панель ─────────────────────────────────────────────────────
  private drawPanel(scene: TetrisScene): void {
    const ctx = this.ctx;
    const sea = this.options.panel !== 'clock'; // раскладка «Морского боя»: без значков сверху, внизу значок игры
    const tank = this.options.panel === 'tank'; // «168 в 1 танк»: чашка — значок паузы (по фотографиям оригинала)
    const lcd = sea && this.options.panel !== 'classic'; // «Морской бой» и «168 в 1 танк» — один LCD: старшие цифры только «1», NEXT — сегмент (по фотографиям обоих)
    const all = scene.allOn;
    const showHi = scene.phase === 'ready' || (scene.phase === 'over' && scene.overFill >= FIELD_ROWS && Math.floor(scene.tick / 90) % 2 === 1);
    const value = showHi ? scene.hiScore : scene.score;
    const segmentAlpha = (on: boolean): number => (on ? 1 : this.ghost ? GHOST_ALPHA : 0);

    // «Часы+99»: значки режима сверху панели; в игре горит значок игры, часов у заглушки нет (чёрточка и PM — бледные).
    const top = sea ? 0 : 30;
    if (!sea) {
      this.text('PM', 176, 19, 12, this.ghost || all ? (all ? 1 : GHOST_ALPHA) : 0, 'left');
      this.clockIcon(216, 14, all ? 1 : this.ghost ? GHOST_ALPHA : 0);
      this.pieceIcon(250, 14, scene.phase === 'ready' && !all ? (this.ghost ? GHOST_ALPHA : 0) : 1);
      this.ctx.globalAlpha = 1;
      this.ctx.fillRect(DIVIDER_X, 28, SCREEN_WIDTH - DIVIDER_X, 1.2);
    }

    // Счёт или рекорд: подпись и семь цифр (у «168 в 1» старшая цифра — только «1»: счёт до 1 999 999).
    this.text(showHi || all ? 'HI-SCORE' : 'SC', PANEL_CX, top + 11, 9.5, 1, 'center');
    const shown = lcd ? Math.min(value, 1_999_999) : Math.min(value, 9_999_999);
    this.number(String(shown).padStart(7, '0'), 7, 171, top + 16, 11, 20, all, false, lcd);
    this.note(PANEL_CX, top + (sea ? 54 : 58), all || scene.sound);

    // NEXT 4 × 4. У «168 в 1» подпись и сетка — сегменты: горят, когда у игры есть превью (следующая фигура, жизни).
    const nextTop = sea ? 84 : 112;
    const previewOn = scene.preview !== undefined ? scene.preview !== null : true;
    this.text('NEXT', PANEL_CX, nextTop - 6, 9.5, lcd ? segmentAlpha(all || previewOn) : 1, 'center');
    const shape = scene.next && scene.phase !== 'ready' ? cellsOf(scene.next, 0) : [];
    const blinkHidden = scene.blinkValue !== undefined && Math.floor(scene.tick / BLINK_HALF_TICKS) % 2 === 1;
    const size = 15;
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        let lit: boolean;
        if (scene.preview !== undefined) {
          const cell = scene.preview?.[gy * 4 + gx] ?? 0;
          lit = all || (cell !== 0 && !(blinkHidden && cell === scene.blinkValue));
        } else {
          lit = all || shape.some(([dx, dy]) => dx === gx && dy === gy);
        }
        this.cell(PANEL_CX - 30 + gx * size, nextTop + gy * size, size, lit);
      }
    }

    // SPEED и LEVEL: два двузначных числа и подписи.
    const speedLabel = nextTop + 60 + 20;
    this.text('SPEED', PANEL_CX, speedLabel, 9.5, 1, 'center');
    this.number(String(scene.speed).padStart(2, '0'), 2, PANEL_CX - 17, speedLabel + 6, 14, 24, all, true, lcd);
    this.number(String(scene.level).padStart(2, '0'), 2, PANEL_CX - 17, speedLabel + 6 + 31, 14, 24, all, true, lcd);
    this.text('LEVEL', PANEL_CX, speedLabel + 6 + 31 + 24 + 14, 9.5, 1, 'center');

    // Чашка в углу панели. У «Морского боя» — виден при включении и на экране ожидания; у «168 в 1» — значок паузы: горит на паузе и при полной заливке.
    if (this.options.panel === 'classic') {
      const dancing = scene.phase === 'playing' && Math.floor(scene.tick / 30) % 2 === 1;
      const pixels = dancing
        ? ['001100', '001100', '101101', '011110', '001100', '010010', '100001']
        : ['001100', '001100', '001101', '111110', '001100', '001010', '010010'];
      ctx.globalAlpha = segmentAlpha(all || scene.phase !== 'over');
      pixels.forEach((row, y) =>
        [...row].forEach((pixel, x) => {
          if (pixel === '1') ctx.fillRect(PANEL_CX - 9 + x * 3, 282 + y * 3, 3, 3);
        }),
      );
    } else if (sea) {
      const on = tank ? all || scene.phase === 'paused' : all || scene.phase === 'ready';
      this.cup(PANEL_CX, 296, segmentAlpha(on));
    }
  }

  private text(text: string, x: number, baseline: number, size: number, alpha: number, align: CanvasTextAlign): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, baseline);
    ctx.globalAlpha = 1;
  }

  /** Число из `count` цифр; у `blankZero` ведущий ноль не горит (двузначные SPEED и LEVEL). */
  private number(text: string, count: number, x: number, y: number, w: number, h: number, all: boolean, blankZero = false, onesFirst = false): void {
    const step = w + (w >= 14 ? 3 : 2.2);
    for (let i = 0; i < count; i++) {
      const ch = text[i] ?? '0';
      // Старшая цифра, которая умеет показывать только «1» (два сегмента), гаснет вместо нуля.
      const onesOnly = onesFirst && i === 0;
      const blank = (blankZero || onesOnly) && i === 0 && ch === '0';
      this.digit(x + i * step, y, w, h, blank ? null : Number(ch), all, onesOnly);
    }
  }

  /** Семь сегментов; слегка наклонены, как на LCD. `value === null` — цифра погашена (бледный «8» остаётся в слое сегментов). */
  private digit(x: number, y: number, w: number, h: number, value: number | null, all: boolean, onesOnly = false): void {
    const ctx = this.ctx;
    const existing = onesOnly ? 'bc' : 'abcdefg'; // сегменты, которые у цифры есть физически
    const lit = all ? existing : value === null ? '' : (DIGITS[value] ?? '');
    const t = Math.max(1.6, w * 0.19);
    const half = h / 2;
    const seg: Record<string, [number, number, number, number]> = {
      a: [x + t * 0.6, y, w - t * 1.2, t],
      g: [x + t * 0.6, y + half - t / 2, w - t * 1.2, t],
      d: [x + t * 0.6, y + h - t, w - t * 1.2, t],
      f: [x, y + t * 0.6, t, half - t * 0.9],
      b: [x + w - t, y + t * 0.6, t, half - t * 0.9],
      e: [x, y + half + t * 0.3, t, half - t * 0.9],
      c: [x + w - t, y + half + t * 0.3, t, half - t * 0.9],
    };
    ctx.save();
    ctx.transform(1, 0, -0.1, 1, y * 0.1, 0); // наклон: нижний край остаётся на месте
    for (const name of existing) {
      const on = lit.includes(name);
      if (!on && !this.ghost) continue;
      const box = seg[name];
      if (!box) continue;
      ctx.globalAlpha = on ? 1 : GHOST_ALPHA;
      ctx.fillRect(box[0], box[1], box[2], box[3]);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private note(cx: number, cy: number, on: boolean): void {
    if (!on && !this.ghost) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = on ? 1 : GHOST_ALPHA;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(cx - 3.5, cy + 5, 3.8, 2.7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 0.3, cy + 4.4);
    ctx.lineTo(cx - 0.3, cy - 8);
    ctx.bezierCurveTo(cx + 2, cy - 6, cx + 6, cy - 5, cx + 5, cy - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  private cup(cx: number, cy: number, alpha: number): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath(); // блюдце
    ctx.ellipse(cx, cy + 10, 17, 3.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath(); // чашка
    ctx.moveTo(cx - 11, cy - 3);
    ctx.lineTo(cx + 9, cy - 3);
    ctx.bezierCurveTo(cx + 9, cy + 10, cx - 11, cy + 10, cx - 11, cy - 3);
    ctx.fill();
    ctx.beginPath(); // ручка
    ctx.arc(cx + 11, cy + 1.5, 4, -1.2, 1.5);
    ctx.stroke();
    for (const dx of [-6, -1, 4]) {
      ctx.beginPath(); // пар
      ctx.moveTo(cx + dx, cy - 6);
      ctx.bezierCurveTo(cx + dx - 3, cy - 9, cx + dx + 3, cy - 11, cx + dx, cy - 15);
      ctx.stroke();
    }
    ctx.restore();
  }

  private clockIcon(cx: number, cy: number, alpha: number): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 4, cy + 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Значок «игра» — фигурка-тетромино из точек, как на фото. */
  private pieceIcon(cx: number, cy: number, alpha: number): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 7);
    ctx.lineTo(cx - 9, cy - 5);
    ctx.lineTo(cx + 3, cy - 5);
    ctx.lineTo(cx + 3, cy + 1);
    ctx.lineTo(cx + 9, cy + 1);
    ctx.lineTo(cx + 9, cy + 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(cx - 1, cy - 1, 3.4, 3.4);
    ctx.restore();
  }
}
