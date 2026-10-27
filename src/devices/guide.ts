import { BRICK_GUIDES } from '../brick/guides';
import { gt, type GameGuideData } from '../brick/guide';
import type { NativeEntry } from './catalog';

/** Player-facing essentials describe the selected firmware entry, not all donor variants. */
export function nativeGuide(entry: NativeEntry): GameGuideData | null {
  const base = BRICK_GUIDES[entry.gameId];
  if (!entry.available || !base) return null;
  if (entry.gameId === 'tetris') {
    const mode = entry.profileId === 'e23' ? ((Number(entry.nativeCode)-1)%8)+1 : Number(entry.nativeCode);
    const htBlock = entry.profileId === 'e88' || entry.profileId === 'e23';
    const special = htBlock && [2, 4].includes(mode);
    const obstruction = htBlock && [3, 4].includes(mode);
    const b0302 = entry.profileId === 'apollo-b0302';
    return {
      ...base,
      rules: [
        gt('Заполняйте горизонтальные ряды без пропусков: полные ряды исчезают.', 'Fill horizontal rows without gaps to clear them.'),
        b0302 && mode >= 9
          ? gt('В приближённой реализации встречаются обычные и пятиклеточные фигуры, а также одиночные клетки.', 'This approximate profile mixes regular and five-cell pieces with single cells.')
              : special
          ? gt('Каждая четвёртая фигура берётся из дополнительного набора.', 'Every fourth piece comes from the additional shape set.')
          : gt('В наборе семь обычных фигур; следующая показана справа.', 'Seven standard shapes; the next piece appears on the right.'),
        obstruction
          ? gt('Мигающая клетка в центре дна — постоянное препятствие.', 'The blinking cell at the centre of the floor is a permanent obstacle.')
          : entry.nativeCode === 'H02' || (b0302 && mode % 2 === 0)
            ? gt('Поле перевёрнуто: фигуры движутся вверх, назначение кнопок сохранено.', 'The board is flipped: pieces rise, while the buttons keep their functions.')
            : gt('Не дайте стопке фигур достичь верхней границы.', 'Keep the stack below the top of the well.'),
      ],
      controls: [
        { button: 'sides', text: gt('Сдвиг фигуры.', 'Move the piece.') },
        { button: 'down', text: gt('Ускорить падение.', 'Speed up the falling piece.') },
        { button: 'rotate', text: gt('Повернуть фигуру.', 'Rotate the piece.') },
      ],
    };
  }
  if (entry.gameId === 'snake' || entry.gameId === 'frog') {
    return {
      ...base,
      controls: [
        { button: 'sides', text: gt('Движение влево / вправо.', 'Move left / right.') },
        { button: 'down', text: gt('Движение вниз.', 'Move down.') },
        { button: 'rotate', text: gt('Движение вверх.', 'Move up.') },
      ],
    };
  }
  return { ...base, controls: base.controls.filter(c => c.button !== 'fire' && c.button !== 'up') };
}
