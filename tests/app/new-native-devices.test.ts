import { describe, expect, it } from 'vitest';
import frames from '../../src/devices/extended-menu-frames.json';
import { NATIVE_MENUS } from '../../src/devices/catalog';
import { defaultConfig } from '../../src/config/runtime';
import { validateConfig } from '../../src/config/schema';
import raw from '../../src/config/default.json';
import { nativeDefinition } from '../../src/devices/profiles';
import { NEUTRAL_BRICK_INPUT } from '../../src/brick/types';

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
});
