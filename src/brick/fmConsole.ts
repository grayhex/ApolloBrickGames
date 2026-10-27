import { MiniConsole, type MiniConsoleOptions } from './miniConsole';
import { tetrisDef } from './games/tetris';
import { pentixDef } from './games/pentix';
import { makeBrickInput, type BrickGame, type BrickEvent, type BrickInput, type BrickPhase } from './types';

/** Owner-described FM-38. Exact B pool, demo AI and timing remain reconstructions. */
export class FMConsole extends MiniConsole {
  private live:BrickGame|null=null;
  private demo:BrickGame;
  private variant=0;
  private selectedSpeed=0;
  private selectedLevel=0;
  private clock=0;
  private readonly fmSeed:number;
  private readonly record:(n:number)=>number;
  constructor(options:MiniConsoleOptions={}) {
    super(options);this.fmSeed=options.seed??1;this.record=options.hiScore??(()=>0);this.demo=this.create();this.demo.start();
  }
  private create():BrickGame {return (this.variant?pentixDef:tetrisDef).create({seed:this.fmSeed,speed:this.selectedSpeed+1,level:this.selectedLevel+1,levelLimit:13,hiScore:this.record(this.variant),mode:0});}
  private resetDemo():void {this.demo=this.create();this.demo.start();this.clock=0;}
  override get startSettings():{speed:number;level:number}{return {speed:this.selectedSpeed,level:this.selectedLevel};}
  override get gameNumber():number{return this.variant;}
  override get inMenu():boolean{return !this.live;}
  override get screenStage():'menu'|'game'{return this.live?'game':'menu';}
  override get gameId():string{return 'tetris';}
  override get mode():number{return this.variant;}
  override get game():BrickGame{return this.live??this.demo;}
  override get phase():BrickPhase{return this.live?.phase??'ready';}
  override get displaySpeed():number{return this.live?this.live.speed-1:this.selectedSpeed;}
  override get displayLevel():number{return this.live?this.live.level-1:this.selectedLevel;}
  override get speed():number{return this.game.speed;}
  override get level():number{return this.game.level;}
  override get tick():number{return this.clock;}
  override get score():number{return this.live?.score??0;}
  override get hiScore():number{return this.live?.hiScore??this.record(this.variant);}
  override get overFill():number{return this.live?.overFill??0;}
  override get idleDisplay():{scale:number;lines:boolean}{return {scale:this.selectedLevel+1,lines:true};}
  override powerOn():BrickEvent[]{this.live=null;this.resetDemo();return [];}
  override menu(input:BrickInput):BrickEvent[]{
    if(this.live)return [];
    let changed=false;
    if(input.pressed.has('down')){this.variant=1-this.variant;changed=true;}
    if(input.pressed.has('left')){this.selectedLevel=(this.selectedLevel+1)%13;changed=true;}
    if(input.pressed.has('right')){this.selectedSpeed=(this.selectedSpeed+1)%10;changed=true;}
    if(changed){this.resetDemo();return [{type:'move'}];}
    this.clock++;
    const side=Math.floor(this.clock/90)%2?'left':'right';
    this.demo.step(makeBrickInput(this.clock%18===0?[side]:[],this.clock%120>65?['down']:[]));
    if(this.demo.phase==='over')this.resetDemo();
    return [];
  }
  /** Вкладка левой панели A или B выбирает игру в меню (демонстрация начинается заново); в партии и у Mini-имён вкладки курсор не трогают. */
  override selectGame(id:string):void{
    if(this.live||(id!=='a'&&id!=='b'))return;
    const variant=id==='b'?1:0;
    if(variant===this.variant)return;
    this.variant=variant;this.resetDemo();
  }
  override start():BrickEvent[]{if(this.live)return this.live.start();this.live=this.create();return this.live.start();}
  override startButton():BrickEvent[]{return this.pause();}
  override pause():BrickEvent[]{return this.live?.pause()??[];}
  override resume():BrickEvent[]{return this.live?.resume()??[];}
  override restart():BrickEvent[]{this.live=null;this.resetDemo();return [];}
  override step(input:BrickInput):BrickEvent[]{this.clock++;return this.live?.step(input)??[];}
  override cells():Uint8Array{return this.game.cells();}
  override preview():Uint8Array|null{return this.game.preview();}
}
