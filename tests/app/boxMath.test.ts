import { describe, expect, it } from 'vitest';
import {
  BOX,
  FACE_NAMES,
  HOME_VIEW,
  MAX_PITCH,
  MAX_ZOOM,
  MIN_ZOOM,
  PRESET_VIEWS,
  clampPitch,
  faceBrightness,
  faceDim,
  fitScale,
  isFacing,
  rotatedNormal,
  shortestDelta,
  wrapAngle,
  type FaceName,
} from '../../src/app/boxMath';

const facing = (view: { yaw: number; pitch: number }): FaceName[] => FACE_NAMES.filter((face) => isFacing(face, view));

describe('углы', () => {
  it('wrapAngle приводит угол к (−180, 180]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(190)).toBe(-170);
    expect(wrapAngle(-190)).toBe(170);
    expect(wrapAngle(540)).toBe(180);
    expect(wrapAngle(-180)).toBe(180);
    expect(wrapAngle(360 * 5 + 12)).toBe(12);
  });

  it('shortestDelta идёт по короткой дуге через ±180', () => {
    expect(shortestDelta(170, -170)).toBe(20);
    expect(shortestDelta(-170, 170)).toBe(-20);
    expect(shortestDelta(10, 100)).toBe(90);
    expect(Math.abs(shortestDelta(0, 180))).toBe(180);
  });

  it('наклон не доходит до полюсов', () => {
    expect(clampPitch(120)).toBe(MAX_PITCH);
    expect(clampPitch(-120)).toBe(-MAX_PITCH);
    expect(clampPitch(30)).toBe(30);
  });
});

describe('какие грани видны', () => {
  it('исходный вид — лицо, правая грань и верх (трёхчетвертной)', () => {
    expect(facing(HOME_VIEW).sort()).toEqual(['front', 'right', 'top']);
  });

  it('кнопки видов: «Лицо» — лицо, «Оборот» — оборот, «Бок» — левая грань, «Верх» — верх', () => {
    expect(facing(PRESET_VIEWS.front)).toEqual(['front']);
    expect(facing(PRESET_VIEWS.back)).toEqual(['back']);
    expect(facing(PRESET_VIEWS.side)).toEqual(['left']);
    expect(facing(PRESET_VIEWS.top)).toContain('top');
    expect(facing(PRESET_VIEWS.top)).not.toContain('bottom');
  });

  it('грани противоположны: ни одна пара не видна одновременно', () => {
    for (let yaw = -180; yaw <= 180; yaw += 15) {
      for (let pitch = -MAX_PITCH; pitch <= MAX_PITCH; pitch += 11) {
        const seen = facing({ yaw, pitch });
        expect(seen.includes('front') && seen.includes('back'), `${yaw}/${pitch}`).toBe(false);
        expect(seen.includes('left') && seen.includes('right'), `${yaw}/${pitch}`).toBe(false);
        expect(seen.includes('top') && seen.includes('bottom'), `${yaw}/${pitch}`).toBe(false);
        expect(seen.length, `${yaw}/${pitch}: виден хотя бы один`).toBeGreaterThan(0);
      }
    }
  });

  it('нормаль лица при повороте на 90° смотрит вправо (как у CSS rotateY)', () => {
    const [x, y, z] = rotatedNormal('front', { yaw: 90, pitch: 0 });
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
  });
});

describe('освещение', () => {
  it('яркость в пределах 0,5…1, лицо ярче оборота при свете спереди-сверху-слева', () => {
    for (const face of FACE_NAMES) {
      const b = faceBrightness(face, HOME_VIEW);
      expect(b).toBeGreaterThanOrEqual(0.5);
      expect(b).toBeLessThanOrEqual(1);
    }
    expect(faceBrightness('front', PRESET_VIEWS.front)).toBeGreaterThan(faceBrightness('back', PRESET_VIEWS.front));
  });

  it('верх при взгляде сверху светлее правой грани, обращённой от света', () => {
    expect(faceBrightness('top', HOME_VIEW)).toBeGreaterThan(faceBrightness('right', HOME_VIEW));
  });

  it('тёмный слой: 0 у самой светлой грани, не больше ≈ 0,43 у тёмной', () => {
    const dims = FACE_NAMES.map((face) => faceDim(face, HOME_VIEW));
    for (const dim of dims) {
      expect(dim).toBeGreaterThanOrEqual(0);
      expect(dim).toBeLessThanOrEqual(0.43);
    }
    expect(Math.min(...dims)).toBeLessThan(0.2);
  });
});

describe('масштаб', () => {
  it('коробка с запасом на вращение помещается в область', () => {
    const s = fitScale(200, 300);
    expect(BOX.w * s).toBeLessThanOrEqual(200);
    expect(BOX.h * s).toBeLessThanOrEqual(300);
    expect(fitScale(0, 100)).toBe(0);
    expect(fitScale(100, -1)).toBe(0);
  });

  it('приближение ограничено', () => {
    expect(fitScale(200, 300, 100)).toBeCloseTo(fitScale(200, 300, MAX_ZOOM), 10);
    expect(fitScale(200, 300, 0.01)).toBeCloseTo(fitScale(200, 300, MIN_ZOOM), 10);
  });

  it('размеры коробки как у упаковки: лицо портретное, торец тонкий', () => {
    expect(BOX.h).toBeGreaterThan(BOX.w);
    expect(BOX.d).toBeLessThan(BOX.w / 3);
  });
});
