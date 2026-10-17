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

[azya52/BrickEmuPy](https://github.com/azya52/BrickEmuPy), ревизия `376cca92c6d000ffd6046e5491f2a1c3d1a5eab0`, используется как внешний исследовательский инструмент (репозиторий опубликован под CC0-1.0). В проект добавлены результаты измерений и адресные карты LCD, описанные в [ревью](brick/rom-review.md). ROM и исходники эмулятора в приложение не включены; лицензия репозитория не трактуется как отдельное разрешение на распространение ROM третьих лиц.
