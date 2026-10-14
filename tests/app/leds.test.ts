import { describe, expect, it } from 'vitest';
import { ledState, SLOW_BLINK_TICKS } from '../../src/app/leds';

const NONE = { red: false, yellow: false, green: false };

describe('светодиоды', () => {
  it('под мелодию горит один светодиод: красный → жёлтый → зелёный (такт мелодии подаёт звуковой порт)', () => {
    for (const beat of [0, 1, 2]) {
      const state = ledState('playing', 40, beat);
      expect([state.red, state.yellow, state.green]).toEqual([beat === 0, beat === 1, beat === 2]);
    }
    expect(ledState('ready', 3, 1)).toEqual({ red: false, yellow: true, green: false }); // тон готовности звучит в фазе ready
  });

  it('в тишине — построение комнаты, игра без мелодии, гибель героя — все погашены (как на записи со звуком)', () => {
    expect(ledState('ready', 0)).toEqual(NONE);
    expect(ledState('ready', 123, -1)).toEqual(NONE);
    for (const tick of [0, 1, 7, 100]) expect(ledState('playing', tick, -1)).toEqual(NONE);
    expect(ledState('dead', 3, 2)).toEqual(NONE); // мелодия при гибели обрывается
  });

  it('пауза — жёлтый мигает, мелодия не мешает; конец игры — красный горит (условно)', () => {
    const paused = Array.from({ length: 4 * SLOW_BLINK_TICKS }, (_, t) => ledState('paused', t, 1).yellow);
    expect(paused.filter(Boolean)).toHaveLength(2 * SLOW_BLINK_TICKS);
    expect(ledState('paused', 0, 1)).toMatchObject({ red: false, green: false });
    expect(ledState('gameOver', 99)).toEqual({ red: true, yellow: false, green: false });
  });

  it('участок пройден — все три мигают вместе (условно)', () => {
    const a = ledState('completed', 0);
    const b = ledState('completed', SLOW_BLINK_TICKS);
    expect(a).toEqual({ red: true, yellow: true, green: true });
    expect(b).toEqual({ red: false, yellow: false, green: false });
  });
});
