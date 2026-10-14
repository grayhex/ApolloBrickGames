import { describe, expect, it } from 'vitest';
import { FAST_BLINK_TICKS, ledState, SLOW_BLINK_TICKS } from '../../src/app/leds';

describe('светодиоды (условная схема демо)', () => {
  it('готов к старту и в игре — горят все три постоянно (как на фото и на видео фрагмента)', () => {
    expect(ledState('ready', 0)).toEqual({ red: true, yellow: true, green: true });
    expect(ledState('ready', 123)).toEqual({ red: true, yellow: true, green: true });
    for (const tick of [0, 1, 7, 100]) expect(ledState('playing', tick)).toEqual({ red: true, yellow: true, green: true });
  });

  it('пауза — жёлтый мигает; смерть — красный мигает чаще; конец игры — красный горит', () => {
    const paused = Array.from({ length: 4 * SLOW_BLINK_TICKS }, (_, t) => ledState('paused', t).yellow);
    expect(paused.filter(Boolean)).toHaveLength(2 * SLOW_BLINK_TICKS);
    expect(ledState('paused', 0)).toMatchObject({ red: false, green: false });
    const dead = Array.from({ length: 4 * FAST_BLINK_TICKS }, (_, t) => ledState('dead', t).red);
    expect(dead).toEqual([true, true, false, false, true, true, false, false]);
    expect(ledState('gameOver', 99)).toEqual({ red: true, yellow: false, green: false });
  });

  it('участок пройден — все три мигают вместе', () => {
    const a = ledState('completed', 0);
    const b = ledState('completed', SLOW_BLINK_TICKS);
    expect(a).toEqual({ red: true, yellow: true, green: true });
    expect(b).toEqual({ red: false, yellow: false, green: false });
  });
});
