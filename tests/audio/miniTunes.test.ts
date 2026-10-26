import { describe, expect, it } from 'vitest';
import { brickSound } from '../../src/audio/brick';
import { BRICK_PHRASES } from '../../src/audio/brickPhrases';
import { MINI_KOROBEINIKI, MINI_KOROBEINIKI_MS } from '../../src/audio/miniTunes';

describe('Mini Brick Game: звук', () => {
  it('«Коробейники» — один голос, один куплет: восемь тактов 4/4 (32 доли), равномерная темперация', () => {
    expect(MINI_KOROBEINIKI.every((note) => (note.track ?? 0) === 0 && note.wave === undefined && !note.noise)).toBe(true);
    expect(MINI_KOROBEINIKI_MS).toBe(32 * 400);
    const pitches = MINI_KOROBEINIKI.filter((note) => note.hz > 0).map((note) => Math.round(note.hz));
    expect(pitches[0]).toBe(659); // E5
    expect(Math.max(...pitches)).toBe(880); // A5 в конце
    expect(Math.min(...pitches)).toBe(440); // A4; the second verse is absent
    expect(BRICK_PHRASES.mini_korobeiniki).toBe(MINI_KOROBEINIKI);
  });

  it('музыка звучит на старте любой игры, а не в меню; остальные события — короткие сигналы', () => {
    for (const game of ['racing', 'tetris']) expect(brickSound({ type: 'started' }, game, false, 'mini')).toBe('mini_korobeiniki');
    expect(brickSound({ type: 'intro' }, 'mini-console', true, 'mini')).toBe('mini_intro');
    expect(brickSound({ type: 'move' }, 'mini-console', true, 'mini')).toBe('mini_select');
    expect(brickSound({ type: 'move' }, 'tetris', false, 'mini')).toBe('mini_move');
    expect(brickSound({ type: 'rotate' }, 'tetris', false, 'mini')).toBe('mini_turn');
    expect(brickSound({ type: 'lock' }, 'tetris', false, 'mini')).toBe('mini_lock');
    expect(brickSound({ type: 'gameOver' }, 'tetris', false, 'mini')).toBe('game_over');
    expect(brickSound({ type: 'crash' }, 'racing', false, 'mini')).toBe('kaboom');
    expect(brickSound({ type: 'lines', count: 4 }, 'tetris', false, 'mini')).toBe('tetris');
  });
});
