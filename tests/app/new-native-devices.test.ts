import { describe, expect, it } from 'vitest';
import frames from '../../src/devices/extended-menu-frames.json';
import { NATIVE_MENUS } from '../../src/devices/catalog';
import { defaultConfig } from '../../src/config/runtime';
import { validateConfig } from '../../src/config/schema';
import raw from '../../src/config/default.json';
import { nativeDefinition } from '../../src/devices/profiles';
import { NEUTRAL_BRICK_INPUT, makeBrickInput } from '../../src/brick/types';
import { categoryFor, validateCategory, STANDARD_START } from '../../src/leaderboards/category';

describe('E-23 and B0302 native menus', () => {
  it('retains every observed physical menu number and its LCD geometry', () => {
    for (const [id, count, height] of [['e23', 99, 20], ['apollo-b0302', 18, 17]] as const) {
      const entries=NATIVE_MENUS[id];
      expect(entries).toHaveLength(count);
      expect(Object.keys(frames[id])).toHaveLength(count);
      entries.forEach((entry, i)=>{
        expect(entry.nativeCode).toBe(String(i+1).padStart(2,'0'));
        const rows=(frames[id] as Record<string,string[]>)[entry.nativeCode];
        expect(rows).toHaveLength(height);
        expect(rows!.every(row=>/^[01]{10}$/.test(row))).toBe(true);
      });
    }
    expect(NATIVE_MENUS.e23.slice(92,96).map(e=>e.gameId)).toEqual(['snake','shooting-array','shooting-figures','construction']);
    expect(NATIVE_MENUS.e23.slice(96).map(e=>e.gameId)).toEqual(['tetris','tetris','tetris']);
    for (let i=0; i<99; i++) {
      const kinds=['tetris','tetris','tetris','tetris','snake','shooting-array','shooting-figures','construction'];
      expect(NATIVE_MENUS.e23[i]!.gameId).toBe(kinds[i%8]);
    }
    expect(NATIVE_MENUS['apollo-b0302'].slice(0,3).map(e=>e.gameId)).toEqual(['racing','racing','tetris']);
  });

  it('adds both defaults when loading old published configurations', () => {
    const config=validateConfig(raw);
    expect(config.toys.e23.games).toHaveLength(99);
    expect(config.toys['apollo-b0302'].games).toHaveLength(18);
    expect(validateConfig(defaultConfig())).toEqual(defaultConfig());
  });

  it('uses observed one-cell and five-cell families on B0302', () => {
    for(const [slot, expected] of [[3,4],[9,5],[13,5],[14,5],[15,1]] as const) {
      const game=nativeDefinition(NATIVE_MENUS['apollo-b0302'][slot-1]!)!.create({seed:7});
      game.start();let max=0;
      for(let tick=0;tick<180;tick++) {
        game.step(NEUTRAL_BRICK_INPUT);
        max=Math.max(max,[...game.cells()].filter(Boolean).length);
      }
      expect(max,`slot ${slot}`).toBe(expected);
    }
  });

  it('moves odd B0302 block modes down and even modes up on the 17-row screen', () => {
    for (let slot=3;slot<=16;slot++) {
      const game=nativeDefinition(NATIVE_MENUS['apollo-b0302'][slot-1]!)!.create({seed:7});
      game.start();
      const meanRow=():number=>{
        const lit=[...game.cells()].flatMap((cell,i)=>cell ? [Math.floor(i/10)] : []);
        return lit.reduce((sum,row)=>sum+row,0)/lit.length;
      };
      for(let tick=0;tick<60;tick++)game.step(NEUTRAL_BRICK_INPUT);
      const before=meanRow();
      for(let tick=0;tick<60;tick++)game.step(NEUTRAL_BRICK_INPUT);
      const after=meanRow();
      expect(slot%2===0 ? after<before : after>before,`slot ${slot}: ${before} → ${after}`).toBe(true);
    }
  });

  it('accelerates a rising B0302 piece with DOWN, as on the physical controls', () => {
    const entry=NATIVE_MENUS['apollo-b0302'][3]!;
    const normal=nativeDefinition(entry)!.create({seed:7});
    const fast=nativeDefinition(entry)!.create({seed:7});
    normal.start(); fast.start();
    for(let tick=0;tick<60;tick++) { normal.step(NEUTRAL_BRICK_INPUT); fast.step(NEUTRAL_BRICK_INPUT); }
    for(let tick=0;tick<5;tick++) { normal.step(NEUTRAL_BRICK_INPUT); fast.step(makeBrickInput(['down'])); }
    const firstRow=(cells:Uint8Array):number=>Math.floor(cells.findIndex(Boolean)/10);
    expect(firstRow(fast.cells())).toBeLessThan(firstRow(normal.cells()));
  });

  it('uses the measured B0302 mode 03 gravity at all ten speeds', () => {
    const measured=[445,355,340,295,265,235,220,193,165,135];
    for(let speed=1;speed<=10;speed++) {
      const game=nativeDefinition(NATIVE_MENUS['apollo-b0302'][2]!)!.create({seed:7,speed});
      game.start();
      let previous=-1,lastTick=-1,interval=-1;
      for(let tick=0;tick<300 && interval<0;tick++) {
        game.step(NEUTRAL_BRICK_INPUT);
        const cells=[...game.cells()].flatMap((cell,i)=>cell ? [i] : []);
        if(cells.length!==4)continue;
        const top=Math.floor(cells[0]!/10);
        if(previous>=0 && top===previous+1 && lastTick>=0)interval=tick-lastTick;
        if(top!==previous){previous=top;lastTick=tick;}
      }
      expect(interval,`speed ${speed} must fall`).toBeGreaterThan(0);
      expect(Math.abs(interval*1000/60-measured[speed-1]!),`speed ${speed}`).toBeLessThanOrEqual(18);
    }
  });

  it('starts every selected entry and keeps B0302 drawing inside its 17 rows', () => {
    for(const id of ['e23','apollo-b0302'] as const) for(const entry of NATIVE_MENUS[id]) {
      const game=nativeDefinition(entry)!.create({seed:7});
      game.start();
      for(let tick=0;tick<120;tick++) game.step(tick%30===0?makeBrickInput(['rotate']):NEUTRAL_BRICK_INPUT);
      expect(game.phase,entry.entryId).toBe('playing');
      expect(game.cells(),entry.entryId).toHaveLength(200);
      if(id==='apollo-b0302')expect([...game.cells().slice(170)].every(cell=>cell===0),entry.entryId).toBe(true);
    }
  });

  it('keeps leaderboard categories separate for every physical menu entry', () => {
    const categories=new Set<string>();
    for(const id of ['e23','apollo-b0302'] as const)for(const entry of NATIVE_MENUS[id]) {
      const category=categoryFor({gameId:entry.gameId,mode:0,toyId:id,profileId:id,
        variantId:entry.variantId,rulesetVersion:entry.rulesetVersion,startProfile:STANDARD_START});
      expect(validateCategory(category)).toBe(category);
      categories.add(category);
    }
    expect(categories.size).toBe(117);
  });
});
