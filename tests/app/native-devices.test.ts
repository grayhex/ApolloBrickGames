import { describe,it,expect } from 'vitest';
import { NATIVE_MENUS, nativeEntry, originalMenu } from '../../src/devices/catalog';
import { nativeGuide } from '../../src/devices/guide';
import { nativeDefinition } from '../../src/devices/profiles';
import { E88Blocks,E88_BLOCK_FALL_MS,e88Piece } from '../../src/devices/e88-blocks';
import { TOYS,parseToy,isMonoblock } from '../../src/app/toys';
import { createCabinet } from '../../src/app/cabinet';
import { bodyActions } from '../../src/app/bodyButtons';
import { BRICK_GAMES } from '../../src/brick/games';
import { makeFrame,NEUTRAL_FRAME } from '../../src/core';
import { defaultConfig } from '../../src/config/runtime';
import { validateConfig } from '../../src/config/schema';
import { categoryFor,validateCategory,STANDARD_START } from '../../src/leaderboards/category';
import menuFrames from '../../src/devices/menu-frames.json';
import observations from '../fixtures/brickemu/native-devices.json';
import { makeBrickInput } from '../../src/brick/types';
const options={seed:77,loadHi:()=>0,defs:BRICK_GAMES};
const scene={sound:false,allOn:false};

describe('native firmware manifests',()=>{
  it('enumerates measured 8 and 126 menu positions, independent of game IDs',()=>{
    expect(NATIVE_MENUS.e88.map(e=>e.nativeCode)).toEqual(['1','2','3','4','5','6','7','8']);
    const groups=Object.fromEntries('ABCDEFGHI'.split('').map(g=>[g,NATIVE_MENUS['apollo-b0202'].filter(e=>e.group===g).length]));
    expect(groups).toEqual({A:10,B:1,C:1,D:1,E:3,F:1,G:1,H:54,I:54});
    expect(menuFrames).toEqual(observations.menus);
    for(const [id,entries]of Object.entries(NATIVE_MENUS)){
      expect(new Set(entries.map(e=>e.entryId)).size).toBe(entries.length);
      expect(parseToy(`?toy=${id}`)).toBe(id);
      for(const e of entries)expect(Boolean(nativeDefinition(e))).toBe(e.available);
    }
  });
  for(const id of ['e88','apollo-b0202'] as const){
    it(`${id}: original codes, input restrictions, pause and repeatability`,()=>{
      expect(isMonoblock(TOYS[id])).toBe(true);expect(TOYS[id].universal).toBeFalsy();
      expect([...bodyActions(TOYS[id])].sort()).toEqual(['down','left','right','rotate']);
      for(const entry of NATIVE_MENUS[id]){
        const a=createCabinet(TOYS[id],options),b=createCabinet(TOYS[id],options);
        expect(a.selectGame(entry.entryId)).toBe(true);expect(b.selectGame(entry.entryId)).toBe(true);
        expect(a.info['symbol']).toBe(entry.nativeCode);
        expect(a.start()).toEqual(b.start());expect(a.inMenu).toBe(!entry.available);
        if(!entry.available){expect(a.start()).toEqual([{type:'blocked'}]);continue;}
        for(let tick=0;tick<90;tick++){
          const pressed=tick%20===0?['jump' as const]:[];
          a.step(makeFrame({pressed}));b.step(makeFrame({pressed:[...pressed,'fire'],held:['fire']}));
          expect(a.scene(scene)).toEqual(b.scene(scene));
        }
        a.pause();const before=a.scene(scene);for(let tick=0;tick<10;tick++)a.step(NEUTRAL_FRAME);expect(a.scene(scene)).toEqual(before);
        expect(a.hiKey()).toContain(`${entry.entryId}:0:native-r${entry.rulesetVersion}`);
      }
    });
    it(`${id}: UP is only an alias of the physical ROTATE`,()=>{
      for(const entry of NATIVE_MENUS[id].filter(e=>e.available)){
        const a=createCabinet(TOYS[id],options),b=createCabinet(TOYS[id],options);
        a.selectGame(entry.entryId);b.selectGame(entry.entryId);a.start();b.start();
        for(let n=0;n<30;n++){
          a.step(makeFrame({pressed:n%5===0?['up']:[],held:['up']}));
          b.step(makeFrame({pressed:n%5===0?['jump']:[],held:['jump']}));
          expect(a.scene(scene)).toEqual(b.scene(scene));
        }
      }
    });
  }
  it('E88 DOWN traverses eight slots; ROTATE selects direction, never another game',()=>{
    const c=createCabinet(TOYS.e88,options);
    c.menu(makeFrame({pressed:['jump']}));expect(c.info['entry']).toBe('e88.1');expect(c.ranking.reverse).toBe(true);
    for(let i=1;i<=8;i++){expect(c.info['symbol']).toBe(String(i));c.menu(makeFrame({pressed:['down']}));}
    expect(c.info['symbol']).toBe('1');
  });
  it('B0202 wraps variants within a group, and RIGHT + DOWN traverses groups',()=>{
    const c=createCabinet(TOYS['apollo-b0202'],options);
    c.menu(makeFrame({pressed:['jump']}));expect(c.info['symbol']).toBe('A10');
    c.menu(makeFrame({pressed:['down']}));expect(c.info['symbol']).toBe('A01');
    for(const group of 'BCDEFGHIA'){
      c.menu(makeFrame({pressed:['down'],held:['right']}));expect(c.info['symbol']).toBe(`${group}01`);
    }
  });
});

describe('E88 falling blocks',()=>{
  it('uses measured gravity and all original pose rotations',()=>{
    expect(E88_BLOCK_FALL_MS).toEqual(observations.e88.fall.map(f=>f.medianMs));
    observations.e88.poses.forEach((poses,shape)=>poses.forEach((pose,angle)=>expect(e88Piece(shape,angle).cells).toEqual(pose)));
  });
  class Probe extends E88Blocks {
    shapes(n:number):number[]{return Array.from({length:n},()=>this.pickNext().shape);}
    blocked(x:number,y:number):number{return this.cellAt(x,y);}
    current(){return this.piece;}
    clearWell(rows:number,score:number,speed:number):void {
      this.board.fill(0);for(let y=0;y<rows;y++)for(let x=0;x<10;x++)if(x!==5)this.board[y*10+x]=1;
      this.score=score;this.speed=speed;this.piece=e88Piece(6,1);this.pieceX=4;this.pieceY=1;this.pieceDropped();
    }
  }
  it('adds the second shape pool every fourth draw only in modes 2/4, preserving the central obstruction only in 3/4',()=>{
    for(const mode of [1,2,3,4]){
      const p=new Probe({seed:13},mode);const shapes=p.shapes(20);
      expect(shapes.filter(s=>s>=7).length).toBe(mode%2===0?5:0);
      expect(p.blocked(4,0)).toBe(mode>=3?1:0);expect(p.blocked(3,0)).toBe(0);
    }
  });
  it('scores ROM wells at 10/30/70/150, with the speed carry at 1000',()=>{
    for(const sample of observations.e88.scoring.clears.filter(s=>s.beforeScore<9990)){
      const p=new Probe({seed:4},1);p.start();p.clearWell(sample.rows,sample.beforeScore,sample.speedBefore+1);
      for(let tick=0;tick<180;tick++)p.step(makeBrickInput([]));
      expect(p.score).toBe(sample.score);expect(p.speed-1).toBe(sample.speedAfter);
    }
  });
  it('honours opposite physical rotation settings without adding FIRE drops',()=>{
    const a=new Probe({seed:4,rotationDirection:1},1),b=new Probe({seed:4,rotationDirection:-1},1);a.start();b.start();
    const angle=a.current()!.angle;
    a.step(makeBrickInput(['rotate']));b.step(makeBrickInput(['rotate']));
    expect(a.current()!.angle).toBe((angle+1)%4);expect(b.current()!.angle).toBe((angle+3)%4);
  });
});

describe('native config and ranking compatibility',()=>{
  it('adds missing devices without changing existing published menus, language or illustrations',()=>{
    const current=defaultConfig();const legacy=structuredClone(current) as unknown as {toys:Record<string,unknown>;language:string;encyclopedia:unknown};
    delete legacy.toys['e88'];delete legacy.toys['apollo-b0202'];legacy.language='en';legacy.encyclopedia={snake:{imageUrl:'https://example.com/snake.png'}};
    const normalized=validateConfig(legacy);expect(normalized.language).toBe('en');expect(normalized.encyclopedia).toEqual(legacy.encyclopedia);
    for(const [id,value] of Object.entries(legacy.toys))expect(normalized.toys[id as keyof typeof normalized.toys]).toEqual(value);
    expect(validateConfig(normalized)).toEqual(normalized);
    expect(()=>validateConfig({...legacy,toys:{...legacy.toys,e88:null}})).toThrow();
  });
  it('validates entry references and defaultEntry while permitting repeated engine IDs',()=>{
    const c=defaultConfig(),t=c.toys.e88;
    t.games=t.games.slice(0,4).reverse();t.defaultEntry='e88.3';t.defaultGame='tetris';
    expect(validateConfig(c).toys.e88.defaultEntry).toBe('e88.3');expect(originalMenu('e88',t.games)).toBe(false);
    t.games[0]!.entryId='apollo-b0202.H01';expect(()=>validateConfig(c)).toThrow();
    t.games[0]!.entryId='e88.3';expect(()=>validateConfig(c)).toThrow();
  });
  it('isolates every playable native profile without changing legacy categories',()=>{
    const keys=[];
    for(const entries of Object.values(NATIVE_MENUS))for(const e of entries){
      const selection={gameId:e.gameId,toyId:e.profileId,profileId:e.profileId,variantId:e.variantId,mode:0,rulesetVersion:e.rulesetVersion,startProfile:STANDARD_START};
      if(!e.available){expect(()=>categoryFor(selection)).toThrow();continue;}
      const key=categoryFor(selection);keys.push(key);expect(validateCategory(key)).toBe(key);
      expect(()=>categoryFor({...selection,profileId:undefined,variantId:undefined})).toThrow();
      expect(()=>categoryFor({...selection,toyId:'clock99'})).toThrow();
    }
    expect(new Set(keys).size).toBe(keys.length);
    expect(categoryFor({gameId:'tetris',mode:0,toyId:'clock99',rulesetVersion:'1',startProfile:STANDARD_START})).toBe('tetris:0:r1:standard-v1:matrix');
    expect(nativeEntry('e88','e88.2')?.gameId).toBe('tetris');
  });
});

it('native player guides contain only physical controls and explain extra shapes',()=>{
  for(const entries of Object.values(NATIVE_MENUS))for(const entry of entries){
    const guide=nativeGuide(entry);expect(Boolean(guide)).toBe(entry.available);
    if(guide)expect(guide.controls.every(c=>!['up','fire','arrows','vertical'].includes(c.button))).toBe(true);
  }
  expect(nativeGuide(NATIVE_MENUS.e88[1]!)?.rules[1]?.en).toContain('fourth');
});

it('E88 exposes all thirteen original start levels, while B0202 still wraps after ten',()=>{
  const e=createCabinet(TOYS.e88,options),b=createCabinet(TOYS['apollo-b0202'],options);
  for(let n=0;n<12;n++){e.menu(makeFrame({pressed:['left']}));b.menu(makeFrame({pressed:['left']}));}
  expect(e.ranking.level).toBe(12);expect(b.ranking.level).toBe(2);
  e.start();expect(e.scene(scene).level).toBe(12);
});
