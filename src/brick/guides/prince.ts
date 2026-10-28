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
