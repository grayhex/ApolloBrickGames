import {
  MAX_ZOOM,
  MIN_ZOOM,
  clamp,
  clampPitch,
  fitScale,
  normalDim,
  shortestDelta,
  wrapAngle,
  type BoxView,
} from './boxMath';
import { h } from './dom';
import { onLangChange, t } from './i18n';
import type { PackModel } from './packs';

/**
 * 3D-модель упаковки: грани-картинки (вырезаны из присланных фото упаковки, `public/brand/<каталог модели>`) на CSS-преобразованиях
 * `preserve-3d`, без библиотек и WebGL; модели («коробка» «168 в 1 танк», блистерная карточка Crocodile Mario) описаны в `packs.ts`. Вращение — мышью или пальцем (с инерцией), стрелками; колесо и «+/−» — масштаб; освещение пересчитывается
 * при каждом повороте (тёмный слой на грани), поэтому гранёность видна и на плоских картинках. Углы и яркость — в `boxMath.ts`.
 */
const faceUrl = (model: PackModel, file: string): string => `${import.meta.env.BASE_URL}brand/${model.dir}/${file}`;

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Градусов поворота на пиксель перетаскивания. */
const DRAG_SPEED = 0.5;
/** Шаг поворота и масштаба с клавиатуры. */
const KEY_YAW = 12;
const KEY_PITCH = 10;
const KEY_ZOOM = 1.15;
/** Медленное вращение над миниатюрой, градусов в секунду. */
const SPIN_DEG_PER_S = 38;

export interface BoxViewerOptions {
  /** Какую упаковку показывать. */
  model: PackModel;
  /** Вращается пальцем, мышью и клавишами (в диалоге); миниатюра в панели — нет. */
  interactive: boolean;
  /** Колесо и «+/−» меняют масштаб. */
  zoomable?: boolean;
  /** Начальные углы и масштаб (например, чтобы сохранить вид при смене языка). */
  view?: BoxView;
  zoom?: number;
  signal?: AbortSignal;
}

export class BoxViewer {
  readonly element: HTMLElement;
  private readonly faces = new Map<string, HTMLElement>();
  private readonly observer: ResizeObserver | null;
  private readonly model: PackModel;
  private readonly interactive: boolean;
  private readonly signal: AbortSignal | undefined;
  private readonly onAbort = (): void => this.dispose();
  private readonly zoomable: boolean;
  private yaw: number;
  private pitch: number;
  private zoomValue: number;
  private frame = 0;
  private tween: { from: BoxView; to: BoxView; start: number; duration: number } | null = null;
  private spinning = false;
  private spinAt = 0;
  private velocity = { yaw: 0, pitch: 0 };
  private drag: { id: number; x: number; y: number; at: number } | null = null;
  /** Время последнего сдвига пальца: если перед отпусканием он стоял, инерции нет. */
  private lastMove = 0;

  constructor(options: BoxViewerOptions) {
    this.model = options.model;
    this.interactive = options.interactive;
    this.zoomable = options.zoomable ?? false;
    const view = options.view ?? this.model.home;
    this.yaw = view.yaw;
    this.pitch = view.pitch;
    this.zoomValue = options.zoom ?? 1;

    const scene = h('div', { class: 'box3d__scene' });
    for (const { id, image } of this.model.faces) {
      const face = h('i', { class: `box3d__face box3d__face--${id}`, 'data-face': id });
      if (image) face.style.backgroundImage = `url("${faceUrl(this.model, image)}")`;
      this.faces.set(id, face);
      scene.append(face);
    }
    this.element = h(
      'div',
      { class: `box3d${this.interactive ? ' box3d--live' : ''}`, 'data-box3d': this.interactive ? 'live' : 'thumb', 'data-pack': this.model.id },
      scene,
    );
    if (this.interactive) {
      this.element.tabIndex = 0;
      this.element.setAttribute('role', 'img');
      this.element.setAttribute('aria-label', t(this.model.text.aria));
      this.bindInput(options.signal);
    } else {
      this.element.setAttribute('aria-hidden', 'true');
    }

    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.fit()) : null;
    this.observer?.observe(this.element);
    this.signal = options.signal;
    this.signal?.addEventListener('abort', this.onAbort, { once: true });
    this.fit();
    this.apply();
  }

  get currentView(): BoxView {
    return { yaw: this.yaw, pitch: this.pitch };
  }

  get zoom(): number {
    return this.zoomValue;
  }

  /** Мгновенно поставить углы (без анимации). */
  setView(view: BoxView): void {
    this.cancelMotion();
    this.yaw = wrapAngle(view.yaw);
    this.pitch = clampPitch(view.pitch);
    this.apply();
  }

  /** Плавно повернуть к заданным углам по кратчайшей дуге (при «уменьшении движения» — сразу). */
  goTo(target: BoxView, duration = 480): void {
    if (prefersReducedMotion()) {
      this.setView(target);
      return;
    }
    this.cancelMotion();
    this.tween = { from: this.currentView, to: { yaw: target.yaw, pitch: clampPitch(target.pitch) }, start: performance.now(), duration };
    this.schedule();
  }

  goToPreset(name: string): void {
    const preset = this.model.presets.find((item) => item.name === name);
    if (preset) this.goTo(preset.view);
  }

  reset(): void {
    this.setZoom(1);
    this.goTo(this.model.home);
  }

  setZoom(zoom: number): void {
    this.zoomValue = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.fit();
  }

  /** Медленное вращение над миниатюрой, пока на неё наведён указатель или фокус (при «уменьшении движения» не включается). */
  setSpin(on: boolean): void {
    if (on === this.spinning || (on && prefersReducedMotion())) return;
    this.spinning = on;
    if (on) {
      this.cancelMotion();
      this.spinning = true;
      this.spinAt = performance.now();
      this.schedule();
    } else {
      this.goTo(this.model.home, 600);
    }
  }

  dispose(): void {
    this.cancelMotion();
    this.observer?.disconnect();
    this.signal?.removeEventListener('abort', this.onAbort);
  }

  // ── Вывод ───────────────────────────────────────────────────────────

  private apply(): void {
    const view = this.currentView;
    this.element.style.setProperty('--ry', `${this.yaw.toFixed(2)}deg`);
    this.element.style.setProperty('--rx', `${this.pitch.toFixed(2)}deg`);
    for (const { id, normal, lit } of this.model.faces) {
      if (lit !== false) this.faces.get(id)?.style.setProperty('--dim', String(normalDim(normal, view)));
    }
    this.element.dataset['yaw'] = String(Math.round(this.yaw));
    this.element.dataset['pitch'] = String(Math.round(this.pitch));
  }

  private fit(): void {
    const { clientWidth, clientHeight } = this.element;
    const scale = fitScale(clientWidth, clientHeight, this.zoomValue, this.model.size);
    this.element.style.setProperty('--s', scale.toFixed(4));
    this.element.dataset['zoom'] = this.zoomValue.toFixed(2);
  }

  // ── Движение ────────────────────────────────────────────────────────

  private cancelMotion(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.tween = null;
    this.spinning = false;
    this.velocity = { yaw: 0, pitch: 0 };
  }

  private schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    this.frame = 0;
    if (this.tween) {
      const { from, to, start, duration } = this.tween;
      const k = clamp((now - start) / duration, 0, 1);
      const eased = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      this.yaw = wrapAngle(from.yaw + shortestDelta(from.yaw, to.yaw) * eased);
      this.pitch = from.pitch + (to.pitch - from.pitch) * eased;
      this.apply();
      if (k < 1) this.schedule();
      else this.tween = null;
      return;
    }
    if (this.spinning) {
      this.yaw = wrapAngle(this.yaw + (SPIN_DEG_PER_S * Math.min(now - this.spinAt, 64)) / 1000);
      this.spinAt = now;
      this.apply();
      this.schedule();
      return;
    }
    // Инерция после броска: скорость в градусах за кадр затухает.
    const { yaw, pitch } = this.velocity;
    if (Math.abs(yaw) > 0.02 || Math.abs(pitch) > 0.02) {
      this.yaw = wrapAngle(this.yaw + yaw);
      this.pitch = clampPitch(this.pitch + pitch);
      this.velocity = { yaw: yaw * 0.93, pitch: pitch * 0.93 };
      this.apply();
      this.schedule();
    } else {
      this.velocity = { yaw: 0, pitch: 0 };
    }
  }

  // ── Ввод ────────────────────────────────────────────────────────────

  private bindInput(signal?: AbortSignal): void {
    const el = this.element;
    el.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        this.cancelMotion();
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
        el.setPointerCapture(event.pointerId);
        el.dataset['dragging'] = '';
      },
      { signal },
    );
    el.addEventListener(
      'pointermove',
      (event) => {
        const drag = this.drag;
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        const dt = Math.max(1, event.timeStamp - drag.at);
        this.yaw = wrapAngle(this.yaw + dx * DRAG_SPEED);
        this.pitch = clampPitch(this.pitch - dy * DRAG_SPEED);
        // Скорость в градусах за кадр (≈ 16 мс) — для инерции после отпускания.
        this.velocity = { yaw: ((dx * DRAG_SPEED) / dt) * 16, pitch: ((-dy * DRAG_SPEED) / dt) * 16 };
        this.drag = { id: drag.id, x: event.clientX, y: event.clientY, at: event.timeStamp };
        this.lastMove = event.timeStamp;
        this.apply();
      },
      { signal },
    );
    const release = (event: PointerEvent): void => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      this.drag = null;
      delete el.dataset['dragging'];
      // Бросок: палец остановился перед отпусканием — инерции нет.
      if (event.timeStamp - this.lastMove > 90 || prefersReducedMotion()) this.velocity = { yaw: 0, pitch: 0 };
      if (this.velocity.yaw !== 0 || this.velocity.pitch !== 0) this.schedule();
    };
    el.addEventListener('pointerup', release, { signal });
    el.addEventListener('pointercancel', release, { signal });
    el.addEventListener('dblclick', () => this.reset(), { signal });
    if (this.zoomable) {
      el.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
          this.setZoom(this.zoomValue * Math.exp(-event.deltaY * 0.0012));
        },
        { passive: false, signal },
      );
    }
    el.addEventListener(
      'keydown',
      (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const step = (dYaw: number, dPitch: number): void => {
          this.goTo({ yaw: this.yaw + dYaw, pitch: this.pitch + dPitch }, 160);
        };
        switch (event.key) {
          case 'ArrowLeft':
            step(-KEY_YAW, 0);
            break;
          case 'ArrowRight':
            step(KEY_YAW, 0);
            break;
          case 'ArrowUp':
            step(0, -KEY_PITCH);
            break;
          case 'ArrowDown':
            step(0, KEY_PITCH);
            break;
          case '+':
          case '=':
            if (this.zoomable) this.setZoom(this.zoomValue * KEY_ZOOM);
            break;
          case '-':
          case '_':
            if (this.zoomable) this.setZoom(this.zoomValue / KEY_ZOOM);
            break;
          case 'Home':
          case '0':
            this.reset();
            break;
          default:
            return;
        }
        event.preventDefault();
        event.stopPropagation();
      },
      { signal },
    );
  }
}

export interface BoxDialogHooks {
  onOpen(): void;
  onClose(): void;
}

/** Диалог «Рассмотреть коробку»: крупная модель, кнопки видов, подсказка. Пока он открыт, игра стоит на паузе (как у справки). */
export class BoxDialog {
  private readonly model: PackModel;
  private viewer: BoxViewer | null = null;
  private view: BoxView;
  private zoom = 1;
  /** Приложение снято (игрушка переключена, в том числе кнопками «назад»/«вперёд»): диалог закрыт и обработчики прежней игрушки не вызываются. */
  private disposed = false;

  private readonly dialog: HTMLDialogElement;
  private readonly hooks: BoxDialogHooks;

  constructor(dialog: HTMLDialogElement, model: PackModel, hooks: BoxDialogHooks, signal?: AbortSignal) {
    this.dialog = dialog;
    this.hooks = hooks;
    this.model = model;
    this.view = model.home;
    dialog.addEventListener('close', () => {
      if (!this.disposed) this.hooks.onClose();
    }, { signal });
    dialog.addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        this.close();
      },
      { signal },
    );
    onLangChange(() => {
      if (this.dialog.open) this.render();
    }, signal);
    // Диалог общий для страницы: если игрушку сняли, пока он открыт, закрыть его, а не оставить поверх новой.
    signal?.addEventListener('abort', () => this.dispose(), { once: true });
  }

  /** Закрыть диалог и снять просмотрщик, не трогая игру (она уже снята вместе с приложением). */
  dispose(): void {
    this.disposed = true;
    this.viewer?.dispose();
    this.viewer = null;
    if (this.dialog.open) this.dialog.close();
    this.dialog.replaceChildren(); // содержимое прежней игрушки не должно остаться в общем элементе
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  open(): void {
    if (this.dialog.open) return;
    this.hooks.onOpen();
    this.view = this.model.home;
    this.zoom = 1;
    this.render();
    this.dialog.showModal();
    this.viewer?.element.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.dialog.open) return;
    this.viewer?.dispose();
    this.viewer = null;
    this.dialog.close();
    this.hooks.onClose();
  }

  private render(): void {
    if (this.viewer) {
      this.view = this.viewer.currentView;
      this.zoom = this.viewer.zoom;
      this.viewer.dispose();
    }
    const model = this.model;
    const viewer = new BoxViewer({ model, interactive: true, zoomable: true, view: this.view, zoom: this.zoom });
    this.viewer = viewer;
    this.dialog.setAttribute('aria-labelledby', 'box-title');
    this.dialog.dataset['pack'] = model.id;
    const buttons = model.presets.map(({ name, label }) => {
      const button = h('button', { type: 'button', class: 'btn box__view', 'data-view': name }, t(label));
      button.addEventListener('click', () => viewer.goToPreset(name));
      return button;
    });
    const reset = h('button', { type: 'button', class: 'btn box__view', 'data-view': 'home' }, t('box.reset'));
    reset.addEventListener('click', () => viewer.reset());
    const close = h('button', { type: 'button', class: 'btn btn--primary' }, t('common.close'));
    close.addEventListener('click', () => this.close());
    this.dialog.replaceChildren(
      h('h2', { id: 'box-title' }, t(model.text.title)),
      h('div', { class: 'box__stage' }, viewer.element),
      h('p', { class: 'help__text box__hint' }, t('box.hint')),
      h('div', { class: 'box__views', role: 'group', 'aria-label': t('box.views') }, ...buttons, reset),
      h('p', { class: 'help__text box__credit' }, t(model.text.credit)),
      h('div', { class: 'settings__row settings__row--end' }, close),
    );
  }
}
