import { describe, expect, it } from 'vitest';
import { CableGlitch, GLITCH } from '../../src/app/cableGlitch';

describe('шутка со шлейфом: уровень потери по времени', () => {
  it('без нажатия всё цело', () => {
    const glitch = new CableGlitch();
    expect(glitch.level(0)).toBe(0);
    expect(glitch.level(5000)).toBe(0);
    expect(glitch.active(5000)).toBe(false);
    expect(glitch.held).toBe(false);
  });

  it('пока держат: сначала пауза, потом частичная потеря растёт, потом экран гаснет совсем', () => {
    const glitch = new CableGlitch();
    glitch.grab(1000);
    expect(glitch.held).toBe(true);
    expect(glitch.level(1000 + GLITCH.onsetMs)).toBe(0); // первые мгновения всё цело
    const early = glitch.level(1000 + GLITCH.onsetMs + 300);
    const middle = glitch.level(1000 + (GLITCH.onsetMs + GLITCH.partialMs) / 2);
    const partial = glitch.level(1000 + GLITCH.partialMs);
    expect(early).toBeGreaterThan(0);
    expect(middle).toBeGreaterThan(early);
    expect(partial).toBeCloseTo(GLITCH.partialMax, 6); // ещё не погас: часть экрана видна
    expect(partial).toBeLessThan(1);
    const between = glitch.level(1000 + (GLITCH.partialMs + GLITCH.fullMs) / 2);
    expect(between).toBeGreaterThan(partial);
    expect(between).toBeLessThan(1);
    expect(glitch.level(1000 + GLITCH.fullMs)).toBe(1);
    expect(glitch.level(1000 + GLITCH.fullMs + 60_000)).toBe(1); // и держится, пока держат
  });

  it('уровень не убывает, пока держат', () => {
    const glitch = new CableGlitch();
    glitch.grab(0);
    let last = 0;
    for (let t = 0; t <= GLITCH.fullMs + 500; t += 25) {
      const level = glitch.level(t);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('отпустили: картинка плавно возвращается с достигнутого уровня и возвращается полностью', () => {
    const glitch = new CableGlitch();
    glitch.grab(0);
    const at = GLITCH.fullMs + 100;
    expect(glitch.level(at)).toBe(1);
    glitch.release(at);
    expect(glitch.held).toBe(false);
    expect(glitch.level(at)).toBe(1); // в момент отпускания — как было
    expect(glitch.level(at + GLITCH.recoverMs / 2)).toBeCloseTo(0.5, 6);
    expect(glitch.level(at + GLITCH.recoverMs)).toBe(0);
    expect(glitch.active(at + GLITCH.recoverMs + 1)).toBe(false);
  });

  it('отпустили до начала потери — ничего не было; повторный захват начинает с нуля', () => {
    const glitch = new CableGlitch();
    glitch.grab(0);
    glitch.release(GLITCH.onsetMs - 50);
    expect(glitch.level(GLITCH.onsetMs - 50)).toBe(0);
    expect(glitch.active(GLITCH.onsetMs)).toBe(false);
    glitch.grab(10_000);
    expect(glitch.level(10_000 + 100)).toBe(0);
    expect(glitch.level(10_000 + GLITCH.fullMs)).toBe(1);
  });

  it('повторные grab/release без пары ничего не ломают', () => {
    const glitch = new CableGlitch();
    glitch.release(5); // не держали
    expect(glitch.level(6)).toBe(0);
    glitch.grab(100);
    glitch.grab(900); // второй grab не сдвигает начало
    expect(glitch.level(100 + GLITCH.fullMs)).toBe(1);
  });
});
