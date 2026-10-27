import frameGeometry from '../../scripts/research/fm38-frame.json';
import keyGeometry from '../../scripts/research/fm38-keys.json';
import { Fm38Lcd } from '../render/fm38Screen';
import type { LcdView } from '../render/miniScreen';
import { h,svg } from './dom';
import './native.css';
import './fm38.css';

/** Корпус — графика владельца 1086 × 1448; на странице показана полоса шириной 820 px, левый край которой лежит на 133 px (картинка стоит по центру). */
const ART = { left: 133, width: 820, height: 1448 } as const;
/** Окно под экран в корпусе (прозрачное отверстие 375–710 × 163–608), чуть сужено, чтобы фаска корпуса не обрезалась стеклом. */
const WINDOW = { x: 29.66, y: 20.03, w: 40.68, h: 54.09 } as const;

/** «Только экран»: окно под экран шириной, как у остальных «кирпичей» (Mini — 54,4 % ширины игрушки), вокруг — вырезанная по контуру рамка экрана (`screen-frame.png`). */
const COMPACT = { windowW: 54.4, pad: 2.5 } as const;

/** Миниатюра для каталога и выбора вида: корпус целиком, как нарисован (с кнопками). */
export function fm38Mini(view='full'):SVGSVGElement {
  return svg('svg',{viewBox:view==='screen'?'325 120 420 540':'135 0 820 1448',class:'view-mini','aria-hidden':'true',focusable:'false'},svg('image',{href:`${import.meta.env.BASE_URL}devices/fm38/body.png`,width:'1086',height:'1448'}));
}

type KeyId = 'left' | 'right' | 'down' | 'sp' | 'sound' | 'onoff' | 'jump';
const KEYS: readonly KeyId[] = ['left', 'right', 'down', 'sp', 'sound', 'onoff', 'jump'];
const LABELS: Readonly<Record<KeyId, string>> = { left: 'LEVEL / LEFT', right: 'SPEED / RIGHT', down: 'GAME A/B / DOWN', sp: 'START / PAUSE', sound: 'MELODY', onoff: 'ON/OFF', jump: 'ROTATE' };
interface KeyShape { x: number; y: number; w: number; h: number; clip: number[][] }
const SHAPES = keyGeometry as Readonly<Record<KeyId, KeyShape>>;

/**
 * Каждая кнопка — отдельный объект: спрайт, вырезанный из графики корпуса (`scripts/research/fm38_cut_keys.py`), и прозрачная область нажатия по силуэту кнопки.
 * Сам корпус (`body-plain.png`) нарисован без кнопок, поэтому нажатая кнопка уходит вглубь вместе со своей формой, а не затемняется кругом поверх картинки.
 */
function keyPair(key: KeyId): [HTMLButtonElement, HTMLSpanElement] {
  const shape = SHAPES[key];
  const place = `left:${(shape.x - ART.left) / ART.width * 100}%;top:${shape.y / ART.height * 100}%;width:${shape.w / ART.width * 100}%;height:${shape.h / ART.height * 100}%;`;
  const clip = `polygon(${shape.clip.map(([x, y]) => `${x}% ${y}%`).join(',')})`;
  const button = h('button', { type: 'button', class: 'key native__key fm__key', 'data-key': key, 'aria-label': LABELS[key], tabindex: '-1', style: `${place}--fm-clip:${clip};` });
  const art = h('span', { class: 'fm__art', 'aria-hidden': 'true', 'data-art': key, style: place }, h('img', { src: `${import.meta.env.BASE_URL}devices/fm38/keys/${key}.png`, alt: '', draggable: 'false', decoding: 'async' }));
  return [button, art];
}

export function applyFM38Model():LcdView {
  const toy=document.getElementById('toy')!,arena=document.getElementById('arena')!;
  for(const el of [toy,arena]){el.dataset['model']='fm38';el.dataset['chassis']='native';el.dataset['shell']='white';}
  document.body.dataset['toy']='fm38';document.title='Brick Game FM-38';
  toy.style.setProperty('--native-body',`url("${import.meta.env.BASE_URL}devices/fm38/body-plain.png")`);
  toy.style.setProperty('--native-height',`${ART.height / ART.width * 100}cqw`);
  for(const [name,value]of Object.entries({x:WINDOW.x,y:WINDOW.y,w:WINDOW.w,h:WINDOW.h}))toy.style.setProperty(`--native-lcd-${name}`,`${value}cqw`);
  // Вид «только экран»: размеры рамки и окна в долях ширины игрушки (CSS их только раскладывает).
  const k=COMPACT.windowW/frameGeometry.window.w,cqw=(px:number):string=>`${+(px*k).toFixed(3)}cqw`;
  toy.style.setProperty('--fm-frame-art',`url("${import.meta.env.BASE_URL}devices/fm38/screen-frame.png")`);
  for(const [name,value]of Object.entries({'frame-w':cqw(frameGeometry.w),'frame-h':cqw(frameGeometry.h),'win-x':cqw(frameGeometry.window.x),'win-y':cqw(frameGeometry.window.y),'win-w':`${COMPACT.windowW}cqw`,'win-h':cqw(frameGeometry.window.h),pad:`${COMPACT.pad}cqw`}))toy.style.setProperty(`--fm-${name}`,value);
  const lcd=new Fm38Lcd();lcd.element.classList.add('minibrick-lcd--live');lcd.element.setAttribute('preserveAspectRatio','xMinYMid slice');
  document.getElementById('game-area')!.append(lcd.element);
  document.getElementById('base')!.replaceChildren(...KEYS.flatMap(keyPair));
  return lcd;
}
