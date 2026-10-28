/**
 * Описание игр Prince 皇太子 (118 in 1) для левой панели: пять игр в том порядке, в котором их назвал владелец. Описания — общие для игры (те же, что у остальных игрушек:
 * правила считаются по коду игры), а не по вариации; номера и число вариаций каждой игры — допущение проекта (`games/prince.ts`).
 */
import { gt, type GameGuideData, type GuideText } from '../guide';
import { PRINCE_FIRST, PRINCE_GAMES, type PrinceGameId } from '../games/prince';
import { BRICK_GUIDES } from './index';

export interface PrinceGameInfo {
  id: PrinceGameId;
  /** Метка вкладки: номера вариаций игры на экране (`1–61`). */
  key: string;
  name: GuideText;
  guide: GameGuideData;
  note: GuideText;
}

const NAMES: Readonly<Record<PrinceGameId, GuideText>> = {
  tetris: gt('Тетрис', 'Tetris'),
  racing: gt('Гонки', 'Racing'),
  tank: gt('Танки', 'Tanks'),
  frog: gt('Фроггер', 'Frogger'),
  arkanoid: gt('Арканоид', 'Arkanoid'),
};

export const PRINCE_PANEL_GAMES: readonly PrinceGameInfo[] = PRINCE_GAMES.map((game, index) => {
  const range = `${PRINCE_FIRST[index]! + 1}–${PRINCE_FIRST[index]! + game.count}`;
  return {
    id: game.id,
    key: range,
    name: NAMES[game.id],
    guide: BRICK_GUIDES[game.id]!,
    note: gt(
      `Номера ${range} — ${game.count} вариаций. В автоплее: большая кнопка — следующая игра, ↑ — предыдущая, ↓ — вариация, ← — уровень, → — скорость, START — играть самому.`,
      `Numbers ${range} — ${game.count} variations. In the auto-play: the big button — next game, ↑ — previous, ↓ — variation, ← — level, → — speed, START — play yourself.`,
    ),
  };
});

/** Кнопка корпуса Prince: иероглиф(ы) с корпуса, чтение (пиньинь), подпись на английском, клавиша клавиатуры и что она делает в игрушке. */
export interface PrinceButtonInfo {
  glyph: string;
  pinyin: string;
  cap: string;
  keys: string;
  text: GuideText;
}

/** Справка по кнопкам для левой панели: на корпусе только иероглифы, поэтому перевод и действие — здесь. Действия в автоплее — допущения проекта (`docs/devices/prince118.md`). */
export const PRINCE_BUTTONS: readonly PrinceButtonInfo[] = [
  { glyph: '旋转', pinyin: 'xuánzhuǎn', cap: 'ROTATE', keys: 'Space · Z', text: gt('«Поворот» — большая кнопка. В партии поворачивает фигуру (или стреляет). В автоплее — следующая игра.', '“Rotate” — the big button. In a game it turns the piece (or fires). In the auto-play — the next game.') },
  { glyph: '上', pinyin: 'shàng', cap: '↑', keys: '↑ · W', text: gt('«Вверх». В тетрисе — тоже поворот. В автоплее — предыдущая игра.', '“Up”. In Tetris it also rotates. In the auto-play — the previous game.') },
  { glyph: '下', pinyin: 'xià', cap: '↓', keys: '↓ · S', text: gt('«Вниз», удержание ускоряет падение. В автоплее — следующая вариация игры.', '“Down”, holding speeds up the fall. In the auto-play — the next variation of the game.') },
  { glyph: '左', pinyin: 'zuǒ', cap: '←', keys: '← · A', text: gt('«Влево». В автоплее — уровень.', '“Left”. In the auto-play — the level.') },
  { glyph: '右', pinyin: 'yòu', cap: '→', keys: '→ · D', text: gt('«Вправо». В автоплее — скорость.', '“Right”. In the auto-play — the speed.') },
  { glyph: '开始\n暂停', pinyin: 'kāishǐ · zàntíng', cap: 'START/PAUSE', keys: 'Enter · P', text: gt('«Старт / пауза». В автоплее начинает партию, в партии ставит на паузу и продолжает.', '“Start / pause”. In the auto-play it starts a game; in a game it pauses and resumes.') },
  { glyph: '复位', pinyin: 'fùwèi', cap: 'RESET', keys: 'X', text: gt('«Сброс». Из партии — назад в автоплей.', '“Reset”. From a game — back to the auto-play.') },
  { glyph: '声音', pinyin: 'shēngyīn', cap: 'SOUND', keys: 'M', text: gt('«Звук» — включить или выключить.', '“Sound” — on or off.') },
  { glyph: '开关', pinyin: 'kāiguān', cap: 'ON/OFF', keys: 'O', text: gt('«Выключатель» — включить или выключить игрушку.', '“Switch” — power the toy on or off.') },
];

/** Подводка к справке по кнопкам. */
export const PRINCE_BUTTONS_INTRO: GuideText = gt(
  'Подписи на корпусе — иероглифы; ниже перевод и что делает кнопка здесь. Справа — клавиши клавиатуры.',
  'The labels on the body are Chinese characters; below are their meaning and what each button does here. Keyboard keys are on the right.',
);
