import { RacingBase } from '../brick/games/racing/base';
import type { BrickGameOptions } from '../brick/types';

/** Five-row car and 17-row field observed in B0302 01/02.
 * Traffic generation and collision rules remain donor approximations.
 */
export class B0302Racing extends RacingBase {
  readonly id = 'racing';
  protected override get fieldRows(): number { return 17; }
  protected override get carRows(): readonly string[] { return ['#.#','.#.','###','.#.','.#.']; }
  protected override get carY(): number { return 4; }
  // Speed 1–9 and score increments 1–38 observed on the ROM; 0 is an estimate.
  private static readonly roadPeriods = [330, 295, 265, 235, 210, 180, 150, 130, 115, 100] as const;
  private skipSetupStep = false;
  private speedBaselineScore = 0;
  protected override get roadStepTicks():number { return B0302Racing.roadPeriods[this.speed-1]!*60/2000; }
  protected override reset():void { this.speedBaselineScore=0;super.reset(); }
  protected override onSetup():void { this.skipSetupStep=true; }
  protected override onCrash():void { this.speedBaselineScore=this.score;this.setSpeed(1); }
  protected override scorePassed():void { /* Score is tied to road movement, not passing a car. */ }
  protected override onTraffic():void {
    if(this.skipSetupStep){this.skipSetupStep=false;return;}
    this.addScore(1);
  }
  protected override afterScoreChange():void {
    const speed=Math.min(10,1+Math.ceil((this.score-this.speedBaselineScore)/2));
    if(speed>this.speed)this.setSpeed(speed);
  }
  constructor(options: BrickGameOptions = {}) {
    super({...options,mode:0},1);
    this.init();
  }
}
