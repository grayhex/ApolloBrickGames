# Apollo «168 в 1 ТАНК»: источники для реконструкции

Дата проверки: 16 октября 2026 года.
Целевой проект: https://github.com/grayhex/CrocodileMario/

## Вывод

Точный дамп ROM, дизассемблированный код и полная таблица режимов именно складной Apollo «168 в 1 ТАНК» в проверенных источниках не найдены. Найдены: открытый высокоуровневый симулятор с близкими играми, настоящий эмулятор других Apollo с ROM и SVG, подробные наблюдения владельца другой модели Brick Game и экспериментальный декомпилятор Holtek ROM.

Нельзя приравнивать совпадение названий игр к совпадению прошивки. Нельзя объявлять правила симулятора подтвержденными правилами Apollo.

## Наблюдения пользователя — исходные требования, не независимая проверка

| Пункт меню | Наблюдаемая игра | Количество вариантов со слов пользователя |
|---|---|---|
| 1 | Танки | 5 |
| 2 | Frogger / лягушка | Не установлено |
| 3 | Гонки | Не установлено |
| 4 | Гонки со стрельбой | Не установлено |
| 5 | Стрельба по массиву и отдельным точкам-врагам | Не установлено |
| 6 | Стрельба по фигурам / достройка фигур | Не установлено |
| 7 | Стройка / строитель | Не установлено |
| 8 | Тетрис | 51 |
| 9 | Усложненный тетрис / Pentix | Не установлено |

Ссылка на видео в этом запросе не предоставлена. Видео не просматривалось. Количество 168 не использовалось для искусственного вычисления недостающих вариантов.

## 1. Основной донор правил: n0Live/BrickGame

Репозиторий: https://github.com/n0Live/BrickGame
README: https://github.com/n0Live/BrickGame/blob/master/README.md
Лицензия MIT: https://github.com/n0Live/BrickGame/blob/master/LICENSE

Это Java-симулятор Brick Game, не эмуляция оригинальной прошивки. В комментариях к конструкторам перечислены варианты, в коде — алгоритмы. Подходит для извлечения правил и данных с последующей адаптацией к детерминированному TypeScript-ядру.

Базовый каталог игр:
https://github.com/n0Live/BrickGame/tree/master/src/com/kry/brickgame/games

| Игра Apollo | Файл / кандидат | Что действительно проверено | Что не подтверждено |
|---|---|---|---|
| Танки | TanksGame.java | 8 вариантов: 3–6 врагов, предзаданные или случайные поля; AI, спавн, снаряды, столкновения | Совпадение с пятью вариантами Apollo, босс, точные тайминги |
| Frogger | FroggerGame.java | 32 варианта; направление полос, перенос лягушки, встречное движение, подготовленные/случайные полосы, переворот поля | Порядок и набор вариантов Apollo |
| Гонки | RacingGame.java | 4 варианта: две/три позиции автомобиля и перевернутые версии | Режим стрельбы в этом классе не подтвержден |
| Гонки со стрельбой | RacingGame.java + общие примитивы снарядов | База движения и генерации противников есть | Готовый соответствующий режим не найден |
| Стрельба по массиву/точкам | InvadersGame.java; отдельно GunGame.java в destruction mode | Invaders: стена, ее движение и отделяющаяся от нее подвижная точка; GunGame: уничтожение клеток | Точное число и поведение отделяющихся врагов Apollo |
| Достройка отдельных фигур | Частичный донор: GameWithGun.java; описание MT1997 | Есть механика добавляющего клетки выстрела | Прямоугольное завершение отдельной фигуры не следует путать с удалением целой строки |
| Строитель | GunGame.java в creation mode + GameWithGun.java | Добавляющие выстрелы, проверка заполненного ряда, удаление ряда | Что под «стройкой» на Apollo подразумевается именно этот режим |
| Тетрис | TetrisGameI.java, семейство TetrisGameJ–P | Базовый класс объявляет 90 вариантов; специальные свойства фигур | Соответствие таблице 51 варианта Apollo |
| Pentix | PentixGameQ.java, семейство PentixGameR–X; TetrisShape.java | PentixGameQ наследует TetrisGameI и меняет выбор фигур; каталог координат содержит трех-, четырех-, пятиклеточные и специальные фигуры | Реальный набор и частоты фигур в Apollo |

### Прямые ссылки на наиболее полезные файлы

- TanksGame: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/TanksGame.java
- FroggerGame: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/FroggerGame.java
- RacingGame: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/RacingGame.java
- InvadersGame: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/InvadersGame.java
- GunGame: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/GunGame.java
- GameWithGun: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/GameWithGun.java
- TetrisGameI: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/TetrisGameI.java
- PentixGameQ: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/PentixGameQ.java
- TetrisShape: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/shapes/TetrisShape.java
- TankShape: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/shapes/TankShape.java
- Все формы: https://github.com/n0Live/BrickGame/tree/master/src/com/kry/brickgame/shapes
- ObstacleUtils: https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/ObstacleUtils.java
- Заставки: https://github.com/n0Live/BrickGame/tree/master/src/com/kry/brickgame/splashes

### Особенности, которые нельзя потерять при переносе

В GunGame 16 вариантов комбинируют создание/уничтожение клетки, одну/две пушки, горизонтальный сдвиг и инверсию поля. В GameWithGun методы flightOfBullets() и flightOfMud() используют общую flight(...). Создающий выстрел останавливается перед занятой клеткой либо у верхнего края; затем проверяется полный ряд. Это не готовое правило исчезновения отдельного завершенного прямоугольника.

В TetrisGameI перечислены обычные, рассыпающиеся, кислотные, проходящие сквозь препятствия и смешанные варианты, а также специальные фигуры SuperPoint, SuperGun, SuperMudGun, SuperBomb. Наличие этих механик у донора не означает наличие каждой из них в Apollo.

TankShape задает разные клеточные маски своего и вражеского танков и отдельную полную маску для проверки. Не заменять маску столкновений рисунком без проверки.

Копирование Java-потоков, ScheduledFuture, sleep(), системного времени и java.util.Random в браузерную архитектуру не предлагается. Переносить логику и данные, а ожидания и случайность выражать через существующие такты и seed. При переносе кода сохранить MIT copyright и текст лицензии.

## 2. Настоящие ROM и эмуляция: azya52/BrickEmuPy

https://github.com/azya52/BrickEmuPy
https://github.com/azya52/BrickEmuPy/blob/main/README.md
https://github.com/azya52/BrickEmuPy/tree/main/assets

Подтвержденные релевантные модели в README:

- E-23 PLUS MARK II 96 in 1 — HT-943D0.
- E-88 8 in 1 — HT-943E5.
- Apollo 126 in 1 B0202 — SPL02.
- Apollo 18 in 1 B0302 — SPL03.

Apollo «168 в 1 ТАНК» в проверенном списке поддерживаемых устройств не обнаружен.

В assets есть наборы с одинаковым базовым именем и расширениями .bin / .brick / .svg:

- Apollo126in1B0202
- Apollo18in1B0302

Конфигурация B0202:
https://github.com/azya52/BrickEmuPy/blob/main/assets/Apollo126in1B0202.brick

SVG B0202:
https://github.com/azya52/BrickEmuPy/blob/main/assets/Apollo126in1B0202.svg

SVG B0302:
https://github.com/azya52/BrickEmuPy/blob/main/assets/Apollo18in1B0302.svg

.bin — машинный код; .brick — конфигурация устройства, ядро, кнопки и параметры; .svg — оформление модели. Это не набор высокоуровневых функций правил игр.

Практическое применение: запустить ближайшие реальные модели, сравнить меню и особенности игр с видео Apollo, получить наблюдения и тестовые сценарии. Не выдавать результат для другого ROM за точную эмуляцию целевой модели. Эмулятор в ходе этого исследования не запускался.

## 3. Первичный источник о реверс-инжиниринге Apollo

Azya, «Эмуляция “тетриса” Apollo из 90-х и запуск кода на оригинальном железе», 6 ноября 2025:
https://habr.com/ru/articles/955488/

Автор установил Sunplus/6502-подобное ядро у B0202 при расположении LCD-сегментов, совпадающем с некоторыми Brick Game на Holtek. У B0302 родственному отладочному механизму удалось передать код и считать ROM без декапсуляции. Это не инструкция, проверенная на складной «168 в 1».

Вывод для проекта: одинаковый экран или корпус не доказывает одинаковый контроллер либо двоично идентичную прошивку. Общность набора игр пока следует трактовать как общность игровых механик.

## 4. Подробные наблюдения владельца других Brick Game

MT1997:
https://hipilion.livejournal.com/29802.html

Для MT1997 автор описывает «Чапая»: два режима разрушения фигур и два режима их достройки до прямоугольников, со сдвигом и без. Отдельно описывает «Гэлэкси / кучу», от которой отделяются две точки-врага, и гонки с возможностью стрельбы. Это особенно полезные параллели к пунктам 4–6 пользователя, но не спецификация Apollo.

Super Brick Game TS-9999 и сравнение со старой моделью:
https://hipilion.livejournal.com/24635.html

В сравнении отдельно описана достройка спускающихся фигур до прямоугольников с их исчезновением; отмечено отсутствие этой вариации и стреляющих гонок в более новом экземпляре. Полезно как предупреждение: современный «9999 in 1» не гарантирует полноту старого набора игр.

## 5. Экспериментальная декомпиляция Holtek

https://github.com/ilyakurdyukov/brickgame-4bit
https://github.com/ilyakurdyukov/brickgame-4bit/blob/main/ht4bit_decomp.c

README описывает терминальный эмулятор для Linux и экспериментальную декомпиляцию E23PlusMarkII96in1.bin в C. Автор прямо помечает этот режим как не рекомендуемый, предназначенный для исследования ROM. Это не готовый декомпилят для Apollo/Sunplus и не замена установлению контроллера целевого устройства.

