import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_VIEW, normalDim, normalFacing, type BoxView } from '../../src/app/boxMath';
import { MESSAGES } from '../../src/app/messages';
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

  it('карточка Mario: спереди видны только лицевые плоскости (карточка, игрушка, пластик), сзади — только оборот', () => {
    const front = facing('mario', { yaw: 0, pitch: 0 });
    expect(front.sort()).toEqual(['bubble-front', 'card-front', 'toy-front']);
    expect(facing('mario', { yaw: 180, pitch: 0 })).toEqual(['card-back']);
  });

  it('блистер виден сбоку: при повороте направо к зрителю обращены стенки игрушки и пластика', () => {
    const seen = facing('mario', PACKS.mario.presets.find((preset) => preset.name === 'blister')?.view ?? HOME_VIEW);
    expect(seen).toContain('toy-right');
    expect(seen).toContain('bubble-right');
    expect(seen).not.toContain('toy-left');
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
