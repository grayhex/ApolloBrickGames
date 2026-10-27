import { BRICK_GUIDES } from '../brick/guides';
import { gt, type GameGuideData } from '../brick/guide';
import type { NativeEntry } from './catalog';

/** Player-facing essentials describe the selected firmware entry, not all donor variants. */
export function nativeGuide(entry: NativeEntry): GameGuideData | null {
  const base = BRICK_GUIDES[entry.gameId];
  if (!entry.available || !base) return null;
  if(entry.profileId==='e23' && entry.gameId==='shooting-array') {
    return {
      ...base,
      goal:gt('Разрушайте массив, не давая ему достичь нижней клетки игрока.', 'Break the array before it reaches the player at the bottom.'),
      rules:[
        gt('Игра начинается с пяти рядов массива и одной клетки игрока внизу.', 'The game starts with five rows and a single player cell below.'),
        gt('Удерживайте ROTATE, чтобы выбивать клетки в выбранном столбце.', 'Hold ROTATE to clear cells in the selected column.'),
        gt('Уничтожайте также спускающуюся к игроку точку: попадание отнимает жизнь.', 'Shoot the point descending toward the player; a hit costs a life.'),
      ],
      controls:[
        {button:'sides',text:gt('Переместить клетку игрока.', 'Move the player cell.')},
        {button:'rotate',text:gt('Стрелять вверх; удержание повторяет выстрел.', 'Fire upward; holding repeats the shot.'),hold:true},
        {button:'down',text:gt('Ускорить появление следующего ряда.', 'Advance the next row.')},
      ],
      scoring:[{what:gt('Выбитая клетка', 'Cell removed'),points:'+1'}],
      facts:[{value:'10×20',label:gt('поле','field')},{value:'4',label:gt('жизни','lives')}],
      progression:gt('Новые ряды появляются сверху и опускаются к игроку.', 'New rows appear above and descend toward the player.'),
      lives:gt('Четыре жизни.', 'Four lives.'),
      schemes:[{cells:['##########','##########','.########.','.########.','..######..','..........','....#.....'],caption:gt('Начальный массив и клетка игрока.', 'The opening array and player cell.')}],
      assumptions:[gt('Начальный кадр и спускающаяся точка по ROM; появление рядов, паузы и столкновения приближены.', 'The opening and descending point follow the ROM; row generation, pauses and collisions are approximate.')],
    };
  }
  if(entry.profileId==='e23' && (entry.gameId==='shooting-figures' || entry.gameId==='construction')) {
    const building=entry.gameId==='construction';
    return {
      ...base,
      goal:building ? gt('Добавляйте клетки, не давая массиву дойти до игрока.', 'Add cells without letting the array reach the player.')
        : gt('Убирайте клетки массива, пока он не достиг игрока.', 'Remove array cells before they reach the player.'),
      rules:[
        gt('Сверху появляются ряды клеток; игрок управляет одной нижней клеткой.', 'Rows appear from above; the player controls one cell at the bottom.'),
        building ? gt('ROTATE добавляет клетку в выбранный столбец.', 'ROTATE adds a cell in the selected column.')
          : gt('ROTATE убирает ближайшую клетку в выбранном столбце.', 'ROTATE removes the nearest cell in the selected column.'),
        gt('При приближении массива к нижнему краю теряется жизнь.', 'A life is lost when the array reaches the bottom.'),
      ],
      controls:[
        {button:'sides',text:gt('Переместить клетку игрока.', 'Move the player cell.')},
        {button:'rotate',text:building?gt('Добавить клетку.', 'Add a cell.'):gt('Выбить клетку.', 'Remove a cell.')},
        {button:'down',text:gt('Ускорить появление ряда.', 'Advance the next row.')},
      ],
      scoring:[{what:building?gt('Добавленная клетка', 'Cell added'):gt('Выбитая клетка', 'Cell removed'),points:'+1'}],
      facts:[{value:'10×20',label:gt('поле','field')},{value:'4',label:gt('жизни','lives')}],
      progression:gt('Ряды постепенно появляются сверху и движутся к игроку.', 'Rows gradually appear above and move toward the player.'),
      lives:gt('Четыре жизни.', 'Four lives.'),
      schemes:[{cells:['#..#.#.#..','..........','..........','....#.....'],caption:gt('Массив сверху и клетка игрока.', 'The array above and the player cell.')}],
      assumptions:[gt('Действие ROTATE и одиночная клетка по ROM; генератор, очки и условия завершения приближены.', 'ROTATE and the single player cell follow the ROM; generation, scoring and end conditions are approximate.')],
    };
  }
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
          ? gt('Встречаются обычные и пятиклеточные фигуры, а также одиночные клетки.', 'Regular and five-cell pieces appear, along with single cells.')
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
