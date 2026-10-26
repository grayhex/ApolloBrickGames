import { HOME_VIEW, PRESET_VIEWS, type BoxView, type Vec3 } from './boxMath';
import type { MsgKey } from './i18n';

/**
 * Модели 3D-упаковок игрушек. Упаковка — «коробка» из шести граней: у каждой есть нормаль (для освещения), необязательная картинка и класс `box3d__face--<id>`,
 * по которому в `styles.css` задано положение грани в пространстве. У «168 в 1 танк» все шесть граней — картинки развёртки; у Crocodile Mario известны только
 * лицо (фото карточки с игрушкой) и оборот (инструкция), боковые грани — картон без рисунка (их цвет и толщина коробки — допущение, на фото боков нет).
 */
export type PackId = 'tank168' | 'mario' | 'taksun';

export interface PackFace {
  id: string;
  normal: Vec3;
  /** Картинка грани в `public/brand/<dir>/`; у граней без картинки вид задаёт CSS (картон). */
  image?: string;
}

export interface PackPreset {
  name: string;
  label: MsgKey;
  view: BoxView;
}

export interface PackModel {
  id: PackId;
  /** Каталог картинок в `public/brand`. */
  dir: string;
  /** Размеры лица (по ним подбирается масштаб): ширина и высота в условных пикселях. */
  size: { w: number; h: number };
  faces: readonly PackFace[];
  home: BoxView;
  presets: readonly PackPreset[];
  text: { open: MsgKey; short: MsgKey; title: MsgKey; aria: MsgKey; credit: MsgKey };
}

const FRONT: Vec3 = [0, 0, 1];
const BACK: Vec3 = [0, 0, -1];
const LEFT: Vec3 = [-1, 0, 0];
const RIGHT: Vec3 = [1, 0, 0];
const TOP: Vec3 = [0, -1, 0];
const BOTTOM: Vec3 = [0, 1, 0];

const PRESETS: readonly PackPreset[] = [
  { name: 'front', label: 'box.view.front', view: PRESET_VIEWS.front },
  { name: 'back', label: 'box.view.back', view: PRESET_VIEWS.back },
  { name: 'side', label: 'box.view.side', view: PRESET_VIEWS.side },
  { name: 'top', label: 'box.view.top', view: PRESET_VIEWS.top },
];

export const PACKS: Record<PackId, PackModel> = {
  tank168: {
    id: 'tank168',
    dir: 'box-tank168',
    size: { w: 525, h: 750 },
    faces: [
      { id: 'front', normal: FRONT, image: 'front.webp' },
      { id: 'back', normal: BACK, image: 'back.webp' },
      { id: 'left', normal: LEFT, image: 'left.webp' },
      { id: 'right', normal: RIGHT, image: 'right.webp' },
      { id: 'top', normal: TOP, image: 'top.webp' },
      { id: 'bottom', normal: BOTTOM, image: 'bottom.webp' },
    ],
    home: HOME_VIEW,
    presets: PRESETS,
    text: { open: 'box.open', short: 'box.short', title: 'box.title', aria: 'box.aria', credit: 'box.credit' },
  },
  mario: {
    id: 'mario',
    dir: 'pack-mario',
    size: { w: 660, h: 1053 },
    faces: [
      { id: 'front', normal: FRONT, image: 'front.webp' },
      { id: 'back', normal: BACK, image: 'back.webp' },
      { id: 'left', normal: LEFT },
      { id: 'right', normal: RIGHT },
      { id: 'top', normal: TOP },
      { id: 'bottom', normal: BOTTOM },
    ],
    home: HOME_VIEW,
    presets: PRESETS,
    text: { open: 'pack.mario.open', short: 'pack.mario.short', title: 'pack.mario.title', aria: 'pack.mario.aria', credit: 'pack.mario.credit' },
  },
  /**
   * Коробка TAKSUN TS-995 по восстановленной развёртке (архив `TS995_packaging_assets.zip` в истории Git): лицо и оборот — выпрямленные фотографии владельца с набранным текстом инструкции,
   * розовые бока, верх и низ. Размеры: лицо 1300 × 2160 → 565 × 939, глубина ≈ 140 (в развёртке бока 340 px, верх и низ 302 px — размеры иллюстративные, не проверены по оригиналу).
   */
  taksun: {
    id: 'taksun',
    dir: 'box-taksun',
    size: { w: 565, h: 939 },
    faces: [
      { id: 'front', normal: FRONT, image: 'front.webp' },
      { id: 'back', normal: BACK, image: 'back.webp' },
      { id: 'left', normal: LEFT, image: 'left.webp' },
      { id: 'right', normal: RIGHT, image: 'right.webp' },
      { id: 'top', normal: TOP, image: 'top.webp' },
      { id: 'bottom', normal: BOTTOM, image: 'bottom.webp' },
    ],
    home: HOME_VIEW,
    presets: PRESETS,
    text: { open: 'pack.taksun.open', short: 'pack.taksun.short', title: 'pack.taksun.title', aria: 'pack.taksun.aria', credit: 'pack.taksun.credit' },
  },
};
