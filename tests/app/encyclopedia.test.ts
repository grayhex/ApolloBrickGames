import { describe, expect, it } from 'vitest';
import { ENTRIES, guideFor, previewStage } from '../../src/encyclopedia/catalog';
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
  it('orders the catalog by descending evidence accuracy and marks only alpha/beta reconstructions',()=>{
    const scores=ENTRIES.map(entry=>entry.accuracy);
    expect(scores).toEqual([...scores].sort((a,b)=>b-a));
    expect(previewStage('maze')).toBe('alpha');expect(previewStage('tank')).toBe('beta');
    for(const id of ['snake','dice','honeybee','frog','tetris','mario','clock'] as const)expect(previewStage(id)).toBeNull();
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
