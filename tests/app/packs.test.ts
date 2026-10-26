import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_VIEW, normalDim, normalFacing, type BoxView } from '../../src/app/boxMath';
import { MESSAGES } from '../../src/app/messages';
import { PACKS, type PackId } from '../../src/app/packs';
import { TOY_IDS, TOYS } from '../../src/app/toys';

const ids = Object.keys(PACKS) as PackId[];
const facing = (id: PackId, view: BoxView): string[] => PACKS[id].faces.filter((face) => normalFacing(face.normal, view)).map((face) => face.id);

describe('модели упаковок', () => {
  it('у каждой игрушки с выводимой упаковкой модель есть; у Mario модель готова, но вывод выключен (`pack: null`)', () => {
    for (const toy of TOY_IDS) {
      const pack = TOYS[toy].pack;
      if (pack) expect(PACKS[pack], toy).toBeDefined();
    }
    expect(TOY_IDS.filter((toy) => TOYS[toy].pack)).toEqual(['tank168', 'taksun']);
    expect(ids.sort()).toEqual(['mario', 'taksun', 'tank168']); // модель Mario остаётся в коде и в `public/brand/pack-mario` до включения
    expect(TOYS.mario.pack).toBeNull();
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

  it('коробка Mario — шесть граней, как у «168 в 1 танк»: лицо и оборот с картинками, остальные четыре — картон без рисунка', () => {
    const faces = PACKS.mario.faces;
    expect(faces.map((face) => face.id).sort()).toEqual(['back', 'bottom', 'front', 'left', 'right', 'top']);
    expect(faces.map((face) => face.id).sort()).toEqual(PACKS.tank168.faces.map((face) => face.id).sort());
    expect(faces.filter((face) => face.image).map((face) => `${face.id}:${face.image}`).sort()).toEqual(['back:back.webp', 'front:front.webp']);
    expect(PACKS.mario.size).toEqual({ w: 660, h: 1053 }); // лицо — выпрямленное фото карточки, оборот — инструкция того же размера
  });

  it('вид спереди показывает только лицо, сзади — только оборот; сбоку и сверху — боковые грани', () => {
    expect(facing('mario', { yaw: 0, pitch: 0 })).toEqual(['front']);
    expect(facing('mario', { yaw: 180, pitch: 0 })).toEqual(['back']);
    expect(facing('mario', { yaw: 90, pitch: 0 })).toEqual(['left']);
    expect(facing('mario', { yaw: -90, pitch: 0 })).toEqual(['right']);
    expect(facing('mario', PACKS.mario.presets.find((preset) => preset.name === 'top')?.view ?? HOME_VIEW)).toContain('top');
  });

  it('у обеих коробок те же четыре вида — «Лицо», «Оборот», «Бок», «Верх»; блистера больше нет', () => {
    const names = (id: PackId): string[] => PACKS[id].presets.map((preset) => preset.name);
    expect(names('mario')).toEqual(['front', 'back', 'side', 'top']);
    expect(names('mario')).toEqual(names('tank168'));
    expect(MESSAGES.ru).not.toHaveProperty('box.view.blister');
    expect(existsSync('public/brand/pack-mario/bubble.svg')).toBe(false);
    expect(existsSync('public/brand/pack-mario/toy-lid.webp')).toBe(false);
  });

  it('картинки граней Mario — сплошные прямоугольники 660 × 1053 (лицо — сборка из фото карточки), оборот-инструкция на месте', () => {
    for (const file of ['front.webp', 'back.webp']) expect(existsSync(`public/brand/pack-mario/${file}`), file).toBe(true);
    expect(existsSync('tools/pack-mario/source/blister-front.webp')).toBe(true); // исходное фото, из которого `tools/pack-mario/build.py` собирает лицо
  });

  it('тёмный слой зависит от нормали: повёрнутая к свету грань светлее', () => {
    const view = { yaw: 0, pitch: 0 };
    expect(normalDim([0, 0, 1], view)).toBeLessThan(normalDim([0, 0, -1], view));
  });
});
