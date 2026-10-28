import layout from '../../scripts/research/prince118-layout.json';
import { MiniLcd, type LcdView } from '../render/miniScreen';
import { h, svg } from './dom';
import './native.css';
import './prince.css';

/**
 * Prince 皇太子 (118 in 1): корпус — цельный «кирпич» (не раскладушка). Статичная часть собрана в `body.webp` (`scripts/research/prince_build.py`): верх — снимок передней панели оригинала (рамка с декалями
 * и тиснением, прозрачное окно под экран), ниже — нижняя часть с подписями кнопок и наклейкой по фото; `lid.webp` — только рамка для вида «только экран». Каждая из девяти кнопок — отдельный спрайт с обводкой и своей «нажатой» копией,
 * а область нажатия повторяет форму кнопки (веер, капсула, круг). Экран — живой ЖК как у Mini Brick B-S96, но без шкалы фруктов (`MiniLcd({ scale: false })`).
 */
const W = layout.body.width;
const H = layout.body.height;
const BASE = import.meta.env.BASE_URL;
const BODY = `${BASE}devices/prince118/body.webp`;
const LID = `${BASE}devices/prince118/lid.webp`;
/** Цвет стекла и «чернил» ЖК по фото оригинала. */
export const PRINCE_LCD = { bg: '#b9bcab', ink: '#2c3430' } as const;

type KeyName = keyof typeof layout.keys;
const KEY_NAMES = Object.keys(layout.keys) as KeyName[];
/** Кнопка Prince → кнопка игрушки (`data-key`): RESET — `fire` (возврат в автоплей), большая ROTATE — `jump`, 开关 — `onoff`. */
const TOY_KEY: Readonly<Record<KeyName, string>> = { up: 'up', right: 'right', down: 'down', left: 'left', rotate: 'jump', reset: 'fire', sp: 'sp', sound: 'sound', power: 'onoff' };
const LABEL: Readonly<Record<KeyName, string>> = { up: 'UP', right: 'RIGHT', down: 'DOWN', left: 'LEFT', rotate: 'ROTATE', reset: 'RESET', sp: 'START/PAUSE', sound: 'SOUND', power: 'ON/OFF' };

const place = (box: { x: number; y: number; w: number; h: number }): string =>
  `left:${(box.x / W) * 100}%;top:${(box.y / H) * 100}%;width:${(box.w / W) * 100}%;height:${(box.h / H) * 100}%;`;

/** Кнопка и её рисунок: прозрачная область нажатия по силуэту и спрайт (обычный и нажатый) под ней. */
function keyPair(name: KeyName): [HTMLButtonElement, HTMLSpanElement] {
  const spec = layout.keys[name];
  const clip = `polygon(${spec.clip.map(([x, y]) => `${x}% ${y}%`).join(',')})`;
  const button = h('button', { type: 'button', class: 'key native__key pr__key', 'data-key': TOY_KEY[name], 'aria-label': LABEL[name], tabindex: '-1', style: `${place(spec)}--pr-clip:${clip};` });
  const art = h(
    'span',
    { class: 'pr__art', 'aria-hidden': 'true', 'data-art': name, style: place(spec) },
    h('img', { class: 'pr__up', src: `${BASE}devices/prince118/keys/${name}.svg`, alt: '', draggable: 'false', decoding: 'async' }),
    h('img', { class: 'pr__dn', src: `${BASE}devices/prince118/keys/${name}-pressed.svg`, alt: '', draggable: 'false', decoding: 'async' }),
  );
  return [button, art];
}

/**
 * Корпус, кнопки и экран на странице. Размеры раскладки идут в долях ширины игрушки (`cqw`): положение окна — `--native-lcd-*`, высота верхней части до шва — `--pr-lid-h`
 * (в виде «только экран» остаётся только она, нижняя часть и кнопки скрыты).
 */
export function applyPrinceModel(): LcdView {
  const toy = document.getElementById('toy')!;
  const arena = document.getElementById('arena')!;
  for (const el of [toy, arena]) {
    el.dataset['model'] = 'prince118';
    el.dataset['chassis'] = 'native';
    el.dataset['shell'] = 'white';
  }
  document.body.dataset['toy'] = 'prince118';
  document.title = 'Prince 皇太子 · 118 in 1';
  toy.style.setProperty('--native-body', `url("${BODY}")`);
  toy.style.setProperty('--native-height', `${(H / W) * 100}cqw`);
  const screen = layout.screen;
  for (const [name, value] of Object.entries({ x: screen.x, y: screen.y, w: screen.w, h: screen.h })) toy.style.setProperty(`--native-lcd-${name}`, `${(value / W) * 100}cqw`);
  toy.style.setProperty('--pr-lid-h', `${(layout.lid.h / W) * 100}cqw`);
  toy.style.setProperty('--pr-lid-art', `url("${LID}")`);
  // Картинку рамки декодируем заранее: к щелчку «только экран» она уже готова, и переход не начинается с пустого места.
  const lidArt = new Image();
  lidArt.src = LID;
  void lidArt.decode().catch(() => undefined);
  const lcd = new MiniLcd({ scale: false });
  lcd.element.classList.add('minibrick-lcd--live');
  document.getElementById('game-area')!.append(lcd.element);
  document.getElementById('base')!.replaceChildren(...KEY_NAMES.flatMap(keyPair));
  return lcd;
}

/** Миниатюра для каталога и выбора вида: корпус с кнопками и пустое стекло; «только экран» — верхняя часть до шва. */
export function princeMini(view = 'full'): SVGSVGElement {
  const compact = view === 'screen';
  const height = compact ? layout.lid.h : H;
  const root = svg('svg', { viewBox: `0 0 ${W} ${height}`, class: 'view-mini', 'aria-hidden': 'true', focusable: 'false' });
  const screen = layout.screen;
  root.append(
    svg('rect', { x: String(screen.x), y: String(screen.y), width: String(screen.w), height: String(screen.h), fill: PRINCE_LCD.bg }),
    svg('image', { href: compact ? LID : BODY, width: String(W), height: String(height) }),
  );
  if (!compact) {
    for (const name of KEY_NAMES) {
      const spec = layout.keys[name];
      root.append(svg('image', { href: `${BASE}devices/prince118/keys/${name}.svg`, x: String(spec.x), y: String(spec.y), width: String(spec.w), height: String(spec.h) }));
    }
  }
  return root;
}
