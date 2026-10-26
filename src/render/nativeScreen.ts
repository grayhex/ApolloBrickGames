import mapping from '../devices/lcd-mapping.json';
import type { NativeDeviceId } from '../devices/catalog';
import { nativeGeometry } from '../app/nativeModel';
import type { TetrisScene } from './tetrisScreen';
const DIGITS=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
// a,b,c,d,e,f,g: original segment addresses, not replacement fonts.
const SCORE=[['203_2','203_3','203_1','191_0','191_1','191_2','191_3'],['187_2','187_3','187_1','189_0','189_1','189_2','189_3'],['201_2','201_3','201_1','185_0','185_1','185_2','185_3'],['199_2','199_3','199_1','179_0','179_1','179_2','179_3']];
const SPEED=['196_3','198_3','200_3','202_3','200_2','196_2','198_2'];
const LEVEL=['204_3','206_3','208_3','210_3','208_2','204_2','206_2'];
/** Own SVG segment panel for each physical LCD. Static housing is a separate resource. */
export class NativeScreen {
  readonly hasGhostLayer=true;
  private ghost=false;
  /** Сегменты; обводка стакана (`#frame`) лежит вне этой группы и видна всегда, даже при выключенной игрушке. */
  private readonly display:SVGElement|null;
  private readonly segments:Map<string,SVGElement>;
  private readonly device:NativeDeviceId;
  private previous=new Set<string>();
  private constructor(root:SVGSVGElement,device:NativeDeviceId) {
    this.device=device;this.display=root.querySelector<SVGElement>('#display');
    this.segments=new Map([...root.querySelectorAll<SVGElement>('[id]')].filter(e=>/^\d+_\d+$/.test(e.id)).map(e=>[e.id,e]));
    for(const e of this.segments.values())e.style.opacity='0';
  }
  static async create(canvas:HTMLCanvasElement,device:NativeDeviceId):Promise<NativeScreen> {
    const response=await fetch(`${import.meta.env.BASE_URL}devices/${device}-lcd.svg`);
    if(!response.ok)throw new Error(`LCD resource ${response.status}`);
    const parsed=new DOMParser().parseFromString(await response.text(),'image/svg+xml');
    if(parsed.querySelector('parsererror'))throw new Error('Invalid LCD resource');
    const root=document.importNode(parsed.documentElement,true) as unknown as SVGSVGElement;
    const [x,y,w,h]=nativeGeometry(device).screen;
    root.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);root.setAttribute('class','native__lcd');root.setAttribute('aria-hidden','true');
    canvas.hidden=true;canvas.before(root);
    return new NativeScreen(root,device);
  }
  resize():void { /* SVG viewBox preserves the original panel geometry at any DPR. */ }
  dropout():void { /* A monoblock has no folding ribbon-cable glitch. */ }
  setGhost(value:boolean):void {
    if(this.ghost===value)return;this.ghost=value;
    for(const [id,e]of this.segments)e.style.opacity=this.previous.has(id)?'1':value?'.09':'0';
  }
  clear():void {if(this.display)this.display.style.visibility='hidden';this.previous.clear();}
  render(scene:TetrisScene):void {
    if(this.display)this.display.style.visibility='visible';
    const map=mapping[this.device],active=new Set<string>();
    const segment=(id:string):void=>{const target=(map.segments as Record<string,string>)[id];if(target)active.add(target);};
    const digit=(value:number,ids:readonly string[]):void=>{for(const char of DIGITS[Math.max(0,Math.min(9,value))]!)segment(ids['abcdefg'.indexOf(char)]!);};
    if(scene.allOn)for(const id of this.segments.keys())active.add(id);
    else {
      const blink=Math.floor(scene.tick/15)%2===0;
      scene.cells.forEach((v,i)=>{if(v && (v!==2||blink))active.add(map.matrix[Math.floor(i/10)]![i%10]!);});
      if(scene.preview)scene.preview.forEach((v,i)=>{if(v && (v!==2||blink))segment(`${[190,188,186,184][i%4]}_${[3,0,2,1][Math.floor(i/4)]}`);});
      const value=scene.phase==='ready'?scene.hiScore:scene.score;
      const score=String(Math.floor(value)).padStart(4,' ').slice(-4);
      SCORE.forEach((ids,i)=>{if(score[i]!==' ')digit(Number(score[i]),ids);});
      if(value>=10000)segment('193_3');
      segment('193_2');if(scene.phase==='ready')segment('195_2');
      digit(scene.speed%10,SPEED);digit(scene.level%10,LEVEL);
      if(scene.speed>=10)segment('202_2');if(scene.level>=10)segment('210_2');
      segment('197_1');segment('182_2');if(scene.preview)segment('187_0');
      segment(scene.rotationDirection===-1 ? '183_0' : '183_1');
      if(scene.phase==='paused'){segment('183_3');}
      if(scene.phase==='over')segment('177_1');
    }
    for(const [id,e]of this.segments) {
      const lit=active.has(id);if(lit!==this.previous.has(id)||!this.previous.size)e.style.opacity=lit?'1':this.ghost?'.09':'0';
    }
    this.previous=active;
  }
}
