import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_VIEW, normalDim, normalFacing, type BoxView } from '../../src/app/boxMath';
import { MESSAGES } from '../../src/app/messages';
import { MARIO_OUTLINES } from '../../src/app/packOutline';
import { PACKS, type PackId } from '../../src/app/packs';
import { TOY_IDS, TOYS } from '../../src/app/toys';

const ids = Object.keys(PACKS) as PackId[];
const facing = (id: PackId, view: BoxView): string[] => PACKS[id].faces.filter((face) => normalFacing(face.normal, view)).map((face) => face.id);

describe('модели упаковок', () => {
  it('у каждой игрушки с упаковкой модель есть, и наоборот — модель принадлежит игрушке', () => {
    for (const toy of TOY_IDS) {
      const pack = TOYS[toy].pack;
      if (pack) expect(PACKS[pack], toy).toBeDefined();
    }
    expect(TOY_IDS.filter((toy) => TOYS[toy].pack).sort()).toEqual([...ids].sort()); // у каждой модели свой хозяин: Mario и «168 в 1 танк»
  });

  it('грани не повторяются, картинки граней лежат в public/brand, тексты есть на обоих языках', () => {
    for (const id of ids) {
      const pack = PACKS[id];
      expect(new Set(pack.faces.map((face) => face.id)).size, id).toBe(pack.faces.length);
      for (const face of pack.faces) {
        if (face.image) expect(existsSync(`public/brand/${pack.dir}/${face.image}`), `${id}: ${face.image}`).toBe(true);
      }
      for (const key of Object.values(pack.text)) {
        expect(MESSAGES.ru[key], `${id}:${key}`).toBeTruthy();
        expect(MESSAGES.en[key], `${id}:${key}`).toBeTruthy();
      }
      for (const preset of pack.presets) {
        expect(MESSAGES.ru[preset.label], preset.label).toBeTruthy();
        expect(MESSAGES.en[preset.label], preset.label).toBeTruthy();
      }
      expect(new Set(pack.presets.map((preset) => preset.name)).size).toBe(pack.presets.length);
      expect(pack.presets.map((preset) => preset.name)).toContain('front');
      expect(pack.presets.map((preset) => preset.name)).toContain('back');
    }
  });

  it('исходный вид показывает лицо, а не оборот', () => {
    for (const id of ids) {
      const seen = facing(id, PACKS[id].home);
      expect(seen.some((face) => /front/.test(face)), id).toBe(true);
      expect(seen.some((face) => /back/.test(face)), id).toBe(false);
    }
    expect(PACKS.tank168.home).toEqual(HOME_VIEW);
  });

  it('карточка Mario: спереди видны только лицевые плоскости (карточка, крышка и основание игрушки, пластик), сзади — только оборот', () => {
    const front = facing('mario', { yaw: 0, pitch: 0 });
    expect(front.sort()).toEqual(['bubble-front', 'card-front', 'toy-base-front', 'toy-lid-front']);
    expect(facing('mario', { yaw: 180, pitch: 0 })).toEqual(['card-back']);
  });

  it('блистер виден сбоку: при повороте направо к зрителю обращена часть стенок игрушки и пластика, но не все', () => {
    const view = PACKS.mario.presets.find((preset) => preset.name === 'blister')?.view ?? HOME_VIEW;
    const seen = facing('mario', view);
    for (const kind of ['toy-lid-wall', 'toy-base-wall', 'bubble-wall']) {
      const all = PACKS.mario.faces.filter((face) => face.id.startsWith(`${kind}-`));
      const visible = seen.filter((id) => id.startsWith(`${kind}-`));
      expect(visible.length, kind).toBeGreaterThan(0);
      expect(visible.length, kind).toBeLessThan(all.length);
    }
  });

  it('стенки идут по контуру: по одной на ребро, нормали единичные, горизонтальные и направлены наружу', () => {
    for (const [part, prefix] of [['lid', 'toy-lid-wall'], ['base', 'toy-base-wall'], ['bubble', 'bubble-wall']] as const) {
      const points = MARIO_OUTLINES[part].points;
      const walls = PACKS.mario.faces.filter((face) => face.id.startsWith(`${prefix}-`));
      expect(walls.length, part).toBe(points.length);
      const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
      walls.forEach((wall, i) => {
        const [nx, ny, nz] = wall.normal;
        expect(Math.hypot(nx, ny), `${wall.id}`).toBeCloseTo(1, 5);
        expect(nz).toBe(0);
        // Наружу: нормаль смотрит от середины контура (контур выпуклый не везде, поэтому проверяем по ребру, обращённому к краю фигуры).
        const m = wall.style?.['transform']?.match(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/);
        expect(m, wall.id).not.toBeNull();
        const mx = Number(m?.[1]);
        const my = Number(m?.[2]);
        if (Math.hypot(mx - cx, my - cy) > 150) expect(nx * (mx - cx) + ny * (my - cy), `${wall.id} (${i})`).toBeGreaterThan(0);
      });
    }
  });

  it('основание толще крышки, пластик выше игрушки; вырезки лежат над картоном', () => {
    const z = (id: string): number => Number(PACKS.mario.faces.find((face) => face.id === id)?.style?.['transform']?.match(/, (-?[\d.]+)px\)/)?.[1]);
    expect(z('toy-base-front')).toBeGreaterThan(z('toy-lid-front'));
    expect(z('toy-lid-front')).toBeGreaterThan(3);
    expect(z('bubble-front')).toBeGreaterThan(z('toy-base-front'));
  });

  it('прозрачный пластик не затемняется: у всех его граней lit = false, у остальных — нет', () => {
    for (const face of PACKS.mario.faces) expect(face.lit === false, face.id).toBe(face.id.startsWith('bubble-'));
    for (const face of PACKS.tank168.faces) expect(face.lit, face.id).toBeUndefined();
  });

  it('тёмный слой зависит от нормали: повёрнутая к свету грань светлее', () => {
    const view = { yaw: 0, pitch: 0 };
    expect(normalDim([0, 0, 1], view)).toBeLessThan(normalDim([0, 0, -1], view));
  });
});
