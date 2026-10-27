import { h, svg } from './dom';
import type { ToyModelRefs } from './toyModel';
import type { ToyModel } from './toys';
import type { NativeDeviceId } from '../devices/catalog';
import type { View } from './view';
import './native.css';
/** Positions in the upstream vector's coordinate system; one hit area for each real button. */
const GEOMETRY = {
  e88: { width:365, height:859, screen:[101.379,64.2899,162.914,226.414],
    keys:[['sp',113.079,510.939,10],['onoff',182.766,510.984,10],['sound',252.357,510.939,10],['left',57.516,589.453,19],['right',141.339,589.675,19],['down',99.712,626.669,19],['jump',303.543,589.047,28]] },
  'apollo-b0202': {width:2438,height:5908,screen:[670.969,347.007,1100.5,1567.87],
    keys:[['left',452.52,3597.78,133],['right',1013.32,3597.78,133],['down',733.897,3876.86,133],['jump',2028.06,3599.22,201],['onoff',1473.08,3619.37,78],['sound',1473.08,3995.49,78],['sp',1164.17,4152.15,78],['fire',1789.47,4152.15,78]] },
  e23: {width:365,height:859,screen:[102.296,49.5906,160.2,230.2],
    keys:[['sp',113.42,506.261,10],['onoff',183.595,506.261,10],['sound',253.77,506.261,10],['left',65.2143,586.553,19],['right',149.75,586.553,19],['down',108.256,626,19],['jump',307.808,586,28]]},
  'apollo-b0302': {width:2438,height:5908,screen:[670.265,346.95,1100.5,1567.87],
    keys:[['left',451.815,3597.73,133],['right',1012.61,3597.73,133],['down',733.193,3876.81,133],['jump',2027.35,3599.16,201],['onoff',1472.38,3619.31,78],['sound',1472.38,3995.44,78],['sp',1163.46,4152.1,78],['fire',1788.76,4152.1,78]]},
} as const;
export const nativeGeometry = (id:NativeDeviceId) => GEOMETRY[id];
export function applyNativeModel(refs: ToyModelRefs, model: ToyModel): void {
  const id = model.nativeDevice!, g=GEOMETRY[id];
  refs.toy.dataset['chassis']='native'; refs.arena.dataset['chassis']='native';
  refs.toy.style.setProperty('--native-body', `url("${import.meta.env.BASE_URL}devices/${id}-body.svg")`);
  refs.toy.style.setProperty('--native-height', `${g.height/g.width*100}cqw`);
  const [x,y,w,height]=g.screen;
  refs.toy.style.setProperty('--native-lcd-x',`${x/g.width*100}cqw`);
  refs.toy.style.setProperty('--native-lcd-y',`${y/g.width*100}cqw`);
  refs.toy.style.setProperty('--native-lcd-w',`${w/g.width*100}cqw`);
  refs.toy.style.setProperty('--native-lcd-h',`${height/g.width*100}cqw`);
  for(const decoration of refs.lid.querySelectorAll('.lid__art,.lid__screw,.lid__leds')) decoration.remove();
  refs.base.replaceChildren(...g.keys.map(([key,cx,cy,r])=>h('button',{
    type:'button',class:'key native__key','data-key':key,tabindex:'-1',
    style:`left:${cx/g.width*100}%;top:${cy/g.height*100}%;width:max(32px,${r*2/g.width*100}%);height:max(32px,${r*2/g.height*100}%);`,
    'aria-label':key,
  })));
}
export function nativeMini(id: NativeDeviceId, view:View='full'): SVGSVGElement {
  const g=GEOMETRY[id]; const root=svg('svg',{class:'view-mini',viewBox:`0 0 ${g.width} ${view==='screen'?g.width*.92:g.height}`,'aria-hidden':'true',focusable:'false'});
  root.append(svg('image',{href:`${import.meta.env.BASE_URL}devices/${id}-body.svg`,width:String(g.width),height:String(g.height)}));
  return root;
}
