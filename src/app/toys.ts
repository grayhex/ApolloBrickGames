import { GAMES, type GameId, type GameStatus } from '../games/catalog';
import { SHELLS, type Shell } from '../input/settings';
import type { MsgKey } from './messages';
import type { ToyKeyId } from './toy';

/**
 * Четыре складные игрушки Apollo: на одном корпусе-раскладушке, но с разной «аппаратной» частью — экраном, рамкой, кнопками, наклейкой.
 * Crocodile Mario — оригинальный движок; «Часы+99» пока играет в обычный тетрис (заглушка), а «Морской бой» и «168 в 1 танк» — консоли с меню игр
 * (`src/brick`: правила восстановлены по открытому донору, см. `docs/brick-games.md`; у «168 в 1 танк» игры выбираются цифрами, у «Морского боя» буквами). Игрушка выбирается адресом `?toy=clock99|seabattle|tank168` (без параметра — Crocodile Mario); при переключении на странице
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
  /** Название так, как напечатано на наклейке или упаковке (у консолей с меню — как его назвал владелец устройства). */
  label: string;
  /** Сколько вариантов (уровней) у игры по упаковке или по наблюдениям владельца: `MARIO (9)`, `TETRIS (99)`, `ТАНКИ (5)`. */
  variants?: number;
  status: GameStatus;
  /** Консоли с меню: знак игры на экране — цифра (`1`–`9`) или буква (`A`–`F`); порядок игр в `games` — порядок меню. */
  symbol?: string;
  /** Консоли с меню: какие варианты игры (индексы в её списке) показывает эта консоль; без поля — все реализованные. */
  modes?: readonly number[];
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
  /** Игра, которая запускается сейчас: у Mario своя, у «Часов+99» тетрис-заглушка, у консолей с меню — первая восстановленная. Всегда входит в `games`. */
  defaultGame: GameId;
  /** Консоль с меню игр (`games` в порядке меню, у каждой игры `symbol`): после включения на экране номер или буква игры, вариант и картинка. */
  menu: boolean;
  /** Сколько игр заявлено на наклейке в целом («168 в 1»), если больше названных. */
  gamesCount?: number;
  /** Рисунок ячейки матрицы: звёздочка или точка в прямоугольнике. */
  glyph: 'star' | 'square';
  /** Боковая панель экрана тетриса: у «Часов+99» значки режима, у «Морского боя» и «168 в 1 танк» чашка (значок паузы). */
  panel: 'clock' | 'sea' | 'tank';
  /** Оформление рамки вокруг экрана: завитки и ромбик по бокам или цветная линия вплотную к экрану. */
  deco: 'flourish' | 'frame';
  /** Светодиоды над экраном (у «Морского боя» их нет). */
  leds: boolean;
  /** Левая панель: у Mario «Figure introduction» по упаковке, у остальных справка по тетрису. */
  info: boolean;
  /** Уровни на пульте справа (у тетрис-заглушки и консолей с меню выключены: скорость и уровень выбираются в меню игры). */
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
    menu: false,
    glyph: 'square',
    panel: 'sea',
    deco: 'frame',
    leds: true,
    info: true,
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
    menu: false,
    glyph: 'star',
    panel: 'clock',
    deco: 'flourish',
    leds: true,
    info: true,
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
    // Меню по наблюдениям владельца: игры выбираются буквами. На наклейке — «МОРСКОЙ БОЙ», танк, тетрис, теннис, Ромео и Джульетта: теннис — это, вероятно, арканоид (F),
    // допущение. Танки и оба тетриса и арканоид играют по правилам донора, «Морской бой» и «Ромео и Джульетта» ещё не восстановлены.
    games: [
      { id: 'sea-battle', label: 'МОРСКОЙ БОЙ', symbol: 'A', status: 'planned' },
      { id: 'tank', label: 'ТАНКИ', symbol: 'B', variants: 2, modes: [0, 1], status: 'ready' },
      { id: 'romeo-juliet', label: 'РОМЕО И ДЖУЛЬЕТТА (постройка лесенки)', symbol: 'C', status: 'planned' },
      { id: 'pentix', label: 'ТЕТРИС С БОЛЬШИМИ ФИГУРАМИ', symbol: 'D', variants: 20, status: 'ready' },
      { id: 'tetris', label: 'ТЕТРИС', symbol: 'E', variants: 20, status: 'ready' },
      { id: 'arkanoid', label: 'АРКАНОИД (теннис?)', symbol: 'F', variants: 32, status: 'ready' },
    ],
    defaultGame: 'tank',
    menu: true,
    glyph: 'square',
    panel: 'sea',
    deco: 'frame',
    leds: false,
    info: true,
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
  // Ячейка — прямоугольник с точкой (классический тетрис), в углу боковой панели — чашка паузы.
  tank168: {
    id: 'tank168',
    name: '168 в 1 танк',
    shells: ['red', 'yellow'],
    defaultShell: 'red',
    // Меню по наблюдениям владельца: девять игр, выбираются цифрами. На наклейке названы танк, гонки, тетрис, лягушка, стройка, стрельба из заявленных 168;
    // число вариантов известно только у танков (5) и тетриса (51), у остальных не установлено.
    games: [
      { id: 'tank', label: 'ТАНКИ', symbol: '1', variants: 5, status: 'ready' },
      { id: 'frog', label: 'ЛЯГУШКА', symbol: '2', status: 'ready' },
      { id: 'racing', label: 'ГОНКИ', symbol: '3', status: 'ready' },
      { id: 'racing-shoot', label: 'ГОНКИ СО СТРЕЛЬБОЙ', symbol: '4', status: 'ready' },
      { id: 'invaders', label: 'СТРЕЛЬБА ПО МАССИВУ И ТОЧКАМ', symbol: '5', status: 'ready' },
      { id: 'shapes', label: 'СТРЕЛЬБА ПО ФИГУРАМ, ДОСТРОЙКА ФИГУР', symbol: '6', status: 'ready' },
      { id: 'construction', label: 'СТРОЙКА', symbol: '7', status: 'ready' },
      { id: 'tetris', label: 'ТЕТРИС', symbol: '8', variants: 51, status: 'ready' },
      { id: 'pentix', label: 'УСЛОЖНЁННЫЙ ТЕТРИС (PENTIX)', symbol: '9', status: 'ready' },
    ],
    defaultGame: 'tank',
    gamesCount: 168,
    menu: true,
    glyph: 'square',
    panel: 'tank',
    deco: 'flourish',
    leds: true,
    info: true,
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
};

/** Оболочка, в которой играет игрушка: оригинальный Mario или оболочка «тетрисных» игрушек (тетрис-заглушка и консоли с меню игр). */
export function engineOf(model: ToyModel): 'mario' | 'tetris' {
  return GAMES[model.defaultGame].engine === 'mario' ? 'mario' : 'tetris';
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
