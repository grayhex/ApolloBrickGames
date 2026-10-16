import { describe, expect, it } from 'vitest';
import { clockwise, frontFace, signedArea, wallFaces } from '../../src/app/packGeometry';

const SQUARE = [[0, 0], [100, 0], [100, 50], [0, 50]] as const; // по часовой на экране (y вниз)

describe('геометрия сборных граней карточки', () => {
  it('знак площади показывает направление обхода, clockwise приводит обход к часовой стрелке', () => {
    expect(signedArea(SQUARE)).toBe(5000);
    expect(signedArea([...SQUARE].reverse())).toBe(-5000);
    expect(clockwise([...SQUARE].reverse())).toEqual([...SQUARE]);
  });

  it('стенка: на ребро — грань длиной ребра (+1 px) и высотой глубины, нормаль наружу', () => {
    const walls = wallFaces('w', SQUARE, 3, 40, 'toy-wall', true);
    expect(walls).toHaveLength(4);
    expect(walls[0]?.normal).toEqual([0, -1, 0]); // верхнее ребро смотрит вверх (y вниз)
    expect(walls[1]?.normal).toEqual([1, 0, 0]); // правое — вправо
    expect(walls[2]?.normal).toEqual([0, 1, 0]); // нижнее — вниз
    expect(walls[3]?.normal).toEqual([-1, 0, 0]);
    expect(walls[0]?.style?.['width']).toBe('101px');
    expect(walls[0]?.style?.['height']).toBe('40px');
    expect(walls[0]?.style?.['transform']).toBe('translate3d(50px, 0px, 23px) rotateZ(0deg) rotateX(90deg)');
    expect(walls[0]?.kind).toBe('toy-wall');
    expect(walls[0]?.lit).toBeUndefined();
  });

  it('контур против часовой разворачивается, нормали остаются наружу; прозрачные грани без освещения', () => {
    const walls = wallFaces('w', [...SQUARE].reverse(), 0, 10, 'bubble-wall', false);
    for (const wall of walls) expect(wall.lit).toBe(false);
    expect(walls.map((wall) => wall.normal.join(',')).sort()).toEqual(['-1,0,0', '0,-1,0', '0,1,0', '1,0,0']);
  });

  it('лицевая вырезка: размер по рамке, центр — в координатах сцены (начало в центре карточки)', () => {
    const face = frontFace('f', 'img.webp', { points: [], box: { x: 130, y: 226, w: 200, h: 100 } }, 65, true);
    expect(face.normal).toEqual([0, 0, 1]);
    expect(face.image).toBe('img.webp');
    expect(face.style?.['width']).toBe('200px');
    expect(face.style?.['transform']).toBe('translate3d(-100px, -250.5px, 65px)');
  });
});
