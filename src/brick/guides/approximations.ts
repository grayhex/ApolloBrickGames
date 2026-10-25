import { gt, type GameGuideData } from '../guide';

export const SEA_GUIDE: GameGuideData = {
  summary: gt('Классический морской бой: ищите скрытые корабли соперника выстрелами по клеткам.', 'Classic Battleship: find the hidden enemy fleet by firing at grid coordinates.'),
  goal: gt('Потопите весь флот противника раньше, чем он найдёт ваш.', 'Sink the entire enemy fleet before it finds yours.'),
  rules: [
    gt('Сверху — ваш флот. Снизу — скрытое поле противника; быстро мигает прицел.', 'Your fleet is above. The hidden enemy grid is below; the cursor pulses quickly.'),
    gt('Стрелками выберите клетку, ROTATE — выстрел. Затем стреляет соперник, даже после попадания.', 'Choose a cell with arrows, ROTATE fires. The opponent replies, even after a hit.'),
    gt('Каждый выстрел показывается сценой: корабль, над ним мина-крест, крест падает на поле; результат — в конце сцены.', 'Each shot plays a scene: a ship, a cross-shaped mine above it, the mine falls onto the field; the result shows at its end.'),
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
    gt('Стартовые очки (400) убывают на 1 за полсекунды; остаток достаётся при встрече с Джульеттой — стройте быстро.', 'Starting points (400) drop by 1 every half second; what is left is kept on reaching Juliet, so build fast.'),
    gt('NEXT показывает следующую фигуру: используются трёх- и четырёхклеточные фигуры.', 'NEXT shows the next piece; three- and four-cell shapes are used.'),
  ],
  controls: [
    { button: 'sides', text: gt('Фигура влево и вправо', 'Piece left and right') },
    { button: 'rotate', text: gt('Повернуть фигуру', 'Rotate the piece') },
    { button: 'up', text: gt('То же, что ROTATE', 'Same as ROTATE') },
    { button: 'down', text: gt('Ускорить падение', 'Drop faster'), hold: true },
    { button: 'fire', text: gt('Бросок фигуры до упора', 'Hard drop'), keyboardOnly: true },
  ],
  scoring: [{ what: gt('Стартовые очки попытки', 'Starting points of an attempt'), points: '400 → 0' }, { what: gt('Уложенная клетка', 'Placed cell'), points: '+1' }, { what: gt('Шаг героя', 'Hero step'), points: '+10' }, { what: gt('Джульетта достигнута', 'Juliet reached'), points: '+100' }],
  facts: [{ value: '4', label: gt('жизни', 'lives') }, { value: '1', label: gt('высота шага', 'step height') }],
  progression: gt('После встречи — новая лестница. Столбик растёт с 7 до 9 клеток, после уровня 10 повышается скорость.', 'Reaching Juliet starts a new staircase. The column grows from 7 to 9 cells; speed rises after level 10.'),
  lives: gt('Четыре жизни. Засыпанный герой или перекрытый вход фигур отнимает жизнь; счёт сохраняется.', 'Four lives. Burying the hero or blocking the spawn costs a life; score is retained.'),
  schemes: [{ cells: ['..##.....', '...#.....', '........#', '......#.#', '....#.#.#', '..#.#.#.#', '*.#.#.#.#'], caption: gt('Падающая фигура, точка слева и цель справа', 'Falling piece, dot on the left and goal on the right') }],
  assumptions: [gt('Фигуры, подъём и убывающие стартовые очки — по владельцу; точка, NEXT и столбик — по фото. Темп, значения очков и столкновения — допущения.', 'Pieces, climbing and shrinking starting points follow the owner; dot, NEXT and column follow the photo. Timing, point values and collisions are assumptions.')],
};
