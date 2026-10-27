# Сторонние материалы

## n0Live/BrickGame (правила игр «168 в 1 танк»)

Правила, таблицы и последовательности игр в `src/brick/games/*` восстановлены по открытому симулятору
[n0Live/BrickGame](https://github.com/n0Live/BrickGame) (Java). Код на TypeScript написан заново; игровой код донора не копируется. Прежние M4A из `src/sounds` версии `6f58b1069cdddc1b7d1a3192783b9de9161cd0dc` заменены тоновой транскрипцией в `src/audio/brickPhrases.ts`. Авторство и MIT-лицензия сохранены ниже. [Синтез и ограничения](brick/audio.md).
Описание того, какие правила взяты и что в них допущение, — в [brick-games.md](brick-games.md) и в справке каждой игры.

```
MIT License

Copyright (c) 2017 Egor Krasnopolin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## BrickEmuPy — проверка поведения прошивок

[azya52/BrickEmuPy](https://github.com/azya52/BrickEmuPy), ревизия `376cca92c6d000ffd6046e5491f2a1c3d1a5eab0`, используется как внешний исследовательский инструмент (репозиторий опубликован под CC0-1.0). В проект добавлены результаты измерений и адресные карты LCD, описанные в [ревью](brick/rom-review.md) и [сверке аркад](brick/rom-arcade.md), а также декодированные частоты/длительности E88 для синтеза звука. ROM и исходники эмулятора в приложение не включены; лицензия репозитория не трактуется как отдельное разрешение на распространение ROM третьих лиц.

## Brick Game Online и универсальный корпус

Иллюстрированный логотип и иконка предоставлены владельцем проекта в `brick-game-online-brand-kit.zip`; используются готовые векторные версии без встроенных растров и внешних шрифтов.

Новый моноблок в серой и чёрной версиях нарисован для проекта по общим пропорциям классических Brick Games из [Nicole Express](https://nicole.express/2026/bricked-up-and-no-amontillado.html) и [GIGdb](https://gigdb.ru/articles/?id=11). Цветовые версии и жёлтые кнопки сверены с [фотографией двух Brick Games на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%A2%D0%B5%D1%82%D1%80%D0%B8%D1%81.jpg). Фотографии не включены в приложение. Раскладка с отдельной FIRE, меню и короткая мелодия — собственный универсальный дизайн, не воспроизведение конкретной оригинальной прошивки.

## Векторные корпуса и LCD E‑88 / B0202

`public/devices/e88-{body,lcd}.svg` и `apollo-b0202-{body,lcd}.svg` производны от авторских векторных `assets/E88_8in1.svg` и `assets/Apollo126in1B0202.svg` azya52/BrickEmuPy, ревизия `376cca92c6d000ffd6046e5491f2a1c3d1a5eab0`, [лицензия CC0-1.0](https://github.com/azya52/BrickEmuPy/blob/376cca92c6d000ffd6046e5491f2a1c3d1a5eab0/LICENSE). В исходных SVG нет встроенных фотографий. Статичный корпус отделён от сегментов LCD; E‑88 дополнительно адаптирован по фото владельца (цвета и надписи). Исходная печать B0202 сохранена. Логотипы `public/brand/{e88,apollo-b0202}-wordmark.svg` выделены из этих же векторов корпуса, фон прозрачный; у E‑88 цвет надписи адаптируется к теме интерфейса.

[Статьи, оригинальные URL фотографий и описание преобразований](devices/e88-b0202.md#источники-внешности). Фотографии использованы для визуальной сверки и не распространяются в приложении; CC0 исходного вектора не объявляется лицензией фотографий, логотипов третьих лиц, ROM или речевых записей. Оригинальная речь B0202 не включена. Данные меню, формы фигур и частоты звука — результаты наблюдения, а не загрузка ROM в браузер.

Подготавливаемые `public/devices/e23-{body,lcd}.svg` и `apollo-b0302-{body,lcd}.svg` извлечены из `assets/E23PlusMarkII96in1.svg` и `assets/Apollo18in1B0302.svg` той же ревизии BrickEmuPy; исходные векторы предоставлены под CC0-1.0. Разделение слоёв воспроизводится `scripts/research/extract_native_svg.py` с закреплённой ревизией. Дамп прошивки и фотографии в эти файлы не входят.

Прозрачные версии универсального корпуса (`clear` / `smoke`) вдохновлены предоставленным владельцем фото прозрачных Brick Games. Плата, дорожки и компоненты придуманы для проекта; это не копия электроники E‑88 или B0202. На универсальном корпусе используется предоставленный логотип Brick Game Online; красный знак с ладонями сохранён только на E‑88.

## FM-38 owner graphics

`public/devices/fm38/body.png` and `logo.png` are supplied by the project owner in `docs/research/fm-38.zip`, with explicit permission to use them for this model. They are not assets from BrickEmuPy.
