import { describe, expect, it } from 'vitest';
import { brickSound } from '../../src/audio/brick';
import { BRICK_PHRASES } from '../../src/audio/brickPhrases';
import { PRINCE_TELL, PRINCE_TELL_MS, PRINCE_VERSE, PRINCE_VERSE_BEAT_MS, PRINCE_VERSE_MS } from '../../src/audio/princeTunes';

const midiOf = (hz: number): number => Math.round(69 + 12 * Math.log2(hz / 440));

describe('Prince 皇太子: мелодии', () => {
  it('при включении звучит «Финал» один раз, в начале партии — куплет «Ти ж мене підманула»; остальные сигналы как у Mini', () => {
    expect(brickSound({ type: 'intro' }, 'prince', true, 'prince')).toBe('prince_tell');
    expect(brickSound({ type: 'started' }, 'tetris', false, 'prince')).toBe('prince_verse');
    expect(brickSound({ type: 'move' }, 'prince', true, 'prince')).toBe('mini_select');
    expect(brickSound({ type: 'lock' }, 'tetris', false, 'prince')).toBe('mini_lock');
    expect(brickSound({ type: 'intro' }, 'mini', true, 'mini')).toBe('mini_intro'); // Mini не затронут
    expect(BRICK_PHRASES.prince_tell).toBe(PRINCE_TELL);
    expect(BRICK_PHRASES.prince_verse).toBe(PRINCE_VERSE);
  });

  it('«Финал»: затакт и первый такт на ноте соль (семь нот), дальше до-ре-ми, тема B на ми, каденция на до; весь голос — одна строка нот', () => {
    const notes = PRINCE_TELL.filter((note) => note.hz > 0).map((note) => midiOf(note.hz));
    expect(notes.slice(0, 8)).toEqual([67, 67, 67, 67, 67, 67, 67, 72]); // соль4 × 7 (затакт и первый такт), затем до5
    const names = notes.map((m) => m % 12);
    expect(names).toContain(0); // до
    expect(names).toContain(4); // ми
    expect(notes.every((m) => m >= 60 && m <= 84)).toBe(true); // в пределах двух октав вокруг средней
    expect(notes.at(-1)).toBe(72); // заканчивается на до
    expect(PRINCE_TELL_MS).toBeCloseTo(PRINCE_TELL.reduce((sum, note) => sum + note.ms, 0), 6);
    expect(PRINCE_TELL_MS).toBeGreaterThan(10_000);
    expect(PRINCE_TELL_MS).toBeLessThan(13_000);
  });

  it('куплет: 16 четвертей, начинается «до до ми соль соль фа ми соль», кончается долгой ля', () => {
    expect(PRINCE_VERSE_MS).toBeCloseTo(16 * PRINCE_VERSE_BEAT_MS, 6);
    const notes = PRINCE_VERSE.filter((note) => note.hz > 0).map((note) => midiOf(note.hz));
    expect(notes.slice(0, 8)).toEqual([72, 72, 76, 79, 79, 77, 76, 79]);
    expect(notes).toHaveLength(27);
    expect(notes.at(-1)).toBe(69);
    expect(PRINCE_VERSE.at(-1)!.ms).toBe(PRINCE_VERSE_BEAT_MS);
  });

  it('каждая нота конечна и положительна по длительности', () => {
    for (const note of [...PRINCE_TELL, ...PRINCE_VERSE]) {
      expect(Number.isFinite(note.hz)).toBe(true);
      expect(note.hz).toBeGreaterThanOrEqual(0);
      expect(note.ms).toBeGreaterThan(0);
    }
  });
});
