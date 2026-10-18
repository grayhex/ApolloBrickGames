import { h, svg } from './dom';
import type { ToyModelRefs } from './toyModel';
import type { ToyModel } from './toys';
import type { Shell } from '../input/settings';
import type { View } from './view';

/**
 * Узор по бокам экрана: группы вложенных квадратов в два столбца, как на фотографии оригинала (левая и правая стороны разные). Строка группы — два символа:
 * слева направо по корпусу, `1` — квадрат есть. Смещения групп — в шагах решётки (между группами полтора шага).
 */
const SIDE_PATTERN: Readonly<Record<'left' | 'right', readonly { at: number; rows: readonly string[] }[]>> = {
  left: [
    { at: 0, rows: ['01', '11', '10'] },
    { at: 3.45, rows: ['10', '11', '10'] },
    { at: 6.9, rows: ['11', '11'] },
    { at: 9.35, rows: ['10', '11', '10', '11'] },
  ],
  right: [
    { at: 0, rows: ['11', '11'] },
    { at: 2.45, rows: ['10', '11', '10', '11'] },
    { at: 6.9, rows: ['10', '11', '10'] },
    { at: 10.35, rows: ['01', '11', '10'] },
  ],
};
/** Шаг решётки узора и сторона квадрата в единицах рисунка. */
const PITCH = 10;
const CELL = 7;
/** Высота рисунка: нижний ряд последней группы — на 12,35 шага от верха, плюс сторона квадрата. */
const MOTIF_HEIGHT = 12.35 * PITCH + CELL;

function sideMotif(side: 'left' | 'right'): SVGSVGElement {
  const motif = svg('svg', {
    class: `classic__motif classic__motif--${side}`,
    viewBox: `0 0 ${PITCH + CELL} ${MOTIF_HEIGHT}`,
    'aria-hidden': 'true',
  });
  for (const group of SIDE_PATTERN[side])
    group.rows.forEach((row, index) =>
      [...row].forEach((cell, column) => {
        if (cell !== '1') return;
        const x = column * PITCH;
        const y = (group.at + index) * PITCH;
        motif.append(
          svg('rect', { x: String(x + 0.35), y: String(y + 0.35), width: String(CELL - 0.7), height: String(CELL - 0.7), fill: 'none', stroke: 'currentColor', 'stroke-width': '.7' }),
          svg('rect', { x: String(x + 1.85), y: String(y + 1.85), width: String(CELL - 3.7), height: String(CELL - 3.7), fill: 'currentColor' }),
        );
      }),
    );
  return motif;
}

/**
 * Подписи кнопок — рядом с ними, а не на них, в две строки, как на оригинале: слово кнопки и её дело в меню (UP/DOWN листают варианты — MODE, LEFT — уровень,
 * RIGHT — скорость, ROTATE — следующая игра). Название большой кнопки на оригинале — ROTATE / DIRECTION.
 */
const KEY_CAPTIONS: Readonly<Record<string, readonly [string, string?]>> = {
  up: ['UP', 'MODE'],
  left: ['LEFT', 'LEVEL'],
  right: ['RIGHT', 'SPEED'],
  down: ['DOWN', 'MODE'],
  jump: ['ROTATE', 'DIRECTION'],
  fire: ['FIRE'],
};

/** Крест из четырёх стрелок между кнопками направлений (печатный значок оригинала). */
function padCross(): SVGSVGElement {
  const arrow = (rotation: number): SVGPathElement => svg('path', { d: 'M12 1.2 15.6 6H13.2V10.8H10.8V6H8.4Z', transform: `rotate(${rotation} 12 12)`, fill: 'currentColor' });
  return svg('svg', { class: 'classic__pad', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, arrow(0), arrow(90), arrow(180), arrow(270));
}

/** Site branding distinguishes the universal toy from original hardware replicas. */
function wordmark(games: number): HTMLElement {
  return h('div',{class:'classic__wordmark','aria-hidden':'true'},
    h('div',{class:'classic__site-logo'},h('span',{},'BRICK'),h('span',{},'GAME'),h('small',{},'.ONLINE')),
    h('span',{class:'classic__count'},`${games} IN 1`));
}

/** Decorative, fictional electronics; no claim to reproduce a particular original PCB. */
function circuitBoard(): SVGSVGElement {
  const board=svg('svg',{class:'classic__pcb',viewBox:'0 0 400 965','aria-hidden':'true',focusable:'false'});
  board.append(svg('rect',{x:'17',y:'20',width:'366',height:'922',rx:'32',fill:'#aeb7ae'}),
    svg('path',{d:'M32 35H368V820H32Z',fill:'#316f59',stroke:'#bcce96','stroke-width':'2'}));
  for(let n=0;n<14;n++){
    const x=45+n*23;
    board.append(svg('path',{d:`M${x} 62V${400+n*7}L${x+10} ${410+n*7}V${720-n*4}H${360-n*8}`,fill:'none',stroke:n%3?'#adbd73':'#d6c696','stroke-width':n%3?'1.4':'2.5',opacity:'.7'}));
    for(const y of [60,410+n*7,720-n*4])board.append(svg('circle',{cx:String(x),cy:String(y),r:'2.4',fill:'#d9dcad'}));
  }
  board.append(svg('rect',{x:'120',y:'448',width:'118',height:'92',rx:'6',fill:'#172a25',stroke:'#6f8b77','stroke-width':'3'}),
    svg('text',{x:'179',y:'494',fill:'#7b9e88','font-size':'10','text-anchor':'middle'},'BGO · MATRIX'),
    svg('text',{x:'179',y:'511',fill:'#7b9e88','font-size':'8','text-anchor':'middle'},'REV 01'));
  for(let n=0;n<12;n++)for(const y of [438,540])board.append(svg('rect',{x:String(126+n*9),y:String(y),width:'3',height:'10',fill:'#d5d5bd'}));
  for(const [x,y] of [[64,475],[280,500],[314,645],[55,738]]){
    board.append(svg('rect',{x:String(x),y:String(y),width:'17',height:'28',rx:'4',fill:'#233a36',stroke:'#b3bba8','stroke-width':'2'}),svg('ellipse',{cx:String(x!+8.5),cy:String(y!+3),rx:'7',ry:'3',fill:'#c1c7b7'}));
  }
  for(let n=0;n<11;n++)board.append(svg('rect',{x:String(55+n*27),y:String(564+n%3*25),width:'13',height:'6',rx:'1',fill:'#c4b893',stroke:'#d9d3bb','stroke-width':'1'}));
  board.append(svg('circle',{cx:'280',cy:'755',r:'44',fill:'#25352e',stroke:'#a1aa8f','stroke-width':'5'}));
  for(const radius of [12,20,28,35])board.append(svg('circle',{cx:'280',cy:'755',r:String(radius),fill:'none',stroke:'#647562','stroke-width':'1'}));
  for(const y of [839,889])board.append(svg('rect',{x:'62',y:String(y),width:'258',height:'40',rx:'9',fill:'#414b47',stroke:'#858c81','stroke-width':'3'}),svg('rect',{x:'66',y:String(y+4),width:'26',height:'32',rx:'3',fill:'#b3b8a7'}),svg('path',{d:`M103 ${y+20}H287`,stroke:'#717c6e','stroke-width':'2'}));
  return board;
}

/** A new universal design inspired by classic vertical Brick Games, not a replica of a firmware model. */
export function applyBrickGame(refs: ToyModelRefs, model: ToyModel): void {
  const { lid, base } = refs;
  refs.toy.prepend(circuitBoard(),h('div',{class:'classic__glass','aria-hidden':'true'}));
  lid.querySelector('.lid__art')?.remove();
  for (const screw of lid.querySelectorAll('.lid__screw')) screw.remove();
  const face = lid.querySelector('.lid__face')!;
  const bezel = lid.querySelector('.lid__bezel');
  for (const side of ['left', 'right'] as const) (bezel ?? face).append(sideMotif(side));
  // Надпись SUPER стоит в разрыве верхней линии жёлтой рамки, цветом узора (как на оригинале).
  (bezel ?? face).append(h('span', { class: 'classic__super', 'aria-hidden': 'true' }, 'SUPER'));
  const leds = lid.querySelector<HTMLElement>('.lid__leds');
  if (leds) leds.hidden = true;
  base.replaceChildren(
    h(
      'div',
      { class: 'classic__system' },
      ...[
        ['onoff', 'ON/OFF'],
        ['sound', 'SOUND'],
        ['sp', 'START / PAUSE'],
      ].map(([key, label]) =>
        h(
          'button',
          { type: 'button', class: 'key classic__small', tabindex: '-1', 'data-key': key!, 'aria-label': label! },
          key === 'sp' ? h('span', { class: 'classic__two' }, h('b', {}, 'START'), h('i', {}, 'PAUSE')) : h('span', {}, label!),
        ),
      ),
      h('button', { type: 'button', class: 'classic__reset', 'data-action': 'reset', 'aria-label': 'RESET — Menu' }, h('span', {}, 'RESET')),
    ),
    padCross(),
    ...[
      ['up', 'UP'],
      ['left', 'LEFT'],
      ['right', 'RIGHT'],
      ['down', 'DOWN'],
      ['jump', 'ROTATE'],
      ['fire', 'FIRE'],
    ].map(([key, label]) => {
      const [first, second] = KEY_CAPTIONS[key!]!;
      return h(
        'button',
        { type: 'button', class: `key classic__key classic__key--${key}`, tabindex: '-1', 'data-key': key!, 'aria-label': label! },
        h('span', { class: 'classic__cap', 'aria-hidden': 'true' }, h('b', {}, first), ...(second ? [h('i', {}, second)] : [])),
      );
    }),
    wordmark(model.games.length),
  );
}
export function brickGameMini(view: View = 'full', shell?: Shell): SVGSVGElement {
  const transparent=shell==='clear'||shell==='smoke';
  const body = shell === 'clear' ? '#ccd9cd' : shell==='smoke' ? '#151e19' : shell === 'white' ? '#eee' : shell === 'gray' ? '#cecec0' : shell === 'black' ? '#222725' : 'var(--classic-body, #cecec0)';
  const ridge = shell === 'white' ? '#fafaf6' : shell === 'black' ? '#3b403c' : shell === 'gray' ? '#e0e0d5' : 'var(--classic-hi, #e0e0d5)';
  const screen = view === 'screen';
  const root = svg('svg', { class: 'view-mini', viewBox: `0 0 44 ${screen ? 52 : 100}`, 'aria-hidden': 'true', focusable: 'false' });
  root.append(
    svg('rect', { x: '1', y: '1', width: '42', height: screen ? '50' : '98', rx: '5', fill: body, stroke: '#777', 'stroke-width': '1.2' }),
    svg('rect', { x: '5', y: '7', width: '34', height: '39', rx: '2', fill: '#292d2c' }),
    svg('rect', { x: '8', y: '10', width: '28', height: '33', fill: '#bac49c' }),
    svg('path', { d: 'M26 11V42M11 38h3v-3h3v3h3v3h-9Z', fill: '#3c4537', stroke: '#3c4537', 'stroke-width': '.4' }),
  );
  if(transparent&&!screen)root.append(svg('g',{opacity:'.24'},svg('path',{d:'M5 49H39V94H5Z',fill:'#548671',opacity:'.75'}),svg('path',{d:'M7 52V87H34V56M11 55V83H30V59M15 56V79H26V62',fill:'none',stroke:'#b7c595','stroke-width':'.6'}),svg('rect',{x:'17',y:'57',width:'11',height:'8',rx:'1',fill:'#273c33'})));
  if (!screen)
    root.append(
      svg('path', { d: 'M2 46Q22 43 42 46V53Q22 59 2 53Z', fill: ridge }),
      svg('path', { d: 'M2 53Q22 59 42 53', fill: 'none', stroke: '#111', opacity: '.3', 'stroke-width': '1.2' }),
      ...[9, 18, 27, 35].map((x) => svg('circle', { cx: String(x), cy: '60', r: '2', fill: '#e5cb52' })),
      svg('path', { d: 'M13 68h5v5h5v5h-5v5h-5v-5H8v-5h5Z', fill: '#e5cb52' }),
      svg('circle', { cx: '33', cy: '73', r: '5', fill: '#e5cb52' }),
      svg('circle', { cx: '31', cy: '85', r: '3', fill: '#e5cb52' }),
      svg('path', { d: 'M8 91h14m-14 3h14', stroke: '#777', 'stroke-width': '1.2' }),
    );
  return root;
}
