import { HOME_VIEW, PRESET_VIEWS, type BoxView, type Vec3 } from './boxMath';
import type { MsgKey } from './i18n';
import { frontFace, wallFaces } from './packGeometry';
import { MARIO_OUTLINES } from './packOutline';

/**
 * Модели 3D-упаковок игрушек. Упаковка — набор граней: у каждой есть нормаль (для освещения), необязательная картинка и класс `box3d__face--<id>`,
 * по которому в `styles.css` задано положение грани в пространстве. «Коробка» у «168 в 1 танк» — шесть граней развёртки; блистерная карточка
 * Crocodile Mario — картонная карточка (лицо и оборот с вырезом под подвес), раскрытая игрушка (крышка и основание — вырезки из фото, толщина — боковые
 * стенки по их контурам) и прозрачный пластиковый блистер вокруг неё. Положение таких граней задано в `PackFace.style`.
 */
export type PackId = 'tank168' | 'mario';

export interface PackFace {
  id: string;
  normal: Vec3;
  /** Картинка грани в `public/brand/<dir>/`; у граней без картинки вид задаёт CSS (стенки, пластик). */
  image?: string;
  /** Освещение затемняет грань тёмным слоем; у прозрачного пластика его нет. */
  lit?: boolean;
  /** Дополнительный класс `box3d__face--<kind>` (общий вид у однотипных граней — стенок). */
  kind?: string;
  /** Размер и положение сборной грани (стенка по ребру контура, вырезка): CSS-свойства для `style`. */
  style?: Readonly<Record<string, string>>;
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

/** Высота лица картона над серединой (половина толщины 6) и глубина частей над ним: крышка, основание, прозрачный блистер. */
const MARIO_Z = 3;
const MARIO_DEPTH = { lid: 62, base: 88, bubble: 116 } as const;

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
    presets: [
      { name: 'front', label: 'box.view.front', view: PRESET_VIEWS.front },
      { name: 'back', label: 'box.view.back', view: PRESET_VIEWS.back },
      { name: 'side', label: 'box.view.side', view: PRESET_VIEWS.side },
      { name: 'top', label: 'box.view.top', view: PRESET_VIEWS.top },
    ],
    text: { open: 'box.open', short: 'box.short', title: 'box.title', aria: 'box.aria', credit: 'box.credit' },
  },
  mario: {
    id: 'mario',
    dir: 'pack-mario',
    size: { w: 660, h: 1053 },
    faces: [
      // Картонная карточка: лицо, оборот и узкие торцы.
      { id: 'card-front', normal: FRONT, image: 'front.webp' },
      { id: 'card-back', normal: BACK, image: 'back.webp' },
      { id: 'edge-left', normal: LEFT },
      { id: 'edge-right', normal: RIGHT },
      { id: 'edge-top', normal: TOP },
      { id: 'edge-bottom', normal: BOTTOM },
      // Раскрытая игрушка: крышка тоньше основания; лицо — вырезки из фото, бока — стенки по контурам.
      frontFace('toy-lid-front', 'toy-lid.webp', MARIO_OUTLINES.lid, MARIO_Z + MARIO_DEPTH.lid, true),
      frontFace('toy-base-front', 'toy-base.webp', MARIO_OUTLINES.base, MARIO_Z + MARIO_DEPTH.base, true),
      ...wallFaces('toy-lid-wall', MARIO_OUTLINES.lid.points, MARIO_Z, MARIO_DEPTH.lid, 'toy-wall', true),
      ...wallFaces('toy-base-wall', MARIO_OUTLINES.base.points, MARIO_Z, MARIO_DEPTH.base, 'toy-wall', true),
      // Прозрачный пластик блистера вокруг игрушки (без затемнения).
      frontFace('bubble-front', 'bubble.svg', MARIO_OUTLINES.bubble, MARIO_Z + MARIO_DEPTH.bubble, false),
      ...wallFaces('bubble-wall', MARIO_OUTLINES.bubble.points, MARIO_Z, MARIO_DEPTH.bubble, 'bubble-wall', false),
    ],
    home: { yaw: -24, pitch: -8 },
    presets: [
      { name: 'front', label: 'box.view.front', view: { yaw: 0, pitch: 0 } },
      { name: 'back', label: 'box.view.back', view: { yaw: 180, pitch: 0 } },
      { name: 'blister', label: 'box.view.blister', view: { yaw: -52, pitch: -6 } },
    ],
    text: { open: 'pack.mario.open', short: 'pack.mario.short', title: 'pack.mario.title', aria: 'pack.mario.aria', credit: 'pack.mario.credit' },
  },
};
