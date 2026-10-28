import { NATIVE_MENUS, type NativeDeviceId } from '../devices/catalog';
import { GAMES, type GameId, type GameStatus } from '../games/catalog';
import { SHELLS, type Shell } from '../input/settings';
import type { MsgKey } from './messages';
import type { PackId } from './packs';
import type { ToyKeyId } from './toy';

/**
 * Коллекция: четыре складные игрушки Apollo на одном корпусе-раскладушке, но с разной «аппаратной» частью — экраном, рамкой, кнопками, наклейкой.
 * Alibaba, Mini Brick Game и TAKSUN TS-995 — отдельные корпуса (у Mini Brick играющий, у Alibaba и TAKSUN пока только корпус). Универсальный Brick Game — нескладная приставка для всей матричной библиотеки.
 * Crocodile Mario — оригинальный движок; «Часы+99», «Морской бой» и «168 в 1 танк» используют общий BrickConsole с меню игр. Игрушка выбирается адресом `?toy=clock99|seabattle|tank168` (без параметра — Crocodile Mario); при переключении на странице
 * цвет и вид (свёрнута / полная / только экран) сохраняются, страница не перезагружается (см. `host.ts`).
 */
export const APOLLO_IDS = ['mario', 'clock99', 'seabattle', 'tank168'] as const;
export type ApolloId = (typeof APOLLO_IDS)[number];
export const TOY_IDS = [...APOLLO_IDS, 'alibaba', 'minibrick', 'brickgame', 'e88', 'apollo-b0202', 'e23', 'apollo-b0302', 'taksun', 'fm38', 'prince118'] as const;
export type ToyFamily = 'apollo' | 'other';
export type ToyId = (typeof TOY_IDS)[number];

/** Что открывает сайт без параметра `toy`: универсальный Brick Game (Crocodile Mario — по адресу `?toy=mario`). */
export const DEFAULT_TOY: ToyId = 'brickgame';

/** Подписи кнопок на корпусе (как напечатано на устройстве) — по ним строится нижняя половина игрушки. */
export interface ToyLabels {
  /** Ряд круглых кнопок слева направо: подпись над кнопкой и необязательная вторая подпись под ней. */
  round: readonly { key: 'onoff' | 'sp' | 'sound' | 'fire'; top: string; bottom?: string }[];
  up: string;
  left: string;
  right: string;
  down: string;
  /** Подпись над большой кнопкой и необязательная под ней. */
  big: string;
  bigBottom?: string;
}

/** Игра из набора консоли — по наклейке или упаковке. Набор закреплён за консолью (игры у консолей пересекаются, см. `games/catalog.ts`). */
export interface ToyGame {
  entryId?: string;
  id: GameId;
  /** Название так, как напечатано на наклейке или упаковке. */
  label: string;
  /** Сколько вариантов (уровней) у игры по упаковке или по наблюдениям владельца: `MARIO (9)`, `TETRIS (99)`, танки (5). */
  variants?: number;
  status: GameStatus;
  /** Консоли с меню: какие варианты игры (индексы в её списке) показывает эта консоль; без поля — все реализованные. */
  modes?: readonly number[];
}

export interface ToyModel {
  /** Mechanical shape is independent of brand and game buttons. */
  chassis?: 'folding' | 'monoblock';
  nativeDevice?: NativeDeviceId;
  defaultEntry?: string;
  id: ToyId;
  /** Название на корпусе и в переключателе (не переводится). */
  name: string;
  family: ToyFamily;
  /** Цвета корпуса, подтверждённые фотографиями оригинала; других игрушка не имеет. */
  shells: readonly Shell[];
  /** Цвет по умолчанию, если сохранённый в настройках для этой игрушки не бывает. */
  defaultShell: Shell;
  /** Цвет миниатюры в каталоге устройств (переключатель игрушек) (настраивается в админке); по умолчанию белый. */
  thumbShell?: Shell;
  /** Набор игр консоли по наклейке или упаковке (порядок — как напечатано). Игры конкретной консоли настраиваются отдельно (позже — в «админке»). */
  games: readonly ToyGame[];
  /** Игра, которая запускается сейчас: у Mario своя, у остальных игра из общего Brick Game. Входит в `games`; null у экспонатов без движка. */
  defaultGame: GameId | null;
  /** Сколько игр заявлено на наклейке в целом («168 в 1»), если больше названных. */
  gamesCount?: number;
  /**
   * Консоль с меню игр (`games` в порядке меню, знак — `gameKey`): после включения на экране знак игры, номер варианта и картинка (`src/brick/console.ts`);
   * иначе — тетрис-заглушка. Игры без движка (`status: 'planned'`) в меню выбираются, но не запускаются.
   */
  menu: boolean;
  /** Чем отмечены игры в меню устройства: цифрами (1, 2, 3…) или буквами (A, B, C…, как у «Морского боя»). */
  gameKeys: 'digits' | 'letters';
  /** Рисунок ячейки матрицы: звёздочка или точка в прямоугольнике. */
  glyph: 'star' | 'square';
  /** Боковая панель экрана тетриса: у «Часов+99» значки режима, у «Морского боя» чашка, у «168 в 1 танк» танк. */
  panel: 'clock' | 'sea' | 'seabattle' | 'tank' | 'classic';
  /** `sea` — меню, заставка и анимации «Морского боя» по фото и видео оригинала (`src/brick/seaMenu.ts`, `seaAnimations.ts`). */
  menuStyle?: 'sea';
  /**
   * Отливка нижней половины: `sea` — корпус, кнопки (круглые в лунках, стрелки), крестовина и отверстия динамика «Морского боя» (`seaBody.ts`). Владелец: у «Морского боя», «168 в 1 танк» и «Часов+99»
   * она идентична, различаются только печать (надписи кнопок), экран и цвета. Без поля — общий корпус Crocodile Mario.
   */
  cast?: 'sea';
  /** Universal console has a separate FIRE button and no hinge. */
  universal?: boolean;
  /** Оформление рамки вокруг экрана: завитки и ромбик по бокам или цветная линия вплотную к экрану. */
  deco: 'flourish' | 'frame';
  /** Светодиоды над экраном (у «Морского боя» их нет). */
  leds: boolean;
  /** Левая панель: у Mario «Figure introduction» по упаковке, у остальных справка по тетрису. */
  info: boolean;
  /** 3D-модель упаковки рядом с наклейкой: у «168 в 1 танк» — коробка по присланной развёртке, у Crocodile Mario модель есть (`packs.ts`), но вывод пока выключен; у остальных нет. */
  pack: PackId | null;
  /** Уровни на пульте справа (у заглушек выключены). */
  levels: boolean;
  /** Цвета LCD: фон окна и «чернила» включённых сегментов (по фото оригинала). */
  lcd: { bg: string; ink: string };
  /** Подпись окна игры для скринридеров. */
  stageLabel: MsgKey;
  labels: ToyLabels;
  /** Что делает каждая кнопка корпуса (ключ словаря): для подсказок, справки и скринридеров. У Mario подписи свои (`key.*`), здесь пусто. */
  keyWhat: Partial<Record<ToyKeyId, MsgKey>>;
}

const MARIO_LABELS: ToyLabels = {
  round: [
    { key: 'onoff', top: 'ON/OFF' },
    { key: 'sp', top: 'S./P.' },
    { key: 'sound', top: 'SOUND' },
    { key: 'fire', top: 'FIRE' },
  ],
  up: 'UP',
  left: 'LEFT',
  right: 'RIGHT',
  down: 'DOWN',
  big: 'JUMP',
};

export const TOYS: Record<ToyId, ToyModel> = {
  mario: {
    id: 'mario',
    family: 'apollo',
    name: 'Crocodile Mario',
    shells: ['blue', 'red', 'yellow', 'white'],
    defaultShell: 'blue',
    // Упаковка: три игры на устройстве — MARIO (9), TETRIS (99), SHOOTING (1). Из них в проекте есть только Mario (приближение).
    games: [
      { id: 'mario', label: 'MARIO', variants: 9, status: 'ready' },
      { id: 'tetris', label: 'TETRIS', variants: 99, status: 'planned' },
      { id: 'shooting', label: 'SHOOTING', variants: 1, status: 'planned' },
    ],
    defaultGame: 'mario',
    menu: false,
    gameKeys: 'digits',
    glyph: 'square',
    panel: 'sea',
    cast: 'sea',
    deco: 'frame',
    leds: true,
    info: true,
    // Модель коробки Mario (`PACKS.mario`, картинки в `public/brand/pack-mario`) готова, но вывод выключен по просьбе владельца: коробка выпирала за границы блока панели.
    // Чтобы включить, вернуть `pack: 'mario'` и проверки из коммита 1d3e3a6 (`tests/smoke/guide.spec.ts`, `tests/smoke/screenshots.spec.ts`).
    pack: null,
    levels: true,
    lcd: { bg: '#adb38c', ink: '#303a30' },
    stageLabel: 'stage.label',
    labels: MARIO_LABELS,
    keyWhat: {},
  },
  // «Часы+99»: жёлтый, красный и белый корпуса (фото владельцев); звёздочка в ячейке; светодиоды над экраном; рамка с орнаментом.
  clock99: {
    id: 'clock99',
    family: 'apollo',
    name: 'Часы+99',
    shells: ['yellow', 'red', 'white'],
    defaultShell: 'yellow',
    // Наклейка: «часы+99» — тетрис, стрельба, автогонка (и часы, по названию и кнопке TIME/GAME).
    games: [
      { id: 'tetris', label: 'тетрис', status: 'ready' },
      { id: 'racing', label: 'автогонка', status: 'ready' },
      { id: 'shooting', label: 'стрельба', status: 'ready' },
      // Дополнительная подборка проекта, не заявленный набор оригинальной прошивки.
      { id: 'tank', label: 'Танки', status: 'ready' },
      { id: 'frog', label: 'Лягушка', status: 'ready' },
      { id: 'racing-shooting', label: 'Гонки со стрельбой', status: 'ready' },
      { id: 'shooting-figures', label: 'Стрельба по фигурам', status: 'ready' },
      { id: 'construction', label: 'Строитель', status: 'ready' },
      { id: 'tetris-pentix', label: 'Pentix', status: 'ready' },
      { id: 'arkanoid', label: 'Арканоид', status: 'ready' },
    ],
    defaultGame: 'tetris',
    menu: true,
    gameKeys: 'digits',
    glyph: 'star',
    panel: 'clock',
    cast: 'sea',
    deco: 'flourish',
    leds: true,
    info: true,
    pack: null,
    levels: false,
    lcd: { bg: '#b8bbb3', ink: '#222a33' },
    stageLabel: 'stage.label.clock99',
    labels: {
      round: [
        { key: 'onoff', top: 'ON/OFF' },
        { key: 'sound', top: 'MUTE' },
        { key: 'fire', top: 'TIME', bottom: 'GAME' },
        { key: 'sp', top: 'START', bottom: 'PAUSE' },
      ],
      up: '+ +',
      left: 'ALARM SET',
      right: 'TIME SET',
      down: '−',
      big: 'ROTATE',
      bigBottom: 'ALARM ON/OFF',
    },
    keyWhat: {
      onoff: 'help.row.onoff',
      sound: 'help.row.sound',
      fire: 'help.row.menu',
      sp: 'help.row.sp',
      left: 'help.m.left',
      right: 'help.m.right',
      up: 'help.m.up',
      down: 'help.m.down',
      jump: 'help.m.rotate',
    },
  },
  // «Морской бой»: красный и синий корпуса; точка в прямоугольнике; без светодиодов; линия вокруг экрана цвета корпуса.
  seabattle: {
    id: 'seabattle',
    family: 'apollo',
    name: 'Морской бой',
    shells: ['red', 'blue'],
    defaultShell: 'red',
    // Режимы A–F — по списку владельца. На наклейке напечатаны «танк, тетрис, теннис, Ромео и Джульетта»: «теннис», видимо, и есть арканоид (F) — не подтверждено.
    // Танки, оба тетриса и арканоид играют по правилам донора (`src/brick`), «Морской бой» и «Ромео и Джульетта» — по уточнениям владельца с явно отмеченными допущениями.
    games: [
      { id: 'sea-battle', label: 'Морской бой', status: 'ready' },
      { id: 'tank', label: 'Танки', variants: 2, modes: [0, 1], status: 'ready' },
      { id: 'romeo-juliet', label: 'Ромео и Джульетта (постройка лесенки)', status: 'ready' },
      // Заявлено 20 режимов; у игры ядра (Pentix) их тоже 20 — сочетания классов донора Q…X (часть — допущение, см. `docs/brick/tetris.md`).
      { id: 'tetris-big', label: 'Тетрис с большими фигурами', variants: 20, status: 'ready' },
      // Заявлено 20 режимов, у игры ядра их 51: показываются первые 20 (какие именно режимы у устройства — допущение).
      { id: 'tetris', label: 'Тетрис', variants: 20, modes: Array.from({ length: 20 }, (_, index) => index), status: 'ready' },
      { id: 'arkanoid', label: 'Арканоид', variants: 32, status: 'ready' },
    ],
    defaultGame: 'sea-battle',
    menu: true,
    gameKeys: 'letters',
    glyph: 'square',
    panel: 'seabattle',
    menuStyle: 'sea',
    cast: 'sea',
    deco: 'frame',
    leds: false,
    info: true,
    pack: null,
    levels: false,
    lcd: { bg: '#c0c4a9', ink: '#252921' },
    stageLabel: 'stage.label.seabattle',
    labels: {
      round: [
        { key: 'onoff', top: 'ON/OFF' },
        { key: 'sp', top: 'S./P.' },
        { key: 'sound', top: 'MUTE' },
        { key: 'fire', top: 'RESET' },
      ],
      up: 'UP/MODE',
      left: 'LEFT/LEVEL',
      right: 'RIGHT/SPEED',
      down: 'DOWN',
      big: 'ROTATE',
    },
    keyWhat: {
      onoff: 'help.row.onoff',
      sp: 'help.row.sp',
      sound: 'help.row.sound',
      fire: 'help.row.menu',
      left: 'help.m.left',
      right: 'help.m.right',
      up: 'help.m.up',
      down: 'help.m.down',
      jump: 'help.m.rotate',
    },
  },
  // «168 в 1 танк»: красный и жёлтый корпуса (по фото); те же кнопки и надписи, что у «Морского боя», а рамка с завитками и светодиоды — как у «Часов+99».
  // Ячейка — прямоугольник с точкой (классический тетрис), в углу боковой панели — танк.
  tank168: {
    id: 'tank168',
    family: 'apollo',
    name: '168 в 1 танк',
    shells: ['red', 'yellow'],
    defaultShell: 'red',
    // Девять игр меню по наблюдениям владельца (порядок — как в меню); на упаковке и наклейке напечатаны «танк, автогонки, тетрис, стрельба, лягушка».
    // Из заявленных 168 — это игры, число вариантов у большинства не установлено.
    games: [
      { id: 'tank', label: 'Танки', variants: 5, status: 'ready' },
      { id: 'frog', label: 'Лягушка', status: 'ready' },
      { id: 'racing', label: 'Гонки', status: 'ready' },
      { id: 'racing-shooting', label: 'Гонки со стрельбой', status: 'ready' },
      { id: 'shooting-array', label: 'Стрельба по массиву и точкам', status: 'ready' },
      { id: 'shooting-figures', label: 'Стрельба по фигурам', status: 'ready' },
      { id: 'construction', label: 'Строитель', status: 'ready' },
      { id: 'tetris', label: 'Тетрис', variants: 51, status: 'ready' },
      { id: 'tetris-pentix', label: 'Тетрис Pentix', status: 'ready' },
    ],
    defaultGame: 'tank',
    gamesCount: 168,
    menu: true,
    gameKeys: 'digits',
    glyph: 'square',
    panel: 'tank',
    cast: 'sea',
    deco: 'flourish',
    leds: true,
    info: true,
    pack: 'tank168',
    levels: false,
    lcd: { bg: '#c3c8c6', ink: '#232a34' },
    stageLabel: 'stage.label.tank168',
    labels: {
      round: [
        { key: 'onoff', top: 'ON/OFF' },
        { key: 'sp', top: 'S./P.' },
        { key: 'sound', top: 'MUTE' },
        { key: 'fire', top: 'RESET' },
      ],
      up: 'UP/MODE',
      left: 'LEFT/LEVEL',
      right: 'RIGHT/SPEED',
      down: 'DOWN',
      big: 'ROTATE',
    },
    keyWhat: {
      onoff: 'help.row.onoff',
      sp: 'help.row.sp',
      sound: 'help.row.sound',
      fire: 'help.row.menu',
      left: 'help.m.left',
      right: 'help.m.right',
      up: 'help.m.up',
      down: 'help.m.down',
      jump: 'help.m.rotate',
    },
  },
  brickgame: {
    id: 'brickgame', chassis: 'monoblock', family: 'other', name: 'Brick Game', universal: true,
    shells: ['gray', 'black', 'clear', 'smoke'], defaultShell: 'gray',
    games: [{ id: 'tetris', label: 'Tetris', status: 'ready' }], defaultGame: 'tetris',
    menu: true, gameKeys: 'digits', glyph: 'square', panel: 'classic',
    deco: 'frame', leds: false, info: true, pack: null, levels: false,
    lcd: { bg: '#b8c397', ink: '#29352b' }, stageLabel: 'stage.label.brickgame',
    labels: { round: [{key:'onoff',top:'ON/OFF'},{key:'sp',top:'START/PAUSE'},{key:'sound',top:'SOUND'},{key:'fire',top:'FIRE'}],
      up: 'UP', left: 'LEFT', right: 'RIGHT', down: 'DOWN', big: 'ROTATE' },
    keyWhat: { onoff:'help.row.onoff', sp:'help.row.sp', sound:'help.row.sound', fire:'key.fire',
      left:'help.m.left', right:'help.m.right', up:'help.m.up', down:'help.m.down', jump:'help.m.rotate' },
  },
  e88: nativeToy('e88'),
  'apollo-b0202': nativeToy('apollo-b0202'),
  e23: nativeToy('e23'),
  'apollo-b0302': nativeToy('apollo-b0302'),
  alibaba: {
    id: 'alibaba', family: 'other', name: 'Alibaba Dance 99 in 1',
    shells: ['white'], defaultShell: 'white', games: [], defaultGame: null,
    gamesCount: 99, menu: false, gameKeys: 'digits', glyph: 'square', panel: 'sea',
    deco: 'frame', leds: false, info: true, pack: null, levels: false,
    lcd: { bg: '#8e9781', ink: '#303a30' }, stageLabel: 'stage.label.alibaba',
    labels: { round: [{key:'onoff',top:'ON/OFF'},{key:'sp',top:'S/P'},{key:'sound',top:'MUTE'},{key:'fire',top:'QUIT'}],
      up: '', left: 'LEFT', right: 'RIGHT', down: 'DOWN', big: 'ROTATE' },
    keyWhat: { onoff: 'alibaba.unavailable' },
  },
  /** Играющая модель со своей консолью (`miniBrickApp.ts`, `brick/miniConsole.ts`): набора игр для админки нет, номера 00–96 заданы в `brick/games/mini.ts`; «96 IN 1» — надпись на наклейке. */
  minibrick: {
    id: 'minibrick', family: 'other', name: 'Mini Brick Game B-S96',
    shells: ['red'], defaultShell: 'red', games: [], defaultGame: null,
    gamesCount: 96, menu: false, gameKeys: 'letters', glyph: 'square', panel: 'sea',
    deco: 'frame', leds: false, info: true, pack: null, levels: false,
    lcd: { bg: '#c6cfab', ink: '#303a30' }, stageLabel: 'stage.label.minibrick',
    labels: { round: [{key:'onoff',top:'ON/OFF'},{key:'sp',top:'START',bottom:'PAUSE'},{key:'sound',top:'MUSIC',bottom:'VOICE'},{key:'fire',top:'RESET'}],
      up: '', left: 'LEFT/LEVEL', right: 'RIGHT/SPEED', down: 'DOWN/GAME', big: 'ROTATE' },
    keyWhat: { onoff: 'help.row.onoff', sp: 'help.row.sp', sound: 'help.row.sound', fire: 'help.row.menu', left: 'help.m.left', right: 'help.m.right', down: 'help.mini.down', jump: 'help.mini.rotate' },
  },
  // Prince 皇太子 (118 in 1, AX-128): цельный корпус, не раскладушка; подписи кнопок напечатаны иероглифами (复位, 开始/暂停, 声音, 开关, 旋转, 上/下/左/右).
  prince118: {
    id: 'prince118', family: 'other', name: 'Prince 皇太子', chassis: 'monoblock',
    shells: ['white'], defaultShell: 'white', games: [], defaultGame: null, gamesCount: 118, menu: false,
    gameKeys: 'digits', glyph: 'square', panel: 'sea', deco: 'frame', leds: false, info: true, pack: null, levels: false,
    lcd: { bg: '#b9bcab', ink: '#2c3430' }, stageLabel: 'stage.label.prince118',
    labels: { round: [{ key: 'onoff', top: '开关' }, { key: 'sp', top: '开始', bottom: '暂停' }, { key: 'sound', top: '声音' }, { key: 'fire', top: '复位' }], up: '上', left: '左', right: '右', down: '下', big: '旋转' },
    keyWhat: { onoff: 'help.row.onoff', sp: 'help.row.sp', sound: 'help.row.sound', fire: 'help.row.menu', up: 'help.prince.up', left: 'help.m.left', right: 'help.m.right', down: 'help.prince.down', jump: 'help.prince.rotate' },
  },
  fm38: {
    id:'fm38',family:'other',name:'Brick Game FM-38',chassis:'monoblock',
    shells:['white'],defaultShell:'white',games:[],defaultGame:null,gamesCount:2,menu:false,
    gameKeys:'letters',glyph:'square',panel:'sea',deco:'frame',leds:false,info:true,pack:null,levels:false,
    lcd:{bg:'#c6cfab',ink:'#303a30'},stageLabel:'stage.label.brickgame',
    labels:{round:[{key:'onoff',top:'ON/OFF'},{key:'sp',top:'START/PAUSE'},{key:'sound',top:'MELODY'}],up:'',left:'LEVEL/LEFT',right:'SPEED/RIGHT',down:'GAME A/B / DOWN',big:'ROTATE'},
    keyWhat:{onoff:'help.row.onoff',sp:'help.row.sp',sound:'help.fm38.melody',left:'help.m.left',right:'help.m.right',down:'help.fm38.down',jump:'help.mini.rotate'},
  },
  /** Корпус по фото владельца (`taksunModel.ts`, `docs/taksun.md`): складной, синий, розовые кнопки; игры появятся позже. */
  taksun: {
    id: 'taksun', family: 'other', name: 'TAKSUN TS-995 · 9999 in 1',
    shells: ['blue'], defaultShell: 'blue', games: [], defaultGame: null,
    gamesCount: 9999, menu: false, gameKeys: 'digits', glyph: 'square', panel: 'sea',
    deco: 'frame', leds: false, info: true, pack: 'taksun', levels: false,
    lcd: { bg: '#9aa07a', ink: '#2c3226' }, stageLabel: 'stage.label.taksun',
    labels: { round: [{key:'onoff',top:'ON/OFF'},{key:'sp',top:'PAUSE',bottom:'START'},{key:'sound',top:'VOLUME'},{key:'fire',top:'RESET'}],
      up: 'UP', left: 'LEFT/LEVEL', right: 'RIGHT/SPEED', down: 'DOWN/GAME', big: 'DIR/ROTATE' },
    keyWhat: { onoff: 'alibaba.unavailable' },
  },
};

/** Отметка игры в меню устройства: номер или буква по порядку (`1`…`9`, `A`…`F`). */
export function gameKey(model: ToyModel, index: number): string {
  return model.gameKeys === 'letters' && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** Оболочка, в которой играет игрушка: оригинальный Mario или оболочка «тетрисных» игрушек (тетрис-заглушка и консоли с меню игр). */
export function engineOf(model: ToyModel): 'mario' | 'tetris' | 'exhibit' {
  if (model.defaultGame === null) return 'exhibit';
  return GAMES[model.defaultGame].engine === 'mario' ? 'mario' : 'tetris';
}

/** Игрушка из адреса: `?toy=clock99`. Без параметра и при неизвестном значении — универсальный Brick Game. */
export function parseToy(search: string): ToyId {
  const value = new URLSearchParams(search).get('toy');
  return TOY_IDS.find((id) => id === value) ?? DEFAULT_TOY;
}

/** Адрес страницы для игрушки: остальные параметры (отладка и т.п.) сохраняются, уровень, вид и питание — нет: другая игрушка начинается заново. */
export function toyHref(id: ToyId, search: string, pathname = window.location.pathname): string {
  const params = new URLSearchParams(search);
  for (const key of ['level', 'view', 'power', 'seed']) params.delete(key);
  if (id === DEFAULT_TOY) params.delete('toy');
  else params.set('toy', id);
  const query = params.toString();
  return `${pathname}${query === '' ? '' : `?${query}`}`;
}

/** Все четыре цвета корпуса в одном порядке (панель «Цвет» показывает их всегда; у игрушки доступны только подтверждённые фото). */
export const ALL_SHELLS: readonly Shell[] = SHELLS;

/** Цвет корпуса игрушки: сохранённый в настройках (или выбранный на странице), если у этой игрушки такой бывает, иначе цвет по умолчанию. */
export function shellFor(model: ToyModel, preferred: Shell): Shell {
  return model.shells.includes(preferred) ? preferred : model.defaultShell;
}

/** Есть ли у игрушки кнопка RESET (вместо TIME/GAME): она начинает партию заново. */
export function hasReset(model: ToyModel): boolean {
  return model.labels.round.some((button) => button.key === 'fire' && button.top === 'RESET');
}

/** Подпись кнопки корпуса так, как она напечатана на игрушке (`ALARM SET`, `TIME/GAME`). */
export function keyLabel(model: ToyModel, id: ToyKeyId): string {
  const { labels } = model;
  switch (id) {
    case 'up':
    case 'left':
    case 'right':
    case 'down':
      return labels[id];
    case 'jump':
      return labels.big;
    default: {
      const round = labels.round.find((button) => button.key === id);
      return round ? (round.bottom ? `${round.top}/${round.bottom}` : round.top) : id.toUpperCase();
    }
  }
}

/** Native firmware descriptors share only the application's lifecycle, not the universal controls. */
function nativeToy(id: NativeDeviceId): ToyModel {
  const apollo = id === 'apollo-b0202' || id === 'apollo-b0302';
  const name = id === 'apollo-b0202' ? 'Apollo B0202 · 126 in 1' : id === 'apollo-b0302' ? 'Apollo B0302 · 18 in 1' : id === 'e23' ? 'Super Brick Game E‑23 · 96 in 1' : 'Brick Game E-88 · 8 in 1';
  return {
    id, name,
    family: apollo ? 'apollo' : 'other', chassis: 'monoblock', nativeDevice: id,
    shells: [apollo ? 'black' : 'gray'], defaultShell: apollo ? 'black' : 'gray', thumbShell: apollo ? 'black' : 'gray',
    games: NATIVE_MENUS[id].filter(e => e.available).map(e => ({ id: e.gameId, entryId: e.entryId, label: `${e.nativeCode} · ${e.name.en}`, status: e.available ? 'ready' : 'planned' })),
    defaultGame: NATIVE_MENUS[id][0]!.gameId, defaultEntry: NATIVE_MENUS[id][0]!.entryId,
    gamesCount: id === 'apollo-b0202' ? 126 : id === 'apollo-b0302' ? 18 : id === 'e23' ? 96 : 8, menu: true, gameKeys: id === 'apollo-b0202' ? 'letters' : 'digits',
    glyph: 'square', panel: 'sea', deco: 'frame', leds: false, info: true, pack: null, levels: false,
    lcd: {bg: '#b7beb1', ink: '#202720'}, stageLabel: 'stage.label.brickgame',
    labels: {round: [{key:'onoff',top:'ON/OFF'},{key:'sp',top:apollo?'START/P':'START/PAUSE'},{key:'sound',top:'MUTE'},...(apollo?[{key:'fire' as const,top:'RESET'}]:[])],
      up:'',left:apollo?'LEFT/HEIGHT':'LEFT/LEVEL',right:'RIGHT/SPEED',down:'DOWN/MODE',big:'ROTATE/DIRECTION'},
    keyWhat: {onoff:'help.row.onoff',sp:'help.row.sp',sound:'help.row.sound',left:'help.m.left',right:'help.m.right',down:'help.m.down',jump:'help.m.rotate',...(apollo?{fire:'help.row.menu' as const}:{})},
  };
}
export const isMonoblock = (model: ToyModel): boolean => model.chassis === 'monoblock' || !!model.universal;
