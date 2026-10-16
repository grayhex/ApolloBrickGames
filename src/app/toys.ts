import { GAMES, type GameEngine, type GameId, type GameStatus } from '../games/catalog';
import { SHELLS, type Shell } from '../input/settings';
import type { MsgKey } from './messages';
import type { ToyKeyId } from './toy';

/**
 * Четыре складные игрушки Apollo: на одном корпусе-раскладушке, но с разной «аппаратной» частью — экраном, рамкой, кнопками, наклейкой.
 * Crocodile Mario — оригинальный движок; «Часы+99», «Морской бой» и «168 в 1 танк» пока играют в обычный тетрис (заглушка — оригинальные игры
 * будут восстановлены позже). Игрушка выбирается адресом `?toy=clock99|seabattle|tank168` (без параметра — Crocodile Mario); при переключении на странице
 * цвет и вид (свёрнута / полная / только экран) сохраняются, страница не перезагружается (см. `host.ts`).
 */
export const TOY_IDS = ['mario', 'clock99', 'seabattle', 'tank168'] as const;
export type ToyId = (typeof TOY_IDS)[number];

export const DEFAULT_TOY: ToyId = 'mario';

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
  id: GameId;
  /** Название так, как напечатано на наклейке или упаковке. */
  label: string;
  /** Сколько вариантов (уровней) у игры по упаковке: `MARIO (9)`, `TETRIS (99)`. */
  variants?: number;
  status: GameStatus;
}

export interface ToyModel {
  id: ToyId;
  /** Название на корпусе и в переключателе (не переводится). */
  name: string;
  /** Цвета корпуса, подтверждённые фотографиями оригинала; других игрушка не имеет. */
  shells: readonly Shell[];
  /** Цвет по умолчанию, если сохранённый в настройках для этой игрушки не бывает. */
  defaultShell: Shell;
  /** Набор игр консоли по наклейке или упаковке (порядок — как напечатано). Игры конкретной консоли настраиваются отдельно (позже — в «админке»). */
  games: readonly ToyGame[];
  /** Игра, которая запускается сейчас: у Mario своя, у остальных тетрис-заглушка. Всегда входит в `games`. */
  defaultGame: GameId;
  /** Сколько игр заявлено на наклейке в целом («168 в 1»), если больше названных. */
  gamesCount?: number;
  /** Чем отмечены игры в меню устройства: цифрами (1, 2, 3…) или буквами (A, B, C…, как у «Морского боя»). */
  gameKeys: 'digits' | 'letters';
  /** Рисунок ячейки матрицы: звёздочка или точка в прямоугольнике. */
  glyph: 'star' | 'square';
  /** Боковая панель экрана тетриса: у «Часов+99» значки режима, у «Морского боя» чашка, у «168 в 1 танк» танк. */
  panel: 'clock' | 'sea' | 'tank';
  /** Оформление рамки вокруг экрана: завитки и ромбик по бокам или цветная линия вплотную к экрану. */
  deco: 'flourish' | 'frame';
  /** Светодиоды над экраном (у «Морского боя» их нет). */
  leds: boolean;
  /** Левая панель: у Mario «Figure introduction» по упаковке, у остальных справка по тетрису. */
  info: boolean;
  /** Есть ли рядом с наклейкой 3D-модель упаковки (у «168 в 1 танк» — по присланной развёртке). */
  box: boolean;
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
    gameKeys: 'digits',
    glyph: 'square',
    panel: 'sea',
    deco: 'frame',
    leds: true,
    info: true,
    box: false,
    levels: true,
    lcd: { bg: '#adb38c', ink: '#303a30' },
    stageLabel: 'stage.label',
    labels: MARIO_LABELS,
    keyWhat: {},
  },
  // «Часы+99»: жёлтый, красный и белый корпуса (фото владельцев); звёздочка в ячейке; светодиоды над экраном; рамка с орнаментом.
  clock99: {
    id: 'clock99',
    name: 'Часы+99',
    shells: ['yellow', 'red', 'white'],
    defaultShell: 'yellow',
    // Наклейка: «часы+99» — тетрис, стрельба, автогонка (и часы, по названию и кнопке TIME/GAME).
    games: [
      { id: 'clock', label: 'часы', status: 'planned' },
      { id: 'tetris', label: 'тетрис', status: 'placeholder' },
      { id: 'shooting', label: 'стрельба', status: 'planned' },
      { id: 'racing', label: 'автогонка', status: 'planned' },
    ],
    defaultGame: 'tetris',
    gameKeys: 'digits',
    glyph: 'star',
    panel: 'clock',
    deco: 'flourish',
    leds: true,
    info: true,
    box: false,
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
      fire: 'help.row.timeGame',
      sp: 'help.row.sp',
      left: 'help.t.left',
      right: 'help.t.right',
      up: 'help.t.rotate',
      down: 'help.t.down',
      jump: 'help.t.rotate',
    },
  },
  // «Морской бой»: красный и синий корпуса; точка в прямоугольнике; без светодиодов; линия вокруг экрана цвета корпуса.
  seabattle: {
    id: 'seabattle',
    name: 'Морской бой',
    shells: ['red', 'blue'],
    defaultShell: 'red',
    // Режимы A–F — по списку владельца. На наклейке напечатаны «танк, тетрис, теннис, Ромео и Джульетта»: «теннис», видимо, и есть арканоид (F) — не подтверждено.
    games: [
      { id: 'sea-battle', label: 'Морской бой', status: 'planned' },
      { id: 'tank', label: 'Танки', status: 'planned' },
      { id: 'romeo-juliet', label: 'Ромео и Джульетта', status: 'planned' },
      { id: 'tetris-big', label: 'Тетрис с большими фигурами', status: 'planned' },
      { id: 'tetris', label: 'Тетрис', status: 'placeholder' },
      { id: 'arkanoid', label: 'Арканоид', status: 'planned' },
    ],
    defaultGame: 'tetris',
    gameKeys: 'letters',
    glyph: 'square',
    panel: 'sea',
    deco: 'frame',
    leds: false,
    info: true,
    box: false,
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
      fire: 'help.row.reset',
      left: 'help.t.left',
      right: 'help.t.right',
      up: 'help.t.rotate',
      down: 'help.t.down',
      jump: 'help.t.rotate',
    },
  },
  // «168 в 1 танк»: красный и жёлтый корпуса (по фото); те же кнопки и надписи, что у «Морского боя», а рамка с завитками и светодиоды — как у «Часов+99».
  // Ячейка — прямоугольник с точкой (классический тетрис), в углу боковой панели — танк.
  tank168: {
    id: 'tank168',
    name: '168 в 1 танк',
    shells: ['red', 'yellow'],
    defaultShell: 'red',
    // Девять игр меню по наблюдениям владельца (порядок — как в меню); на упаковке и наклейке напечатаны «танк, автогонки, тетрис, стрельба, лягушка».
    // Из заявленных 168 — это игры, число вариантов у большинства не установлено.
    games: [
      { id: 'tank', label: 'Танки', variants: 5, status: 'planned' },
      { id: 'frog', label: 'Лягушка', status: 'planned' },
      { id: 'racing', label: 'Гонки', status: 'planned' },
      { id: 'racing-shooting', label: 'Гонки со стрельбой', status: 'planned' },
      { id: 'shooting-array', label: 'Стрельба по массиву и точкам', status: 'planned' },
      { id: 'shooting-figures', label: 'Стрельба по фигурам', status: 'planned' },
      { id: 'construction', label: 'Строитель', status: 'planned' },
      { id: 'tetris', label: 'Тетрис', variants: 51, status: 'placeholder' },
      { id: 'tetris-pentix', label: 'Тетрис Pentix', status: 'planned' },
    ],
    defaultGame: 'tetris',
    gamesCount: 168,
    gameKeys: 'digits',
    glyph: 'square',
    panel: 'tank',
    deco: 'flourish',
    leds: true,
    info: true,
    box: true,
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
      fire: 'help.row.reset',
      left: 'help.t.left',
      right: 'help.t.right',
      up: 'help.t.rotate',
      down: 'help.t.down',
      jump: 'help.t.rotate',
    },
  },
};

/** Отметка игры в меню устройства: номер или буква по порядку (`1`…`9`, `A`…`F`). */
export function gameKey(model: ToyModel, index: number): string {
  return model.gameKeys === 'letters' ? String.fromCharCode(65 + index) : String(index + 1);
}

/** Движок, которым сейчас играет игрушка: оригинальный Mario или тетрис-заглушка. */
export function engineOf(model: ToyModel): GameEngine {
  return GAMES[model.defaultGame].engine ?? 'tetris';
}

/** Игрушка из адреса: `?toy=clock99`. Неизвестное значение — Crocodile Mario. */
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
