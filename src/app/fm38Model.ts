import { MiniLcd } from '../render/miniScreen';
import { h,svg } from './dom';
import './native.css';
import './fm38.css';
export function fm38Mini(view='full'):SVGSVGElement {
  return svg('svg',{viewBox:view==='screen'?'325 120 420 540':'135 0 820 1448',class:'view-mini','aria-hidden':'true',focusable:'false'},svg('image',{href:`${import.meta.env.BASE_URL}devices/fm38/body.png`,width:'1086',height:'1448'}));
}
export function applyFM38Model():MiniLcd {
  const toy=document.getElementById('toy')!,arena=document.getElementById('arena')!;
  for(const el of [toy,arena]){el.dataset['model']='fm38';el.dataset['chassis']='native';el.dataset['shell']='white';}
  document.body.dataset['toy']='fm38';document.title='Brick Game FM-38';
  toy.style.setProperty('--native-body',`url("${import.meta.env.BASE_URL}devices/fm38/body.png")`);
  toy.style.setProperty('--native-height','176.6cqw');
  for(const [name,value]of Object.entries({x:29.4,y:19.9,w:40.5,h:54.4}))toy.style.setProperty(`--native-lcd-${name}`,`${value}cqw`);
  const lcd=new MiniLcd();lcd.element.classList.add('minibrick-lcd--live');document.getElementById('game-area')!.append(lcd.element);
  const keys=[['left',296,817,95,105],['right',493,817,100,105],['down',394,943,110,100],['sp',666,787,100,90],['sound',650,885,90,85],['onoff',632,981,65,65],['jump',816,888,140,140]] as const;
  const labels={left:'LEVEL / LEFT',right:'SPEED / RIGHT',down:'GAME A/B / DOWN',sp:'START / PAUSE',sound:'MELODY',onoff:'ON/OFF',jump:'ROTATE'};
  document.getElementById('base')!.replaceChildren(...keys.map(([key,x,y,w,height])=>h('button',{type:'button',class:'key native__key','data-key':key,'aria-label':labels[key],tabindex:'-1',style:`left:${(x-135)/820*100}%;top:${y/1448*100}%;width:${w/820*100}%;height:${height/1448*100}%;`})));return lcd;
}
