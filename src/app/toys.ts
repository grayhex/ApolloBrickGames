import type { Shell } from '../input/settings';
import type { MsgKey } from './messages';
import type { ToyKeyId } from './toy';

/**
 * Три складные игрушки Apollo: на одном корпусе-раскладушке, но с разной «аппаратной» частью — экраном, рамкой, кнопками, наклейкой.
 * Crocodile Mario — оригинальный движок; «Часы+99» и «Морской бой» пока играют в обычный тетрис (заглушка — оригинальные игры будут
 * восстановлены позже). Игрушка выбирается адресом `?toy=clock99|seabattle` (без параметра — Crocodile Mario); смена — перезагрузка страницы.
 */
export const TOY_IDS = ['mario', 'clock99', 'seabattle'] as const;
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

export interface ToyModel {
  id: ToyId;
  /** Название на корпусе и в переключателе (не переводится). */
  name: string;
  /** Цвета корпуса, подтверждённые фотографиями оригинала; других игрушка не имеет. */
  shells: readonly Shell[];
  /** Цвет по умолчанию, если сохранённый в настройках для этой игрушки не бывает. */
  defaultShell: Shell;
  /** `mario` — оригинальный движок, `tetris` — заглушка с матрицей 10 × 20. */
  game: 'mario' | 'tetris';
  /** Рисунок ячейки матрицы: звёздочка или точка в прямоугольнике. */
  glyph: 'star' | 'square';
  /** Светодиоды над экраном (у «Морского боя» их нет). */
  leds: boolean;
  /** Левая панель с «Figure introduction» (только у Mario: у остальных пока пуста). */
  info: boolean;
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
    game: 'mario',
    glyph: 'square',
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
    game: 'tetris',
    glyph: 'star',
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
    game: 'tetris',
    glyph: 'square',
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
      fire: 'help.row.reset',
      left: 'help.t.left',
      right: 'help.t.right',
      up: 'help.t.rotate',
      down: 'help.t.down',
      jump: 'help.t.rotate',
    },
  },
};

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

/** Цвет корпуса игрушки: сохранённый в настройках, если у этой игрушки такой бывает, иначе цвет по умолчанию. */
export function shellFor(model: ToyModel, preferred: Shell): Shell {
  return model.shells.includes(preferred) ? preferred : model.defaultShell;
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
