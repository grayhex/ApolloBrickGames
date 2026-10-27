import { contentProgression } from './content';
import { LIBRARY_FIELDS } from '../games/library/art';
import { LIBRARY_GAMES } from '../games/library';
import { LIBRARY_IDS, type LibraryId } from '../../games/library';
import { gt, type GameGuideData, type GuideButton, type GuideControl, type GuideText } from '../guide';
const tr = (s: string): GuideText => { const [ru, en] = s.split('|'); return gt(ru!, en ?? ru!); };
// These rules describe the implementation, including deliberately explicit reconstruction choices.
const RULES: Record<LibraryId, readonly string[]> = {
  maze: ['Найди выход до истечения времени.|Find the exit before time runs out.', 'На старте 15 секунд, затем на секунду меньше за уровень, до 6. Справа — шкала секунд; на нуле партия окончена.|Start with 15 seconds, one less each round down to 6. The right bar counts seconds; zero ends the game.', 'Выход: +100 × номер раунда и +5 за каждую оставшуюся секунду.|Exit: +100 × round number and +5 per remaining second.'],
  jigsaw: ['Уложи четыре фигуры в квадрат без перекрытий.|Pack four pieces into the square without overlaps.', 'Стрелки двигают фигуру, ROTATE поворачивает, «огонь» укладывает; «огонь» с DOWN — заново.|Arrows move the piece, ROTATE turns it, FIRE places it; FIRE with DOWN restarts.', 'Нужна отдельная кнопка «огонь» (FIRE). Все задачи решаемы.|It needs a separate FIRE button. Every puzzle is solvable.'],
  'meteor-fighter': ['После взлёта попадай в мигающее ядро движущегося босса. Остальной корпус — броня.|After takeoff, hit the moving boss’s blinking core. The rest of its body is armour.', '← → двигают самолёт; ROTATE стреляет. Во время взлёта стрелять нельзя.|Left/right move the plane; ROTATE shoots. You cannot shoot during takeoff.', 'Верхняя шкала — босс; нижняя — игрок. Три попадания отнимают жизнь.|Top bar: boss health; bottom bar: player health. Three hits cost a life.'],
  'tetris-shooting': ['Разбей блоки, пока опасная точка не опустилась к пушке.|Clear the blocks before the danger dot reaches the gun.', '← → двигают пушку; ROTATE стреляет.|Left/right move the gun; ROTATE shoots.', 'Мигающая точка движется влево и вниз; её нельзя сбить. Попадание по блоку: +5.|The blinking dot moves left and down; it cannot be shot. A block hit: +5.'],
  snake: ['Собирай плоды, избегая стен и своего тела.|Collect food without hitting walls or your body.', 'Старт внизу. Направление меняется сразу; ROTATE — вверх. Разворот назад меняет местами голову и хвост.|Start at the bottom. Direction changes act immediately; ROTATE is up. Reversing swaps the head and tail.', 'Плод: +10. Десять скоростей: от 332 до 37 мс за шаг.|Food: +10. Ten speeds: from 332 to 37 ms per step.'],
  pong: ['Отбивай мяч и пробей центральную стенку.|Return the ball and break the central wall.', '← → двигают ракетку. Положение удара меняет направление.|Left/right move the paddle. Impact position changes direction.', 'Кирпич: +5. Гол: +10. Пять голов — следующий уровень.|Brick: +5. Goal: +10. Five goals advance the level.'],
  'pong-double': ['Удерживай два мяча в игре.|Keep two balls in play.', '← → двигают ракетку. Пропущенный мяч отнимает жизнь.|Left/right move the paddle. Missing a ball costs a life.', 'Вратарь следит за мячом. Гол: +10 и новая подача; оба мяча остаются в игре. Пять голов — новый уровень.|The guard tracks a ball. Goal: +10 and a new serve; both balls stay in play. Five goals advance.'],
  'pneumatic-ball': ['Пробей мяч мимо движущегося вратаря.|Shoot the ball past the moving guard.', '← → выбирают точку подачи. Удерживай ROTATE для новой подачи.|Left/right choose the launch point. Hold ROTATE to serve again.', 'Гол: +10. Пять голов — новый уровень. Промах не отнимает жизнь.|Goal: +10. Five goals advance. Missing does not cost a life.'],
  honeybee: ['Вариант 01: сбивай четырёх жуков, идущих вниз по диагонали.|Variant 01: shoot four beetles descending diagonally.', '← → двигают пушку; одно нажатие ROTATE — один луч. Жуки переходят через боковые границы.|Left/right move the gun; each ROTATE press fires one ray. Beetles wrap around the side edges.', 'Жук: +1, вместо него приходит клетка из верхнего резерва. Столкновение с пушкой отнимает жизнь.|Beetle: +1; a reserve cell above replaces it. Contact with the gun costs a life.', 'В вариантах 02–08 фигура отвечает огнём.|In variants 02–08 the formation fires back.'],
  'obstacle-race': ['Проедь извилистый коридор шириной пять клеток, объезжая камни.|Follow the five-cell winding corridor, steering around stones.', '← → рулят; ↑ ускоряет движение дороги. Стенки не пускают машину и подталкивают её на поворотах: жизнь отнимает только камень.|Left/right steer; up speeds up the road. The walls stop the car and nudge it in bends: only a stone costs a life.', 'Каждый шаг дороги: +1. 60 шагов без аварии — новый уровень и +100.|Each road step: +1. Finish 60 steps without crashing for the next level and +100.'],
  'matching-blocks': ['Сопоставь три нижние фигуры с падающими.|Match the three lower shapes to the falling shapes.', '← → выбирают позицию; ↑ ↓ или ROTATE меняют её фигуру.|Left/right select a position; up/down or ROTATE change its shape.', 'Тройное совпадение: +30. Ошибка отнимает жизнь. Пять совпадений — новый уровень.|Matching all three: +30. A mismatch costs a life. Five matches advance.'],
  'whack-a-mole': ['Нажми кнопку подсвеченной площадки до истечения времени.|Press the lit pad before time runs out.', 'Четыре стрелки соответствуют площадкам; ROTATE дублирует нижнюю.|Four arrows correspond to the pads; ROTATE also selects the bottom pad.', 'Верный ответ: +10. Неверный или поздний ответ отнимает жизнь.|Correct answer: +10. A wrong or late answer costs a life.'],
  simon: ['Запомни и повтори последовательность площадок.|Memorise and repeat the pad sequence.', 'Во время показа ввод не учитывается; у каждой площадки свой тон. Затем отвечай стрелками.|Input is ignored during playback; each pad has its own tone. Then repeat with the arrows.', 'Полная последовательность: +10; она удлиняется. Ошибка отнимает жизнь.|Complete sequence: +10; it grows longer. An error costs a life.'],
  dice: ['Сравни бросок четырёх костей с броском банкира и увеличь игровой банк.|Compare a four-dice throw with the banker’s and grow your game bank.', 'Начальный банк — 1000. RIGHT оплачивает ставку по 10; START/P выбирает больше или меньше. ROTATE запускает бросок, DOWN останавливает.|The starting bank is 1000. RIGHT buys a 10-point wager; START/P chooses higher or lower. ROTATE rolls, DOWN stops.', 'Сначала бросает банкир, затем игрок. Нужна пара: остальные две кости дают сумму. При двух парах берётся старшая. Без пары и при тройке — переброс.|Banker rolls first. Remove a pair and sum the other dice; with two pairs use the higher. No pair or three equal dice: rethrow.', 'Четыре одинаковых у банкира забирают ставку; у игрока — выплата ×4. Обычная победа возвращает ×2; ничья оставляет ставку для повторной попытки.|Banker four-of-a-kind takes the wager; player four-of-a-kind pays ×4. An ordinary win returns ×2; a tie keeps the wager for another attempt.', 'TOP-20 сохраняет максимум игрового банка за эту партию.|TOP-20 records the peak game bank of this party.'],
  dance: ['Нажимай направление, когда нота достигает нижней зоны.|Press the direction as a note enters the bottom zone.', 'Дорожки слева направо: ↑ → ↓ ←. Зона ответа — четыре нижних ряда.|Lanes from left: up, right, down, left. Hit within the bottom four rows.', 'Нота: +10 и тон дорожки. Неверная кнопка или пропуск отнимают жизнь.|Note: +10 and a lane tone. A wrong button or miss costs a life.'],
  quarth: ['Достраивай фигуру до сплошного прямоугольника.|Complete a solid rectangle from the shape.', '← → двигают пушку; ROTATE добавляет клетку снизу.|Left/right move the gun; ROTATE adds a cell from below.', 'Полный прямоугольник исчезает: +1 за клетку. Фигура у пушки отнимает жизнь.|A complete rectangle disappears: +1 per cell. Reaching the gun costs a life.'],
  'lights-out': ['Погаси все клетки поля 10×10.|Turn off every light on the 10×10 board.', 'Стрелки перемещают курсор; ROTATE переключает крест из пяти клеток.|Arrows move the cursor; ROTATE toggles a cross of five cells.', 'Каждая задача решаема: получена ходами из пустого поля. Решение: +100.|Every puzzle is solvable: generated from an empty board. Solution: +100.'],
  'boat-racing': ['Обходи препятствия на трёх полосах.|Avoid obstacles across three lanes.', '← → меняют полосу; ↑ ускоряет.|Left/right change lanes; up accelerates.', 'Пропущенное препятствие: +1. Столкновение отнимает жизнь.|Passed obstacle: +1. A collision costs a life.'],
  'talking-shooting': ['Уничтожай строй, избегая падающих выстрелов.|Destroy the formation while dodging falling shots.', '← → двигают пушку; ROTATE стреляет. Строй останавливается над пушкой.|Left/right move the gun; ROTATE shoots. The formation stops above the gun.', 'Клетка: +5. Жизнь теряется от выстрела, а не от достижения строем нижнего ряда.|Cell: +5. Shots cost lives; a formation at the bottom does not.'],
  'ufo-raiders': ['Разбей фигуру, сохранив мигающий НЛО.|Break the figure without shooting the blinking UFO.', '← → двигают пушку; ROTATE стреляет. НЛО мигает.|Left/right move the gun; ROTATE shoots. The UFO blinks.', 'Попадание в НЛО отнимает жизнь; обычная клетка даёт +5.|Hitting the UFO costs a life; an ordinary cell gives +5.'],
  'tetris-flicker': ['Убери все мигающие клетки полными рядами.|Remove all blinking cells by completing rows.', '← → двигают, ROTATE поворачивает, ↓ ускоряет.|Left/right move, ROTATE turns, down soft-drops.', 'Обычные клетки могут остаться. Последняя мигающая клетка открывает следующий уровень.|Ordinary cells may remain. Clearing the final blinking cell advances.'],
  'super-tank': ['Уничтожай препятствия перед танком.|Destroy obstacles in front of the tank.', '← → рулят; ROTATE стреляет, ↑ ускоряет.|Left/right steer; ROTATE shoots, up accelerates.', 'Уничтожение: +10. Столкновение отнимает жизнь.|Destruction: +10. Collision costs a life.'],
  'racing-pickup': ['Подбирай оружие и освобождай дорогу.|Collect weapons and clear the road.', 'Две мигающие клетки дают выстрел; три — ближний удар. ROTATE применяет оружие.|Two blinking cells grant a shot; three grant a melee attack. ROTATE attacks.', 'Стены появляются только после выданного выстрела и рушатся лишь им; удар в стену — потеря жизни.|Walls appear only after a shot is granted and break only to shots; hitting one costs a life.'],
  'punch-racing': ['Разбивай препятствия близким ударом.|Break nearby obstacles with a melee attack.', '← → рулят, ROTATE бьёт в пределах трёх рядов перед машиной.|Left/right steer; ROTATE attacks within three rows in front of the car.', 'Удар: +10. Дальнего выстрела нет; столкновение отнимает жизнь.|Hit: +10. No ranged shot; collision costs a life.'],
  sokoban: ['Поставь все ящики на мигающие цели.|Push every crate onto a blinking goal.', 'Стрелки ходят и толкают один ящик. Тянуть и толкать два сразу нельзя.|Arrows walk and push one crate. Pulling and pushing two are impossible.', 'ROTATE отменяет ход. Решение: +100.|ROTATE undoes a move. Solution: +100.'],
  columns: ['Собирай линии из четырёх одинаковых узоров.|Make lines of four matching patterns.', '← → двигают тройку; ROTATE меняет порядок; ↓ ускоряет.|Left/right move the triplet; ROTATE cycles it; down speeds up.', 'Горизонтали, вертикали и диагонали исчезают: +10 за клетку.|Horizontal, vertical and diagonal matches disappear: +10 per cell.'],
  'columns-flicker': ['Удали все мигающие клетки совпадениями узоров.|Remove every blinking cell by matching patterns.', 'Управление как у «Колонн». Узор: точка, диагональ или квадрат 2×2.|Controls match Columns. Patterns: dot, diagonal or 2×2 square.', 'Совпадают три узора. Мигающие клетки не падают; все убраны — новый уровень.|Match three patterns. Blinking cells are anchored; clear all to advance.'],
  'space-invaders': ['Уничтожь строй, пока он не добрался до пушки.|Destroy the formation before it reaches the gun.', '← → двигают; ROTATE стреляет. На краю строй опускается.|Left/right move; ROTATE shoots. At an edge the formation descends.', 'Клетка: +5. Уклоняйся от ответных выстрелов.|Cell: +5. Dodge return fire.'],
  'peg-solitaire': ['Оставь одну фишку на крестовом поле.|Leave one peg on the cross-shaped board.', 'Стрелки двигают курсор. ROTATE выбирает фишку, затем пустое место через соседа.|Arrows move the cursor. ROTATE selects a peg, then a hole across its neighbour.', 'Прыжок снимает соседа: +10.|A jump removes the neighbour: +10.'],
  basket: ['Лови одиночные плоды и избегай двойных блоков.|Catch single fruits and avoid double blocks.', '← → двигают корзину шириной три клетки.|Left/right move the three-cell basket.', 'Плод: +10. Пропуск плода или пойманный двойной блок отнимает жизнь.|Fruit: +10. A missed fruit or caught double block costs a life.'],
  'dr-mario': ['Удали все мигающие вирусы совпадениями четырёх узоров.|Clear all blinking viruses by matching four patterns.', '← → двигают капсулу; ROTATE или ↑ поворачивают в четыре положения; ↓ ускоряет.|Left/right move it; ROTATE or up turns it through four positions; down speeds up.', 'Совпадения от четырёх по горизонтали и вертикали. Половинки капсулы падают вместе, пока целы.|Matches of four, horizontal or vertical. Capsule halves fall together while both remain.'],
  bowling: ['Сбей десять кеглей за два броска в каждом из десяти фреймов.|Knock down ten pins in two rolls in each of ten frames.', '← → выбирают позицию; ↑ ↓ меняют уклон; ROTATE запускает шар.|Left/right choose position; up/down adjust drift; ROTATE rolls.', 'Счёт — число сбитых кеглей; бонусы страйков и спэров не применяются.|Score counts fallen pins; strike and spare bonuses are not applied.'],
  'dual-shooting': ['Попадай двумя стволами в мигающее ядро противника. Броня вокруг него поглощает выстрелы.|Aim the twin guns at the opponent’s blinking core. Surrounding armour absorbs shots.', '← → двигают; ROTATE стреляет. Верхняя шкала — враг, нижняя — игрок.|Left/right move; ROTATE shoots. Top bar: enemy; bottom bar: player.', 'Попадание: +5. Три попадания по игроку отнимают жизнь.|Hit: +5. Three hits on the player cost a life.'],
  'racing-four': ['Обходи машины на четырёх полосах.|Avoid cars across four lanes.', '← → меняют полосу; ↑ ускоряет.|Left/right change lanes; up accelerates.', 'Пропущенная машина: +1. Узкие машины на полосах через клетку; столкновение — потеря жизни.|Passed car: +1. Slim cars on lanes one cell apart; a collision costs a life.'],
  'arkanoid-dots': ['Разбей стену, затем две мигающие цели за ней.|Break the wall, then the two blinking targets behind it.', '← → двигают ракетку; край ракетки меняет направление отскока.|Left/right move the paddle; paddle edges change the rebound direction.', 'Кирпич: +5, цель: +25. Новый уровень после обеих целей.|Brick: +5, target: +25. Both targets must be cleared to advance.'],
  'flappy-bird': ['Проведи птицу через просветы между трубами.|Guide the bird through gaps between pipes.', 'ROTATE или ↑ подбрасывают птицу. Без нажатия она падает.|ROTATE or up flap. Without input, the bird falls.', 'Пройденная труба: +1. Столкновение с трубой или краем заканчивает партию.|Passed pipe: +1. Hitting a pipe or an edge ends the game.'],
  reversi: ['Закончи партию с большинством фишек своего цвета.|Finish with a majority of your own discs.', 'Стрелки двигают курсор; ROTATE ставит фишку с обязательным переворотом соперника.|Arrows move the cursor; ROTATE places a disc and must flip an opponent disc.', 'Твои фишки постоянные, чужие мигают. Компьютер отвечает; при отсутствии ходов — пропуск.|Your discs are steady, the opponent’s blink. The AI replies; no legal move means a pass.'],
  'fill-connect': ['Заполни поле 8×8 одной непрерывной линией до конца таймера.|Fill the 8×8 board with one continuous line before time runs out.', 'Стрелки продлевают линию. ROTATE убирает последний шаг.|Arrows extend the line. ROTATE removes the last step.', 'Повторно заходить на клетку нельзя. Верхняя шкала — оставшееся время.|You cannot revisit a cell. The top bar shows remaining time.'],
  '2048': ['Соединяй одинаковые плитки, чтобы получить 2048.|Merge equal tiles to reach 2048.', 'Стрелки сдвигают поле 4×4. Каждая плитка сливается не более одного раза за ход.|Arrows slide the 4×4 board. Each tile merges at most once per move.', 'Справа в плитке — двоичный показатель степени (сверху вниз 1, 2, 4, 8; значение = 2 в этой степени); у 65536 и 131072 слева на клетку короче.|Right pips encode the exponent (top to bottom 1, 2, 4, 8; value = 2 to that power); for 65536 and 131072 the left bar is one cell shorter.'],
  digger: ['Выкопай все мигающие сокровища до нападения монстров.|Dig up all blinking treasures before the monsters catch you.', 'Стрелки копают. ROTATE стреляет по последнему направлению; всего четыре ракеты на партию.|Arrows dig. ROTATE fires in the last direction; four missiles per game.', 'Сокровище: +10, монстр: +25. Монстры появляются каждые десять секунд.|Treasure: +10, monster: +25. Monsters appear every ten seconds.'],
  'helicopter-bomber': ['Разрушь все здания до столкновения с ними.|Destroy all buildings before crashing into them.', 'ROTATE сбрасывает одну бомбу; → ускоряет полёт.|ROTATE drops one bomb; right speeds up flight.', 'Каждые два прохода вертолёт опускается на ряд. Бомба снимает один блок: +10.|Every two passes lower the helicopter one row. A bomb removes one block: +10.'],
};

/** Строка управления: кнопка, текст `ru|en` и необязательные пометки (сочетание, удержание, только клавиатура). */
const c = (button: GuideButton, text: string, extra: Pick<GuideControl, 'with' | 'hold' | 'keyboardOnly'> = {}): GuideControl => ({ button, text: tr(text), ...extra });
const AIM = c('sides', 'Двигают пушку или корабль.|Move the gun or ship.');
const SHOOT = c('rotate', 'Огонь; удержание — очередью.|Fire; hold to keep firing.', { hold: true });
const SPEED = c('up', 'Удержание ускоряет движение дороги.|Holding speeds up the road.', { hold: true });
const FALL = [
  c('sides', 'Двигают падающую тройку.|Move the falling triplet.'),
  c('rotate', 'Поменять порядок узоров в тройке.|Cycle the order of the patterns.'),
  c('up', 'То же, что ROTATE.|Same as ROTATE.'),
  c('down', 'Удержание ускоряет падение.|Holding speeds up the fall.', { hold: true }),
  c('fire', 'Бросить фигуру сразу.|Drop the piece at once.', { keyboardOnly: true }),
];
/** Что делают кнопки в каждой игре — по её коду (`games/library/*.ts`); проверяется пробами в `tests/brick/guides.test.ts`. */
const CONTROLS: Record<LibraryId, readonly GuideControl[]> = {
  maze: [c('arrows', 'Шаг на клетку; через стену пройти нельзя.|Step one cell; walls block the way.')],
  jigsaw: [
    c('arrows', 'Двигают фигуру по рамке 4×4.|Move the piece within the 4×4 frame.'),
    c('rotate', 'Повернуть фигуру.|Turn the piece.'),
    c('fire', 'Уложить фигуру; с DOWN — задача заново.|Place the piece; with DOWN, restart the puzzle.', { keyboardOnly: true }),
  ],
  'meteor-fighter': [AIM, c('rotate', 'Огонь; при взлёте не стреляет.|Fire; no shooting during takeoff.', { hold: true })],
  'tetris-shooting': [AIM, SHOOT],
  snake: [c('arrows', 'Задают курс; назад — разворот всего тела.|Steer; opposite input reverses the whole body.'), c('rotate', 'Направление вверх.|Direction up.')],
  pong: [c('sides', 'Двигают ракетку; край ракетки меняет угол.|Move the paddle; its edge changes the angle.'), c('rotate', 'Удержание при ударе центром меняет сторону отскока.|Holding on a centre hit flips the rebound.', { hold: true })],
  'pong-double': [c('sides', 'Двигают ракетку; край ракетки меняет угол.|Move the paddle; its edge changes the angle.'), c('rotate', 'Удержание при ударе центром меняет сторону отскока.|Holding on a centre hit flips the rebound.', { hold: true })],
  'pneumatic-ball': [c('sides', 'Выбирают точку подачи.|Choose the serving spot.'), c('rotate', 'Удержание — подача нового мяча.|Hold to serve a new ball.', { hold: true })],
  honeybee: [AIM, c('rotate', '01: один выстрел на нажатие; 02–08: можно удерживать.|01: one shot per press; 02–08: holding fires repeatedly.')] ,
  'obstacle-race': [c('sides', 'Рулят по извилистой дороге.|Steer along the winding road.'), SPEED],
  'matching-blocks': [c('sides', 'Выбирают позицию нижней фигуры.|Pick the lower shape position.'), c('vertical', 'Меняют фигуру выбранной позиции.|Change the shape at the chosen position.'), c('rotate', 'Делает то же, что ↑ ↓.|Does the same as ↑ ↓.')],
  'whack-a-mole': [c('arrows', 'Четыре площадки: ↑ вверх, → вправо, ↓ вниз, ← влево.|Four pads: up, right, down, left.'), c('rotate', 'Нижняя площадка (как ↓).|The bottom pad (same as ↓).')],
  simon: [c('arrows', 'Повтори площадки по порядку; у каждой свой тон.|Repeat the pads in order; each has its own tone.'), c('rotate', 'Нижняя площадка (как ↓).|The bottom pad (same as ↓).')],
  dice: [c('right', 'Оплатить ставку: 10 очков.|Buy a wager: 10 points.'), c('left', 'Посмотреть кости банкира.|View the banker’s dice.'), c('rotate', 'Бросить четыре кости.|Roll four dice.'), c('down', 'Остановить бросок.|Stop the roll.'), c('start', 'Выбрать больше / меньше перед броском банкира. Пауза — отдельной кнопкой интерфейса.|Choose higher / lower before the banker rolls. Pause is available separately in the UI.')],
  dance: [c('arrows', 'Нажми направление дорожки, когда нота в нижней зоне.|Press the lane direction as the note reaches the bottom.')],
  quarth: [c('sides', 'Двигают пушку.|Move the gun.'), c('rotate', 'Добавить клетку снизу; удержание — очередью.|Add a cell from below; hold to repeat.', { hold: true })],
  'lights-out': [c('arrows', 'Двигают курсор.|Move the cursor.'), c('rotate', 'Переключить крест из пяти клеток.|Toggle the five-cell cross.')],
  'boat-racing': [c('sides', 'Меняют полосу.|Change lane.'), SPEED],
  'talking-shooting': [AIM, SHOOT],
  'ufo-raiders': [AIM, SHOOT],
  'tetris-flicker': [c('sides', 'Двигают фигуру.|Move the piece.'), c('rotate', 'Повернуть фигуру.|Turn the piece.'), c('up', 'То же, что ROTATE.|Same as ROTATE.'), c('down', 'Удержание ускоряет падение.|Holding speeds up the fall.', { hold: true }), c('fire', 'Бросить фигуру сразу.|Drop the piece at once.', { keyboardOnly: true })],
  'super-tank': [c('sides', 'Рулят.|Steer.'), SHOOT, SPEED],
  'racing-pickup': [c('sides', 'Рулят.|Steer.'), c('rotate', 'Применить подобранное оружие.|Use the weapon you picked up.', { hold: true }), SPEED],
  'punch-racing': [c('sides', 'Рулят.|Steer.'), c('rotate', 'Удар по машине впереди.|Punch the car ahead.', { hold: true }), SPEED],
  sokoban: [
    c('arrows', 'Идут и толкают один ящик.|Walk and push one crate.'),
    c('rotate', 'Отменить последний ход.|Undo the last move.'),
    c('fire', 'Клавиатура: поле заново.|Keyboard: restart the field.', { keyboardOnly: true }),
  ],
  columns: [...FALL],
  'columns-flicker': [...FALL],
  'space-invaders': [AIM, SHOOT],
  'peg-solitaire': [
    c('arrows', 'Двигают курсор.|Move the cursor.'),
    c('rotate', 'Взять фишку, затем прыгнуть в пустую клетку.|Pick a peg, then jump into an empty hole.'),
    c('fire', 'Клавиатура: задача заново, очки возвращаются.|Keyboard: restart the puzzle, score returns.', { keyboardOnly: true }),
  ],
  basket: [c('sides', 'Двигают корзину.|Move the basket.')],
  'dr-mario': [
    c('sides', 'Двигают капсулу.|Move the capsule.'),
    c('rotate', 'Повернуть капсулу в следующее положение.|Turn the capsule to the next position.'),
    c('up', 'То же, что ROTATE.|Same as ROTATE.'),
    c('down', 'Удержание ускоряет падение.|Holding speeds up the fall.', { hold: true }),
    c('fire', 'Клавиатура: бросить капсулу.|Keyboard: drop the capsule.', { keyboardOnly: true }),
  ],
  bowling: [c('sides', 'Выбирают позицию броска.|Pick the throwing spot.'), c('vertical', 'Меняют уклон шара.|Change the ball’s curve.'), c('rotate', 'Бросить шар.|Roll the ball.')],
  'dual-shooting': [AIM, c('rotate', 'Огонь двумя стволами.|Fire both guns.', { hold: true })],
  'racing-four': [c('sides', 'Меняют полосу.|Change lane.'), SPEED],
  'arkanoid-dots': [c('sides', 'Двигают ракетку; край ракетки меняет угол.|Move the paddle; its edge changes the angle.')],
  'flappy-bird': [c('rotate', 'Взмах: птица подпрыгивает.|Flap: the bird hops up.'), c('up', 'Тоже взмах.|Also a flap.')],
  reversi: [c('arrows', 'Двигают курсор.|Move the cursor.'), c('rotate', 'Поставить фишку (с обязательным переворотом).|Place a disc (a flip is required).')],
  'fill-connect': [c('arrows', 'Продлевают линию.|Extend the line.'), c('rotate', 'Убрать последний шаг линии.|Remove the last step.')],
  '2048': [c('arrows', 'Сдвигают всё поле 4×4.|Slide the whole 4×4 board.')],
  digger: [c('arrows', 'Копают и идут.|Dig and walk.'), c('rotate', 'Ракета в направлении взгляда.|A missile in the facing direction.')],
  'helicopter-bomber': [c('rotate', 'Сбросить одну бомбу.|Drop one bomb.'), c('right', 'Удержание ускоряет полёт.|Holding speeds up the flight.', { hold: true })],
};
/**
 * Варианты игр, у которых вики retroconsoles (раздел Modes) их перечисляет: одна строка в допущениях справки. Тексты коротки (предел `GUIDE_LIMITS.assumption`) и честны:
 * перечень — по вики (другая прошивка, не Apollo), а правила признаков — допущение проекта; подробности — `modes[].note` и `docs/brick/modes-reference.md`.
 */
const VARIANTS: Partial<Record<LibraryId, GuideText>> = {
  dance: tr('Вариантов 2: 02 — вверх дном, ↑ и ↓ меняются. Перечень по вики retroconsoles; правила — допущение.|2 variants: 02 is upside down, up and down swap. List per the retroconsoles wiki; rules are an assumption.'),
  'obstacle-race': tr('Вариантов 2: 02 — вверх дном: машина вверху, газ — ↓. Перечень по вики retroconsoles; правила — допущение.|2 variants: 02 is upside down: car on top, gas is down. List per the retroconsoles wiki; rules are an assumption.'),
  quarth: tr('Вариантов 2: 02 — вверх дном. Перечень — со слов владельца (в тексте вики Quarth нет); правила — допущение.|2 variants: 02 is upside down. List from the owner (not in the wiki text for Quarth); rules are an assumption.'),
  snake: tr('Вариантов 2: 02 — «Рамка»: стенка по периметру, поле 8×18. Что такое Frame, вики не раскрывает — допущение.|2 variants: 02 is Frame: a wall around the edge, 8×18 field. The wiki does not explain Frame, so this is an assumption.'),
  'pneumatic-ball': tr('Вариантов 8: платформа 3, 2 или 1 клетка, вверх дном. Размер по умолчанию 3, поэтому 02 как 01. Перечень по вики; правила — допущение.|8 variants: paddle of 3, 2 or 1 cells, upside down. Default size is 3, so 02 equals 01. List per the wiki; rules are an assumption.'),
  pong: tr('Вариантов 16: платформа 3, 2 или 1 у обеих ракеток, вверх дном, кирпичи едут. 02 как 01. Перечень по вики; правила — допущение.|16 variants: paddle 3, 2 or 1 on both sides, upside down, moving bricks. 02 equals 01. List per the wiki; rules are an assumption.'),
  honeybee: tr('Вариантов 8: 01 — B0202 D01; 02–08 — фигура, переворот, два ствола по вики. Их правила — допущение.|8 variants: 01 is B0202 D01; 02–08 use the wiki figure, inversion and twin guns. Their rules are an assumption.'),
};
/** Readable close-ups complement the actual initial board and engine recording. */
const EXTRA_SCHEMES: Partial<Record<LibraryId, GameGuideData['schemes']>> = {
  'obstacle-race': [{cells:['#.....#','#.#...#','#.....#','#...*.#','#...#.#','#..#.##'],caption:gt('Камень слева — проезд справа; машина занимает три клетки','Stone on the left; pass on the right with a three-cell car')}],
  'meteor-fighter': [{cells:['..#..','.###.','##*##','.....','..#..','.....'],caption:gt('Мигающее ядро принимает урон; тёмный корпус защищён','Blinking core takes damage; the solid body is armoured')}],
  'dual-shooting': [{cells:['######','######','##*###','......','..##..','......'],caption:gt('Два ствола; цельтесь в мигающее ядро','Twin guns; aim at the blinking core')}],
};
const NO_LIVES = new Set<LibraryId>(['maze','jigsaw','lights-out','sokoban','peg-solitaire','reversi','2048','fill-connect','flappy-bird','dice','bowling','tetris-flicker','columns','columns-flicker','dr-mario']);
export const LIBRARY_GUIDES: Readonly<Record<string, GameGuideData>> = Object.fromEntries(LIBRARY_IDS.map((id) => {
  const rules = RULES[id].map(tr);
  return [id, {
    summary: rules[0]!,
    goal: rules[0]!, rules,
    controls: [...CONTROLS[id], ...(id === 'dice' ? [] : [{ button: 'start' as const, text: gt('Старт / пауза / продолжение.', 'Start / pause / resume.') }])],
    scoring: id==='maze'?[{what:gt('Выход: за номер раунда','Exit: per round number'),points:'+100 × N'},{what:gt('Оставшиеся секунды (округлены вверх)','Remaining seconds (rounded up)'),points:'+5 × s'}]:[], facts: [{ value: '10×20', label: gt('матрица', 'display') }, { value: NO_LIVES.has(id) ? '—' : '4', label: gt('жизни', 'lives') }, ...(id==='maze'?[{value:'15 → 6',label:gt('секунд на раунд','seconds per round')}]:[]), ...(VARIANTS[id] ? [{ value: String(LIBRARY_GAMES[id].modes.length), label: gt('вариантов', 'variants') }] : [])],
    progression: id === 'dice' ? gt('Партия заканчивается после проигрыша всего банка. Финальный результат — максимальный банк за эту партию.', 'The party ends when the bank is lost. The final result is the peak bank of this party.') : id === 'snake' ? gt('После 13 плодов — следующий уровень и бонус +100.', 'After 13 foods: the next level and a +100 bonus.') : contentProgression(id),
    lives: NO_LIVES.has(id) ? null : id==='pneumatic-ball'?gt('На индикаторе 4 жизни. Тренировка подачи: промах безопасен, лимита времени нет.','Four lives on the indicator. Serving practice: misses are harmless, with no time limit.'):gt('Четыре жизни, после потери — повтор поля.','Four lives; losing one restarts the board.'),
    schemes: [{ cells: LIBRARY_FIELDS[id], caption: id==='maze'?gt('Точка — игрок; выход вверху; справа отсчёт секунд','Player dot; exit at the top; countdown on the right'):gt('Поле в начале партии', 'Initial playing field') },...(EXTRA_SCHEMES[id]??[])],
    assumptions: [...(id === 'snake' || id === 'dice' || id === 'honeybee' ? [gt('Источник: выполненные ROM BrickEmuPy. ГСЧ и часть визуальных пауз адаптированы; пошаговый отчёт — в источниках энциклопедии.', 'Source: executed BrickEmuPy ROMs. The RNG and some visual holds are adapted; see the encyclopedia sources for the step-by-step report.'), ...(id === 'snake' ? [gt('Переход после 13 плодов с бонусом +100, карты и полный цикл победы дампом не подтверждены.', 'The advancement after 13 foods with the +100 bonus, the maps and the full victory cycle are not ROM-verified.')] : [])] : [gt('Источник: Retro Consoles Wiki, раздел Games, архив 12.01.2026. Это не дамп прошивки Apollo.', 'Source: Retro Consoles Wiki, Games, archive 2026-01-12. This is not an Apollo firmware dump.'), gt('Карты, темп, очки и графика — реконструкция; точные варианты оригинального устройства не подтверждены.', 'Boards, pace, scoring and artwork are reconstructions; exact original device variants are unconfirmed.')]), ...(VARIANTS[id] ? [VARIANTS[id]] : [])],
  } satisfies GameGuideData];
}));
