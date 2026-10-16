import { gt, type GameGuideData } from '../guide';

export const SEA_GUIDE: GameGuideData = {
  summary: gt('Классический морской бой: ищите скрытые корабли соперника выстрелами по клеткам.', 'Classic Battleship: find the hidden enemy fleet by firing at grid coordinates.'),
  goal: gt('Потопите весь флот противника раньше, чем он найдёт ваш.', 'Sink the entire enemy fleet before it finds yours.'),
  rules: [
    gt('Сверху — ваш флот. Снизу — скрытое поле противника; быстро мигает прицел.', 'Your fleet is above. The hidden enemy grid is below; the cursor pulses quickly.'),
    gt('Стрелками выберите клетку, ROTATE — выстрел. Затем стреляет соперник, даже после попадания.', 'Choose a cell with arrows, ROTATE fires. The opponent replies, even after a hit.'),
    gt('Промах гасит клетку; попадание мигает медленно. В уже проверенную клетку стрелять нельзя.', 'A miss clears a cell; a hit blinks slowly. Previously tried cells cannot be fired at again.'),
    gt('Флоты расставляются автоматически: 4, 3, 3, 2, 2, 2, 1, 1, 1, 1 клеток; корабли не соприкасаются.', 'Fleets are placed automatically: lengths 4, 3, 3, 2, 2, 2, 1, 1, 1, 1; ships never touch.'),
    gt('NEXT показывает число ещё не потопленных кораблей противника.', 'NEXT shows the number of enemy ships not yet sunk.'),
  ],
  controls: [
    { button: 'left', text: gt('Прицел влево', 'Cursor left') },
    { button: 'right', text: gt('Прицел вправо', 'Cursor right') },
    { button: 'up', text: gt('Прицел вверх', 'Cursor up') },
    { button: 'down', text: gt('Прицел вниз', 'Cursor down') },
    { button: 'rotate', text: gt('Выстрел по выбранной клетке', 'Fire at the selected cell') },
  ],
  scoring: [{ what: gt('Попадание', 'Hit'), points: '+10' }, { what: gt('Корабль потоплен', 'Ship sunk'), points: '+50' }, { what: gt('Весь флот', 'Whole fleet'), points: '+100' }],
  facts: [{ value: '10×10', label: gt('каждое поле', 'each grid') }, { value: '10', label: gt('кораблей', 'ships') }],
  progression: gt('Победа начинает новый бой с новой расстановкой. Скорость меню не сокращает время на обдумывание хода.', 'Victory starts a new battle with fresh fleets. Menu speed never limits thinking time.'),
  lives: null,
  schemes: [{ cells: ['###..#', '......', '.##...', '......', '######', '##*###', '##..##'], caption: gt('Свой флот сверху, скрытое поле и прицел снизу', 'Your fleet above, hidden grid and cursor below') }],
  assumptions: [gt('Поочерёдные выстрелы и два поля — по владельцу и фото. Состав флота, автопостановка, ИИ, индикация и очки — выбор проекта.', 'Alternating shots and two boards follow owner evidence. Fleet sizes, auto placement, AI, indicators and scoring are project choices.')],
};
export const ROMEO_GUIDE: GameGuideData = {
  summary: gt('Укладывайте падающие фигуры в лестницу. Точка-Ромео сама идёт вверх и вправо к столбику-Джульетте.', 'Stack falling pieces into stairs. Romeo, a dot, automatically walks up and right to Juliet’s column.'),
  goal: gt('Постройте проходимую лестницу к вершине столбика справа.', 'Build a walkable stairway to the top of the right-hand column.'),
  rules: [
    gt('Перемещайте и поворачивайте падающие фигуры, оставляя подъём по одной клетке.', 'Move and rotate falling pieces, leaving steps one cell high.'),
    gt('Точка поднимается автоматически; перед высокой стеной или разрывом она ждёт.', 'The dot climbs automatically; it waits at tall walls or gaps.'),
    gt('Ряды не исчезают. Не засыпайте героя и не перекрывайте появление новых фигур.', 'Rows do not clear. Do not bury the hero or block new pieces from spawning.'),
    gt('NEXT показывает следующую фигуру: используются трёх- и четырёхклеточные фигуры.', 'NEXT shows the next piece; three- and four-cell shapes are used.'),
  ],
  controls: [
    { button: 'left', text: gt('Фигура влево', 'Piece left') },
    { button: 'right', text: gt('Фигура вправо', 'Piece right') },
    { button: 'rotate', text: gt('Повернуть фигуру; также UP', 'Rotate the piece; UP also rotates') },
    { button: 'down', text: gt('Ускорить падение; клавиша огня — бросок', 'Drop faster; fire key — hard drop') },
  ],
  scoring: [{ what: gt('Уложенная клетка', 'Placed cell'), points: '+1' }, { what: gt('Шаг героя', 'Hero step'), points: '+10' }, { what: gt('Джульетта достигнута', 'Juliet reached'), points: '+100' }],
  facts: [{ value: '4', label: gt('жизни', 'lives') }, { value: '1', label: gt('высота шага', 'step height') }],
  progression: gt('После встречи — новая лестница. Столбик растёт с 7 до 9 клеток, после уровня 10 повышается скорость.', 'Reaching Juliet starts a new staircase. The column grows from 7 to 9 cells; speed rises after level 10.'),
  lives: gt('Четыре жизни. Засыпанный герой или перекрытый вход фигур отнимает жизнь; счёт сохраняется.', 'Four lives. Burying the hero or blocking the spawn costs a life; score is retained.'),
  schemes: [{ cells: ['..##.....', '...#.....', '........#', '......#.#', '....#.#.#', '..#.#.#.#', '*.#.#.#.#'], caption: gt('Падающая фигура, точка слева и цель справа', 'Falling piece, dot on the left and goal on the right') }],
  assumptions: [gt('Падающие фигуры и автоматический подъём — по владельцу; точка, NEXT и столбик — по фото. Темп, очки и столкновения — допущения.', 'Falling pieces and automatic climbing follow the owner; dot, NEXT and column follow the photo. Timing, scoring and collisions are assumptions.')],
};
