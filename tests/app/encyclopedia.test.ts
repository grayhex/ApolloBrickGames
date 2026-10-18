import { describe, expect, it } from 'vitest';
import { ENTRIES, guideFor, previewStage } from '../../src/encyclopedia/catalog';
import { nativeEntry } from '../../src/devices/catalog';
import { logicOrigin } from '../../src/games/quality';
import { GAMES } from '../../src/games/catalog';
import { defaultConfig } from '../../src/config/runtime';
import { illustrationUrl, validateConfig } from '../../src/config/schema';

describe('encyclopedia evidence and published illustrations', () => {
  it('covers every catalog game with bilingual content and traceable sources', () => {
    expect(ENTRIES.map(e=>e.id).sort()).toEqual(Object.keys(GAMES).sort());
    for(const entry of ENTRIES){
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(entry.scope.ru).not.toBe('');expect(entry.scope.en).not.toBe('');
      for(const source of entry.sources){expect(new URL(source.url).protocol).toBe('https:');expect(source.note.ru).not.toBe('');expect(source.note.en).not.toBe('');}
      if(GAMES[entry.id].engine) expect(guideFor(entry.id)?.rules.length).toBeGreaterThan(0);
    }
    expect(ENTRIES.find(e=>e.id==='tetris')?.accuracy).toBe(100);
    expect(ENTRIES.find(e=>e.id==='tetris-pentix')?.accuracy).toBe(90);
    expect(ENTRIES.find(e=>e.id==='tank')?.accuracy).toBe(60);
    expect(ENTRIES.find(e=>e.id==='snake')?.accuracy).toBe(90);
  });
  it('orders evidence separately from readiness and implemented provenance',()=>{
    const scores=ENTRIES.map(entry=>entry.accuracy);
    expect(scores).toEqual([...scores].sort((a,b)=>b-a));
    expect(previewStage('maze')).toBe('beta');expect(previewStage('tank')).toBe('beta');
    for(const id of ['tetris','mario'] as const)expect(previewStage(id)).toBeNull();
    expect(nativeEntry('apollo-b0202','apollo-b0202.H01')!.stage).toBe('alpha');
    expect(logicOrigin('tetris')).toBe('rom');
    expect(logicOrigin('maze')).toBe('ai');expect(logicOrigin('tank')).toBe('rom');
    expect(ENTRIES.find(e=>e.id==='maze')!.accuracy).toBe(30);
    expect(logicOrigin('space-invaders')).toBe('ai'); // related ROM link is not a verified implementation
    expect(logicOrigin('honeybee',0)).toBe('rom');expect(logicOrigin('honeybee',1)).toBe('ai');
    expect(previewStage('honeybee',1)).toBe('alpha');
  });
  it('keeps old configurations valid and round-trips game illustrations independently of toy menus', () => {
    const config=defaultConfig();
    expect(validateConfig(config)).toEqual(config);
    config.encyclopedia={mario:{imageUrl:'https://images.example/mario.png'},snake:{imageUrl:'https://images.example/snake?id=3'}};
    expect(validateConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(config.toys.mario.games).toEqual(defaultConfig().toys.mario.games);
  });
  it('rejects executable, local and credential-bearing URLs, unknown games and malformed entries', () => {
    for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','http://example.org/picture.png','/relative.jpg','https://user:password@images.example/photo.jpg','','https://images.example/'+ 'x'.repeat(2048)])expect(()=>illustrationUrl(url)).toThrow();
    for(const encyclopedia of [{unknown:{imageUrl:'https://images.example/a.png'}},{snake:{imageUrl:'javascript:alert(1)'}},{snake:null},[]])expect(()=>validateConfig({...defaultConfig(),encyclopedia})).toThrow();
  });
});
